import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

/**
 * Google Gemini integration: embeddings + answer generation.
 *
 * (This file was previously misnamed "openai.js" — the project uses Gemini, not
 * OpenAI. All calls go through callWithResilience() which adds a timeout and
 * exponential-backoff retry, and converts upstream 429 quota errors into a clean
 * user-facing message instead of a cryptic failure.)
 */

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const chatModel = genAI.getGenerativeModel({ model: config.geminiChatModel });
const embeddingModel = genAI.getGenerativeModel({ model: config.geminiEmbeddingModel });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isQuotaError(error) {
  const status = error?.status ?? error?.response?.status;
  return status === 429 || /\b429\b|quota|rate limit|too many requests/i.test(error?.message || '');
}

function isRetryable(error) {
  if (isQuotaError(error)) return true;
  const status = error?.status ?? error?.response?.status;
  if (status && status >= 500) return true;
  return /timeout|etimedout|econnreset|enotfound|fetch failed|network|socket hang up/i.test(
    error?.message || ''
  );
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new AppError(`${label} timed out after ${ms}ms`, 504, { code: 'UPSTREAM_TIMEOUT' })),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run an async Gemini call with a timeout and exponential-backoff retry.
 * Only retries transient failures (timeouts, 5xx, 429). Surfaces a friendly
 * AppError when the free-tier quota is exhausted so the UI can say "try again".
 */
async function callWithResilience(label, fn) {
  const { maxRetries, baseDelayMs, timeoutMs } = config.retry;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(Promise.resolve().then(fn), timeoutMs, label);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxRetries) break;
      const delay = baseDelayMs * 2 ** attempt;
      logger.warn(`${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`, {
        error: error.message,
      });
      await sleep(delay);
    }
  }

  if (isQuotaError(lastError)) {
    logger.error(`${label}: Gemini quota exhausted`, { error: lastError.message });
    throw new AppError('The AI service is busy right now. Please try again in a moment.', 429, {
      code: 'QUOTA_EXCEEDED',
      cause: lastError,
    });
  }
  logger.error(`${label} failed after retries`, { error: lastError?.message });
  throw lastError;
}

/**
 * Generate an embedding vector for a piece of text.
 * Pinned to config.embeddingDimensions (768) to match the Atlas Vector Search index.
 */
export async function generateEmbedding(text) {
  return callWithResilience('Embedding', async () => {
    const result = await embeddingModel.embedContent({
      content: { parts: [{ text }] },
      outputDimensionality: config.embeddingDimensions,
    });
    return result.embedding.values;
  });
}

/**
 * Render recent conversation turns into a short block the model can use to
 * resolve references in follow-up questions (e.g. "who is he?"). Returns an
 * empty string when there is no history, so first turns add zero tokens.
 */
function formatHistory(history) {
  if (!history || history.length === 0) return '';
  const lines = history
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.text}`)
    .join('\n');
  return `Conversation so far (use it to resolve references like "he"/"it"/"that"):\n${lines}\n\n`;
}

function renderContext(passages) {
  return passages
    .map((p, i) => `[Source ${i + 1}: ${p.source || 'Knowledge Base'}]\n${p.textEnglish || p.text}`)
    .join('\n\n');
}

// STRICT mode: answer only from the knowledge base; refuse when it isn't covered.
function buildStrictPrompt(question, passages, history) {
  const contextText = renderContext(passages);
  return `You are IndQA, a helpful multilingual assistant for Indian users. The context passages below are your ONLY source of truth.

RULES:
- Answer strictly from the context passages. Treat them as ground truth.
- You MAY reason over the context to give analysis or recommendations (e.g. skills -> suitable roles, scheme rules -> who qualifies), but every fact must come from the context.
- Do NOT use outside knowledge and do NOT invent facts (no made-up skills, dates, numbers, or details).
- Use the conversation so far only to understand what the question refers to.
- If the context is unrelated to the question or lacks what is needed, reply exactly: "I don't have enough information to answer this question accurately."
- Be concise and helpful. Cite the source(s) you used, e.g., [Source 1].

${formatHistory(history)}Context Passages:
${contextText || '(none)'}

Question: ${question}

Answer using ONLY the context above.`;
}

// HYBRID mode: general assistant; use the KB as reference when relevant, otherwise general knowledge.
function buildHybridPrompt(question, passages, history) {
  const contextBlock = passages.length
    ? `Reference material (use it only if relevant to the question):\n${renderContext(passages)}\n\n`
    : '';
  return `You are IndQA, a helpful, knowledgeable multilingual assistant for Indian users. Answer any question to the best of your ability.

HOW TO USE THE REFERENCE MATERIAL:
- If reference material is provided below and is relevant, base your answer on it and cite the sources you use, e.g., [Source 1].
- If it is not relevant (or none is provided), answer from your own general knowledge and do NOT cite any source.
- Never refuse to answer just because the reference material doesn't cover the topic.
- Do not attribute invented facts to the reference material; if you're unsure, say so.
- Use the conversation so far to resolve references like "he"/"it"/"that".
- Be concise and helpful: a short paragraph, or a few bullet points when listing options.

${formatHistory(history)}${contextBlock}Question: ${question}

Answer helpfully.`;
}

function buildPrompt(mode, question, passages, history) {
  return mode === 'strict'
    ? buildStrictPrompt(question, passages, history)
    : buildHybridPrompt(question, passages, history);
}

/**
 * Streaming generation. Invokes onChunk(textDelta) as tokens arrive and resolves
 * with the full concatenated answer. Retry is applied only while establishing the
 * stream (a partially-consumed stream cannot be safely replayed).
 */
async function generateStream(label, prompt, onChunk) {
  const { stream } = await callWithResilience(label, () => chatModel.generateContentStream(prompt));
  let full = '';
  for await (const chunk of stream) {
    const text = chunk.text();
    if (text) {
      full += text;
      if (onChunk) onChunk(text);
    }
  }
  return full.trim();
}

/**
 * Generate an answer (streamed) in the given mode.
 *   'hybrid' (default) — general assistant that uses the KB as reference when relevant
 *   'strict'           — knowledge-base only; refuses when the KB doesn't cover it
 */
export function generateAnswerStream(question, passages, onChunk, history = [], mode = 'hybrid') {
  return generateStream(`Answer (${mode})`, buildPrompt(mode, question, passages, history), onChunk);
}

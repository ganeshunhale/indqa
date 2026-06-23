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

function buildRagPrompt(question, passages, history) {
  const contextText = passages
    .map((p, i) => `[Source ${i + 1}: ${p.source || 'Knowledge Base'}]\n${p.textEnglish || p.text}`)
    .join('\n\n');

  return `You are IndQA, a multilingual question-answering assistant for Indian users.

RULES:
- ONLY answer based on the provided context passages below.
- Use the conversation so far ONLY to understand what the question refers to; base all facts on the context passages.
- If the context does not contain enough information, say "I don't have enough information to answer this question accurately."
- Do NOT make up information or use knowledge outside the provided context.
- Keep answers concise, factual, and helpful (2-4 sentences).
- At the end, cite which source(s) you used, e.g., [Source 1].

${formatHistory(history)}Context Passages:
${contextText}

Question: ${question}

Provide a concise, factual answer based ONLY on the context above.`;
}

function buildDirectPrompt(question, history) {
  return `You are IndQA, a helpful multilingual QA assistant for Indian users. Answer the following question concisely and factually in 2-4 sentences. If you are unsure, say so.

${formatHistory(history)}Question: ${question}`;
}

/** RAG answer grounded in retrieved passages (non-streaming). */
export async function generateRAGAnswer(question, passages, history = []) {
  return callWithResilience('RAG generation', async () => {
    const result = await chatModel.generateContent(buildRagPrompt(question, passages, history));
    return result.response.text().trim();
  });
}

/** Direct answer when no relevant passages are found (non-streaming). */
export async function generateDirectAnswer(question, history = []) {
  return callWithResilience('Direct generation', async () => {
    const result = await chatModel.generateContent(buildDirectPrompt(question, history));
    return result.response.text().trim();
  });
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

export function generateRAGAnswerStream(question, passages, onChunk, history = []) {
  return generateStream('RAG generation (stream)', buildRagPrompt(question, passages, history), onChunk);
}

export function generateDirectAnswerStream(question, onChunk, history = []) {
  return generateStream('Direct generation (stream)', buildDirectPrompt(question, history), onChunk);
}

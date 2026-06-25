import mongoose from 'mongoose';
import { translateText, detectLanguage } from './translation.js';
import { generateEmbedding, generateAnswerStream } from './gemini.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import KnowledgeChunk from '../models/KnowledgeChunk.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Workspace from '../models/Workspace.js';

/**
 * Full QA (Retrieval-Augmented Generation) pipeline:
 *  1. Detect / confirm the user's language
 *  2. Translate the question to English (Google Translate)
 *  3. Embed the English question (Gemini gemini-embedding-001)
 *  4. Retrieve the top-K passages from MongoDB Atlas Vector Search
 *  5. Generate an answer with Gemini, grounded in the passages when relevant
 *  6. Translate the answer back to the user's language
 *  7. Persist the conversation turn
 *
 * `onToken(textDelta)` streams the answer as it is generated. Real token
 * streaming is only possible for English questions; non-English answers are
 * generated in English, then translated as a whole (the translation API has no
 * streaming), so for those the client shows status until `answer-complete`.
 */
export async function handleQuestion({ question, language, conversationId, workspaceId, requestedMode, onToken }) {
  const startTime = Date.now();

  // The workspace this turn belongs to. Used to isolate retrieval + persistence
  // so tenants never see each other's knowledge or messages.
  const wsId = workspaceId instanceof mongoose.Types.ObjectId
    ? workspaceId
    : new mongoose.Types.ObjectId(workspaceId);

  const detectedLanguage = language || detectLanguage(question);
  const isEnglish = detectedLanguage === 'en';

  const englishQuestion = isEnglish ? question : await translateText(question, detectedLanguage, 'en');

  // Load recent prior turns for this conversation so follow-ups ("who is he?")
  // can resolve references. The current user turn is persisted only AFTER
  // generation (below), so the DB holds prior turns only — no duplication, and
  // the first question in a conversation yields empty history (zero overhead).
  let history = [];
  if (config.rag.historyMessages > 0) {
    const priorMessages = await Message.find({ conversationId, workspaceId: wsId })
      .sort({ createdAt: -1 })
      .limit(config.rag.historyMessages)
      .select('role englishText originalText')
      .lean();
    priorMessages.reverse(); // back to chronological order

    history = priorMessages.map((m) => ({
      role: m.role, // 'user' | 'assistant'
      // Prefer English text so the (English-internal) pipeline gets English history.
      text: (m.englishText || m.originalText || '').slice(0, config.rag.historyCharLimit),
    }));
  }

  // Context-aware retrieval: prepend the most recent user turn to the embedding
  // query so a pronoun-only follow-up still embeds near the earlier topic. Kept
  // small (last user turn only) to avoid dragging retrieval off-topic.
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  const embedQuery = lastUser ? `${lastUser.text}\n${englishQuestion}` : englishQuestion;
  const questionEmbedding = await generateEmbedding(embedQuery);

  // Retrieve relevant passages for THIS workspace via Atlas Vector Search.
  let passages = [];
  try {
    passages = await retrieveChunks(wsId, questionEmbedding);
  } catch (error) {
    // Both the pre-filter and post-filter paths failed — almost always a missing
    // or misconfigured Atlas index. Degrade to a direct answer but log loudly.
    logger.error(
      `Vector search failed — falling back to a direct (ungrounded) answer. ` +
        `Verify the Atlas index "${config.rag.vectorIndexName}" exists with ${config.embeddingDimensions} dims.`,
      { error: error.message }
    );
  }

  // Resolve the answering mode: explicit per-request override → workspace default → hybrid.
  let answerMode = requestedMode === 'strict' || requestedMode === 'hybrid' ? requestedMode : null;
  if (!answerMode) {
    const ws = await Workspace.findById(wsId).select('answerMode').lean();
    answerMode = ws?.answerMode || 'hybrid';
  }

  // Passages clear the noise floor → eligible to be used as context.
  const topScore = passages[0]?.score ?? 0;
  const hasContext = passages.length > 0 && topScore >= config.rag.minRetrievalScore;
  const contextPassages = hasContext ? passages : [];

  const mapSources = () =>
    contextPassages.map((p) => ({
      source: p.source || p.metadata?.title || 'Knowledge Base',
      score: p.score,
      snippet: (p.textEnglish || p.text || '').slice(0, 200),
    }));

  // Stream English tokens to the client directly; for other languages we cannot
  // stream the translated text, so suppress token streaming and send the final answer.
  const streamSink = isEnglish ? onToken : undefined;

  const englishAnswer = await generateAnswerStream(
    englishQuestion,
    contextPassages,
    streamSink,
    history,
    answerMode
  );

  // Decide what to surface as sources/confidence.
  let sources = [];
  let grounded = false;
  let confidence = null;
  if (answerMode === 'strict') {
    grounded = hasContext;
    sources = hasContext ? mapSources() : [];
    confidence = hasContext ? topScore : 0.5;
  } else {
    // Hybrid: only credit the KB when the answer actually cited it.
    const usedContext = hasContext && /\[\s*source\s*\d+/i.test(englishAnswer);
    grounded = usedContext;
    sources = usedContext ? mapSources() : [];
    confidence = usedContext ? topScore : null;
  }

  const localAnswer = isEnglish ? englishAnswer : await translateText(englishAnswer, 'en', detectedLanguage);

  // Persist both turns (stamped with the workspace for tenant isolation).
  await Message.create({
    workspaceId: wsId,
    conversationId,
    role: 'user',
    language: detectedLanguage,
    originalText: question,
    englishText: isEnglish ? question : englishQuestion,
  });
  await Message.create({
    workspaceId: wsId,
    conversationId,
    role: 'assistant',
    language: detectedLanguage,
    originalText: localAnswer,
    englishText: englishAnswer,
    retrievedChunks: sources,
    confidence,
    latencyMs: Date.now() - startTime,
  });

  await updateConversationMeta(conversationId, detectedLanguage, question);

  return {
    answer: localAnswer,
    englishAnswer,
    sources,
    detectedLanguage,
    confidence,
    grounded,
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Retrieve the top-K knowledge chunks for a workspace via Atlas Vector Search.
 *
 * Primary path uses a `$vectorSearch` pre-filter on workspaceId — efficient, but it
 * requires workspaceId to be declared as a `filter` field on the index. When that
 * isn't configured the query errors, so we fall back to over-fetching unfiltered and
 * isolating the tenant with a `$match` stage. The fallback works on the existing
 * index (no Atlas change) at some cost to recall; updating the index removes the warning.
 */
async function retrieveChunks(wsId, queryVector) {
  const base = { index: config.rag.vectorIndexName, path: 'embedding', queryVector };
  try {
    return await KnowledgeChunk.aggregate([
      {
        $vectorSearch: {
          ...base,
          filter: { workspaceId: { $eq: wsId } },
          numCandidates: config.rag.numCandidates,
          limit: config.rag.topK,
        },
      },
      {
        $project: {
          text: 1,
          textEnglish: 1,
          source: 1,
          category: 1,
          score: { $meta: 'vectorSearchScore' },
          metadata: 1,
        },
      },
    ]);
  } catch (error) {
    logger.warn(
      `Vector pre-filter failed — is "workspaceId" a filter field on the Atlas index ` +
        `"${config.rag.vectorIndexName}"? Using post-filter fallback; update the index for best recall at scale.`,
      { error: error.message }
    );
    const overscan = Math.max(config.rag.topK * 10, 50);
    return KnowledgeChunk.aggregate([
      {
        $vectorSearch: {
          ...base,
          numCandidates: Math.max(config.rag.numCandidates, overscan * 2),
          limit: overscan,
        },
      },
      { $addFields: { score: { $meta: 'vectorSearchScore' } } },
      { $match: { workspaceId: wsId } },
      { $limit: config.rag.topK },
      { $project: { text: 1, textEnglish: 1, source: 1, category: 1, score: 1, metadata: 1 } },
    ]);
  }
}

/** Bump message count, remember the language, and set a title for new conversations. */
async function updateConversationMeta(conversationId, language, question) {
  const conv = await Conversation.findById(conversationId);
  const update = { $inc: { messageCount: 2 }, language, updatedAt: new Date() };

  // Only auto-title an untitled conversation (avoids overwriting on every turn).
  if (conv && (!conv.title || conv.title === 'New Conversation')) {
    update.title = question.length > 50 ? `${question.slice(0, 47)}...` : question;
  }

  await Conversation.findByIdAndUpdate(conversationId, update);
}

import { translateText, detectLanguage } from './translation.js';
import {
  generateEmbedding,
  generateRAGAnswerStream,
  generateDirectAnswerStream,
} from './gemini.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import KnowledgeChunk from '../models/KnowledgeChunk.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';

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
export async function handleQuestion({ question, language, conversationId, onToken }) {
  const startTime = Date.now();

  const detectedLanguage = language || detectLanguage(question);
  const isEnglish = detectedLanguage === 'en';

  const englishQuestion = isEnglish ? question : await translateText(question, detectedLanguage, 'en');

  // Load recent prior turns for this conversation so follow-ups ("who is he?")
  // can resolve references. The current user turn is persisted only AFTER
  // generation (below), so the DB holds prior turns only — no duplication, and
  // the first question in a conversation yields empty history (zero overhead).
  let history = [];
  if (config.rag.historyMessages > 0) {
    const priorMessages = await Message.find({ conversationId })
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

  // Retrieve relevant passages via Atlas Vector Search.
  let passages = [];
  let sources = [];
  try {
    passages = await KnowledgeChunk.aggregate([
      {
        $vectorSearch: {
          index: config.rag.vectorIndexName,
          path: 'embedding',
          queryVector: questionEmbedding,
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

    sources = passages.map((p) => ({
      source: p.source || p.metadata?.title || 'Knowledge Base',
      score: p.score,
      snippet: (p.textEnglish || p.text || '').slice(0, 200),
    }));
  } catch (error) {
    // Surface loudly: this almost always means the Atlas Vector Search index is
    // missing/misconfigured. We degrade to a direct answer but must not hide it.
    logger.error(
      `Vector search failed — falling back to a direct (ungrounded) answer. ` +
        `Verify the Atlas index "${config.rag.vectorIndexName}" exists with ${config.embeddingDimensions} dims.`,
      { error: error.message }
    );
  }

  const grounded = passages.length > 0 && passages[0]?.score >= config.rag.confidenceThreshold;

  // Stream English tokens to the client directly; for other languages we cannot
  // stream the translated text, so suppress token streaming and send the final answer.
  const streamSink = isEnglish ? onToken : undefined;

  const englishAnswer = grounded
    ? await generateRAGAnswerStream(englishQuestion, passages, streamSink, history)
    : await generateDirectAnswerStream(englishQuestion, streamSink, history);

  const confidence = grounded ? passages[0].score : 0.5;

  const localAnswer = isEnglish ? englishAnswer : await translateText(englishAnswer, 'en', detectedLanguage);

  // Persist both turns.
  await Message.create({
    conversationId,
    role: 'user',
    language: detectedLanguage,
    originalText: question,
    englishText: isEnglish ? question : englishQuestion,
  });
  await Message.create({
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

import 'dotenv/config';

/**
 * Central configuration + startup validation.
 *
 * Importing this module loads .env (via dotenv) and immediately validates that
 * the required secrets are present. If anything critical is missing the process
 * exits with a clear, actionable message instead of failing later with a cryptic
 * MongoDB / JWT / Gemini error deep in a request handler.
 */

const REQUIRED_VARS = ['MONGODB_URI', 'JWT_SECRET', 'GEMINI_API_KEY'];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key] || !process.env[key].trim());

  if (missing.length > 0) {
    console.error(
      `\n✖ Missing required environment variable(s): ${missing.join(', ')}\n` +
        `  Copy server/.env.example to server/.env and fill in the values.\n` +
        `  See the README "Configure Environment" section for details.\n`
    );
    process.exit(1);
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn(
      '⚠ JWT_SECRET is shorter than 32 characters. Use a longer random string for production.\n' +
        '  Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
}

validateEnv();

const config = {
  // Server
  port: Number(process.env.PORT) || 4000,
  // Comma-separated list of allowed frontend origins (CORS + Socket.IO).
  // Trailing slashes are stripped because the browser's Origin header never has one.
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((u) => u.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Secrets
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  geminiApiKey: process.env.GEMINI_API_KEY,

  // Models
  geminiChatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash',
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 768,

  // Retrieval-Augmented Generation tuning
  rag: {
    vectorIndexName: process.env.VECTOR_INDEX_NAME || 'embedding_index',
    topK: Number(process.env.RAG_TOP_K) || 5,
    numCandidates: Number(process.env.RAG_NUM_CANDIDATES) || 50,
    // Floor below which a retrieved passage is treated as noise and ignored.
    // Above it, passages are fed to the (anti-hallucination) RAG prompt — so an
    // uploaded document is actually used to answer instead of being discarded.
    minRetrievalScore: Number(process.env.RAG_MIN_RETRIEVAL_SCORE) || 0.3,
    // Score at/above which an answer is labelled "grounded" in analytics.
    // (No longer gates whether passages are used — see minRetrievalScore.)
    confidenceThreshold: Number(process.env.RAG_CONFIDENCE_THRESHOLD) || 0.5,
    // Recent messages (prior turns) fed back as conversation context so that
    // follow-ups like "who is he?" resolve. 6 ≈ 3 turns. Set to 0 to disable.
    // (Parsed so an explicit 0 is honored rather than falling back to the default.)
    historyMessages: Number.isFinite(Number(process.env.RAG_HISTORY_MESSAGES))
      ? Number(process.env.RAG_HISTORY_MESSAGES)
      : 6,
    // Per-message character cap so one long answer can't blow up the prompt.
    historyCharLimit: Number(process.env.RAG_HISTORY_CHAR_LIMIT) || 600,
  },

  // External API resilience (retry with exponential backoff)
  retry: {
    maxRetries: Number(process.env.GEMINI_MAX_RETRIES) || 3,
    baseDelayMs: Number(process.env.GEMINI_RETRY_BASE_MS) || 500,
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 30000,
  },
};

export default config;

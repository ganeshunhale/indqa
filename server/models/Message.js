import mongoose from 'mongoose';

const retrievedChunkSchema = new mongoose.Schema({
  source: String,
  score: Number,
  snippet: String
}, { _id: false });

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  language: { type: String, required: true },
  originalText: { type: String, required: true },
  englishText: { type: String },
  retrievedChunks: [retrievedChunkSchema],
  confidence: { type: Number },
  latencyMs: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

// Text index for message search.
// `language_override: 'none'` points the per-document language override at a field that
// does not exist, so MongoDB ignores the `language` field (values like "hi"/"ta" are not
// valid MongoDB text-search languages and would otherwise reject inserts with code 17262).
// `default_language: 'none'` disables language-specific stemming, which is appropriate for
// mixed-script multilingual content.
messageSchema.index(
  { originalText: 'text', englishText: 'text' },
  { default_language: 'none', language_override: 'none' }
);

export default mongoose.model('Message', messageSchema);

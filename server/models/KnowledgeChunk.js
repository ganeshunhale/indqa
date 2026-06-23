import mongoose from 'mongoose';

const knowledgeChunkSchema = new mongoose.Schema({
  text: { type: String, required: true },
  textEnglish: { type: String, required: true },
  source: { type: String, required: true },
  category: { type: String, enum: ['government', 'education', 'health', 'agriculture', 'general'], default: 'general' },
  language: { type: String, default: 'en' },
  embedding: { type: [Number], required: true },
  metadata: {
    title: String,
    url: String,
    dateAdded: { type: Date, default: Date.now }
  }
});

// Note: Atlas Vector Search index must be created via Atlas UI/CLI:
// Index name: "embedding_index"
// Field: embedding, type: knnVector, dimensions: 768, similarity: cosine

export default mongoose.model('KnowledgeChunk', knowledgeChunkSchema);

import mongoose from 'mongoose';

const knowledgeChunkSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
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

// Note: Atlas Vector Search index must be created via Atlas UI/CLI.
// For per-workspace isolation the index MUST declare workspaceId as a filter
// field so $vectorSearch can pre-filter by tenant:
//   {
//     "fields": [
//       { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
//       { "type": "filter", "path": "workspaceId" }
//     ]
//   }
// Index name: "embedding_index" (config.rag.vectorIndexName)

export default mongoose.model('KnowledgeChunk', knowledgeChunkSchema);

import mongoose from 'mongoose';

/**
 * A Workspace is the tenant boundary of the platform. Every knowledge chunk,
 * conversation, and message belongs to exactly one workspace, and retrieval is
 * filtered by it so tenants never see each other's data. Users join workspaces
 * via the Membership collection.
 */
const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, trim: true, lowercase: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
  // Default answering behavior for the workspace:
  //   'hybrid' — general AI assistant that also uses the KB as reference (default)
  //   'strict' — only answers from the knowledge base, refuses off-topic questions
  answerMode: { type: String, enum: ['strict', 'hybrid'], default: 'hybrid' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Workspace', workspaceSchema);

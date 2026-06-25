import mongoose from 'mongoose';

/**
 * Join table between User and Workspace. A user can belong to many workspaces,
 * each with an independent role:
 *   - owner  : full control incl. role management; created with the workspace
 *   - admin  : manage the knowledge base, members, and view analytics
 *   - member : ask questions only
 * The compound unique index guarantees one membership per (workspace, user).
 */
const membershipSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  createdAt: { type: Date, default: Date.now },
});

membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export default mongoose.model('Membership', membershipSchema);

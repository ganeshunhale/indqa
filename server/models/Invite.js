import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * An invitation to join a workspace, addressed by email. If the invited email
 * already belongs to a registered user, a Membership is created immediately and
 * the invite is marked accepted. Otherwise it stays `pending` and is claimed
 * automatically when that email registers (see services/workspaceService.js).
 */
const inviteSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  role: { type: String, enum: ['admin', 'member'], default: 'member' },
  token: { type: String, default: () => crypto.randomBytes(24).toString('hex'), index: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

inviteSchema.index({ workspaceId: 1, email: 1 });

export default mongoose.model('Invite', inviteSchema);

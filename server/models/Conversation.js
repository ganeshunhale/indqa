import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'New Conversation' },
  language: { type: String, default: 'hi' },
  messageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Conversations are listed per workspace + user, newest first.
conversationSchema.index({ workspaceId: 1, userId: 1, updatedAt: -1 });

conversationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model('Conversation', conversationSchema);

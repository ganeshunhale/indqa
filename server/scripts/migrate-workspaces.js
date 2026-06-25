/**
 * One-time migration to multi-tenancy.
 *
 * Backfills the new Workspace model onto pre-existing single-tenant data:
 *   1. Creates a single "Default Workspace" (idempotent, keyed by slug).
 *   2. Makes every existing user a member (first admin/owner = owner,
 *      other admins = admin, everyone else = member).
 *   3. Stamps every KnowledgeChunk / Conversation / Message that lacks a
 *      workspaceId with the default workspace's id.
 *
 * Safe to run multiple times. Run:  node scripts/migrate-workspaces.js
 *
 * After this, recreate the Atlas vector index with a `workspaceId` filter field
 * (see models/KnowledgeChunk.js) so retrieval is isolated per workspace.
 */
import mongoose from 'mongoose';
import config from '../config/index.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import Membership from '../models/Membership.js';
import KnowledgeChunk from '../models/KnowledgeChunk.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';

const DEFAULT_SLUG = 'default-workspace';

async function migrate() {
  await mongoose.connect(config.mongoUri);
  console.log('Connected to MongoDB Atlas');

  // 1. Find or create the default workspace.
  let workspace = await Workspace.findOne({ slug: DEFAULT_SLUG });
  if (!workspace) {
    const ownerUser = (await User.findOne({ role: 'admin' }).sort({ createdAt: 1 })) ||
      (await User.findOne().sort({ createdAt: 1 }));
    const ownerId = ownerUser?._id || new mongoose.Types.ObjectId();
    if (!ownerUser) {
      console.warn('⚠ No users found — creating Default Workspace with a placeholder owner.');
    }
    workspace = await Workspace.create({ name: 'Default Workspace', slug: DEFAULT_SLUG, ownerId });
    console.log(`Created Default Workspace ${workspace._id}`);
  } else {
    console.log(`Reusing existing Default Workspace ${workspace._id}`);
  }

  // 2. Ensure a membership for every user.
  const users = await User.find().sort({ createdAt: 1 });
  let memberships = 0;
  for (const user of users) {
    const role = String(user._id) === String(workspace.ownerId)
      ? 'owner'
      : user.role === 'admin'
      ? 'admin'
      : 'member';
    const result = await Membership.updateOne(
      { workspaceId: workspace._id, userId: user._id },
      { $setOnInsert: { workspaceId: workspace._id, userId: user._id, role } },
      { upsert: true }
    );
    if (result.upsertedCount > 0) memberships++;
  }
  console.log(`Memberships created: ${memberships} (of ${users.length} users)`);

  // 3. Stamp existing data lacking a workspaceId.
  const missing = { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] };
  const [chunks, convos, msgs] = await Promise.all([
    KnowledgeChunk.updateMany(missing, { $set: { workspaceId: workspace._id } }),
    Conversation.updateMany(missing, { $set: { workspaceId: workspace._id } }),
    Message.updateMany(missing, { $set: { workspaceId: workspace._id } }),
  ]);
  console.log(
    `Stamped → chunks: ${chunks.modifiedCount}, conversations: ${convos.modifiedCount}, messages: ${msgs.modifiedCount}`
  );

  await mongoose.disconnect();
  console.log('\nMigration complete.');
  console.log('NEXT: recreate the Atlas vector index "embedding_index" with a filter field on "workspaceId".');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

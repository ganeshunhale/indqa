import crypto from 'crypto';
import Workspace from '../models/Workspace.js';
import Membership from '../models/Membership.js';
import Invite from '../models/Invite.js';

/** Build a URL-ish slug from a name plus a short random suffix to avoid clashes. */
function slugify(name) {
  const base = String(name || 'workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'workspace';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Create a workspace and make `ownerId` its owner. Returns the Workspace doc.
 * Used at registration (personal workspace) and by POST /api/workspaces.
 */
export async function createWorkspaceForOwner({ name, ownerId }) {
  const workspace = await Workspace.create({ name, slug: slugify(name), ownerId });
  await Membership.create({ workspaceId: workspace._id, userId: ownerId, role: 'owner' });
  return workspace;
}

/**
 * Turn any pending invites for `email` into memberships for `userId`.
 * Called right after a user registers (or logs in) so invitations sent before
 * they had an account take effect automatically. Idempotent.
 */
export async function claimInvites({ userId, email }) {
  const invites = await Invite.find({ email: String(email).toLowerCase(), status: 'pending' });
  for (const invite of invites) {
    await Membership.updateOne(
      { workspaceId: invite.workspaceId, userId },
      { $setOnInsert: { workspaceId: invite.workspaceId, userId, role: invite.role } },
      { upsert: true }
    );
    invite.status = 'accepted';
    await invite.save();
  }
  return invites.length;
}

/**
 * List the workspaces a user belongs to, with their role in each.
 * Shape: [{ id, name, plan, role }] sorted by role priority then name.
 */
export async function getUserWorkspaces(userId) {
  const memberships = await Membership.find({ userId }).lean();
  if (memberships.length === 0) return [];
  const byId = new Map(memberships.map((m) => [String(m.workspaceId), m.role]));
  const workspaces = await Workspace.find({ _id: { $in: memberships.map((m) => m.workspaceId) } }).lean();
  const rank = { owner: 0, admin: 1, member: 2 };
  return workspaces
    .map((w) => ({
      id: String(w._id),
      name: w.name,
      plan: w.plan,
      answerMode: w.answerMode || 'hybrid',
      role: byId.get(String(w._id)) || 'member',
    }))
    .sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name));
}

/** Pick a sensible default active workspace id for a user (owned first). */
export async function defaultWorkspaceId(userId) {
  const owned = await Membership.findOne({ userId, role: 'owner' }).sort({ createdAt: 1 }).lean();
  if (owned) return String(owned.workspaceId);
  const any = await Membership.findOne({ userId }).sort({ createdAt: 1 }).lean();
  return any ? String(any.workspaceId) : null;
}

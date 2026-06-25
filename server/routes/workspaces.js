import express from 'express';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import Membership from '../models/Membership.js';
import Invite from '../models/Invite.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { createWorkspaceForOwner, getUserWorkspaces } from '../services/workspaceService.js';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteSchema,
  memberRoleSchema,
  workspaceIdParamSchema,
  memberParamsSchema,
} from '../validators/schemas.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Load the caller's membership for :id and assert a minimum role.
// Returns the membership; throws 403/404 otherwise.
async function requireMembership(req, minRole = 'member') {
  const membership = await Membership.findOne({ workspaceId: req.params.id, userId: req.userId });
  if (!membership) throw new AppError('Workspace not found.', 404, { code: 'NOT_FOUND' });
  const rank = { member: 0, admin: 1, owner: 2 };
  if (rank[membership.role] < rank[minRole]) {
    throw new AppError('Insufficient permissions for this workspace.', 403, { code: 'FORBIDDEN' });
  }
  return membership;
}

// GET /api/workspaces — workspaces the current user belongs to (with role)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ workspaces: await getUserWorkspaces(req.userId) });
  })
);

// POST /api/workspaces — create a new workspace owned by the current user
router.post(
  '/',
  validate(createWorkspaceSchema),
  asyncHandler(async (req, res) => {
    const workspace = await createWorkspaceForOwner({ name: req.body.name, ownerId: req.userId });
    logger.info(`User ${req.userId} created workspace ${workspace._id}`);
    res.status(201).json({
      workspace: {
        id: String(workspace._id),
        name: workspace.name,
        plan: workspace.plan,
        answerMode: workspace.answerMode,
        role: 'owner',
      },
    });
  })
);

// PATCH /api/workspaces/:id — update workspace settings (name, answer mode) — admins+ only
router.patch(
  '/:id',
  validate(workspaceIdParamSchema, 'params'),
  validate(updateWorkspaceSchema),
  asyncHandler(async (req, res) => {
    await requireMembership(req, 'admin');
    const update = {};
    if (req.body.name !== undefined) update.name = req.body.name;
    if (req.body.answerMode !== undefined) update.answerMode = req.body.answerMode;
    const workspace = await Workspace.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!workspace) throw new AppError('Workspace not found.', 404, { code: 'NOT_FOUND' });
    res.json({
      workspace: {
        id: String(workspace._id),
        name: workspace.name,
        plan: workspace.plan,
        answerMode: workspace.answerMode,
      },
    });
  })
);

// GET /api/workspaces/:id/members — list members (admins+ only)
router.get(
  '/:id/members',
  validate(workspaceIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    await requireMembership(req, 'admin');
    const memberships = await Membership.find({ workspaceId: req.params.id }).lean();
    const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } })
      .select('name email')
      .lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const members = memberships.map((m) => ({
      userId: String(m.userId),
      name: userById.get(String(m.userId))?.name || 'Unknown',
      email: userById.get(String(m.userId))?.email || '',
      role: m.role,
      joinedAt: m.createdAt,
    }));
    const invites = await Invite.find({ workspaceId: req.params.id, status: 'pending' })
      .select('email role createdAt')
      .lean();
    res.json({ members, pendingInvites: invites });
  })
);

// POST /api/workspaces/:id/invites — invite a user by email (admins+ only)
router.post(
  '/:id/invites',
  validate(workspaceIdParamSchema, 'params'),
  validate(inviteSchema),
  asyncHandler(async (req, res) => {
    await requireMembership(req, 'admin');
    const { email, role = 'member' } = req.body;

    const existingUser = await User.findOne({ email }).select('_id');
    if (existingUser) {
      // Add them straight away; report if they were already a member.
      const result = await Membership.updateOne(
        { workspaceId: req.params.id, userId: existingUser._id },
        { $setOnInsert: { workspaceId: req.params.id, userId: existingUser._id, role } },
        { upsert: true }
      );
      const added = result.upsertedCount > 0;
      return res.status(added ? 201 : 200).json({
        status: added ? 'added' : 'already_member',
        member: { userId: String(existingUser._id), email, role },
      });
    }

    // No account yet — store a pending invite, claimed when they register.
    await Invite.findOneAndUpdate(
      { workspaceId: req.params.id, email },
      { $set: { role, status: 'pending', invitedBy: req.userId } },
      { upsert: true, new: true }
    );
    res.status(201).json({ status: 'invited', email, role });
  })
);

// PATCH /api/workspaces/:id/members/:userId — change a member's role (owner only)
router.patch(
  '/:id/members/:userId',
  validate(memberParamsSchema, 'params'),
  validate(memberRoleSchema),
  asyncHandler(async (req, res) => {
    await requireMembership(req, 'owner');
    const { role } = req.body;
    const target = await Membership.findOne({ workspaceId: req.params.id, userId: req.params.userId });
    if (!target) throw new AppError('Member not found.', 404, { code: 'NOT_FOUND' });

    // Never leave a workspace without an owner.
    if (target.role === 'owner' && role !== 'owner') {
      const owners = await Membership.countDocuments({ workspaceId: req.params.id, role: 'owner' });
      if (owners <= 1) throw new AppError('A workspace must have at least one owner.', 400, { code: 'LAST_OWNER' });
    }
    target.role = role;
    await target.save();
    res.json({ member: { userId: String(target.userId), role: target.role } });
  })
);

// DELETE /api/workspaces/:id/members/:userId — remove a member (admins+ only)
router.delete(
  '/:id/members/:userId',
  validate(memberParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    await requireMembership(req, 'admin');
    const target = await Membership.findOne({ workspaceId: req.params.id, userId: req.params.userId });
    if (!target) throw new AppError('Member not found.', 404, { code: 'NOT_FOUND' });

    if (target.role === 'owner') {
      const owners = await Membership.countDocuments({ workspaceId: req.params.id, role: 'owner' });
      if (owners <= 1) throw new AppError('Cannot remove the last owner.', 400, { code: 'LAST_OWNER' });
    }
    await Membership.deleteOne({ _id: target._id });
    res.json({ message: 'Member removed.' });
  })
);

export default router;

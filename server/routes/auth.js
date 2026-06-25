import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../config/index.js';
import { verifyToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { registerSchema, loginSchema } from '../validators/schemas.js';
import {
  createWorkspaceForOwner,
  claimInvites,
  getUserWorkspaces,
  defaultWorkspaceId,
} from '../services/workspaceService.js';

const router = express.Router();

const signToken = (userId) => jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

// Workspaces + the suggested active workspace, attached to auth responses so the
// client can populate its workspace switcher in a single round-trip.
const workspaceContext = async (userId) => ({
  workspaces: await getUserWorkspaces(userId),
  activeWorkspaceId: await defaultWorkspaceId(userId),
});

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  preferredLanguage: user.preferredLanguage,
  role: user.role,
});

// POST /api/auth/register
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password, preferredLanguage } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError('Email already registered.', 409, { code: 'EMAIL_TAKEN' });
    }

    const user = await User.create({ name, email, password, preferredLanguage: preferredLanguage || 'hi' });

    // Every new user gets a personal workspace they own, plus any workspaces
    // they were invited to before signing up.
    await createWorkspaceForOwner({ name: `${user.name}'s Workspace`, ownerId: user._id });
    await claimInvites({ userId: user._id, email: user.email });

    res.status(201).json({
      token: signToken(user._id),
      user: publicUser(user),
      ...(await workspaceContext(user._id)),
    });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      throw new AppError('Invalid email or password.', 401, { code: 'INVALID_CREDENTIALS' });
    }

    // Claim any invitations that arrived since the user last signed in.
    await claimInvites({ userId: user._id, email: user.email });

    res.json({ token: signToken(user._id), user: publicUser(user), ...(await workspaceContext(user._id)) });
  })
);

// GET /api/auth/me — uses the shared verifyToken middleware instead of re-parsing the JWT.
router.get(
  '/me',
  verifyToken,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId).select('-password');
    if (!user) throw new AppError('User not found.', 404);
    res.json({ user, ...(await workspaceContext(req.userId)) });
  })
);

export default router;

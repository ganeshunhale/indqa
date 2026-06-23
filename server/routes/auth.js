import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../config/index.js';
import { verifyToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { registerSchema, loginSchema } from '../validators/schemas.js';

const router = express.Router();

const signToken = (userId) => jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

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
    res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
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

    res.json({ token: signToken(user._id), user: publicUser(user) });
  })
);

// GET /api/auth/me — uses the shared verifyToken middleware instead of re-parsing the JWT.
router.get(
  '/me',
  verifyToken,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId).select('-password');
    if (!user) throw new AppError('User not found.', 404);
    res.json({ user });
  })
);

export default router;

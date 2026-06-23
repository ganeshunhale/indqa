import User from '../models/User.js';
import { asyncHandler, AppError } from './errorHandler.js';

/**
 * Role-based access control. Must run after verifyToken (which sets req.userId).
 * Loads the user and rejects the request unless their role is 'admin'.
 */
export const requireAdmin = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.userId).select('role');
  if (!user || user.role !== 'admin') {
    throw new AppError('Admin access required.', 403, { code: 'FORBIDDEN' });
  }
  req.userRole = user.role;
  next();
});

export default requireAdmin;

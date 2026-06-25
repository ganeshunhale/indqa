import { AppError } from './errorHandler.js';

/**
 * Per-workspace RBAC. Must run after resolveWorkspace (which sets
 * req.workspaceRole). Allows only workspace owners and admins through — used to
 * gate knowledge-base management and analytics for the active workspace.
 */
export function requireWorkspaceAdmin(req, res, next) {
  if (req.workspaceRole !== 'owner' && req.workspaceRole !== 'admin') {
    return next(new AppError('Admin access required for this workspace.', 403, { code: 'FORBIDDEN' }));
  }
  next();
}

export default requireWorkspaceAdmin;

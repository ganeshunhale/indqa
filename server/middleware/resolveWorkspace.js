import Membership from '../models/Membership.js';
import { asyncHandler, AppError } from './errorHandler.js';
import { defaultWorkspaceId } from '../services/workspaceService.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * Resolves the active workspace for a request. Must run AFTER verifyToken.
 *
 * - If the client sends `X-Workspace-Id`, the caller must be a member of it
 *   (else 403). This is how the UI scopes every call to the selected workspace.
 * - If the header is absent, we fall back to the user's default (owned) workspace
 *   so simple/legacy clients and single-workspace users just work.
 *
 * Sets `req.workspaceId` (ObjectId) and `req.workspaceRole` ('owner'|'admin'|'member').
 */
export const resolveWorkspace = asyncHandler(async (req, res, next) => {
  const headerId = req.headers['x-workspace-id'];

  let membership;
  if (headerId) {
    if (!OBJECT_ID.test(headerId)) {
      throw new AppError('Invalid workspace id.', 400, { code: 'INVALID_WORKSPACE' });
    }
    membership = await Membership.findOne({ workspaceId: headerId, userId: req.userId });
    if (!membership) {
      throw new AppError('You are not a member of this workspace.', 403, { code: 'WORKSPACE_FORBIDDEN' });
    }
  } else {
    const fallbackId = await defaultWorkspaceId(req.userId);
    if (!fallbackId) {
      throw new AppError('No workspace available for this account.', 403, { code: 'NO_WORKSPACE' });
    }
    membership = await Membership.findOne({ workspaceId: fallbackId, userId: req.userId });
  }

  req.workspaceId = membership.workspaceId;
  req.workspaceRole = membership.role;
  next();
});

export default resolveWorkspace;

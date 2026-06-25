import express from 'express';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { createConversationSchema, idParamSchema } from '../validators/schemas.js';

const router = express.Router();

// GET /api/conversations — list the current user's conversations
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const conversations = await Conversation.find({ workspaceId: req.workspaceId, userId: req.userId })
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json({ conversations });
  })
);

// POST /api/conversations — create a new conversation
router.post(
  '/',
  validate(createConversationSchema),
  asyncHandler(async (req, res) => {
    const { title, language } = req.body;
    const conversation = await Conversation.create({
      workspaceId: req.workspaceId,
      userId: req.userId,
      title: title || 'New Conversation',
      language: language || 'hi',
    });
    res.status(201).json({ conversation });
  })
);

// GET /api/conversations/:id/messages — messages for a conversation (ownership enforced)
router.get(
  '/:id/messages',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.userId,
      workspaceId: req.workspaceId,
    });
    if (!conversation) throw new AppError('Conversation not found.', 404);

    const messages = await Message.find({ conversationId: req.params.id, workspaceId: req.workspaceId })
      .sort({ createdAt: 1 })
      .limit(200);
    res.json({ messages });
  })
);

// DELETE /api/conversations/:id — delete a conversation and its messages
router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const conversation = await Conversation.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
      workspaceId: req.workspaceId,
    });
    if (!conversation) throw new AppError('Conversation not found.', 404);

    await Message.deleteMany({ conversationId: req.params.id, workspaceId: req.workspaceId });
    res.json({ message: 'Conversation deleted.' });
  })
);

export default router;

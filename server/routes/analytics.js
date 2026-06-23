import express from 'express';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import KnowledgeChunk from '../models/KnowledgeChunk.js';
import config from '../config/index.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();
router.use(requireAdmin);

// GET /api/analytics — aggregate usage metrics for the admin dashboard.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const threshold = config.rag.confidenceThreshold;

    const [
      totalUsers,
      totalConversations,
      totalMessages,
      totalKnowledgeChunks,
      questionsByLanguage,
      answerStats,
      groundedCount,
      messagesPerDay,
    ] = await Promise.all([
      User.countDocuments(),
      Conversation.countDocuments(),
      Message.countDocuments(),
      KnowledgeChunk.countDocuments(),
      // Questions grouped by language
      Message.aggregate([
        { $match: { role: 'user' } },
        { $group: { _id: '$language', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Average latency + confidence over assistant messages
      Message.aggregate([
        { $match: { role: 'assistant' } },
        {
          $group: {
            _id: null,
            avgLatencyMs: { $avg: '$latencyMs' },
            avgConfidence: { $avg: '$confidence' },
            count: { $sum: 1 },
          },
        },
      ]),
      // RAG-grounded answers = confidence at/above the threshold
      Message.countDocuments({ role: 'assistant', confidence: { $gte: threshold } }),
      // Activity over the last 7 days
      Message.aggregate([
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 7 },
      ]),
    ]);

    const answers = answerStats[0] || { avgLatencyMs: 0, avgConfidence: 0, count: 0 };
    const groundedRatio = answers.count ? groundedCount / answers.count : 0;

    res.json({
      totals: {
        users: totalUsers,
        conversations: totalConversations,
        messages: totalMessages,
        knowledgeChunks: totalKnowledgeChunks,
      },
      questionsByLanguage: questionsByLanguage.map((q) => ({ language: q._id, count: q.count })),
      answers: {
        count: answers.count,
        avgLatencyMs: Math.round(answers.avgLatencyMs || 0),
        avgConfidence: Number((answers.avgConfidence || 0).toFixed(3)),
      },
      grounding: {
        confidenceThreshold: threshold,
        grounded: groundedCount,
        direct: Math.max(answers.count - groundedCount, 0),
        groundedRatio: Number(groundedRatio.toFixed(3)),
      },
      messagesPerDay: messagesPerDay.map((d) => ({ date: d._id, count: d.count })).reverse(),
    });
  })
);

export default router;

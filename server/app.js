import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

import config from './config/index.js';
import logger from './utils/logger.js';
import authRoutes from './routes/auth.js';
import conversationRoutes from './routes/conversations.js';
import adminRoutes from './routes/admin.js';
import analyticsRoutes from './routes/analytics.js';
import { handleQuestion } from './services/qaHandler.js';
import { verifyToken } from './middleware/auth.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { validatePayload } from './middleware/validate.js';
import { askQuestionSchema } from './validators/schemas.js';
import Conversation from './models/Conversation.js';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: config.clientUrl, methods: ['GET', 'POST'], credentials: true },
});

// Security + parsing middleware
app.use(helmet());
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Rate limiting on the API surface
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// REST routes
app.use('/api/auth', authRoutes);
app.use('/api/conversations', verifyToken, conversationRoutes);
app.use('/api/admin', verifyToken, adminRoutes);
app.use('/api/analytics', verifyToken, analyticsRoutes);

// 404 + central error handler — must be registered after all routes.
app.use(notFoundHandler);
app.use(errorHandler);

// Socket.IO JWT authentication
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    socket.userId = decoded.userId;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  logger.info(`Socket connected: user ${socket.userId}`);

  socket.on('join-conversation', (conversationId) => {
    socket.join(conversationId);
  });

  socket.on('ask-question', async (payload) => {
    const startTime = Date.now();
    try {
      const { question, language, conversationId } = validatePayload(askQuestionSchema, payload);

      // Ownership check: only allow asking within the user's own conversation.
      const conv = await Conversation.findOne({ _id: conversationId, userId: socket.userId });
      if (!conv) {
        socket.emit('error', { message: 'Conversation not found.', code: 'NOT_FOUND' });
        return;
      }

      socket.emit('status', { stage: 'processing', message: 'Processing your question...' });

      let partial = '';
      const result = await handleQuestion({
        question,
        language,
        conversationId,
        userId: socket.userId,
        onToken: (delta) => {
          partial += delta;
          socket.emit('token', { text: delta, partial });
        },
      });

      socket.emit('answer-complete', {
        answer: result.answer,
        englishAnswer: result.englishAnswer,
        sources: result.sources,
        detectedLanguage: result.detectedLanguage,
        confidence: result.confidence,
        latencyMs: Date.now() - startTime,
      });

      logger.info(`Question answered in ${Date.now() - startTime}ms (${result.detectedLanguage})`);
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) logger.error('QA pipeline error', { error: error.message, stack: error.stack });
      else logger.warn('QA request rejected', { error: error.message });
      socket.emit('error', {
        message: error.isOperational
          ? error.message
          : 'Sorry, an error occurred while processing your question.',
        code: error.code,
      });
    }
  });

  socket.on('disconnect', () => logger.info(`Socket disconnected: user ${socket.userId}`));
});

// Bootstrap (skipped under NODE_ENV=test so the app can be imported by Supertest).
async function start() {
  try {
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB Atlas');
    httpServer.listen(config.port, () => logger.info(`IndQA server running on port ${config.port}`));
  } catch (err) {
    logger.error('MongoDB connection error', { error: err.message });
    process.exit(1);
  }
}

if (config.nodeEnv !== 'test') {
  start();
}

export { app, io, httpServer, start };

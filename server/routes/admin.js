import express from 'express';
import multer from 'multer';
import KnowledgeChunk from '../models/KnowledgeChunk.js';
import { generateEmbedding } from '../services/gemini.js';
import { extractText, chunkText } from '../services/documentProcessor.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { knowledgeChunkSchema, idParamSchema, KNOWLEDGE_CATEGORIES } from '../validators/schemas.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Every admin route requires an authenticated admin (verifyToken runs in app.js).
router.use(requireAdmin);

const MAX_CHUNKS_PER_UPLOAD = 50;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const insertChunk = (text, source, category) =>
  generateEmbedding(text).then((embedding) =>
    KnowledgeChunk.create({
      text,
      textEnglish: text,
      source,
      category,
      language: 'en',
      embedding,
      metadata: { title: source, dateAdded: new Date() },
    })
  );

// GET /api/admin/knowledge — list knowledge chunks (embeddings excluded for size)
router.get(
  '/knowledge',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const skip = Number(req.query.skip) || 0;
    const [items, total] = await Promise.all([
      KnowledgeChunk.find({}, { embedding: 0 }).sort({ 'metadata.dateAdded': -1 }).skip(skip).limit(limit),
      KnowledgeChunk.countDocuments(),
    ]);
    res.json({ items, total });
  })
);

// POST /api/admin/knowledge — add a single passage (text is embedded and stored)
router.post(
  '/knowledge',
  validate(knowledgeChunkSchema),
  asyncHandler(async (req, res) => {
    const { text, source, category } = req.body;
    const chunk = await insertChunk(text, source || 'Admin entry', category || 'general');
    logger.info(`Admin ${req.userId} added a knowledge chunk (${chunk._id})`);
    res.status(201).json({ chunk: { ...chunk.toObject(), embedding: undefined } });
  })
);

// DELETE /api/admin/knowledge/:id — remove a passage
router.delete(
  '/knowledge/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const deleted = await KnowledgeChunk.findByIdAndDelete(req.params.id);
    if (!deleted) throw new AppError('Knowledge chunk not found.', 404);
    res.json({ message: 'Deleted.' });
  })
);

// POST /api/admin/knowledge/upload — upload a .txt/.md/.pdf doc, chunk + embed it
router.post(
  '/knowledge/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('No file uploaded.', 400);

    const text = await extractText(req.file);
    if (!text || text.length < 20) {
      throw new AppError('Could not extract enough text from the file.', 422, { code: 'EMPTY_DOCUMENT' });
    }

    let chunks = chunkText(text);
    let truncated = false;
    if (chunks.length > MAX_CHUNKS_PER_UPLOAD) {
      logger.warn(`Upload produced ${chunks.length} chunks; truncating to ${MAX_CHUNKS_PER_UPLOAD}.`);
      chunks = chunks.slice(0, MAX_CHUNKS_PER_UPLOAD);
      truncated = true;
    }

    const source = req.body.source?.trim() || req.file.originalname;
    const category = KNOWLEDGE_CATEGORIES.includes(req.body.category) ? req.body.category : 'general';

    // Embed sequentially to stay within Gemini free-tier rate limits.
    let added = 0;
    for (const chunk of chunks) {
      await insertChunk(chunk, source, category);
      added++;
    }

    logger.info(`Admin ${req.userId} ingested "${source}" → ${added} chunks`);
    res.status(201).json({ added, source, category, truncated });
  })
);

export default router;

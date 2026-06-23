import { z } from 'zod';

/** Languages the system accepts (matches translation.js SUPPORTED_LANGUAGES). */
export const LANGUAGE_CODES = ['hi', 'mr', 'bn', 'ta', 'te', 'kn', 'gu', 'pa', 'ml', 'en'];

const languageEnum = z.enum(LANGUAGE_CODES);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('must be a valid email'),
  password: z
    .string()
    .min(8, 'must be at least 8 characters')
    .max(128)
    .regex(/[a-zA-Z]/, 'must contain a letter')
    .regex(/[0-9]/, 'must contain a number'),
  preferredLanguage: languageEnum.optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('must be a valid email'),
  password: z.string().min(1, 'is required'),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  language: languageEnum.optional(),
});

export const idParamSchema = z.object({
  id: objectId,
});

export const askQuestionSchema = z.object({
  question: z.string().trim().min(1, 'cannot be empty').max(2000, 'is too long'),
  language: languageEnum.optional(),
  conversationId: objectId,
});

export const KNOWLEDGE_CATEGORIES = ['government', 'education', 'health', 'agriculture', 'general'];

export const knowledgeChunkSchema = z.object({
  text: z.string().trim().min(20, 'must be at least 20 characters').max(5000, 'is too long'),
  source: z.string().trim().min(2).max(200).optional(),
  category: z.enum(KNOWLEDGE_CATEGORIES).optional(),
});

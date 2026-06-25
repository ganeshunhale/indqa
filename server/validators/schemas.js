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
  mode: z.enum(['strict', 'hybrid']).optional(),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'must be at least 2 characters').max(100),
});

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    answerMode: z.enum(['strict', 'hybrid']).optional(),
  })
  .refine((d) => d.name !== undefined || d.answerMode !== undefined, {
    message: 'nothing to update',
  });

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('must be a valid email'),
  role: z.enum(['admin', 'member']).optional(),
});

export const memberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']),
});

export const workspaceIdParamSchema = z.object({
  id: objectId,
});

export const memberParamsSchema = z.object({
  id: objectId,
  userId: objectId,
});

export const KNOWLEDGE_CATEGORIES = ['government', 'education', 'health', 'agriculture', 'general'];

export const knowledgeChunkSchema = z.object({
  text: z.string().trim().min(20, 'must be at least 20 characters').max(5000, 'is too long'),
  source: z.string().trim().min(2).max(200).optional(),
  category: z.enum(KNOWLEDGE_CATEGORIES).optional(),
});

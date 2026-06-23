import { describe, it, expect } from 'vitest';
import { validatePayload } from '../middleware/validate.js';
import { askQuestionSchema, registerSchema } from '../validators/schemas.js';
import AppError from '../utils/AppError.js';

const VALID_ID = '0123456789abcdef01234567';

describe('validatePayload + schemas', () => {
  it('accepts a valid ask-question payload', () => {
    const data = validatePayload(askQuestionSchema, {
      question: 'What is PMJDY?',
      language: 'en',
      conversationId: VALID_ID,
    });
    expect(data.question).toBe('What is PMJDY?');
  });

  it('rejects an empty/whitespace question', () => {
    expect(() => validatePayload(askQuestionSchema, { question: '   ', conversationId: VALID_ID })).toThrow(AppError);
  });

  it('rejects an invalid conversationId', () => {
    expect(() => validatePayload(askQuestionSchema, { question: 'hi', conversationId: 'not-an-id' })).toThrow();
  });

  it('rejects an unsupported language code', () => {
    expect(() =>
      validatePayload(askQuestionSchema, { question: 'hi', language: 'xx', conversationId: VALID_ID })
    ).toThrow();
  });

  it('rejects a weak password on register', () => {
    expect(() => validatePayload(registerSchema, { name: 'Abc', email: 'a@b.com', password: 'weak' })).toThrow();
  });

  it('accepts a strong password and lowercases the email', () => {
    const data = validatePayload(registerSchema, { name: 'Abc', email: 'A@B.com', password: 'password1' });
    expect(data.email).toBe('a@b.com');
  });
});

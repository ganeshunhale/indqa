import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Gemini SDK so we can drive embedding/generation behaviour deterministically.
const { embedContentMock, generateContentMock } = vi.hoisted(() => ({
  embedContentMock: vi.fn(),
  generateContentMock: vi.fn(),
}));

vi.mock('@google/generative-ai', () => ({
  // Must be a real constructor (gemini.js calls `new GoogleGenerativeAI(...)`).
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { embedContent: embedContentMock, generateContent: generateContentMock };
    }
  },
}));

const { generateEmbedding } = await import('../services/gemini.js');

const quotaError = (msg = '429 Too Many Requests') => Object.assign(new Error(msg), { status: 429 });

describe('gemini service resilience', () => {
  beforeEach(() => {
    embedContentMock.mockReset();
  });

  it('retries a transient 429 and then succeeds', async () => {
    embedContentMock
      .mockRejectedValueOnce(quotaError())
      .mockResolvedValueOnce({ embedding: { values: [0.1, 0.2, 0.3] } });

    const vec = await generateEmbedding('hello');
    expect(vec).toEqual([0.1, 0.2, 0.3]);
    expect(embedContentMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a 429 AppError after the quota is persistently exhausted', async () => {
    embedContentMock.mockRejectedValue(quotaError('quota exceeded'));
    await expect(generateEmbedding('x')).rejects.toMatchObject({ statusCode: 429, code: 'QUOTA_EXCEEDED' });
  });

  it('does not retry a non-retryable error', async () => {
    embedContentMock.mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }));
    await expect(generateEmbedding('x')).rejects.toThrow('bad request');
    expect(embedContentMock).toHaveBeenCalledTimes(1);
  });
});

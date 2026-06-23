import { PDFParse } from 'pdf-parse';

/**
 * Document ingestion helpers for the admin knowledge-base uploader.
 * Extracts plain text from an uploaded file and splits it into embedding-sized
 * chunks suitable for the RAG retrieval pipeline.
 */

/** Extract text from a PDF buffer using pdf-parse v2. */
export async function extractTextFromPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text || '').trim();
  } finally {
    await parser.destroy?.();
  }
}

/** Extract plain text from an uploaded file based on its mimetype/extension. */
export async function extractText(file) {
  const name = (file.originalname || '').toLowerCase();
  const isPdf = file.mimetype === 'application/pdf' || name.endsWith('.pdf');
  if (isPdf) return extractTextFromPdf(file.buffer);
  // Treat everything else (text/plain, text/markdown, .txt, .md) as UTF-8 text.
  return file.buffer.toString('utf-8').trim();
}

/**
 * Split text into chunks no larger than maxChars, preferring paragraph and then
 * sentence boundaries so each chunk stays semantically coherent.
 */
export function chunkText(text, { maxChars = 1000, minChars = 40 } = {}) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const para of paragraphs) {
    if (`${current} ${para}`.trim().length <= maxChars) {
      current = `${current} ${para}`.trim();
      continue;
    }
    flush();
    if (para.length <= maxChars) {
      current = para;
      continue;
    }
    // A single oversized paragraph: split by sentences.
    const sentences = para.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (`${current} ${sentence}`.trim().length > maxChars) flush();
      current = `${current} ${sentence}`.trim();
    }
  }
  flush();

  return chunks.filter((c) => c.length >= minChars);
}

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setup.js'],
    // Required env so config/index.js validation passes when modules are imported.
    // (The real Mongo connection in tests is to an in-memory server set up in setup.js.)
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-0123456789',
      GEMINI_API_KEY: 'test-gemini-key',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/indqa-test',
      GEMINI_RETRY_BASE_MS: '1', // keep retry backoff fast in tests
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['routes/**', 'services/**', 'middleware/**', 'config/**'],
    },
    // mongodb-memory-server may download a binary on first run.
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});

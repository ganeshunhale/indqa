import { beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';

/**
 * Per-worker DB setup. Connects to the shared in-memory MongoDB started in
 * globalSetup.js, using a database name unique to this worker process so test
 * files running in parallel never clear each other's data.
 */
const uri = `mongodb://127.0.0.1:47017/test_${process.pid}`;

beforeAll(async () => {
  await mongoose.connect(uri);
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

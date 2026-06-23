import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Start ONE in-memory MongoDB for the whole test run (on a fixed port) instead
 * of one per test file. Each worker connects to its own database on this server
 * (see tests/setup.js), which avoids spinning up many mongod processes and the
 * resource contention / startup timeouts that caused.
 */
let mongod;

export async function setup() {
  mongod = await MongoMemoryServer.create({ instance: { port: 47017 } });
}

export async function teardown() {
  await mongod?.stop();
}

/**
 * One-time migration: rebuild the Message text index so it no longer uses the
 * `language` field as a text-search language override (which rejected non-English
 * inserts with MongoServerError code 17262 "language override unsupported").
 *
 * Run from the server directory: node scripts/fixMessageIndex.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Message from '../models/Message.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  const coll = Message.collection;

  const before = await coll.indexes();
  console.log('Indexes before:', before.map(i => i.name).join(', '));

  // Drop any existing text index (its name ends with "_text" on the text fields)
  for (const idx of before) {
    if (Object.values(idx.key).includes('text')) {
      console.log(`Dropping old text index: ${idx.name}`);
      await coll.dropIndex(idx.name);
    }
  }

  // Recreate indexes from the schema definition (with language_override: 'none')
  await Message.syncIndexes();

  const after = await coll.indexes();
  console.log('Indexes after:', JSON.stringify(after, null, 2));

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error('Migration error:', err); process.exit(1); });

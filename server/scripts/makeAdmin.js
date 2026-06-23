/**
 * Promote a user to admin so they can access the admin panel + analytics.
 * Usage:  node scripts/makeAdmin.js user@example.com
 *   (or)  npm run make-admin -- user@example.com
 */
import mongoose from 'mongoose';
import config from '../config/index.js';
import User from '../models/User.js';

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Usage: node scripts/makeAdmin.js <email>');
  process.exit(1);
}

try {
  await mongoose.connect(config.mongoUri);
  const user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { new: true });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }
  console.log(`✓ ${user.email} is now an admin.`);
  await mongoose.disconnect();
} catch (error) {
  console.error('Failed to promote user:', error.message);
  process.exit(1);
}

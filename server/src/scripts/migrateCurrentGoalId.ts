/**
 * Migration script to add currentGoalId field to existing User documents
 * Run this script to initialize the currentGoalId field for existing users
 *
 * Usage: bun run src/scripts/migrateCurrentGoalId.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatdidyougetdonetoday';

async function migrateCurrentGoalId() {
  console.log('[Migration] Starting currentGoalId migration...');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('[Migration] Connected to MongoDB');

    const collection = mongoose.connection.collection('users');

    // Initialize currentGoalId field for existing documents (null = no active goal)
    const result = await collection.updateMany(
      { currentGoalId: { $exists: false } },
      { $set: { currentGoalId: null } }
    );

    console.log(`[Migration] Updated ${result.modifiedCount} users`);

    // Create index for currentGoalId
    await collection.createIndex({ currentGoalId: 1 });
    console.log('[Migration] Created index for currentGoalId');

    console.log('[Migration] Migration completed successfully!');
  } catch (error) {
    console.error('[Migration] Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('[Migration] Disconnected from MongoDB');
  }
}

migrateCurrentGoalId();

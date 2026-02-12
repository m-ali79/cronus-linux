/**
 * Migration script to add cachedForGoalId field to existing ActiveWindowEvent documents
 * Run this script to initialize the cachedForGoalId field for existing browser events
 *
 * Usage: bun run src/scripts/migrateCachedForGoalId.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatdidyougetdonetoday';

async function migrateCachedForGoalId() {
  console.log('[Migration] Starting cachedForGoalId migration...');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('[Migration] Connected to MongoDB');

    const collection = mongoose.connection.collection('activewindowevents');

    // Initialize cachedForGoalId field for existing documents (null = uncached)
    const result = await collection.updateMany(
      { cachedForGoalId: { $exists: false } },
      { $set: { cachedForGoalId: null } }
    );

    console.log(`[Migration] Updated ${result.modifiedCount} documents`);

    // Create the compound index for cachedForGoalId
    await collection.createIndex({ userId: 1, type: 1, goalId: 1, cachedForGoalId: 1 });
    console.log('[Migration] Created compound index for cachedForGoalId');

    console.log('[Migration] Migration completed successfully!');
  } catch (error) {
    console.error('[Migration] Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('[Migration] Disconnected from MongoDB');
  }
}

migrateCachedForGoalId();

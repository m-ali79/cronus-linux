import { describe, expect, test } from 'bun:test';
import mongoose from 'mongoose';
import { checkActivityHistory } from './history';
import { ActiveWindowEventModel } from '../../models/activeWindowEvent';
import { CategoryModel } from '../../models/category';
import { UserModel } from '../../models/user';

describe('Integration: Cache invalidation with goal changes', () => {
  test('should cache hit with same goal, cache miss with different goal', async () => {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const user = await UserModel.create({
      email: 'test-cache@example.com',
      password: 'test123',
      name: 'Test User',
      googleId: 'google-123',
      currentGoalId: 'goal-1',
      userProjectsAndGoals: 'Test goal 1',
    });

    const category = await CategoryModel.create({
      userId: user._id,
      name: 'Work',
      color: '#3b82f6',
      isDefault: false,
      isProductive: true,
    });

    await ActiveWindowEventModel.create({
      userId: user._id.toString(),
      url: 'https://github.com/test',
      type: 'browser',
      cachedForGoalId: 'goal-1',
      categoryId: category._id.toString(),
      categoryReasoning: 'Work',
      ownerName: 'Chrome',
      title: 'Test',
    });

    const hit1 = await checkActivityHistory(user._id.toString(), 'goal-1', {
      ownerName: 'Chrome',
      url: 'https://github.com/test',
      type: 'browser',
      title: 'Test',
    });
    expect(hit1).not.toBeNull();
    expect(hit1?.categoryId).toBe(category._id.toString());

    const hit2 = await checkActivityHistory(user._id.toString(), 'goal-2', {
      ownerName: 'Chrome',
      url: 'https://github.com/test',
      type: 'browser',
      title: 'Test',
    });
    expect(hit2).toBeNull();

    await mongoose.disconnect();
    await mongoServer.stop();
  }, 30000);

  test('categorizationService should use currentGoalId for cache', async () => {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const user = await UserModel.create({
      email: 'test-service@example.com',
      password: 'test123',
      name: 'Test User',
      googleId: 'google-456',
      currentGoalId: 'goal-1',
      userProjectsAndGoals: 'Test goal 1',
    });

    const category = await CategoryModel.create({
      userId: user._id,
      name: 'Work',
      color: '#3b82f6',
      isDefault: false,
      isProductive: true,
    });

    await ActiveWindowEventModel.create({
      userId: user._id.toString(),
      url: 'https://github.com/test',
      type: 'browser',
      cachedForGoalId: 'goal-1',
      categoryId: category._id.toString(),
      categoryReasoning: 'Work',
      ownerName: 'Chrome',
      title: 'Test',
    });

    const { categorizeActivity } = await import('./categorizationService');

    const result1 = await categorizeActivity(user._id.toString(), {
      ownerName: 'Chrome',
      url: 'https://github.com/test',
      type: 'browser',
      title: 'Test',
    });
    expect(result1.categoryId).toBe(category._id.toString());

    await UserModel.findByIdAndUpdate(user._id, { currentGoalId: 'goal-2' });

    const result2 = await categorizeActivity(user._id.toString(), {
      ownerName: 'Chrome',
      url: 'https://github.com/test',
      type: 'browser',
      title: 'Test',
    });

    expect(result2.categoryId).toBeNull();

    await mongoose.disconnect();
    await mongoServer.stop();
  }, 30000);
});

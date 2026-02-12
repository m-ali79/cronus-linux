import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test';
import mongoose from 'mongoose';
import { ActiveWindowDetails } from '../../../../shared/types';
import { checkActivityHistory } from './history';

// Mock Mongoose models and their methods
const mockActiveWindowEventModel = {
  findOne: jest.fn(),
};
const mockCategoryModel = {
  findById: jest.fn(),
  findOne: jest.fn(),
};
const mockUserModel = {
  findById: jest.fn(),
};

// Use mock.module to replace the actual models with our mocks
mock.module('../../models/activeWindowEvent', () => ({
  ActiveWindowEventModel: mockActiveWindowEventModel,
}));
mock.module('../../models/category', () => ({
  CategoryModel: mockCategoryModel,
}));
mock.module('../../models/user', () => ({
  UserModel: mockUserModel,
}));
const { ActiveWindowEventModel } = await import('../../models/activeWindowEvent');
const { CategoryModel } = await import('../../models/category');

describe('checkActivityHistory', () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();
  const mockRecruitingCategoryId = new mongoose.Types.ObjectId().toString();
  const mockWorkCategoryId = new mongoose.Types.ObjectId().toString();
  const mockGoalId = 'test-goal-123';

  beforeEach(() => {
    jest.clearAllMocks();
    (mockUserModel.findById as ReturnType<typeof jest.fn>).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ multiPurposeApps: [] }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should return category from history for a known browser URL', async () => {
    // Arrange
    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Google Chrome',
      type: 'browser',
      title: 'Messaging candidates on LinkedIn Recruiter',
      url: 'https://www.linkedin.com/recruiter/projects',
    };

    const mockPreviousEvent = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      url: activeWindow.url,
      categoryId: mockRecruitingCategoryId,
    };

    (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockPreviousEvent),
    });

    // Mock the category validation check
    (CategoryModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: mockRecruitingCategoryId, name: 'Recruiting' }),
    });

    // Act
    const result = await checkActivityHistory(mockUserId, mockGoalId, activeWindow);

    // Assert
    expect(result?.categoryId).toBe(mockRecruitingCategoryId);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledTimes(1);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      cachedForGoalId: mockGoalId,
      url: activeWindow.url,
    });
    // Assert that the category check was performed
    expect(CategoryModel.findOne).toHaveBeenCalledWith({
      _id: mockRecruitingCategoryId,
      isArchived: false,
    });
  });

  test('should return content when matching event has content', async () => {
    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Google Chrome',
      type: 'browser',
      title: 'Messaging candidates on LinkedIn Recruiter',
      url: 'https://www.linkedin.com/recruiter/projects',
    };

    const mockPreviousEvent = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      url: activeWindow.url,
      categoryId: mockRecruitingCategoryId,
      categoryReasoning: 'Recruiting',
      llmSummary: 'LinkedIn Recruiter',
      content: 'Previous OCR text content',
    };

    (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockPreviousEvent),
    });

    (CategoryModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: mockRecruitingCategoryId, name: 'Recruiting' }),
    });

    const result = await checkActivityHistory(mockUserId, mockGoalId, activeWindow);

    expect(result?.categoryId).toBe(mockRecruitingCategoryId);
    expect(result?.content).toBe('Previous OCR text content');
  });

  test('should return category from history for a Cursor project', async () => {
    // Arrange
    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Cursor',
      type: 'window',
      title: 'billingPlan.ts — spellbound',
      url: null,
    };

    const mockPreviousEvent = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      ownerName: 'Cursor',
      title: 'someOtherFile.ts — spellbound',
      categoryId: mockWorkCategoryId,
    };

    (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockPreviousEvent),
    });

    // Mock the category validation check
    (CategoryModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: mockWorkCategoryId, name: 'Work' }),
    });

    // Act
    const result = await checkActivityHistory(mockUserId, mockGoalId, activeWindow);

    // Assert
    expect(result?.categoryId).toBe(mockWorkCategoryId);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledTimes(1);
    // Code editors are type 'window', NOT 'browser', so goalId should NOT be in query
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      ownerName: 'Cursor',
      title: { $regex: '— spellbound$', $options: 'i' },
    });
    // Assert that the category check was performed
    expect(CategoryModel.findOne).toHaveBeenCalledWith({
      _id: mockWorkCategoryId,
      isArchived: false,
    });
  });

  test('should return category from history for a VSCode project with complex title', async () => {
    // Arrange
    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Code',
      type: 'window',
      title: 'appFilter.mm (Working Tree) (appFilter.mm) — whatdidyougetdonethisweek-ai',
      url: null,
    };

    const mockPreviousEvent = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      ownerName: 'Code',
      title: 'someOtherFile.js — whatdidyougetdonethisweek-ai',
      categoryId: mockWorkCategoryId,
    };

    (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockPreviousEvent),
    });

    // Mock the category validation check
    (CategoryModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: mockWorkCategoryId, name: 'Work' }),
    });

    // Act
    const result = await checkActivityHistory(mockUserId, mockGoalId, activeWindow);

    // Assert
    expect(result?.categoryId).toBe(mockWorkCategoryId);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledTimes(1);
    // Code editors are type 'window', NOT 'browser', so goalId should NOT be in query
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      ownerName: 'Code',
      title: { $regex: '— whatdidyougetdonethisweek-ai$', $options: 'i' },
    });
    // Assert that the category check was performed
    expect(CategoryModel.findOne).toHaveBeenCalledWith({
      _id: mockWorkCategoryId,
      isArchived: false,
    });
  });

  test('should fallback to ownerName for editor if title has no project', async () => {
    // Arrange
    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Cursor',
      type: 'window',
      title: 'Cursor Home', // No "—" separator
      url: null,
    };

    const mockPreviousEvent = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      ownerName: 'Cursor',
      categoryId: mockWorkCategoryId,
    };

    (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockPreviousEvent),
    });

    // Mock the category validation check
    (CategoryModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: mockWorkCategoryId, name: 'Work' }),
    });

    // Act
    const result = await checkActivityHistory(mockUserId, mockGoalId, activeWindow);

    // Assert
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      // Native apps and code editors are type 'window', NOT 'browser', so goalId should NOT be in query
      ownerName: 'Cursor',
    });
    // Assert that the category check was performed
    expect(CategoryModel.findOne).toHaveBeenCalledWith({
      _id: mockWorkCategoryId,
      isArchived: false,
    });
    expect(result?.categoryId).toBe(mockWorkCategoryId);
  });

  test('should return null if history exists but has no categoryId', async () => {
    // Arrange
    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Google Chrome',
      type: 'browser',
      title: 'An uncategorized page',
      url: 'https://example.com/new-page',
    };

    const mockPreviousEvent = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      url: activeWindow.url,
      categoryId: null, // The key part of this test
    };

    (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockPreviousEvent),
    });

    // Act
    const result = await checkActivityHistory(mockUserId, mockGoalId, activeWindow);

    // Assert
    expect(result).toBeNull();
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledTimes(1);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      cachedForGoalId: mockGoalId,
      url: activeWindow.url,
    });
    // Ensure the category check was NOT performed
    expect(CategoryModel.findOne).not.toHaveBeenCalled();
  });

  test('should return null if history points to a deleted category', async () => {
    // Arrange
    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Google Chrome',
      type: 'browser',
      title: 'A page with a deleted category',
      url: 'https://example.com/deleted-category-page',
    };

    const mockPreviousEvent = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      url: activeWindow.url,
      categoryId: mockRecruitingCategoryId, // This category will not be found
    };

    (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockPreviousEvent),
    });

    // Mock the category validation to return null (category not found)
    (CategoryModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    // Act
    const result = await checkActivityHistory(mockUserId, mockGoalId, activeWindow);

    // Assert
    expect(result).toBeNull();
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      cachedForGoalId: mockGoalId,
      url: activeWindow.url,
    });
    expect(CategoryModel.findOne).toHaveBeenCalledWith({
      _id: mockRecruitingCategoryId,
      isArchived: false,
    });
  });

  // Goal-based caching tests
  test('should include goalId in browser cache key for URL-based queries', async () => {
    // Arrange
    const goalId = 'goal-123';
    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Google Chrome',
      type: 'browser',
      title: 'Project Dashboard',
      url: 'https://github.com/org/project',
    };

    const mockPreviousEvent = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      url: activeWindow.url,
      goalId: goalId,
      categoryId: mockWorkCategoryId,
    };

    (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockPreviousEvent),
    });

    (CategoryModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: mockWorkCategoryId, name: 'Work' }),
    });

    // Act
    const result = await checkActivityHistory(mockUserId, goalId, activeWindow);

    // Assert
    expect(result?.categoryId).toBe(mockWorkCategoryId);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      cachedForGoalId: goalId,
      url: activeWindow.url,
    });
  });

  test('should include goalId in browser cache key for title-based queries', async () => {
    // Arrange
    const goalId = 'goal-456';
    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Google Chrome',
      type: 'browser',
      title: 'Coding Session - VS Code',
      url: '', // Empty URL
    };

    const mockPreviousEvent = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      ownerName: 'Google Chrome',
      title: 'Coding Session - VS Code',
      goalId: goalId,
      categoryId: mockWorkCategoryId,
    };

    (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockPreviousEvent),
    });

    (CategoryModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: mockWorkCategoryId, name: 'Work' }),
    });

    // Act
    const result = await checkActivityHistory(mockUserId, goalId, activeWindow);

    // Assert
    expect(result?.categoryId).toBe(mockWorkCategoryId);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      cachedForGoalId: goalId,
      ownerName: 'Google Chrome',
      title: 'Coding Session - VS Code',
    });
  });

  test('should NOT include goalId for native apps (ownerName only)', async () => {
    // Arrange
    const goalId = 'goal-789';
    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Slack',
      type: 'window',
      title: 'General channel',
      url: null,
    };

    const mockPreviousEvent = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      ownerName: 'Slack',
      categoryId: mockWorkCategoryId,
    };

    (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockPreviousEvent),
    });

    (CategoryModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: mockWorkCategoryId, name: 'Work' }),
    });

    // Act
    const result = await checkActivityHistory(mockUserId, goalId, activeWindow);

    // Assert
    expect(result?.categoryId).toBe(mockWorkCategoryId);
    // Native apps should NOT have goalId in the query
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      ownerName: 'Slack',
    });
  });

  test('should return null when goalId is null for browser activities', async () => {
    // Arrange
    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Google Chrome',
      type: 'browser',
      title: 'New tab',
      url: 'https://example.com',
    };

    // When goalId is null, we should not find any cached history for browsers
    (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });

    // Act
    const result = await checkActivityHistory(mockUserId, null, activeWindow);

    // Assert
    expect(result).toBeNull();
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      cachedForGoalId: null,
      url: 'https://example.com',
    });
  });

  test('should use different cache entries for different goals with same URL', async () => {
    // Arrange
    const goalId1 = 'goal-111';
    const goalId2 = 'goal-222';
    const url = 'https://github.com/features';

    const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
      ownerName: 'Google Chrome',
      type: 'browser',
      title: 'GitHub Features',
      url: url,
    };

    // First goal cached event
    const mockPreviousEvent1 = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      url: url,
      goalId: goalId1,
      categoryId: mockWorkCategoryId,
    };

    // Second goal cached event with different category
    const mockPreviousEvent2 = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      url: url,
      goalId: goalId2,
      categoryId: mockRecruitingCategoryId,
    };

    // Mock for first call (goalId1)
    (ActiveWindowEventModel.findOne as jest.Mock)
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPreviousEvent1),
      })
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPreviousEvent2),
      });

    (CategoryModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: mockWorkCategoryId, name: 'Work' }),
    });

    // Act
    const result1 = await checkActivityHistory(mockUserId, goalId1, activeWindow);
    const result2 = await checkActivityHistory(mockUserId, goalId2, activeWindow);

    // Assert
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      cachedForGoalId: goalId1,
      url: url,
    });
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      cachedForGoalId: goalId2,
      url: url,
    });
    expect(result1?.categoryId).toBe(mockWorkCategoryId);
    expect(result2?.categoryId).toBe(mockRecruitingCategoryId);
  });
});

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
    const result = await checkActivityHistory(mockUserId, activeWindow);

    // Assert
    expect(result?.categoryId).toBe(mockRecruitingCategoryId);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledTimes(1);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
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

    const result = await checkActivityHistory(mockUserId, activeWindow);

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
    const result = await checkActivityHistory(mockUserId, activeWindow);

    // Assert
    expect(result?.categoryId).toBe(mockWorkCategoryId);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledTimes(1);
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
    const result = await checkActivityHistory(mockUserId, activeWindow);

    // Assert
    expect(result?.categoryId).toBe(mockWorkCategoryId);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledTimes(1);
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
    const result = await checkActivityHistory(mockUserId, activeWindow);

    // Assert
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
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
    const result = await checkActivityHistory(mockUserId, activeWindow);

    // Assert
    expect(result).toBeNull();
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledTimes(1);
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
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
    const result = await checkActivityHistory(mockUserId, activeWindow);

    // Assert
    expect(result).toBeNull();
    expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
      userId: mockUserId,
      url: activeWindow.url,
    });
    expect(CategoryModel.findOne).toHaveBeenCalledWith({
      _id: mockRecruitingCategoryId,
      isArchived: false,
    });
  });
});

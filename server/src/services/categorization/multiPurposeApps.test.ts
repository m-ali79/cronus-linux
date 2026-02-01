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
  find: jest.fn(),
  findOne: jest.fn(),
};
const mockUserModel = {
  findById: jest.fn(),
};

// Use mock.module to replace the actual modules with our mocks
mock.module('../../models/activeWindowEvent', () => ({
  ActiveWindowEventModel: mockActiveWindowEventModel,
}));
mock.module('../../models/category', () => ({
  CategoryModel: mockCategoryModel,
}));
mock.module('../../models/user', () => ({
  UserModel: mockUserModel,
}));

// Import services AFTER mocks are set up
const { categorizeActivity } = await import('./categorizationService');
const { ActiveWindowEventModel } = await import('../../models/activeWindowEvent');
const { CategoryModel } = await import('../../models/category');
const { UserModel } = await import('../../models/user');

describe('Multi-Purpose Apps Categorization', () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();
  const mockWorkCategoryId = new mongoose.Types.ObjectId().toString();
  const mockSocialCategoryId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('checkActivityHistory', () => {
    test('should return null for an app in the multi-purpose list, bypassing history', async () => {
      // Arrange
      const multiPurposeAppName = 'Notion';
      const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
        ownerName: multiPurposeAppName,
        type: 'window',
        title: 'Work Project Plan',
        url: null,
      };

      const mockUser = {
        _id: mockUserId,
        multiPurposeApps: [multiPurposeAppName, 'Slack'],
      };
      (UserModel.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      // Act
      const result = await checkActivityHistory(mockUserId, activeWindow);

      // Assert
      expect(result).toBeNull();
      expect(UserModel.findById).toHaveBeenCalledTimes(1);
      expect(ActiveWindowEventModel.findOne).not.toHaveBeenCalled();
    });

    test('should return category from history when app is NOT in multi-purpose list', async () => {
      // Arrange
      const appName = 'Beeper Desktop';
      const activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type'> = {
        ownerName: appName,
        type: 'window',
        title: 'Work related discussion',
        url: null,
      };

      const mockUser = {
        _id: mockUserId,
        multiPurposeApps: ['Slack', 'Notion'], // 'Beeper Desktop' is not here
      };
      (UserModel.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      const mockPreviousEvent = {
        _id: new mongoose.Types.ObjectId().toString(),
        userId: mockUserId,
        ownerName: appName,
        categoryId: mockSocialCategoryId, // Say it was social before
      };
      (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPreviousEvent),
      });

      (CategoryModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: mockSocialCategoryId, name: 'Friends & Social' }),
      });

      // Act
      const result = await checkActivityHistory(mockUserId, activeWindow);

      // Assert
      expect(result?.categoryId).toBe(mockSocialCategoryId);
      expect(UserModel.findById).toHaveBeenCalledTimes(1);
      expect(ActiveWindowEventModel.findOne).toHaveBeenCalledTimes(1);
      expect(ActiveWindowEventModel.findOne).toHaveBeenCalledWith({
        ownerName: 'Beeper Desktop',
        userId: mockUserId,
      });
      expect(CategoryModel.findOne).toHaveBeenCalledWith({
        _id: mockSocialCategoryId,
        isArchived: false,
      });
    });
  });

  describe('categorizeActivity (end-to-end with REAL LLM calls)', () => {
    const appName = 'Beeper Desktop';
    const mockUser = {
      _id: mockUserId,
      multiPurposeApps: [appName, 'Slack'],
      userProjectsAndGoals:
        'I am working on Cronus, an AI time tracking application. My goal is to build a successful software startup.',
    };
    const mockCategories = [
      {
        _id: mockWorkCategoryId,
        name: 'Work',
        userId: mockUserId,
        description: 'Tasks related to my job and the Cronus project.',
      },
      {
        _id: mockSocialCategoryId,
        name: 'Friends & Social',
        userId: mockUserId,
        description: 'Personal conversations and social planning.',
      },
    ];

    beforeEach(() => {
      // Mock history check to return null, forcing LLM path
      (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });
      // Mock User and Category fetches
      (UserModel.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser),
      });
      (CategoryModel.find as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockCategories),
      });
    });

    test('should categorize work-related chat in a multi-purpose app as "Work"', async () => {
      // Arrange
      const workContent =
        'Arne Strickmann * Was ist deine Vision? Kronos = das intelligenteste, kontextbewussteste, passive Timetracking-Tool für Wissensarbeiter. Ein Tool, das dich (1) nicht nervt, (2) echte Einsichten gibt, (3) dir hilft, besser zu arbeiten - und das ganze mit Al-Unterbau.';
      const activeWindow: Pick<
        ActiveWindowDetails,
        'ownerName' | 'title' | 'content' | 'type' | 'browser'
      > = {
        ownerName: appName,
        type: 'window',
        title: 'Beeper',
        content: workContent,
        browser: null,
      };

      // Act
      const result = await categorizeActivity(mockUserId, activeWindow);

      // Assert
      const receivedCategory = mockCategories.find((c) => c._id === result.categoryId);
      expect(receivedCategory?.name).toBe('Work');
    }, 30000);

    test('should categorize social chat in a multi-purpose app as "Friends & Social"', async () => {
      // Arrange
      const socialContent =
        "Moritz, you got any plans for July 4? Me and some friends were thinking of going to Santa Cruz beach Know it's a bit out of the way for you, but if you can make it to SJ via bart or something, we can give you a ride from there";
      const activeWindow: Pick<
        ActiveWindowDetails,
        'ownerName' | 'title' | 'content' | 'type' | 'browser'
      > = {
        ownerName: appName,
        type: 'window',
        title: 'Beeper',
        content: socialContent,
        browser: null,
      };

      // Act
      const result = await categorizeActivity(mockUserId, activeWindow);

      // Assert
      const receivedCategory = mockCategories.find((c) => c._id === result.categoryId);
      expect(receivedCategory?.name).toBe('Friends & Social');
    }, 30000);
  });
});

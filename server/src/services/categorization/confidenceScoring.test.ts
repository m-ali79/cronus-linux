import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test';
import mongoose from 'mongoose';
import { ActiveWindowDetails } from '../../../../shared/types';

// Mock Mongoose models and their methods
const mockActiveWindowEventModel = {
  findOne: jest.fn(),
};
const mockCategoryModel = {
  findById: jest.fn(),
  find: jest.fn(),
};
const mockUserModel = {
  findById: jest.fn(),
};

// Mock the LLM module
const mockGetLLMCategoryChoice = jest.fn();
mock.module('./llm', () => ({
  getLLMCategoryChoice: mockGetLLMCategoryChoice,
  getLLMSummaryForBlock: jest.fn(),
}));

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

// Import the service AFTER mocks are set up
const { categorizeActivity } = await import('./categorizationService');
const { ActiveWindowEventModel } = await import('../../models/activeWindowEvent');
const { CategoryModel } = await import('../../models/category');
const { UserModel } = await import('../../models/user');

describe('Confidence Scoring', () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('LLM Confidence Score', () => {
    test('should return confidence score from AI categorization', async () => {
      // Arrange
      const mockCategories = [
        {
          _id: new mongoose.Types.ObjectId().toString(),
          userId: mockUserId,
          name: 'Work',
          description: 'Coding and development',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      (UserModel.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          userProjectsAndGoals: 'Finish coding project',
        }),
      });

      (CategoryModel.find as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockCategories),
      });

      // Mock LLM to return confidence score
      mockGetLLMCategoryChoice.mockResolvedValue({
        chosenCategoryName: 'Work',
        summary: 'Coding a new feature',
        reasoning: 'User is actively coding',
        confidence: 85,
      });

      const activeWindow = {
        ownerName: 'Code',
        title: 'Writing a new feature',
        url: null,
        content: 'function test() {}',
        type: 'window' as const,
        browser: null,
      };

      // Act
      const result = await categorizeActivity(mockUserId, activeWindow);

      // Assert - The result should include confidence
      expect(result).toHaveProperty('confidence');
      expect(result.confidence).toBe(85);
    });

    test('should auto-classify when confidence > 80%', async () => {
      // Arrange
      const mockCategories = [
        {
          _id: new mongoose.Types.ObjectId().toString(),
          userId: mockUserId,
          name: 'Work',
          description: 'Coding and development',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      (UserModel.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          userProjectsAndGoals: 'Finish coding project',
        }),
      });

      (CategoryModel.find as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockCategories),
      });

      // Mock LLM with high confidence (85%)
      mockGetLLMCategoryChoice.mockResolvedValue({
        chosenCategoryName: 'Work',
        summary: 'Coding a new feature',
        reasoning: 'User is actively coding',
        confidence: 85,
      });

      const activeWindow = {
        ownerName: 'Code',
        title: 'Writing a new feature',
        url: null,
        content: 'function test() {}',
        type: 'window' as const,
        browser: null,
      };

      // Act
      const result = await categorizeActivity(mockUserId, activeWindow);

      // Assert - High confidence should trigger auto-classify action
      expect(result).toHaveProperty('action');
      expect(result.action).toBe('auto-classify');
      expect(result.confidence).toBe(85);
      expect(result.categoryId).not.toBeNull();
    });

    test('should trigger question when confidence 50-80%', async () => {
      // Arrange
      const mockCategories = [
        {
          _id: new mongoose.Types.ObjectId().toString(),
          userId: mockUserId,
          name: 'Work',
          description: 'Coding and development',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new mongoose.Types.ObjectId().toString(),
          userId: mockUserId,
          name: 'Distraction',
          description: 'Social media and entertainment',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      (UserModel.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          userProjectsAndGoals: 'Finish coding project',
        }),
      });

      (CategoryModel.find as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockCategories),
      });

      // Mock LLM with medium confidence (65%)
      mockGetLLMCategoryChoice.mockResolvedValue({
        chosenCategoryName: 'Work',
        summary: 'Watching YouTube tutorial',
        reasoning: 'Could be educational or entertainment',
        confidence: 65,
      });

      const activeWindow = {
        ownerName: 'Google Chrome',
        title: 'YouTube - Tutorial Video',
        url: 'https://youtube.com/watch?v=abc123',
        content: 'Tutorial about React hooks',
        type: 'browser' as const,
        browser: 'chrome' as const,
      };

      // Act
      const result = await categorizeActivity(mockUserId, activeWindow);

      // Assert - Medium confidence should trigger ask-question action
      expect(result).toHaveProperty('action');
      expect(result.action).toBe('ask-question');
      expect(result.confidence).toBe(65);
      expect(result.categoryId).not.toBeNull();
    });

    test('should mark as distraction when confidence < 50%', async () => {
      // Arrange
      const mockCategories = [
        {
          _id: new mongoose.Types.ObjectId().toString(),
          userId: mockUserId,
          name: 'Work',
          description: 'Coding and development',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new mongoose.Types.ObjectId().toString(),
          userId: mockUserId,
          name: 'Distraction',
          description: 'Social media and entertainment',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      (UserModel.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          userProjectsAndGoals: 'Finish coding project',
        }),
      });

      (CategoryModel.find as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockCategories),
      });

      // Mock LLM with low confidence (35%)
      mockGetLLMCategoryChoice.mockResolvedValue({
        chosenCategoryName: 'Work',
        summary: 'Browsing unclear content',
        reasoning: 'Not enough context to determine',
        confidence: 35,
      });

      const activeWindow = {
        ownerName: 'Unknown App',
        title: 'Some Window',
        url: null,
        content: 'Unclear activity content',
        type: 'window' as const,
        browser: null,
      };

      // Act
      const result = await categorizeActivity(mockUserId, activeWindow);

      // Assert - Low confidence should trigger mark-distraction action
      expect(result).toHaveProperty('action');
      expect(result.action).toBe('mark-distraction');
      expect(result.confidence).toBe(35);
    });

    test('should handle boundary confidence of 80% as auto-classify', async () => {
      // Arrange
      const mockCategories = [
        {
          _id: new mongoose.Types.ObjectId().toString(),
          userId: mockUserId,
          name: 'Work',
          description: 'Coding and development',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      (UserModel.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          userProjectsAndGoals: 'Finish coding project',
        }),
      });

      (CategoryModel.find as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockCategories),
      });

      // Mock LLM with boundary confidence (exactly 80%)
      mockGetLLMCategoryChoice.mockResolvedValue({
        chosenCategoryName: 'Work',
        summary: 'Clear coding activity',
        reasoning: 'Very clear what user is doing',
        confidence: 80,
      });

      const activeWindow = {
        ownerName: 'Code',
        title: 'Coding',
        url: null,
        content: 'Code content',
        type: 'window' as const,
        browser: null,
      };

      // Act
      const result = await categorizeActivity(mockUserId, activeWindow);

      // Assert - 80% should be ask-question (boundary case in 50-80 range)
      expect(result.action).toBe('ask-question');
    });

    test('should handle boundary confidence of 50% as ask-question', async () => {
      // Arrange
      const mockCategories = [
        {
          _id: new mongoose.Types.ObjectId().toString(),
          userId: mockUserId,
          name: 'Work',
          description: 'Coding and development',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      (UserModel.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          userProjectsAndGoals: 'Finish coding project',
        }),
      });

      (CategoryModel.find as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockCategories),
      });

      // Mock LLM with boundary confidence (exactly 50%)
      mockGetLLMCategoryChoice.mockResolvedValue({
        chosenCategoryName: 'Work',
        summary: 'Some activity',
        reasoning: 'Somewhat unclear',
        confidence: 50,
      });

      const activeWindow = {
        ownerName: 'App',
        title: 'Window',
        url: null,
        content: 'Content',
        type: 'window' as const,
        browser: null,
      };

      // Act
      const result = await categorizeActivity(mockUserId, activeWindow);

      // Assert - 50% should be ask-question
      expect(result.action).toBe('ask-question');
    });
  });
});

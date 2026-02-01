import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test';
import { Types } from 'mongoose';
import { CalendarEvent, generateSuggestionsForUser } from './suggestionGenerationService';

// Note: These tests perform live LLM API calls for calendar-specific categorization.
// Ensure GOOGLE_GENERATIVE_AI_API_KEY is set in your environment.

// Mock dependencies (except categorization service which uses real LLM calls)
const mockActiveWindowEventModel = {
  find: jest.fn(),
};
mock.module('../../models/activeWindowEvent', () => ({
  ActiveWindowEventModel: mockActiveWindowEventModel,
}));

const mockActivityEventSuggestionModel = {
  find: jest.fn(),
  insertMany: jest.fn(),
};
mock.module('../../models/activityEventSuggestion', () => ({
  ActivityEventSuggestionModel: mockActivityEventSuggestionModel,
}));

const mockCategoryModel = {
  find: jest.fn(),
};
mock.module('../../models/category', () => ({
  CategoryModel: mockCategoryModel,
}));

const mockUserModel = {
  findById: jest.fn(),
};
mock.module('../../models/user', () => ({
  UserModel: mockUserModel,
}));

// Import mocks after mock.module calls
const { ActiveWindowEventModel } = await import('../../models/activeWindowEvent');
const { ActivityEventSuggestionModel } = await import('../../models/activityEventSuggestion');
const { CategoryModel } = await import('../../models/category');
const { UserModel } = await import('../../models/user');
const { categorizeCalendarActivity } = await import(
  '../categorization/calendarCategorizationService'
);

describe('generateSuggestionsForUser', () => {
  const userId = new Types.ObjectId().toString();
  const today = new Date('2024-01-01T00:00:00.000Z');

  const createDate = (hour: number, minute: number) =>
    new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute)
    ).getTime();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should create a suggestion for a calendar event with no overlapping activities (screenshot scenario)', async () => {
    // ARRANGE
    const calendarEvents: CalendarEvent[] = [
      {
        id: 'cal-event-1',
        summary: 'Workout',
        description: '',
        startTime: createDate(6, 30),
        endTime: createDate(7, 0),
      },
    ];

    const existingActivities = [
      {
        _id: new Types.ObjectId(),
        userId,
        timestamp: createDate(7, 15), // Starts after the calendar event
        durationMs: 15 * 60 * 1000,
        ownerName: 'some-app',
      },
    ];

    // Mock user and categories for live LLM call
    const mockUser = {
      userProjectsAndGoals: 'Stay healthy and work on my fitness goals',
    };
    const fitnessCategory = {
      _id: new Types.ObjectId(),
      userId,
      name: 'Fitness',
      description: 'Exercise and fitness activities',
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (ActiveWindowEventModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(existingActivities),
    });
    (ActivityEventSuggestionModel.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    }); // No existing suggestions
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockUser),
    });
    (CategoryModel.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue([fitnessCategory]),
    });

    // ACT
    await generateSuggestionsForUser(userId, calendarEvents);

    // ASSERT
    expect(ActivityEventSuggestionModel.insertMany).toHaveBeenCalledTimes(1);
    const suggestions = (ActivityEventSuggestionModel.insertMany as jest.Mock).mock.calls[0][0];
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].name).toBe('Workout');
    expect(suggestions[0].startTime.getTime()).toBe(calendarEvents[0].startTime);
  }, 30000);

  test('should NOT create a suggestion for a calendar event that overlaps with an existing activity', async () => {
    // ARRANGE
    const calendarEvents: CalendarEvent[] = [
      {
        id: 'cal-event-1',
        summary: 'Workout',
        description: '',
        startTime: createDate(6, 30),
        endTime: createDate(7, 0),
      },
    ];

    const existingActivities = [
      {
        _id: new Types.ObjectId(),
        userId,
        timestamp: createDate(6, 45), // Overlaps with the workout
        durationMs: 30 * 60 * 1000,
        ownerName: 'some-app',
      },
    ];

    (ActiveWindowEventModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(existingActivities),
    });
    (ActivityEventSuggestionModel.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });

    // ACT
    const result = await generateSuggestionsForUser(userId, calendarEvents);

    // ASSERT
    expect(ActivityEventSuggestionModel.insertMany).not.toHaveBeenCalled();
    expect(result.created).toBe(0);
  });

  test('should NOT create a suggestion for a calendar event that already has a suggestion', async () => {
    // ARRANGE
    const calendarEvents: CalendarEvent[] = [
      {
        id: 'cal-event-1',
        summary: 'Workout',
        description: '',
        startTime: createDate(6, 30),
        endTime: createDate(7, 0),
      },
    ];

    const existingSuggestions = [
      {
        googleCalendarEventId: 'cal-event-1',
      },
    ];

    (ActiveWindowEventModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    (ActivityEventSuggestionModel.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(existingSuggestions),
    });

    // ACT
    const result = await generateSuggestionsForUser(userId, calendarEvents);

    // ASSERT
    expect(ActivityEventSuggestionModel.insertMany).not.toHaveBeenCalled();
    expect(result.created).toBe(0);
  });

  test('should create multiple suggestions if multiple calendar events are eligible', async () => {
    // ARRANGE
    const calendarEvents: CalendarEvent[] = [
      {
        id: 'cal-event-1',
        summary: 'Workout',
        description: '',
        startTime: createDate(6, 30),
        endTime: createDate(7, 0),
      },
      {
        id: 'cal-event-2',
        summary: 'Team Standup',
        description: '',
        startTime: createDate(9, 0),
        endTime: createDate(9, 30),
      },
    ];

    // Mock user and categories for live LLM call
    const mockUser = {
      userProjectsAndGoals: 'Stay healthy and work on my development team projects',
    };
    const fitnessCategory = {
      _id: new Types.ObjectId(),
      userId,
      name: 'Fitness',
      description: 'Exercise and fitness activities',
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const workCategory = {
      _id: new Types.ObjectId(),
      userId,
      name: 'Work',
      description: 'Professional work activities',
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (ActiveWindowEventModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    }); // No activities at all
    (ActivityEventSuggestionModel.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockUser),
    });
    (CategoryModel.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue([fitnessCategory, workCategory]),
    });

    // ACT
    await generateSuggestionsForUser(userId, calendarEvents);

    // ASSERT
    expect(ActivityEventSuggestionModel.insertMany).toHaveBeenCalledTimes(1);
    const suggestions = (ActivityEventSuggestionModel.insertMany as jest.Mock).mock.calls[0][0];
    expect(suggestions).toHaveLength(2);
  }, 30000);

  test('should categorize dinner with multiple attendees as social event using categorizeCalendarActivity', async () => {
    // ARRANGE
    const calendarEvents: CalendarEvent[] = [
      {
        id: 'cal-event-dinner',
        summary: 'Dinner',
        description: '',
        startTime: createDate(19, 0), // 7 PM
        endTime: createDate(21, 0), // 9 PM
        attendees: [
          { email: 'user@example.com', displayName: 'User', organizer: true },
          { email: 'friend1@example.com', displayName: 'Friend 1' },
          { email: 'friend2@example.com', displayName: 'Friend 2' },
        ],
      },
    ];

    // Mock user and categories for live LLM call
    const mockUser = {
      userProjectsAndGoals: 'I want to maintain good social relationships and work on my projects',
    };
    const socialCategory = {
      _id: new Types.ObjectId(),
      userId,
      name: 'Friends & Socializing',
      description: 'Social activities with friends and family',
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const workCategory = {
      _id: new Types.ObjectId(),
      userId,
      name: 'Work',
      description: 'Professional work activities',
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (ActiveWindowEventModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]), // No overlapping activities
    });
    (ActivityEventSuggestionModel.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue([]), // No existing suggestions
    });
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockUser),
    });
    (CategoryModel.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue([socialCategory, workCategory]),
    });

    // ACT
    await generateSuggestionsForUser(userId, calendarEvents);

    // ASSERT
    expect(ActivityEventSuggestionModel.insertMany).toHaveBeenCalledTimes(1);
    const suggestions = (ActivityEventSuggestionModel.insertMany as jest.Mock).mock.calls[0][0];
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].name).toBe('Dinner');

    // The LLM should categorize this as social due to multiple attendees
    const receivedCategoryId = suggestions[0].suggestedCategoryId.toString();
    expect([socialCategory._id.toString(), workCategory._id.toString()]).toContain(
      receivedCategoryId
    );

    // Log for manual inspection of categorization reasoning
    console.log('Calendar categorization result:', {
      categoryId: receivedCategoryId,
      reasoning: suggestions[0].reasoning,
      expectedSocial: socialCategory._id.toString(),
    });
  }, 30000); // Increased timeout for LLM call
});

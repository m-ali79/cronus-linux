import {
  shouldAskQuestion,
  buildNotificationContent,
  createQuestioningNotification,
  handleQuestionResponse,
} from './questioningService';

describe('questioningService', () => {
  describe('shouldAskQuestion', () => {
    it('should return false when action is not ask-question', () => {
      expect(shouldAskQuestion(75, 'auto-classify')).toBe(false);
      expect(shouldAskQuestion(75, 'mark-distraction')).toBe(false);
      expect(shouldAskQuestion(75, null)).toBe(false);
    });

    it('should return false when confidence is null', () => {
      expect(shouldAskQuestion(null, 'ask-question')).toBe(false);
    });

    it('should return false when confidence is below 50', () => {
      expect(shouldAskQuestion(30, 'ask-question')).toBe(false);
      expect(shouldAskQuestion(49, 'ask-question')).toBe(false);
    });

    it('should return false when confidence is above 80', () => {
      expect(shouldAskQuestion(81, 'ask-question')).toBe(false);
      expect(shouldAskQuestion(95, 'ask-question')).toBe(false);
    });

    it('should return true when confidence is between 50 and 80', () => {
      expect(shouldAskQuestion(50, 'ask-question')).toBe(true);
      expect(shouldAskQuestion(65, 'ask-question')).toBe(true);
      expect(shouldAskQuestion(80, 'ask-question')).toBe(true);
    });
  });

  describe('buildNotificationContent', () => {
    it('should build notification content with site and title', () => {
      const context = {
        userId: 'user123',
        site: 'youtube.com',
        title: 'React Tutorial',
        goal: 'Build React app',
        confidence: 65,
      };

      const result = buildNotificationContent(context);

      expect(result.title).toBe('Is this work?');
      expect(result.body).toContain('youtube.com');
      expect(result.body).toContain('React Tutorial');
      expect(result.body).toContain('Build React app');
      expect(result.actions).toHaveLength(2);
      expect(result.actions[0].text).toBe('Work');
      expect(result.actions[0].id).toBe('work');
      expect(result.actions[1].text).toBe('Distraction');
      expect(result.actions[1].id).toBe('distraction');
    });

    it('should use title as fallback when no site', () => {
      const context = {
        userId: 'user123',
        title: 'VS Code',
        goal: 'coding',
        confidence: 65,
      };

      const result = buildNotificationContent(context);

      expect(result.body).toContain('VS Code');
    });
  });

  describe('createQuestioningNotification', () => {
    it('should create a notification with unique ID', async () => {
      const context = {
        userId: 'user123',
        site: 'youtube.com',
        title: 'Test video',
        goal: 'test goal',
        confidence: 65,
      };

      const result = await createQuestioningNotification(context);

      expect(result.notificationId).toMatch(/^question-/);
      expect(result.context).toEqual(context);
    });
  });

  describe('handleQuestionResponse', () => {
    it('should return null for unknown notification ID', async () => {
      const result = await handleQuestionResponse('unknown-id', 'work');
      expect(result).toBe(null);
    });

    it('should return timeout action for timeout response', async () => {
      const context = {
        userId: 'user123',
        site: 'youtube.com',
        title: 'Test',
        goal: 'test',
        confidence: 65,
      };

      const { notificationId } = await createQuestioningNotification(context);
      const result = await handleQuestionResponse(notificationId, 'timeout');

      expect(result?.action).toBe('timeout');
      expect(result?.categoryId).toBeUndefined();
    });
  });
});

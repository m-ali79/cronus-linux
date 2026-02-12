import { TRPCError } from '@trpc/server';
import mongoose, { FilterQuery } from 'mongoose';
import { categorizeActivity } from 'src/services/categorization/categorizationService';
import { checkActivityHistory } from 'src/services/categorization/history';
import { z } from 'zod';
import { ActiveWindowEvent } from '../../../shared/types';
import { safeVerifyToken, safeVerifyTokenWithVersionTracking } from '../lib/authUtils';
import { ActiveWindowEventModel } from '../models/activeWindowEvent';
import { UserModel } from '../models/user';
import { updateEventCategoryInDateRange as updateEventCategoryInDateRangeService } from '../services/move/updateEventCategoryInDateRange';
import { publicProcedure, router } from '../trpc';

// Zod schema for input validation
const activeWindowEventInputSchema = z.object({
  token: z.string(),
  windowId: z.number().optional(),
  ownerName: z.string(),
  type: z.enum(['window', 'browser', 'system']),
  browser: z.enum(['chrome', 'safari', 'arc', 'firefox', 'brave', 'helium']).optional().nullable(),
  title: z.string(),
  url: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  timestamp: z.number(),
  screenshotS3Url: z.string().optional().nullable(),
});

export const activeWindowEventsRouter = router({
  create: publicProcedure.input(activeWindowEventInputSchema).mutation(async ({ input, ctx }) => {
    // console.log('[Router] Received create event:', input);
    const decodedToken = safeVerifyTokenWithVersionTracking(input.token, ctx.userAgent);
    const userId = decodedToken.userId;

    // Destructure relevant details from input for categorization
    const { windowId, ownerName, type, browser, title, url, content, timestamp, screenshotS3Url } =
      input;
    // durationMs isn't known at ingestion-time; the categorizer only needs context.
    const activityDetails = { ownerName, type, browser, title, url, content, durationMs: 0 };

    // TODO: bring back informative title
    // We sometimes send 20-40+ simultaneous activeWindowEvents.create calls so this can lead to too many concurrent LLM calls
    // With 30 creates × 2-3 LLM calls each = 60-90 concurrent LLM API calls, plus database operations
    // We should move this to a cron job or similar that runs only if a better title is required from EventSegment.tsx
    // DO NOT REMOVE THIS CODE
    // let generatedTitle: string | undefined = undefined;
    // try {
    //   const shouldGenerateTitle =
    //     type === 'window' &&
    //     (!title ||
    //       title.trim() === '' ||
    //       title === 'Untitled' ||
    //       title === ownerName ||
    //       title.length < 3);
    //   if (shouldGenerateTitle) {
    //     // Evaluate if the title is informative
    //     const informative = await isTitleInformative(title || '');
    //     // If not, generate a summary
    //     if (!informative) {
    //       generatedTitle = await generateActivitySummary(activityDetails);
    //       console.log('[Router] Final generated title:', generatedTitle);
    //     }
    //   }
    // } catch (err) {
    //   console.error('LLM title evaluation/generation failed:', err);
    // }

    const categorizationResult = await categorizeActivity(userId, activityDetails);
    const categoryId = categorizationResult.categoryId;
    const categoryReasoning = categorizationResult.categoryReasoning;
    const llmSummary = categorizationResult.llmSummary;

    // Fetch user's current goal for goal-based caching
    const user = await UserModel.findById(userId).select('currentGoalId').lean();
    const goalId = user?.currentGoalId ?? null;

    const eventToSave: ActiveWindowEvent = {
      userId,
      windowId,
      ownerName,
      type,
      browser,
      title,
      url,
      content,
      timestamp,
      screenshotS3Url,
      categoryId, // Add categoryId from categorization service
      categoryReasoning,
      llmSummary,
      lastCategorizationAt: categoryId ? new Date() : undefined,
      cachedForGoalId: goalId, // Store which goal this event is cached for
    };

    try {
      const savedEvent = await ActiveWindowEventModel.create(eventToSave);
      return savedEvent.toObject() as ActiveWindowEvent;
    } catch (error) {
      console.error('Error saving active window event:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to save active window event',
      });
    }
  }),

  checkCategorization: publicProcedure
    .input(
      z.object({
        token: z.string(),
        ownerName: z.string(),
        type: z.enum(['window', 'browser', 'system']),
        title: z.string(),
        url: z.string().optional().nullable(),
      })
    )
    .query(async ({ input }) => {
      try {
        const decoded = safeVerifyToken(input.token);
        const userId = decoded.userId;

        // Fetch user's current goal for goal-based caching
        const user = await UserModel.findById(userId).select('currentGoalId').lean();
        const goalId = user?.currentGoalId ?? null;

        console.log(`[Cache] Checking with goalId: ${goalId}`);

        const historyResult = await checkActivityHistory(userId, goalId, {
          ownerName: input.ownerName,
          type: input.type,
          title: input.title,
          url: input.url ?? undefined,
        });
        if (historyResult) {
          return {
            isCategorized: true,
            categoryId: historyResult.categoryId,
            categoryReasoning: historyResult.categoryReasoning ?? undefined,
            llmSummary: historyResult.llmSummary ?? undefined,
            content: historyResult.content ?? undefined,
          };
        }
        return { isCategorized: false };
      } catch {
        return { isCategorized: false };
      }
    }),

  getEventsForDateRange: publicProcedure
    .input(z.object({ token: z.string(), startDateMs: z.number(), endDateMs: z.number() }))
    .query(async ({ input }) => {
      try {
        const decodedToken = safeVerifyToken(input.token);
        const userId = decodedToken.userId;

        const { startDateMs, endDateMs } = input;

        // log the query inputs
        // console.log('getEventsForDateRange', {
        //   userId,
        //   startDateMs,
        //   endDateMs,
        // });

        if (startDateMs >= endDateMs) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'startDateMs must be before endDateMs.',
          });
        }

        const events = await ActiveWindowEventModel.find({
          userId: userId,
          timestamp: {
            $gte: startDateMs,
            $lt: endDateMs,
          },
        })
          .select('-content') // Explicitly exclude the large 'content' field
          .sort({ timestamp: -1 }) // Changed to descending (newest first)
          .lean();

        return events.map((event) => ({
          ...event,
          _id: event._id.toString(),
        })) as ActiveWindowEvent[];
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('Error fetching events for date range:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch events for date range',
        });
      }
    }),

  getLatestEvent: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      try {
        const decodedToken = safeVerifyToken(input.token);
        const userId = decodedToken.userId;

        // console.log('getLatestEvent', {
        //   userId,
        // });

        const latestEvent = await ActiveWindowEventModel.findOne({
          userId: userId,
        })
          .sort({ timestamp: -1 })
          .select('-content')
          .limit(1)
          .lean();

        if (!latestEvent) {
          return null; // Or throw a TRPCError if an event is always expected
        }
        return { ...latestEvent, _id: latestEvent._id.toString() } as ActiveWindowEvent;
      } catch (error) {
        console.error('Error fetching latest event:', error);
        // Handle token verification errors specifically if verifyToken throws them
        if (
          error instanceof Error &&
          (error.message.includes('jwt') || error.message.includes('token'))
        ) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired token.',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch latest event',
        });
      }
    }),

  createManual: publicProcedure
    .input(
      z.object({
        token: z.string(),
        name: z.string(),
        categoryId: z.string().optional(),
        startTime: z.number(),
        endTime: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const decodedToken = safeVerifyToken(input.token);
      const userId = decodedToken.userId;

      const { name, categoryId, startTime, endTime } = input;

      const eventToSave: ActiveWindowEvent = {
        userId,
        ownerName: name,
        title: name,
        type: 'manual',
        timestamp: startTime,
        windowId: 0,
        browser: null,
        url: '',
        content: '',
        screenshotS3Url: '',
        categoryId,
        durationMs: endTime - startTime,
      };

      try {
        const newEvent = new ActiveWindowEventModel(eventToSave);
        await newEvent.save();
        return newEvent.toObject() as ActiveWindowEvent;
      } catch (error) {
        console.error('Error saving manual window event:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save manual window event',
        });
      }
    }),

  updateManual: publicProcedure
    .input(
      z.object({
        token: z.string(),
        id: z.string(),
        name: z.string().optional(),
        categoryId: z.string().optional(),
        startTime: z.number().optional(),
        durationMs: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { token, id, name, categoryId, startTime, durationMs } = input;
      safeVerifyToken(token);

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid event ID format: ${id}`,
        });
      }

      const updateData: any = {};
      if (name) {
        updateData.name = name;
        updateData.ownerName = name;
        updateData.title = name;
      }
      if (categoryId) updateData.categoryId = categoryId;
      if (startTime) updateData.timestamp = startTime;
      if (durationMs) updateData.durationMs = durationMs;

      try {
        const updatedEvent = await ActiveWindowEventModel.findByIdAndUpdate(id, updateData, {
          new: true,
        });
        if (!updatedEvent) {
          console.error(`Attempted to update a manual event that was not found. ID: ${id}`);
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        return updatedEvent.toObject() as ActiveWindowEvent;
      } catch (error) {
        console.error('Error updating manual window event:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update manual window event',
        });
      }
    }),

  getManualEntryHistory: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const decodedToken = safeVerifyToken(input.token);
      const userId = decodedToken.userId;

      try {
        const history = await ActiveWindowEventModel.aggregate([
          {
            $match: {
              userId,
              type: 'manual',
              title: { $nin: [null, ''] },
            },
          },
          {
            $group: {
              _id: {
                titleLower: { $toLower: '$title' },
                categoryId: '$categoryId',
              },
              title: { $first: '$title' },
              lastUsed: { $max: '$timestamp' },
            },
          },
          {
            $sort: {
              lastUsed: -1,
            },
          },
          {
            $limit: 50,
          },
          {
            $addFields: {
              categoryIdObjectId: {
                $cond: {
                  if: { $ne: ['$_id.categoryId', null] },
                  then: { $toObjectId: '$_id.categoryId' },
                  else: null,
                },
              },
            },
          },
          {
            $lookup: {
              from: 'categories',
              localField: 'categoryIdObjectId',
              foreignField: '_id',
              as: 'categoryDetails',
            },
          },
          {
            $unwind: {
              path: '$categoryDetails',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              _id: 0,
              title: '$title',
              categoryId: '$_id.categoryId',
              categoryName: '$categoryDetails.name',
              categoryColor: '$categoryDetails.color',
            },
          },
        ]).allowDiskUse(true);
        return history;
      } catch (error) {
        console.error('Error fetching manual entry history:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch manual entry history',
        });
      }
    }),

  deleteManual: publicProcedure
    .input(z.object({ token: z.string(), id: z.string() }))
    .mutation(async ({ input }) => {
      const { token, id } = input;
      safeVerifyToken(token);

      try {
        const deletedEvent = await ActiveWindowEventModel.findByIdAndDelete(id);
        if (!deletedEvent) {
          console.error(`Attempted to delete a manual event that was not found. ID: ${id}`);
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        return { success: true };
      } catch (error) {
        console.error('Error deleting manual window event:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete manual window event',
        });
      }
    }),

  updateEventsCategoryInDateRange: publicProcedure
    .input(
      z.object({
        token: z.string(),
        startDateMs: z.number(),
        endDateMs: z.number(),
        activityIdentifier: z.string(), // ownerName for app, domain for website
        itemType: z.enum(['app', 'website']),
        newCategoryId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
          message: 'Invalid Object ID for newCategoryId',
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { startDateMs, endDateMs, activityIdentifier, itemType, newCategoryId, token } = input;
      const decodedToken = safeVerifyTokenWithVersionTracking(token, ctx.userAgent);
      const userId = decodedToken.userId;

      try {
        const result = await updateEventCategoryInDateRangeService({
          userId,
          startDateMs,
          endDateMs,
          activityIdentifier,
          itemType,
          newCategoryId,
        });

        console.log(
          `[EventsRouter] Updated ${result.updatedCount} events for user ${userId} to category ${newCategoryId} for identifier "${activityIdentifier}"`
        );

        return result;
      } catch (error) {
        console.error('[EventsRouter] Error updating event categories:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update event categories in date range.',
        });
      }
    }),

  deleteEventsInDateRange: publicProcedure
    .input(
      z.object({
        token: z.string(),
        startDateMs: z.number(),
        endDateMs: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { token, startDateMs, endDateMs } = input;
      const decodedToken = safeVerifyTokenWithVersionTracking(token, ctx.userAgent);
      const userId = decodedToken.userId;

      const filter: FilterQuery<ActiveWindowEvent> = {
        userId,
        $and: [
          { timestamp: { $lt: endDateMs } },
          {
            $expr: {
              $gt: [{ $add: ['$timestamp', { $ifNull: ['$durationMs', 0] }] }, startDateMs],
            },
          },
        ],
      };

      console.log('filter in deleteEventsInDateRange', JSON.stringify(filter, null, 2));

      try {
        const result = await ActiveWindowEventModel.deleteMany(filter);

        console.log(`[EventsRouter] Hard-deleted ${result.deletedCount} events for user ${userId}`);
        return {
          success: true,
          deletedCount: result.deletedCount,
        };
      } catch (error) {
        console.error('[EventsRouter] Error hard-deleting events:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete events in date range.',
        });
      }
    }),

  deleteEventsByIds: publicProcedure
    .input(
      z.object({
        token: z.string(),
        eventIds: z.array(z.string()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { token, eventIds } = input;
      const decodedToken = safeVerifyTokenWithVersionTracking(token, ctx.userAgent);
      const userId = decodedToken.userId;

      if (!eventIds || eventIds.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No event IDs provided.',
        });
      }

      // Validate all IDs are valid ObjectIds
      const validIds = eventIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (validIds.length !== eventIds.length) {
        console.warn(
          `[EventsRouter] Some invalid event IDs provided: ${eventIds.filter((id) => !mongoose.Types.ObjectId.isValid(id))}`
        );
      }

      if (validIds.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No valid event IDs provided.',
        });
      }

      const filter: FilterQuery<ActiveWindowEvent> = {
        userId,
        _id: { $in: validIds.map((id) => new mongoose.Types.ObjectId(id)) },
      };

      console.log(
        `[EventsRouter] deleteEventsByIds filter: userId=${userId}, eventIds=[${validIds.join(', ')}]`
      );

      try {
        const result = await ActiveWindowEventModel.deleteMany(filter);

        console.log(
          `[EventsRouter] Hard-deleted ${result.deletedCount} events by IDs for user ${userId}`
        );
        return {
          success: true,
          deletedCount: result.deletedCount,
          requestedCount: validIds.length,
        };
      } catch (error) {
        console.error('[EventsRouter] Error hard-deleting events by IDs:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete events by IDs.',
        });
      }
    }),

  // keep this for legacy clients
  deleteActivitiesByIdentifier: publicProcedure
    .input(
      z.object({
        token: z.string(),
        startDateMs: z.number(),
        endDateMs: z.number(),
        identifier: z.string(),
        itemType: z.enum(['app', 'website']),
        isUrl: z.boolean().optional(),
        categoryId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { token, startDateMs, endDateMs, identifier, itemType, isUrl, categoryId } = input;
      const decodedToken = safeVerifyTokenWithVersionTracking(token, ctx.userAgent);
      const userId = decodedToken.userId;

      const filter: FilterQuery<ActiveWindowEvent> = {
        userId,
        timestamp: {
          $gte: startDateMs,
          $lt: endDateMs,
        },
      };

      if (categoryId === 'uncategorized') {
        filter.categoryId = { $in: [null, undefined] };
      } else {
        filter.categoryId = new mongoose.Types.ObjectId(categoryId);
      }

      if (itemType === 'app') {
        filter.ownerName = identifier;
      } else if (itemType === 'website') {
        if (isUrl) {
          filter.url = identifier;
        } else {
          filter.title = identifier;
        }
      }

      try {
        const result = await ActiveWindowEventModel.deleteMany(filter);

        console.log(
          `[EventsRouter] Hard-deleted ${result.deletedCount} events for user ${userId} with identifier ${identifier}`
        );
        return {
          success: true,
          deletedCount: result.deletedCount,
        };
      } catch (error) {
        console.error('[EventsRouter] Error hard-deleting events by identifier:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete events by identifier in date range.',
        });
      }
    }),
});

import { TRPCError } from '@trpc/server';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { CategoryModel } from '../models/category';
import { getEmojiForCategory } from '../services/categorization/llm';

import { safeVerifyToken } from '../lib/authUtils';
import { getLLMCategorySuggestion } from '../services/categorization/categoryGeneration';
import { publicProcedure, router } from '../trpc';
const objectIdToStringSchema = z
  .custom<Types.ObjectId | string>((val) => Types.ObjectId.isValid(val as any))
  .transform((val) => val.toString());

const categorySchema = z.object({
  _id: objectIdToStringSchema,
  userId: objectIdToStringSchema,
  name: z.string(),
  description: z.string().optional(),
  color: z.string(),
  emoji: z.string().optional(),
  isProductive: z.boolean(),
  isDefault: z.boolean().default(false),
  isArchived: z.boolean().optional().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const categoryRouter = router({
  createCategory: publicProcedure
    .input(
      z.object({
        token: z.string(),
        name: z.string().min(1, 'Name is required'),
        description: z.string().optional(),
        color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format (e.g., #FF5733)'),
        emoji: z.string().optional(),
        isProductive: z.boolean(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const decodedToken = safeVerifyToken(input.token);
      const userId = decodedToken.userId;
      const { name, description, color, emoji, isProductive, isDefault = false } = input;

      const existingCategory = await CategoryModel.findOne({ userId, name });
      if (existingCategory) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A category with this name already exists.',
        });
      }

      const category = new CategoryModel({
        userId,
        name,
        description,
        color,
        emoji,
        isProductive,
        isDefault,
      });
      await category.save();
      return category.toJSON();
    }),

  createCategories: publicProcedure
    .input(
      z.object({
        token: z.string(),
        categories: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            color: z.string(),
            isProductive: z.boolean(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const decodedToken = safeVerifyToken(input.token);
      const userId = decodedToken.userId;
      const { categories } = input;

      const categoryDocs = categories.map((category) => ({
        ...category,
        userId,
      }));

      await CategoryModel.insertMany(categoryDocs);
      return { success: true };
    }),

  getCategories: publicProcedure
    .input(z.object({ token: z.string() }))
    .output(z.array(categorySchema))
    .query(async ({ input }) => {
      const decodedToken = safeVerifyToken(input.token);
      const userId = decodedToken.userId;
      let categories = await CategoryModel.find({ userId }).sort({ createdAt: -1 });

      // currently all categories will always have an emoji
      // TODO it's set to optional in some places. We need to change that but it only became sort of mandatory on 20th July 2025
      const categoriesToUpdate = categories.filter((cat) => !cat.emoji || cat.emoji.trim() === '');
      if (categoriesToUpdate.length > 0) {
        await Promise.all(
          categoriesToUpdate.map(async (cat) => {
            const emoji = await getEmojiForCategory(cat.name, cat.description);
            if (emoji) {
              cat.emoji = emoji;
              try {
                await cat.save();
              } catch (err) {
                console.error('Failed to update category with emoji:', cat.name, err);
              }
            }
          })
        );
        // Re-fetch categories to ensure up-to-date
        categories = await CategoryModel.find({ userId }).sort({ createdAt: -1 });
      }
      return categories.map((cat) => cat.toJSON());
    }),

  hasCategories: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
    const decodedToken = safeVerifyToken(input.token);
    const userId = decodedToken.userId;
    const count = await CategoryModel.countDocuments({ userId });
    return count > 0;
  }),

  updateCategory: publicProcedure
    .input(
      z.object({
        token: z.string(),
        id: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
          message: 'Invalid Object ID',
        }),
        name: z.string().min(1, 'Name is required').optional(),
        description: z.string().optional(),
        color: z
          .string()
          .regex(/^#[0-9A-F]{6}$/i, 'Invalid color format')
          .optional(),
        emoji: z.string().optional(),
        isProductive: z.boolean().optional(),
        isArchived: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const decodedToken = safeVerifyToken(input.token);
      const userId = decodedToken.userId;
      const { id, ...updateData } = input;

      const { token, ...restOfUpdateData } = updateData as any;

      const category = await CategoryModel.findOne({ _id: id, userId });

      if (!category) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
      }

      if (restOfUpdateData.name && restOfUpdateData.name !== category.name) {
        const existingCategory = await CategoryModel.findOne({
          userId,
          name: restOfUpdateData.name,
          _id: { $ne: id },
        });
        if (existingCategory) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Another category with this name already exists.',
          });
        }
      }

      Object.assign(category, restOfUpdateData);
      await category.save();
      return category.toJSON();
    }),

  deleteCategory: publicProcedure
    .input(
      z.object({
        token: z.string(),
        id: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
          message: 'Invalid Object ID',
        }),
      })
    )
    .mutation(async ({ input }) => {
      const decodedToken = safeVerifyToken(input.token);
      const userId = decodedToken.userId;
      const { id } = input;

      const category = await CategoryModel.findOneAndDelete({ _id: id, userId });

      if (!category) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
      }
      return category.toJSON();
    }),

  generateAiCategories: publicProcedure
    .input(
      z.object({
        token: z.string(),
        goals: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      safeVerifyToken(input.token);
      const { goals } = input;

      const suggestedCategories = await getLLMCategorySuggestion(goals);

      return suggestedCategories;
    }),

  deleteRecentlyCreatedCategories: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const decodedToken = safeVerifyToken(input.token);
      const userId = decodedToken.userId;

      // one day ago
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      await CategoryModel.deleteMany({
        userId,
        createdAt: { $gte: oneDayAgo },
        isDefault: { $ne: true },
      });

      return { success: true };
    }),

  getCategoryById: publicProcedure
    .input(
      z.object({
        token: z.string(),
        categoryId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
          message: 'Invalid Object ID for categoryId',
        }),
      })
    )
    .query(async ({ input }) => {
      safeVerifyToken(input.token);
      const { categoryId } = input;

      const category = await CategoryModel.findById(categoryId);

      if (!category) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found',
        });
      }
      return category.toJSON();
    }),
});

export type CategoryRouter = typeof categoryRouter;

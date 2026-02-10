import mongoose, { Document, Schema } from 'mongoose';
import { ActiveWindowEvent } from '../../../shared/types';

export interface IActiveWindowEvent extends Omit<ActiveWindowEvent, '_id'>, Document {
  categoryId?: string;
  categoryReasoning?: string;
  lastCategorizationAt?: Date;
  oldCategoryId?: string;
  oldCategoryReasoning?: string;
  llmSummary?: string;
  oldLlmSummary?: string;
}

const activeWindowEventSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    windowId: { type: Number, required: false }, // Made optional for system events
    ownerName: { type: String, required: true },
    type: { type: String, required: true, enum: ['window', 'browser', 'system', 'manual'] },
    browser: {
      type: String,
      enum: ['chrome', 'safari', 'arc', 'firefox', 'brave', 'helium', null],
    },
    title: { type: String, required: false },
    url: { type: String },
    content: { type: String },
    goalId: { type: String, required: false, index: true }, // For goal-based caching of browser activities
    categoryId: { type: String, required: false, index: true },
    categoryReasoning: { type: String, required: false },
    llmSummary: { type: String, required: false },
    generatedTitle: { type: String, required: false },
    timestamp: { type: Number, required: true, default: Date.now, index: true },
    screenshotS3Url: { type: String, required: false },
    durationMs: { type: Number, required: false },
    captureReason: {
      type: String,
      enum: ['app_switch', 'periodic_backup', 'system_sleep', 'system_wake', null],
    },
    lastCategorizationAt: { type: Date, required: false },
    oldCategoryId: { type: String, required: false },
    oldCategoryReasoning: { type: String, required: false },
    oldLlmSummary: { type: String, required: false },
  },
  { timestamps: true }
);

// Compound index for efficient querying by userId and timestamp
activeWindowEventSchema.index({ userId: 1, timestamp: -1 });
activeWindowEventSchema.index({ userId: 1, timestamp: 1 });
activeWindowEventSchema.index({ userId: 1, type: 1, title: 1, lastUsed: -1 });
// Index for goal-based cache invalidation
activeWindowEventSchema.index({ userId: 1, type: 1, goalId: 1 });

// Check if model already exists to prevent OverwriteModelError in production
let ActiveWindowEventModel: mongoose.Model<IActiveWindowEvent>;
try {
  ActiveWindowEventModel = mongoose.model<IActiveWindowEvent>('ActiveWindowEvent');
} catch {
  ActiveWindowEventModel = mongoose.model<IActiveWindowEvent>(
    'ActiveWindowEvent',
    activeWindowEventSchema
  );
}

export { ActiveWindowEventModel };

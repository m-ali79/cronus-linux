import { TRPCError } from '@trpc/server';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user';
import { extractClientVersion } from './versionUtils';

const AUTH_DISABLED = process.env.DISABLE_AUTH === 'true';
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || '69778eb96f7e7ac62aa1aceb';

function verifyToken(token: string): { userId: string } {
  if (AUTH_DISABLED) {
    console.warn('🔓 AUTH DISABLED - Bypassing token verification, using default user');
    return { userId: DEFAULT_USER_ID };
  }

  try {
    // console.log('Server time check for JWT verification:', new Date().toISOString());
    // console.log('Token:', token);

    const decoded = jwt.verify(token, process.env.AUTH_SECRET || 'fallback-secret') as {
      userId: string;
    };
    return decoded;
  } catch (error) {
    console.error('Token verification error:', error);

    // Preserve the original JWT error information for better handling
    if (error instanceof jwt.TokenExpiredError) {
      const authError = new Error('Token has expired');
      authError.name = 'TokenExpiredError';
      // @ts-ignore - Adding custom property to Error
      authError.code = 'UNAUTHORIZED';
      throw authError;
    } else if (error instanceof jwt.JsonWebTokenError) {
      const authError = new Error('Invalid or malformed token');
      authError.name = 'JsonWebTokenError';
      // @ts-ignore - Adding custom property to Error
      authError.code = 'UNAUTHORIZED';
      throw authError;
    } else if (error instanceof jwt.NotBeforeError) {
      const authError = new Error('Token not active yet');
      authError.name = 'NotBeforeError';
      // @ts-ignore - Adding custom property to Error
      authError.code = 'UNAUTHORIZED';
      throw authError;
    } else {
      // Generic JWT error
      const authError = new Error('Invalid or expired token');
      authError.name = 'TokenError';
      // @ts-ignore - Adding custom property to Error
      authError.code = 'UNAUTHORIZED';
      throw authError;
    }
  }
}

// Helper function to safely verify token and convert errors to TRPCError
export function safeVerifyToken(token: string): { userId: string } {
  if (AUTH_DISABLED) {
    console.warn('🔓 AUTH DISABLED - Bypassing safeVerifyToken, using default user');
    return { userId: DEFAULT_USER_ID };
  }

  try {
    return verifyToken(token);
  } catch (error) {
    console.error('Token verification error:', error);
    // Handle token verification errors specifically
    if (
      error instanceof Error &&
      (error.message.includes('jwt') ||
        error.message.includes('token') ||
        error.message.includes('expired') ||
        error.name === 'TokenExpiredError' ||
        error.name === 'JsonWebTokenError' ||
        (error as any).code === 'UNAUTHORIZED')
    ) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token.',
      });
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Authentication error.',
    });
  }
}

/**
 * Update user's client version if it has changed
 * Call this from API endpoints to track the latest client version
 */
export async function updateUserClientVersion(userId: string, userAgent?: string): Promise<void> {
  if (!userAgent) return;

  const clientVersion = extractClientVersion(userAgent);
  if (!clientVersion) return;

  try {
    const currentUser = await UserModel.findById(userId)
      .select('clientVersion hasCompletedOnboarding')
      .lean();
    if (!currentUser) {
      return;
    }

    if (currentUser.clientVersion === clientVersion) {
      return;
    }

    const result = await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          clientVersion: clientVersion,
          clientVersionLastUpdated: new Date(),
        },
      }
    );

    if (result.modifiedCount > 0) {
      const updatedUser = await UserModel.findById(userId).select('hasCompletedOnboarding').lean();
      if (
        updatedUser &&
        currentUser.hasCompletedOnboarding !== updatedUser.hasCompletedOnboarding
      ) {
        console.error(
          `🚨 [updateUserClientVersion] CRITICAL: hasCompletedOnboarding changed unexpectedly for user ${userId}! Before: ${currentUser.hasCompletedOnboarding}, After: ${updatedUser.hasCompletedOnboarding}`
        );
      }
    }
  } catch (error) {
    console.error(
      `[updateUserClientVersion] Failed to update client version for user ${userId}:`,
      error
    );
  }
}

/**
 * Enhanced version of safeVerifyToken that also tracks client version
 * Use this in high-traffic endpoints for automatic version tracking
 */
export function safeVerifyTokenWithVersionTracking(
  token: string,
  userAgent?: string
): { userId: string } {
  if (AUTH_DISABLED) {
    console.warn(
      '🔓 AUTH DISABLED - Bypassing safeVerifyTokenWithVersionTracking, using default user'
    );
    return { userId: DEFAULT_USER_ID };
  }

  const result = safeVerifyToken(token);

  // Track version asynchronously - don't block the request
  if (userAgent) {
    updateUserClientVersion(result.userId, userAgent).catch(() => {
      // Silently ignore version tracking errors
    });
  }

  return result;
}

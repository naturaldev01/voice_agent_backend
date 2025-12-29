import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

interface RateLimitRecord {
  count: number;
  startTime: number;
}

// Simple in-memory rate limiter (for production, use Redis)
const rateLimitStore = new Map<string, RateLimitRecord>();

// Decorator metadata key
export const RATE_LIMIT_KEY = 'rateLimit';

// Decorator for setting rate limit
export function RateLimit(limit: number, windowMs: number = 60000) {
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(RATE_LIMIT_KEY, { limit, windowMs }, descriptor?.value || target);
  };
}

@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();

    // Get rate limit config from decorator or use defaults
    const rateLimitConfig = this.reflector.get<{ limit: number; windowMs: number }>(
      RATE_LIMIT_KEY,
      handler,
    ) || { limit: 100, windowMs: 60000 }; // Default: 100 requests per minute

    const { limit, windowMs } = rateLimitConfig;
    
    // Get client identifier (IP address)
    const clientId = this.getClientId(request);
    const key = `${clientId}:${handler.name}`;
    const now = Date.now();

    // Get or create rate limit record
    let record = rateLimitStore.get(key);

    if (!record || now - record.startTime > windowMs) {
      // Create new window
      record = { count: 1, startTime: now };
      rateLimitStore.set(key, record);
    } else {
      // Increment count in existing window
      record.count++;
    }

    // Check if limit exceeded
    if (record.count > limit) {
      const retryAfter = Math.ceil((record.startTime + windowMs - now) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Add rate limit headers
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, limit - record.count));
    response.setHeader('X-RateLimit-Reset', Math.ceil((record.startTime + windowMs) / 1000));

    return true;
  }

  private getClientId(request: any): string {
    // Try to get real IP from various headers
    return (
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.headers['x-real-ip'] ||
      request.ip ||
      request.connection?.remoteAddress ||
      'unknown'
    );
  }
}

// Cleanup old records periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now - record.startTime > 300000) { // 5 minutes
      rateLimitStore.delete(key);
    }
  }
}, 300000);


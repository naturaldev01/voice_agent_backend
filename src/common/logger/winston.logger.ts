import { LoggerService } from '@nestjs/common';
import * as winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, context, trace, ...meta }) => {
  let log = `${timestamp} [${level}]`;
  
  if (context) {
    log += ` [${context}]`;
  }
  
  log += `: ${message}`;
  
  // Add metadata if present
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }
  
  // Add stack trace for errors
  if (trace) {
    log += `\n${trace}`;
  }
  
  return log;
});

// Create Winston logger instance
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  ),
  defaultMeta: { service: 'voice-agent' },
  transports: [
    // Console transport with colors for development
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        logFormat,
      ),
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(
        winston.format.json(),
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(
        winston.format.json(),
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// NestJS compatible logger service
export class WinstonLoggerService implements LoggerService {
  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  log(message: string, context?: string) {
    winstonLogger.info(message, { context: context || this.context });
  }

  error(message: string, trace?: string, context?: string) {
    winstonLogger.error(message, { trace, context: context || this.context });
  }

  warn(message: string, context?: string) {
    winstonLogger.warn(message, { context: context || this.context });
  }

  debug(message: string, context?: string) {
    winstonLogger.debug(message, { context: context || this.context });
  }

  verbose(message: string, context?: string) {
    winstonLogger.verbose(message, { context: context || this.context });
  }

  // Additional methods for structured logging
  logWithMeta(message: string, meta: Record<string, unknown>, context?: string) {
    winstonLogger.info(message, { ...meta, context: context || this.context });
  }

  // Conversation-specific logging
  logConversation(
    conversationId: string,
    event: string,
    data?: Record<string, unknown>,
  ) {
    winstonLogger.info(`Conversation ${event}`, {
      conversationId,
      event,
      ...data,
      context: 'Conversation',
    });
  }

  // Performance logging
  logPerformance(operation: string, durationMs: number, context?: string) {
    winstonLogger.info(`Performance: ${operation}`, {
      operation,
      durationMs,
      context: context || 'Performance',
    });
  }
}

// Export singleton instance
export const logger = new WinstonLoggerService();


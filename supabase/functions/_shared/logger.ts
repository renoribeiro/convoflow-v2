// Secure logging utilities for Supabase Edge Functions

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: Error;
  requestId?: string;
}

export class EdgeLogger {
  private requestId: string;
  private isDevelopment: boolean;
  
  constructor(requestId?: string) {
    this.requestId = requestId || this.generateRequestId();
    this.isDevelopment = Deno.env.get('ENVIRONMENT') === 'development';
  }
  
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private sanitizeContext(context: LogContext): LogContext {
    const sensitiveKeys = ['apikey', 'password', 'token', 'secret', 'key', 'authorization'];
    const sanitized: LogContext = {};
    
    for (const [key, value] of Object.entries(context)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '***';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeNestedObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  private sanitizeNestedObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeNestedObject(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sensitiveKeys = ['apikey', 'password', 'token', 'secret', 'key'];
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          sanitized[key] = '***';
        } else {
          sanitized[key] = this.sanitizeNestedObject(value);
        }
      }
      return sanitized;
    }
    
    return obj;
  }
  
  private formatLogEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId
    };
    
    if (context) {
      entry.context = this.sanitizeContext(context);
    }
    
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined
      } as Error;
    }
    
    return entry;
  }
  
  private writeLog(entry: LogEntry): void {
    const logString = JSON.stringify(entry);
    
    // In development, use console methods for better formatting
    if (this.isDevelopment) {
      switch (entry.level) {
        case 'debug':
          console.debug(logString);
          break;
        case 'info':
          console.info(logString);
          break;
        case 'warn':
          console.warn(logString);
          break;
        case 'error':
          console.error(logString);
          break;
      }
    } else {
      // In production, use console.log for all levels to ensure proper log aggregation
      console.log(logString);
    }
  }
  
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const entry = this.formatLogEntry('debug', message, context);
      this.writeLog(entry);
    }
  }
  
  info(message: string, context?: LogContext): void {
    const entry = this.formatLogEntry('info', message, context);
    this.writeLog(entry);
  }
  
  warn(message: string, context?: LogContext, error?: Error): void {
    const entry = this.formatLogEntry('warn', message, context, error);
    this.writeLog(entry);
  }
  
  error(message: string, context?: LogContext, error?: Error): void {
    const entry = this.formatLogEntry('error', message, context, error);
    this.writeLog(entry);
  }
  
  // Utility method to create a child logger with additional context
  child(additionalContext: LogContext): EdgeLogger {
    const childLogger = new EdgeLogger(this.requestId);
    // Store additional context for future logs
    (childLogger as any).additionalContext = additionalContext;
    return childLogger;
  }
  
  getRequestId(): string {
    return this.requestId;
  }
}

// Factory function to create logger with request ID from headers
export function createLogger(request?: Request): EdgeLogger {
  const requestId = request?.headers.get('x-request-id') || 
                   request?.headers.get('cf-ray') || 
                   undefined;
  return new EdgeLogger(requestId);
}
/**
 * Enhanced secure logging utility
 * Provides structured logging with security considerations, performance metrics, and monitoring integration
 */

import { env } from './env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogCategory = 'auth' | 'api' | 'ui' | 'database' | 'performance' | 'security' | 'business' | 'system';

interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  timestamp: string;
  sessionId?: string;
  userId?: string;
  tenantId?: string;
  requestId?: string;
  context?: Record<string, any>;
  error?: Error;
  performance?: {
    duration?: number;
    memory?: number;
    operation?: string;
  };
  metadata?: {
    userAgent?: string;
    url?: string;
    component?: string;
    action?: string;
  };
}

interface PerformanceMetrics {
  startTime: number;
  operation: string;
  context?: Record<string, any>;
}

interface LoggerConfig {
  enableConsole: boolean;
  enableRemote: boolean;
  enablePerformanceTracking: boolean;
  enableUserTracking: boolean;
  maxLogLevel: LogLevel;
  remoteEndpoint?: string;
  batchSize: number;
  flushInterval: number;
}

class EnhancedSecureLogger {
  private sensitiveKeys = [
    'password', 'token', 'key', 'secret', 'apikey', 'api_key',
    'authorization', 'auth', 'credential', 'private', 'confidential',
    'refresh_token', 'access_token', 'session_token', 'jwt', 'bearer'
  ];

  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private performanceTrackers = new Map<string, PerformanceMetrics>();
  private sessionId: string;
  private flushTimer?: NodeJS.Timeout;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      enableConsole: !env.isProduction(),
      enableRemote: env.isProduction(),
      enablePerformanceTracking: true,
      enableUserTracking: true,
      maxLogLevel: env.isProduction() ? 'info' : 'debug',
      batchSize: 50,
      flushInterval: 30000, // 30 seconds
      ...config
    };

    this.sessionId = this.generateSessionId();
    this.startFlushTimer();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startFlushTimer(): void {
    if (this.config.enableRemote) {
      this.flushTimer = setInterval(() => {
        this.flushLogs();
      }, this.config.flushInterval);
    }
  }

  private getCurrentUser(): { userId?: string; tenantId?: string } {
    if (!this.config.enableUserTracking) {
      return {};
    }

    try {
      // Tentar obter informações do usuário do localStorage ou contexto
      const userStr = localStorage.getItem('user');
      const tenantStr = localStorage.getItem('tenant');
      
      return {
        userId: userStr ? JSON.parse(userStr)?.id : undefined,
        tenantId: tenantStr ? JSON.parse(tenantStr)?.id : undefined
      };
    } catch {
      return {};
    }
  }

  private getMetadata(): LogEntry['metadata'] {
    return {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined
    };
  }

  private shouldLog(level: LogLevel): boolean {
    const levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };
    const maxLevelPriority = levelPriority[this.config.maxLogLevel];
    const currentLevelPriority = levelPriority[level];

    return currentLevelPriority >= maxLevelPriority;
  }

  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0 || !this.config.enableRemote) {
      return;
    }

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    try {
      await this.sendLogsToService(logsToSend);
    } catch (error) {
      // Recolocar logs no buffer se falhar
      this.logBuffer.unshift(...logsToSend);
      console.error('Failed to flush logs:', error);
    }
  }

  private async sendLogsToService(logs: LogEntry[]): Promise<void> {
    if (!this.config.remoteEndpoint) {
      return;
    }

    try {
      const response = await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs, sessionId: this.sessionId })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send logs to service:', error);
      throw error;
    }
  }

  private sanitizeData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = this.sensitiveKeys.some(sensitiveKey => 
        lowerKey.includes(sensitiveKey)
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private formatMessage(entry: LogEntry): string {
    const { level, message, timestamp, context, error } = entry;
    
    let formatted = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    if (context && Object.keys(context).length > 0) {
      const sanitizedContext = this.sanitizeData(context);
      formatted += ` | Context: ${JSON.stringify(sanitizedContext)}`;
    }
    
    if (error) {
      formatted += ` | Error: ${error.message}`;
      if (env.isDevelopment() && error.stack) {
        formatted += ` | Stack: ${error.stack}`;
      }
    }
    
    return formatted;
  }

  private log(
    level: LogLevel, 
    category: LogCategory,
    message: string, 
    context?: Record<string, any>, 
    error?: Error,
    performance?: LogEntry['performance'],
    metadata?: Partial<LogEntry['metadata']>
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const { userId, tenantId } = this.getCurrentUser();
    const requestId = this.generateRequestId();

    const entry: LogEntry = {
      level,
      category,
      message,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId,
      tenantId,
      requestId,
      context: context ? this.sanitizeData(context) : undefined,
      error,
      performance,
      metadata: {
        ...this.getMetadata(),
        ...metadata
      }
    };

    // Console logging
    if (this.config.enableConsole) {
      const formattedMessage = this.formatMessage(entry);
      switch (level) {
        case 'debug':
          console.debug(formattedMessage);
          break;
        case 'info':
          console.info(formattedMessage);
          break;
        case 'warn':
          console.warn(formattedMessage);
          break;
        case 'error':
          console.error(formattedMessage);
          break;
      }
    }

    // Add to buffer for remote logging
    if (this.config.enableRemote) {
      this.logBuffer.push(entry);
      
      // Flush immediately for errors or when buffer is full
      if (level === 'error' || this.logBuffer.length >= this.config.batchSize) {
        this.flushLogs();
      }
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  private async sendToLogService(entry: LogEntry): Promise<void> {
    // TODO: Implement log service integration (e.g., Sentry, LogRocket, etc.)
    // This is where you would send critical logs to your monitoring service
    try {
      // Example: await logService.send(entry);
    } catch (error) {
      // Fallback to console if log service fails
      console.error('Failed to send log to service:', error);
    }
  }

  // Basic logging methods
  debug(message: string, context?: Record<string, any>, metadata?: Partial<LogEntry['metadata']>): void {
    this.log('debug', 'system', message, context, undefined, undefined, metadata);
  }

  info(message: string, context?: Record<string, any>, metadata?: Partial<LogEntry['metadata']>): void {
    this.log('info', 'system', message, context, undefined, undefined, metadata);
  }

  warn(message: string, context?: Record<string, any>, metadata?: Partial<LogEntry['metadata']>): void {
    this.log('warn', 'system', message, context, undefined, undefined, metadata);
  }

  error(message: string, context?: Record<string, any>, error?: Error, metadata?: Partial<LogEntry['metadata']>): void {
    this.log('error', 'system', message, context, error, undefined, metadata);
  }

  // Category-specific logging methods
  auth(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    this.log(level, 'auth', message, context, error);
  }

  api(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    this.log(level, 'api', message, context, error);
  }

  ui(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    this.log(level, 'ui', message, context, error);
  }

  database(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    this.log(level, 'database', message, context, error);
  }

  security(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    this.log(level, 'security', message, context, error);
  }

  business(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    this.log(level, 'business', message, context, error);
  }

  // Performance tracking methods
  startPerformanceTracking(operation: string, context?: Record<string, any>): string {
    if (!this.config.enablePerformanceTracking) {
      return '';
    }

    const trackerId = `perf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.performanceTrackers.set(trackerId, {
      startTime: performance.now(),
      operation,
      context
    });

    return trackerId;
  }

  endPerformanceTracking(trackerId: string, additionalContext?: Record<string, any>): void {
    if (!this.config.enablePerformanceTracking || !trackerId) {
      return;
    }

    const tracker = this.performanceTrackers.get(trackerId);
    if (!tracker) {
      return;
    }

    const duration = performance.now() - tracker.startTime;
    const memory = (performance as any).memory?.usedJSHeapSize;

    this.log('info', 'performance', `Performance: ${tracker.operation}`, {
      ...tracker.context,
      ...additionalContext
    }, undefined, {
      duration,
      memory,
      operation: tracker.operation
    });

    this.performanceTrackers.delete(trackerId);
  }

  // Convenience methods for common scenarios
  apiError(endpoint: string, error: Error, context?: Record<string, any>): void {
    this.api('error', `API Error at ${endpoint}`, {
      endpoint,
      ...context
    }, error);
  }

  authError(message: string, context?: Record<string, any>): void {
    this.auth('error', message, context);
  }

  authSuccess(message: string, context?: Record<string, any>): void {
    this.auth('info', message, context);
  }

  uiError(component: string, error: Error, context?: Record<string, any>): void {
    this.ui('error', `UI Error in ${component}`, {
      component,
      ...context
    }, error);
  }

  securityAlert(message: string, context?: Record<string, any>): void {
    this.security('warn', `Security Alert: ${message}`, context);
  }

  businessEvent(event: string, context?: Record<string, any>): void {
    this.business('info', `Business Event: ${event}`, context);
  }

  // Utility methods
  async flush(): Promise<void> {
    await this.flushLogs();
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushLogs();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Performance tracker interface
interface PerformanceTracker {
  startTime: number;
  operation: string;
  context?: Record<string, any>;
}

// Create and export a global logger instance
export const logger = new EnhancedSecureLogger({
  enableConsole: import.meta.env.DEV,
  enableRemote: import.meta.env.PROD,
  enablePerformanceTracking: true,
  enableUserTracking: true,
  maxLogLevel: import.meta.env.DEV ? 'debug' : 'info',
  batchSize: 10,
  flushInterval: 30000, // 30 seconds
  remoteEndpoint: import.meta.env.VITE_LOG_ENDPOINT || '/api/logs'
});

// Export logger instance as default
export default logger;

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    logger.destroy();
  });
}

// Export types
export type { LogLevel, LogEntry, LogCategory, LoggerConfig, PerformanceMetrics };
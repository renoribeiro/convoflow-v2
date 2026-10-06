/**
 * Sentry Error Monitoring Configuration
 * 
 * This module provides error tracking and performance monitoring
 * using Sentry. It's designed to work with or without Sentry being
 * installed - if Sentry is not available, it gracefully falls back
 * to console logging.
 * 
 * Usage:
 * - Import and call initSentry() in main.tsx
 * - Use captureError() to manually capture errors
 * - Use captureMessage() for custom events
 */

import { env } from '@/lib/env';

// Types for Sentry-like API
interface SentryUser {
    id?: string;
    email?: string;
    username?: string;
}

interface SentryTransaction {
    name: string;
    op: string;
    finish: () => void;
}

interface SentryScope {
    setUser: (user: SentryUser | null) => void;
    setTag: (key: string, value: string) => void;
    setExtra: (key: string, value: unknown) => void;
    setContext: (name: string, context: Record<string, unknown>) => void;
}

// Sentry instance (dynamically loaded)
let SentryInstance: any = null;
let isInitialized = false;

/**
 * Initialize Sentry error monitoring
 * Should be called once in main.tsx
 *
 * NOTA: o pacote `@sentry/react` não está instalado neste projeto. Para evitar
 * que o Vite quebre tentando resolver o import dinâmico durante a análise
 * estática, mantemos esta função como no-op. Os outros exports (captureError,
 * captureMessage, etc.) já caem em fallback para console quando
 * `SentryInstance` é null.
 *
 * Para ATIVAR Sentry de verdade:
 *   1. npm install @sentry/react
 *   2. Restaurar o bloco original (ver histórico no git deste arquivo)
 *   3. Definir VITE_SENTRY_DSN no .env
 */
export async function initSentry(): Promise<void> {
    if (env.isDevelopment()) {
        console.log('[Sentry] Disabled — pacote @sentry/react não instalado.');
    }
    // Mantém SentryInstance = null e isInitialized = false;
    // os captureError/captureMessage caem em fallback console.* sem problema.
}

/**
 * Capture an error in Sentry
 */
export function captureError(
    error: Error,
    context?: Record<string, unknown>
): void {
    if (SentryInstance && isInitialized) {
        SentryInstance.withScope((scope: SentryScope) => {
            if (context) {
                Object.entries(context).forEach(([key, value]) => {
                    scope.setExtra(key, value);
                });
            }
            SentryInstance.captureException(error);
        });
    } else {
        // Fallback to console
        console.error('[Error]', error, context);
    }
}

/**
 * Capture a message/event in Sentry
 */
export function captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
    context?: Record<string, unknown>
): void {
    if (SentryInstance && isInitialized) {
        SentryInstance.withScope((scope: SentryScope) => {
            if (context) {
                Object.entries(context).forEach(([key, value]) => {
                    scope.setExtra(key, value);
                });
            }
            SentryInstance.captureMessage(message, level);
        });
    } else {
        // Fallback to console
        const logFn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log;
        logFn(`[${level}]`, message, context);
    }
}

/**
 * Set the current user for error tracking
 */
export function setUser(user: SentryUser | null): void {
    if (SentryInstance && isInitialized) {
        SentryInstance.setUser(user);
    }
}

/**
 * Set a tag for all subsequent errors
 */
export function setTag(key: string, value: string): void {
    if (SentryInstance && isInitialized) {
        SentryInstance.setTag(key, value);
    }
}

/**
 * Start a performance transaction
 */
export function startTransaction(
    name: string,
    op: string = 'navigation'
): SentryTransaction | null {
    if (SentryInstance && isInitialized) {
        return SentryInstance.startTransaction({ name, op });
    }

    // Return a no-op transaction
    return {
        name,
        op,
        finish: () => { },
    };
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
    message: string,
    category: string = 'custom',
    data?: Record<string, unknown>
): void {
    if (SentryInstance && isInitialized) {
        SentryInstance.addBreadcrumb({
            message,
            category,
            data,
            level: 'info',
        });
    }
}

/**
 * Create an error boundary wrapper
 */
export function createErrorBoundary() {
    if (SentryInstance && isInitialized) {
        return SentryInstance.ErrorBoundary;
    }
    return null;
}

/**
 * Profiler component for performance
 */
export function createProfiler() {
    if (SentryInstance && isInitialized) {
        return SentryInstance.withProfiler;
    }
    return (component: any) => component;
}

export default {
    init: initSentry,
    captureError,
    captureMessage,
    setUser,
    setTag,
    startTransaction,
    addBreadcrumb,
};

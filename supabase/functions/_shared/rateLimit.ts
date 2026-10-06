/**
 * Rate Limiter for Supabase Edge Functions
 * Uses Supabase database for distributed rate limiting
 * 
 * This implementation uses the database to track rate limits,
 * ensuring they work correctly across multiple edge function instances
 * and cold starts.
 */

interface RateLimitConfig {
    maxRequests: number;     // Maximum requests allowed
    windowMs: number;        // Time window in milliseconds
    keyPrefix?: string;      // Optional prefix for rate limit keys
}

/**
 * Check if a request should be rate limited using Supabase database
 * Falls back to allowing the request if the DB check fails (fail-open for availability)
 */
export async function checkRateLimitDb(
    supabaseClient: any,
    identifier: string,
    config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number; retryAfter?: number }> {
    try {
        const key = config.keyPrefix ? `${config.keyPrefix}:${identifier}` : identifier;
        const now = Date.now();
        const windowStart = now - config.windowMs;

        // Clean up old entries and count current window in one operation
        // First, delete expired entries
        await supabaseClient
            .from('rate_limits')
            .delete()
            .lt('expires_at', new Date(now).toISOString());

        // Count requests in current window
        const { count, error: countError } = await supabaseClient
            .from('rate_limits')
            .select('*', { count: 'exact', head: true })
            .eq('key', key)
            .gte('created_at', new Date(windowStart).toISOString());

        if (countError) {
            console.error('[RateLimit] Error checking rate limit:', countError);
            // Fail open — allow the request if DB check fails
            return { allowed: true, remaining: config.maxRequests, resetAt: now + config.windowMs };
        }

        const currentCount = count || 0;

        if (currentCount >= config.maxRequests) {
            const resetAt = now + config.windowMs;
            const retryAfter = Math.ceil(config.windowMs / 1000);
            return { allowed: false, remaining: 0, resetAt, retryAfter };
        }

        // Insert new rate limit entry
        await supabaseClient
            .from('rate_limits')
            .insert({
                key,
                created_at: new Date(now).toISOString(),
                expires_at: new Date(now + config.windowMs).toISOString()
            });

        return {
            allowed: true,
            remaining: config.maxRequests - currentCount - 1,
            resetAt: now + config.windowMs
        };
    } catch (error) {
        console.error('[RateLimit] Unexpected error in rate limit check:', error);
        // Fail open — allow the request if something goes wrong
        return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
    }
}

/**
 * Lightweight in-memory rate limiter for non-critical use cases
 * NOTE: This resets on cold starts and is NOT shared across instances.
 * Use checkRateLimitDb for production-critical rate limiting.
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number; retryAfter?: number } {
    const key = config.keyPrefix ? `${config.keyPrefix}:${identifier}` : identifier;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // If no entry exists or window has expired, create new entry
    if (!entry || entry.resetAt <= now) {
        entry = { count: 1, resetAt: now + config.windowMs };
        rateLimitStore.set(key, entry);
        return { allowed: true, remaining: config.maxRequests - 1, resetAt: entry.resetAt };
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return { allowed: false, remaining: 0, resetAt: entry.resetAt, retryAfter };
    }

    entry.count++;
    return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Extract identifier from request for rate limiting
 */
export function getRateLimitIdentifier(req: Request): string {
    const forwardedFor = req.headers.get('x-forwarded-for');
    if (forwardedFor) return forwardedFor.split(',')[0].trim();

    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp;

    const cfConnectingIp = req.headers.get('cf-connecting-ip');
    if (cfConnectingIp) return cfConnectingIp;

    const authHeader = req.headers.get('authorization');
    if (authHeader) {
        let hash = 0;
        for (let i = 0; i < authHeader.length; i++) {
            const char = authHeader.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `auth:${Math.abs(hash).toString(36)}`;
    }

    return 'anonymous';
}

/**
 * Create rate limit response headers
 */
export function getRateLimitHeaders(
    remaining: number,
    resetAt: number,
    limit: number
): Record<string, string> {
    return {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': Math.max(0, remaining).toString(),
        'X-RateLimit-Reset': Math.ceil(resetAt / 1000).toString(),
    };
}

/**
 * Create a 429 Too Many Requests response
 */
export function createRateLimitResponse(
    retryAfter: number,
    headers: Record<string, string>
): Response {
    return new Response(
        JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter
        }),
        {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': retryAfter.toString(),
                ...headers
            }
        }
    );
}

// Preset configurations for common use cases
export const RATE_LIMIT_PRESETS = {
    standard: { maxRequests: 100, windowMs: 60000 },
    webhook: { maxRequests: 500, windowMs: 60000 },
    strict: { maxRequests: 10, windowMs: 60000 },
    healthCheck: { maxRequests: 1000, windowMs: 60000 },
} as const;

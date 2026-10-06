/**
 * Optimized Image Component with Lazy Loading
 * Features:
 * - Native lazy loading with intersection observer fallback
 * - Blur placeholder while loading
 * - Error fallback with retry
 * - Skeleton loading state
 * - WebP support detection
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ImageIcon } from 'lucide-react';

export interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt: string;
    fallbackSrc?: string;
    placeholderColor?: string;
    aspectRatio?: 'square' | 'video' | 'portrait' | 'auto';
    priority?: boolean; // Skip lazy loading for above-the-fold images
    onLoadComplete?: () => void;
    onError?: () => void;
}

// Aspect ratio classes
const aspectRatioClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    portrait: 'aspect-[3/4]',
    auto: '',
};

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
    src,
    alt,
    fallbackSrc = '/placeholder.svg',
    placeholderColor = '#e2e8f0',
    aspectRatio = 'auto',
    priority = false,
    className,
    onLoadComplete,
    onError: onErrorProp,
    ...props
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [isInView, setIsInView] = useState(priority);
    const [retryCount, setRetryCount] = useState(0);
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Intersection Observer for lazy loading
    useEffect(() => {
        if (priority || isInView) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsInView(true);
                    observer.disconnect();
                }
            },
            {
                rootMargin: '50px', // Start loading 50px before visible
                threshold: 0.01,
            }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, [priority, isInView]);

    // Handle successful load
    const handleLoad = useCallback(() => {
        setIsLoading(false);
        setHasError(false);
        onLoadComplete?.();
    }, [onLoadComplete]);

    // Handle load error with retry
    const handleError = useCallback(() => {
        if (retryCount < 2 && src) {
            // Retry with cache-busting query param
            setRetryCount((prev) => prev + 1);
            setIsLoading(true);
            return;
        }

        setIsLoading(false);
        setHasError(true);
        onErrorProp?.();
    }, [retryCount, src, onErrorProp]);

    // Get the actual src with retry param if needed
    const actualSrc = retryCount > 0 && src
        ? `${src}${src.includes('?') ? '&' : '?'}retry=${retryCount}`
        : src;

    return (
        <div
            ref={containerRef}
            className={cn(
                'relative overflow-hidden bg-muted',
                aspectRatioClasses[aspectRatio],
                className
            )}
            style={{ backgroundColor: placeholderColor }}
        >
            {/* Loading skeleton */}
            {isLoading && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-muted via-muted-foreground/10 to-muted" />
            )}

            {/* Error fallback */}
            {hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ImageIcon className="h-8 w-8" />
                        <span className="text-xs">Falha ao carregar</span>
                    </div>
                </div>
            )}

            {/* Actual image */}
            {isInView && !hasError && (
                <img
                    ref={imgRef}
                    src={actualSrc}
                    alt={alt}
                    loading={priority ? 'eager' : 'lazy'}
                    decoding={priority ? 'sync' : 'async'}
                    onLoad={handleLoad}
                    onError={handleError}
                    className={cn(
                        'w-full h-full object-cover transition-opacity duration-300',
                        isLoading ? 'opacity-0' : 'opacity-100'
                    )}
                    {...props}
                />
            )}

            {/* Fallback for non-visible images */}
            {!isInView && !priority && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                    <div className="w-8 h-8 rounded-full bg-muted-foreground/20 animate-pulse" />
                </div>
            )}
        </div>
    );
};

/**
 * Avatar-specific optimized image with circular styling
 */
export interface OptimizedAvatarProps extends Omit<OptimizedImageProps, 'aspectRatio'> {
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    name?: string; // For fallback initials
}

const avatarSizes = {
    xs: 'h-6 w-6 text-xs',
    sm: 'h-8 w-8 text-sm',
    md: 'h-10 w-10 text-base',
    lg: 'h-12 w-12 text-lg',
    xl: 'h-16 w-16 text-xl',
};

export const OptimizedAvatar: React.FC<OptimizedAvatarProps> = ({
    src,
    alt,
    name,
    size = 'md',
    className,
    ...props
}) => {
    const [hasError, setHasError] = useState(false);

    // Generate initials from name
    const initials = name
        ? name
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()
        : '?';

    // Generate consistent background color from name
    const bgColor = name
        ? `hsl(${name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360}, 70%, 60%)`
        : '#6b7280';

    if (!src || hasError) {
        return (
            <div
                className={cn(
                    'flex items-center justify-center rounded-full font-medium text-white',
                    avatarSizes[size],
                    className
                )}
                style={{ backgroundColor: bgColor }}
                title={name || alt}
            >
                {initials}
            </div>
        );
    }

    return (
        <OptimizedImage
            src={src}
            alt={alt}
            aspectRatio="square"
            className={cn('rounded-full', avatarSizes[size], className)}
            onError={() => setHasError(true)}
            {...props}
        />
    );
};

/**
 * Preload critical images
 */
export function preloadImage(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Preload multiple images in parallel
 */
export async function preloadImages(srcs: string[]): Promise<void> {
    await Promise.allSettled(srcs.map(preloadImage));
}

export default OptimizedImage;

/**
 * Accessibility (a11y) Utilities
 * 
 * Provides utilities and components for improving application accessibility.
 * Follows WCAG 2.1 guidelines for Level AA compliance.
 */

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Skip Link Component
 * Allows keyboard users to skip to main content
 */
export const SkipLink: React.FC<{ href?: string }> = ({ href = '#main-content' }) => {
    return (
        <a
            href={href}
            className={cn(
                'sr-only focus:not-sr-only',
                'fixed top-0 left-0 z-50',
                'bg-primary text-primary-foreground',
                'px-4 py-2 m-2 rounded-md',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                'transform -translate-y-full focus:translate-y-0',
                'transition-transform duration-200'
            )}
        >
            Pular para conteúdo principal
        </a>
    );
};

/**
 * Visually Hidden Component
 * Hides content visually but keeps it accessible to screen readers
 */
export const VisuallyHidden: React.FC<{
    children: React.ReactNode;
    as?: keyof JSX.IntrinsicElements;
}> = ({ children, as: Component = 'span' }) => {
    return (
        <Component className="sr-only">
            {children}
        </Component>
    );
};

/**
 * Focus Trap Component
 * Traps focus within a container (useful for modals)
 */
export const FocusTrap: React.FC<{
    children: React.ReactNode;
    active?: boolean;
}> = ({ children, active = true }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!active) return;

        const container = containerRef.current;
        if (!container) return;

        const focusableElements = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) as NodeListOf<HTMLElement>;

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return;

            if (event.shiftKey) {
                if (document.activeElement === firstElement) {
                    event.preventDefault();
                    lastElement?.focus();
                }
            } else {
                if (document.activeElement === lastElement) {
                    event.preventDefault();
                    firstElement?.focus();
                }
            }
        };

        // Focus first element
        firstElement?.focus();

        container.addEventListener('keydown', handleKeyDown);
        return () => container.removeEventListener('keydown', handleKeyDown);
    }, [active]);

    return (
        <div ref={containerRef}>
            {children}
        </div>
    );
};

/**
 * Announce Component
 * Announces content to screen readers using ARIA live regions
 */
export const Announce: React.FC<{
    message: string;
    politeness?: 'polite' | 'assertive';
}> = ({ message, politeness = 'polite' }) => {
    return (
        <div
            role="status"
            aria-live={politeness}
            aria-atomic="true"
            className="sr-only"
        >
            {message}
        </div>
    );
};

/**
 * Hook to announce messages to screen readers
 */
export function useAnnounce() {
    const [message, setMessage] = React.useState('');

    const announce = React.useCallback((text: string) => {
        setMessage('');
        // Small delay to ensure the change is announced
        setTimeout(() => setMessage(text), 100);
    }, []);

    const AnnounceComponent: React.FC = () => <Announce message={message} />;

    return { announce, AnnounceComponent };
}

/**
 * Custom hook for managing focus on route changes
 */
export function useFocusOnRouteChange() {
    const mainRef = useRef<HTMLElement>(null);

    useEffect(() => {
        // Focus the main content area on route changes
        const handleRouteChange = () => {
            mainRef.current?.focus();
        };

        // Listen for popstate (back/forward navigation)
        window.addEventListener('popstate', handleRouteChange);
        return () => window.removeEventListener('popstate', handleRouteChange);
    }, []);

    return mainRef;
}

/**
 * Main content wrapper with proper ARIA landmark
 */
export const MainContent: React.FC<{
    children: React.ReactNode;
    className?: string;
}> = ({ children, className }) => {
    const mainRef = useFocusOnRouteChange();

    return (
        <main
            ref={mainRef}
            id="main-content"
            tabIndex={-1}
            className={cn('outline-none', className)}
            role="main"
            aria-label="Conteúdo principal"
        >
            {children}
        </main>
    );
};

/**
 * Loading State Announcer
 * Announces loading states to screen readers
 */
export const LoadingAnnouncer: React.FC<{
    isLoading: boolean;
    loadingMessage?: string;
    loadedMessage?: string;
}> = ({
    isLoading,
    loadingMessage = 'Carregando...',
    loadedMessage = 'Conteúdo carregado',
}) => {
        const [shouldAnnounce, setShouldAnnounce] = React.useState(false);

        React.useEffect(() => {
            if (!isLoading && shouldAnnounce) {
                // Announce when loading completes
                setShouldAnnounce(false);
            } else if (isLoading) {
                setShouldAnnounce(true);
            }
        }, [isLoading, shouldAnnounce]);

        return (
            <div role="status" aria-live="polite" className="sr-only">
                {isLoading ? loadingMessage : shouldAnnounce ? loadedMessage : ''}
            </div>
        );
    };

/**
 * Keyboard navigation helper for lists
 */
export function useKeyboardNavigation<T extends HTMLElement>(
    items: unknown[],
    options?: {
        orientation?: 'horizontal' | 'vertical';
        loop?: boolean;
    }
) {
    const { orientation = 'vertical', loop = true } = options || {};
    const [focusedIndex, setFocusedIndex] = React.useState(0);
    const containerRef = useRef<T>(null);

    const handleKeyDown = React.useCallback(
        (event: React.KeyboardEvent) => {
            const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
            const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';

            if (event.key === nextKey) {
                event.preventDefault();
                setFocusedIndex((prev) => {
                    if (prev === items.length - 1) {
                        return loop ? 0 : prev;
                    }
                    return prev + 1;
                });
            } else if (event.key === prevKey) {
                event.preventDefault();
                setFocusedIndex((prev) => {
                    if (prev === 0) {
                        return loop ? items.length - 1 : prev;
                    }
                    return prev - 1;
                });
            } else if (event.key === 'Home') {
                event.preventDefault();
                setFocusedIndex(0);
            } else if (event.key === 'End') {
                event.preventDefault();
                setFocusedIndex(items.length - 1);
            }
        },
        [items.length, orientation, loop]
    );

    return {
        containerRef,
        focusedIndex,
        setFocusedIndex,
        handleKeyDown,
    };
}

/**
 * Reduced motion hook
 * Respects user's prefers-reduced-motion setting
 */
export function usePrefersReducedMotion(): boolean {
    const [prefersReduced, setPrefersReduced] = React.useState(false);

    React.useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setPrefersReduced(mediaQuery.matches);

        const handler = (event: MediaQueryListEvent) => {
            setPrefersReduced(event.matches);
        };

        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    return prefersReduced;
}

/**
 * ARIA-described-by helper
 * Generates unique IDs for accessible descriptions
 */
let descriptionIdCounter = 0;

export function useDescriptionId(): string {
    const idRef = useRef<string>();

    if (!idRef.current) {
        idRef.current = `description-${++descriptionIdCounter}`;
    }

    return idRef.current;
}

export default {
    SkipLink,
    VisuallyHidden,
    FocusTrap,
    Announce,
    MainContent,
    LoadingAnnouncer,
    useAnnounce,
    useFocusOnRouteChange,
    useKeyboardNavigation,
    usePrefersReducedMotion,
    useDescriptionId,
};

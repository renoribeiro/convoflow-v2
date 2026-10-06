/**
 * Vitest Setup File
 * This file runs before all tests
 */

import '@testing-library/jest-dom';

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
    value: {
        VITE_SUPABASE_URL: 'https://test.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key-for-testing-purposes-only',
        VITE_ENVIRONMENT: 'test',
        VITE_APP_NAME: 'ConvoFlow Test',
        VITE_APP_VERSION: '1.0.0-test',
        VITE_ENABLE_DEBUG_LOGS: 'false',
        VITE_ENABLE_CONSOLE_LOGS: 'false',
        DEV: false,
        PROD: false,
        MODE: 'test',
    },
    writable: true,
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => { },
        removeListener: () => { },
        addEventListener: () => { },
        removeEventListener: () => { },
        dispatchEvent: () => false,
    }),
});

// Mock ResizeObserver
class ResizeObserverMock {
    observe() { }
    unobserve() { }
    disconnect() { }
}
window.ResizeObserver = ResizeObserverMock;

// Mock IntersectionObserver
class IntersectionObserverMock {
    observe() { }
    unobserve() { }
    disconnect() { }
}
window.IntersectionObserver = IntersectionObserverMock as any;

// scrollIntoView não existe no jsdom. O cmdk (base do <Command />, usado pela
// paleta de respostas rápidas e por qualquer combobox com busca) chama isso ao
// mover o item destacado — sem o stub, o componente estoura no primeiro render.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() { };
}

// Suppress console during tests (optional, uncomment to enable)
// const originalError = console.error;
// beforeAll(() => {
//   console.error = (...args: any[]) => {
//     if (typeof args[0] === 'string' && args[0].includes('Warning:')) {
//       return;
//     }
//     originalError.apply(console, args);
//   };
// });
// afterAll(() => {
//   console.error = originalError;
// });

/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        // Enable global test APIs
        globals: true,
        // Use jsdom for DOM testing
        environment: 'jsdom',
        // Setup files to run before tests
        setupFiles: ['./src/test/setup.ts'],
        // Include patterns for test files
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        // Exclude patterns
        exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'src/test/',
                '**/*.d.ts',
                '**/*.config.*',
                '**/types/**',
            ],
            // Minimum coverage thresholds
            thresholds: {
                statements: 50,
                branches: 50,
                functions: 50,
                lines: 50,
            },
        },
        // Test timeout
        testTimeout: 10000,
        // Hook timeout
        hookTimeout: 10000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});

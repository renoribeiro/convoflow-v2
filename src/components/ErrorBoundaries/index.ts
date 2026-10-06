// Error Boundary principal
export { default as ErrorBoundary } from '../ErrorBoundary';
export { withErrorBoundary, FormErrorBoundary, ListErrorBoundary } from '../ErrorBoundary';

// Error Boundary para páginas
export { default as PageErrorBoundary } from './PageErrorBoundary';
export { withPageErrorBoundary } from './PageErrorBoundary';

// Error Boundary para componentes
export { default as ComponentErrorBoundary } from './ComponentErrorBoundary';
export {
  withFormErrorBoundary,
  withListErrorBoundary,
  withTableErrorBoundary,
  withChartErrorBoundary
} from './ComponentErrorBoundary';

// Re-exportar tipos úteis
export type { ErrorInfo } from 'react';
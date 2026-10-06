import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from './ui/button';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { captureError, addBreadcrumb } from '@/lib/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
  level?: 'page' | 'component' | 'critical';
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId?: string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Gerar ID único para o erro
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, level = 'component' } = this.props;

    // Add breadcrumb for debugging
    addBreadcrumb('Error boundary triggered', 'error', {
      level,
      errorId: this.state.errorId,
    });

    // Log do erro
    console.error('Error caught by boundary:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      level,
      timestamp: new Date().toISOString(),
      errorId: this.state.errorId
    });

    // Callback personalizado
    if (onError) {
      onError(error, errorInfo);
    }

    // Report error to Sentry (in production)
    if (import.meta.env.PROD) {
      this.reportError(error, errorInfo);
    }

    this.setState({ errorInfo });
  }

  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    // Use Sentry for error reporting
    captureError(error, {
      componentStack: errorInfo.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href,
      errorId: this.state.errorId,
      level: this.props.level,
    });
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      errorId: undefined
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const { fallback, showDetails = false, level = 'component' } = this.props;
      const { error, errorInfo, errorId } = this.state;

      // Usar fallback customizado se fornecido
      if (fallback) {
        return fallback;
      }

      // Renderizar UI de erro baseada no nível
      if (level === 'critical') {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
            <Card className="max-w-lg w-full">
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <CardTitle className="text-xl text-gray-900">
                  Ops! Algo deu errado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-600 text-center">
                  Encontramos um erro inesperado. Nossa equipe foi notificada e está trabalhando para resolver o problema.
                </p>

                {showDetails && error && (
                  <Alert variant="destructive">
                    <Bug className="h-4 w-4" />
                    <AlertTitle>Detalhes do Erro</AlertTitle>
                    <AlertDescription className="mt-2">
                      <div className="space-y-2">
                        <p className="font-mono text-xs">{error.message}</p>
                        {errorId && (
                          <p className="text-xs text-gray-500">ID: {errorId}</p>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={this.handleReload}
                    className="flex-1"
                    variant="default"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Recarregar Página
                  </Button>
                  <Button
                    onClick={this.handleGoHome}
                    variant="outline"
                    className="flex-1"
                  >
                    <Home className="h-4 w-4 mr-2" />
                    Ir para Início
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      }

      if (level === 'page') {
        return (
          <div className="flex items-center justify-center min-h-[400px] p-6">
            <Alert className="max-w-md">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro na Página</AlertTitle>
              <AlertDescription className="mt-2">
                <div className="space-y-3">
                  <p>Esta página encontrou um problema e não pode ser carregada.</p>

                  {showDetails && error && (
                    <div className="p-2 bg-gray-100 rounded text-xs font-mono">
                      {error.message}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={this.handleReset}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Tentar Novamente
                    </Button>
                    <Button
                      onClick={this.handleGoHome}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Home className="h-4 w-4 mr-2" />
                      Início
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        );
      }

      // Nível 'component' - erro mais simples
      return (
        <div className="flex items-center justify-center p-4 border border-red-200 bg-red-50 rounded-lg">
          <Alert variant="destructive" className="border-0 bg-transparent">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2">
              <div className="flex items-center justify-between">
                <span>Componente indisponível temporariamente</span>
                <Button
                  onClick={this.handleReset}
                  variant="ghost"
                  size="sm"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

// Hook para usar Error Boundary de forma mais simples
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
};

// Error Boundary específico para formulários
export const FormErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    level="component"
    fallback={
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Erro no formulário. Tente recarregar a página.
        </AlertDescription>
      </Alert>
    }
  >
    {children}
  </ErrorBoundary>
);

// Error Boundary específico para listas/tabelas
export const ListErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    level="component"
    fallback={
      <div className="text-center py-8">
        <AlertTriangle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-500">Erro ao carregar dados</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Recarregar
        </Button>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);
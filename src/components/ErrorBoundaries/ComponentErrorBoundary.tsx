import React, { ReactNode } from 'react';
import ErrorBoundary from '../ErrorBoundary';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface ComponentErrorBoundaryProps {
  children: ReactNode;
  componentName?: string;
  fallbackType?: 'minimal' | 'card' | 'alert' | 'custom';
  customFallback?: ReactNode;
  onError?: (error: Error) => void;
  showRetry?: boolean;
  className?: string;
}

// Fallback mínimo para componentes pequenos
const MinimalErrorFallback: React.FC<{
  componentName?: string;
  onRetry?: () => void;
  showRetry?: boolean;
}> = ({ componentName = 'componente', onRetry, showRetry = true }) => (
  <div className="flex items-center justify-center p-2 text-sm text-muted-foreground bg-muted rounded border border-border">
    <AlertTriangle className="h-4 w-4 mr-2 text-warning" />
    <span>Erro no {componentName}</span>
    {showRetry && onRetry && (
      <Button
        variant="ghost"
        size="sm"
        onClick={onRetry}
        className="ml-2 h-6 px-2"
      >
        <RefreshCw className="h-3 w-3" />
      </Button>
    )}
  </div>
);

// Fallback em formato de card
const CardErrorFallback: React.FC<{
  componentName?: string;
  onRetry?: () => void;
  showRetry?: boolean;
}> = ({ componentName = 'componente', onRetry, showRetry = true }) => (
  <Card className="border-destructive/30 bg-destructive/10">
    <CardHeader className="pb-3">
      <CardTitle className="text-sm flex items-center text-destructive">
        <AlertTriangle className="h-4 w-4 mr-2" />
        Erro no {componentName}
      </CardTitle>
    </CardHeader>
    <CardContent className="pt-0">
      <p className="text-sm text-destructive mb-3">
        Este {componentName} encontrou um problema e não pode ser exibido.
      </p>
      {showRetry && onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar Novamente
        </Button>
      )}
    </CardContent>
  </Card>
);

// Fallback em formato de alert
const AlertErrorFallback: React.FC<{
  componentName?: string;
  onRetry?: () => void;
  showRetry?: boolean;
}> = ({ componentName = 'componente', onRetry, showRetry = true }) => (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Erro no {componentName}</AlertTitle>
    <AlertDescription className="mt-2">
      <div className="flex items-center justify-between">
        <span>Não foi possível carregar este {componentName}.</span>
        {showRetry && onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="ml-2 h-8 px-2 text-destructive hover:bg-destructive/10"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </AlertDescription>
  </Alert>
);

const ComponentErrorBoundary: React.FC<ComponentErrorBoundaryProps> = ({
  children,
  componentName = 'componente',
  fallbackType = 'minimal',
  customFallback,
  onError,
  showRetry = true,
  className
}) => {
  const [retryKey, setRetryKey] = React.useState(0);

  const handleError = (error: Error) => {
    console.error(`Component Error in ${componentName}:`, {
      message: error.message,
      stack: error.stack,
      component: componentName,
      timestamp: new Date().toISOString()
    });
    
    if (onError) {
      onError(error);
    }
  };

  const handleRetry = () => {
    setRetryKey(prev => prev + 1);
  };

  const getFallback = () => {
    if (customFallback) {
      return customFallback;
    }

    const fallbackProps = {
      componentName,
      onRetry: showRetry ? handleRetry : undefined,
      showRetry
    };

    switch (fallbackType) {
      case 'card':
        return <CardErrorFallback {...fallbackProps} />;
      case 'alert':
        return <AlertErrorFallback {...fallbackProps} />;
      case 'minimal':
      default:
        return <MinimalErrorFallback {...fallbackProps} />;
    }
  };

  return (
    <div className={className} key={retryKey}>
      <ErrorBoundary
        level="component"
        onError={handleError}
        fallback={getFallback()}
      >
        {children}
      </ErrorBoundary>
    </div>
  );
};

export default ComponentErrorBoundary;

// HOCs específicos para diferentes tipos de componentes
export const withFormErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>
) => {
  const WrappedComponent = (props: P) => (
    <ComponentErrorBoundary
      componentName="formulário"
      fallbackType="alert"
      showRetry={true}
    >
      <Component {...props} />
    </ComponentErrorBoundary>
  );
  
  WrappedComponent.displayName = `withFormErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

export const withListErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>
) => {
  const WrappedComponent = (props: P) => (
    <ComponentErrorBoundary
      componentName="lista"
      fallbackType="card"
      showRetry={true}
    >
      <Component {...props} />
    </ComponentErrorBoundary>
  );
  
  WrappedComponent.displayName = `withListErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

export const withTableErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>
) => {
  const WrappedComponent = (props: P) => (
    <ComponentErrorBoundary
      componentName="tabela"
      fallbackType="alert"
      showRetry={true}
    >
      <Component {...props} />
    </ComponentErrorBoundary>
  );
  
  WrappedComponent.displayName = `withTableErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

export const withChartErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>
) => {
  const WrappedComponent = (props: P) => (
    <ComponentErrorBoundary
      componentName="gráfico"
      fallbackType="card"
      showRetry={true}
    >
      <Component {...props} />
    </ComponentErrorBoundary>
  );
  
  WrappedComponent.displayName = `withChartErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};
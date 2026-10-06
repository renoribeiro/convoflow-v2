import React, { ReactNode } from 'react';
import ErrorBoundary from '../ErrorBoundary';
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { useNavigate } from 'react-router-dom';

interface PageErrorBoundaryProps {
  children: ReactNode;
  pageName?: string;
  showBackButton?: boolean;
  customFallback?: ReactNode;
}

const PageErrorFallback: React.FC<{
  pageName?: string;
  showBackButton?: boolean;
  onReset?: () => void;
}> = ({ pageName = 'página', showBackButton = true, onReset }) => {
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-xl text-gray-900">
            Erro na {pageName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600 text-center">
            Ocorreu um erro inesperado ao carregar esta {pageName}. 
            Tente uma das opções abaixo para continuar.
          </p>
          
          <div className="space-y-2">
            <Button 
              onClick={handleReload}
              className="w-full"
              variant="default"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Recarregar Página
            </Button>
            
            {showBackButton && (
              <Button 
                onClick={handleGoBack}
                variant="outline"
                className="w-full"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            )}
            
            <Button 
              onClick={handleGoHome}
              variant="outline"
              className="w-full"
            >
              <Home className="h-4 w-4 mr-2" />
              Ir para Dashboard
            </Button>
            
            {onReset && (
              <Button 
                onClick={onReset}
                variant="ghost"
                className="w-full"
              >
                Tentar Novamente
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const PageErrorBoundary: React.FC<PageErrorBoundaryProps> = ({
  children,
  pageName,
  showBackButton,
  customFallback
}) => {
  const handleError = (error: Error) => {
    // Log específico para erros de página
    console.error(`Page Error in ${pageName}:`, {
      message: error.message,
      stack: error.stack,
      page: pageName,
      url: window.location.href,
      timestamp: new Date().toISOString()
    });
  };

  return (
    <ErrorBoundary
      level="page"
      onError={handleError}
      fallback={
        customFallback || (
          <PageErrorFallback 
            pageName={pageName}
            showBackButton={showBackButton}
          />
        )
      }
    >
      {children}
    </ErrorBoundary>
  );
};

export default PageErrorBoundary;

// HOC para envolver páginas automaticamente
export const withPageErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    pageName?: string;
    showBackButton?: boolean;
    customFallback?: ReactNode;
  }
) => {
  const WrappedComponent = (props: P) => (
    <PageErrorBoundary {...options}>
      <Component {...props} />
    </PageErrorBoundary>
  );
  
  WrappedComponent.displayName = `withPageErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};
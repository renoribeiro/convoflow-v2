import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // Quem está logado volta ao Dashboard; visitante, à página de vendas (achado 10).
  const { user } = useAuth();
  const inicio = user ? '/dashboard' : '/';

  useEffect(() => {
    logger.warn('404: rota não encontrada', { path: location.pathname });
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="text-center space-y-6 p-8 max-w-md">
        <div className="space-y-3">
          <p aria-hidden="true" className="text-8xl font-bold text-muted-foreground leading-none select-none">404</p>
          <h1 className="text-xl font-semibold text-foreground">Página não encontrada</h1>
          <p className="text-sm text-muted-foreground">
            A página que você está procurando não existe ou foi movida.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <Button size="sm" onClick={() => navigate(inicio)}>
            <Home className="w-4 h-4 mr-2" />
            Ir para o início
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;

import { Store, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

/**
 * Aviso mostrado ao SUPERADMIN nas telas operacionais (dados de cliente).
 *
 * Por privacidade, o superadmin não acessa conversas/contatos/funil/etc. das
 * Contas — ele acompanha os clientes pelas estatísticas (Dashboard) e gerencia
 * pela Administração. As funções continuam visíveis no menu, mas aqui exibimos
 * este aviso em vez do dado do cliente.
 */
export const LojaOnlyNotice = () => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center py-16">
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Store className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">Exclusivo para lojas</CardTitle>
          <CardDescription>
            Esta área contém dados operacionais das Contas e é exclusiva das Lojas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Como administrador da plataforma, você acompanha os clientes pelas
            <strong> estatísticas do Dashboard</strong> e gerencia tudo pela
            <strong> Administração</strong>, sem acessar as conversas e contatos
            dos clientes.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button variant="default" onClick={() => navigate('/dashboard')} className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Ir para o Dashboard
            </Button>
            <Button variant="outline" onClick={() => navigate('/dashboard/admin')}>
              Administração
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

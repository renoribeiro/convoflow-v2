import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, Check, Info, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { safeNotificationLink } from '@/lib/notifications/safeLink';
import { cn } from '@/lib/utils';

/**
 * A lista completa dos avisos do sino.
 *
 * Até 2026-10-25 esta tela mostrava cinco avisos inventados, fixos no código,
 * e um quadro de "Preferências" que não gravava nada (achados 55 e 113 do
 * checkup de usabilidade, ops-privado/checkup-ux/RELATORIO_CHECKUP_UX.md).
 * Agora lê a mesma tabela `notifications` do sino (NotificationCenter), com o
 * mesmo escopo: o RLS (user_id = auth.uid()) já limita aos avisos da pessoa,
 * por isso não há filtro de tenant aqui.
 *
 * A chave começa com ['notifications', <usuário>], a mesma do sino: marcar
 * como lido aqui invalida as duas listas.
 */

/** Quantos avisos a tela mostra. O sino mostra os 50 últimos. */
export const LIMITE_DA_PAGINA = 200;

interface Aviso {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | string;
  is_read: boolean;
  created_at: string;
  action_url?: string | null;
  action_label?: string | null;
}

function iconeDoTipo(tipo: string) {
  switch (tipo) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-success" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    case 'error':
      return <X className="h-4 w-4 text-error" />;
    default:
      return <Info className="h-4 w-4 text-info" />;
  }
}

function quando(dataIso: string): string {
  const data = new Date(dataIso);
  const minutos = Math.floor((Date.now() - data.getTime()) / 60_000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Notifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: avisos = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', user?.id, 'pagina'],
    enabled: !!user?.id,
    queryFn: async (): Promise<Aviso[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(LIMITE_DA_PAGINA);
      if (error) throw error;
      return (data ?? []) as unknown as Aviso[];
    },
  });

  const naoLidos = avisos.filter((a) => !a.is_read).length;

  const atualizarListas = () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });

  const marcarComoLido = async (id: string) => {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) {
      toast({ title: 'Não foi possível marcar como lido', description: 'Tente de novo em instantes.', variant: 'destructive' });
      return;
    }
    atualizarListas();
  };

  const marcarTodosComoLidos = async () => {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
    if (error) {
      toast({ title: 'Não foi possível marcar todos como lidos', description: 'Tente de novo em instantes.', variant: 'destructive' });
      return;
    }
    atualizarListas();
  };

  const abrir = (aviso: Aviso) => {
    if (!aviso.is_read) marcarComoLido(aviso.id);
    const link = safeNotificationLink(aviso.action_url);
    if (link?.kind === 'internal') navigate(link.path);
    else if (link?.kind === 'external') window.open(link.href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        helpKey="page:notifications"
        description={
          isLoading ? 'Carregando seus avisos' : naoLidos === 0 ? 'Nenhum aviso sem ler' : `${naoLidos} sem ler`
        }
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Notificações' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={marcarTodosComoLidos} disabled={naoLidos === 0}>
            <Check className="w-4 h-4 mr-2" />
            Marcar todas como lidas
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4" />
            Seus avisos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-2" data-testid="avisos-carregando">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">Não foi possível carregar seus avisos.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : avisos.length === 0 ? (
            <div className="py-8 text-center">
              <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium">Nenhum aviso por enquanto</p>
              <p className="text-xs text-muted-foreground mt-1">
                Quando o sistema avisar você de algo, o aviso aparece aqui e no sino do topo.
              </p>
            </div>
          ) : (
            avisos.map((aviso) => (
              <div
                key={aviso.id}
                className={cn(
                  'flex items-start gap-3 rounded-md border p-3 transition-colors',
                  aviso.is_read ? 'bg-muted/20 border-muted' : 'bg-card border-border shadow-sm',
                )}
                data-testid="aviso"
              >
                <div className="mt-0.5 flex-shrink-0">{iconeDoTipo(aviso.type)}</div>
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => abrir(aviso)}>
                  <h4
                    className={cn(
                      'text-sm leading-snug',
                      aviso.is_read ? 'font-medium text-muted-foreground' : 'font-semibold text-foreground',
                    )}
                  >
                    {aviso.title}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{aviso.message}</p>
                  <span className="mt-1.5 block text-[11px] text-muted-foreground">{quando(aviso.created_at)}</span>
                </button>
                {!aviso.is_read && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={() => marcarComoLido(aviso.id)}
                    aria-label="Marcar como lido"
                    title="Marcar como lido"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))
          )}
          {avisos.length >= LIMITE_DA_PAGINA && (
            <p className="pt-2 text-center text-xs text-muted-foreground">
              Mostrando os {LIMITE_DA_PAGINA} avisos mais recentes.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

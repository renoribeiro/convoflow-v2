/**
 * Com a Conta em foco, a janela "Conectar número" pede a Loja antes de tudo:
 * número de WhatsApp é sempre de uma Loja (decisão D1, 2026-10-29), e o
 * servidor recusa Conta (supabase/functions/_shared/connect-target.ts).
 *
 * Escolher a Loja troca a Loja em foco e pede para a janela reabrir lá
 * (src/lib/whatsapp/conectarPendente.ts), como o Funil faz.
 */
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/TenantContext';
import { useMyStores } from '@/hooks/useMyStores';
import { pedirConectarNumero } from '@/lib/whatsapp/conectarPendente';

export const TEXTO_NUMERO_FICA_NA_LOJA =
  'O número de WhatsApp fica numa Loja, não na Conta. Escolha a Loja deste número.';

export function EscolherLojaDoNumero({ reabrirJanela = true }: { reabrirJanela?: boolean }) {
  const { tenant, setActiveTenant } = useTenant();
  // O superadmin dentro de uma Conta lista as Lojas dela; o Gerente, as dele.
  const { stores, isLoading } = useMyStores({ superadminAccountId: tenant?.id ?? null });

  const abrir = (loja: { id: string; name: string }) => {
    if (reabrirJanela) pedirConectarNumero();
    toast.info(`Abrimos a Loja ${loja.name}.`);
    setActiveTenant(loja.id);
  };

  return (
    <div className="space-y-3 text-sm" data-testid="escolher-loja-do-numero">
      <p className="text-muted-foreground">{TEXTO_NUMERO_FICA_NA_LOJA}</p>
      {isLoading ? (
        <p className="text-muted-foreground">Carregando as Lojas...</p>
      ) : stores.length === 0 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground">A Conta ainda não tem Loja. Crie a primeira em Equipe.</p>
          <Button size="sm" asChild>
            <Link to="/dashboard/team">Criar Loja</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Escolha a Loja do número">
          {stores.map((loja) => (
            <Button key={loja.id} size="sm" variant={stores.length === 1 ? 'default' : 'outline'} onClick={() => abrir(loja)}>
              <Store className="mr-2 h-4 w-4" aria-hidden="true" />
              {stores.length === 1 ? `Abrir a Loja ${loja.name}` : loja.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export default EscolherLojaDoNumero;

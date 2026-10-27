/**
 * O que o Funil mostra no lugar do quadro e do formulário de "Novo Lead"
 * quando não dá para usar o funil ainda. Um caso por situação
 * (src/lib/funnel/estadoVazio.ts):
 *
 *   conta                 Gerente com a Conta em foco: o funil é de cada
 *                         Loja. Uma Loja só abre com um clique (e a janela
 *                         que estava aberta volta); várias, uma de cada.
 *   sem-etapas-configura  Gestor/Gerente numa Loja sem etapa: "Criar etapas
 *                         agora" (abre Configurar Estágios) ou "Usar etapas
 *                         prontas" (cria as cinco de uma vez, uma vez só).
 *   sem-etapas-atendente  Atendente: pedir a quem pode.
 */
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layers, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/TenantContext';
import { useMyStores } from '@/hooks/useMyStores';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import {
  ETAPAS_PADRAO_TEXTO,
  criarEtapasPadrao,
  type SituacaoFunil,
} from '@/lib/funnel/estadoVazio';
import { pedirAcaoFunil, type AcaoFunil } from '@/lib/funnel/funilPendente';

interface EstadoVazioFunilProps {
  situacao: Exclude<SituacaoFunil, 'pronto'>;
  /** Gerente na Conta: o que reabrir depois de escolher a Loja. */
  acaoDepoisDaLoja?: AcaoFunil | null;
  /** "Criar etapas agora": abre "Configurar Estágios". */
  onConfigurarEtapas?: () => void;
  className?: string;
}

export const TEXTO_ATENDENTE_SEM_ETAPAS =
  'Este funil ainda não tem etapas. Peça ao Gestor ou ao Gerente para criar em "Configurar etapas".';

export function EstadoVazioFunil({ situacao, acaoDepoisDaLoja, onConfigurarEtapas, className }: EstadoVazioFunilProps) {
  return (
    <div className={cn('space-y-3 text-sm', className)} data-situacao-funil={situacao}>
      {situacao === 'conta' && <EscolherLoja acao={acaoDepoisDaLoja ?? null} />}
      {situacao === 'sem-etapas-configura' && <CriarEtapas onConfigurarEtapas={onConfigurarEtapas} />}
      {situacao === 'sem-etapas-atendente' && <p className="text-muted-foreground">{TEXTO_ATENDENTE_SEM_ETAPAS}</p>}
    </div>
  );
}

function EscolherLoja({ acao }: { acao: AcaoFunil | null }) {
  const { setActiveTenant } = useTenant();
  const { stores, isLoading } = useMyStores();

  const abrir = (loja: { id: string; name: string }) => {
    if (acao) pedirAcaoFunil(acao);
    toast.info(`Abrimos a Loja ${loja.name}.`);
    setActiveTenant(loja.id);
  };

  return (
    <>
      <p className="text-muted-foreground">
        As etapas do funil ficam em cada Loja. Escolha a Loja para usar o funil dela.
      </p>
      {isLoading ? (
        <p className="text-muted-foreground">Carregando as Lojas...</p>
      ) : stores.length === 0 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground">A Conta ainda não tem Loja. Crie a primeira em Equipe.</p>
          <Button size="sm" asChild>
            <Link to="/dashboard/team">Criar Loja</Link>
          </Button>
        </div>
      ) : stores.length === 1 ? (
        <Button size="sm" onClick={() => abrir(stores[0]!)}>
          <Store className="mr-2 h-4 w-4" aria-hidden="true" />
          Abrir a Loja {stores[0]!.name}
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Escolha a Loja">
          {stores.map((loja) => (
            <Button key={loja.id} size="sm" variant="outline" onClick={() => abrir(loja)}>
              <Store className="mr-2 h-4 w-4" aria-hidden="true" />
              {loja.name}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}

function CriarEtapas({ onConfigurarEtapas }: { onConfigurarEtapas?: () => void }) {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  // Trava de clique duplo: o segundo clique nem chega ao banco (que também não
  // duplicaria: a função confere e devolve 0).
  const emAndamento = useRef(false);

  const prontas = useMutation({
    mutationFn: () => {
      if (!tenantId) throw new Error('Loja não carregada.');
      return criarEtapasPadrao(supabase, tenantId);
    },
    onSuccess: (criadas) => {
      if (criadas > 0) toast.success(`Etapas criadas: ${ETAPAS_PADRAO_TEXTO}.`);
      else toast.info('Este funil já tinha etapas.');
      void queryClient.invalidateQueries({ queryKey: ['funnel_stages'] });
      void queryClient.invalidateQueries({ queryKey: ['funnel-stages'] });
    },
    onError: (error: unknown) => {
      logger.warn('[EstadoVazioFunil] etapas prontas não criadas', { error });
      const msg = (error as { message?: string } | null)?.message;
      toast.error(msg && /Loja|Gestor|Gerente/.test(msg) ? msg : 'Não deu para criar as etapas. Tente de novo.');
    },
    onSettled: () => {
      emAndamento.current = false;
    },
  });

  const usarProntas = () => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    prontas.mutate();
  };

  return (
    <>
      <p className="text-muted-foreground">Este funil ainda não tem etapas. Crie as etapas antes de cadastrar leads.</p>
      <div className="flex flex-wrap gap-2">
        {onConfigurarEtapas && (
          <Button size="sm" variant="outline" onClick={onConfigurarEtapas} disabled={prontas.isPending}>
            Criar etapas agora
          </Button>
        )}
        <Button size="sm" onClick={usarProntas} disabled={prontas.isPending}>
          <Layers className="mr-2 h-4 w-4" aria-hidden="true" />
          {prontas.isPending ? 'Criando...' : 'Usar etapas prontas'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        As prontas são {ETAPAS_PADRAO_TEXTO}. Dá para renomear, reordenar e excluir depois.
      </p>
    </>
  );
}

export default EstadoVazioFunil;

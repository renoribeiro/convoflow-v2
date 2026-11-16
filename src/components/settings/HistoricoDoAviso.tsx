import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusVariant } from '@/components/shared/StatusBadge';
import { useEntregasDoAviso } from '@/hooks/useAvisos';
import {
  ROTULO_DA_SITUACAO,
  explicarResposta,
  quandoFoi,
  rotuloDoEvento,
  situacaoDaEntrega,
  textoDasTentativas,
  type SituacaoDaEntrega,
} from '@/lib/webhooks';

const COR_DA_SITUACAO: Record<SituacaoDaEntrega, StatusVariant> = {
  aceito: 'success',
  falhou: 'danger',
  tentando: 'warning',
  na_fila: 'neutral',
};

/**
 * "Últimos envios" de um aviso: os 10 mais recentes (quando, o quê, aceito ou
 * falhou e quantas tentativas), lidos de webhook_deliveries. Fechado, não busca
 * nada. Quando as 5 tentativas falham, o Gestor e o Gerente também recebem um
 * alerta no sino (20261116000001).
 */
export function HistoricoDoAviso({ avisoId }: { avisoId: string }) {
  const [aberto, setAberto] = useState(false);
  const { data: entregas = [], isLoading, isError } = useEntregasDoAviso(avisoId, aberto);
  const idLista = `historico-${avisoId}`;

  return (
    <div className="border-t pt-2">
      <Button
        variant="ghost"
        size="sm"
        className="px-0"
        aria-expanded={aberto}
        aria-controls={idLista}
        onClick={() => setAberto((a) => !a)}
      >
        {aberto ? <ChevronUp className="mr-1 h-4 w-4" aria-hidden="true" /> : <ChevronDown className="mr-1 h-4 w-4" aria-hidden="true" />}
        Últimos envios
      </Button>
      {aberto && (
        <div id={idLista} className="mt-2" data-testid="historico-do-aviso">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando os envios...</p>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">Não foi possível carregar os envios. Tente de novo em instantes.</p>
          ) : entregas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum envio ainda. Use "Enviar aviso de teste" para ver o primeiro aqui.
            </p>
          ) : (
            <ul className="space-y-2">
              {entregas.map((e) => {
                const situacao = situacaoDaEntrega(e);
                return (
                  <li key={e.id} className="rounded-md border p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">{quandoFoi(e.created_at)}</span>
                      <span className="font-medium">{rotuloDoEvento(e.event_type)}</span>
                      {e.teste && <StatusBadge status="info">Teste</StatusBadge>}
                      <StatusBadge status={COR_DA_SITUACAO[situacao]}>{ROTULO_DA_SITUACAO[situacao]}</StatusBadge>
                      <span className="text-muted-foreground">{textoDasTentativas(e)}</span>
                    </div>
                    {situacao !== 'na_fila' && (e.response_status !== null || e.error_message) && (
                      <p className="mt-1 text-muted-foreground">{explicarResposta(e.response_status, e.error_message)}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default HistoricoDoAviso;

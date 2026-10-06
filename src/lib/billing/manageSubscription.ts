import { supabase } from '@/integrations/supabase/client';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';
import type { CancelPhase } from '@/lib/billing/subscriptionActions';

export type ManageAction = 'preview' | 'schedule_cancel' | 'undo_cancel' | 'card_portal' | 'card_sync';

export interface ManageResponse {
  ok: true;
  phase?: CancelPhase;
  endsAt?: string | null;
  subscriptionStatus?: string;
  scheduled?: boolean;
  canCancel?: boolean;
  alreadyScheduled?: boolean;
  needsCard?: boolean;
  cardSynced?: boolean;
  url?: string;
}

const FALHA: Record<ManageAction, string> = {
  preview: 'Não foi possível consultar a assinatura agora.',
  schedule_cancel: 'Não foi possível cancelar agora.',
  undo_cancel: 'Não foi possível desfazer o cancelamento agora.',
  card_portal: 'Não foi possível abrir a troca de cartão agora.',
  card_sync: 'Não foi possível conferir o cartão novo agora.',
};

/**
 * Chama a edge function manage-subscription. Lança com a frase em pt-BR que o
 * SERVIDOR escreveu (ex.: "Só o Gerente da Conta pode cancelar…").
 */
export async function gerenciarAssinatura(action: ManageAction): Promise<ManageResponse> {
  const { data, error } = await supabase.functions.invoke('manage-subscription', { body: { action } });
  if (error) throw new Error(await mensagemDaEdgeFunction(error, FALHA[action]));
  if (!data || data.ok !== true) {
    const msg = typeof data?.error === 'string' ? data.error : FALHA[action];
    throw new Error(msg);
  }
  return data as ManageResponse;
}

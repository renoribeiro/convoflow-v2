import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  isProfileFetchDue,
  profileConnectionUsable,
  type ProfileContact,
} from '@/lib/instagram/contactProfile';

/** Máximo por chamada (o mesmo MAX_CONTACTS_PER_CALL da edge function). */
const BATCH = 20;
/**
 * Nesta aba, um contato pedido não é pedido de novo por 10 min — mesmo que a
 * função falhe ou ainda não esteja no ar. A marca 'pending' do servidor já
 * segura as outras abas.
 */
const SESSION_COOLDOWN_MS = 10 * 60_000;
const attempted = new Map<string, number>();

/** Só para os testes. */
export const __resetProfileAttempts = () => attempted.clear();

interface Options {
  contacts: ReadonlyArray<ProfileContact | null | undefined>;
  instances: ReadonlyArray<{ row: { id: string; provider?: string | null; is_active?: boolean | null; connection_config?: unknown } }>;
  enabled: boolean;
  /** Chamado depois que a função respondeu — a tela recarrega o que mostra. */
  onUpdated?: () => void;
}

/**
 * Busca, sob demanda, o nome e o @ dos clientes do Instagram que aparecem na
 * tela (fatia 4a). Nunca no recebimento da mensagem: é a lista (ou a conversa
 * aberta) que pede, uma vez por contato, e só com a conexão do Instagram
 * atendendo. Sem React Query de propósito: roda onde a lista roda.
 */
export function useInstagramContactProfiles({ contacts, instances, enabled, onUpdated }: Options) {
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  // Assinatura estável: só o que decide se chama.
  const signature = contacts
    .map((c) => (c ? `${c.id}:${c.channel}:${c.profile_status ?? '-'}:${c.profile_checked_at ?? '-'}` : ''))
    .join('|');
  const instancesSignature = instances.map((i) => `${i.row.id}:${JSON.stringify(i.row.connection_config ?? null)}`).join('|');

  useEffect(() => {
    if (!enabled) return;
    const now = new Date();
    const due = contacts
      .filter((c): c is ProfileContact => !!c)
      .filter((c) => isProfileFetchDue(c, now))
      .filter((c) => profileConnectionUsable(c, instances, now))
      .filter((c) => now.getTime() - (attempted.get(c.id) ?? 0) > SESSION_COOLDOWN_MS)
      .map((c) => c.id);
    const ids = [...new Set(due)].slice(0, BATCH);
    if (ids.length === 0) return;
    ids.forEach((id) => attempted.set(id, now.getTime()));

    supabase.functions
      .invoke('instagram-contact-profile', { body: { contactIds: ids } })
      .then(({ error }) => {
        if (error) {
          logger.warn('[instagram-contact-profile] chamada falhou', { pedidos: ids.length });
          return;
        }
        onUpdatedRef.current?.();
      })
      .catch(() => {
        /* rede: tenta de novo depois do intervalo desta aba */
      });
  }, [enabled, signature, instancesSignature]); // eslint-disable-line react-hooks/exhaustive-deps
}

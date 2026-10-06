// =============================================================================
// replySettings — o que a resposta de um cliente cancela, por Loja
// =============================================================================
// ESTE ARQUIVO É UM ESPELHO de `supabase/functions/_shared/followup-reply.ts`.
//
// As duas cópias existem porque nenhuma das duas pontas consegue importar a
// outra: o bundle do app não pode puxar código de Edge Function (arrastaria o
// cliente Supabase de servidor para o navegador) e o Deno não enxerga `src/`.
//
// Quem escreve é `src/components/settings/FollowupSettings.tsx`, via
// `updateTenantSettings`. Quem lê em produção é o Edge Function, no momento em
// que a mensagem do cliente chega.
//
// `src/lib/followups/replySettings.test.ts` compara as duas implementações
// campo a campo. Se mudar a regra aqui, mude lá — o teste quebra de propósito.
// =============================================================================

/** Formato guardado em `tenants.settings.followups`. */
export interface ReplyCancelSettings {
  /** Cancelar mensagens agendadas quando o cliente responder. */
  cancel_scheduled_on_reply: boolean;
  /** Cancelar tarefas manuais quando o cliente responder. */
  cancel_manual_on_reply: boolean;
}

/**
 * Agendado ligado, manual desligado — de propósito.
 *
 * Uma mensagem agendada que sai depois da resposta é o sistema falando por cima
 * do cliente: o dano aparece do lado de fora. Uma tarefa manual é trabalho que
 * um atendente planejou; apagá-la sozinho joga fora a decisão de uma pessoa.
 */
export const REPLY_CANCEL_DEFAULTS: ReplyCancelSettings = {
  cancel_scheduled_on_reply: true,
  cancel_manual_on_reply: false,
};

/** Lê `tenants.settings` cru e devolve os dois interruptores já resolvidos. */
export function normalizeReplyCancelSettings(rawSettings: unknown): ReplyCancelSettings {
  const node = (rawSettings as { followups?: Record<string, unknown> } | null | undefined)
    ?.followups;

  if (!node || typeof node !== 'object') return { ...REPLY_CANCEL_DEFAULTS };

  // Só um booleano de verdade sobrescreve o padrão.
  const pick = (key: keyof ReplyCancelSettings): boolean =>
    typeof node[key] === 'boolean' ? (node[key] as boolean) : REPLY_CANCEL_DEFAULTS[key];

  return {
    cancel_scheduled_on_reply: pick('cancel_scheduled_on_reply'),
    cancel_manual_on_reply: pick('cancel_manual_on_reply'),
  };
}

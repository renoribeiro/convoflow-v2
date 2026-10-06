/**
 * followup-reply.ts — o que a resposta de um cliente cancela.
 *
 * Chamado pelos webhooks (Evolution/WAHA/Meta) logo após resolver o contato de
 * uma mensagem recebida. Três coisas acontecem aqui, e elas são independentes:
 *
 *   1. SEQUÊNCIAS — cadências ativas do contato com `stop_on_reply=true` param
 *      (padrão HubSpot Sequences: auto-pause on reply). Isto NÃO é configurável
 *      por Loja: quem decide é a própria sequência, no campo dela.
 *
 *   2. TAREFA PRESA NA CADÊNCIA MORTA — quando a cadência parada estava
 *      esperando um passo `manual_task`, a tarefa criada para o operador fica
 *      apontando para uma cadência que não existe mais. Ela é fechada SEMPRE,
 *      fora do controle dos interruptores: não é trabalho que alguém planejou,
 *      é resíduo da cadência.
 *
 *   3. AVULSOS — follow-ups que não pertencem a cadência nenhuma
 *      (`mode='scheduled'` e `mode='manual'`) são cancelados conforme as
 *      preferências da Loja em `tenants.settings.followups`. Cada interruptor
 *      vale por si; um desligado não afeta o outro.
 *
 * Não-fatal por design: qualquer falha é apenas logada — nunca deve impedir o
 * processamento normal da mensagem recebida.
 */
/**
 * A única coisa que este módulo precisa de um cliente Supabase é `.from()`.
 *
 * Tipar assim, em vez de importar `SupabaseClient` da URL do esm.sh, é o que
 * deixa o arquivo ser importado pelo Vitest a partir de `src/` — o `tsc` do app
 * não resolve import por URL e acusaria TS2307 em toda rodada. O cliente real
 * dos webhooks satisfaz esta forma sem cast.
 */
type SupabaseLike = {
  from: (table: string) => any;
};

// ─── Preferências por Loja ────────────────────────────────────────────────────
// ESPELHO de `src/lib/followups/replySettings.ts`. As duas cópias existem
// porque o bundle do app não pode importar código de Edge Function e o Deno não
// pode importar de `src/`. `src/lib/followups/replySettings.test.ts` prova que
// as duas concordam — mudou aqui, mude lá.

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
 * do cliente: dano visível, do lado de fora. Uma tarefa manual é trabalho que um
 * atendente planejou; apagá-la sozinho joga fora a decisão de uma pessoa. Na
 * dúvida, o produto prefere descartar o robô e preservar o humano.
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

  // Só um booleano de verdade sobrescreve o padrão. String "false" vinda de um
  // formulário mal montado não pode virar `true` por acidente.
  const pick = (key: keyof ReplyCancelSettings): boolean =>
    typeof node[key] === 'boolean' ? (node[key] as boolean) : REPLY_CANCEL_DEFAULTS[key];

  return {
    cancel_scheduled_on_reply: pick('cancel_scheduled_on_reply'),
    cancel_manual_on_reply: pick('cancel_manual_on_reply'),
  };
}

// ─── Constantes internas ──────────────────────────────────────────────────────

/**
 * Os status que ainda têm futuro. `in_progress` fica FORA de propósito: o
 * dispatcher já reivindicou essa linha e pode estar dentro da chamada HTTP para
 * o WhatsApp neste exato momento. Cancelar aqui não desfaz o envio — só deixa o
 * banco mentindo sobre uma mensagem que saiu.
 */
const OPEN_STATUSES = ['pending', 'scheduled', 'overdue'] as const;

const REASON_STANDALONE = 'Cancelado automaticamente: o cliente respondeu.';
const REASON_ORPHAN_TASK =
  'Cancelado automaticamente: o cliente respondeu e a cadência desta tarefa parou.';

interface Logger {
  info?: (m: string, c?: unknown) => void;
  warn?: (m: string, c?: unknown) => void;
}

export interface ReplyCancelResult {
  /** Inscrições em cadência paradas por `stop_on_reply`. */
  sequencesStopped: number;
  /** Tarefas que pertenciam a uma cadência parada agora. */
  orphanTasksClosed: number;
  /** Follow-ups avulsos `mode='scheduled'` cancelados. */
  scheduledCancelled: number;
  /** Follow-ups avulsos `mode='manual'` cancelados. */
  manualCancelled: number;
}

const EMPTY_RESULT: ReplyCancelResult = {
  sequencesStopped: 0,
  orphanTasksClosed: 0,
  scheduledCancelled: 0,
  manualCancelled: 0,
};

// ─── Leitura das preferências ─────────────────────────────────────────────────

async function readSettings(
  supabase: SupabaseLike,
  tenantId: string,
  logger?: Logger,
): Promise<ReplyCancelSettings> {
  const { data, error } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    // Cai nos padrões: não deixar o cliente receber mensagem depois de
    // responder é o risco mais caro dos dois.
    logger?.warn?.('followup-reply: falha ao ler preferências da Loja; usando padrões', {
      tenantId,
      error: error.message,
    });
    return { ...REPLY_CANCEL_DEFAULTS };
  }

  return normalizeReplyCancelSettings((data as { settings?: unknown } | null)?.settings);
}

// ─── Cancelamento de avulsos ──────────────────────────────────────────────────

/**
 * Cancela os follow-ups abertos de UM contato num modo específico.
 *
 * O escopo é sempre (tenant, contato, modo, status aberto). O `tenant_id` é
 * redundante — `contact_id` já é chave primária global — e está aqui de
 * propósito: se um dia um contato for movido de Loja, ou um id chegar torto de
 * um webhook, o filtro extra é o que impede a escrita de vazar para outra Loja.
 */
async function cancelStandalone(
  supabase: SupabaseLike,
  tenantId: string,
  contactId: string,
  mode: 'scheduled' | 'manual',
  logger?: Logger,
): Promise<number> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('individual_followups')
    .update({
      status: 'cancelled',
      cancelled_at: nowIso,
      // `individual_followups` não tem coluna de motivo; `error_message` é onde
      // o dispatcher já grava os motivos de cancelamento (ver as trilhas de
      // conformidade e de contato sem telefone em process-followup-dispatch).
      error_message: REASON_STANDALONE,
      updated_at: nowIso,
    })
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId)
    .eq('mode', mode)
    .in('status', OPEN_STATUSES as unknown as string[])
    .select('id');

  if (error) {
    logger?.warn?.('followup-reply: falha ao cancelar follow-ups avulsos', {
      tenantId,
      mode,
      error: error.message,
    });
    return 0;
  }

  return (data as unknown[] | null)?.length ?? 0;
}

// ─── Entrada principal ────────────────────────────────────────────────────────

/**
 * Aplica tudo que a resposta de um contato deve cancelar.
 *
 * @param tenantId Loja dona da instância que recebeu a mensagem. Toda escrita é
 *                 filtrada por ele — uma resposta nunca toca linha de outra Loja.
 */
export async function applyReplyCancellations(
  supabase: SupabaseLike,
  tenantId: string,
  contactId: string,
  logger?: Logger,
): Promise<ReplyCancelResult> {
  if (!tenantId || !contactId) return { ...EMPTY_RESULT };

  const result: ReplyCancelResult = { ...EMPTY_RESULT };

  try {
    // ── 1. Sequências (inalterado: quem manda é `stop_on_reply` da cadência) ──
    const { data: enrolls, error } = await supabase
      .from('followup_sequence_enrollments')
      .select('id, sequence_id, waiting_on_followup_id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .eq('status', 'active');

    if (error) {
      logger?.warn?.('followup-reply: erro ao buscar inscrições', { error: error.message });
    } else if (enrolls && enrolls.length > 0) {
      const rows = enrolls as Array<{
        id: string;
        sequence_id: string;
        waiting_on_followup_id: string | null;
      }>;

      // Filtra apenas as cadências configuradas para parar na resposta.
      const seqIds = [...new Set(rows.map((e) => e.sequence_id))];
      const { data: seqs } = await supabase
        .from('followup_sequences')
        .select('id, stop_on_reply')
        .in('id', seqIds);

      const stopSeqIds = new Set(
        ((seqs ?? []) as Array<{ id: string; stop_on_reply: boolean | null }>)
          .filter((s) => s.stop_on_reply !== false)
          .map((s) => s.id),
      );
      const toStop = rows.filter((e) => stopSeqIds.has(e.sequence_id));

      if (toStop.length > 0) {
        const nowIso = new Date().toISOString();
        const { error: updErr } = await supabase
          .from('followup_sequence_enrollments')
          .update({
            status: 'stopped_reply',
            stopped_at: nowIso,
            stopped_reason: 'Contato respondeu',
            next_run_at: null,
            updated_at: nowIso,
          })
          .in(
            'id',
            toStop.map((e) => e.id),
          );

        if (updErr) {
          logger?.warn?.('followup-reply: erro ao parar inscrições', { error: updErr.message });
        } else {
          result.sequencesStopped = toStop.length;
          logger?.info?.('Sequências pausadas por resposta do contato', {
            contactId,
            count: toStop.length,
          });

          // ── 2. Tarefa órfã da cadência que acabou de morrer ─────────────────
          // Fora dos interruptores de propósito: esta tarefa não foi planejada
          // por ninguém, ela foi gerada pelo passo `manual_task` da cadência.
          // Sem a cadência, ela não tem mais o que concluir.
          const linkedIds = toStop
            .map((e) => e.waiting_on_followup_id)
            .filter((id): id is string => !!id);

          if (linkedIds.length > 0) {
            const { data: closed, error: orphanErr } = await supabase
              .from('individual_followups')
              .update({
                // 'cancelled', não 'completed': a tarefa nunca foi executada.
                // 'completed' alimenta métrica e relatório de produtividade —
                // marcar como feita uma tarefa que ninguém fez inventa trabalho
                // que não aconteceu.
                status: 'cancelled',
                cancelled_at: nowIso,
                error_message: REASON_ORPHAN_TASK,
                updated_at: nowIso,
              })
              .eq('tenant_id', tenantId)
              .in('id', linkedIds)
              .in('status', OPEN_STATUSES as unknown as string[])
              .select('id');

            if (orphanErr) {
              logger?.warn?.('followup-reply: erro ao fechar tarefa de cadência parada', {
                error: orphanErr.message,
              });
            } else {
              result.orphanTasksClosed = (closed as unknown[] | null)?.length ?? 0;
            }
          }
        }
      }
    }

    // ── 3. Avulsos, conforme as preferências da Loja ──────────────────────────
    const settings = await readSettings(supabase, tenantId, logger);

    if (settings.cancel_scheduled_on_reply) {
      result.scheduledCancelled = await cancelStandalone(
        supabase,
        tenantId,
        contactId,
        'scheduled',
        logger,
      );
    }

    if (settings.cancel_manual_on_reply) {
      result.manualCancelled = await cancelStandalone(
        supabase,
        tenantId,
        contactId,
        'manual',
        logger,
      );
    }

    if (result.scheduledCancelled > 0 || result.manualCancelled > 0) {
      logger?.info?.('Follow-ups avulsos cancelados por resposta do contato', {
        contactId,
        scheduled: result.scheduledCancelled,
        manual: result.manualCancelled,
      });
    }

    return result;
  } catch (e) {
    logger?.warn?.('followup-reply falhou', { error: (e as Error)?.message });
    return result;
  }
}

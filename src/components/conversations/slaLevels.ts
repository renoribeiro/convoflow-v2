/**
 * Sinalização de conversas não respondidas ("SLA de atendimento").
 *
 * Enquanto `conversationGroups.ts` responde "de quem é a vez?", este módulo
 * responde "há quanto tempo é a vez dela?". São coisas diferentes: uma conversa
 * pode estar em `waiting` há dois minutos (tudo certo) ou há dezoito horas
 * (alguém precisa agir agora). O nível de SLA é o segundo caso.
 *
 * Continua tudo DERIVADO — `conversations` não tem coluna de status. As únicas
 * entradas são quem falou por último, se há não lidas, quando foi a última
 * mensagem e o carimbo de silenciamento (`sla_muted_at`).
 *
 * A feature é opt-in por Loja (`tenants.settings.sla.enabled`, ver
 * `useSlaConfig`). Com ela desligada nada aqui é chamado.
 *
 * Regra (a primeira que casar vence):
 *   1. Silenciada (`sla_muted_at`)          → 'ok'   (o cliente não vai responder)
 *   2. Nós falamos por último e sem não lidas → 'ok'  (não há nada pendente)
 *   3..6. Compara as horas de espera com os limites da Loja.
 */

import type { AttendanceInput } from './conversationGroups';

export type SlaLevel = 'ok' | 'atencao' | 'atrasada' | 'critica';

/** Limites em HORAS de espera. Devem ser crescentes: atencao < atrasada < critica. */
export interface SlaThresholds {
  atencao: number;
  atrasada: number;
  critica: number;
}

/**
 * Janela de atendimento do WhatsApp: depois de 24h sem mensagem do cliente, a
 * Loja só consegue falar por template aprovado (e pago). Ver
 * `.agent/skills/meta-cloud-api/SKILL.md`.
 */
export const WHATSAPP_SERVICE_WINDOW_HOURS = 24;

/**
 * Padrões em horas.
 *
 * `critica: 20` não é número redondo por acaso: é a janela de 24h do WhatsApp
 * menos 4h de margem. Quem vê o vermelho ainda tem quatro horas para responder
 * de graça; passando das 24h a conversa só reabre com template pago.
 */
export const DEFAULT_SLA_THRESHOLDS: SlaThresholds = {
  atencao: 1,
  atrasada: 4,
  critica: WHATSAPP_SERVICE_WINDOW_HOURS - 4,
};

/** O que o resolvedor precisa saber de uma conversa. */
export interface SlaInput extends AttendanceInput {
  /** Carimbo de "cliente não vai responder". Preenchido = fora da sinalização. */
  sla_muted_at?: string | null;
}

/** Níveis que aparecem na tela, do mais grave para o menos. */
export const SLA_ALERT_LEVELS: readonly Exclude<SlaLevel, 'ok'>[] = [
  'critica',
  'atrasada',
  'atencao',
] as const;

/** Cor e texto de cada nível. Fica aqui junto da regra para não divergir dela. */
export const SLA_LEVEL_META: Record<
  Exclude<SlaLevel, 'ok'>,
  { label: string; dotClass: string; textClass: string }
> = {
  atencao: {
    label: 'Atenção',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-600 dark:text-amber-400',
  },
  atrasada: {
    label: 'Atrasada',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-600 dark:text-orange-400',
  },
  critica: {
    label: 'Crítica',
    dotClass: 'bg-red-500',
    textClass: 'text-red-600 dark:text-red-400',
  },
};

/** Aviso do nível crítico — a janela de 24h está perto de fechar. */
export const SLA_CRITICAL_HINT = 'Janela de 24h do WhatsApp perto de expirar';

export function resolveSlaLevel(
  conversation: SlaInput,
  thresholds: SlaThresholds = DEFAULT_SLA_THRESHOLDS,
  now: Date = new Date(),
): SlaLevel {
  // Alguém já disse que este cliente não vai responder — sai da sinalização.
  if (conversation.sla_muted_at) return 'ok';

  // Nós falamos por último e não há nada não lido: a bola não está conosco.
  if (conversation.last_message_direction !== 'inbound' && (conversation.unread_count ?? 0) === 0) {
    return 'ok';
  }

  // Sem data utilizável não dá para medir espera — não inventa alarme.
  if (!conversation.last_message_at) return 'ok';
  const last = new Date(conversation.last_message_at).getTime();
  if (Number.isNaN(last)) return 'ok';

  const hoursSince = (now.getTime() - last) / 3_600_000;

  if (hoursSince >= thresholds.critica) return 'critica';
  if (hoursSince >= thresholds.atrasada) return 'atrasada';
  if (hoursSince >= thresholds.atencao) return 'atencao';
  return 'ok';
}

/**
 * Tempo de espera humanizado em pt-BR: "há 12 min", "há 3h", "há 2 dias".
 *
 * Entrada inválida devolve "há instantes" — caminho defensivo: uma conversa sem
 * data válida nunca chega a ser sinalizada (`resolveSlaLevel` devolve 'ok').
 */
export function formatWaitingTime(
  lastMessageAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!lastMessageAt) return 'há instantes';
  const last = new Date(lastMessageAt).getTime();
  if (Number.isNaN(last)) return 'há instantes';

  const minutes = Math.floor((now.getTime() - last) / 60_000);
  if (minutes < 1) return 'há instantes';
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

/**
 * Sanitiza o que veio do JSONB da Conta. Cada campo inválido (ausente, não
 * numérico, zero ou negativo) cai no padrão — um settings corrompido degrada
 * para o comportamento padrão em vez de derrubar a lista.
 */
export function normalizeSlaThresholds(raw: unknown): SlaThresholds {
  const source = (raw ?? {}) as Partial<Record<keyof SlaThresholds, unknown>>;
  const pick = (key: keyof SlaThresholds): number => {
    const value = Number(source[key]);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_SLA_THRESHOLDS[key];
  };
  return {
    atencao: pick('atencao'),
    atrasada: pick('atrasada'),
    critica: pick('critica'),
  };
}

/** Erros por campo, em pt-BR. Objeto vazio = configuração válida. */
export type SlaThresholdErrors = Partial<Record<keyof SlaThresholds, string>>;

/**
 * Os limites precisam ser positivos e crescentes — senão um nível nunca é
 * alcançado (ex.: "atrasada" antes de "atenção" faria o amarelo não existir).
 */
export function validateSlaThresholds(thresholds: SlaThresholds): SlaThresholdErrors {
  const errors: SlaThresholdErrors = {};

  (Object.keys(thresholds) as (keyof SlaThresholds)[]).forEach((key) => {
    const value = thresholds[key];
    if (!Number.isFinite(value) || value <= 0) {
      errors[key] = 'Informe um número de horas maior que zero.';
    }
  });

  if (!errors.atrasada && !errors.atencao && thresholds.atrasada <= thresholds.atencao) {
    errors.atrasada = 'Precisa ser maior que o limite de atenção.';
  }
  if (!errors.critica && !errors.atrasada && thresholds.critica <= thresholds.atrasada) {
    errors.critica = 'Precisa ser maior que o limite de atrasada.';
  }

  return errors;
}

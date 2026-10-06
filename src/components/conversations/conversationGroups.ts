/**
 * Agrupamento de conversas por "nível de atendimento".
 *
 * O ConvoFlow não tem fila nem atribuição de atendente — `conversations` não
 * possui `status` nem `assigned_to`. Então o nível de atendimento é DERIVADO do
 * que já existe: quem falou por último, se há mensagens não lidas e há quanto
 * tempo a conversa se mexeu.
 *
 * Regra (primeira que casar vence):
 *   1. `waiting`     — há não lidas OU a última mensagem é do cliente.
 *                      Ninguém respondeu ainda: é a fila real de trabalho.
 *   2. `in_progress` — você respondeu por último e a conversa se mexeu nas
 *                      últimas 24h. Atendimento em andamento.
 *   3. `idle`        — respondida e sem movimento recente. Sem pendência.
 */

export type AttendanceGroup = 'waiting' | 'in_progress' | 'idle';

/** Campos mínimos necessários para classificar uma conversa. */
export interface AttendanceInput {
  unread_count: number;
  last_message_direction: 'inbound' | 'outbound';
  last_message_at: string | null;
}

/** Janela em que uma conversa respondida ainda conta como "em atendimento". */
export const IN_PROGRESS_WINDOW_HOURS = 24;

export const ATTENDANCE_GROUP_ORDER: readonly AttendanceGroup[] = [
  'waiting',
  'in_progress',
  'idle',
] as const;

export const ATTENDANCE_GROUP_META: Record<
  AttendanceGroup,
  { label: string; hint: string; dotClass: string }
> = {
  waiting: {
    label: 'Aguardando resposta',
    hint: 'O cliente falou por último e ainda não foi respondido.',
    dotClass: 'bg-[hsl(var(--unread-strong))]',
  },
  in_progress: {
    label: 'Em atendimento',
    hint: `Você respondeu por último e a conversa se mexeu nas últimas ${IN_PROGRESS_WINDOW_HOURS}h.`,
    dotClass: 'bg-accent',
  },
  idle: {
    label: 'Sem pendência',
    hint: 'Respondidas e sem movimento recente.',
    dotClass: 'bg-muted-foreground/40',
  },
};

/** Grupos que começam recolhidos quando o usuário liga o agrupamento. */
export const DEFAULT_COLLAPSED_GROUPS: readonly AttendanceGroup[] = ['idle'] as const;

export function resolveAttendanceGroup(
  conversation: AttendanceInput,
  now: Date = new Date(),
): AttendanceGroup {
  if ((conversation.unread_count ?? 0) > 0) return 'waiting';
  if (conversation.last_message_direction === 'inbound') return 'waiting';

  if (!conversation.last_message_at) return 'idle';
  const last = new Date(conversation.last_message_at).getTime();
  if (Number.isNaN(last)) return 'idle';

  const hoursSince = (now.getTime() - last) / 3_600_000;
  return hoursSince <= IN_PROGRESS_WINDOW_HOURS ? 'in_progress' : 'idle';
}

export interface AttendanceBucket<T> {
  group: AttendanceGroup;
  items: T[];
}

/**
 * Distribui as conversas nos buckets preservando a ordem original dentro de
 * cada um (a query já entrega por `last_message_at` desc). Buckets vazios são
 * omitidos.
 */
export function groupByAttendance<T extends AttendanceInput>(
  conversations: T[],
  now: Date = new Date(),
): AttendanceBucket<T>[] {
  const buckets: Record<AttendanceGroup, T[]> = {
    waiting: [],
    in_progress: [],
    idle: [],
  };

  for (const conversation of conversations) {
    buckets[resolveAttendanceGroup(conversation, now)].push(conversation);
  }

  return ATTENDANCE_GROUP_ORDER.filter((group) => buckets[group].length > 0).map((group) => ({
    group,
    items: buckets[group],
  }));
}

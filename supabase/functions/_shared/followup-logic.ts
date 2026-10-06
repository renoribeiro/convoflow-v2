/**
 * followup-logic.ts — lógica PURA do motor de follow-up.
 *
 * Sem dependências de Deno/Supabase de propósito: estas funções são importadas
 * tanto pelo edge function `process-followup-dispatch` (Deno) quanto pelos testes
 * Vitest (Node). Mantê-las puras (entrada → saída, sem efeitos colaterais) é o
 * que permite testá-las isoladamente.
 */

export type DelayUnit = 'minutes' | 'hours' | 'days';
export type RecurringType = 'daily' | 'weekly' | 'monthly' | 'custom';

/** Soma um intervalo (passo de sequência) a uma data, retornando uma nova Date. */
export function addDelay(from: Date, amount: number, unit: DelayUnit): Date {
  const ms =
    unit === 'minutes' ? amount * 60_000 :
    unit === 'hours'   ? amount * 3_600_000 :
    /* days */           amount * 86_400_000;
  return new Date(from.getTime() + ms);
}

/**
 * Próxima data de uma recorrência a partir de uma base.
 * - daily:   +1 dia
 * - weekly:  +7 dias
 * - monthly: +1 mês (preserva o dia, com rollover nativo de Date)
 * - custom:  +N dias (interval, mínimo 1)
 */
export function nextRecurrenceDate(base: Date, type: RecurringType, interval?: number | null): Date {
  const d = new Date(base.getTime());
  switch (type) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      return d;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      return d;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      return d;
    case 'custom':
      d.setDate(d.getDate() + Math.max(1, interval ?? 1));
      return d;
    default:
      // Tipo desconhecido — trata como diário para não travar o motor.
      d.setDate(d.getDate() + 1);
      return d;
  }
}

export interface RecurrenceParent {
  recurring: boolean;
  recurring_type: RecurringType | null;
  recurring_interval: number | null;
  recurring_count: number | null;   // nº de repetições restantes; <=0/null = ilimitado
  recurring_end_date: string | null;
  due_date: string;                  // ISO
}

export interface RecurrenceChild {
  generate: boolean;
  nextDue: Date | null;
  childRecurring: boolean;
  childCount: number;
}

/**
 * Decide se um follow-up recorrente concluído deve gerar a próxima instância e
 * com quais parâmetros de recorrência.
 *
 * Semântica de recurring_count (nº de repetições AINDA a gerar):
 *  - null / <= 0 ⇒ ilimitado (limitado apenas por recurring_end_date)
 *  - > 1         ⇒ gera filho com count-1 (continua recorrente)
 *  - === 1       ⇒ gera a ÚLTIMA ocorrência (filho com recurring=false)
 */
export function recurrenceChild(parent: RecurrenceParent): RecurrenceChild {
  const stop: RecurrenceChild = { generate: false, nextDue: null, childRecurring: false, childCount: 0 };

  if (!parent.recurring || !parent.recurring_type) return stop;

  const base = new Date(parent.due_date);
  if (isNaN(base.getTime())) return stop;

  const nextDue = nextRecurrenceDate(base, parent.recurring_type, parent.recurring_interval);

  // Bound por data fim.
  if (parent.recurring_end_date) {
    const end = new Date(parent.recurring_end_date);
    if (!isNaN(end.getTime()) && nextDue.getTime() > end.getTime()) return stop;
  }

  const count = parent.recurring_count;
  // Ilimitado.
  if (count == null || count <= 0) {
    return { generate: true, nextDue, childRecurring: true, childCount: 0 };
  }
  // Última ocorrência.
  if (count === 1) {
    return { generate: true, nextDue, childRecurring: false, childCount: 0 };
  }
  // Finito, ainda restam várias.
  return { generate: true, nextDue, childRecurring: true, childCount: count - 1 };
}

/**
 * Regra de conformidade da janela de 24h da Meta.
 * Retorna true se o envio FREE-FORM deve ser BLOQUEADO.
 *
 * - Só se aplica a instâncias oficiais (Meta Cloud API).
 * - Templates aprovados (isTemplate) são isentos — podem ir a qualquer hora.
 * - Free-form fora da janela de 24h ⇒ bloqueado (violaria os ToS).
 */
export function isFreeFormBlocked(opts: {
  isOfficial: boolean;
  isTemplate: boolean;
  inWindow: boolean;
}): boolean {
  if (!opts.isOfficial) return false;
  if (opts.isTemplate) return false;
  return !opts.inWindow;
}

/** Extrai o id da mensagem da resposta crua do provider (Evolution/Meta/WAHA). */
export function extractMessageId(result: any): string | null {
  if (!result) return null;
  if (result.key?.id) return result.key.id;
  if (Array.isArray(result.messages) && result.messages[0]?.id) return result.messages[0].id;
  if (result.id) return String(result.id);
  if (result.messageId) return String(result.messageId);
  return null;
}

/** Substituição de variáveis {var}/{{var}} para mensagens de follow-up. */
export function substituteVariables(text: string, variables: Record<string, string> = {}): string {
  let result = text ?? '';
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

/** Monta o dicionário de variáveis dinâmicas suportadas em follow-ups. */
export function buildFollowupVariables(opts: {
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  operatorName?: string | null;
}): Record<string, string> {
  const name = opts.contactName || '';
  const firstName = name.split(/\s+/)[0] || name;
  return {
    contact_name: name,
    first_name: firstName,
    phone: opts.phone || '',
    email: opts.email || '',
    operator_name: opts.operatorName || '',
    // Aliases PT-BR
    nome: name,
    primeiro_nome: firstName,
    telefone: opts.phone || '',
    operador: opts.operatorName || '',
  };
}

/**
 * variable-substitution — utilitário compartilhado de interpolação de variáveis.
 *
 * Usado pelo `automation-processor` (e disponível para o chatbot-engine) para
 * resolver tokens `{variavel}` em textos de ações, e para avaliar condições e
 * gatilhos baseados em variáveis.
 *
 * Mantém a MESMA semântica do chatbot-engine.ts (regex de token, operadores de
 * condição, derivação de first_name), para que `{nome}` etc. funcionem igual nos
 * dois módulos.
 */

export type VariableContext = Record<string, string | null | undefined>;

export type ConditionOperator = 'contains' | 'equals' | 'not_empty' | 'empty';

/**
 * Substitui `{token}` em `template` pelos valores de `context`.
 * Tokens desconhecidos são mantidos como estão. Espaços dentro das chaves são
 * tolerados (`{ nome }` === `{nome}`).
 */
export function substituteVariables(
  template: string | null | undefined,
  context: VariableContext,
): string {
  if (!template) return '';
  return template.replace(
    /\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}/g,
    (match: string, token: string) => {
      const value = context[token];
      return value === undefined || value === null ? match : String(value);
    },
  );
}

/** Deriva o primeiro nome a partir do nome completo. */
export function firstName(name?: string | null): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0] ?? '';
}

/** Avalia um operador de condição sobre o valor de uma variável. */
export function evaluateCondition(
  operator: ConditionOperator,
  variableValue: string | null | undefined,
  compareValue?: string | null,
): boolean {
  const v = (variableValue ?? '').toString();
  const c = (compareValue ?? '').toString();
  switch (operator) {
    case 'empty':
      return v.trim() === '';
    case 'not_empty':
      return v.trim() !== '';
    case 'equals':
      return v.trim().toLowerCase() === c.trim().toLowerCase();
    case 'contains':
      return v.toLowerCase().includes(c.toLowerCase());
    default:
      return false;
  }
}

/**
 * Monta o contexto de substituição para uma execução de automação a partir dos
 * dados do contato + variáveis persistidas (custom_fields) + dados do gatilho.
 *
 * Precedência (maior vence): triggerData > customFields > campos do contato/sistema.
 * Assim a variável recém-capturada do gatilho sempre reflete o valor mais novo.
 */
export function buildAutomationVariableContext(opts: {
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  incomingMessage?: string | null;
  customFields?: Record<string, unknown> | null;
  triggerData?: Record<string, unknown> | null;
  timezone?: string;
}): VariableContext {
  const tz = opts.timezone ?? 'America/Sao_Paulo';
  const now = new Date();

  const dateStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);

  const timeStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  // Normaliza valores (somente primitivos viram string; objetos são ignorados).
  const stringify = (val: unknown): string | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'object') return null;
    return String(val);
  };

  const customCtx: VariableContext = {};
  if (opts.customFields) {
    for (const [k, v] of Object.entries(opts.customFields)) {
      customCtx[k] = stringify(v);
    }
  }

  // Do triggerData só promovemos a variável capturada como token nomeado, além
  // de expor o valor cru em `captured_value`.
  const triggerCtx: VariableContext = {};
  if (opts.triggerData) {
    const varName = stringify(opts.triggerData['variable_name']);
    const varValue = stringify(opts.triggerData['value']);
    if (varName) triggerCtx[varName] = varValue;
    if (varValue !== null) triggerCtx['captured_value'] = varValue;
  }

  return {
    name: opts.contactName ?? null,
    first_name: firstName(opts.contactName),
    phone: opts.phone ?? null,
    email: opts.email ?? null,
    incoming_message: opts.incomingMessage ?? null,
    date: dateStr,
    time: timeStr,
    datetime: `${dateStr} ${timeStr}`,
    ...customCtx,
    ...triggerCtx,
  };
}

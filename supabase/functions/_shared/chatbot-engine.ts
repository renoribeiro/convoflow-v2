/**
 * Chatbot flow execution engine — Deno-compatible.
 *
 * This is the server-side mirror of `src/lib/chatbot/flowEngine.ts`.
 * All pure decision-logic functions are reproduced here with identical
 * semantics so the vitest suite that tests the src/ version stays valid
 * (both implementations must behave the same way).
 *
 * Dependencies: only Supabase JS client (passed in from the caller) and
 * the WhatsApp provider abstraction. No Node/browser APIs.
 */

// ---------------------------------------------------------------------------
// Types (mirrors src/types/chatbot-flow.types.ts — kept in sync manually)
// ---------------------------------------------------------------------------

import {
  CACHE_PRIMEIRO_CONTATO,
  CAMPO_NOME_DO_LEAD,
  JANELA_DA_MENSAGEM_ATUAL_MS,
  ORIGEM_DO_NOME_DO_LEAD,
  VARIAVEL_PRIMEIRO_CONTATO,
  limparNomeDoLead,
  podeTrocarNomeDoContato,
  valorPrimeiroContato,
  variavelDoNomeDoLead,
  variavelUnica,
} from './nome-do-lead.ts';

export type ChatbotNodeType =
  | 'start'
  | 'send_text'
  | 'ask_question'
  | 'show_options'
  | 'condition'
  | 'transfer_agent'
  | 'end_flow'
  | 'set_variable'
  | 'update_contact'
  | 'move_funnel';

export type ChatbotSessionStatus =
  | 'active'
  | 'completed'
  | 'transferred'
  | 'abandoned';

export type QuestionValidation = 'none' | 'email' | 'phone' | 'number';
export type ConditionOperator = 'contains' | 'equals' | 'not_empty' | 'empty';
export type UpdateContactField = 'name' | 'email' | 'phone' | 'tag' | 'lead_name';

export const DEFAULT_HANDLE = 'default';
export const CONDITION_TRUE_HANDLE = 'true';
export const CONDITION_FALSE_HANDLE = 'false';

export const INPUT_NODE_TYPES: ChatbotNodeType[] = ['ask_question', 'show_options'];
export const TERMINAL_NODE_TYPES: ChatbotNodeType[] = ['end_flow', 'transfer_agent'];

export interface ShowOptionsOption {
  id: string;
  label: string;
  value: string;
}

export interface VariableContext {
  name?: string | null;
  first_name?: string | null;
  phone?: string | null;
  incoming_message?: string | null;
  date?: string;
  time?: string;
  datetime?: string;
  [key: string]: string | null | undefined;
}

export interface ChatbotNode {
  id: string;
  chatbot_id: string;
  tenant_id: string;
  node_type: ChatbotNodeType;
  position_x: number;
  position_y: number;
  data: Record<string, unknown>;
}

export interface ChatbotEdge {
  id: string;
  chatbot_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
}

export interface ChatbotSession {
  id: string;
  chatbot_id: string;
  contact_id: string;
  tenant_id: string;
  whatsapp_instance_id: string | null;
  current_node_id: string | null;
  variables: Record<string, string>;
  status: ChatbotSessionStatus;
  awaiting_input: boolean;
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (identical semantics to src/lib/chatbot/flowEngine.ts)
// ---------------------------------------------------------------------------

/**
 * Replace `{token}` occurrences in `template` with values from `context`.
 * Unknown tokens are left as-is. Whitespace inside braces is tolerated.
 */
export function substituteVariables(
  template: string | null | undefined,
  context: VariableContext,
): string {
  if (!template) return '';
  return template.replace(
    /\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}/g,
    (match, token) => {
      const value = context[token as keyof VariableContext];
      return value === undefined || value === null ? match : String(value);
    },
  );
}

/** Derive first_name from a full name. */
export function firstName(name?: string | null): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0] ?? '';
}

/** Evaluate a condition node operator. */
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s().-]{8,20}$/;

/** Validate a user's free-text answer for an ask_question node. */
export function validateAnswer(
  validation: QuestionValidation,
  text: string,
): boolean {
  const t = (text ?? '').trim();
  switch (validation) {
    case 'email':
      return EMAIL_RE.test(t);
    case 'phone':
      return PHONE_RE.test(t) && t.replace(/\D/g, '').length >= 8;
    case 'number':
      return t !== '' && !Number.isNaN(Number(t.replace(',', '.')));
    case 'none':
    default:
      return t !== '';
  }
}

/** Does an incoming message match any of the trigger keywords? */
export function matchKeyword(message: string, keywords: string[]): boolean {
  if (!message || !keywords?.length) return false;
  const m = message.toLowerCase().trim();
  return keywords.some((k) => {
    const kw = k.toLowerCase().trim();
    return kw !== '' && m.includes(kw);
  });
}

/**
 * Match a user's reply to one of a menu's options. Accepts:
 *  - the 1-based index ("1", "2", ...)
 *  - an exact (case-insensitive) match of the option label or value
 */
export function matchOption(
  text: string,
  options: ShowOptionsOption[],
): ShowOptionsOption | null {
  if (!text || !options?.length) return null;
  const t = text.trim().toLowerCase();

  const asIndex = Number(t);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= options.length) {
    return options[asIndex - 1];
  }
  return (
    options.find(
      (o) =>
        o.label.trim().toLowerCase() === t ||
        o.value.trim().toLowerCase() === t,
    ) ?? null
  );
}

/**
 * Resolve the next node id from `currentNodeId` following the edge whose
 * source_handle matches `handle`. Falls back to the DEFAULT_HANDLE edge, then
 * to any single outgoing edge (mirrors src/ implementation exactly).
 */
export function resolveNextNodeId(
  edges: Pick<ChatbotEdge, 'source_node_id' | 'target_node_id' | 'source_handle'>[],
  currentNodeId: string,
  handle: string = DEFAULT_HANDLE,
): string | null {
  const outgoing = edges.filter((e) => e.source_node_id === currentNodeId);
  if (outgoing.length === 0) return null;

  const byHandle = outgoing.find(
    (e) => (e.source_handle ?? DEFAULT_HANDLE) === handle,
  );
  if (byHandle) return byHandle.target_node_id;

  const byDefault = outgoing.find(
    (e) => (e.source_handle ?? DEFAULT_HANDLE) === DEFAULT_HANDLE,
  );
  if (byDefault) return byDefault.target_node_id;

  return outgoing.length === 1 ? outgoing[0].target_node_id : null;
}

/** A node type that pauses the flow waiting for user input. */
export function isInputNode(nodeType: string): boolean {
  return (INPUT_NODE_TYPES as string[]).includes(nodeType);
}

/** A node type that terminates a flow (no outgoing edge required). */
export function isTerminalNode(nodeType: string): boolean {
  return (TERMINAL_NODE_TYPES as string[]).includes(nodeType);
}

// ---------------------------------------------------------------------------
// Business-hours helper
// ---------------------------------------------------------------------------

/**
 * Determine whether `now` (in UTC) falls inside the tenant's business hours.
 *
 * The tenant's `settings` JSONB may contain:
 *   {
 *     "business_hours": {
 *       "timezone": "America/Sao_Paulo",
 *       "schedule": {
 *         "0": null,               // Sunday — closed (null)
 *         "1": { "start": "09:00", "end": "18:00" },
 *         "2": { "start": "09:00", "end": "18:00" },
 *         ...
 *       }
 *     }
 *   }
 *
 * Fallback when absent: Mon–Fri 09:00–18:00 America/Sao_Paulo.
 * Returns true when OUTSIDE business hours (trigger fires when out-of-hours).
 */
export function isOutOfHours(
  tenantSettings: Record<string, unknown> | null | undefined,
  triggerTimezone?: string | null,
  nowOverride?: Date,
): boolean {
  const now = nowOverride ?? new Date();

  // Resolve timezone: prefer trigger-level, then tenant settings, then default.
  const bh = (tenantSettings?.business_hours ?? {}) as Record<string, unknown>;
  const timezone =
    triggerTimezone ||
    (bh.timezone as string | undefined) ||
    'America/Sao_Paulo';

  // Get the weekday and HH:MM in the configured timezone using Intl.DateTimeFormat.
  const localFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = localFormatter.formatToParts(now);
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0';

  // Intl weekday (short, en-US) → 0=Sun … 6=Sat
  const WEEKDAY_MAP: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayIndex = WEEKDAY_MAP[weekdayStr] ?? -1;
  const currentMinutes = parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10);

  // Default schedule: Mon–Fri 09:00–18:00
  const DEFAULT_SCHEDULE: Record<number, { start: string; end: string } | null> = {
    0: null,
    1: { start: '09:00', end: '18:00' },
    2: { start: '09:00', end: '18:00' },
    3: { start: '09:00', end: '18:00' },
    4: { start: '09:00', end: '18:00' },
    5: { start: '09:00', end: '18:00' },
    6: null,
  };

  const schedule =
    (bh.schedule as Record<string, { start: string; end: string } | null> | undefined) ??
    DEFAULT_SCHEDULE;

  const dayEntry = schedule[String(dayIndex)] ?? schedule[dayIndex] ?? null;

  if (dayEntry === null || dayEntry === undefined) {
    // Day is closed — we're outside business hours.
    return true;
  }

  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };

  const startMin = toMinutes(dayEntry.start ?? '09:00');
  const endMin = toMinutes(dayEntry.end ?? '18:00');

  return currentMinutes < startMin || currentMinutes >= endMin;
}

// ---------------------------------------------------------------------------
// Variable context builder
// ---------------------------------------------------------------------------

/** Build the substitution context from session + contact data. */
export function buildVariableContext(opts: {
  contactName?: string | null;
  phone?: string | null;
  incomingMessage?: string | null;
  sessionVariables?: Record<string, string>;
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

  return {
    name: opts.contactName ?? null,
    first_name: firstName(opts.contactName),
    phone: opts.phone ?? null,
    incoming_message: opts.incomingMessage ?? null,
    date: dateStr,
    time: timeStr,
    datetime: `${dateStr} ${timeStr}`,
    ...(opts.sessionVariables ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Trigger evaluation
// ---------------------------------------------------------------------------

export interface TriggerRow {
  id: string;
  chatbot_id: string;
  trigger_type: string;
  trigger_value: Record<string, unknown>;
  is_active: boolean;
}

export interface ChatbotRow {
  id: string;
  tenant_id: string;
  whatsapp_instance_id: string | null;
  is_active: boolean | null;
  is_published: boolean;
  builder_version: number;
  priority: number | null;
}

// ---------------------------------------------------------------------------
// Gatilho "Sem conversa humana recente" (no_recent_human, desde 2026-11-18)
//
// Dispara quando nenhuma pessoa escreveu na conversa nas últimas 12 horas e
// nenhum bot rodou para o contato nas últimas 24 horas. Quem decide é a função
// SQL public.chatbot_sem_conversa_humana (migração 20261118000001). A sessão
// aberta por ele leva a marca `__gatilho`: só ela para quando uma pessoa escreve
// (trigger trg_chatbot_para_com_humano) e vence depois de 12 horas esperando.
// Sessões dos gatilhos antigos não mudam.
// ---------------------------------------------------------------------------
export const GATILHO_SEM_CONVERSA_HUMANA = 'no_recent_human';
export const MARCA_DO_GATILHO = '__gatilho';
export const SESSAO_VENCE_EM_HORAS = 12;

/** A sessão do gatilho novo está esperando há mais de 12 horas? */
export function sessaoVencida(
  session: Pick<ChatbotSession, 'variables' | 'last_activity_at'>,
  now: Date = new Date(),
): boolean {
  if (session.variables?.[MARCA_DO_GATILHO] !== GATILHO_SEM_CONVERSA_HUMANA) return false;
  const ultima = new Date(session.last_activity_at).getTime();
  if (Number.isNaN(ultima)) return false;
  return now.getTime() - ultima >= SESSAO_VENCE_EM_HORAS * 60 * 60 * 1000;
}

/** Variáveis iniciais da sessão: a marca, só para o gatilho novo. */
export function variaveisIniciais(triggerType: string | null | undefined): Record<string, string> {
  return triggerType === GATILHO_SEM_CONVERSA_HUMANA
    ? { [MARCA_DO_GATILHO]: GATILHO_SEM_CONVERSA_HUMANA }
    : {};
}

/** O id da mensagem que o Evolution devolve no envio (`key.id`), se houver. */
export function idDoEnvioEvolution(resposta: unknown): string | null {
  const id = (resposta as { key?: { id?: unknown } } | null | undefined)?.key?.id;
  return typeof id === 'string' && id.trim() !== '' ? id : null;
}

/**
 * Evaluate whether a trigger fires for the current inbound message.
 *
 * NOTE: `no_agent_reply` is intentionally excluded here — it is time-based and
 * must be checked by a scheduler/cron job, not on inbound message arrival.
 * See `evaluateNoAgentReply` below.
 */
export function evaluateTrigger(
  trigger: TriggerRow,
  opts: {
    message: string;
    contactId: string;
    contactStageId?: string | null;
    priorInboundCount: number;
    tenantSettings?: Record<string, unknown> | null;
    now?: Date;
    /** Resposta de chatbot_sem_conversa_humana (só calculada se algum bot usa o gatilho). */
    semConversaHumanaRecente?: boolean;
  },
): boolean {
  if (!trigger.is_active) return false;

  switch (trigger.trigger_type) {
    case GATILHO_SEM_CONVERSA_HUMANA:
      return opts.semConversaHumanaRecente === true;
    case 'keyword': {
      const keywords = (trigger.trigger_value.keywords as string[]) ?? [];
      return matchKeyword(opts.message, keywords);
    }
    case 'first_contact': {
      // Fire only when this is the very first inbound message from this contact.
      return opts.priorInboundCount === 0;
    }
    case 'out_of_hours': {
      const tz = trigger.trigger_value.timezone as string | undefined;
      return isOutOfHours(opts.tenantSettings, tz, opts.now);
    }
    case 'funnel_stage': {
      const stageId = trigger.trigger_value.stage_id as string | undefined;
      return stageId != null && opts.contactStageId === stageId;
    }
    case 'no_agent_reply':
      // Not evaluated on inbound messages — needs a scheduler.
      return false;
    default:
      return false;
  }
}

/**
 * `no_agent_reply` evaluation for use by a cron/job scheduler.
 *
 * Call this function when scanning for conversations that have been waiting
 * for an agent reply beyond the configured threshold. The function is kept
 * here so the engine owns the logic; wiring it to a scheduler is out of
 * scope and must be done separately (e.g., a pg_cron job or a job-worker
 * invocation every N minutes).
 *
 * @param lastHumanReplyAt  Timestamp of the last human-agent outbound message
 *                          (null if no human has replied yet).
 * @param triggerMinutes    Threshold in minutes (from trigger_value.minutes).
 * @param now               Current time (defaults to Date.now()).
 * @returns true if the no-reply window has elapsed.
 */
export function evaluateNoAgentReply(
  lastHumanReplyAt: Date | null,
  triggerMinutes: number,
  now?: Date,
): boolean {
  const reference = now ?? new Date();
  if (lastHumanReplyAt === null) return false;
  const elapsedMs = reference.getTime() - lastHumanReplyAt.getTime();
  return elapsedMs >= triggerMinutes * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Core engine types
// ---------------------------------------------------------------------------

export interface EngineInput {
  tenant_id: string;
  whatsapp_instance_id: string;
  contact_id: string;
  phone: string;
  /** Plain-text content of the inbound message. */
  message: string;
  /** Nome do perfil do WhatsApp de quem escreveu, quando o webhook sabe (Evolution). */
  profile_name?: string | null;
}

export interface EngineContext {
  supabase: SupabaseClientLike;
  logger: LoggerLike;
  /** Resolved whatsapp_instance row (id, provider, connection_config, ...). */
  instance: WhatsAppInstanceLike;
}

// Lightweight structural types to avoid importing the full supabase-js/logger modules here.
export interface SupabaseClientLike {
  from(table: string): QueryBuilder;
  rpc(fn: string, args?: Record<string, unknown>): QueryBuilder;
  /** Optional in tests; present on the real supabase-js client. */
  functions?: {
    invoke(fn: string, opts: { body: unknown }): Promise<{ data: unknown; error: unknown }>;
  };
}

export interface QueryBuilder {
  select(cols?: string): this;
  insert(data: Record<string, unknown>): this;
  update(data: Record<string, unknown>): this;
  eq(col: string, val: unknown): this;
  neq(col: string, val: unknown): this;
  is(col: string, val: unknown): this;
  in(col: string, vals: unknown[]): this;
  lt(col: string, val: unknown): this;
  single(): Promise<{ data: unknown; error: unknown }>;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
  limit(n: number): this;
  order(col: string, opts?: { ascending?: boolean }): this;
  returns?(): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then<T = unknown>(onfulfilled: (value: { data: T; error: unknown }) => unknown): Promise<unknown>;
}

export interface WhatsAppInstanceLike {
  id: string;
  tenant_id: string;
  instance_key: string;
  provider?: string | null;
  connection_config?: Record<string, unknown> | null;
  evolution_api_url?: string | null;
  evolution_api_key?: string | null;
}

export interface LoggerLike {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Max steps guard
// ---------------------------------------------------------------------------

const MAX_STEPS_PER_INVOCATION = 50;

// Máximo de respostas inválidas num nó `show_options` antes do bot parar de
// reenviar o menu e encerrar a sessão. Evita o loop em que o lead não escolhe
// uma opção válida e o bot repete os "procedimentos" indefinidamente.
// Um nó pode sobrescrever via data.max_invalid_attempts.
const DEFAULT_MAX_INVALID_OPTION_ATTEMPTS = 3;

// Prefixo de variáveis de sessão internas (contadores, flags de controle). Nunca
// são espelhadas para o contato nem disparam automações.
const RESERVED_VAR_PREFIX = '__';

// ---------------------------------------------------------------------------
// Main engine entry point
// ---------------------------------------------------------------------------

/**
 * Process a single inbound message through the chatbot flow engine.
 *
 * Returns a structured result for logging / debugging purposes.
 * Errors are caught per-section and logged; partial progress is committed.
 */
export async function processChatbotMessage(
  input: EngineInput,
  ctx: EngineContext,
): Promise<{ acted: boolean; reason: string }> {
  const { supabase, logger, instance } = ctx;
  const { tenant_id, whatsapp_instance_id, contact_id, phone, message } = input;

  // ------------------------------------------------------------------
  // 1. Look for an existing active session
  // ------------------------------------------------------------------
  const { data: session, error: sessionErr } = await (supabase
    .from('chatbot_sessions')
    .select('*')
    .eq('contact_id', contact_id)
    .eq('whatsapp_instance_id', whatsapp_instance_id)
    .eq('status', 'active')
    .maybeSingle() as Promise<{ data: ChatbotSession | null; error: unknown }>);

  if (sessionErr) {
    logger.warn('Failed to look up active session', { error: String(sessionErr) });
  }

  if (session && sessaoVencida(session)) {
    // Gatilho novo: a espera venceu (12 h). A sessão acaba e a mensagem segue
    // como se não houvesse bot, pelos gatilhos abaixo.
    logger.info('Chatbot session expired after waiting; closing', { sessionId: session.id });
    await updateSession(supabase, session.id, {
      status: 'abandoned',
      awaiting_input: false,
      ended_at: new Date().toISOString(),
    });
  } else if (session) {
    logger.info('Active session found, routing reply', { sessionId: session.id });
    await handleSessionReply(session, message, input, ctx);
    return { acted: true, reason: 'existing_session' };
  }

  // ------------------------------------------------------------------
  // 2. No active session — find a matching chatbot trigger
  // ------------------------------------------------------------------
  const { data: chatbots, error: botsErr } = await (supabase
    .from('chatbots')
    .select('id, tenant_id, whatsapp_instance_id, is_active, is_published, builder_version, priority')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)
    .eq('is_published', true)
    .eq('builder_version', 2) as Promise<{ data: ChatbotRow[] | null; error: unknown }>);

  if (botsErr || !chatbots?.length) {
    logger.info('No active v2 chatbots for tenant', { tenant_id });
    return { acted: false, reason: 'no_v2_chatbots' };
  }

  // Filter by instance scope: null = all, or matching instance id.
  const scopedBots = chatbots.filter(
    (b) => b.whatsapp_instance_id === null || b.whatsapp_instance_id === whatsapp_instance_id,
  );

  if (!scopedBots.length) {
    return { acted: false, reason: 'no_scoped_chatbots' };
  }

  // Fetch tenant settings for business-hours evaluation.
  const { data: tenantRow } = await (supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenant_id)
    .maybeSingle() as Promise<{ data: { settings: Record<string, unknown> } | null; error: unknown }>);
  const tenantSettings = tenantRow?.settings ?? null;

  // Count prior inbound messages to detect first_contact trigger.
  const { data: msgCountRow } = await (supabase
    .from('messages')
    .select('id')
    .eq('contact_id', contact_id)
    .eq('tenant_id', tenant_id)
    .eq('direction', 'inbound')
    .limit(2) as Promise<{ data: { id: string }[] | null; error: unknown }>);
  // If msgCountRow has 2+ rows the current message was already persisted, so
  // priorInboundCount >= 1 means it's not first contact.
  const priorInboundCount = Math.max(0, (msgCountRow?.length ?? 0) - 1);

  // Fetch current contact stage for funnel_stage trigger.
  const { data: contactRow } = await (supabase
    .from('contacts')
    .select('current_stage_id')
    .eq('id', contact_id)
    .maybeSingle() as Promise<{ data: { current_stage_id: string | null } | null; error: unknown }>);
  const contactStageId = contactRow?.current_stage_id ?? null;

  // Evaluate triggers for each candidate chatbot (highest priority first).
  const sortedBots = [...scopedBots].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  let matchedBot: ChatbotRow | null = null;
  let matchedTrigger: TriggerRow | null = null;
  // Calculado uma vez, só quando algum bot tem o gatilho novo.
  let semConversaHumanaRecente: boolean | undefined;

  for (const bot of sortedBots) {
    const { data: triggers } = await (supabase
      .from('chatbot_triggers')
      .select('*')
      .eq('chatbot_id', bot.id)
      .eq('is_active', true) as Promise<{ data: TriggerRow[] | null; error: unknown }>);

    if (!triggers?.length) continue;

    for (const trigger of triggers) {
      if (trigger.trigger_type === GATILHO_SEM_CONVERSA_HUMANA && semConversaHumanaRecente === undefined) {
        const { data: livre, error: livreErr } = await (supabase.rpc('chatbot_sem_conversa_humana', {
          p_tenant_id: tenant_id,
          p_contact_id: contact_id,
        }) as unknown as Promise<{ data: boolean | null; error: unknown }>);
        if (livreErr) logger.warn('chatbot_sem_conversa_humana failed; trigger skipped', { error: String(livreErr) });
        // Na dúvida, não dispara: bot que fica quieto é melhor que bot por cima da pessoa.
        semConversaHumanaRecente = !livreErr && livre === true;
      }
      const fired = evaluateTrigger(trigger, {
        message,
        contactId: contact_id,
        contactStageId,
        priorInboundCount,
        tenantSettings,
        semConversaHumanaRecente,
      });
      if (fired) {
        matchedBot = bot;
        matchedTrigger = trigger;
        break;
      }
    }
    if (matchedBot) break;
  }

  if (!matchedBot) {
    return { acted: false, reason: 'no_trigger_matched' };
  }

  logger.info('Trigger matched, starting new session', {
    chatbotId: matchedBot.id,
    triggerType: matchedTrigger?.trigger_type,
  });

  await startNewSession(matchedBot, input, tenantSettings, ctx, matchedTrigger?.trigger_type);
  return { acted: true, reason: `trigger:${matchedTrigger?.trigger_type}` };
}

// ---------------------------------------------------------------------------
// Start a new session
// ---------------------------------------------------------------------------

async function startNewSession(
  bot: ChatbotRow,
  input: EngineInput,
  tenantSettings: Record<string, unknown> | null,
  ctx: EngineContext,
  triggerType?: string,
): Promise<void> {
  const { supabase, logger } = ctx;
  const { contact_id, whatsapp_instance_id, tenant_id, message } = input;

  // Find start node.
  const { data: startNode } = await (supabase
    .from('chatbot_nodes')
    .select('id, chatbot_id, tenant_id, node_type, position_x, position_y, data')
    .eq('chatbot_id', bot.id)
    .eq('node_type', 'start')
    .maybeSingle() as Promise<{ data: ChatbotNode | null; error: unknown }>);

  if (!startNode) {
    logger.warn('Chatbot has no start node', { chatbotId: bot.id });
    return;
  }

  // Create session.
  const { data: newSession, error: insertErr } = await (supabase
    .from('chatbot_sessions')
    .insert({
      chatbot_id: bot.id,
      contact_id,
      tenant_id,
      whatsapp_instance_id,
      current_node_id: startNode.id,
      variables: variaveisIniciais(triggerType),
      status: 'active',
      awaiting_input: false,
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .select('*')
    .single() as Promise<{ data: ChatbotSession | null; error: unknown }>);

  if (insertErr || !newSession) {
    logger.error('Failed to create chatbot session', { error: String(insertErr) });
    return;
  }

  // Load graph and run from start node.
  await executeFlowFromNode(startNode, newSession, input, tenantSettings, ctx);
}

// ---------------------------------------------------------------------------
// Handle reply to an existing awaiting session
// ---------------------------------------------------------------------------

async function handleSessionReply(
  session: ChatbotSession,
  message: string,
  input: EngineInput,
  ctx: EngineContext,
): Promise<void> {
  const { supabase, logger } = ctx;

  if (!session.awaiting_input || !session.current_node_id) {
    // Session is active but not awaiting input — ignore stray messages.
    logger.info('Session not awaiting input; ignoring message', { sessionId: session.id });
    return;
  }

  // Load the current (waiting) node.
  const { data: currentNode } = await (supabase
    .from('chatbot_nodes')
    .select('id, chatbot_id, tenant_id, node_type, position_x, position_y, data')
    .eq('id', session.current_node_id)
    .maybeSingle() as Promise<{ data: ChatbotNode | null; error: unknown }>);

  if (!currentNode) {
    logger.warn('Current node not found; abandoning session', { nodeId: session.current_node_id });
    await updateSession(supabase, session.id, { status: 'abandoned', ended_at: new Date().toISOString() });
    return;
  }

  // Fetch graph (needed to advance after validation).
  const { data: edges } = await (supabase
    .from('chatbot_edges')
    .select('id, chatbot_id, source_node_id, target_node_id, source_handle')
    .eq('chatbot_id', session.chatbot_id) as Promise<{ data: ChatbotEdge[] | null; error: unknown }>);

  const allEdges = edges ?? [];

  // Fetch tenant settings for variable context.
  const { data: tenantRow } = await (supabase
    .from('tenants')
    .select('settings')
    .eq('id', session.tenant_id)
    .maybeSingle() as Promise<{ data: { settings: Record<string, unknown> } | null; error: unknown }>);
  const tenantSettings = tenantRow?.settings ?? null;

  let nextNodeId: string | null = null;
  let updatedVars = { ...session.variables };

  if (currentNode.node_type === 'ask_question') {
    const d = currentNode.data as { message?: string; save_to_variable?: string; validation?: QuestionValidation };
    const validation: QuestionValidation = d.validation ?? 'none';
    const isValid = validateAnswer(validation, message);

    if (!isValid) {
      // Re-send the question with a short retry hint.
      await sendBotMessage(
        `${d.message ?? ''}\n\n_(Resposta inválida, tente novamente.)_`,
        input,
        ctx,
      );
      return; // Stay on same node.
    }

    // Save answer to variable.
    if (d.save_to_variable) {
      updatedVars[d.save_to_variable] = message.trim();
      // Automação pronta "Salvar o nome do lead" (aba Automação): a resposta
      // guardada na variável escolhida pela Loja é conferida, vira o nome do
      // contato quando pode, e a variável fica só com o primeiro nome (ou
      // vazia, quando a resposta não é um nome).
      if (d.save_to_variable === variavelDoNomeDoLead(tenantSettings)) {
        updatedVars[d.save_to_variable] = await salvarNomeDoLead(ctx, input, message);
      }
    }

    nextNodeId = resolveNextNodeId(allEdges, currentNode.id, DEFAULT_HANDLE);
  } else if (currentNode.node_type === 'show_options') {
    const d = currentNode.data as {
      message?: string;
      options?: ShowOptionsOption[];
      max_invalid_attempts?: number;
      invalid_end_message?: string;
    };
    const options = d.options ?? [];
    const matched = matchOption(message, options);

    // Contador de tentativas inválidas por nó. Sem limite, um lead que não
    // escolhe uma opção válida faria o bot reenviar o menu indefinidamente.
    const retryKey = `${RESERVED_VAR_PREFIX}opt_retries:${currentNode.id}`;

    if (!matched) {
      const maxAttempts = Math.max(1, d.max_invalid_attempts ?? DEFAULT_MAX_INVALID_OPTION_ATTEMPTS);
      const attempts = (parseInt(updatedVars[retryKey] ?? '0', 10) || 0) + 1;

      if (attempts >= maxAttempts) {
        // Excedeu o limite: avisa e encerra a sessão para o bot parar de reenviar.
        const closing =
          d.invalid_end_message?.trim() ||
          'Não consegui entender sua escolha. Encerrei o atendimento automático por aqui. Se precisar, é só mandar uma nova mensagem. 🙂';
        await sendBotMessage(closing, input, ctx);
        const { [retryKey]: _drop, ...cleanVars } = updatedVars;
        await updateSession(supabase, session.id, {
          variables: cleanVars,
          awaiting_input: false,
          status: 'completed',
          ended_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        });
        return;
      }

      // Ainda dentro do limite: registra a tentativa e reenvia o menu.
      updatedVars[retryKey] = String(attempts);
      await updateSession(supabase, session.id, {
        variables: updatedVars,
        last_activity_at: new Date().toISOString(),
      });
      await sendBotMessage(buildOptionsText(d.message ?? '', options), input, ctx);
      return;
    }

    // Escolha válida: zera o contador antes de avançar.
    delete updatedVars[retryKey];
    nextNodeId = resolveNextNodeId(allEdges, currentNode.id, matched.id);
  } else {
    logger.warn('Session awaiting input on non-input node type', {
      nodeType: currentNode.node_type,
      sessionId: session.id,
    });
    nextNodeId = resolveNextNodeId(allEdges, currentNode.id, DEFAULT_HANDLE);
  }

  // Persist variable updates and clear awaiting_input.
  await updateSession(supabase, session.id, {
    variables: updatedVars,
    awaiting_input: false,
    current_node_id: nextNodeId ?? session.current_node_id,
    last_activity_at: new Date().toISOString(),
  });

  // Persist captured variables to the contact and fire variable-driven
  // automations in real time (non-fatal).
  await onVariablesChanged(ctx, session.tenant_id, input.contact_id, session.variables, updatedVars);

  if (!nextNodeId) {
    await updateSession(supabase, session.id, { status: 'completed', ended_at: new Date().toISOString() });
    return;
  }

  // Continue execution from the next node.
  const updatedSession: ChatbotSession = {
    ...session,
    current_node_id: nextNodeId,
    variables: updatedVars,
    awaiting_input: false,
  };

  await continueFlow(updatedSession, nextNodeId, input, tenantSettings, ctx);
}

// ---------------------------------------------------------------------------
// Flow execution helpers
// ---------------------------------------------------------------------------

async function executeFlowFromNode(
  startNode: ChatbotNode,
  session: ChatbotSession,
  input: EngineInput,
  tenantSettings: Record<string, unknown> | null,
  ctx: EngineContext,
): Promise<void> {
  await continueFlow(session, startNode.id, input, tenantSettings, ctx);
}

async function continueFlow(
  session: ChatbotSession,
  fromNodeId: string,
  input: EngineInput,
  tenantSettings: Record<string, unknown> | null,
  ctx: EngineContext,
): Promise<void> {
  const { supabase, logger } = ctx;

  // Load entire graph for the chatbot.
  const { data: nodes } = await (supabase
    .from('chatbot_nodes')
    .select('id, chatbot_id, tenant_id, node_type, position_x, position_y, data')
    .eq('chatbot_id', session.chatbot_id) as Promise<{ data: ChatbotNode[] | null; error: unknown }>);

  const { data: edges } = await (supabase
    .from('chatbot_edges')
    .select('id, chatbot_id, source_node_id, target_node_id, source_handle')
    .eq('chatbot_id', session.chatbot_id) as Promise<{ data: ChatbotEdge[] | null; error: unknown }>);

  const nodeMap = new Map<string, ChatbotNode>(
    (nodes ?? []).map((n) => [n.id, n]),
  );
  const allEdges = edges ?? [];

  let currentNodeId: string | null = fromNodeId;
  let currentVars: Record<string, string> = { ...session.variables };
  let stepCount = 0;

  // Build initial contact info for variable context.
  const { data: contactRow } = await (supabase
    .from('contacts')
    .select('name')
    .eq('id', input.contact_id)
    .maybeSingle() as Promise<{ data: { name: string | null } | null; error: unknown }>);
  const contactName = contactRow?.name ?? null;

  while (currentNodeId && stepCount < MAX_STEPS_PER_INVOCATION) {
    stepCount++;

    const node = nodeMap.get(currentNodeId);
    if (!node) {
      logger.warn('Node not found during flow execution', { nodeId: currentNodeId });
      break;
    }

    logger.info('Executing node', { nodeId: node.id, type: node.node_type, step: stepCount });

    // Build substitution context with up-to-date vars.
    const varCtx = buildVariableContext({
      contactName,
      phone: input.phone,
      incomingMessage: input.message,
      sessionVariables: currentVars,
    });

    const prevVars = currentVars;
    const result = await executeNode(node, varCtx, currentVars, input, session, allEdges, ctx);

    if (result.updatedVars) {
      currentVars = result.updatedVars;
    }

    // Persist any newly set/changed variables to the contact and fire
    // variable-driven automations in real time (non-fatal).
    await onVariablesChanged(ctx, session.tenant_id, input.contact_id, prevVars, currentVars);

    // Persist state after each node.
    await updateSession(supabase, session.id, {
      current_node_id: currentNodeId,
      variables: currentVars,
      awaiting_input: result.awaiting ?? false,
      last_activity_at: new Date().toISOString(),
      ...(result.status ? { status: result.status } : {}),
      ...(result.status && result.status !== 'active' ? { ended_at: new Date().toISOString() } : {}),
    });

    if (result.awaiting) {
      logger.info('Flow paused awaiting input', { sessionId: session.id, nodeId: currentNodeId });
      return;
    }

    if (result.status && result.status !== 'active') {
      logger.info('Flow ended', { sessionId: session.id, status: result.status });
      return;
    }

    currentNodeId = result.nextNodeId ?? null;

    if (!currentNodeId) {
      // Ran off the end of the graph — complete gracefully.
      await updateSession(supabase, session.id, {
        status: 'completed',
        ended_at: new Date().toISOString(),
      });
      return;
    }
  }

  if (stepCount >= MAX_STEPS_PER_INVOCATION) {
    logger.warn('Max node steps reached; aborting flow to prevent infinite loop', {
      sessionId: session.id,
      steps: stepCount,
    });
    await updateSession(supabase, session.id, {
      status: 'abandoned',
      ended_at: new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// Single-node execution
// ---------------------------------------------------------------------------

interface NodeResult {
  nextNodeId?: string | null;
  awaiting?: boolean;
  status?: ChatbotSessionStatus;
  updatedVars?: Record<string, string>;
}

async function executeNode(
  node: ChatbotNode,
  varCtx: VariableContext,
  currentVars: Record<string, string>,
  input: EngineInput,
  session: ChatbotSession,
  edges: ChatbotEdge[],
  ctx: EngineContext,
): Promise<NodeResult> {
  const { supabase, logger } = ctx;

  switch (node.node_type) {
    // ------------------------------------------------------------------
    case 'start': {
      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId };
    }

    // ------------------------------------------------------------------
    case 'send_text': {
      const d = node.data as { message?: string; delay_seconds?: number };
      const text = substituteVariables(d.message ?? '', varCtx);
      const delaySec = Math.min(d.delay_seconds ?? 0, 10); // cap at 10 seconds

      if (delaySec > 0) {
        await delay(delaySec * 1000);
      }

      await sendBotMessage(text, input, ctx);

      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId };
    }

    // ------------------------------------------------------------------
    case 'ask_question': {
      const d = node.data as { message?: string };
      const text = substituteVariables(d.message ?? '', varCtx);
      await sendBotMessage(text, input, ctx);
      return { awaiting: true, nextNodeId: null };
    }

    // ------------------------------------------------------------------
    case 'show_options': {
      const d = node.data as { message?: string; options?: ShowOptionsOption[] };
      const options = d.options ?? [];
      const text = buildOptionsText(substituteVariables(d.message ?? '', varCtx), options);
      await sendBotMessage(text, input, ctx);
      return { awaiting: true, nextNodeId: null };
    }

    // ------------------------------------------------------------------
    case 'condition': {
      const d = node.data as {
        variable?: string;
        operator?: ConditionOperator;
        value?: string;
      };
      // "Primeiro contato" (primeiro_contato = sim/nao): calculado uma vez por
      // sessão e guardado com prefixo reservado (não vai para o contato).
      let updatedVars: Record<string, string> | undefined;
      let variableValue = d.variable ? (currentVars[d.variable] ?? null) : null;
      if (d.variable === VARIAVEL_PRIMEIRO_CONTATO && variableValue === null) {
        variableValue = currentVars[CACHE_PRIMEIRO_CONTATO]
          ?? await primeiroContato(supabase, session.tenant_id, input.contact_id, logger);
        updatedVars = { ...currentVars, [CACHE_PRIMEIRO_CONTATO]: variableValue };
      }
      const result = evaluateCondition(
        d.operator ?? 'equals',
        variableValue,
        d.value,
      );
      const handle = result ? CONDITION_TRUE_HANDLE : CONDITION_FALSE_HANDLE;
      const nextNodeId = resolveNextNodeId(edges, node.id, handle);
      return { nextNodeId, ...(updatedVars ? { updatedVars } : {}) };
    }

    // ------------------------------------------------------------------
    case 'set_variable': {
      const d = node.data as { variable_name?: string; value?: string };
      const updatedVars = { ...currentVars };
      if (d.variable_name) {
        updatedVars[d.variable_name] = substituteVariables(d.value ?? '', varCtx);
      }
      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId, updatedVars };
    }

    // ------------------------------------------------------------------
    case 'update_contact': {
      const d = node.data as { field?: UpdateContactField; value?: string };
      const rawValue = substituteVariables(d.value ?? '', varCtx);

      if (d.field === CAMPO_NOME_DO_LEAD) {
        // "Nome do lead": limpa a resposta, troca o nome só se ainda não há nome
        // salvo à mão, e a variável do valor ({nome}) passa a ter só o primeiro nome.
        // Mesma regra da automação pronta "Salvar o nome do lead". Com os dois
        // ligados (a troca da Loja para o cartão), o nome é salvo uma vez só:
        // depois da primeira, a origem é "lead" e não se troca mais.
        const variavel = variavelUnica(d.value);
        const primeiro = await salvarNomeDoLead(ctx, input, rawValue);
        const updatedVars = variavel ? { ...currentVars, [variavel]: primeiro } : undefined;
        const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
        return { nextNodeId, ...(updatedVars ? { updatedVars } : {}) };
      }

      if (d.field === 'tag') {
        // Upsert tag by name, then link to contact.
        await upsertContactTag(supabase, input.contact_id, session.tenant_id, rawValue, logger);
      } else if (d.field && ['name', 'email', 'phone'].includes(d.field)) {
        await (supabase
          .from('contacts')
          .update({ [d.field]: rawValue, updated_at: new Date().toISOString() })
          .eq('id', input.contact_id) as unknown as Promise<void>);
      }

      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId };
    }

    // ------------------------------------------------------------------
    case 'move_funnel': {
      const d = node.data as { stage_id?: string };
      if (d.stage_id) {
        await (supabase
          .from('contacts')
          .update({
            current_stage_id: d.stage_id,
            stage_entered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.contact_id) as unknown as Promise<void>);
      }
      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId };
    }

    // ------------------------------------------------------------------
    case 'transfer_agent': {
      const d = node.data as {
        message?: string;
        assign_to?: string;
        user_id?: string | null;
      };
      if (d.message) {
        const text = substituteVariables(d.message, varCtx);
        await sendBotMessage(text, input, ctx);
      }

      // 'specific_user': dá a conversa à pessoa nomeada, se puder (regra e
      // motivos em assignConversationToTransferTarget). Só quem recebeu é
      // avisado. 'any' não faz nada aqui de propósito: a sessão termina logo
      // abaixo (status 'transferred') e trg_rotation_assign_on_session_end
      // entrega ao rodízio quando ele está ligado — ou deixa sem responsável.
      if (d.assign_to === 'specific_user' && d.user_id) {
        const result = await assignConversationToTransferTarget(supabase, input, d.user_id, logger);
        logger.info('transfer_agent: assignment outcome', {
          outcome: result.outcome,
          reason: result.reason ?? null,
          conversation_id: result.conversationId ?? null,
          node_id: node.id,
        });
        if (result.outcome === 'assigned') {
          await createTransferNotification(
            supabase,
            input,
            session,
            d.user_id,
            result.conversationId,
            logger,
          );
        }
      }

      return { status: 'transferred' };
    }

    // ------------------------------------------------------------------
    case 'end_flow': {
      const d = node.data as { message?: string; silent?: boolean };
      if (!d.silent && d.message) {
        const text = substituteVariables(d.message, varCtx);
        await sendBotMessage(text, input, ctx);
      }
      return { status: 'completed' };
    }

    // ------------------------------------------------------------------
    default: {
      logger.warn('Unknown node type encountered during execution', { type: node.node_type });
      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildOptionsText(prompt: string, options: ShowOptionsOption[]): string {
  const lines = options.map((o, i) => `${i + 1}) ${o.label}`);
  return `${prompt}\n\n${lines.join('\n')}`;
}

/**
 * Envia um texto automático e grava a linha como mensagem de bot
 * (is_from_bot = true): não conta como resposta de pessoa, não para nem
 * reabre o chatbot. `source` diz quem mandou ('chatbot' ou 'aviso_espera').
 */
export async function sendBotMessage(
  text: string,
  input: EngineInput,
  ctx: EngineContext,
  source = 'chatbot',
): Promise<void> {
  const { supabase, logger, instance } = ctx;

  if (!text.trim()) return;

  // Evolution devolve o que enviamos como evento send.message (o "eco"). Para o
  // eco nunca virar mensagem de pessoa nem aparecer duas vezes, a linha do bot
  // é gravada ANTES do envio e ganha o id do Evolution logo depois; o
  // evolution-webhook reconhece o eco por esse id ou, se chegar antes, pela
  // linha do bot com o mesmo texto ainda sem id. Outros provedores: como antes.
  if ((instance.provider ?? 'evolution') === 'evolution') {
    await sendBotMessageEvolution(text, input, ctx, source);
    return;
  }

  try {
    // Import provider factory dynamically to keep this file importable in test
    // environments without Deno network access.
    // NOTE: use the shared _shared/provider-factory.ts (async) — for the Meta
    // ('official') provider it resolves the access token from Vault via the
    // get_instance_meta_token RPC. The token is NOT in connection_config.
    const { ProviderFactory } = await import('./provider-factory.ts');
    const provider = await ProviderFactory.getProvider(instance, supabase as unknown as Parameters<typeof ProviderFactory.getProvider>[1]);
    await provider.sendMessage(input.phone, text);
  } catch (err) {
    logger.error('Failed to send bot message via provider', {
      error: String(err),
      phone: input.phone,
    });
    // Do not rethrow — a send failure should not abort the entire flow.
  }

  // Persist outbound bot message row.
  try {
    await (supabase
      .from('messages')
      .insert({
        contact_id: input.contact_id,
        tenant_id: input.tenant_id,
        whatsapp_instance_id: input.whatsapp_instance_id,
        direction: 'outbound',
        message_type: 'text',
        content: text,
        status: 'sent',
        is_from_bot: true,
        source,
      }) as unknown as Promise<void>);
  } catch (err) {
    logger.warn('Failed to persist outbound bot message row', { error: String(err) });
  }
}

async function sendBotMessageEvolution(
  text: string,
  input: EngineInput,
  ctx: EngineContext,
  source: string,
): Promise<void> {
  const { supabase, logger, instance } = ctx;

  let rowId: string | null = null;
  try {
    const { data } = await (supabase
      .from('messages')
      .insert({
        contact_id: input.contact_id,
        tenant_id: input.tenant_id,
        whatsapp_instance_id: input.whatsapp_instance_id,
        direction: 'outbound',
        message_type: 'text',
        content: text,
        status: 'pending',
        is_from_bot: true,
        source,
      })
      .select('id')
      .single() as Promise<{ data: { id: string } | null; error: unknown }>);
    rowId = data?.id ?? null;
  } catch (err) {
    logger.warn('Failed to persist outbound bot message row', { error: String(err) });
  }

  let evolutionId: string | null = null;
  let sent = false;
  try {
    const { ProviderFactory } = await import('./provider-factory.ts');
    const provider = await ProviderFactory.getProvider(
      instance as unknown as Parameters<typeof ProviderFactory.getProvider>[0],
      supabase as unknown as Parameters<typeof ProviderFactory.getProvider>[1],
    );
    evolutionId = idDoEnvioEvolution(await provider.sendMessage(input.phone, text));
    sent = true;
  } catch (err) {
    logger.error('Failed to send bot message via provider', { error: String(err) });
  }

  if (!rowId) return;
  try {
    const status = sent ? 'sent' : 'failed';
    const { error } = await (supabase
      .from('messages')
      .update({ status, ...(evolutionId ? { evolution_message_id: evolutionId } : {}) })
      .eq('id', rowId) as unknown as Promise<{ error: unknown }>);
    if (error && evolutionId) {
      // O id já está noutra linha (eco gravado antes): fica só a situação.
      await (supabase.from('messages').update({ status }).eq('id', rowId) as unknown as Promise<void>);
    }
  } catch (err) {
    logger.warn('Failed to update outbound bot message row', { error: String(err) });
  }
}

async function updateSession(
  supabase: SupabaseClientLike,
  sessionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await (supabase
    .from('chatbot_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', sessionId) as unknown as Promise<void>);
}

/**
 * Mirror collected chatbot variables onto `contacts.custom_fields` so that
 * automations (and any other consumer) can read them after the session ends.
 * Read-modify-write merge; non-fatal.
 */
async function persistVariablesToContact(
  ctx: EngineContext,
  contactId: string,
  patch: Record<string, string>,
): Promise<void> {
  const { supabase, logger } = ctx;
  try {
    const { data } = await (supabase
      .from('contacts')
      .select('custom_fields')
      .eq('id', contactId)
      .maybeSingle() as Promise<{ data: { custom_fields: Record<string, unknown> | null } | null; error: unknown }>);

    const existing = (data?.custom_fields ?? {}) as Record<string, unknown>;
    await (supabase
      .from('contacts')
      .update({ custom_fields: { ...existing, ...patch }, updated_at: new Date().toISOString() })
      .eq('id', contactId) as unknown as Promise<void>);
  } catch (err) {
    logger.warn('Failed to persist variables to contact.custom_fields', { error: String(err) });
  }
}

/**
 * Fire the `variable_captured` automation trigger for a single variable change.
 * Fire-and-forget via the edge function; non-fatal. Skipped in tests where the
 * supabase client mock has no `functions` accessor.
 */
async function fireVariableCapturedAutomation(
  ctx: EngineContext,
  payload: {
    tenant_id: string;
    contact_id: string;
    variable_name: string;
    value: string;
    previous_value: string | null;
  },
): Promise<void> {
  const { supabase, logger } = ctx;
  try {
    if (!supabase.functions?.invoke) return;
    await supabase.functions.invoke('automation-processor', {
      body: {
        trigger: {
          type: 'variable_captured',
          tenant_id: payload.tenant_id,
          contact_id: payload.contact_id,
          data: {
            variable_name: payload.variable_name,
            value: payload.value,
            previous_value: payload.previous_value,
          },
        },
      },
    });
  } catch (err) {
    logger.warn('Failed to fire variable_captured automation', {
      error: String(err),
      variable: payload.variable_name,
    });
  }
}

/**
 * Salva o nome do lead (automação pronta "Salvar o nome do lead" e o bloco
 * "Atualizar contato" › Nome do lead): confere a resposta, troca o nome do
 * contato só quando ele está vazio, é só o telefone ou veio do perfil do
 * WhatsApp (contacts.name_source), grava a origem "lead" e devolve o primeiro
 * nome (vazio quando a resposta não é um nome). Erro ao gravar não para o bot.
 */
export async function salvarNomeDoLead(
  ctx: Pick<EngineContext, 'supabase' | 'logger'>,
  input: Pick<EngineInput, 'contact_id' | 'phone' | 'profile_name'>,
  resposta: string,
): Promise<string> {
  const { supabase, logger } = ctx;
  const limpo = limparNomeDoLead(resposta);
  if (!limpo) return '';
  try {
    const { data: atual } = await (supabase
      .from('contacts')
      .select('name, phone, name_source')
      .eq('id', input.contact_id)
      .maybeSingle() as Promise<{
        data: { name: string | null; phone: string | null; name_source: string | null } | null;
        error: unknown;
      }>);
    if (
      podeTrocarNomeDoContato({
        atual: atual?.name,
        telefone: atual?.phone ?? input.phone,
        origem: atual?.name_source,
        nomeDoPerfil: input.profile_name,
      })
    ) {
      await (supabase
        .from('contacts')
        .update({ name: limpo.completo, name_source: ORIGEM_DO_NOME_DO_LEAD, updated_at: new Date().toISOString() })
        .eq('id', input.contact_id) as unknown as Promise<void>);
    } else {
      logger.info('Lead name kept: contact already has a saved name', { contactId: input.contact_id });
    }
  } catch (err) {
    logger.warn('Lead name not saved', { contactId: input.contact_id, error: String(err) });
  }
  return limpo.primeiro;
}

/**
 * Diff `prevVars` vs `nextVars`; for each changed key, persist it to the contact
 * and fire the real-time `variable_captured` automation trigger. Non-fatal.
 */
async function onVariablesChanged(
  ctx: EngineContext,
  tenantId: string,
  contactId: string,
  prevVars: Record<string, string>,
  nextVars: Record<string, string>,
): Promise<void> {
  const changed: Record<string, string> = {};
  for (const [k, v] of Object.entries(nextVars)) {
    // Variáveis internas de controle (ex.: contadores de tentativa) não devem
    // vazar para custom_fields nem disparar automações.
    if (k.startsWith(RESERVED_VAR_PREFIX)) continue;
    if (prevVars[k] !== v) changed[k] = v;
  }
  if (Object.keys(changed).length === 0) return;

  await persistVariablesToContact(ctx, contactId, changed);

  for (const [k, v] of Object.entries(changed)) {
    await fireVariableCapturedAutomation(ctx, {
      tenant_id: tenantId,
      contact_id: contactId,
      variable_name: k,
      value: v,
      previous_value: prevVars[k] ?? null,
    });
  }
}

/**
 * Primeiro contato do contato na Loja: nenhuma mensagem (de qualquer lado) de
 * contato com o mesmo telefone na Loja, fora a rajada que abriu o bot agora.
 * Em erro, responde "nao" (o caminho de quem volta não pede nome).
 */
async function primeiroContato(
  supabase: SupabaseClientLike,
  tenantId: string,
  contactId: string,
  logger: LoggerLike,
): Promise<'sim' | 'nao'> {
  try {
    const { data: contato } = await (supabase
      .from('contacts')
      .select('phone')
      .eq('id', contactId)
      .maybeSingle() as Promise<{ data: { phone: string | null } | null; error: unknown }>);
    let ids = [contactId];
    if (contato?.phone) {
      const { data: mesmos } = await (supabase
        .from('contacts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone', contato.phone) as unknown as Promise<{ data: { id: string }[] | null; error: unknown }>);
      ids = [...new Set([contactId, ...(mesmos ?? []).map((c) => c.id)])];
    }
    const antes = new Date(Date.now() - JANELA_DA_MENSAGEM_ATUAL_MS).toISOString();
    const { data: anteriores, error } = await (supabase
      .from('messages')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('contact_id', ids)
      .lt('created_at', antes)
      .limit(1) as unknown as Promise<{ data: { id: string }[] | null; error: unknown }>);
    if (error) throw error;
    return valorPrimeiroContato(anteriores?.length ?? 0);
  } catch (err) {
    logger.warn('primeiro_contato check failed; treating as returning contact', { error: String(err) });
    return 'nao';
  }
}

async function upsertContactTag(
  supabase: SupabaseClientLike,
  contactId: string,
  tenantId: string,
  tagName: string,
  logger: LoggerLike,
): Promise<void> {
  if (!tagName.trim()) return;

  try {
    // Find or create tag by name (unique per tenant).
    let { data: tag } = await (supabase
      .from('tags')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', tagName.trim())
      .maybeSingle() as Promise<{ data: { id: string } | null; error: unknown }>);

    if (!tag) {
      const { data: newTag } = await (supabase
        .from('tags')
        .insert({ tenant_id: tenantId, name: tagName.trim() })
        .select('id')
        .single() as Promise<{ data: { id: string } | null; error: unknown }>);
      tag = newTag;
    }

    if (!tag) return;

    // Insert contact_tag (ignore conflict — PK is (contact_id, tag_id)).
    await (supabase
      .from('contact_tags')
      .insert({ contact_id: contactId, tag_id: tag.id }) as unknown as Promise<void>);
  } catch (err) {
    logger.warn('Failed to upsert contact tag', { error: String(err), tagName });
  }
}

// ---------------------------------------------------------------------------
// transfer_agent — quem recebe a conversa
//
// O nó guarda `user_id` (auth.users.id, o que o painel lê de profiles.user_id);
// `conversations.assigned_profile_id` é FK para profiles.id. A tradução é feita
// aqui, em tempo de execução — nenhum nó publicado precisa ser reescrito.
//
// Regra (decidida em 2026-09-15, não reabrir aqui):
//   - só atribui conversa SEM responsável — a mesma regra de
//     rotation_assign_conversation. Dono existente fica; só se registra o motivo.
//   - pessoa inelegível (sem perfil, suspensa/excluída/pendente, fora da Loja do
//     bot, cargo que não atende) NÃO recebe: a conversa fica sem responsável e o
//     trigger trg_rotation_assign_on_session_end, que dispara quando a sessão
//     termina logo abaixo, entrega ao rodízio se ele estiver ligado.
//   - 0 % no rodízio NÃO é inelegibilidade: 0 % quer dizer "não recebe conversa
//     nova por sorteio", não "o fluxo não pode nomeá-la".
//   - assigned_by = NULL: ninguém passou a conversa (a policy de visibilidade lê
//     assigned_by como "passei adiante"), o sino tg_notify_conversation_assigned
//     fica mudo (o aviso é gravado aqui, uma vez só) e é o que rodízio e regra
//     de tempo já gravam.
// ---------------------------------------------------------------------------

/** Perfil como o resolvedor precisa vê-lo (subconjunto de public.profiles). */
export interface TransferCandidateProfile {
  id: string;
  user_id: string;
  tenant_id: string | null;
  status: string | null;
  role: string | null;
}

/** Cargos que atendem conversa numa Loja. Gerente vive na Conta, nunca casa o tenant. */
export const TRANSFER_ELIGIBLE_ROLES: ReadonlyArray<string> = ['atendente', 'gestor'];

export type TransferTargetReason = 'not_found' | 'other_tenant' | 'inactive' | 'role';

export type TransferTargetResolution =
  | { ok: true; profileId: string }
  | { ok: false; reason: TransferTargetReason };

/**
 * Traduz o `user_id` guardado no nó para o profiles.id que vai em
 * assigned_profile_id, e diz se a pessoa pode receber a conversa.
 *
 * `profiles` são TODAS as linhas de profiles com aquele user_id (a UNIQUE é
 * (user_id, tenant_id), então pode haver mais de uma). A que conta é a da Loja
 * do bot; as outras só servem para distinguir "fora da Loja" de "não existe".
 *
 * Pura de propósito: é o que o Vitest cobre.
 */
export function resolveTransferTarget(
  profiles: ReadonlyArray<TransferCandidateProfile> | null | undefined,
  tenantId: string,
): TransferTargetResolution {
  const rows = profiles ?? [];
  if (rows.length === 0) return { ok: false, reason: 'not_found' };

  const inTenant = rows.find((p) => p.tenant_id === tenantId);
  if (!inTenant) return { ok: false, reason: 'other_tenant' };
  if (inTenant.status !== 'active') return { ok: false, reason: 'inactive' };
  if (!inTenant.role || !TRANSFER_ELIGIBLE_ROLES.includes(inTenant.role)) {
    return { ok: false, reason: 'role' };
  }
  return { ok: true, profileId: inTenant.id };
}

export type TransferAssignOutcome =
  | 'assigned'
  | 'already_owned'
  | 'ineligible'
  | 'no_conversation'
  | 'lost_race'
  | 'error';

export interface TransferAssignResult {
  outcome: TransferAssignOutcome;
  /** profiles.id de quem recebeu (só em 'assigned'). */
  profileId?: string;
  /** Motivo (só em 'ineligible'). */
  reason?: TransferTargetReason;
  conversationId?: string | null;
}

/**
 * Dá a conversa do contato à pessoa nomeada no nó — se ela puder receber e se
 * a conversa ainda não tiver responsável. Nunca lança: qualquer falha vira
 * 'error' com aviso no log, porque o fluxo tem de terminar e o cliente tem de
 * receber a mensagem de qualquer jeito. Conversa sem responsável é estado
 * inócuo.
 *
 * A conversa é encontrada por (tenant_id, contact_id), a UNIQUE da tabela —
 * a mesma chave que handle_message_conversation e
 * tg_rotation_assign_on_session_end usam.
 *
 * O UPDATE leva `assigned_profile_id IS NULL` no WHERE, não só na checagem
 * anterior: a próxima mensagem do cliente pode ter atribuído no meio do
 * caminho (zz_rotation_assign_on_inbound). Zero linhas = 'lost_race'.
 */
export async function assignConversationToTransferTarget(
  supabase: SupabaseClientLike,
  input: EngineInput,
  userId: string,
  logger: LoggerLike,
): Promise<TransferAssignResult> {
  try {
    const { data: profileRows, error: profileErr } = await (supabase
      .from('profiles')
      .select('id, user_id, tenant_id, status, role')
      .eq('user_id', userId) as unknown as Promise<{
        data: TransferCandidateProfile[] | null;
        error: unknown;
      }>);
    if (profileErr) throw profileErr;

    const target = resolveTransferTarget(profileRows, input.tenant_id);
    if (!target.ok) {
      return { outcome: 'ineligible', reason: target.reason };
    }

    const { data: conversation, error: convErr } = await (supabase
      .from('conversations')
      .select('id, assigned_profile_id')
      .eq('tenant_id', input.tenant_id)
      .eq('contact_id', input.contact_id)
      .maybeSingle() as Promise<{
        data: { id: string; assigned_profile_id: string | null } | null;
        error: unknown;
      }>);
    if (convErr) throw convErr;
    if (!conversation) return { outcome: 'no_conversation', conversationId: null };
    if (conversation.assigned_profile_id) {
      return { outcome: 'already_owned', conversationId: conversation.id };
    }

    const { data: updated, error: updErr } = await (supabase
      .from('conversations')
      .update({
        assigned_profile_id: target.profileId,
        assigned_at: new Date().toISOString(),
        assigned_by: null,
      })
      .eq('id', conversation.id)
      .is('assigned_profile_id', null)
      .select('id') as unknown as Promise<{ data: Array<{ id: string }> | null; error: unknown }>);
    if (updErr) throw updErr;
    if (!updated || updated.length === 0) {
      return { outcome: 'lost_race', conversationId: conversation.id };
    }

    return { outcome: 'assigned', profileId: target.profileId, conversationId: conversation.id };
  } catch (err) {
    logger.warn('transfer_agent: failed to assign conversation (flow continues)', {
      error: String(err),
      contact_id: input.contact_id,
    });
    return { outcome: 'error' };
  }
}

/**
 * O aviso no sino de quem RECEBEU a conversa pelo nó. Só é chamado depois de
 * 'assigned': quem não recebeu não pode ler "transferida para você". É o único
 * aviso da entrega — tg_notify_conversation_assigned fica mudo com
 * assigned_by = NULL, de propósito (ver o bloco acima). Mesma forma que o
 * sino grava: tenant_id preenchido e conversation_id no metadata.
 */
async function createTransferNotification(
  supabase: SupabaseClientLike,
  input: EngineInput,
  session: ChatbotSession,
  userId: string,
  conversationId: string | null | undefined,
  logger: LoggerLike,
): Promise<void> {
  try {
    await (supabase
      .from('notifications')
      .insert({
        tenant_id: input.tenant_id,
        user_id: userId,
        title: 'Conversa transferida',
        message: `Uma conversa foi transferida para você (contato: ${input.phone}).`,
        type: 'info',
        action_url: `/dashboard/conversations?contact=${input.contact_id}`,
        action_label: 'Ver conversa',
        metadata: {
          conversation_id: conversationId ?? null,
          session_id: session.id,
          contact_id: input.contact_id,
          chatbot_id: session.chatbot_id,
          assigned_by: null,
        },
      }) as unknown as Promise<void>);
  } catch (err) {
    logger.warn('Failed to create transfer notification', { error: String(err) });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pure, side-effect-free flow-execution helpers.
 *
 * This module is the canonical reference for the chatbot engine's decision
 * logic. The Deno Edge Function (supabase/functions/process-chatbot-message)
 * mirrors these exact semantics; keeping the logic here lets us unit-test it
 * with vitest without a Deno runtime or network.
 */
import type {
  ChatbotEdgeRow,
  ChatbotNodeRow,
  ConditionOperator,
  QuestionValidation,
  ShowOptionsOption,
} from '@/types/chatbot-flow.types';
import {
  DEFAULT_HANDLE,
  CONDITION_TRUE_HANDLE,
  CONDITION_FALSE_HANDLE,
} from '@/types/chatbot-flow.types';
import { INPUT_NODE_TYPES, TERMINAL_NODE_TYPES } from './flowConstants';

export interface VariableContext {
  name?: string | null;
  first_name?: string | null;
  phone?: string | null;
  incoming_message?: string | null;
  /** Date/time pre-formatted by the caller (locale-aware). */
  date?: string;
  time?: string;
  datetime?: string;
  /** Session-collected custom variables. */
  [key: string]: string | null | undefined;
}

/**
 * Replace `{token}` occurrences with values from the context. Unknown tokens
 * are left as-is. Whitespace inside braces is tolerated: `{ name }`.
 */
export function substituteVariables(
  template: string | null | undefined,
  context: VariableContext
): string {
  if (!template) return '';
  return template.replace(/\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}/g, (match, token) => {
    const value = context[token as keyof VariableContext];
    return value === undefined || value === null ? match : String(value);
  });
}

/** Derive first_name from a full name. */
export function firstName(name?: string | null): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0] ?? '';
}

/** Evaluate a condition node. */
export function evaluateCondition(
  operator: ConditionOperator,
  variableValue: string | null | undefined,
  compareValue?: string | null
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
  text: string
): boolean {
  const t = (text ?? '').trim();
  switch (validation) {
    case 'email':
      return EMAIL_RE.test(t);
    case 'phone':
      return PHONE_RE.test(t) && (t.replace(/\D/g, '').length >= 8);
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
 * Returns the matched option or null.
 */
export function matchOption(
  text: string,
  options: ShowOptionsOption[]
): ShowOptionsOption | null {
  if (!text || !options?.length) return null;
  const t = text.trim().toLowerCase();

  const asIndex = Number(t);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= options.length) {
    return options[asIndex - 1] ?? null;
  }
  return (
    options.find(
      (o) =>
        o.label.trim().toLowerCase() === t ||
        o.value.trim().toLowerCase() === t
    ) ?? null
  );
}

/**
 * Resolve the next node id from `currentNodeId` following the edge whose
 * source_handle matches `handle`. Falls back to the DEFAULT_HANDLE edge, then
 * to any single outgoing edge.
 */
export function resolveNextNodeId(
  edges: Pick<ChatbotEdgeRow, 'source_node_id' | 'target_node_id' | 'source_handle'>[],
  currentNodeId: string,
  handle: string = DEFAULT_HANDLE
): string | null {
  const outgoing = edges.filter((e) => e.source_node_id === currentNodeId);
  if (outgoing.length === 0) return null;

  const byHandle = outgoing.find(
    (e) => (e.source_handle ?? DEFAULT_HANDLE) === handle
  );
  if (byHandle) return byHandle.target_node_id;

  const byDefault = outgoing.find(
    (e) => (e.source_handle ?? DEFAULT_HANDLE) === DEFAULT_HANDLE
  );
  if (byDefault) return byDefault.target_node_id;

  // Last resort: if there is exactly one outgoing edge, take it.
  return outgoing.length === 1 ? outgoing[0]!.target_node_id : null;
}

/** A node type pauses the flow waiting for user input. */
export function isInputNode(nodeType: string): boolean {
  return (INPUT_NODE_TYPES as string[]).includes(nodeType);
}

/** A node type terminates the flow (no outgoing edge required). */
export function isTerminalNode(nodeType: string): boolean {
  return (TERMINAL_NODE_TYPES as string[]).includes(nodeType);
}

// ---------------------------------------------------------------------------
// Publish validation
// ---------------------------------------------------------------------------
export interface FlowValidationResult {
  valid: boolean;
  errors: string[];
  /** node id -> human message, for highlighting problem nodes in red. */
  nodeErrors: Record<string, string>;
}

/**
 * Resumo dos erros por nó. Fica em `errors` para quem só lê a lista, mas a tela
 * de publicação o substitui pela lista de blocos (que diz qual e leva até ele) —
 * por isso a constante é exportada, em vez de comparada por texto solto.
 */
export const FLOW_NODE_CONNECTION_ERROR = 'Há nós sem conexões de saída obrigatórias.';

/**
 * Validate a flow graph before publishing:
 *  - exactly one start node
 *  - the start node has an outgoing edge
 *  - every non-terminal node has at least one outgoing edge
 *  - condition nodes have both true/false handles connected
 *  - show_options nodes have an edge per option
 */
export function validateFlowForPublish(
  nodes: Pick<ChatbotNodeRow, 'id' | 'node_type' | 'data'>[],
  edges: Pick<ChatbotEdgeRow, 'source_node_id' | 'source_handle'>[]
): FlowValidationResult {
  const errors: string[] = [];
  const nodeErrors: Record<string, string> = {};

  const startNodes = nodes.filter((n) => n.node_type === 'start');
  if (startNodes.length === 0) {
    errors.push('O fluxo precisa de um nó de Início.');
  } else if (startNodes.length > 1) {
    errors.push('O fluxo só pode ter um nó de Início.');
  }

  const outgoingByNode = new Map<string, Set<string>>();
  for (const e of edges) {
    const set = outgoingByNode.get(e.source_node_id) ?? new Set<string>();
    set.add(e.source_handle ?? DEFAULT_HANDLE);
    outgoingByNode.set(e.source_node_id, set);
  }

  for (const node of nodes) {
    if (isTerminalNode(node.node_type)) continue;
    const handles = outgoingByNode.get(node.id);

    if (!handles || handles.size === 0) {
      nodeErrors[node.id] = 'Este nó não está conectado a nenhuma saída.';
      continue;
    }

    if (node.node_type === 'condition') {
      const missing: string[] = [];
      if (!handles.has(CONDITION_TRUE_HANDLE)) missing.push('Verdadeiro');
      if (!handles.has(CONDITION_FALSE_HANDLE)) missing.push('Falso');
      if (missing.length) {
        nodeErrors[node.id] = `Conecte a(s) saída(s): ${missing.join(', ')}.`;
      }
    }

    if (node.node_type === 'show_options') {
      const options = (node.data?.options as ShowOptionsOption[]) ?? [];
      const missing = options.filter((o) => !handles.has(o.id));
      if (missing.length) {
        nodeErrors[node.id] = `Conecte todas as opções (${missing.length} sem saída).`;
      }
    }
  }

  if (Object.keys(nodeErrors).length) {
    errors.push(FLOW_NODE_CONNECTION_ERROR);
  }

  return { valid: errors.length === 0, errors, nodeErrors };
}

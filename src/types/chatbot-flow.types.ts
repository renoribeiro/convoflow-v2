/**
 * Shared contract for the Chatbot Visual Flow Builder.
 *
 * These types are the single source of truth for:
 *  - the shape of `chatbot_nodes.data` (per node_type)
 *  - the shape of `chatbot_triggers.trigger_value` (per trigger_type)
 *  - edge `source_handle` conventions
 *  - chatbot session variables
 *
 * The execution engine (supabase/functions/process-chatbot-message) mirrors
 * these shapes — keep both in sync.
 */

// ---------------------------------------------------------------------------
// Enums (match the Postgres enums)
// ---------------------------------------------------------------------------
export type ChatbotTriggerType =
  | 'keyword'
  | 'first_contact'
  | 'out_of_hours'
  | 'no_agent_reply'
  | 'funnel_stage';

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
export type TransferAssignTo = 'any' | 'specific_user';
export type UpdateContactField = 'name' | 'email' | 'phone' | 'tag';

// ---------------------------------------------------------------------------
// Node `data` shapes (stored in chatbot_nodes.data jsonb)
// ---------------------------------------------------------------------------
export interface StartNodeData {
  label?: string;
}
export interface SendTextNodeData {
  message: string;
  delay_seconds?: number;
}
export interface AskQuestionNodeData {
  message: string;
  save_to_variable: string;
  validation: QuestionValidation;
}
export interface ShowOptionsOption {
  id: string;
  label: string;
  value: string;
}
export interface ShowOptionsNodeData {
  message: string;
  options: ShowOptionsOption[];
}
export interface ConditionNodeData {
  variable: string;
  operator: ConditionOperator;
  value?: string;
}
export interface TransferAgentNodeData {
  message?: string;
  assign_to: TransferAssignTo;
  user_id?: string | null;
}
export interface SetVariableNodeData {
  variable_name: string;
  value: string;
}
export interface UpdateContactNodeData {
  field: UpdateContactField;
  value: string;
}
export interface MoveFunnelNodeData {
  stage_id: string;
}
export interface EndFlowNodeData {
  message?: string;
  silent?: boolean;
}

export type ChatbotNodeData =
  | StartNodeData
  | SendTextNodeData
  | AskQuestionNodeData
  | ShowOptionsNodeData
  | ConditionNodeData
  | TransferAgentNodeData
  | SetVariableNodeData
  | UpdateContactNodeData
  | MoveFunnelNodeData
  | EndFlowNodeData;

/** Maps each node_type to its data shape. */
export interface ChatbotNodeDataMap {
  start: StartNodeData;
  send_text: SendTextNodeData;
  ask_question: AskQuestionNodeData;
  show_options: ShowOptionsNodeData;
  condition: ConditionNodeData;
  transfer_agent: TransferAgentNodeData;
  end_flow: EndFlowNodeData;
  set_variable: SetVariableNodeData;
  update_contact: UpdateContactNodeData;
  move_funnel: MoveFunnelNodeData;
}

// ---------------------------------------------------------------------------
// Trigger `trigger_value` shapes (stored in chatbot_triggers.trigger_value)
// ---------------------------------------------------------------------------
export interface KeywordTriggerValue {
  keywords: string[];
}
// first_contact has no extra config
export type FirstContactTriggerValue = Record<string, never>;
export interface OutOfHoursTriggerValue {
  timezone?: string;
}
export interface NoAgentReplyTriggerValue {
  minutes: number;
}
export interface FunnelStageTriggerValue {
  stage_id: string;
}

export type ChatbotTriggerValue =
  | KeywordTriggerValue
  | FirstContactTriggerValue
  | OutOfHoursTriggerValue
  | NoAgentReplyTriggerValue
  | FunnelStageTriggerValue;

export interface ChatbotTriggerValueMap {
  keyword: KeywordTriggerValue;
  first_contact: FirstContactTriggerValue;
  out_of_hours: OutOfHoursTriggerValue;
  no_agent_reply: NoAgentReplyTriggerValue;
  funnel_stage: FunnelStageTriggerValue;
}

// ---------------------------------------------------------------------------
// Edge source_handle conventions
// ---------------------------------------------------------------------------
//  - default nodes:      source_handle = 'default' (or null)
//  - condition node:     source_handle = 'true' | 'false'
//  - show_options node:  source_handle = <option.id>
export const DEFAULT_HANDLE = 'default';
export const CONDITION_TRUE_HANDLE = 'true';
export const CONDITION_FALSE_HANDLE = 'false';

// ---------------------------------------------------------------------------
// DB row types (manually typed; mirror migration 20260601000001)
// ---------------------------------------------------------------------------
export interface ChatbotRow {
  id: string;
  tenant_id: string;
  whatsapp_instance_id: string | null;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_phrases: string[] | null;
  response_message: string | null;
  response_type: string | null;
  media_url: string | null;
  variables: Record<string, unknown> | null;
  conditions: Record<string, unknown> | null;
  is_active: boolean | null;
  priority: number | null;
  delay_seconds: number | null;
  builder_version: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatbotTriggerRow {
  id: string;
  chatbot_id: string;
  tenant_id: string;
  trigger_type: ChatbotTriggerType;
  trigger_value: ChatbotTriggerValue;
  is_active: boolean;
  created_at: string;
}

export interface ChatbotNodeRow {
  id: string;
  chatbot_id: string;
  tenant_id: string;
  node_type: ChatbotNodeType;
  position_x: number;
  position_y: number;
  data: ChatbotNodeData & Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChatbotEdgeRow {
  id: string;
  chatbot_id: string;
  tenant_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  label: string | null;
  created_at: string;
}

export interface ChatbotVariableRow {
  id: string;
  chatbot_id: string;
  tenant_id: string;
  name: string;
  default_value: string | null;
  created_at: string;
}

export interface ChatbotSessionRow {
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
  updated_at: string;
}

// Full flow payload used when loading/saving the builder.
export interface ChatbotFlowGraph {
  nodes: ChatbotNodeRow[];
  edges: ChatbotEdgeRow[];
}

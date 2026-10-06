/**
 * Catálogo central do construtor de automações: fonte única da verdade para
 * cores, ícones, rótulos, descrições e campos de cada tipo de gatilho/ação/
 * condição/espera. Consumido por StepCard, AddStepPopover, StepConfigPanel,
 * BuilderHeader e pela página de lista.
 *
 * IMPORTANTE (regra de ouro): isto é VISUAL/UX. As chaves de `fields[].key`
 * correspondem 1:1 ao schema já gravado em step.config / trigger_config — não
 * mudar nomes nem semântica (o motor automation-processor depende disso).
 */
import {
  Play,
  Zap,
  MessageSquareDashed,
  UserPlus,
  CalendarClock,
  ArrowRightLeft,
  Variable,
  MessageCircle,
  Mail,
  Tag,
  UserCog,
  Bell,
  Globe,
  Shuffle,
  ArrowRightCircle,
  Clock,
  MessageSquare,
  GitBranch,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type StepCategory = 'trigger' | 'action' | 'condition' | 'delay';

export interface CategoryStyle {
  label: string;
  /** fundo do círculo do ícone (ícone branco dentro) */
  iconBg: string;
  /** borda do card (inclui dark:) */
  border: string;
  /** fundo sutil do card (inclui dark:) */
  cardBg: string;
  /** texto de destaque (inclui dark:) */
  text: string;
  /** anel quando selecionado */
  ring: string;
  /** cor da linha do conector */
  connector: string;
  /** ponto/legenda */
  dot: string;
}

export const CATEGORY_STYLES: Record<StepCategory, CategoryStyle> = {
  trigger: {
    label: 'Gatilho',
    iconBg: 'bg-emerald-500',
    border: 'border-emerald-300 dark:border-emerald-700',
    cardBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-400',
    connector: 'bg-emerald-300 dark:bg-emerald-700',
    dot: 'bg-emerald-500',
  },
  action: {
    label: 'Ação',
    iconBg: 'bg-blue-500',
    border: 'border-blue-300 dark:border-blue-800',
    cardBg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-400',
    connector: 'bg-slate-300 dark:bg-slate-700',
    dot: 'bg-blue-500',
  },
  condition: {
    label: 'Condição',
    iconBg: 'bg-amber-500',
    border: 'border-amber-300 dark:border-amber-800',
    cardBg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-400',
    connector: 'bg-slate-300 dark:bg-slate-700',
    dot: 'bg-amber-500',
  },
  delay: {
    label: 'Espera',
    iconBg: 'bg-slate-500',
    border: 'border-slate-300 dark:border-slate-700',
    cardBg: 'bg-slate-50 dark:bg-slate-900/50',
    text: 'text-slate-700 dark:text-slate-300',
    ring: 'ring-slate-400',
    connector: 'bg-slate-300 dark:bg-slate-700',
    dot: 'bg-slate-500',
  },
};

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'array'
  | 'time'
  | 'text_with_vars'
  | 'textarea_with_vars'
  | 'variable';

export type OptionsSource = 'funnelStages' | 'quickReplies';

export interface CatalogField {
  key: string;
  type: FieldType;
  label: string;
  required?: boolean;
  /** vai para a seção "Avançado" do accordion */
  advanced?: boolean;
  /** texto curto do tooltip "?" */
  help?: string;
  /** opções dinâmicas resolvidas em runtime */
  optionsSource?: OptionsSource;
  /** opções estáticas {id,name} */
  options?: { id: string; name: string }[];
  placeholder?: string;
}

export interface CatalogEntry {
  /** subtipo, ex.: 'send_message' */
  key: string;
  category: StepCategory;
  label: string;
  description: string;
  Icon: LucideIcon;
  fields: CatalogField[];
  /** sem suporte no motor ainda — aparece desabilitado ("Em breve") */
  comingSoon?: boolean;
  /** chave em src/lib/help/featureHelp.ts para o painel de ajuda rico */
  helpKey?: string;
}

// Opções compartilhadas
export const OPERATOR_OPTIONS = [
  { id: 'equals', name: 'é igual a' },
  { id: 'contains', name: 'contém' },
  { id: 'not_empty', name: 'está preenchida' },
  { id: 'empty', name: 'está vazia' },
];

export const CONTACT_FIELD_OPTIONS = [
  { id: 'name', name: 'Nome' },
  { id: 'email', name: 'E-mail' },
  { id: 'phone', name: 'Telefone' },
  { id: 'tag', name: 'Tag' },
  { id: 'custom', name: 'Campo personalizado' },
];

// --------------------------------------------------------------------------
// GATILHOS
// --------------------------------------------------------------------------
export const TRIGGERS: CatalogEntry[] = [
  {
    key: 'variable_captured',
    category: 'trigger',
    label: 'Variável Capturada',
    description: 'Dispara quando o chatbot captura ou atualiza uma variável (ex.: o nome do lead).',
    Icon: Variable,
    helpKey: 'trigger:variable_captured',
    fields: [
      { key: 'variable_name', type: 'variable', label: 'Variável', required: true, help: 'A variável que o chatbot coletou e que dispara este fluxo.' },
      { key: 'operator', type: 'select', label: 'Condição (opcional)', optionsSource: undefined, options: OPERATOR_OPTIONS, advanced: true, help: 'Deixe em branco para disparar sempre que a variável for capturada.' },
      { key: 'value', type: 'text', label: 'Valor (apenas se "é igual a" / "contém")', advanced: true },
    ],
  },
  {
    key: 'message_received',
    category: 'trigger',
    label: 'Mensagem Recebida',
    description: 'Dispara quando o contato envia uma mensagem (opcionalmente filtrando por palavras-chave).',
    Icon: MessageSquareDashed,
    helpKey: 'trigger:message_received',
    fields: [
      { key: 'keywords', type: 'array', label: 'Palavras-chave', help: 'Separe por vírgula. Deixe vazio para qualquer mensagem.' },
      { key: 'exact_match', type: 'boolean', label: 'Correspondência exata', advanced: true },
    ],
  },
  {
    key: 'contact_created',
    category: 'trigger',
    label: 'Novo Contato',
    description: 'Dispara quando um novo contato é criado.',
    Icon: UserPlus,
    helpKey: 'trigger:contact_created',
    fields: [
      { key: 'source', type: 'select', label: 'Fonte', options: [{ id: 'whatsapp', name: 'WhatsApp' }, { id: 'website', name: 'Site' }, { id: 'manual', name: 'Manual' }], advanced: true },
    ],
  },
  {
    key: 'funnel_stage_changed',
    category: 'trigger',
    label: 'Mudança de Estágio',
    description: 'Dispara quando o contato muda de etapa no funil.',
    Icon: ArrowRightLeft,
    helpKey: 'trigger:funnel_stage_changed',
    fields: [
      { key: 'from_stage', type: 'select', label: 'Do estágio', optionsSource: 'funnelStages', advanced: true },
      { key: 'to_stage', type: 'select', label: 'Para o estágio', optionsSource: 'funnelStages' },
    ],
  },
  {
    key: 'scheduled_time',
    category: 'trigger',
    label: 'Horário Agendado',
    description: 'Dispara em horários definidos (diário, semanal, mensal).',
    Icon: CalendarClock,
    helpKey: 'trigger:scheduled_time',
    fields: [
      { key: 'schedule_type', type: 'select', label: 'Periodicidade', options: [{ id: 'daily', name: 'Diário' }, { id: 'weekly', name: 'Semanal' }, { id: 'monthly', name: 'Mensal' }] },
      { key: 'time', type: 'time', label: 'Horário' },
    ],
  },
];

// --------------------------------------------------------------------------
// AÇÕES
// --------------------------------------------------------------------------
export const ACTIONS: CatalogEntry[] = [
  {
    key: 'send_message',
    category: 'action',
    label: 'Enviar Mensagem',
    description: 'Envia uma mensagem via WhatsApp: uma resposta rápida da Loja ou um texto escrito aqui.',
    Icon: MessageCircle,
    helpKey: 'action:send_message',
    fields: [
      { key: 'quick_reply_id', type: 'select', label: 'Resposta rápida', optionsSource: 'quickReplies', help: 'Reaproveita um trecho salvo da Loja. Crie e edite em Configurações › Respostas rápidas.' },
      { key: 'custom_message', type: 'textarea_with_vars', label: 'Mensagem personalizada', help: 'Use {variavel} para personalizar, ex.: Olá {first_name}.' },
    ],
  },
  {
    key: 'update_contact',
    category: 'action',
    label: 'Atualizar Contato',
    description: 'Grava o valor de uma variável em um campo do contato, em tempo real.',
    Icon: UserCog,
    helpKey: 'action:update_contact',
    fields: [
      { key: 'field', type: 'select', label: 'Campo', options: CONTACT_FIELD_OPTIONS, required: true },
      { key: 'custom_key', type: 'text', label: 'Nome do campo personalizado', advanced: true, help: 'Só quando o campo for "Campo personalizado".' },
      { key: 'value', type: 'text_with_vars', label: 'Valor', required: true, help: 'Normalmente uma {variavel} coletada pelo chatbot.' },
    ],
  },
  {
    key: 'add_tag',
    category: 'action',
    label: 'Adicionar Tag',
    description: 'Aplica uma etiqueta (tag) ao contato. Útil para segmentar.',
    Icon: Tag,
    helpKey: 'action:add_tag',
    fields: [
      { key: 'tag_name', type: 'text_with_vars', label: 'Nome da tag', required: true },
    ],
  },
  {
    key: 'change_funnel_stage',
    category: 'action',
    label: 'Alterar Estágio',
    description: 'Move o contato para outra etapa do funil.',
    Icon: ArrowRightCircle,
    helpKey: 'action:change_funnel_stage',
    fields: [
      { key: 'stage_id', type: 'select', label: 'Novo estágio', optionsSource: 'funnelStages', required: true },
    ],
  },
  {
    key: 'schedule_followup',
    category: 'action',
    label: 'Agendar Follow-up',
    description: 'Cria um follow-up automático (tarefa ou envio agendado).',
    Icon: CalendarClock,
    helpKey: 'action:schedule_followup',
    fields: [
      { key: 'delay_hours', type: 'number', label: 'Atraso (horas)' },
      { key: 'followup_type', type: 'select', label: 'Tipo', options: [{ id: 'whatsapp', name: 'WhatsApp' }, { id: 'call', name: 'Ligação' }, { id: 'email', name: 'E-mail' }] },
      { key: 'message', type: 'textarea_with_vars', label: 'Mensagem' },
    ],
  },
  // --- Em breve (sem suporte no motor) ---
  { key: 'send_email', category: 'action', label: 'Enviar E-mail', description: 'Envia e-mail via Resend.', Icon: Mail, comingSoon: true, fields: [] },
  { key: 'remove_tag', category: 'action', label: 'Remover Tag', description: 'Remove uma etiqueta do contato.', Icon: Tag, comingSoon: true, fields: [] },
  { key: 'notify_operator', category: 'action', label: 'Notificar Operador', description: 'Alerta o responsável.', Icon: Bell, comingSoon: true, fields: [] },
  { key: 'http_request', category: 'action', label: 'Requisição HTTP', description: 'Chama uma URL externa (webhook).', Icon: Globe, comingSoon: true, fields: [] },
];

// --------------------------------------------------------------------------
// CONDIÇÕES
// --------------------------------------------------------------------------
export const CONDITIONS: CatalogEntry[] = [
  {
    key: 'variable_condition',
    category: 'condition',
    label: 'Variável',
    description: 'Continua o fluxo apenas se a variável satisfizer a condição (senão encerra).',
    Icon: GitBranch,
    helpKey: 'condition:variable_condition',
    fields: [
      { key: 'variable', type: 'variable', label: 'Variável', required: true },
      { key: 'operator', type: 'select', label: 'Condição', options: OPERATOR_OPTIONS, required: true },
      { key: 'value', type: 'text', label: 'Valor (para "é igual a" / "contém")' },
    ],
  },
  {
    key: 'contact_has_tag',
    category: 'condition',
    label: 'Contato tem Tag',
    description: 'Continua apenas se o contato tiver a tag indicada.',
    Icon: Tag,
    helpKey: 'condition:contact_has_tag',
    fields: [
      { key: 'tag_name', type: 'text', label: 'Nome da tag', required: true },
    ],
  },
  {
    key: 'contact_in_stage',
    category: 'condition',
    label: 'Contato no Estágio',
    description: 'Continua apenas se o contato estiver no estágio indicado.',
    Icon: ArrowRightCircle,
    helpKey: 'condition:contact_in_stage',
    fields: [
      { key: 'stage_id', type: 'select', label: 'Estágio', optionsSource: 'funnelStages', required: true },
    ],
  },
  {
    key: 'message_contains',
    category: 'condition',
    label: 'Mensagem Contém',
    description: 'Continua apenas se a mensagem contiver as palavras indicadas.',
    Icon: MessageSquare,
    helpKey: 'condition:message_contains',
    fields: [
      { key: 'keywords', type: 'array', label: 'Palavras-chave', required: true },
      { key: 'case_sensitive', type: 'boolean', label: 'Sensível a maiúsculas', advanced: true },
    ],
  },
  // --- Em breve ---
  { key: 'ab_test', category: 'condition', label: 'Teste A/B', description: 'Divide o fluxo por porcentagem.', Icon: Shuffle, comingSoon: true, fields: [] },
];

// --------------------------------------------------------------------------
// TIMING / ESPERA
// --------------------------------------------------------------------------
export const TIMINGS: CatalogEntry[] = [
  {
    key: 'delay',
    category: 'delay',
    label: 'Aguardar',
    description: 'Espera um tempo definido antes da próxima ação.',
    Icon: Clock,
    helpKey: 'action:delay',
    fields: [
      { key: 'delay_type', type: 'select', label: 'Unidade', options: [{ id: 'minutes', name: 'Minutos' }, { id: 'hours', name: 'Horas' }, { id: 'days', name: 'Dias' }] },
      { key: 'delay_value', type: 'number', label: 'Valor', required: true },
    ],
  },
  // --- Em breve ---
  { key: 'wait_for_reply', category: 'delay', label: 'Esperar Resposta', description: 'Pausa até o contato responder.', Icon: MessageSquare, comingSoon: true, fields: [] },
];

export const ALL_ENTRIES: CatalogEntry[] = [...TRIGGERS, ...ACTIONS, ...CONDITIONS, ...TIMINGS];

const BY_KEY: Record<string, CatalogEntry> = ALL_ENTRIES.reduce((acc, e) => {
  acc[e.key] = e;
  return acc;
}, {} as Record<string, CatalogEntry>);

/** Busca a definição de catálogo por subtipo (ex.: 'send_message'). */
export function getCatalogEntry(key: string | undefined | null): CatalogEntry | undefined {
  if (!key) return undefined;
  return BY_KEY[key];
}

/** Fallback genérico (subtipo desconhecido / não configurado). */
export const UNKNOWN_ENTRY: CatalogEntry = {
  key: 'unknown',
  category: 'action',
  label: 'Configurar etapa',
  description: 'Clique para escolher o tipo desta etapa.',
  Icon: Settings,
  fields: [],
};

/** Ícone padrão de gatilho (para o card de gatilho não configurado). */
export const TriggerPlaceholderIcon = Zap;
export const TriggerStartIcon = Play;

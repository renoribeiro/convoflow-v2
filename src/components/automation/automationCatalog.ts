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
import { CORES_DA_AUTOMACAO, pinturaDaCategoria, type PinturaDaCategoria } from '@/lib/cores/coresDeCategoria';

export type StepCategory = 'trigger' | 'action' | 'condition' | 'delay';

/**
 * Lote 7 ("Cores e tema escuro"): a cor de cada categoria mora em
 * src/lib/cores/coresDeCategoria.ts e chega às telas já ajustada pelo
 * contraste (pinturaDaCategoria): fundo cheio com ícone branco legível,
 * cartão suave, rótulo na tinta legível do tema e anel de seleção.
 */
export interface CategoryStyle {
  label: string;
  /** a cor da categoria (código de cor; exceção legítima à regra de tokens) */
  cor: string;
  /** estilos prontos: `cheio` (círculo do ícone), `suave` (cartão), `texto` (rótulo, com CLASSE_DA_TINTA), `anel` */
  pintura: PinturaDaCategoria;
}

const categoria = (label: string, cor: string): CategoryStyle => ({ label, cor, pintura: pinturaDaCategoria(cor) });

export const CATEGORY_STYLES: Record<StepCategory, CategoryStyle> = {
  trigger: categoria('Gatilho', CORES_DA_AUTOMACAO.trigger),
  action: categoria('Ação', CORES_DA_AUTOMACAO.action),
  condition: categoria('Condição', CORES_DA_AUTOMACAO.condition),
  delay: categoria('Espera', CORES_DA_AUTOMACAO.delay),
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
  /**
   * Não é oferecido para automação nova: o motor não dispara. Continua no
   * catálogo para uma automação antiga que já o usa abrir e mostrar o que é.
   */
  naoOferecer?: boolean;
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

/** Tipos de follow up e unidades de espera, com o nome que a tela mostra. */
export const FOLLOWUP_TYPE_NAMES = [
  { id: 'whatsapp', name: 'WhatsApp' },
  { id: 'call', name: 'Ligação' },
  { id: 'email', name: 'Email' },
] as const;
export const DELAY_TYPE_NAMES = [
  { id: 'minutes', name: 'Minutos' },
  { id: 'hours', name: 'Horas' },
  { id: 'days', name: 'Dias' },
] as const;

export const CONTACT_FIELD_OPTIONS = [
  { id: 'name', name: 'Nome' },
  { id: 'email', name: 'Email' },
  { id: 'phone', name: 'Telefone' },
  { id: 'tag', name: 'Etiqueta' },
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
    description: 'Dispara quando o chatbot captura ou atualiza uma variável (ex.: o nome do contato).',
    Icon: Variable,
    helpKey: 'trigger:variable_captured',
    fields: [
      { key: 'variable_name', type: 'variable', label: 'Variável', required: true, help: 'A variável que o chatbot coletou e que dispara esta automação.' },
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
    label: 'Mudança de etapa',
    description: 'Dispara quando o contato muda de etapa no funil.',
    Icon: ArrowRightLeft,
    helpKey: 'trigger:funnel_stage_changed',
    fields: [
      { key: 'from_stage', type: 'select', label: 'Da etapa', optionsSource: 'funnelStages', advanced: true },
      { key: 'to_stage', type: 'select', label: 'Para a etapa', optionsSource: 'funnelStages' },
    ],
  },
  {
    key: 'scheduled_time',
    category: 'trigger',
    label: 'Horário Agendado',
    // Nenhum cron chama o automation-processor para este gatilho (conferido
    // em cron.job em 2026-10-27): ele nunca disparou. Fora da lista até existir.
    naoOferecer: true,
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
    label: 'Adicionar etiqueta',
    description: 'Coloca uma etiqueta no contato. Útil para separar quem recebe cada campanha.',
    Icon: Tag,
    helpKey: 'action:add_tag',
    fields: [
      { key: 'tag_name', type: 'text_with_vars', label: 'Nome da etiqueta', required: true },
    ],
  },
  {
    key: 'change_funnel_stage',
    category: 'action',
    label: 'Mudar de etapa',
    description: 'Move o contato para outra etapa do funil.',
    Icon: ArrowRightCircle,
    helpKey: 'action:change_funnel_stage',
    fields: [
      { key: 'stage_id', type: 'select', label: 'Nova etapa', optionsSource: 'funnelStages', required: true },
    ],
  },
  {
    key: 'schedule_followup',
    category: 'action',
    label: 'Agendar follow up',
    description: 'Cria um follow up automático (tarefa ou envio agendado).',
    Icon: CalendarClock,
    helpKey: 'action:schedule_followup',
    fields: [
      { key: 'delay_hours', type: 'number', label: 'Daqui a quantas horas' },
      { key: 'followup_type', type: 'select', label: 'Tipo', options: [...FOLLOWUP_TYPE_NAMES] },
      // Obrigatória: é o texto do envio agendado ou a descrição da tarefa. O
      // motor não lê resposta rápida aqui, só este campo.
      { key: 'message', type: 'textarea_with_vars', label: 'Mensagem', required: true },
    ],
  },
  // --- Em breve (sem suporte no motor) ---
  { key: 'send_email', category: 'action', label: 'Enviar email', description: 'Envia um email.', Icon: Mail, comingSoon: true, fields: [] },
  { key: 'remove_tag', category: 'action', label: 'Tirar etiqueta', description: 'Tira uma etiqueta do contato.', Icon: Tag, comingSoon: true, fields: [] },
  { key: 'notify_operator', category: 'action', label: 'Avisar o responsável', description: 'Avisa o responsável pela conversa.', Icon: Bell, comingSoon: true, fields: [] },
  { key: 'http_request', category: 'action', label: 'Avisar outro sistema', description: 'Manda os dados para um endereço de outro sistema.', Icon: Globe, comingSoon: true, fields: [] },
];

// --------------------------------------------------------------------------
// CONDIÇÕES
// --------------------------------------------------------------------------
export const CONDITIONS: CatalogEntry[] = [
  {
    key: 'variable_condition',
    category: 'condition',
    label: 'Variável',
    description: 'Continua a automação só se a variável atender à condição (senão encerra).',
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
    label: 'Contato tem etiqueta',
    description: 'Continua só se o contato tiver a etiqueta indicada.',
    Icon: Tag,
    helpKey: 'condition:contact_has_tag',
    fields: [
      { key: 'tag_name', type: 'text', label: 'Nome da etiqueta', required: true },
    ],
  },
  {
    key: 'contact_in_stage',
    category: 'condition',
    label: 'Contato na etapa',
    description: 'Continua só se o contato estiver na etapa indicada do funil.',
    Icon: ArrowRightCircle,
    helpKey: 'condition:contact_in_stage',
    fields: [
      { key: 'stage_id', type: 'select', label: 'Etapa', optionsSource: 'funnelStages', required: true },
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
  { key: 'ab_test', category: 'condition', label: 'Teste A/B', description: 'Divide a automação por porcentagem.', Icon: Shuffle, comingSoon: true, fields: [] },
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
      { key: 'delay_type', type: 'select', label: 'Unidade', options: [...DELAY_TYPE_NAMES] },
      { key: 'delay_value', type: 'number', label: 'Valor', required: true },
    ],
  },
  // --- Em breve ---
  { key: 'wait_for_reply', category: 'delay', label: 'Esperar Resposta', description: 'Pausa até o contato responder.', Icon: MessageSquare, comingSoon: true, fields: [] },
];

export const ALL_ENTRIES: CatalogEntry[] = [...TRIGGERS, ...ACTIONS, ...CONDITIONS, ...TIMINGS];

/**
 * Os gatilhos que a tela oferece para escolher. O gatilho que uma automação
 * antiga já usa entra também, para o seletor dela mostrar o valor salvo.
 */
export const gatilhosOferecidos = (atual?: string | null): CatalogEntry[] =>
  TRIGGERS.filter((t) => !t.naoOferecer || t.key === atual);

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
  label: 'Configurar passo',
  description: 'Clique para escolher o tipo deste passo.',
  Icon: Settings,
  fields: [],
};

/** Ícone padrão de gatilho (para o card de gatilho não configurado). */
export const TriggerPlaceholderIcon = Zap;
export const TriggerStartIcon = Play;

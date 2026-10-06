/**
 * Visual flow builder constants: the block palette, per-node-type theming,
 * default node data factories, and system variables available for substitution.
 *
 * Kept framework-agnostic so it can be imported by both the React builder and
 * any node-rendering code.
 */
import type {
  ChatbotNodeType,
  ChatbotNodeDataMap,
} from '@/types/chatbot-flow.types';

export type NodeCategory =
  | 'inicio'
  | 'mensagens'
  | 'interacao'
  | 'acoes'
  | 'finalizar';

export interface BlockDefinition {
  type: ChatbotNodeType;
  label: string;
  emoji: string;
  category: NodeCategory;
  description: string;
  /** Tailwind class for the node header (category colour). */
  headerClass: string;
  /** Whether the user can drag/create more than one of this node. */
  singleton?: boolean;
}

export const NODE_CATEGORIES: { key: NodeCategory; label: string }[] = [
  { key: 'inicio', label: 'INÍCIO' },
  { key: 'mensagens', label: 'MENSAGENS' },
  { key: 'interacao', label: 'INTERAÇÃO' },
  { key: 'acoes', label: 'AÇÕES' },
  { key: 'finalizar', label: 'FINALIZAR' },
];

/**
 * Category → header colour. Per spec:
 *  - mensagens: verde escuro
 *  - perguntas/interação: azul / roxo
 *  - ações: laranja
 *  - finalizar: vermelho
 *  - início: verde (primary)
 */
export const CATEGORY_HEADER_CLASS: Record<NodeCategory, string> = {
  inicio: 'bg-emerald-600',
  mensagens: 'bg-green-700',
  interacao: 'bg-blue-600',
  acoes: 'bg-orange-500',
  finalizar: 'bg-red-600',
};

export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  {
    type: 'start',
    label: 'Início do Fluxo',
    emoji: '🟢',
    category: 'inicio',
    description: 'Ponto de partida do fluxo (apenas 1 por chatbot)',
    headerClass: CATEGORY_HEADER_CLASS.inicio,
    singleton: true,
  },
  {
    type: 'send_text',
    label: 'Enviar Texto',
    emoji: '💬',
    category: 'mensagens',
    description: 'Envia uma mensagem de texto',
    headerClass: CATEGORY_HEADER_CLASS.mensagens,
  },
  {
    type: 'ask_question',
    label: 'Fazer Pergunta',
    emoji: '❓',
    category: 'mensagens',
    description: 'Pergunta e aguarda a resposta do usuário',
    // questions get the blue header per spec
    headerClass: CATEGORY_HEADER_CLASS.interacao,
  },
  {
    type: 'show_options',
    label: 'Menu de Opções',
    emoji: '🔘',
    category: 'interacao',
    description: 'Menu com opções para o usuário escolher',
    headerClass: CATEGORY_HEADER_CLASS.interacao,
  },
  {
    type: 'condition',
    label: 'Condição (Se/Senão)',
    emoji: '🔀',
    category: 'interacao',
    description: 'Desvio condicional baseado em variável',
    headerClass: 'bg-purple-600',
  },
  {
    type: 'transfer_agent',
    label: 'Transferir para Atendente',
    emoji: '👤',
    category: 'acoes',
    description: 'Transfere a conversa para um atendente humano',
    headerClass: CATEGORY_HEADER_CLASS.acoes,
  },
  {
    type: 'set_variable',
    label: 'Salvar Variável',
    emoji: '📝',
    category: 'acoes',
    description: 'Salva um valor em uma variável da sessão',
    headerClass: CATEGORY_HEADER_CLASS.acoes,
  },
  {
    type: 'update_contact',
    label: 'Atualizar Contato',
    emoji: '🔄',
    category: 'acoes',
    description: 'Atualiza um campo do contato',
    headerClass: CATEGORY_HEADER_CLASS.acoes,
  },
  {
    type: 'move_funnel',
    label: 'Mover no Funil',
    emoji: '📊',
    category: 'acoes',
    description: 'Move o contato para uma etapa do funil',
    headerClass: CATEGORY_HEADER_CLASS.acoes,
  },
  {
    type: 'end_flow',
    label: 'Encerrar Fluxo',
    emoji: '🔴',
    category: 'finalizar',
    description: 'Finaliza o fluxo e a sessão',
    headerClass: CATEGORY_HEADER_CLASS.finalizar,
  },
];

export const BLOCK_BY_TYPE: Record<ChatbotNodeType, BlockDefinition> =
  BLOCK_DEFINITIONS.reduce((acc, b) => {
    acc[b.type] = b;
    return acc;
  }, {} as Record<ChatbotNodeType, BlockDefinition>);

/** System variables usable in any message text via {var} syntax. */
export const SYSTEM_VARIABLES: { token: string; label: string }[] = [
  { token: 'name', label: 'Nome do contato' },
  { token: 'first_name', label: 'Primeiro nome' },
  { token: 'phone', label: 'Telefone' },
  { token: 'date', label: 'Data atual' },
  { token: 'time', label: 'Hora atual' },
  { token: 'datetime', label: 'Data e hora' },
  { token: 'incoming_message', label: 'Última mensagem recebida' },
];

/** Default `data` for a freshly-dropped node of the given type. */
export function defaultNodeData<T extends ChatbotNodeType>(
  type: T
): ChatbotNodeDataMap[T] {
  switch (type) {
    case 'start':
      return { label: 'Início' } as ChatbotNodeDataMap[T];
    case 'send_text':
      return { message: '', delay_seconds: 0 } as ChatbotNodeDataMap[T];
    case 'ask_question':
      return {
        message: '',
        save_to_variable: '',
        validation: 'none',
      } as ChatbotNodeDataMap[T];
    case 'show_options':
      return { message: '', options: [] } as unknown as ChatbotNodeDataMap[T];
    case 'condition':
      return {
        variable: '',
        operator: 'contains',
        value: '',
      } as ChatbotNodeDataMap[T];
    case 'transfer_agent':
      return {
        message: 'Transferindo para um atendente...',
        assign_to: 'any',
        user_id: null,
      } as ChatbotNodeDataMap[T];
    case 'set_variable':
      return { variable_name: '', value: '' } as ChatbotNodeDataMap[T];
    case 'update_contact':
      return { field: 'name', value: '' } as ChatbotNodeDataMap[T];
    case 'move_funnel':
      return { stage_id: '' } as ChatbotNodeDataMap[T];
    case 'end_flow':
      return { message: '', silent: false } as ChatbotNodeDataMap[T];
    default:
      return {} as ChatbotNodeDataMap[T];
  }
}

/** Node types that wait for user input (engine pauses the session here). */
export const INPUT_NODE_TYPES: ChatbotNodeType[] = [
  'ask_question',
  'show_options',
];

/** Node types that terminate a flow (no outgoing edge required). */
export const TERMINAL_NODE_TYPES: ChatbotNodeType[] = [
  'end_flow',
  'transfer_agent',
];

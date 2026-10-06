/**
 * All custom node components for the flow builder.
 * Registered in the nodeTypes map passed to <ReactFlow>.
 */
import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import BaseNode from './BaseNode';
import type {
  StartNodeData,
  SendTextNodeData,
  AskQuestionNodeData,
  ShowOptionsNodeData,
  ConditionNodeData,
  TransferAgentNodeData,
  SetVariableNodeData,
  UpdateContactNodeData,
  MoveFunnelNodeData,
  EndFlowNodeData,
} from '@/types/chatbot-flow.types';

// These are injected via node.data.meta by the builder so node components
// can call back without prop drilling.
export interface NodeMeta {
  onDelete: (id: string) => void;
  hasError?: boolean;
  errorMessage?: string;
}

type WithMeta<T> = T & { meta?: NodeMeta };

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
export const StartNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as WithMeta<StartNodeData>;
  return (
    <BaseNode
      id={id}
      type="start"
      selected={selected}
      hasError={d.meta?.hasError}
      errorMessage={d.meta?.errorMessage}
      onDelete={d.meta?.onDelete}
      showTargetHandle={false}
    >
      <span className="text-xs">Ponto de início do fluxo</span>
    </BaseNode>
  );
};

// ---------------------------------------------------------------------------
// Send Text
// ---------------------------------------------------------------------------
export const SendTextNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as WithMeta<SendTextNodeData>;
  return (
    <BaseNode
      id={id}
      type="send_text"
      selected={selected}
      hasError={d.meta?.hasError}
      errorMessage={d.meta?.errorMessage}
      onDelete={d.meta?.onDelete}
    >
      <p className="line-clamp-2 break-words">{d.message || <em>Sem mensagem</em>}</p>
    </BaseNode>
  );
};

// ---------------------------------------------------------------------------
// Ask Question
// ---------------------------------------------------------------------------
export const AskQuestionNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as WithMeta<AskQuestionNodeData>;
  return (
    <BaseNode
      id={id}
      type="ask_question"
      selected={selected}
      hasError={d.meta?.hasError}
      errorMessage={d.meta?.errorMessage}
      onDelete={d.meta?.onDelete}
    >
      <p className="line-clamp-2 break-words">{d.message || <em>Sem pergunta</em>}</p>
      {d.save_to_variable && (
        <p className="text-[10px] text-[hsl(var(--primary))] mt-1">→ {'{' + d.save_to_variable + '}'}</p>
      )}
    </BaseNode>
  );
};

// ---------------------------------------------------------------------------
// Show Options
// ---------------------------------------------------------------------------
export const ShowOptionsNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as WithMeta<ShowOptionsNodeData>;
  return (
    <BaseNode
      id={id}
      type="show_options"
      selected={selected}
      hasError={d.meta?.hasError}
      errorMessage={d.meta?.errorMessage}
      onDelete={d.meta?.onDelete}
      showSourceHandle={false}
      customHandles={
        <>
          <Handle
            type="target"
            position={Position.Top}
            className="!w-3 !h-3 !border-2 !border-[hsl(var(--primary))] !bg-background"
          />
          {(d.options ?? []).map((opt, i) => (
            <Handle
              key={opt.id}
              type="source"
              position={Position.Bottom}
              id={opt.id}
              style={{ left: `${((i + 1) / ((d.options?.length ?? 0) + 1)) * 100}%` }}
              className="!w-3 !h-3 !border-2 !border-[hsl(var(--primary))] !bg-background"
              title={opt.label}
            />
          ))}
        </>
      }
    >
      <p className="line-clamp-1 break-words">{d.message || <em>Sem mensagem</em>}</p>
      {(d.options ?? []).length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {d.options.map((o, i) => (
            <li key={o.id} className="truncate">
              {i + 1}. {o.label}
            </li>
          ))}
        </ul>
      )}
    </BaseNode>
  );
};

// ---------------------------------------------------------------------------
// Condition
// ---------------------------------------------------------------------------
const OPERATOR_LABELS: Record<string, string> = {
  contains: 'contém',
  equals: 'igual a',
  not_empty: 'não está vazio',
  empty: 'está vazio',
};

export const ConditionNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as WithMeta<ConditionNodeData>;
  return (
    <BaseNode
      id={id}
      type="condition"
      selected={selected}
      hasError={d.meta?.hasError}
      errorMessage={d.meta?.errorMessage}
      onDelete={d.meta?.onDelete}
      showSourceHandle={false}
      customHandles={
        <>
          <Handle
            type="target"
            position={Position.Top}
            className="!w-3 !h-3 !border-2 !border-[hsl(var(--primary))] !bg-background"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{ left: '30%' }}
            className="!w-3 !h-3 !border-2 !border-green-500 !bg-background"
            title="Verdadeiro"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{ left: '70%' }}
            className="!w-3 !h-3 !border-2 !border-red-500 !bg-background"
            title="Falso"
          />
        </>
      }
    >
      <p className="break-words">
        {d.variable ? (
          <>
            <span className="text-[hsl(var(--primary))]">{'{' + d.variable + '}'}</span>
            {' '}
            {OPERATOR_LABELS[d.operator] ?? d.operator}
            {d.value ? ` "${d.value}"` : ''}
          </>
        ) : (
          <em>Não configurada</em>
        )}
      </p>
      <div className="flex justify-between text-[10px] mt-2 text-muted-foreground">
        <span className="text-green-600">✓ Verdadeiro</span>
        <span className="text-red-600">✗ Falso</span>
      </div>
    </BaseNode>
  );
};

// ---------------------------------------------------------------------------
// Transfer Agent
// ---------------------------------------------------------------------------
export const TransferAgentNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as WithMeta<TransferAgentNodeData>;
  return (
    <BaseNode
      id={id}
      type="transfer_agent"
      selected={selected}
      hasError={d.meta?.hasError}
      errorMessage={d.meta?.errorMessage}
      onDelete={d.meta?.onDelete}
      showSourceHandle={false}
    >
      <p className="line-clamp-2 break-words">{d.message || 'Transferir para atendente'}</p>
      <p className="text-[10px] mt-1 text-muted-foreground">
        {d.assign_to === 'specific_user' ? 'Atendente específico' : 'Qualquer atendente'}
      </p>
    </BaseNode>
  );
};

// ---------------------------------------------------------------------------
// Set Variable
// ---------------------------------------------------------------------------
export const SetVariableNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as WithMeta<SetVariableNodeData>;
  return (
    <BaseNode
      id={id}
      type="set_variable"
      selected={selected}
      hasError={d.meta?.hasError}
      errorMessage={d.meta?.errorMessage}
      onDelete={d.meta?.onDelete}
    >
      {d.variable_name ? (
        <p>
          <span className="text-[hsl(var(--primary))]">{'{' + d.variable_name + '}'}</span>
          {' = '}
          <span className="break-all">{d.value || <em>vazio</em>}</span>
        </p>
      ) : (
        <em>Não configurada</em>
      )}
    </BaseNode>
  );
};

// ---------------------------------------------------------------------------
// Update Contact
// ---------------------------------------------------------------------------
const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  email: 'E-mail',
  phone: 'Telefone',
  tag: 'Tag',
};

export const UpdateContactNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as WithMeta<UpdateContactNodeData>;
  return (
    <BaseNode
      id={id}
      type="update_contact"
      selected={selected}
      hasError={d.meta?.hasError}
      errorMessage={d.meta?.errorMessage}
      onDelete={d.meta?.onDelete}
    >
      <p>
        <span className="font-medium">{FIELD_LABELS[d.field] ?? d.field}</span>
        {' = '}
        <span className="break-all">{d.value || <em>vazio</em>}</span>
      </p>
    </BaseNode>
  );
};

// ---------------------------------------------------------------------------
// Move Funnel
// ---------------------------------------------------------------------------
export const MoveFunnelNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as WithMeta<MoveFunnelNodeData>;
  return (
    <BaseNode
      id={id}
      type="move_funnel"
      selected={selected}
      hasError={d.meta?.hasError}
      errorMessage={d.meta?.errorMessage}
      onDelete={d.meta?.onDelete}
    >
      {d.stage_id ? (
        <p className="text-[hsl(var(--primary))]">Etapa selecionada</p>
      ) : (
        <em>Nenhuma etapa selecionada</em>
      )}
    </BaseNode>
  );
};

// ---------------------------------------------------------------------------
// End Flow
// ---------------------------------------------------------------------------
export const EndFlowNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as WithMeta<EndFlowNodeData>;
  return (
    <BaseNode
      id={id}
      type="end_flow"
      selected={selected}
      hasError={d.meta?.hasError}
      errorMessage={d.meta?.errorMessage}
      onDelete={d.meta?.onDelete}
      showSourceHandle={false}
    >
      {d.message ? (
        <p className="line-clamp-2 break-words">{d.message}</p>
      ) : d.silent ? (
        <p className="italic">Encerrar silenciosamente</p>
      ) : (
        <p className="italic">Encerrar fluxo</p>
      )}
    </BaseNode>
  );
};

// ---------------------------------------------------------------------------
// nodeTypes map (passed to ReactFlow)
// ---------------------------------------------------------------------------
export const NODE_TYPES = {
  start: StartNode,
  send_text: SendTextNode,
  ask_question: AskQuestionNode,
  show_options: ShowOptionsNode,
  condition: ConditionNode,
  transfer_agent: TransferAgentNode,
  set_variable: SetVariableNode,
  update_contact: UpdateContactNode,
  move_funnel: MoveFunnelNode,
  end_flow: EndFlowNode,
} as const;

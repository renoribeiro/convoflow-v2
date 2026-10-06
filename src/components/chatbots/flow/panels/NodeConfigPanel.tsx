/**
 * Right sidebar: config panel for the currently selected node.
 * Dispatches to per-node-type sub-panels.
 */
import React, { useRef } from 'react';
import type { Node } from '@xyflow/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Save, Undo2 } from 'lucide-react';
import { BLOCK_BY_TYPE } from '@/lib/chatbot/flowConstants';
import type { ChatbotNodeType, ChatbotNodeData } from '@/types/chatbot-flow.types';
import type { ChatbotVariableRow } from '@/types/chatbot-flow.types';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import SendTextPanel from './SendTextPanel';
import AskQuestionPanel from './AskQuestionPanel';
import ShowOptionsPanel from './ShowOptionsPanel';
import ConditionPanel from './ConditionPanel';
import TransferAgentPanel from './TransferAgentPanel';
import SetVariablePanel from './SetVariablePanel';
import UpdateContactPanel from './UpdateContactPanel';
import MoveFunnelPanel from './MoveFunnelPanel';
import EndFlowPanel from './EndFlowPanel';

interface NodeConfigPanelProps {
  node: Node;
  variables: ChatbotVariableRow[];
  onDataChange: (nodeId: string, data: ChatbotNodeData & Record<string, unknown>) => void;
  /** Persiste o fluxo (mesmo save do topo). Usado pelo botão "Salvar" do card. */
  onSave?: () => void | Promise<void>;
  /** Fecha o painel (desseleciona o nó). */
  onClose?: () => void;
  /** True enquanto o fluxo está sendo salvo, para desabilitar os botões. */
  saving?: boolean;
}

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  node,
  variables,
  onDataChange,
  onSave,
  onClose,
  saving = false,
}) => {
  const type = node.type as ChatbotNodeType;
  const block = BLOCK_BY_TYPE[type];
  const data = node.data as ChatbotNodeData & Record<string, unknown>;

  // Snapshot dos dados de quando este card foi aberto — base para "Descartar".
  // Escrito no render só quando muda o node.id (padrão de cache por chave).
  const originalRef = useRef<{ id: string; data: ChatbotNodeData & Record<string, unknown> } | null>(null);
  if (originalRef.current?.id !== node.id) {
    originalRef.current = { id: node.id, data };
  }

  const update = (patch: Partial<ChatbotNodeData & Record<string, unknown>>) => {
    onDataChange(node.id, { ...data, ...patch } as ChatbotNodeData & Record<string, unknown>);
  };

  const handleDiscard = () => {
    if (originalRef.current) {
      // Reverte as edições feitas neste card desde a abertura do painel.
      onDataChange(node.id, originalRef.current.data);
    }
    onClose?.();
  };

  const handleSaveCard = async () => {
    await onSave?.();
    // Novo baseline: a partir daqui, "Descartar" reverte para o estado salvo.
    originalRef.current = { id: node.id, data };
    onClose?.();
  };

  const renderPanel = () => {
    switch (type) {
      case 'start':
        return <p className="text-sm text-muted-foreground">Nó de início: sem configuração adicional.</p>;
      case 'send_text':
        return <SendTextPanel data={data as any} variables={variables} onChange={update} />;
      case 'ask_question':
        return <AskQuestionPanel data={data as any} variables={variables} onChange={update} />;
      case 'show_options':
        return <ShowOptionsPanel data={data as any} variables={variables} onChange={update} />;
      case 'condition':
        return <ConditionPanel data={data as any} variables={variables} onChange={update} />;
      case 'transfer_agent':
        return <TransferAgentPanel data={data as any} onChange={update} />;
      case 'set_variable':
        return <SetVariablePanel data={data as any} variables={variables} onChange={update} />;
      case 'update_contact':
        return <UpdateContactPanel data={data as any} onChange={update} />;
      case 'move_funnel':
        return <MoveFunnelPanel data={data as any} onChange={update} />;
      case 'end_flow':
        return <EndFlowPanel data={data as any} onChange={update} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Panel header */}
      <div className={`flex items-center gap-2 px-4 py-3 ${block.headerClass}`}>
        <span>{block.emoji}</span>
        <span className="text-sm font-semibold text-white">{block.label}</span>
        <div className="ml-auto text-white">
          <FeatureHelp helpKey={type} className="text-white/80 hover:text-white hover:bg-white/20" />
        </div>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {renderPanel()}
        </div>
      </ScrollArea>
      {/* Ações do card: salvar (persiste o fluxo) ou descartar as edições */}
      <Separator />
      <div className="p-3 flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleDiscard}
          disabled={saving}
        >
          <Undo2 className="w-4 h-4 mr-1.5" />
          Descartar
        </Button>
        <Button className="flex-1" onClick={handleSaveCard} disabled={saving}>
          <Save className="w-4 h-4 mr-1.5" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  );
};

export default NodeConfigPanel;

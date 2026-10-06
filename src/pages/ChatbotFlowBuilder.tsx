import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  Upload,
  Undo2,
  Redo2,
  AlertTriangle,
  Loader2,
  Check,
  Settings2,
  Blocks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsBelowLg } from '@/hooks/use-mobile';
import { useChatbotFlowFull, useSaveFlow, useUpdateChatbotMeta } from '@/hooks/useChatbotFlow';
import {
  validateFlowForPublish,
  FLOW_NODE_CONNECTION_ERROR,
  type FlowValidationResult,
} from '@/lib/chatbot/flowEngine';
import {
  BLOCK_DEFINITIONS,
  BLOCK_BY_TYPE,
  NODE_CATEGORIES,
  CATEGORY_HEADER_CLASS,
  defaultNodeData,
} from '@/lib/chatbot/flowConstants';
import { NODE_TYPES } from '@/components/chatbots/flow/nodes/FlowNodes';
import NodeConfigPanel from '@/components/chatbots/flow/panels/NodeConfigPanel';
import NewChatbotFlowModal from '@/components/chatbots/NewChatbotFlowModal';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { FlowEdgeContext, EDGE_TYPES } from '@/components/chatbots/flow/edges/DeletableEdge';
import type { ChatbotNodeType, ChatbotNodeData, ChatbotVariableRow } from '@/types/chatbot-flow.types';

// ---------------------------------------------------------------------------
// History stack
// ---------------------------------------------------------------------------
interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

// ---------------------------------------------------------------------------
// Convert DB rows → ReactFlow nodes/edges
// ---------------------------------------------------------------------------
function dbNodesToFlow(dbNodes: any[], nodeErrors: Record<string, string> = {}, onDelete: (id: string) => void): Node[] {
  return dbNodes.map((n) => ({
    id: n.id,
    type: n.node_type,
    position: { x: n.position_x, y: n.position_y },
    data: {
      ...n.data,
      meta: {
        onDelete,
        hasError: !!nodeErrors[n.id],
        errorMessage: nodeErrors[n.id],
      },
    },
  }));
}

function dbEdgesToFlow(dbEdges: any[]): Edge[] {
  return dbEdges.map((e) => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    sourceHandle: e.source_handle ?? 'default',
    label: e.label ?? undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
    style: { stroke: 'hsl(var(--primary))', strokeWidth: 1.5 },
  }));
}

// ---------------------------------------------------------------------------
// Como o nó aparece na lista de erros de publicação.
//
// A borda vermelha no canvas só ajuda quem já sabe onde olhar: num fluxo com
// dezenas de blocos, "Há nós sem conexões de saída obrigatórias" mandava o
// usuário caçar. Aqui o bloco é nomeado pelo rótulo da paleta e por um trecho
// do texto que ELE escreveu — é assim que ele reconhece o bloco.
// ---------------------------------------------------------------------------
function describeNode(node: Node): string {
  const blockLabel = BLOCK_BY_TYPE[node.type as ChatbotNodeType]?.label ?? node.type ?? 'Bloco';
  const data = (node.data ?? {}) as Record<string, unknown>;
  const raw = [data.message, data.variable_name, data.variable, data.label]
    .find((v) => typeof v === 'string' && v.trim().length > 0) as string | undefined;

  if (!raw) return blockLabel;
  const text = raw.trim().replace(/\s+/g, ' ');
  return `${blockLabel}: "${text.length > 50 ? `${text.slice(0, 50)}…` : text}"`;
}

// ---------------------------------------------------------------------------
// ChatbotFlowBuilder
// ---------------------------------------------------------------------------
const ChatbotFlowBuilder: React.FC = () => {
  const { id: chatbotId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: flowData, isLoading, error: loadError } = useChatbotFlowFull(chatbotId);
  const saveFlow = useSaveFlow();
  const updateMeta = useUpdateChatbotMeta();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [variables, setVariables] = useState<ChatbotVariableRow[]>([]);
  const [botName, setBotName] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  // Abaixo de lg (tablet e celular) paleta e configuração viram gavetas.
  const compact = useIsBelowLg();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Undo/redo history
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const skipHistoryRef = useRef(false);

  // Node errors for publish validation
  const [nodeErrors, setNodeErrors] = useState<Record<string, string>>({});

  // Publish error modal
  const [publishModal, setPublishModal] = useState<{ open: boolean; result?: FlowValidationResult }>({ open: false });

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  // Guardada no onInit: sem ReactFlowProvider em volta da página, `useReactFlow`
  // não existe aqui. É o que permite centralizar o canvas num nó com erro.
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null);

  // ---------------------------------------------------------------------------
  // Load initial data
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!flowData) return;
    setBotName(flowData.chatbot.name);
    setVariables(flowData.variables);

    const loadedNodes = dbNodesToFlow(flowData.nodes, {}, handleDeleteNode);
    const loadedEdges = dbEdgesToFlow(flowData.edges);
    skipHistoryRef.current = true;
    setNodes(loadedNodes);
    setEdges(loadedEdges);
    skipHistoryRef.current = false;

    // Seed history
    historyRef.current = [{ nodes: loadedNodes, edges: loadedEdges }];
    historyIndexRef.current = 0;
    setIsDirty(false);
  }, [flowData]);

  // ---------------------------------------------------------------------------
  // History tracking
  // ---------------------------------------------------------------------------
  const pushHistory = useCallback((n: Node[], e: Edge[]) => {
    if (skipHistoryRef.current) return;
    const idx = historyIndexRef.current;
    const history = historyRef.current.slice(0, idx + 1);
    history.push({ nodes: n, edges: e });
    if (history.length > MAX_HISTORY) history.shift();
    historyRef.current = history;
    historyIndexRef.current = history.length - 1;
    setIsDirty(true);
  }, []);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    const hasPositionChange = changes.some((c) => c.type === 'position' && !c.dragging);
    const hasRemove = changes.some((c) => c.type === 'remove');
    if (hasPositionChange || hasRemove) {
      setNodes((ns) => {
        pushHistory(ns, edges);
        return ns;
      });
    }
  }, [onNodesChange, edges, pushHistory]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    const hasRemove = changes.some((c) => c.type === 'remove');
    if (hasRemove) {
      setEdges((es) => {
        pushHistory(nodes, es);
        return es;
      });
    }
  }, [onEdgesChange, nodes, pushHistory]);

  const undo = () => {
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    historyIndexRef.current = idx - 1;
    const entry = historyRef.current[idx - 1];
    if (!entry) return;
    skipHistoryRef.current = true;
    setNodes(entry.nodes);
    setEdges(entry.edges);
    skipHistoryRef.current = false;
  };

  const redo = () => {
    const idx = historyIndexRef.current;
    if (idx >= historyRef.current.length - 1) return;
    historyIndexRef.current = idx + 1;
    const entry = historyRef.current[idx + 1];
    if (!entry) return;
    skipHistoryRef.current = true;
    setNodes(entry.nodes);
    setEdges(entry.edges);
    skipHistoryRef.current = false;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Delete selected node via Delete key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode) {
        handleDeleteNode(selectedNode.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNode]);

  // ---------------------------------------------------------------------------
  // Helpers — build meta into nodes so components can call onDelete
  // ---------------------------------------------------------------------------
  const injectMeta = useCallback(
    (rawNodes: Node[], currentNodeErrors: Record<string, string>): Node[] =>
      rawNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          meta: {
            onDelete: handleDeleteNode,
            hasError: !!currentNodeErrors[n.id],
            errorMessage: currentNodeErrors[n.id],
          },
        },
      })),
    [nodeErrors]
  );

  // Re-inject meta when nodeErrors changes
  useEffect(() => {
    setNodes((ns) => injectMeta(ns, nodeErrors));
  }, [nodeErrors]);

  const handleDeleteNode = (nodeId: string) => {
    setNodes((ns) => {
      const next = ns.filter((n) => n.id !== nodeId);
      pushHistory(next, edges);
      return next;
    });
    setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNode?.id === nodeId) setSelectedNode(null);
  };

  // ---------------------------------------------------------------------------
  // Connections
  // ---------------------------------------------------------------------------
  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        ...connection,
        id: crypto.randomUUID(),
        markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 1.5 },
      } as Edge;
      setEdges((es) => {
        const next = addEdge(newEdge, es);
        pushHistory(nodes, next);
        return next;
      });
    },
    [nodes, pushHistory]
  );

  // Delete a single connection (× button on the edge).
  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((es) => {
        const next = es.filter((e) => e.id !== edgeId);
        pushHistory(nodes, next);
        return next;
      });
    },
    [nodes, pushHistory]
  );

  // Reconnect (move) a connection: drag an edge endpoint to another handle.
  // Dropping it on empty space removes the edge (React Flow's standard pattern).
  const edgeReconnectSuccessful = useRef(true);
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      setEdges((es) => {
        const next = reconnectEdge(oldEdge, newConnection, es);
        pushHistory(nodes, next);
        return next;
      });
    },
    [nodes, pushHistory]
  );
  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        setEdges((es) => {
          const next = es.filter((e) => e.id !== edge.id);
          pushHistory(nodes, next);
          return next;
        });
      }
      edgeReconnectSuccessful.current = true;
    },
    [nodes, pushHistory]
  );

  // ---------------------------------------------------------------------------
  // Drag-and-drop from sidebar
  // ---------------------------------------------------------------------------
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  /**
   * Cria um nó do tipo pedido no ponto de tela (clientX/Y) dentro do canvas.
   * É o que o arrastar-e-soltar da paleta faz; abaixo de lg a paleta vira
   * gaveta e o toque no bloco chama isto com o centro do canvas.
   */
  const addNodeAt = useCallback(
    (nodeType: ChatbotNodeType, clientX: number, clientY: number) => {
      if (!nodeType || !reactFlowWrapper.current) return;

      // Check singleton constraint for 'start'
      const block = BLOCK_DEFINITIONS.find((b) => b.type === nodeType);
      if (block?.singleton && nodes.some((n) => n.type === nodeType)) {
        toast.error(`Só é permitido um nó do tipo "${block.label}"`);
        return;
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      // Convert screen coords to flow coords via the transform stored in DOM
      const flowEl = reactFlowWrapper.current.querySelector('.react-flow__viewport');
      let x = clientX - bounds.left - 100;
      let y = clientY - bounds.top - 40;
      if (flowEl) {
        const transform = (flowEl as HTMLElement).style.transform;
        const match = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)\s*scale\(([^)]+)\)/);
        if (match && match[1] && match[2] && match[3]) {
          const tx = parseFloat(match[1]);
          const ty = parseFloat(match[2]);
          const scale = parseFloat(match[3]);
          x = (clientX - bounds.left - tx) / scale - 100;
          y = (clientY - bounds.top - ty) / scale - 40;
        }
      }

      const newNode: Node = {
        id: crypto.randomUUID(),
        type: nodeType,
        position: { x, y },
        data: {
          ...defaultNodeData(nodeType),
          meta: {
            onDelete: handleDeleteNode,
            hasError: false,
            errorMessage: undefined,
          },
        },
      };

      setNodes((ns) => {
        const next = [...ns, newNode];
        pushHistory(next, edges);
        return next;
      });
    },
    [nodes, edges, pushHistory]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      addNodeAt(e.dataTransfer.getData('application/reactflow') as ChatbotNodeType, e.clientX, e.clientY);
    },
    [addNodeAt]
  );

  /** Gaveta de blocos (abaixo de lg): o toque cria o nó no centro do canvas. */
  const addNodeAtCenter = useCallback(
    (nodeType: ChatbotNodeType) => {
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      addNodeAt(nodeType, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    },
    [addNodeAt]
  );

  // ---------------------------------------------------------------------------
  // Node selection → open config panel
  // ---------------------------------------------------------------------------
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Node data change from panel
  // ---------------------------------------------------------------------------
  const handleNodeDataChange = useCallback(
    (nodeId: string, newData: ChatbotNodeData & Record<string, unknown>) => {
      setNodes((ns) => {
        const updated = ns.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...newData, meta: n.data.meta } }
            : n
        );
        pushHistory(updated, edges);
        return updated;
      });
      setSelectedNode((prev) =>
        prev?.id === nodeId
          ? { ...prev, data: { ...newData, meta: prev.data.meta } }
          : prev
      );
    },
    [edges, pushHistory]
  );

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  const buildSavePayload = (publishFlag = false) => ({
    chatbotId: chatbotId!,
    nodes: nodes.map((n) => {
      const { meta, ...restData } = n.data as any;
      return {
        id: n.id,
        node_type: n.type as ChatbotNodeType,
        position_x: Math.round(n.position.x),
        position_y: Math.round(n.position.y),
        data: restData as ChatbotNodeData & Record<string, unknown>,
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source_node_id: e.source,
      target_node_id: e.target,
      source_handle: e.sourceHandle ?? 'default',
      label: typeof e.label === 'string' ? e.label : null,
    })),
    variables: variables.map((v) => ({
      id: v.id,
      name: v.name,
      default_value: v.default_value,
    })),
    publish: publishFlag,
  });

  const handleSave = async () => {
    if (!chatbotId) return;
    try {
      // Update name if changed
      if (flowData && botName !== flowData.chatbot.name) {
        await updateMeta.mutateAsync({ id: chatbotId, name: botName });
      }
      await saveFlow.mutateAsync(buildSavePayload(false));
      setIsDirty(false);
      toast.success('Fluxo salvo com sucesso');
    } catch (err: any) {
      toast.error('Erro ao salvar fluxo', { description: err?.message });
    }
  };

  const handlePublish = async () => {
    if (!chatbotId) return;

    const nodesForValidation = nodes.map((n) => {
      const { meta, ...restData } = n.data as any;
      return { id: n.id, node_type: n.type as ChatbotNodeType, data: restData };
    });
    const edgesForValidation = edges.map((e) => ({
      source_node_id: e.source,
      source_handle: e.sourceHandle ?? 'default',
    }));

    const result = validateFlowForPublish(nodesForValidation, edgesForValidation);
    setNodeErrors(result.nodeErrors);

    if (!result.valid) {
      setPublishModal({ open: true, result });
      return;
    }

    try {
      if (flowData && botName !== flowData.chatbot.name) {
        await updateMeta.mutateAsync({ id: chatbotId, name: botName });
      }
      await saveFlow.mutateAsync(buildSavePayload(true));
      setIsDirty(false);
      toast.success('Chatbot publicado com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao publicar chatbot', { description: err?.message });
    }
  };

  /**
   * Fecha o modal de erro e leva o canvas até o nó. No celular não abre o painel
   * de configuração junto: a gaveta cobriria o canvas, e o que ela precisa ver é
   * a saída sem conexão, não os campos do bloco.
   */
  const focusNode = (nodeId: string) => {
    setPublishModal({ open: false });
    if (!compact) {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) setSelectedNode(node);
    }
    flowInstanceRef.current?.fitView({
      nodes: [{ id: nodeId }],
      duration: 500,
      maxZoom: 1.1,
      padding: 0.6,
    });
  };

  // ---------------------------------------------------------------------------
  // Sidebar drag start
  // ---------------------------------------------------------------------------
  const onSidebarDragStart = (e: React.DragEvent, nodeType: ChatbotNodeType) => {
    e.dataTransfer.setData('application/reactflow', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !flowData) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background gap-3">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Erro ao carregar o fluxo</p>
        <Button variant="outline" onClick={() => navigate('/dashboard/chatbots')}>
          Voltar
        </Button>
      </div>
    );
  }

  const startExists = nodes.some((n) => n.type === 'start');
  const isSaving = saveFlow.isPending || updateMeta.isPending;

  /**
   * Lista de blocos da paleta. Em lg+ ela é a coluna fixa da esquerda e os
   * blocos são arrastados para o canvas; abaixo de lg vive numa gaveta
   * (Sheet) e o toque cria o bloco no centro do canvas — arrastar por cima
   * de uma gaveta não funciona, e no tablet nem existe arrastar.
   */
  const renderPalette = (mode: 'drag' | 'tap') => (
    <div className="p-2 space-y-3">
      {NODE_CATEGORIES.map((cat) => {
        const blocks = BLOCK_DEFINITIONS.filter((b) => b.category === cat.key);
        if (blocks.length === 0) return null;
        return (
          <div key={cat.key}>
            <p className={`text-[10px] font-bold px-1 py-0.5 mb-1 rounded text-white ${CATEGORY_HEADER_CLASS[cat.key]}`}>
              {cat.label}
            </p>
            {blocks.map((block) => {
              const disabled = block.singleton && startExists && block.type === 'start';
              const className = `flex w-full items-center gap-2 px-2 py-1.5 mb-0.5 rounded text-xs border transition-colors text-left
                ${disabled
                  ? 'opacity-40 cursor-not-allowed bg-muted border-transparent'
                  : 'hover:bg-primary/10 hover:border-primary/30 border-transparent bg-transparent'
                } ${mode === 'drag' ? 'cursor-grab' : 'cursor-pointer'}`;
              const inner = (
                <>
                  <span>{block.emoji}</span>
                  <span className="leading-tight">{block.label}</span>
                </>
              );
              if (mode === 'tap') {
                return (
                  <button
                    key={block.type}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      addNodeAtCenter(block.type);
                      setPaletteOpen(false);
                    }}
                    className={className}
                    title={block.description}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <div
                  key={block.type}
                  draggable={!disabled}
                  onDragStart={(e) => !disabled && onSidebarDragStart(e, block.type)}
                  className={className}
                  title={block.description}
                >
                  {inner}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      {/* flex-wrap: abaixo de 1024px a barra não cabia (945px a 768) e o
          "Publicar" saía da tela. Os rótulos dos botões da direita só aparecem
          em lg+; abaixo disso ficam os ícones com title/aria-label. */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-4 py-2 border-b bg-card z-10 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/chatbots')} aria-label="Voltar para Chatbots">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <Input
          value={botName}
          onChange={(e) => { setBotName(e.target.value); setIsDirty(true); }}
          className="h-8 w-40 sm:w-52 text-sm font-medium"
          aria-label="Nome do chatbot"
        />

        {/* O construtor não tem PageHeader: a ajuda da tela fica na barra do topo. */}
        <FeatureHelp helpKey="page:chatbot-builder" />

        {/* Abaixo de lg a paleta é uma gaveta; este é o botão que a abre. */}
        {compact && (
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)} aria-label="Abrir blocos">
            <Blocks className="h-4 w-4" />
            <span className="ml-1.5">Blocos</span>
          </Button>
        )}

        {isDirty && (
          <Badge variant="outline" className="text-orange-500 border-orange-500 text-xs">
            Não salvo
          </Badge>
        )}
        {!isDirty && flowData.chatbot.is_published && (
          <Badge variant="default" className="text-xs gap-1">
            <Check className="h-3 w-3" />
            Publicado
          </Badge>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} title="Editar configurações do bot" aria-label="Editar Bot">
            <Settings2 className="h-4 w-4" />
            <span className="ml-1.5 hidden lg:inline">Editar Bot</span>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="ghost" size="icon" onClick={undo} title="Desfazer (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={redo} title="Refazer (Ctrl+Y)">
            <Redo2 className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving} title="Salvar" aria-label="Salvar">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-1.5 hidden lg:inline">Salvar</span>
          </Button>
          <Button size="sm" onClick={handlePublish} disabled={isSaving} title="Publicar" aria-label="Publicar">
            <Upload className="h-4 w-4" />
            <span className="ml-1.5 hidden lg:inline">Publicar</span>
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — block palette (lg+). Abaixo disso, gaveta. */}
        {!compact && (
          <div className="w-56 border-r bg-card flex flex-col shrink-0">
            <div className="px-3 py-2 border-b">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Blocos</p>
            </div>
            <ScrollArea className="flex-1">{renderPalette('drag')}</ScrollArea>
          </div>
        )}

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
          <FlowEdgeContext.Provider value={{ deleteEdge }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={(instance) => { flowInstanceRef.current = instance; }}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            edgesReconnectable
            fitView
            deleteKeyCode={null}
            className="bg-[hsl(var(--background))]"
            defaultEdgeOptions={{
              markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
              style: { stroke: 'hsl(var(--primary))', strokeWidth: 1.5 },
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1}
              color="hsl(var(--muted-foreground) / 0.25)"
            />
            <Controls className="!bottom-4 !left-4" />
            <MiniMap
              className="!bottom-4 !right-4 !border !rounded-md !bg-card"
              nodeColor="#888"
            />
          </ReactFlow>
          </FlowEdgeContext.Provider>
        </div>

        {/* Right sidebar — node config (lg+). Abaixo disso, gaveta. */}
        {selectedNode && !compact && (
          <div className="w-72 border-l bg-card shrink-0 flex flex-col">
            <NodeConfigPanel
              node={selectedNode}
              variables={variables}
              onDataChange={handleNodeDataChange}
              onSave={handleSave}
              onClose={() => setSelectedNode(null)}
              saving={isSaving}
            />
          </div>
        )}
      </div>

      {/* Abaixo de lg: paleta e configuração do nó viram gavetas (Sheet). */}
      {compact && (
        <>
          <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
            <SheetContent side="left" className="w-full p-0 sm:max-w-xs">
              <SheetHeader className="px-3 py-2 border-b text-left">
                <SheetTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Blocos</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100%-2.75rem)]">{renderPalette('tap')}</ScrollArea>
            </SheetContent>
          </Sheet>
          <Sheet open={!!selectedNode} onOpenChange={(o) => !o && setSelectedNode(null)}>
            <SheetContent side="right" className="w-full p-0 sm:max-w-sm [&>button]:hidden">
              <SheetHeader className="sr-only">
                <SheetTitle>Configurar bloco</SheetTitle>
              </SheetHeader>
              {selectedNode && (
                <NodeConfigPanel
                  node={selectedNode}
                  variables={variables}
                  onDataChange={handleNodeDataChange}
                  onSave={handleSave}
                  onClose={() => setSelectedNode(null)}
                  saving={isSaving}
                />
              )}
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* Publish error modal */}
      <Dialog open={publishModal.open} onOpenChange={(o) => !o && setPublishModal({ open: false })}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Fluxo inválido para publicação
            </DialogTitle>
            <DialogDescription>
              Corrija os erros abaixo antes de publicar o chatbot.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-72">
            <ul className="space-y-2 py-2">
              {/* Erros do fluxo inteiro (falta o nó de Início, há dois...). O erro
                  genérico de conexão sai daqui: quem responde por ele é a lista
                  de blocos abaixo, que diz QUAL bloco e leva até ele. */}
              {(publishModal.result?.errors ?? [])
                .filter((err) => err !== FLOW_NODE_CONNECTION_ERROR)
                .map((err, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    {err}
                  </li>
                ))}
            </ul>

            {Object.keys(publishModal.result?.nodeErrors ?? {}).length > 0 && (
              <div className="space-y-2 py-2">
                <p className="text-sm">
                  Estes blocos estão com saída sem conexão. Ligue a bolinha da saída ao
                  próximo bloco:
                </p>
                <ul className="space-y-2">
                  {Object.entries(publishModal.result?.nodeErrors ?? {}).map(([nodeId, message]) => {
                    const node = nodes.find((n) => n.id === nodeId);
                    return (
                      <li
                        key={nodeId}
                        className="rounded-md border border-destructive/40 bg-destructive/5 p-2 space-y-1"
                      >
                        <p className="text-sm font-medium">
                          {node ? describeNode(node) : 'Bloco removido do fluxo'}
                        </p>
                        <p className="text-xs text-muted-foreground">{message}</p>
                        {node && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            onClick={() => focusNode(nodeId)}
                          >
                            Ver no fluxo
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setPublishModal({ open: false })}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit bot settings (name, description, instance, priority, triggers) */}
      <NewChatbotFlowModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{
          id: flowData.chatbot.id,
          name: flowData.chatbot.name,
          description: flowData.chatbot.description,
          whatsapp_instance_id: flowData.chatbot.whatsapp_instance_id,
          priority: flowData.chatbot.priority,
          triggers: flowData.triggers,
        }}
      />
    </div>
  );
};

export default ChatbotFlowBuilder;

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenantId } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { logger } from '@/lib/logger';
import { validateFlowForPublish } from '@/lib/chatbot/flowEngine';
import { defaultNodeData } from '@/lib/chatbot/flowConstants';
import type {
  ChatbotRow,
  ChatbotTriggerRow,
  ChatbotNodeRow,
  ChatbotEdgeRow,
  ChatbotVariableRow,
  ChatbotTriggerType,
  ChatbotTriggerValue,
  ChatbotNodeType,
  ChatbotNodeData,
} from '@/types/chatbot-flow.types';

// The new chatbot_* tables may not be in the generated types yet.
// We cast the Supabase client to `any` for those specific calls so
// TypeScript doesn't complain until the types are regenerated.
const db = supabase as any;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ChatbotWithMeta extends ChatbotRow {
  trigger_count: number;
  node_count: number;
  triggers: ChatbotTriggerRow[];
}

export interface ChatbotFlowFull {
  chatbot: ChatbotRow;
  nodes: ChatbotNodeRow[];
  edges: ChatbotEdgeRow[];
  variables: ChatbotVariableRow[];
  triggers: ChatbotTriggerRow[];
}

export interface SaveFlowPayload {
  chatbotId: string;
  nodes: Array<{
    id: string;
    node_type: ChatbotNodeType;
    position_x: number;
    position_y: number;
    data: ChatbotNodeData & Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source_node_id: string;
    target_node_id: string;
    source_handle: string | null;
    label: string | null;
  }>;
  variables: Array<{
    id?: string;
    name: string;
    default_value: string | null;
  }>;
  publish?: boolean;
}

// ---------------------------------------------------------------------------
// List chatbots with meta counts
// ---------------------------------------------------------------------------
export function useChatbotList() {
  const tenantId = useTenantId();

  return useQuery({
    queryKey: [QUERY_KEYS.CHATBOTS, 'list', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ChatbotWithMeta[]> => {
      const { data: chatbots, error } = await db
        .from('chatbots')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Erro ao listar chatbots', { error });
        throw error;
      }

      const ids = (chatbots ?? []).map((c: any) => c.id as string);
      if (ids.length === 0) return [];

      const [triggersRes, nodesRes] = await Promise.all([
        db
          .from('chatbot_triggers')
          .select('id, chatbot_id, trigger_type, trigger_value, is_active, created_at, tenant_id')
          .eq('tenant_id', tenantId!)
          .in('chatbot_id', ids),
        db
          .from('chatbot_nodes')
          .select('id, chatbot_id')
          .eq('tenant_id', tenantId!)
          .in('chatbot_id', ids),
      ]);

      const triggersByBot = new Map<string, ChatbotTriggerRow[]>();
      const nodeCountByBot = new Map<string, number>();

      (triggersRes.data ?? []).forEach((t: any) => {
        const arr = triggersByBot.get(t.chatbot_id) ?? [];
        arr.push(t as ChatbotTriggerRow);
        triggersByBot.set(t.chatbot_id, arr);
      });

      (nodesRes.data ?? []).forEach((n: any) => {
        nodeCountByBot.set(n.chatbot_id, (nodeCountByBot.get(n.chatbot_id) ?? 0) + 1);
      });

      return (chatbots ?? []).map((c: any) => ({
        ...(c as ChatbotRow),
        trigger_count: (triggersByBot.get(c.id) ?? []).length,
        node_count: nodeCountByBot.get(c.id) ?? 0,
        triggers: triggersByBot.get(c.id) ?? [],
      }));
    },
  });
}

// ---------------------------------------------------------------------------
// Get full flow for the builder
// ---------------------------------------------------------------------------
export function useChatbotFlowFull(chatbotId: string | undefined) {
  const tenantId = useTenantId();

  return useQuery({
    queryKey: [QUERY_KEYS.CHATBOTS, 'full', chatbotId, tenantId],
    enabled: !!tenantId && !!chatbotId,
    queryFn: async (): Promise<ChatbotFlowFull> => {
      const [chatbotRes, nodesRes, edgesRes, variablesRes, triggersRes] = await Promise.all([
        db.from('chatbots').select('*').eq('id', chatbotId!).eq('tenant_id', tenantId!).single(),
        db.from('chatbot_nodes').select('*').eq('chatbot_id', chatbotId!).eq('tenant_id', tenantId!),
        db.from('chatbot_edges').select('*').eq('chatbot_id', chatbotId!).eq('tenant_id', tenantId!),
        db.from('chatbot_variables').select('*').eq('chatbot_id', chatbotId!).eq('tenant_id', tenantId!),
        db.from('chatbot_triggers').select('*').eq('chatbot_id', chatbotId!).eq('tenant_id', tenantId!),
      ]);

      if (chatbotRes.error) throw chatbotRes.error;
      if (nodesRes.error) throw nodesRes.error;
      if (edgesRes.error) throw edgesRes.error;
      if (variablesRes.error) throw variablesRes.error;
      if (triggersRes.error) throw triggersRes.error;

      return {
        chatbot: chatbotRes.data as ChatbotRow,
        nodes: (nodesRes.data ?? []) as ChatbotNodeRow[],
        edges: (edgesRes.data ?? []) as ChatbotEdgeRow[],
        variables: (variablesRes.data ?? []) as ChatbotVariableRow[],
        triggers: (triggersRes.data ?? []) as ChatbotTriggerRow[],
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Create chatbot + triggers + default start node
// ---------------------------------------------------------------------------
export interface CreateChatbotPayload {
  name: string;
  description?: string | null;
  whatsapp_instance_id?: string | null;
  priority?: number;
  triggers: Array<{
    trigger_type: ChatbotTriggerType;
    trigger_value: ChatbotTriggerValue;
    is_active: boolean;
  }>;
}

export function useCreateChatbot() {
  const tenantId = useTenantId();
  const qc = useQueryClient();

  return useMutation({
    mutationKey: [QUERY_KEYS.CHATBOTS, 'create'],
    mutationFn: async (payload: CreateChatbotPayload): Promise<ChatbotRow> => {
      if (!tenantId) throw new Error('tenant_id é obrigatório');

      const { data: chatbot, error: chatbotErr } = await db
        .from('chatbots')
        .insert({
          tenant_id: tenantId,
          name: payload.name,
          description: payload.description ?? null,
          whatsapp_instance_id: payload.whatsapp_instance_id ?? null,
          priority: payload.priority ?? 0,
          builder_version: 2,
          is_published: false,
          is_active: true,
          trigger_type: 'keyword',
        })
        .select()
        .single();

      if (chatbotErr) throw chatbotErr;

      const chatbotId = (chatbot as ChatbotRow).id;

      const triggersToInsert = payload.triggers.map((t) => ({
        tenant_id: tenantId,
        chatbot_id: chatbotId,
        trigger_type: t.trigger_type,
        trigger_value: t.trigger_value,
        is_active: t.is_active,
      }));

      const startNode = {
        tenant_id: tenantId,
        chatbot_id: chatbotId,
        node_type: 'start' as ChatbotNodeType,
        position_x: 100,
        position_y: 100,
        data: defaultNodeData('start') as ChatbotNodeData & Record<string, unknown>,
      };

      const [trigsRes, nodeRes] = await Promise.all([
        db.from('chatbot_triggers').insert(triggersToInsert),
        db.from('chatbot_nodes').insert(startNode),
      ]);

      if (trigsRes.error) throw trigsRes.error;
      if (nodeRes.error) throw nodeRes.error;

      logger.info('Chatbot criado com sucesso', { chatbotId, name: payload.name });
      return chatbot as ChatbotRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.CHATBOTS] });
    },
  });
}

// ---------------------------------------------------------------------------
// Update chatbot meta
// ---------------------------------------------------------------------------
export interface UpdateChatbotMetaPayload {
  id: string;
  name?: string;
  description?: string | null;
  whatsapp_instance_id?: string | null;
  priority?: number;
}

export function useUpdateChatbotMeta() {
  const tenantId = useTenantId();
  const qc = useQueryClient();

  return useMutation({
    mutationKey: [QUERY_KEYS.CHATBOTS, 'update-meta'],
    mutationFn: async (payload: UpdateChatbotMetaPayload) => {
      if (!tenantId) throw new Error('tenant_id é obrigatório');
      const { id, ...rest } = payload;
      const { data, error } = await db
        .from('chatbots')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();
      if (error) throw error;
      return data as ChatbotRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.CHATBOTS] });
    },
  });
}

// ---------------------------------------------------------------------------
// Replace a chatbot's triggers (delete-all + insert)
// ---------------------------------------------------------------------------
export interface UpdateTriggersPayload {
  chatbotId: string;
  triggers: Array<{
    trigger_type: ChatbotTriggerType;
    trigger_value: ChatbotTriggerValue;
    is_active: boolean;
  }>;
}

export function useUpdateChatbotTriggers() {
  const tenantId = useTenantId();
  const qc = useQueryClient();

  return useMutation({
    mutationKey: [QUERY_KEYS.CHATBOTS, 'update-triggers'],
    mutationFn: async (payload: UpdateTriggersPayload) => {
      if (!tenantId) throw new Error('tenant_id é obrigatório');
      const { chatbotId, triggers } = payload;

      const { error: delErr } = await db
        .from('chatbot_triggers')
        .delete()
        .eq('chatbot_id', chatbotId)
        .eq('tenant_id', tenantId);
      if (delErr) throw delErr;

      if (triggers.length > 0) {
        const { error: insErr } = await db.from('chatbot_triggers').insert(
          triggers.map((t) => ({
            tenant_id: tenantId,
            chatbot_id: chatbotId,
            trigger_type: t.trigger_type,
            trigger_value: t.trigger_value,
            is_active: t.is_active,
          }))
        );
        if (insErr) throw insErr;
      }
      logger.info('Gatilhos atualizados', { chatbotId, count: triggers.length });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.CHATBOTS, 'full', vars.chatbotId] });
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.CHATBOTS, 'list'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Toggle is_active
// ---------------------------------------------------------------------------
export function useToggleChatbotActive() {
  const tenantId = useTenantId();
  const qc = useQueryClient();

  return useMutation({
    mutationKey: [QUERY_KEYS.CHATBOTS, 'toggle-active'],
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (!tenantId) throw new Error('tenant_id é obrigatório');
      const { error } = await db
        .from('chatbots')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.CHATBOTS] });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete chatbot
// ---------------------------------------------------------------------------
export function useDeleteChatbot() {
  const tenantId = useTenantId();
  const qc = useQueryClient();

  return useMutation({
    mutationKey: [QUERY_KEYS.CHATBOTS, 'delete'],
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error('tenant_id é obrigatório');
      const { error } = await db
        .from('chatbots')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      logger.info('Chatbot excluído', { chatbotId: id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.CHATBOTS] });
    },
  });
}

// ---------------------------------------------------------------------------
// Save flow (bulk upsert nodes/edges/variables, optionally publish)
// ---------------------------------------------------------------------------
export function useSaveFlow() {
  const tenantId = useTenantId();
  const qc = useQueryClient();

  return useMutation({
    mutationKey: [QUERY_KEYS.CHATBOTS, 'save-flow'],
    mutationFn: async (payload: SaveFlowPayload) => {
      if (!tenantId) throw new Error('tenant_id é obrigatório');
      const { chatbotId, nodes, edges, variables, publish = false } = payload;

      if (publish) {
        const validationResult = validateFlowForPublish(
          nodes.map((n) => ({ id: n.id, node_type: n.node_type, data: n.data })),
          edges.map((e) => ({ source_node_id: e.source_node_id, source_handle: e.source_handle }))
        );
        if (!validationResult.valid) {
          const err = new Error('Fluxo inválido para publicação');
          (err as any).validationResult = validationResult;
          throw err;
        }
      }

      // Fetch existing ids to delete removed ones
      const [existingNodesRes, existingEdgesRes, existingVarsRes] = await Promise.all([
        db.from('chatbot_nodes').select('id').eq('chatbot_id', chatbotId).eq('tenant_id', tenantId),
        db.from('chatbot_edges').select('id').eq('chatbot_id', chatbotId).eq('tenant_id', tenantId),
        db.from('chatbot_variables').select('id').eq('chatbot_id', chatbotId).eq('tenant_id', tenantId),
      ]);

      const existingNodeIds = new Set<string>((existingNodesRes.data ?? []).map((n: any) => n.id as string));
      const existingEdgeIds = new Set<string>((existingEdgesRes.data ?? []).map((e: any) => e.id as string));
      const existingVarIds = new Set<string>((existingVarsRes.data ?? []).map((v: any) => v.id as string));

      const newNodeIds = new Set(nodes.map((n) => n.id));
      const newEdgeIds = new Set(edges.map((e) => e.id));
      const newVarIds = new Set(variables.filter((v) => v.id).map((v) => v.id!));

      const deletedNodeIds = [...existingNodeIds].filter((id) => !newNodeIds.has(id));
      const deletedEdgeIds = [...existingEdgeIds].filter((id) => !newEdgeIds.has(id));
      const deletedVarIds = [...existingVarIds].filter((id) => !newVarIds.has(id));

      const ops: Promise<{ error: any }>[] = [];

      if (deletedNodeIds.length > 0) {
        ops.push(db.from('chatbot_nodes').delete().in('id', deletedNodeIds).eq('tenant_id', tenantId));
      }
      if (deletedEdgeIds.length > 0) {
        ops.push(db.from('chatbot_edges').delete().in('id', deletedEdgeIds).eq('tenant_id', tenantId));
      }
      if (deletedVarIds.length > 0) {
        ops.push(db.from('chatbot_variables').delete().in('id', deletedVarIds).eq('tenant_id', tenantId));
      }

      if (nodes.length > 0) {
        ops.push(
          db.from('chatbot_nodes').upsert(
            nodes.map((n) => ({ ...n, chatbot_id: chatbotId, tenant_id: tenantId })),
            { onConflict: 'id' }
          )
        );
      }

      if (edges.length > 0) {
        ops.push(
          db.from('chatbot_edges').upsert(
            edges.map((e) => ({ ...e, chatbot_id: chatbotId, tenant_id: tenantId })),
            { onConflict: 'id' }
          )
        );
      }

      if (variables.length > 0) {
        ops.push(
          db.from('chatbot_variables').upsert(
            variables.map((v) => ({
              ...(v.id ? { id: v.id } : {}),
              chatbot_id: chatbotId,
              tenant_id: tenantId,
              name: v.name,
              default_value: v.default_value,
            })),
            { onConflict: 'id' }
          )
        );
      }

      const chatbotUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (publish) chatbotUpdate.is_published = true;

      ops.push(
        db
          .from('chatbots')
          .update(chatbotUpdate)
          .eq('id', chatbotId)
          .eq('tenant_id', tenantId)
      );

      const results = await Promise.all(ops);
      for (const r of results) {
        if (r?.error) throw r.error;
      }

      logger.info('Fluxo salvo', { chatbotId, publish, nodeCount: nodes.length, edgeCount: edges.length });
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.CHATBOTS, 'full', variables.chatbotId] });
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.CHATBOTS, 'list'] });
    },
  });
}

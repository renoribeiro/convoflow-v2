import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bot,
  Plus,
  Activity,
  Pause,
  BarChart3,
  Edit,
  Trash2,
  Workflow,
  Loader2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import NewChatbotFlowModal from '@/components/chatbots/NewChatbotFlowModal';
import {
  useChatbotList,
  useDeleteChatbot,
  useToggleChatbotActive,
  type ChatbotWithMeta,
} from '@/hooks/useChatbotFlow';
import type { ChatbotTriggerType } from '@/types/chatbot-flow.types';

const TRIGGER_LABELS: Record<ChatbotTriggerType, string> = {
  keyword: 'Palavra-chave',
  first_contact: 'Primeiro contato',
  out_of_hours: 'Fora do horário',
  no_agent_reply: 'Sem resposta',
  funnel_stage: 'Etapa do funil',
};

const Chatbots: React.FC = () => {
  const navigate = useNavigate();
  const { data: chatbots = [], isLoading } = useChatbotList();
  const deleteChatbot = useDeleteChatbot();
  const toggleActive = useToggleChatbotActive();

  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatbotWithMeta | null>(null);

  const handleToggle = async (chatbot: ChatbotWithMeta) => {
    try {
      await toggleActive.mutateAsync({ id: chatbot.id, is_active: !chatbot.is_active });
      toast.success(chatbot.is_active ? 'Chatbot desativado' : 'Chatbot ativado');
    } catch (err: any) {
      toast.error('Erro ao alterar status', { description: err?.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteChatbot.mutateAsync(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" excluído`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error('Erro ao excluir chatbot', { description: err?.message });
    }
  };

  const stats = {
    total: chatbots.length,
    active: chatbots.filter((c) => c.is_active).length,
    inactive: chatbots.filter((c) => !c.is_active).length,
    published: chatbots.filter((c) => c.is_published).length,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded w-1/4 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-md animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-muted rounded-md animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chatbots"
        helpKey="page:chatbots"
        description="Crie fluxos visuais de atendimento automático para o WhatsApp"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Chatbots' }]}
        actions={
          <Button onClick={() => setShowNewModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Chatbot
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativos</CardTitle>
            <Activity className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inativos</CardTitle>
            <Pause className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{stats.inactive}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Publicados</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.published}</div>
          </CardContent>
        </Card>
      </div>

      {/* Chatbot cards */}
      <div className="grid gap-4">
        {chatbots.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bot className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum chatbot configurado</h3>
              <p className="text-muted-foreground text-center mb-4">
                Crie seu primeiro chatbot de fluxo visual para automatizar o atendimento no WhatsApp
              </p>
              <Button onClick={() => setShowNewModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Chatbot
              </Button>
            </CardContent>
          </Card>
        ) : (
          chatbots.map((chatbot) => (
            <Card key={chatbot.id}>
              <CardHeader>
                {/* No celular a linha de ações (toggle + Editar + excluir) não
                    cabe ao lado do título: quebra para baixo. */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{chatbot.name}</CardTitle>
                      {chatbot.is_published && (
                        <Badge variant="default" className="text-xs gap-1">
                          <Check className="h-3 w-3" />
                          Publicado
                        </Badge>
                      )}
                      {chatbot.priority != null && chatbot.priority > 0 && (
                        <Badge variant="outline" className="text-xs">
                          Prioridade {chatbot.priority}
                        </Badge>
                      )}
                    </div>
                    {chatbot.description && (
                      <CardDescription className="text-sm">{chatbot.description}</CardDescription>
                    )}
                    {/* Trigger badges */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {chatbot.triggers.map((t) => (
                        <Badge key={t.id} variant="secondary" className="text-xs">
                          {TRIGGER_LABELS[t.trigger_type] ?? t.trigger_type}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Inline active toggle */}
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={!!chatbot.is_active}
                        onCheckedChange={() => handleToggle(chatbot)}
                        disabled={toggleActive.isPending}
                      />
                      <span className="text-xs text-muted-foreground">
                        {chatbot.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    {/* Edit flow */}
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => navigate(`/dashboard/chatbots/${chatbot.id}/builder`)}
                    >
                      <Workflow className="h-4 w-4 mr-1.5" />
                      Editar Fluxo
                    </Button>

                    {/* Delete */}
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(chatbot)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{chatbot.node_count} nó{chatbot.node_count !== 1 ? 's' : ''}</span>
                  <span>{chatbot.trigger_count} gatilho{chatbot.trigger_count !== 1 ? 's' : ''}</span>
                  <span>
                    Criado em{' '}
                    {new Date(chatbot.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Modals */}
      <NewChatbotFlowModal open={showNewModal} onClose={() => setShowNewModal(false)} />

      <ConfirmationDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir Chatbot"
        description={`Tem certeza que deseja excluir "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
        isLoading={deleteChatbot.isPending}
      />
    </div>
  );
};

export default Chatbots;

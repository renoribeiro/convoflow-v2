import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { Pagination } from '@/components/shared/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useCan } from '@/contexts/TenantContext';
import { CampaignDetailsModal } from './CampaignDetailsModal';
import {
  Send,
  Edit,
  Trash2,
  Clock,
  Users,
  MoreHorizontal,
  Pause,
  Play,
  Copy,
  XCircle,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Eye,
  Plus,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CampaignCardSkeleton } from '@/components/shared/Skeleton';
import {
  useCampaignsByStatus,
  useCampaignMutations,
  type Campaign,
  type CampaignStatus,
} from '@/hooks/useCampaigns';

// ─────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  paused: 'Pausada',
  scheduled: 'Agendada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  draft: 'Rascunho',
};

const STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  paused: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-purple-100 text-purple-800 border-purple-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
};

const MESSAGE_TYPE_ICON: Record<string, React.ReactNode> = {
  text: <MessageSquare className="h-4 w-4" />,
  image: <ImageIcon className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  document: <Send className="h-4 w-4" />,
  audio: <Send className="h-4 w-4" />,
};

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

function relativeDate(dateString?: string | null): string {
  if (!dateString) return '—';
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days < 7) return `Há ${days} dias`;
  if (days < 30) {
    const semanas = Math.floor(days / 7);
    return semanas === 1 ? 'Há 1 semana' : `Há ${semanas} semanas`;
  }
  const meses = Math.floor(days / 30);
  return meses === 1 ? 'Há 1 mês' : `Há ${meses} meses`;
}

function countdownLabel(dateString?: string | null): string {
  if (!dateString) return '';
  const diff = new Date(dateString).getTime() - Date.now();
  if (diff <= 0) return 'Agora';
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return `em ${d}d ${h}h`;
  if (h > 0) return `em ${h}h ${m}min`;
  return `em ${m}min`;
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface CampaignsListProps {
  status: CampaignStatus | 'active'; // 'active' tab includes paused
  onEdit: (campaign: Campaign) => void;
  /** Abre o assistente: a primeira ação do vazio (B13). */
  onNova?: () => void;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export const CampaignsList = ({ status, onEdit, onNova }: CampaignsListProps) => {
  const { data: campaigns = [], isLoading } = useCampaignsByStatus(
    status as CampaignStatus
  );
  const { setCampaignStatus, duplicateCampaign, deleteCampaign, scheduleCampaign } =
    useCampaignMutations();

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Disparar e cancelar pedem confirmação (achados 90 e 92 do checkup): um
  // clique mandava a campanha para todos, ou parava de vez, sem perguntar.
  const [disparoAlvo, setDisparoAlvo] = useState<Campaign | null>(null);
  const [cancelamentoAlvo, setCancelamentoAlvo] = useState<Campaign | null>(null);
  // Criar, disparar, pausar, cancelar, duplicar, editar e excluir exigem
  // campaigns.dispatch, como no servidor (policies campaigns_tenant_*).
  // O atendente só acompanha (achado 91).
  const podeAgir = useCan('campaigns.dispatch');
  const [detailsCampaignId, setDetailsCampaignId] = useState<string | null>(null);

  const pagination = usePagination({ totalItems: campaigns.length, initialItemsPerPage: 6 });

  const paginated = useMemo(() => {
    return campaigns.slice(
      pagination.startIndex,
      pagination.startIndex + pagination.itemsPerPage
    );
  }, [campaigns, pagination.startIndex, pagination.itemsPerPage]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <CampaignCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    const emptyLabels: Record<string, string> = {
      active: 'ativas ou pausadas',
      scheduled: 'agendadas',
      completed: 'concluídas',
      cancelled: 'canceladas',
      draft: 'em rascunho',
    };
    // Primeira ação para quem cria campanha; o atendente só lê (B13).
    return (
      <EmptyState
        icon={<Send className="w-10 h-10" />}
        title="Nenhuma campanha encontrada"
        description={
          podeAgir && onNova
            ? `Não há campanhas ${emptyLabels[status] ?? status} no momento. Para falar com muitos contatos de uma vez, crie uma campanha.`
            : `Não há campanhas ${emptyLabels[status] ?? status} no momento.`
        }
        action={podeAgir && onNova ? { label: 'Nova Campanha', onClick: onNova, icon: <Plus className="w-4 h-4 mr-2" /> } : undefined}
      />
    );
  }

  return (
    <>
      <div className="space-y-4">
        {paginated.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            onEdit={onEdit}
            onViewDetails={(id) => setDetailsCampaignId(id)}
            onDispatchNow={() => setDisparoAlvo(campaign)}
            isDispatching={scheduleCampaign.isPending}
            podeAgir={podeAgir}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
            onPause={(id) =>
              setCampaignStatus.mutate({ campaignId: id, action: 'pause' })
            }
            onResume={(id) =>
              setCampaignStatus.mutate({ campaignId: id, action: 'resume' })
            }
            onCancel={() => setCancelamentoAlvo(campaign)}
            onDuplicate={(c) => duplicateCampaign.mutate(c)}
          />
        ))}
      </div>

      {campaigns.length > pagination.itemsPerPage && (
        <div className="mt-6">
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={campaigns.length}
            itemsPerPage={pagination.itemsPerPage}
            onPageChange={pagination.goToPage}
            onItemsPerPageChange={pagination.setItemsPerPage}
            showItemsPerPage
            itemsPerPageOptions={[3, 6, 12, 24]}
          />
        </div>
      )}

      <ConfirmationDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteCampaign.mutateAsync(deleteTarget.id);
        }}
        title="Excluir a campanha?"
        description={`A campanha "${deleteTarget?.name ?? ''}" some da lista, com os números de envio e leitura dela. As mensagens que já saíram continuam com os clientes.`}
        reversivel={false}
        confirmText="Excluir campanha"
        variant="destructive"
        isLoading={deleteCampaign.isPending}
        icon={<Trash2 className="h-5 w-5 text-red-500" />}
      />

      <ConfirmationDialog
        isOpen={!!disparoAlvo}
        onClose={() => setDisparoAlvo(null)}
        onConfirm={async () => {
          if (disparoAlvo) await scheduleCampaign.mutateAsync(disparoAlvo.id);
        }}
        title="Disparar a campanha agora?"
        description={
          <>
            <p>
              A campanha "{disparoAlvo?.name}" começa a enviar agora para{' '}
              {textoDeContatos(disparoAlvo?.total_recipients ?? 0)}
              {disparoAlvo?.whatsapp_instance ? `, pelo número ${disparoAlvo.whatsapp_instance.name}` : ''}.
            </p>
            <p>Dá para pausar no meio, mas a mensagem que já saiu chegou ao cliente e não volta.</p>
          </>
        }
        confirmText={rotuloDeDisparo(disparoAlvo?.total_recipients ?? 0)}
        isLoading={scheduleCampaign.isPending}
        icon={<Send className="h-5 w-5" />}
      />

      <ConfirmationDialog
        isOpen={!!cancelamentoAlvo}
        onClose={() => setCancelamentoAlvo(null)}
        onConfirm={async () => {
          if (cancelamentoAlvo) await setCampaignStatus.mutateAsync({ campaignId: cancelamentoAlvo.id, action: 'cancel' });
        }}
        title="Cancelar a campanha?"
        description={`A campanha "${cancelamentoAlvo?.name ?? ''}" para de vez: as mensagens que ainda não saíram não serão enviadas. O que já saiu continua com os clientes.`}
        reversivel={false}
        confirmText="Cancelar campanha"
        cancelText="Voltar"
        variant="destructive"
        isLoading={setCampaignStatus.isPending}
        icon={<XCircle className="h-5 w-5 text-red-500" />}
      />

      <CampaignDetailsModal
        campaignId={detailsCampaignId}
        onClose={() => setDetailsCampaignId(null)}
      />
    </>
  );
};

// ─────────────────────────────────────────────
// CampaignCard
// ─────────────────────────────────────────────

/** "1.240 contatos" / "1 contato" / "os contatos da lista" (sem número ainda). */
function textoDeContatos(total: number): string {
  if (total <= 0) return 'os contatos da lista';
  return total === 1 ? '1 contato' : `${total.toLocaleString('pt-BR')} contatos`;
}

function rotuloDeDisparo(total: number): string {
  if (total <= 0) return 'Disparar agora';
  return total === 1 ? 'Disparar para 1 contato' : `Disparar para ${total.toLocaleString('pt-BR')} contatos`;
}

interface CampaignCardProps {
  campaign: Campaign;
  /** campaigns.dispatch: sem ela, o cartão só mostra os detalhes. */
  podeAgir: boolean;
  onEdit: (c: Campaign) => void;
  onViewDetails: (id: string) => void;
  onDispatchNow: (id: string) => void;
  isDispatching: boolean;
  onDelete: (id: string, name: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onDuplicate: (c: Campaign) => void;
}

function CampaignCard({
  campaign,
  onEdit,
  podeAgir,
  onViewDetails,
  onDispatchNow,
  isDispatching,
  onDelete,
  onPause,
  onResume,
  onCancel,
  onDuplicate,
}: CampaignCardProps) {
  const total = campaign.total_recipients ?? 0;
  const sent = campaign.sent_count ?? 0;
  const delivered = campaign.delivered_count ?? 0;
  const read = campaign.read_count ?? 0;
  const progress = total > 0 ? Math.round((sent / total) * 100) : 0;

  const isDraft = campaign.status === 'draft';
  const isActive = campaign.status === 'active';
  const isPaused = campaign.status === 'paused';
  const isScheduled = campaign.status === 'scheduled';
  const isCompleted = campaign.status === 'completed';
  const isCancelled = campaign.status === 'cancelled';
  // "Disparar agora" only when nothing was actually sent yet (the backend guard also enforces this).
  const canDispatch = podeAgir && sent === 0 && (isDraft || isScheduled || isActive);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground">
                {MESSAGE_TYPE_ICON[campaign.message_type ?? 'text']}
              </span>
              <h3 className="font-semibold text-lg truncate">{campaign.name}</h3>
              <Badge
                variant="outline"
                className={`text-xs ${STATUS_CLASS[campaign.status] ?? ''}`}
              >
                {STATUS_LABEL[campaign.status] ?? campaign.status}
              </Badge>
            </div>
            {campaign.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                {campaign.description}
              </p>
            )}
            {campaign.whatsapp_instance && (
              <p className="text-xs text-muted-foreground mt-1">
                Número: {campaign.whatsapp_instance.name}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
          {canDispatch && (
            <Button
              size="sm"
              onClick={() => onDispatchNow(campaign.id)}
              disabled={isDispatching}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Send className="h-4 w-4 mr-1" />
              {isDispatching ? 'Disparando...' : 'Disparar agora'}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`Mais ações da campanha ${campaign.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeAgir && (isDraft || isScheduled || isPaused || isActive) && (
                <DropdownMenuItem onClick={() => onEdit(campaign)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {/* "Ver Relatório" saiu (decisão D10): abria o relatório de todas as
                  campanhas, não o desta. O desta campanha é "Ver detalhes"; o do
                  conjunto é o botão "Relatórios" no topo da tela. */}
              <DropdownMenuItem onClick={() => onViewDetails(campaign.id)}>
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhes
              </DropdownMenuItem>
              {podeAgir && (
                <DropdownMenuItem onClick={() => onDuplicate(campaign)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicar
                </DropdownMenuItem>
              )}
              {podeAgir && isActive && (
                <DropdownMenuItem onClick={() => onPause(campaign.id)}>
                  <Pause className="mr-2 h-4 w-4" />
                  Pausar
                </DropdownMenuItem>
              )}
              {podeAgir && isPaused && (
                <DropdownMenuItem onClick={() => onResume(campaign.id)}>
                  <Play className="mr-2 h-4 w-4" />
                  Retomar
                </DropdownMenuItem>
              )}
              {podeAgir && (isActive || isPaused || isScheduled) && (
                <DropdownMenuItem
                  onClick={() => onCancel(campaign.id)}
                  className="text-red-600"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancelar
                </DropdownMenuItem>
              )}
              {podeAgir && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(campaign.id, campaign.name)}
                    className="text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Metric value={total} label="Total" icon={<Users className="h-3 w-3" />} />
          <Metric value={sent} label="Enviadas" />
          <Metric value={delivered} label="Entregues" />
          <Metric value={read} label="Lidas" />
        </div>

        {/* Progress bar — only when relevant */}
        {(isActive || isPaused || isCompleted) && total > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progresso</span>
              <span>{progress}%</span>
            </div>
            <Progress
              value={progress}
              className={isActive ? 'animate-pulse' : undefined}
            />
          </div>
        )}

        {/* Footer row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {isDraft ? `Editada ${relativeDate(campaign.updated_at)}` : `Criada ${relativeDate(campaign.created_at)}`}
          </span>
          <div className="flex items-center gap-3">
            {isScheduled && campaign.scheduled_at && (
              <span className="text-blue-600 font-medium">
                Agendada {countdownLabel(campaign.scheduled_at)}
              </span>
            )}
            {isCompleted && campaign.completed_at && (
              <span>Concluída {relativeDate(campaign.completed_at)}</span>
            )}
            {isCancelled && campaign.cancelled_at && (
              <span>Cancelada {relativeDate(campaign.cancelled_at)}</span>
            )}
            {podeAgir && isDraft && (
              <Button size="sm" variant="outline" onClick={() => onEdit(campaign)}>
                <Edit className="h-3 w-3 mr-1" />
                Continuar editando
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface MetricProps {
  value: number;
  label: string;
  icon?: React.ReactNode;
}

function Metric({ value, label, icon }: MetricProps) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold flex items-center justify-center gap-1">
        {icon}
        {value.toLocaleString('pt-BR')}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

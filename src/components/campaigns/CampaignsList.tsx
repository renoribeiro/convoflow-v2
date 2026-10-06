import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { Pagination } from '@/components/shared/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { CampaignReportsModal } from './CampaignReportsModal';
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
  BarChart2,
  XCircle,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Eye,
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
  if (!dateString) return 'N/A';
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days < 7) return `${days} dias atrás`;
  if (days < 30) return `${Math.floor(days / 7)} sem. atrás`;
  return `${Math.floor(days / 30)} meses atrás`;
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
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export const CampaignsList = ({ status, onEdit }: CampaignsListProps) => {
  const { data: campaigns = [], isLoading } = useCampaignsByStatus(
    status as CampaignStatus
  );
  const { setCampaignStatus, duplicateCampaign, deleteCampaign, scheduleCampaign } =
    useCampaignMutations();

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [reportCampaignId, setReportCampaignId] = useState<string | null>(null);
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
    return (
      <EmptyState
        icon={<Send className="w-10 h-10" />}
        title="Nenhuma campanha encontrada"
        description={`Não há campanhas ${emptyLabels[status] ?? status} no momento.`}
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
            onViewReport={(id) => setReportCampaignId(id)}
            onViewDetails={(id) => setDetailsCampaignId(id)}
            onDispatchNow={(id) => scheduleCampaign.mutate(id)}
            isDispatching={scheduleCampaign.isPending}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
            onPause={(id) =>
              setCampaignStatus.mutate({ campaignId: id, action: 'pause' })
            }
            onResume={(id) =>
              setCampaignStatus.mutate({ campaignId: id, action: 'resume' })
            }
            onCancel={(id) =>
              setCampaignStatus.mutate({ campaignId: id, action: 'cancel' })
            }
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
        onConfirm={() => {
          if (deleteTarget) {
            deleteCampaign.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        title="Excluir Campanha"
        description={`Tem certeza que deseja excluir a campanha "${deleteTarget?.name ?? ''}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
        isLoading={deleteCampaign.isPending}
        icon={<Trash2 className="h-5 w-5 text-red-500" />}
      />

      {reportCampaignId && (
        <CampaignReportsModal
          isOpen
          onClose={() => setReportCampaignId(null)}
        />
      )}

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

interface CampaignCardProps {
  campaign: Campaign;
  onEdit: (c: Campaign) => void;
  onViewReport: (id: string) => void;
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
  onViewReport,
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
  // "Disparar agora" only when nothing was actually sent yet (the backend guard also enforces this).
  const canDispatch = sent === 0 && (isDraft || isScheduled || isActive);

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
                Instância: {campaign.whatsapp_instance.name}
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
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(isDraft || isScheduled || isPaused || isActive) && (
                <DropdownMenuItem onClick={() => onEdit(campaign)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onViewDetails(campaign.id)}>
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewReport(campaign.id)}>
                <BarChart2 className="mr-2 h-4 w-4" />
                Ver Relatório
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(campaign)}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicar
              </DropdownMenuItem>
              {isActive && (
                <DropdownMenuItem onClick={() => onPause(campaign.id)}>
                  <Pause className="mr-2 h-4 w-4" />
                  Pausar
                </DropdownMenuItem>
              )}
              {isPaused && (
                <DropdownMenuItem onClick={() => onResume(campaign.id)}>
                  <Play className="mr-2 h-4 w-4" />
                  Retomar
                </DropdownMenuItem>
              )}
              {(isActive || isPaused || isScheduled) && (
                <DropdownMenuItem
                  onClick={() => onCancel(campaign.id)}
                  className="text-red-600"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancelar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(campaign.id, campaign.name)}
                className="text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
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
            {isDraft ? `Editado ${relativeDate(campaign.updated_at)}` : `Criado ${relativeDate(campaign.created_at)}`}
          </span>
          <div className="flex items-center gap-3">
            {isScheduled && campaign.scheduled_at && (
              <span className="text-blue-600 font-medium">
                Agendado {countdownLabel(campaign.scheduled_at)}
              </span>
            )}
            {isCompleted && campaign.completed_at && (
              <span>Concluído {relativeDate(campaign.completed_at)}</span>
            )}
            {isDraft && (
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

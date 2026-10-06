import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Send,
  CheckCircle,
  Users,
  MessageSquare,
  AlertTriangle,
  Clock,
  Eye,
  Reply,
  XCircle,
  Hourglass,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCampaignById, useCampaignExecutions } from '@/hooks/useCampaigns';

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

const EXEC_STATUS_CLASS: Record<string, string> = {
  sent: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  read: 'bg-purple-100 text-purple-800',
  replied: 'bg-teal-100 text-teal-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-sky-100 text-sky-800',
};

const EXEC_STATUS_LABEL: Record<string, string> = {
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  replied: 'Respondida',
  failed: 'Falhou',
  pending: 'Pendente',
  scheduled: 'Agendada',
};

function rate(n: number, d: number) {
  if (d === 0) return '0.0';
  return ((n / d) * 100).toFixed(1);
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  try {
    return format(new Date(s), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return '—';
  }
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface CampaignDetailsModalProps {
  campaignId: string | null;
  onClose: () => void;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export const CampaignDetailsModal = ({ campaignId, onClose }: CampaignDetailsModalProps) => {
  const { data: campaign, isLoading: campaignLoading } = useCampaignById(campaignId);
  const { data: executions = [], isLoading: execLoading } = useCampaignExecutions(campaignId);

  const failedErrors = useMemo(() => {
    if (!executions.length) return null;
    const failed = executions.filter((e) => e.status === 'failed' && e.error_message);
    if (failed.length === 0) return null;
    const freq: Record<string, number> = {};
    failed.forEach((e) => {
      const msg = e.error_message!;
      freq[msg] = (freq[msg] ?? 0) + 1;
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    return { count: failed.length, top: sorted.slice(0, 3) };
  }, [executions]);

  const metrics = useMemo(() => {
    if (!campaign) return null;
    const total = campaign.total_recipients ?? 0;
    const sent = campaign.sent_count ?? 0;
    const delivered = campaign.delivered_count ?? 0;
    const read = campaign.read_count ?? 0;
    const replied = campaign.replied_count ?? 0;
    const failed = campaign.failed_count ?? 0;
    const pending = Math.max(0, total - sent - failed);
    return { total, sent, delivered, read, replied, failed, pending };
  }, [campaign]);

  const audienceSummary = useMemo(() => {
    if (!campaign) return '—';
    const type = campaign.audience_type;
    const cfg = campaign.audience_config as Record<string, unknown> | null;
    if (type === 'csv_import') {
      const n = (cfg?.total_contacts as number | null) ?? campaign.total_recipients ?? '?';
      return `CSV: ${n} contatos`;
    }
    if (type === 'tags') {
      const tags = campaign.target_tags ?? [];
      return `Tags (${tags.length})`;
    }
    if (type === 'contact_list') {
      const ids = (cfg?.contact_ids as string[] | null) ?? [];
      return `Lista: ${ids.length} contatos`;
    }
    return '—';
  }, [campaign]);

  if (!campaignId) return null;

  return (
    <Dialog open={!!campaignId} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalhes da Campanha
            <FeatureHelp helpKey="page:campaigns-details" />
          </DialogTitle>
        </DialogHeader>

        {campaignLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !campaign ? (
          <p className="text-muted-foreground text-sm">Campanha não encontrada.</p>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold truncate">{campaign.name}</h2>
                {campaign.description && (
                  <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge
                    variant="outline"
                    className={`text-xs ${STATUS_CLASS[campaign.status] ?? ''}`}
                  >
                    {STATUS_LABEL[campaign.status] ?? campaign.status}
                  </Badge>
                  {campaign.whatsapp_instance && (
                    <Badge variant="secondary" className="text-xs">
                      {campaign.whatsapp_instance.name}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <InfoCell label="Criada" value={fmtDate(campaign.created_at)} />
              <InfoCell label="Agendada" value={fmtDate(campaign.scheduled_at)} />
              <InfoCell label="Iniciada" value={fmtDate(campaign.started_at)} />
              <InfoCell label="Concluída" value={fmtDate(campaign.completed_at)} />
            </div>

            {/* Config */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Configuração</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <InfoCell label="Tipo de mensagem" value={campaign.message_type} />
                  <InfoCell label="Público" value={audienceSummary} />
                  <InfoCell
                    label="Intervalo"
                    value={
                      campaign.delay_between_messages != null
                        ? `${campaign.delay_between_messages}s`
                        : '—'
                    }
                  />
                  <InfoCell
                    label="Horário comercial"
                    value={
                      campaign.respect_business_hours
                        ? `${campaign.business_hours_start ?? '?'} – ${campaign.business_hours_end ?? '?'}`
                        : 'Não'
                    }
                  />
                  <InfoCell
                    label="Limite diário"
                    value={campaign.daily_send_limit != null ? String(campaign.daily_send_limit) : 'Sem limite'}
                  />
                  <InfoCell label="Fuso horário" value={campaign.timezone ?? '—'} />
                </div>

                {campaign.message_type === 'text' && campaign.message_template && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Prévia da mensagem</p>
                    <div className="flex justify-end">
                      <div className="max-w-xs bg-green-100 dark:bg-green-900 rounded-2xl rounded-tr-sm px-4 py-2 text-sm whitespace-pre-wrap shadow-sm">
                        {campaign.message_template
                          .replace(/{name}/g, 'João')
                          .replace(/{first_name}/g, 'João')
                          .replace(/{phone}/g, '5511999990001')
                          .replace(/{email}/g, 'joao@exemplo.com')}
                        <div className="text-xs text-green-700 dark:text-green-400 text-right mt-1">
                          10:30 ✓✓
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {campaign.media_url && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Mídia anexada</p>
                    {campaign.message_type === 'image' ? (
                      <img
                        src={campaign.media_url}
                        alt="Mídia da campanha"
                        className="max-h-40 rounded-md object-contain"
                      />
                    ) : (
                      <a
                        href={campaign.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        Abrir mídia
                      </a>
                    )}
                    {campaign.media_caption && (
                      <p className="text-xs text-muted-foreground mt-1">{campaign.media_caption}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Metrics */}
            {metrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard
                  label="Total"
                  value={metrics.total}
                  icon={<Users className="h-6 w-6 text-muted-foreground" />}
                />
                <MetricCard
                  label="Enviadas"
                  value={metrics.sent}
                  sub={`${rate(metrics.sent, metrics.total)}% do total`}
                  icon={<Send className="h-6 w-6 text-blue-500" />}
                />
                <MetricCard
                  label="Entregues"
                  value={metrics.delivered}
                  sub={`${rate(metrics.delivered, metrics.sent)}% de enviadas`}
                  icon={<CheckCircle className="h-6 w-6 text-green-500" />}
                />
                <MetricCard
                  label="Lidas"
                  value={metrics.read}
                  sub={`${rate(metrics.read, metrics.delivered)}% de entregues`}
                  icon={<Eye className="h-6 w-6 text-purple-500" />}
                />
                <MetricCard
                  label="Respondidas"
                  value={metrics.replied}
                  sub={`${rate(metrics.replied, metrics.sent)}% de enviadas`}
                  icon={<Reply className="h-6 w-6 text-teal-500" />}
                />
                <MetricCard
                  label="Falhas"
                  value={metrics.failed}
                  sub={`${rate(metrics.failed, metrics.total)}% do total`}
                  icon={<XCircle className="h-6 w-6 text-red-500" />}
                />
                <MetricCard
                  label="Pendentes"
                  value={metrics.pending}
                  icon={<Hourglass className="h-6 w-6 text-orange-400" />}
                />
                <MetricCard
                  label="Taxa de entrega"
                  value={`${rate(metrics.delivered, metrics.sent)}%`}
                  icon={<CheckCircle className="h-6 w-6 text-green-400" />}
                  isText
                />
              </div>
            )}

            {/* Diagnostic alert */}
            {failedErrors && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{failedErrors.count} envios falharam.</strong> Erros mais comuns:
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {failedErrors.top.map(([msg, count]) => (
                      <li key={msg}>
                        <span className="font-medium">{count}x</span>: {msg}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Executions table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Destinatários
                  {executions.length >= 50 && (
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      (mostrando últimos 50)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {execLoading ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : executions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum destinatário encontrado.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-3 px-4">Contato</th>
                          <th className="py-3 px-4">Identificador</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Enviada em</th>
                          <th className="py-3 px-4">Entregue em</th>
                          <th className="py-3 px-4">Lida em</th>
                        </tr>
                      </thead>
                      <tbody>
                        {executions.map((ex) => (
                          <tr key={ex.id} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-4 font-medium max-w-[150px] truncate">
                              {ex.contact_name || '—'}
                            </td>
                            <td className="py-2 px-4 text-muted-foreground text-xs">
                              {ex.contact_identifier || '—'}
                            </td>
                            <td className="py-2 px-4">
                              <div className="space-y-1">
                                <Badge
                                  variant="secondary"
                                  className={`text-xs ${EXEC_STATUS_CLASS[ex.status] ?? ''}`}
                                >
                                  {EXEC_STATUS_LABEL[ex.status] ?? ex.status}
                                </Badge>
                                {ex.status === 'failed' && ex.error_message && (
                                  <p className="text-[10px] text-red-600 max-w-[200px] truncate" title={ex.error_message}>
                                    {ex.error_message}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-4 text-xs text-muted-foreground">
                              {ex.sent_at ? (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {fmtDate(ex.sent_at)}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-2 px-4 text-xs text-muted-foreground">
                              {fmtDate(ex.delivered_at)}
                            </td>
                            <td className="py-2 px-4 text-xs text-muted-foreground">
                              {fmtDate(ex.read_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  isText?: boolean;
}

function MetricCard({ label, value, sub, icon, isText }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">
              {isText ? value : typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
            </p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}


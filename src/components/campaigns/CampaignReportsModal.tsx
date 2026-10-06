import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useCampaignReportMetrics } from '@/hooks/useCampaigns';
import { logger } from '@/lib/logger';
import { Send, CheckCircle, Users, MessageSquare, Download } from 'lucide-react';

// ─────────────────────────────────────────────
// Helpers
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
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  scheduled: 'bg-blue-100 text-blue-800',
  completed: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-700',
};

function rate(numerator: number, denominator: number): string {
  if (denominator === 0) return '0.0';
  return ((numerator / denominator) * 100).toFixed(1);
}

function FunnelBar({ label, value, max, color }: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span>{value.toLocaleString('pt-BR')}</span>
      </div>
      <div className="h-6 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">{pct.toFixed(1)}%</p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface CampaignReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export const CampaignReportsModal = ({ isOpen, onClose }: CampaignReportsModalProps) => {
  const { toast } = useToast();
  const [period, setPeriod] = useState('30days');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'sent' | 'delivered' | 'read' | 'replied'>('sent');

  const { data, isLoading } = useCampaignReportMetrics(period, statusFilter);

  const campaigns = data?.campaigns ?? [];
  const totalSent = data?.totalSent ?? 0;
  const totalDelivered = data?.totalDelivered ?? 0;
  const totalRead = data?.totalRead ?? 0;
  const totalReplied = data?.totalReplied ?? 0;

  const sorted = [...campaigns].sort((a, b) => {
    const col = {
      sent: 'sent_count',
      delivered: 'delivered_count',
      read: 'read_count',
      replied: 'replied_count',
    }[sortBy] as keyof typeof a;
    return ((b[col] as number) ?? 0) - ((a[col] as number) ?? 0);
  });

  const handleExport = () => {
    try {
      const header = ['Campanha', 'Status', 'Enviadas', 'Entregues', '% Entrega', 'Lidas', '% Leitura', 'Respondidas', '% Resposta'];
      const rows = sorted.map((c) => [
        c.name,
        STATUS_LABEL[c.status] ?? c.status,
        String(c.sent_count ?? 0),
        String(c.delivered_count ?? 0),
        rate(c.delivered_count ?? 0, c.sent_count ?? 0),
        String(c.read_count ?? 0),
        rate(c.read_count ?? 0, c.delivered_count ?? 0),
        String(c.replied_count ?? 0),
        rate(c.replied_count ?? 0, c.sent_count ?? 0),
      ]);
      const csv = [header, ...rows]
        .map((row) => row.map((f) => `"${f}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-campanhas-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Relatório exportado', description: 'CSV baixado com sucesso.' });
    } catch (err) {
      logger.error('Erro ao exportar relatório', { error: (err as Error).message });
      toast({
        title: 'Erro ao exportar',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Relatórios de Campanhas</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="30days">Últimos 30 dias</SelectItem>
                <SelectItem value="90days">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Campanhas</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="completed">Concluídas</SelectItem>
                <SelectItem value="paused">Pausadas</SelectItem>
                <SelectItem value="draft">Rascunhos</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isLoading || campaigns.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          </div>

          {/* Global metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total Enviadas" value={totalSent} icon={<Send className="h-8 w-8 text-blue-500" />} loading={isLoading} />
            <MetricCard
              label="Entregues"
              value={totalDelivered}
              sub={`${rate(totalDelivered, totalSent)}% taxa`}
              icon={<CheckCircle className="h-8 w-8 text-green-500" />}
              loading={isLoading}
            />
            <MetricCard
              label="Lidas"
              value={totalRead}
              sub={`${rate(totalRead, totalDelivered)}% taxa`}
              icon={<Users className="h-8 w-8 text-purple-500" />}
              loading={isLoading}
            />
            <MetricCard
              label="Respondidas"
              value={totalReplied}
              sub={`${rate(totalReplied, totalSent)}% taxa`}
              icon={<MessageSquare className="h-8 w-8 text-orange-500" />}
              loading={isLoading}
            />
          </div>

          {/* Conversion funnel */}
          {!isLoading && totalSent > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Funil de Conversão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FunnelBar label="Enviadas" value={totalSent} max={totalSent} color="bg-blue-500" />
                <FunnelBar label="Entregues" value={totalDelivered} max={totalSent} color="bg-green-500" />
                <FunnelBar label="Lidas" value={totalRead} max={totalSent} color="bg-purple-500" />
                <FunnelBar label="Respondidas" value={totalReplied} max={totalSent} color="bg-orange-500" />
              </CardContent>
            </Card>
          )}

          {/* Per-campaign table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Performance por Campanha</CardTitle>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sent">Ordenar: Enviadas</SelectItem>
                    <SelectItem value="delivered">Ordenar: Entregues</SelectItem>
                    <SelectItem value="read">Ordenar: Lidas</SelectItem>
                    <SelectItem value="replied">Ordenar: Respostas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma campanha encontrada para o período selecionado.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-3 px-2">Campanha</th>
                        <th className="py-3 px-2">Status</th>
                        <th className="py-3 px-2 text-right">Enviadas</th>
                        <th className="py-3 px-2 text-right">Entregues</th>
                        <th className="py-3 px-2 text-right">Lidas</th>
                        <th className="py-3 px-2 text-right">Respostas</th>
                        <th className="py-3 px-2 text-right">Conversão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((campaign) => {
                        const sent = campaign.sent_count ?? 0;
                        const delivered = campaign.delivered_count ?? 0;
                        const read = campaign.read_count ?? 0;
                        const replied = campaign.replied_count ?? 0;
                        return (
                          <tr key={campaign.id} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-2 font-medium max-w-[200px] truncate">
                              {campaign.name}
                            </td>
                            <td className="py-3 px-2">
                              <Badge
                                variant="outline"
                                className={`text-xs ${STATUS_CLASS[campaign.status] ?? ''}`}
                              >
                                {STATUS_LABEL[campaign.status] ?? campaign.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 text-right">{sent.toLocaleString('pt-BR')}</td>
                            <td className="py-3 px-2 text-right">
                              {delivered.toLocaleString('pt-BR')}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({rate(delivered, sent)}%)
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right">
                              {read.toLocaleString('pt-BR')}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({rate(read, delivered)}%)
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right">
                              {replied.toLocaleString('pt-BR')}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({rate(replied, read)}%)
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right font-semibold">
                              {rate(replied, sent)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────
// MetricCard
// ─────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number;
  sub?: string;
  icon: React.ReactNode;
  loading?: boolean;
}

function MetricCard({ label, value, sub, icon, loading }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <>
                <p className="text-2xl font-bold">{value.toLocaleString('pt-BR')}</p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
              </>
            )}
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}


import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ComingSoonButton } from '@/components/shared/ComingSoonButton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Clock, Mail, MessageSquare, FileText, Search, Filter, Download, AlertCircle, RefreshCw } from 'lucide-react';
import { useReportExecutions } from '@/hooks/useReports';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const TYPE_LABELS: Record<string, string> = {
  campaigns: 'Campanhas',
  conversations: 'Conversas',
  funnel: 'Funil de Vendas',
  general: 'Geral',
};

const PERIOD_LABELS: Record<string, string> = {
  today: 'Hoje',
  '1day': 'Último dia',
  '7days': 'Últimos 7 dias',
  '14days': 'Últimos 14 dias',
  '30days': 'Últimos 30 dias',
  '90days': 'Últimos 90 dias',
  '6months': 'Últimos 6 meses',
  '1year': 'Último ano',
  year: 'Último ano',
};

// Resumo compacto do que foi gerado, a partir do result salvo em parameters.
function buildResultSummary(result: any): string {
  if (!result || typeof result !== 'object') return '';
  const parts: string[] = [];
  if (result.contactsTotal != null) parts.push(`${result.contactsTotal} contatos`);
  if (result.conversationsTotal != null) parts.push(`${result.conversationsTotal} conversas`);
  if (result.messagesTotal != null) parts.push(`${result.messagesTotal} msgs`);
  return parts.join(' · ');
}

interface ReportExecution {
  id: string;
  template_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'success' | 'timeout';
  executed_at: string;
  completed_at?: string;
  execution_time?: number;
  error_message?: string;
  result?: any;
  config?: any;
  created_at: string;
  updated_at: string;
  report_templates?: {
    name: string;
  };
}

// Função para mapear status do banco para status de entrega
const mapExecutionStatus = (status: string | null | undefined) => {
  switch (status) {
    // Valores reais da tabela report_executions: success | failed | timeout.
    // 'completed'/'running' vêm dos dados mock legados — mantidos por compat.
    case 'success':
    case 'completed': return 'success';
    case 'failed':
    case 'timeout': return 'failed';
    case 'pending':
    case 'running': return 'pending';
    default: return 'pending';
  }
};

const getStatusIcon = (status: string | null | undefined) => {
  const mappedStatus = mapExecutionStatus(status);
  switch (mappedStatus) {
    case 'success': return <CheckCircle className="w-4 h-4 text-green-600" />;
    case 'failed': return <XCircle className="w-4 h-4 text-red-600" />;
    case 'pending': return <Clock className="w-4 h-4 text-yellow-600" />;
    default: return null;
  }
};

const getStatusBadge = (status: string | null | undefined) => {
  const mappedStatus = mapExecutionStatus(status);
  switch (mappedStatus) {
    case 'success': return <Badge className="bg-green-100 text-green-800">Concluído</Badge>;
    case 'failed': return <Badge variant="destructive">Falhou</Badge>;
    case 'pending': return <Badge className="bg-yellow-100 text-yellow-800">Processando</Badge>;
    default: return null;
  }
};

const getMethodIcon = (method: string) => {
  switch (method) {
    case 'email': return <Mail className="w-4 h-4 text-blue-600" />;
    case 'whatsapp': return <MessageSquare className="w-4 h-4 text-green-600" />;
    case 'dashboard': return <FileText className="w-4 h-4 text-purple-600" />;
    default: return null;
  }
};

export const DeliveryLog = () => {
  const { data: executions = [], isLoading, error } = useReportExecutions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Reenvia o relatório usando a config original salva em parameters.
  const handleResend = async (execution: any) => {
    const p = (execution.parameters ?? {}) as any;
    setResendingId(execution.id);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('send-report', {
        body: {
          name: p.name,
          description: p.description,
          type: p.type,
          format: p.format,
          metrics: p.metrics,
          filters: p.filters,
          delivery: { ...(p.delivery ?? {}), recipients: p.recipients ?? p.delivery?.recipients },
        },
      });
      if (invokeError) {
        let message = invokeError.message;
        try {
          const ctx = await (invokeError as any).context?.json?.();
          if (ctx?.error?.message) message = ctx.error.message;
        } catch { /* mantém a mensagem padrão */ }
        throw new Error(message);
      }
      if (data && data.success === false) throw new Error(data?.error?.message || 'Falha ao reenviar');
      const delivered: Array<{ channel: string }> = data?.delivered ?? [];
      const channels = delivered.map((d) => (d.channel === 'email' ? 'e-mail' : 'WhatsApp'));
      toast({
        title: 'Relatório reenviado',
        description: channels.length ? `Enviado por ${channels.join(' e ')}.` : 'Reenviado.',
      });
      queryClient.invalidateQueries({ queryKey: ['report-executions'] });
    } catch (e) {
      toast({
        title: 'Erro ao reenviar',
        description: e instanceof Error ? e.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setResendingId(null);
    }
  };

  const filteredExecutions = executions.filter(execution => {
    const reportName = execution.report_templates?.name || 'Relatório sem nome';
    const matchesSearch = reportName.toLowerCase().includes(searchTerm.toLowerCase());
    const mappedStatus = mapExecutionStatus(execution.status);
    const matchesStatus = statusFilter === 'all' || mappedStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: executions.length,
    success: executions.filter(e => mapExecutionStatus(e.status) === 'success').length,
    failed: executions.filter(e => mapExecutionStatus(e.status) === 'failed').length,
    pending: executions.filter(e => mapExecutionStatus(e.status) === 'pending').length
  };

  // Mostrar erro se houver
  if (error) {
    toast({
      title: 'Erro ao carregar execuções',
      description: 'Não foi possível carregar o histórico de execuções de relatórios.',
      variant: 'destructive',
    });
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar execuções de relatórios. Tente novamente mais tarde.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Execuções</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold">{stats.total}</p>
                )}
              </div>
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Concluídas</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold text-green-600">{stats.success}</p>
                )}
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Falhas</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                )}
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Processando</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
                )}
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por relatório ou destinatário..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="success">Concluído</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="pending">Processando</SelectItem>
              </SelectContent>
            </Select>

            <ComingSoonButton variant="outline" size="sm" motivo="Exportação em breve">
              <Download className="w-4 h-4 mr-2" />
              Exportar Histórico
            </ComingSoonButton>
          </div>
        </CardContent>
      </Card>

      {/* Execution Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Execuções</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-4" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Executions List */}
          {!isLoading && (
            <div className="space-y-4">
              {filteredExecutions.map((execution) => {
                const p = ((execution as any).parameters ?? {}) as any;
                const reportName = p.name || execution.report_templates?.name || 'Relatório sem nome';
                const recipients: string[] = Array.isArray(p.recipients) ? p.recipients : [];
                const typeLabel = TYPE_LABELS[p.type] ?? (p.type || '');
                const periodLabel = PERIOD_LABELS[p.filters?.dateRange] ?? '';
                const resultSummary = buildResultSummary(p.result);
                const generatedLine = [typeLabel, periodLabel, resultSummary].filter(Boolean).join(' · ');
                const isResending = resendingId === execution.id;

                return (
                  <div key={execution.id} className="flex items-start justify-between gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="flex items-start space-x-3 min-w-0">
                      <div className="flex items-center space-x-2 pt-0.5">
                        {getStatusIcon(execution.status)}
                        <FileText className="w-4 h-4 text-blue-600" />
                      </div>

                      <div className="min-w-0 space-y-1">
                        <h4 className="font-medium truncate">{reportName}</h4>
                        <p className="text-xs text-muted-foreground">ID: {execution.id.slice(0, 8)}…</p>

                        {/* Canais de entrega */}
                        {(p.delivery?.email || p.delivery?.whatsapp) && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {p.delivery?.email && (
                              <Badge variant="outline" className="gap-1 font-normal">
                                <Mail className="w-3 h-3 text-blue-600" /> E-mail
                              </Badge>
                            )}
                            {p.delivery?.whatsapp && (
                              <Badge variant="outline" className="gap-1 font-normal">
                                <MessageSquare className="w-3 h-3 text-green-600" /> WhatsApp
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Destinatários */}
                        {recipients.length > 0 && (
                          <p className="text-xs text-muted-foreground break-all">
                            Para: {recipients.join(', ')}
                          </p>
                        )}

                        {/* O que foi gerado */}
                        {generatedLine && (
                          <p className="text-xs text-muted-foreground">
                            Gerado: {generatedLine}
                          </p>
                        )}

                        {execution.error_message && (
                          <p className="text-sm text-red-600 mt-1">Erro: {execution.error_message}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-right">
                        {execution.executed_at && (
                          <p className="text-sm font-medium">
                            {new Date(execution.executed_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        )}
                        {execution.execution_time != null && (
                          <p className="text-xs text-muted-foreground">{execution.execution_time}ms</p>
                        )}
                      </div>

                      {getStatusBadge(execution.status)}

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={isResending}
                        onClick={() => handleResend(execution)}
                      >
                        <RefreshCw className={`w-3 h-3 ${isResending ? 'animate-spin' : ''}`} />
                        {isResending ? 'Reenviando…' : 'Reenviar'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredExecutions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma execução encontrada</h3>
              <p>
                {executions.length === 0 
                  ? 'Ainda não há execuções de relatórios registradas.' 
                  : 'Nenhuma execução encontrada com os filtros aplicados.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

import { useState } from 'react';
import { CHART_STATUS } from '@/lib/chartColors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ComingSoonButton } from '@/components/shared/ComingSoonButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  MessageSquare,
  Target,
  Calendar,
  Download,
  Filter
} from 'lucide-react';

interface AutomationAnalyticsProps {
  flowId?: string;
}

export const AutomationAnalytics = ({ flowId }: AutomationAnalyticsProps) => {
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedMetric, setSelectedMetric] = useState('executions');
  
  // Query para buscar execuções de automação
  const { data: executions = [] } = useSupabaseQuery({
    table: 'automation_executions',
    queryKey: ['automation-executions', flowId, timeRange],
    select: `
      id,
      flow_id,
      status,
      started_at,
      completed_at,
      current_step,
      automation_flows!inner(
        name,
        trigger_type
      )
    `,
    filter: flowId ? { column: 'flow_id', operator: 'eq', value: flowId } : undefined
  });
  
  // Query para buscar logs de steps
  const { data: stepLogs = [] } = useSupabaseQuery({
    table: 'automation_step_logs',
    queryKey: ['automation-step-logs', flowId, timeRange],
    select: `
      id,
      execution_id,
      step_type,
      status,
      started_at,
      completed_at,
      automation_executions!inner(
        flow_id,
        automation_flows!inner(
          name
        )
      )
    `,
    filter: flowId ? {
      column: 'automation_executions.flow_id',
      operator: 'eq',
      value: flowId
    } : undefined
  });
  
  // Query para buscar fluxos para seleção
  const { data: flows = [] } = useSupabaseQuery({
    table: 'automation_flows',
    queryKey: ['automation-flows-list'],
    select: 'id, name, active'
  });
  
  // Calcular métricas
  const totalExecutions = executions.length;
  const completedExecutions = executions.filter(e => e.status === 'completed').length;
  const failedExecutions = executions.filter(e => e.status === 'failed').length;
  const runningExecutions = executions.filter(e => e.status === 'running').length;
  const pendingExecutions = executions.filter(e => e.status === 'pending').length;
  
  const successRate = totalExecutions > 0 ? (completedExecutions / totalExecutions) * 100 : 0;
  const failureRate = totalExecutions > 0 ? (failedExecutions / totalExecutions) * 100 : 0;
  
  // Dados para gráficos
  const executionsByDay = executions.reduce((acc, execution) => {
    const date = new Date(execution.started_at).toLocaleDateString('pt-BR');
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const chartData = Object.entries(executionsByDay).map(([date, count]) => ({
    date,
    executions: count,
    completed: executions.filter(e => 
      new Date(e.started_at).toLocaleDateString('pt-BR') === date && 
      e.status === 'completed'
    ).length,
    failed: executions.filter(e => 
      new Date(e.started_at).toLocaleDateString('pt-BR') === date && 
      e.status === 'failed'
    ).length
  }));
  
  const statusData = [
    { name: 'Concluídas', value: completedExecutions, color: CHART_STATUS.success },
    { name: 'Falharam', value: failedExecutions, color: CHART_STATUS.error },
    { name: 'Executando', value: runningExecutions, color: CHART_STATUS.info },
    { name: 'Pendentes', value: pendingExecutions, color: CHART_STATUS.warning }
  ].filter(item => item.value > 0);
  
  const stepTypeData = stepLogs.reduce((acc, log) => {
    const type = log.step_type;
    if (!acc[type]) {
      acc[type] = { total: 0, completed: 0, failed: 0 };
    }
    acc[type].total++;
    if (log.status === 'completed') acc[type].completed++;
    if (log.status === 'failed') acc[type].failed++;
    return acc;
  }, {} as Record<string, { total: number; completed: number; failed: number }>);
  
  const stepChartData = Object.entries(stepTypeData).map(([type, data]) => ({
    type: type.replace('_', ' ').toUpperCase(),
    total: data.total,
    completed: data.completed,
    failed: data.failed,
    successRate: data.total > 0 ? (data.completed / data.total) * 100 : 0
  }));
  
  const averageExecutionTime = executions
    .filter(e => e.completed_at)
    .reduce((acc, e) => {
      const duration = new Date(e.completed_at!).getTime() - new Date(e.started_at).getTime();
      return acc + duration;
    }, 0) / Math.max(completedExecutions, 1);
  
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };
  
  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtros:</span>
            </div>
            
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">Último dia</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            
            {!flowId && (
              <Select value={flowId || 'all'} onValueChange={(value) => {
                // Implementar filtro por fluxo específico
              }}>
                <SelectTrigger className="w-60">
                  <SelectValue placeholder="Todos os fluxos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os fluxos</SelectItem>
                  {flows.map(flow => (
                    <SelectItem key={flow.id} value={flow.id}>
                      {flow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <ComingSoonButton variant="outline" size="sm" motivo="Exportação em breve">
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </ComingSoonButton>
          </div>
        </CardContent>
      </Card>
      
      {/* Métricas Principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Execuções</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalExecutions}</div>
            <p className="text-xs text-muted-foreground">
              {timeRange === '7d' ? 'Últimos 7 dias' : 'Período selecionado'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <TrendingUp className="h-4 w-4 text-status-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-success">
              {successRate.toFixed(1)}%
            </div>
            <Progress value={successRate} className="mt-2" />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
            <Clock className="h-4 w-4 text-status-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-info">
              {formatDuration(averageExecutionTime)}
            </div>
            <p className="text-xs text-muted-foreground">
              Por execução completa
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Falha</CardTitle>
            <TrendingDown className="h-4 w-4 text-status-error" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-error">
              {failureRate.toFixed(1)}%
            </div>
            <Progress value={failureRate} className="mt-2" />
          </CardContent>
        </Card>
      </div>
      
      {/* Gráficos */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Execuções por Dia */}
        <Card>
          <CardHeader>
            <CardTitle>Execuções por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="completed" fill={CHART_STATUS.success} name="Concluídas" />
                <Bar dataKey="failed" fill={CHART_STATUS.error} name="Falharam" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Status das Execuções */}
        <Card>
          <CardHeader>
            <CardTitle>Status das Execuções</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-4">
              {statusData.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Performance por Tipo de Step */}
      <Card>
        <CardHeader>
          <CardTitle>Performance por Tipo de Ação</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stepChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="type" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="completed" fill={CHART_STATUS.success} name="Concluídas" />
              <Bar dataKey="failed" fill={CHART_STATUS.error} name="Falharam" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      {/* Execuções Recentes */}
      <Card>
        <CardHeader>
          <CardTitle>Execuções Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {executions.slice(0, 10).map((execution) => {
              const getStatusIcon = (status: string) => {
                switch (status) {
                  case 'completed':
                    return <CheckCircle className="h-4 w-4 text-status-success" />;
                  case 'failed':
                    return <XCircle className="h-4 w-4 text-status-error" />;
                  case 'running':
                    return <Activity className="h-4 w-4 text-status-info" />;
                  default:
                    return <AlertCircle className="h-4 w-4 text-status-warning" />;
                }
              };

              const getStatusColor = (status: string) => {
                switch (status) {
                  case 'completed':
                    return 'bg-status-success/15 text-status-success';
                  case 'failed':
                    return 'bg-status-error/15 text-status-error';
                  case 'running':
                    return 'bg-status-info/15 text-status-info';
                  default:
                    return 'bg-status-warning/15 text-status-warning';
                }
              };
              
              return (
                <div key={execution.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(execution.status)}
                    <div>
                      <p className="font-medium">{execution.automation_flows.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Iniciado em {new Date(execution.started_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(execution.status)}>
                      {execution.status === 'completed' && 'Concluída'}
                      {execution.status === 'failed' && 'Falhou'}
                      {execution.status === 'running' && 'Executando'}
                      {execution.status === 'pending' && 'Pendente'}
                    </Badge>
                    
                    {execution.completed_at && (
                      <span className="text-sm text-muted-foreground">
                        {formatDuration(
                          new Date(execution.completed_at).getTime() - 
                          new Date(execution.started_at).getTime()
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            
            {executions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma execução encontrada no período selecionado</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  Clock,
  Database,
  MessageSquare,
  Users,
  Zap,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SystemMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  threshold: number;
  description: string;
}

interface PerformanceData {
  responseTime: number;
  throughput: number;
  errorRate: number;
  uptime: number;
  activeConnections: number;
  memoryUsage: number;
  cpuUsage: number;
}

const mockPerformanceData: PerformanceData = {
  responseTime: 245,
  throughput: 1250,
  errorRate: 0.8,
  uptime: 99.9,
  activeConnections: 156,
  memoryUsage: 68,
  cpuUsage: 42
};

const systemMetrics: SystemMetric[] = [
  {
    id: '1',
    name: 'Tempo de Resposta da API',
    value: 245,
    unit: 'ms',
    status: 'good',
    threshold: 500,
    description: 'Tempo médio de resposta das requisições'
  },
  {
    id: '2',
    name: 'Taxa de Entrega de Mensagens',
    value: 98.5,
    unit: '%',
    status: 'good',
    threshold: 95,
    description: 'Percentual de mensagens entregues com sucesso'
  },
  {
    id: '3',
    name: 'Conexões WebSocket Ativas',
    value: 156,
    unit: 'conexões',
    status: 'good',
    threshold: 1000,
    description: 'Número de conexões em tempo real ativas'
  },
  {
    id: '4',
    name: 'Uso de Memória',
    value: 68,
    unit: '%',
    status: 'warning',
    threshold: 80,
    description: 'Percentual de memória utilizada'
  },
  {
    id: '5',
    name: 'Taxa de Erro',
    value: 0.8,
    unit: '%',
    status: 'good',
    threshold: 5,
    description: 'Percentual de requisições com erro'
  },
  {
    id: '6',
    name: 'Uptime do Sistema',
    value: 99.9,
    unit: '%',
    status: 'good',
    threshold: 99,
    description: 'Tempo de disponibilidade do sistema'
  }
];

const MetricCard = ({ metric }: { metric: SystemMetric }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good':
        return 'text-status-success bg-status-success/10 border-status-success/30';
      case 'warning':
        return 'text-status-warning bg-status-warning/10 border-status-warning/30';
      case 'critical':
        return 'text-status-error bg-status-error/10 border-status-error/30';
      default:
        return 'text-muted-foreground bg-muted border-border';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'good':
        return <CheckCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'critical':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{metric.name}</CardTitle>
          <Badge className={getStatusColor(metric.status)}>
            {getStatusIcon(metric.status)}
            <span className="ml-1 capitalize">{metric.status}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {metric.value}
          <span className="text-sm font-normal text-muted-foreground ml-1">
            {metric.unit}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {metric.description}
        </p>
        <div className="mt-2">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Limite: {metric.threshold}{metric.unit}</span>
            <span>{((metric.value / metric.threshold) * 100).toFixed(1)}%</span>
          </div>
          <Progress 
            value={(metric.value / metric.threshold) * 100} 
            className="h-1"
          />
        </div>
      </CardContent>
    </Card>
  );
};

const PerformanceChart = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance em Tempo Real</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">CPU</span>
                <span className="text-sm text-muted-foreground">{mockPerformanceData.cpuUsage}%</span>
              </div>
              <Progress value={mockPerformanceData.cpuUsage} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Memória</span>
                <span className="text-sm text-muted-foreground">{mockPerformanceData.memoryUsage}%</span>
              </div>
              <Progress value={mockPerformanceData.memoryUsage} className="h-2" />
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-2xl font-bold text-status-info">{mockPerformanceData.throughput}</div>
              <div className="text-xs text-muted-foreground">Req/min</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-status-success">{mockPerformanceData.responseTime}ms</div>
              <div className="text-xs text-muted-foreground">Resp. Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">{mockPerformanceData.activeConnections}</div>
              <div className="text-xs text-muted-foreground">Conexões</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const SystemHealth = () => {
  const healthChecks = [
    { name: 'Banco de Dados', status: 'online', latency: '12ms' },
    { name: 'WhatsApp API', status: 'online', latency: '45ms' },
    { name: 'Serviço de Email', status: 'online', latency: '23ms' },
    { name: 'Storage', status: 'online', latency: '8ms' },
    { name: 'Cache Redis', status: 'online', latency: '3ms' }
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Status dos Serviços</CardTitle>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {healthChecks.map((check, index) => (
            <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-status-success rounded-full"></div>
                <span className="font-medium">{check.name}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="text-status-success border-status-success/30">
                  {check.status}
                </Badge>
                <span className="text-sm text-muted-foreground">{check.latency}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const AlertsPanel = () => {
  const alerts = [
    {
      id: '1',
      type: 'warning',
      title: 'Uso de Memória Elevado',
      description: 'O uso de memória está acima de 65%',
      timestamp: new Date(Date.now() - 1000 * 60 * 15)
    },
    {
      id: '2',
      type: 'info',
      title: 'Backup Concluído',
      description: 'Backup automático realizado com sucesso',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2)
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas Recentes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Alert key={alert.id} className={alert.type === 'warning' ? 'border-status-warning/30 bg-status-warning/10' : 'border-status-info/30 bg-status-info/10'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{alert.title}</div>
                    <div className="text-sm text-muted-foreground">{alert.description}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(alert.timestamp, { locale: ptBR, addSuffix: true })}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export const PerformanceAnalytics = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Análise de Performance</h2>
          <p className="text-muted-foreground">
            Monitore a performance e saúde do sistema em tempo real
          </p>
        </div>
        <Button>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar Dados
        </Button>
      </div>

      <Tabs defaultValue="metrics" className="space-y-6">
        <TabsList>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="health">Saúde do Sistema</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {systemMetrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PerformanceChart />
            <Card>
              <CardHeader>
                <CardTitle>Estatísticas de Uso</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <MessageSquare className="h-4 w-4 text-status-info" />
                      <span className="text-sm">Mensagens Enviadas (24h)</span>
                    </div>
                    <span className="font-bold">2,847</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-status-success" />
                      <span className="text-sm">Usuários Ativos</span>
                    </div>
                    <span className="font-bold">156</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Database className="h-4 w-4 text-accent" />
                      <span className="text-sm">Consultas ao BD (min)</span>
                    </div>
                    <span className="font-bold">1,250</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Zap className="h-4 w-4 text-status-warning" />
                      <span className="text-sm">Automações Executadas</span>
                    </div>
                    <span className="font-bold">89</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="health" className="space-y-6">
          <SystemHealth />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
          <AlertsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Monitor,
  Cpu,
  HardDrive,
  Wifi,
  Database,
  Activity,
  Users,
  MessageSquare,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Server,
  Globe,
  Shield,
  Eye,
  BarChart3,
  PieChart,
  LineChart,
  Calendar,
  Timer,
  Thermometer,
  Battery,
  Signal,
  Download,
  Upload
} from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart as RechartsPieChart, Cell } from 'recharts';

interface SystemMetrics {
  timestamp: string;
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_in: number;
  network_out: number;
  active_connections: number;
  response_time: number;
  error_rate: number;
  throughput: number;
}

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  uptime: number;
  last_check: string;
  response_time: number;
  error_count: number;
  description: string;
}

interface AlertItem {
  id: string;
  type: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  resolved: boolean;
  service: string;
}

// Dados mockados para demonstração
const generateMockMetrics = (): SystemMetrics[] => {
  const now = new Date();
  const metrics: SystemMetrics[] = [];
  
  for (let i = 23; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
    metrics.push({
      timestamp: timestamp.toISOString(),
      cpu_usage: Math.random() * 80 + 10,
      memory_usage: Math.random() * 70 + 20,
      disk_usage: Math.random() * 60 + 30,
      network_in: Math.random() * 100,
      network_out: Math.random() * 80,
      active_connections: Math.floor(Math.random() * 200 + 50),
      response_time: Math.random() * 500 + 100,
      error_rate: Math.random() * 5,
      throughput: Math.random() * 1000 + 500
    });
  }
  
  return metrics;
};

const mockServices: ServiceStatus[] = [
  {
    name: 'API Gateway',
    status: 'healthy',
    uptime: 99.9,
    last_check: '2024-01-03T10:30:00Z',
    response_time: 120,
    error_count: 2,
    description: 'Gateway principal da API'
  },
  {
    name: 'Database',
    status: 'healthy',
    uptime: 99.8,
    last_check: '2024-01-03T10:30:00Z',
    response_time: 45,
    error_count: 0,
    description: 'Banco de dados PostgreSQL'
  },
  {
    name: 'WhatsApp Service',
    status: 'warning',
    uptime: 98.5,
    last_check: '2024-01-03T10:29:00Z',
    response_time: 850,
    error_count: 15,
    description: 'Serviço de integração WhatsApp'
  },
  {
    name: 'Email Service',
    status: 'healthy',
    uptime: 99.7,
    last_check: '2024-01-03T10:30:00Z',
    response_time: 200,
    error_count: 3,
    description: 'Serviço de envio de emails'
  },
  {
    name: 'File Storage',
    status: 'critical',
    uptime: 95.2,
    last_check: '2024-01-03T10:25:00Z',
    response_time: 2000,
    error_count: 45,
    description: 'Armazenamento de arquivos'
  },
  {
    name: 'Cache Redis',
    status: 'healthy',
    uptime: 99.9,
    last_check: '2024-01-03T10:30:00Z',
    response_time: 15,
    error_count: 0,
    description: 'Cache em memória Redis'
  }
];

const mockAlerts: AlertItem[] = [
  {
    id: '1',
    type: 'critical',
    title: 'Alto uso de CPU',
    message: 'CPU atingiu 95% de uso por mais de 5 minutos',
    timestamp: '2024-01-03T10:25:00Z',
    resolved: false,
    service: 'Sistema'
  },
  {
    id: '2',
    type: 'warning',
    title: 'Latência elevada',
    message: 'Tempo de resposta do WhatsApp Service acima de 800ms',
    timestamp: '2024-01-03T10:20:00Z',
    resolved: false,
    service: 'WhatsApp Service'
  },
  {
    id: '3',
    type: 'error',
    title: 'Falha no armazenamento',
    message: 'File Storage apresentando múltiplas falhas',
    timestamp: '2024-01-03T10:15:00Z',
    resolved: false,
    service: 'File Storage'
  },
  {
    id: '4',
    type: 'info',
    title: 'Backup concluído',
    message: 'Backup automático executado com sucesso',
    timestamp: '2024-01-03T09:00:00Z',
    resolved: true,
    service: 'Sistema'
  }
];

const MetricCard = ({ title, value, unit, icon: Icon, trend, status }: {
  title: string;
  value: number;
  unit: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'stable';
  status?: 'good' | 'warning' | 'critical';
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'good': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-green-500" />;
      default: return null;
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-center space-x-2">
              <p className={`text-2xl font-bold ${getStatusColor()}`}>
                {value.toFixed(1)}{unit}
              </p>
              {getTrendIcon()}
            </div>
          </div>
          <Icon className={`h-8 w-8 ${getStatusColor()}`} />
        </div>
        {status && (
          <div className="mt-4">
            <Progress 
              value={value} 
              className={`h-2 ${
                status === 'critical' ? 'bg-red-100' :
                status === 'warning' ? 'bg-yellow-100' : 'bg-green-100'
              }`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ServiceStatusCard = ({ service }: { service: ServiceStatus }) => {
  const getStatusIcon = () => {
    switch (service.status) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'offline': return <XCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = () => {
    const variants = {
      healthy: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      critical: 'bg-red-100 text-red-800',
      offline: 'bg-gray-100 text-gray-800'
    };

    return (
      <Badge className={variants[service.status]}>
        {service.status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <h3 className="font-semibold">{service.name}</h3>
          </div>
          {getStatusBadge()}
        </div>
        
        <p className="text-sm text-muted-foreground mb-3">{service.description}</p>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Uptime:</span>
            <span className="ml-2 font-medium">{service.uptime}%</span>
          </div>
          <div>
            <span className="text-muted-foreground">Resposta:</span>
            <span className="ml-2 font-medium">{service.response_time}ms</span>
          </div>
          <div>
            <span className="text-muted-foreground">Erros:</span>
            <span className="ml-2 font-medium">{service.error_count}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Última verificação:</span>
            <span className="ml-2 font-medium">
              {new Date(service.last_check).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const AlertCard = ({ alert }: { alert: AlertItem }) => {
  const getAlertIcon = () => {
    switch (alert.type) {
      case 'info': return <Eye className="h-4 w-4 text-blue-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-600" />;
    }
  };

  const getAlertBadge = () => {
    const variants = {
      info: 'bg-blue-100 text-blue-800',
      warning: 'bg-yellow-100 text-yellow-800',
      error: 'bg-red-100 text-red-800',
      critical: 'bg-red-200 text-red-900'
    };

    return (
      <Badge className={variants[alert.type]}>
        {alert.type.toUpperCase()}
      </Badge>
    );
  };

  return (
    <Card className={alert.resolved ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-2">
            {getAlertIcon()}
            <h4 className="font-semibold">{alert.title}</h4>
          </div>
          <div className="flex items-center space-x-2">
            {getAlertBadge()}
            {alert.resolved && (
              <Badge className="bg-green-100 text-green-800">RESOLVIDO</Badge>
            )}
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground mb-3">{alert.message}</p>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Serviço: {alert.service}</span>
          <span>{new Date(alert.timestamp).toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  );
};

const SystemOverview = () => {
  const [metrics] = useState<SystemMetrics[]>(generateMockMetrics());
  const currentMetrics = metrics[metrics.length - 1];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="CPU"
          value={currentMetrics.cpu_usage}
          unit="%"
          icon={Cpu}
          trend="up"
          status={currentMetrics.cpu_usage > 80 ? 'critical' : currentMetrics.cpu_usage > 60 ? 'warning' : 'good'}
        />
        <MetricCard
          title="Memória"
          value={currentMetrics.memory_usage}
          unit="%"
          icon={HardDrive}
          trend="stable"
          status={currentMetrics.memory_usage > 80 ? 'critical' : currentMetrics.memory_usage > 60 ? 'warning' : 'good'}
        />
        <MetricCard
          title="Disco"
          value={currentMetrics.disk_usage}
          unit="%"
          icon={Database}
          trend="down"
          status={currentMetrics.disk_usage > 80 ? 'critical' : currentMetrics.disk_usage > 60 ? 'warning' : 'good'}
        />
        <MetricCard
          title="Conexões"
          value={currentMetrics.active_connections}
          unit=""
          icon={Users}
          trend="up"
          status="good"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>CPU e Memória (24h)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleString()}
                  formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'cpu_usage' ? 'CPU' : 'Memória']}
                />
                <Area type="monotone" dataKey="cpu_usage" stackId="1" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                <Area type="monotone" dataKey="memory_usage" stackId="2" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Wifi className="h-5 w-5" />
              <span>Tráfego de Rede (24h)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleString()}
                  formatter={(value: number, name: string) => [`${value.toFixed(1)} MB/s`, name === 'network_in' ? 'Entrada' : 'Saída']}
                />
                <Line type="monotone" dataKey="network_in" stroke="#8884d8" strokeWidth={2} />
                <Line type="monotone" dataKey="network_out" stroke="#82ca9d" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const ServicesStatus = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockServices.map((service, index) => (
          <ServiceStatusCard key={index} service={service} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Performance dos Serviços</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mockServices}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip formatter={(value: number) => [`${value}ms`, 'Tempo de Resposta']} />
              <Bar dataKey="response_time" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

const AlertsPanel = () => {
  const [alerts] = useState<AlertItem[]>(mockAlerts);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'active') return !alert.resolved;
    if (filter === 'resolved') return alert.resolved;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
          >
            Todos ({alerts.length})
          </Button>
          <Button 
            variant={filter === 'active' ? 'default' : 'outline'}
            onClick={() => setFilter('active')}
          >
            Ativos ({alerts.filter(a => !a.resolved).length})
          </Button>
          <Button 
            variant={filter === 'resolved' ? 'default' : 'outline'}
            onClick={() => setFilter('resolved')}
          >
            Resolvidos ({alerts.filter(a => a.resolved).length})
          </Button>
        </div>
        <Button variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <div className="space-y-4">
        {filteredAlerts.map((alert) => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
      </div>

      {filteredAlerts.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum alerta encontrado</h3>
            <p className="text-muted-foreground">
              {filter === 'active' ? 'Não há alertas ativos no momento.' : 
               filter === 'resolved' ? 'Não há alertas resolvidos.' : 
               'Não há alertas no sistema.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export const SystemMonitor = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simular atualização
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Monitor do Sistema</h2>
          <p className="text-muted-foreground">
            Monitoramento em tempo real dos recursos e serviços
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="services">Serviços</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <SystemOverview />
        </TabsContent>

        <TabsContent value="services">
          <ServicesStatus />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};
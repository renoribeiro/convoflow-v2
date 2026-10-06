import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/shared/ResponsiveTable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, Activity, AlertTriangle, CheckCircle, Clock, Zap } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { toast } from 'sonner';

interface WebhookLog {
  id: string;
  instance_name: string;
  event_type: string;
  http_status: number;
  processing_time_ms: number;
  error_message?: string;
  created_at: string;
  destination?: string;
  sender?: string;
}

interface WebhookStats {
  total_events: number;
  success_rate: number;
  avg_processing_time: number;
  error_count: number;
  events_last_hour: number;
}

interface InstanceStatus {
  instance_name: string;
  last_event: string;
  status: 'active' | 'inactive' | 'error';
  event_count: number;
  error_count: number;
}

export function WebhookDashboard() {
  const { supabase } = useSupabase();
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [instanceStatuses, setInstanceStatuses] = useState<InstanceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWebhookStats = async () => {
    try {
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      const totalEvents = data.length;
      const successEvents = data.filter(log => log.http_status >= 200 && log.http_status < 300).length;
      const errorEvents = data.filter(log => log.http_status >= 400).length;
      const eventsLastHour = data.filter(log => 
        new Date(log.created_at) > new Date(Date.now() - 60 * 60 * 1000)
      ).length;
      
      const avgProcessingTime = data.length > 0 
        ? data.reduce((sum, log) => sum + (log.processing_time_ms || 0), 0) / data.length
        : 0;

      setStats({
        total_events: totalEvents,
        success_rate: totalEvents > 0 ? (successEvents / totalEvents) * 100 : 0,
        avg_processing_time: avgProcessingTime,
        error_count: errorEvents,
        events_last_hour: eventsLastHour
      });
    } catch (error) {
      console.error('Error fetching webhook stats:', error);
      toast.error('Erro ao carregar estatísticas de webhook');
    }
  };

  const fetchRecentLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching webhook logs:', error);
      toast.error('Erro ao carregar logs de webhook');
    }
  };

  const fetchInstanceStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('instance_name, created_at, http_status')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const instanceMap = new Map<string, InstanceStatus>();
      
      data?.forEach(log => {
        const instanceName = log.instance_name;
        if (!instanceMap.has(instanceName)) {
          instanceMap.set(instanceName, {
            instance_name: instanceName,
            last_event: log.created_at,
            status: 'inactive',
            event_count: 0,
            error_count: 0
          });
        }
        
        const instance = instanceMap.get(instanceName)!;
        instance.event_count++;
        
        if (log.http_status >= 400) {
          instance.error_count++;
        }
        
        // Determine status based on recent activity and errors
        const lastEventTime = new Date(instance.last_event);
        const isRecent = Date.now() - lastEventTime.getTime() < 30 * 60 * 1000; // 30 minutes
        
        if (instance.error_count > instance.event_count * 0.5) {
          instance.status = 'error';
        } else if (isRecent) {
          instance.status = 'active';
        } else {
          instance.status = 'inactive';
        }
      });

      setInstanceStatuses(Array.from(instanceMap.values()));
    } catch (error) {
      console.error('Error fetching instance statuses:', error);
      toast.error('Erro ao carregar status das instâncias');
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchWebhookStats(),
      fetchRecentLogs(),
      fetchInstanceStatuses()
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await refreshData();
      setLoading(false);
    };

    loadData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (httpStatus: number) => {
    if (httpStatus >= 200 && httpStatus < 300) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Sucesso</Badge>;
    } else if (httpStatus >= 400) {
      return <Badge variant="destructive">Erro</Badge>;
    }
    return <Badge variant="secondary">Processando</Badge>;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    return date.toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard de Webhooks</h2>
          <p className="text-muted-foreground">
            Monitore o desempenho e status dos webhooks em tempo real
          </p>
        </div>
        <Button onClick={refreshData} disabled={refreshing} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Eventos</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_events || 0}</div>
            <p className="text-xs text-muted-foreground">Últimas 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.success_rate.toFixed(1) || 0}%</div>
            <p className="text-xs text-muted-foreground">Eventos processados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(stats?.avg_processing_time || 0)}</div>
            <p className="text-xs text-muted-foreground">Processamento</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Erros</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.error_count || 0}</div>
            <p className="text-xs text-muted-foreground">Últimas 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Última Hora</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.events_last_hour || 0}</div>
            <p className="text-xs text-muted-foreground">Eventos recentes</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs">Logs Recentes</TabsTrigger>
          <TabsTrigger value="instances">Status das Instâncias</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logs de Webhook</CardTitle>
              <CardDescription>
                Últimos 50 eventos de webhook processados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <ResponsiveTable
                  ariaLabel="Logs de webhook"
                  rows={logs}
                  rowKey={(log) => log.id}
                  empty="Nenhum evento ainda."
                  columns={[
                    { key: 'instancia', header: 'Instância', card: 'title', cellClassName: 'font-medium', cell: (log) => log.instance_name },
                    { key: 'evento', header: 'Evento', card: 'badge', cell: (log) => <Badge variant="outline">{log.event_type}</Badge> },
                    { key: 'status', header: 'Status', card: 'badge', cell: (log) => getStatusBadge(log.http_status) },
                    { key: 'tempo', header: 'Tempo', cell: (log) => formatDuration(log.processing_time_ms) },
                    { key: 'quando', header: 'Quando', cell: (log) => formatRelativeTime(log.created_at) },
                  ]}
                />
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="instances" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Status das Instâncias</CardTitle>
              <CardDescription>
                Status atual de cada instância WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {instanceStatuses.map((instance) => (
                  <Card key={instance.instance_name}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        {instance.instance_name}
                      </CardTitle>
                      {getStatusIcon(instance.status)}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Eventos:</span>
                          <span className="font-medium">{instance.event_count}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Erros:</span>
                          <span className="font-medium text-red-600">{instance.error_count}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Último evento:</span>
                          <span className="text-muted-foreground">
                            {formatRelativeTime(instance.last_event)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
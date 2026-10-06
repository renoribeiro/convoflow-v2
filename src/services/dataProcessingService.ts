import { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { env } from '../lib/env';

// Interface para configuração de processamento
interface ProcessingConfig {
  refreshInterval: number; // em milissegundos
  batchSize: number;
  enableRealTime: boolean;
  enableHistorical: boolean;
}

// Interface para métricas de processamento
interface ProcessingMetrics {
  lastUpdate: Date;
  recordsProcessed: number;
  processingTime: number;
  errors: number;
  status: 'idle' | 'processing' | 'error';
}

// Interface para eventos de processamento
interface ProcessingEvent {
  type: 'metrics_updated' | 'error' | 'status_change';
  data: any;
  timestamp: Date;
}

class DataProcessingService {
  private config: ProcessingConfig;
  private metrics: ProcessingMetrics;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private listeners: Map<string, ((event: ProcessingEvent) => void)[]> = new Map();
  private isRunning = false;

  constructor(config: Partial<ProcessingConfig> = {}) {
    this.config = {
      refreshInterval: 30000, // 30 segundos
      batchSize: 1000,
      enableRealTime: true,
      enableHistorical: true,
      ...config
    };

    this.metrics = {
      lastUpdate: new Date(),
      recordsProcessed: 0,
      processingTime: 0,
      errors: 0,
      status: 'idle'
    };
  }

  // Iniciar o serviço de processamento
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[DataProcessingService] Service is already running');
      return;
    }

    this.isRunning = true;
    this.updateStatus('processing');
    
    console.log('[DataProcessingService] Starting data processing service...');

    // Iniciar processamento de métricas em tempo real
    if (this.config.enableRealTime) {
      this.startRealTimeProcessing();
    }

    // Iniciar processamento histórico
    if (this.config.enableHistorical) {
      this.startHistoricalProcessing();
    }

    // Iniciar atualização de materialized views
    this.startMaterializedViewRefresh();

    // Iniciar limpeza de dados antigos
    this.startDataCleanup();

    console.log('[DataProcessingService] Service started successfully');
  }

  // Parar o serviço
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[DataProcessingService] Stopping data processing service...');
    
    this.isRunning = false;
    
    // Limpar todos os intervalos
    this.intervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.intervals.clear();

    this.updateStatus('idle');
    console.log('[DataProcessingService] Service stopped');
  }

  // Processar métricas em tempo real
  private startRealTimeProcessing(): void {
    const interval = setInterval(async () => {
      try {
        await this.processRealTimeMetrics();
      } catch (error) {
        console.error('[DataProcessingService] Error in real-time processing:', error);
        this.metrics.errors++;
        this.emit('error', { error: (error as Error).message });
      }
    }, this.config.refreshInterval);

    this.intervals.set('realtime', interval);
  }

  // Processar dados históricos
  private startHistoricalProcessing(): void {
    const interval = setInterval(async () => {
      try {
        await this.processHistoricalData();
      } catch (error) {
        console.error('[DataProcessingService] Error in historical processing:', error);
        this.metrics.errors++;
        this.emit('error', { error: (error as Error).message });
      }
    }, this.config.refreshInterval * 2); // Menos frequente

    this.intervals.set('historical', interval);
  }

  // Atualizar materialized views
  private startMaterializedViewRefresh(): void {
    const interval = setInterval(async () => {
      try {
        await this.refreshMaterializedViews();
      } catch (error) {
        console.error('[DataProcessingService] Error refreshing materialized views:', error);
        this.metrics.errors++;
        this.emit('error', { error: (error as Error).message });
      }
    }, this.config.refreshInterval * 4); // Menos frequente

    this.intervals.set('materialized_views', interval);
  }

  // Limpeza de dados antigos
  private startDataCleanup(): void {
    const interval = setInterval(async () => {
      try {
        await this.cleanupOldData();
      } catch (error) {
        console.error('[DataProcessingService] Error in data cleanup:', error);
        this.metrics.errors++;
        this.emit('error', { error: (error as Error).message });
      }
    }, 60 * 60 * 1000); // A cada hora

    this.intervals.set('cleanup', interval);
  }

  // Processar métricas em tempo real
  private async processRealTimeMetrics(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Processar novos leads
      await this.processNewLeads();
      
      // Processar conversões
      await this.processNewConversions();
      
      // Processar eventos de tracking
      await this.processTrackingEvents();
      
      // Atualizar métricas de sistema
      await this.updateSystemMetrics();
      
      const processingTime = Date.now() - startTime;
      this.metrics.processingTime = processingTime;
      this.metrics.lastUpdate = new Date();
      
      this.emit('metrics_updated', {
        type: 'realtime',
        processingTime,
        timestamp: new Date()
      });
      
    } catch (error) {
      throw error;
    }
  }

  // Processar dados históricos
  private async processHistoricalData(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Agregar dados por período
      await this.aggregateDataByPeriod();
      
      // Calcular tendências
      await this.calculateTrends();
      
      // Gerar relatórios automáticos
      await this.generateAutomaticReports();
      
      const processingTime = Date.now() - startTime;
      
      this.emit('metrics_updated', {
        type: 'historical',
        processingTime,
        timestamp: new Date()
      });
      
    } catch (error) {
      throw error;
    }
  }

  // Processar novos leads
  private async processNewLeads(): Promise<void> {
    const { data: newLeads, error } = await supabase
      .from('lead_tracking')
      .select('*')
      .gte('created_at', new Date(Date.now() - this.config.refreshInterval).toISOString())
      .order('created_at', { ascending: false })
      .limit(this.config.batchSize);

    if (error) {
      throw new Error(`Error fetching new leads: ${error.message}`);
    }

    if (newLeads && newLeads.length > 0) {
      // Processar cada lead
      for (const lead of newLeads) {
        await this.processLeadMetrics(lead);
      }
      
      this.metrics.recordsProcessed += newLeads.length;
    }
  }

  // Processar conversões
  private async processNewConversions(): Promise<void> {
    const { data: conversions, error } = await supabase
      .from('lead_tracking')
      .select('*')
      // lead_tracking não tem 'status' nem 'updated_at': a conversão é o booleano
      // 'converted', e a data correspondente é 'conversion_date'.
      .eq('converted', true)
      .gte('conversion_date', new Date(Date.now() - this.config.refreshInterval).toISOString())
      .order('conversion_date', { ascending: false })
      .limit(this.config.batchSize);

    if (error) {
      throw new Error(`Error fetching conversions: ${error.message}`);
    }

    if (conversions && conversions.length > 0) {
      for (const conversion of conversions) {
        await this.processConversionMetrics(conversion);
      }
    }
  }

  // Processar eventos de tracking
  private async processTrackingEvents(): Promise<void> {
    const { data: events, error } = await supabase
      .from('tracking_events')
      .select('*')
      // tracking_events usa 'timestamp' como coluna de tempo, não 'created_at'.
      .gte('timestamp', new Date(Date.now() - this.config.refreshInterval).toISOString())
      .order('timestamp', { ascending: false })
      .limit(this.config.batchSize);

    if (error) {
      throw new Error(`Error fetching tracking events: ${error.message}`);
    }

    if (events && events.length > 0) {
      for (const event of events) {
        await this.processTrackingEvent(event);
      }
    }
  }

  // Processar métricas de um lead
  private async processLeadMetrics(lead: any): Promise<void> {
    // Atualizar contadores por fonte
    await this.updateSourceMetrics(lead.source, 'lead');
    
    // Atualizar métricas por campanha
    if (lead.campaign_id) {
      await this.updateCampaignMetrics(lead.campaign_id, 'lead');
    }
    
    // Atualizar métricas diárias
    await this.updateDailyMetrics(lead.created_at, 'lead');
  }

  // Processar métricas de conversão
  private async processConversionMetrics(conversion: any): Promise<void> {
    // Atualizar contadores por fonte
    await this.updateSourceMetrics(conversion.source, 'conversion', conversion.value);
    
    // Atualizar métricas por campanha
    if (conversion.campaign_id) {
      await this.updateCampaignMetrics(conversion.campaign_id, 'conversion', conversion.value);
    }
    
    // Atualizar métricas diárias
    await this.updateDailyMetrics(conversion.updated_at, 'conversion', conversion.value);
  }

  // Processar evento de tracking
  private async processTrackingEvent(event: any): Promise<void> {
    // Registrar evento no sistema de métricas
    await supabase
      .from('system_metrics')
      .insert({
        metric_name: `tracking_event_${event.event_type}`,
        metric_value: 1,
        service_name: 'tracking',
        recorded_at: new Date(),
        metadata: {
          event_type: event.event_type,
          source: event.source,
          tenant_id: event.tenant_id
        }
      });
  }

  // Atualizar métricas por fonte
  private async updateSourceMetrics(source: string, type: 'lead' | 'conversion', value?: number): Promise<void> {
    const metricName = `source_${source}_${type}s`;
    const metricValue = type === 'conversion' && value ? value : 1;
    
    await supabase
      .from('system_metrics')
      .insert({
        metric_name: metricName,
        metric_value: metricValue,
        service_name: 'tracking',
        recorded_at: new Date(),
        metadata: {
          source,
          type,
          value: value || null
        }
      });
  }

  // Atualizar métricas por campanha
  private async updateCampaignMetrics(campaignId: string, type: 'lead' | 'conversion', value?: number): Promise<void> {
    const metricName = `campaign_${campaignId}_${type}s`;
    const metricValue = type === 'conversion' && value ? value : 1;
    
    await supabase
      .from('system_metrics')
      .insert({
        metric_name: metricName,
        metric_value: metricValue,
        service_name: 'campaigns',
        recorded_at: new Date(),
        metadata: {
          campaign_id: campaignId,
          type,
          value: value || null
        }
      });
  }

  // Atualizar métricas diárias
  private async updateDailyMetrics(date: string, type: 'lead' | 'conversion', value?: number): Promise<void> {
    const day = new Date(date).toISOString().split('T')[0];
    const metricName = `daily_${type}s`;
    const metricValue = type === 'conversion' && value ? value : 1;
    
    await supabase
      .from('system_metrics')
      .insert({
        metric_name: metricName,
        metric_value: metricValue,
        service_name: 'tracking',
        recorded_at: new Date(),
        metadata: {
          date: day,
          type,
          value: value || null
        }
      });
  }

  // Atualizar métricas do sistema
  private async updateSystemMetrics(): Promise<void> {
    // No browser, usar performance.memory se disponível, senão mock zero
    const memoryUsage = (performance as any).memory || { usedJSHeapSize: 0, totalJSHeapSize: 0 };
    
    // Métricas de memória
    await supabase
      .from('system_metrics')
      .insert([
        {
          metric_name: 'memory_used',
          metric_value: memoryUsage.usedJSHeapSize,
          service_name: 'system',
          recorded_at: new Date().toISOString()
        } as any,
        {
          metric_name: 'memory_total',
          metric_value: memoryUsage.totalJSHeapSize,
          service_name: 'system',
          recorded_at: new Date().toISOString()
        } as any
      ]);
  }

  // Atualizar materialized views
  private async refreshMaterializedViews(): Promise<void> {
    const views = [
      'tracking_metrics_daily',
      'campaign_performance_daily',
      'system_metrics_hourly',
      'report_performance_daily'
    ];

    for (const view of views) {
      try {
        await supabase.rpc('refresh_materialized_view', { view_name: view });
      } catch (error) {
        console.error(`[DataProcessingService] Error refreshing view ${view}:`, error);
      }
    }
  }

  // Agregar dados por período
  private async aggregateDataByPeriod(): Promise<void> {
    // Implementar agregação de dados históricos
    // Por exemplo, agregar dados por hora, dia, semana, mês
  }

  // Calcular tendências
  private async calculateTrends(): Promise<void> {
    // Implementar cálculo de tendências
    // Por exemplo, crescimento de leads, conversões, receita
  }

  // Gerar relatórios automáticos
  private async generateAutomaticReports(): Promise<void> {
    // Implementar geração automática de relatórios
    // Por exemplo, relatórios diários, semanais, mensais
  }

  // Limpeza de dados antigos
  private async cleanupOldData(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 dias atrás

    try {
      // Limpar logs antigos
      await supabase
        .from('webhook_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      // Limpar métricas antigas do sistema
      await supabase
        .from('system_metrics')
        .delete()
        .lt('recorded_at', cutoffDate.toISOString());

      console.log('[DataProcessingService] Old data cleanup completed');
    } catch (error) {
      console.error('[DataProcessingService] Error in data cleanup:', error);
    }
  }

  // Atualizar status
  private updateStatus(status: ProcessingMetrics['status']): void {
    this.metrics.status = status;
    this.emit('status_change', { status });
  }

  // Sistema de eventos
  private emit(type: ProcessingEvent['type'], data: any): void {
    const event: ProcessingEvent = {
      type,
      data,
      timestamp: new Date()
    };

    const listeners = this.listeners.get(type) || [];
    listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[DataProcessingService] Error in event listener:', error);
      }
    });
  }

  // Adicionar listener de eventos
  on(type: ProcessingEvent['type'], listener: (event: ProcessingEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  // Remover listener de eventos
  off(type: ProcessingEvent['type'], listener: (event: ProcessingEvent) => void): void {
    const listeners = this.listeners.get(type) || [];
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  // Obter métricas atuais
  getMetrics(): ProcessingMetrics {
    return { ...this.metrics };
  }

  // Verificar se está rodando
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  // Forçar processamento manual
  async forceProcess(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Service is not running');
    }

    await this.processRealTimeMetrics();
    await this.processHistoricalData();
    await this.refreshMaterializedViews();
  }
}

// Instância singleton do serviço
export const dataProcessingService = new DataProcessingService();

// Hook para usar o serviço no React
export function useDataProcessingService() {
  const [metrics, setMetrics] = useState<ProcessingMetrics>(dataProcessingService.getMetrics());
  const [isRunning, setIsRunning] = useState(dataProcessingService.isServiceRunning());

  useEffect(() => {
    const handleMetricsUpdate = (event: ProcessingEvent) => {
      setMetrics(dataProcessingService.getMetrics());
    };

    const handleStatusChange = (event: ProcessingEvent) => {
      setIsRunning(dataProcessingService.isServiceRunning());
      setMetrics(dataProcessingService.getMetrics());
    };

    dataProcessingService.on('metrics_updated', handleMetricsUpdate);
    dataProcessingService.on('status_change', handleStatusChange);

    return () => {
      dataProcessingService.off('metrics_updated', handleMetricsUpdate);
      dataProcessingService.off('status_change', handleStatusChange);
    };
  }, []);

  return {
    metrics,
    isRunning,
    start: () => dataProcessingService.start(),
    stop: () => dataProcessingService.stop(),
    forceProcess: () => dataProcessingService.forceProcess()
  };
}

export default DataProcessingService;
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRealTimeMetrics } from '@/hooks/useRealTimeAnalytics';
import { AnalyticsFilters } from './AdvancedFilters';
import {
  Activity,
  TrendingUp,
  Target,
  DollarSign,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RealTimeMetricsProps {
  className?: string;
  filters: AnalyticsFilters;
}

export function RealTimeMetrics({ className, filters }: RealTimeMetricsProps) {
  const { metrics, isLoading, error, refresh, lastUpdated } = useRealTimeMetrics(filters);

  // Até 2026-10-25 esta área mostrava ao lojista dados internos do servidor
  // ("Métricas do Sistema" com CPU, memória, Cache Hit Rate e TPS;
  // "Processamento de Dados" com botões Parar, Iniciar e Forçar; e a lista de
  // Materialized Views) e um botão "Auto Refresh" que não mudava nada. Saíram
  // (achado 65 do checkup, ops-privado/checkup-ux/RELATORIO_CHECKUP_UX.md).

  // Função para formatar tempo
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  // Função para formatar valores
  const formatValue = (value: number, type: 'currency' | 'percentage' | 'number') => {
    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(value);
      case 'percentage':
        return `${value.toFixed(1)}%`;
      case 'number':
        return new Intl.NumberFormat('pt-BR').format(value);
      default:
        return value.toString();
    }
  };

  // Preparar dados das métricas.
  //
  // Não há `change` aqui. Até 2026-08-31 estes cartões mostravam variações
  // fixas no código (+8%, +25%, -5%...) que nunca foram calculadas de nada:
  // apareciam iguais todo dia, para qualquer Conta, com qualquer filtro. Foram
  // removidas. Comparação com período anterior existe de verdade na aba
  // Dashboard, via `useTrackingMetrics`, que calcula em cima dos dados reais.
  //
  // "Visitantes Online" também saiu: o produto não tem analytics de site, o
  // lead nasce quando a mensagem chega. O cartão mostrava sempre zero com uma
  // seta de +12% ao lado.
  const metricsData = metrics ? [
    {
      title: 'Total de contatos',
      value: formatValue(metrics.totalLeads, 'number'),
      icon: Target,
      color: 'text-status-success'
    },
    {
      title: 'Conversões',
      value: formatValue(metrics.totalConversions, 'number'),
      icon: TrendingUp,
      color: 'text-accent'
    },
    {
      title: 'Receita Total',
      value: formatValue(metrics.totalRevenue, 'currency'),
      icon: DollarSign,
      color: 'text-primary'
    },
    {
      title: 'Taxa de Conversão',
      value: formatValue(metrics.avgConversionRate, 'percentage'),
      icon: Activity,
      color: 'text-status-info'
    }
  ] : [];

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-status-error">
            <AlertTriangle className="h-5 w-5" />
            <span>Erro ao carregar métricas: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header com controles */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Métricas em Tempo Real</h2>
          <p className="text-muted-foreground">
            Última atualização: {lastUpdated ? formatTime(lastUpdated) : 'Nunca'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricsData.map((metric, index) => {
          const Icon = metric.icon;

          return (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{metric.title}</p>
                    <p className="text-2xl font-bold">{metric.value}</p>
                  </div>
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center",
                    metric.color === 'text-status-info' && "bg-status-info/15",
                    metric.color === 'text-status-success' && "bg-status-success/15",
                    metric.color === 'text-accent' && "bg-accent/15",
                    metric.color === 'text-primary' && "bg-primary/15"
                  )}>
                    <Icon className={cn("h-4 w-4", metric.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

    </div>
  );
}

export default RealTimeMetrics;

import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrafficSourceConfig } from '@/components/tracking/TrafficSourceConfig';
import { TrackingDashboard } from '@/components/tracking/TrackingDashboard';
import { TrackingFilters } from '@/components/tracking/TrackingFilters';
import { AdvancedFilters, AnalyticsFilters } from '@/components/analytics/AdvancedFilters';
import { RealTimeMetrics } from '@/components/analytics/RealTimeMetrics';
import { AdvancedCharts } from '@/components/analytics/AdvancedCharts';
import RealTimeStatus from '@/components/analytics/RealTimeStatus';
import ExportReports from '@/components/analytics/ExportReports';
import { useRealTimeAnalytics } from '@/hooks/useRealTimeAnalytics';
import { Settings, Plus, TrendingUp, BarChart3, Target } from 'lucide-react';
import { toast } from 'sonner';
import { DateRange } from 'react-day-picker';

export default function Tracking() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState('Todos');
  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFilters>({
    quickDate: '30d',
    sources: [],
    status: [],
    conversionStatus: 'all',
    revenueRange: {},
    leadScore: {},
    campaigns: [],
    utmSources: [],
    utmMediums: [],
    devices: [],
    locations: [],
    assignedTo: [],
    tags: [],
    customFields: {},
    segmentation: { type: 'none' }
  });

  // Hook para atualizações em tempo real
  const {
    isConnected,
    isLoading: realTimeLoading,
    error: realTimeError,
    lastUpdate,
    forceRefresh,
    pauseUpdates,
    resumeUpdates,
    isPaused
  } = useRealTimeAnalytics({
    filters: analyticsFilters,
    updateInterval: 30000,
    enableWebSocket: true,
    enablePolling: true
  });

  const handleOpenSettings = () => {
    toast.info('Configurações de rastreamento em desenvolvimento');
  };

  const handleCreateNewSource = () => {
    setActiveTab('sources');
    toast.success('Redirecionado para configuração de fontes');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rastreamento de Leads"
        helpKey="page:tracking"
        description="Configure e monitore suas fontes de tráfego para otimizar a geração de leads"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Rastreamento' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleOpenSettings}>
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </Button>
            <Button size="sm" onClick={handleCreateNewSource}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Fonte
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start md:grid md:grid-cols-3">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="sources" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Fontes
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Análises
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <TrackingFilters 
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            selectedSources={selectedSources}
            onSourcesChange={setSelectedSources}
            selectedStatus={selectedStatus}
            onStatusChange={setSelectedStatus}
          />
          <TrackingDashboard 
            dateRange={dateRange}
            selectedSources={selectedSources}
            selectedStatus={selectedStatus}
          />
        </TabsContent>

        <TabsContent value="sources" className="space-y-6">
          <TrafficSourceConfig />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
           <div className="flex items-center justify-between">
             <AdvancedFilters 
               onFiltersChange={(filters) => {
                 setAnalyticsFilters(filters);
               }}
             />
             <div className="flex items-center gap-4">
               <ExportReports 
                 filters={analyticsFilters}
               />
               <RealTimeStatus 
                 isConnected={isConnected}
                 isLoading={realTimeLoading}
                 error={realTimeError}
                 lastUpdate={lastUpdate}
                 onRefresh={forceRefresh}
                 onPause={pauseUpdates}
                 onResume={resumeUpdates}
                 isPaused={isPaused}
               />
             </div>
           </div>
          <RealTimeMetrics filters={analyticsFilters} />
          <AdvancedCharts filters={analyticsFilters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

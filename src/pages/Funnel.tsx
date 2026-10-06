
import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FunnelBoard } from '@/components/funnel/FunnelBoard';
import { FunnelMetrics } from '@/components/funnel/FunnelMetrics';
import { StageConfigModal } from '@/components/funnel/StageConfigModal';
import { NewLeadModal } from '@/components/funnel/NewLeadModal';
import { Plus, Settings, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Funnel() {
  const [showMetrics, setShowMetrics] = useState(false);
  const [showStageConfig, setShowStageConfig] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funil de Vendas"
        helpKey="page:funnel"
        description="Visualize e gerencie o progresso dos seus leads através do funil"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Funil de Vendas' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowMetrics(!showMetrics)}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              {showMetrics ? 'Ocultar' : 'Mostrar'} Métricas
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowStageConfig(true)}
            >
              <Settings className="w-4 h-4 mr-2" />
              Configurar Estágios
            </Button>
            <Button size="sm" onClick={() => setShowNewLead(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Lead
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="board" className="space-y-6">
        <TabsList className="h-auto max-w-full flex-wrap">
          <TabsTrigger value="board">Kanban Board</TabsTrigger>
          <TabsTrigger value="metrics">Métricas & Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="space-y-6">
          {showMetrics && <FunnelMetrics />}
          <FunnelBoard />
        </TabsContent>

        <TabsContent value="metrics">
          <FunnelMetrics detailed />
        </TabsContent>
      </Tabs>

      <StageConfigModal 
        isOpen={showStageConfig} 
        onClose={() => setShowStageConfig(false)} 
      />
      
      <NewLeadModal 
        isOpen={showNewLead} 
        onClose={() => setShowNewLead(false)} 
      />
    </div>
  );
}

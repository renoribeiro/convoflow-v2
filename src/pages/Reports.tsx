
import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReportTemplates } from '@/components/reports/ReportTemplates';
import { ScheduleList } from '@/components/reports/ScheduleList';
import { DeliveryLog } from '@/components/reports/DeliveryLog';
import { ReportBuilder } from '@/components/reports/ReportBuilder';
import { NewReportModal } from '@/components/reports/NewReportModal';
import { FileText, Calendar, Send, Plus, Settings } from 'lucide-react';

export default function Reports() {
  const [activeTab, setActiveTab] = useState('templates');
  const [showNewReport, setShowNewReport] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        helpKey="page:reports"
        description="Envie os números da Loja por email ou WhatsApp agora, ou programe o envio por email"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Relatórios' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* O botão "Configurações" saiu em 2026-10-25 (achado 69 do checkup,
                ops-privado/checkup-ux/RELATORIO_CHECKUP_UX.md): abria uma janela
                que não gravava nada e pedia servidor e SENHA de email. O envio
                usa o remetente do sistema; não há o que configurar aqui.
                Conferido no banco (somente leitura): nenhuma senha foi gravada. */}
            <Button size="sm" onClick={() => setShowNewReport(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Relatório
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start md:grid md:grid-cols-4">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="builder" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Criar
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Agendamentos
          </TabsTrigger>
          <TabsTrigger value="delivery" className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            Entregas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-6">
          <ReportTemplates />
        </TabsContent>

        <TabsContent value="builder" className="space-y-6">
          <ReportBuilder />
        </TabsContent>

        <TabsContent value="schedule" className="space-y-6">
          <ScheduleList />
        </TabsContent>

        <TabsContent value="delivery" className="space-y-6">
          <DeliveryLog />
        </TabsContent>
      </Tabs>
      
      <NewReportModal 
        isOpen={showNewReport} 
        onClose={() => setShowNewReport(false)} 
      />
    </div>
  );
}

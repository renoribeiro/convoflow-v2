import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { CampaignsList } from '@/components/campaigns/CampaignsList';
import { CampaignWizard } from '@/components/campaigns/CampaignWizardNew';
import { CampaignReportsModal } from '@/components/campaigns/CampaignReportsModal';
import { Plus, Send, Clock, BarChart3, TrendingUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaignGlobalStats, useCampaignById } from '@/hooks/useCampaigns';
import type { Campaign } from '@/hooks/useCampaigns';

export default function Campaigns() {
  const [showWizard, setShowWizard] = useState(false);
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const [showReports, setShowReports] = useState(false);

  const { data: stats, isLoading: statsLoading } = useCampaignGlobalStats();

  // Fetch the full row when editing — the list query only fetches a subset of columns.
  const { data: editCampaign, isLoading: editLoading } = useCampaignById(editCampaignId);

  const handleEdit = (campaign: Campaign) => {
    setEditCampaignId(campaign.id);
    setShowWizard(true);
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
    setEditCampaignId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas de Disparo"
        helpKey="page:campaigns"
        description="Crie e gerencie campanhas de mensagens em massa para seus contatos"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Campanhas' },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReports(true)}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Relatórios
            </Button>
            <Button size="sm" onClick={() => setShowWizard(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Campanha
            </Button>
          </div>
        }
      />

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total de Campanhas"
          value={stats?.totalCampaigns}
          icon={<Send className="h-8 w-8 text-muted-foreground" />}
          loading={statsLoading}
        />
        <StatCard
          label="Campanhas Ativas"
          value={stats?.activeCampaigns}
          icon={<Clock className="h-8 w-8 text-muted-foreground" />}
          loading={statsLoading}
          highlight
        />
        <StatCard
          label="Mensagens Enviadas"
          value={stats?.messagesSent?.toLocaleString('pt-BR')}
          icon={<Send className="h-8 w-8 text-muted-foreground" />}
          loading={statsLoading}
        />
        <StatCard
          label="Taxa de Sucesso"
          value={stats ? `${stats.successRate.toFixed(1)}%` : undefined}
          icon={<TrendingUp className="h-8 w-8 text-muted-foreground" />}
          loading={statsLoading}
        />
      </div>

      {showWizard ? (
        editLoading && editCampaignId ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <CampaignWizard
            onClose={handleCloseWizard}
            campaign={editCampaign ?? undefined}
          />
        )
      ) : (
        <Tabs defaultValue="active" className="space-y-6">
          <TabsList className="h-auto max-w-full flex-wrap">
            <TabsTrigger value="active">Ativas</TabsTrigger>
            <TabsTrigger value="scheduled">Agendadas</TabsTrigger>
            <TabsTrigger value="completed">Concluídas</TabsTrigger>
            <TabsTrigger value="draft">Rascunhos</TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <CampaignsList status="active" onEdit={handleEdit} />
          </TabsContent>
          <TabsContent value="scheduled">
            <CampaignsList status="scheduled" onEdit={handleEdit} />
          </TabsContent>
          <TabsContent value="completed">
            <CampaignsList status="completed" onEdit={handleEdit} />
          </TabsContent>
          <TabsContent value="draft">
            <CampaignsList status="draft" onEdit={handleEdit} />
          </TabsContent>
        </Tabs>
      )}

      <CampaignReportsModal isOpen={showReports} onClose={() => setShowReports(false)} />
    </div>
  );
}

// ─────────────────────────────────────────────
// Internal component
// ─────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number | undefined;
  icon: React.ReactNode;
  loading?: boolean;
  highlight?: boolean;
}

function StatCard({ label, value, icon, loading, highlight }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className={`text-2xl font-bold${highlight ? ' text-primary' : ''}`}>
                {value ?? '—'}
              </p>
            )}
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

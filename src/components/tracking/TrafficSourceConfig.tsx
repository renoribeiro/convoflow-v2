import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ComingSoonButton } from '@/components/shared/ComingSoonButton';
import { Badge } from '@/components/ui/badge';
import { DashboardCardSkeleton } from '@/components/shared/Skeleton';
import {
  Globe,
  Facebook,
  Instagram,
  Search,
  Users,
  Link,
  MoreHorizontal,
  Plus,
  Settings,
  Copy,
  Eye,
  EyeOff,
  Target
} from 'lucide-react';
import { SourceConfigModal } from './SourceConfigModal';
import {
  useTrafficSources,
  useCreateTrafficSource,
  useUpdateTrafficSource,
} from '@/hooks/useTracking';

/**
 * Aba "Fontes" do Rastreamento.
 *
 * Até 2026-08-31 esta tela era uma lista fixa no código — "Site Institucional",
 * "Facebook Ads", "Linktree" — com números inventados. O botão "Adicionar Fonte"
 * gravava em `useState`: a fonte sumia no F5 e nunca chegava ao banco. Os
 * cartões de cima diziam "Melhor Fonte: Linktree" e "Conversão Média: 4.0%",
 * ambos escritos à mão.
 *
 * Agora tudo vem de `traffic_sources`, com contagem real de leads vinda de
 * `lead_tracking`. As fontes de anúncio da Meta aparecem sozinhas aqui: a ponte
 * CTWA (migração 20260831000001) cria uma linha por criativo quando o primeiro
 * lead daquele anúncio chega.
 */

type SourceType = 'organic' | 'paid' | 'social' | 'direct' | 'referral';

interface ModalSource {
  id?: string;
  name: string;
  type: SourceType;
  isActive: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

interface TrafficSourceRow {
  id: string;
  name: string;
  type: SourceType;
  is_active: boolean;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  created_at: string;
  lead_tracking?: Array<{ count: number }>;
}

const getSourceIcon = (type: string) => {
  switch (type) {
    case 'social': return <Instagram className="w-5 h-5" />;
    case 'paid': return <Facebook className="w-5 h-5" />;
    case 'organic': return <Search className="w-5 h-5" />;
    case 'referral': return <Link className="w-5 h-5" />;
    case 'direct': return <Users className="w-5 h-5" />;
    default: return <Globe className="w-5 h-5" />;
  }
};

const TYPE_LABEL: Record<string, string> = {
  organic: 'Orgânica',
  paid: 'Paga',
  social: 'Social',
  direct: 'Direta',
  referral: 'Indicação',
  email: 'E-mail',
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'paid': return 'bg-status-info/15 text-status-info';
    case 'organic': return 'bg-status-success/15 text-status-success';
    case 'social': return 'bg-accent/15 text-accent';
    case 'referral': return 'bg-primary/15 text-primary';
    default: return 'bg-muted text-muted-foreground';
  }
};

export const TrafficSourceConfig = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<TrafficSourceRow | null>(null);

  const { data, isLoading } = useTrafficSources();
  const createSource = useCreateTrafficSource();
  const updateSource = useUpdateTrafficSource();

  const sources = (data ?? []) as unknown as TrafficSourceRow[];

  const leadsOf = (s: TrafficSourceRow) => s.lead_tracking?.[0]?.count ?? 0;

  const totalLeads = sources.reduce((acc, s) => acc + leadsOf(s), 0);
  const activeCount = sources.filter((s) => s.is_active).length;
  const bestSource = sources.reduce<TrafficSourceRow | null>(
    (best, s) => (best === null || leadsOf(s) > leadsOf(best) ? s : best),
    null
  );

  const toggleSourceStatus = (s: TrafficSourceRow) => {
    updateSource.mutate({ id: s.id, is_active: !s.is_active });
  };

  const handleSave = (form: ModalSource) => {
    const payload = {
      name: form.name,
      type: form.type,
      utm_source: form.utmSource || undefined,
      utm_medium: form.utmMedium || undefined,
      utm_campaign: form.utmCampaign || undefined,
      is_active: form.isActive,
    };

    if (selectedSource) {
      updateSource.mutate({ id: selectedSource.id, ...payload });
    } else {
      createSource.mutate(payload as never);
    }

    setShowModal(false);
    setSelectedSource(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <DashboardCardSkeleton key={i} />)}
        </div>
        <DashboardCardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo — todos os números vêm das fontes reais da Conta */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Fontes Ativas</p>
                <p className="text-2xl font-bold">{activeCount}</p>
              </div>
              <div className="w-8 h-8 bg-status-success/15 rounded-lg flex items-center justify-center">
                <Eye className="w-4 h-4 text-status-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Leads</p>
                <p className="text-2xl font-bold">{totalLeads.toLocaleString('pt-BR')}</p>
              </div>
              <div className="w-8 h-8 bg-status-info/15 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-status-info" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Melhor Fonte</p>
                <p className="text-lg font-bold truncate" title={bestSource?.name ?? undefined}>
                  {bestSource && leadsOf(bestSource) > 0 ? bestSource.name : '—'}
                </p>
              </div>
              <div className="w-8 h-8 bg-primary/15 rounded-lg flex items-center justify-center shrink-0">
                <Target className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de fontes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Fontes de Tráfego</CardTitle>
            <Button onClick={() => { setSelectedSource(null); setShowModal(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Fonte
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <div className="text-center py-10">
              <Globe className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="font-medium">Nenhuma fonte de tráfego ainda</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Anúncios do Facebook e Instagram entram aqui sozinhos, assim que o
                primeiro lead chegar por eles. Use “Adicionar Fonte” para cadastrar
                uma origem que você controla por fora, como um link de bio.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sources.map((source) => (
                <div key={source.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors gap-4">
                  <div className="flex items-center space-x-4 min-w-0">
                    <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center shrink-0">
                      {getSourceIcon(source.type)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium truncate">{source.name}</h3>
                        <Badge className={getTypeColor(source.type)}>
                          {TYPE_LABEL[source.type] ?? source.type}
                        </Badge>
                        {source.is_active ? (
                          <Badge variant="outline" className="text-status-success border-status-success">
                            Ativa
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inativa
                          </Badge>
                        )}
                      </div>
                      {source.utm_campaign && (
                        <p className="text-sm text-muted-foreground truncate">
                          Campanha: {source.utm_campaign}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-6 shrink-0">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{leadsOf(source)}</p>
                      <p className="text-xs text-muted-foreground">Leads</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleSourceStatus(source)}
                        disabled={updateSource.isPending}
                        title={source.is_active ? 'Desativar fonte' : 'Ativar fonte'}
                      >
                        {source.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setSelectedSource(source); setShowModal(true); }}
                        title="Configurar fonte"
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <ComingSoonButton variant="ghost" size="icon" motivo="Duplicar fonte em breve">
                        <Copy className="w-4 h-4" />
                      </ComingSoonButton>
                      <ComingSoonButton variant="ghost" size="icon" motivo="Mais ações em breve">
                        <MoreHorizontal className="w-4 h-4" />
                      </ComingSoonButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SourceConfigModal
        open={showModal}
        onOpenChange={(open) => {
          setShowModal(open);
          if (!open) setSelectedSource(null);
        }}
        source={selectedSource ? {
          id: selectedSource.id,
          name: selectedSource.name,
          type: selectedSource.type,
          isActive: selectedSource.is_active,
          utmSource: selectedSource.utm_source ?? '',
          utmMedium: selectedSource.utm_medium ?? '',
          utmCampaign: selectedSource.utm_campaign ?? '',
        } : null}
        onSave={handleSave}
      />
    </div>
  );
};

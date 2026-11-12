import { EmptyState } from '@/components/shared/EmptyState';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import { TrafficChart } from './TrafficChart';
import { ConversionFunnel } from './ConversionFunnel';
import { SourceBreakdown } from './SourceBreakdown';
import { AnunciosConversas } from './AnunciosConversas';
import { DashboardCardSkeleton } from '@/components/shared/Skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  DollarSign,
  Eye,
  Globe,
  Facebook,
  Instagram,
  Search,
  AlertCircle,
  Megaphone,
  Store,
} from 'lucide-react';
import { useRastreamentoResumo } from '@/hooks/useTracking';
import {
  PeriodoRastreamento,
  fontesSomadas,
  nomeDaLoja,
  taxaDeConversao,
  variacao,
} from '@/lib/rastreamento/resumo';

// Mapeamento de ícones por tipo de fonte
const getSourceIcon = (sourceType: string) => {
  const iconMap: Record<string, any> = {
    'facebook': Facebook,
    'instagram': Instagram,
    'google': Search,
    'organic': Globe,
    'direct': Users,
    'email': Target,
    'social': Instagram,
    'paid': Search,
    'referral': Globe,
  };
  return iconMap[sourceType.toLowerCase()] || Globe;
};

// Mapeamento de cores por tipo de fonte. Lote 7: as séries dos gráficos
// (--chart-*), em quadrado suave; o ícone fica na cor do texto.
const getSourceColor = (sourceType: string) => {
  const colorMap: Record<string, string> = {
    'facebook': 'bg-chart-2/20',
    'instagram': 'bg-chart-6/25',
    'google': 'bg-chart-1/20',
    'organic': 'bg-chart-4/20',
    'direct': 'bg-muted',
    'email': 'bg-chart-8/20',
    'social': 'bg-chart-5/20',
    'paid': 'bg-chart-7/25',
    'referral': 'bg-chart-3/20',
  };
  return colorMap[sourceType.toLowerCase()] || 'bg-muted';
};

const numero = new Intl.NumberFormat('pt-BR');

function Tendencia({ atual, anterior }: { atual: number; anterior: number }) {
  const v = variacao(atual, anterior);
  if (v === null) {
    return <span className="text-sm text-muted-foreground">sem dados no período anterior</span>;
  }
  const sobe = v >= 0;
  return (
    <>
      {sobe ? (
        <TrendingUp className="w-4 h-4 text-success mr-1" />
      ) : (
        <TrendingDown className="w-4 h-4 text-destructive mr-1" />
      )}
      <span className={`text-sm ${sobe ? 'text-success' : 'text-destructive'}`}>
        {Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
      </span>
      <span className="text-sm text-muted-foreground ml-1">vs período anterior</span>
    </>
  );
}

interface CartaoProps {
  titulo: string;
  valor: string;
  icone: ReactNode;
  fundo: string;
  rodape: ReactNode;
}

function Cartao({ titulo, valor, icone, fundo, rodape }: CartaoProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
            <p className="text-3xl font-bold">{valor}</p>
            <div className="flex flex-wrap items-center mt-1">{rodape}</div>
          </div>
          <div className={`w-12 h-12 shrink-0 ${fundo} rounded-lg flex items-center justify-center`}>{icone}</div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TrackingDashboardProps {
  periodo: PeriodoRastreamento;
}

export const TrackingDashboard = ({ periodo }: TrackingDashboardProps) => {
  const { data: resumo, isLoading, error } = useRastreamentoResumo(periodo);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Não foi possível carregar os números do rastreamento. Recarregue a página. Se continuar, fale com o suporte do ConvoFlow.
        </AlertDescription>
      </Alert>
    );
  }

  const t = resumo?.totais;
  const ant = resumo?.anterior;
  const todas = !!resumo?.todas_lojas;
  const lojasFilhas = resumo?.lojas.filter((l) => l.tipo !== 'account') ?? [];
  const taxa = t ? taxaDeConversao(t) : 0;
  const taxaAnterior = ant ? taxaDeConversao(ant) : 0;

  return (
    <div className="space-y-6">
      {todas && (
        <Alert data-testid="aviso-todas-as-lojas">
          <Store className="h-4 w-4" />
          <AlertDescription>
            <strong>Todas as Lojas.</strong>{' '}
            {lojasFilhas.length === 1
              ? 'Os números somam a Conta e a Loja dela.'
              : `Os números somam a Conta e as ${lojasFilhas.length} Lojas dela.`}{' '}
            Para ver uma Loja só, escolha a Loja no seletor do topo.
          </AlertDescription>
        </Alert>
      )}

      {/* Métricas principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {isLoading || !t || !ant ? (
          [...Array(5)].map((_, i) => <DashboardCardSkeleton key={i} />)
        ) : (
          <>
            <Cartao
              titulo="Total de contatos"
              valor={numero.format(t.contatos)}
              icone={<Users className="w-6 h-6 text-info" />}
              fundo="bg-info/10"
              rodape={<Tendencia atual={t.contatos} anterior={ant.contatos} />}
            />
            <Cartao
              titulo="Conversas iniciadas por anúncio"
              valor={numero.format(t.conversas_anuncio)}
              icone={<Megaphone className="w-6 h-6 text-primary" />}
              fundo="bg-primary/10"
              rodape={
                <span className="text-sm text-muted-foreground" data-testid="novos-e-voltaram">
                  {numero.format(t.novos)} novos, {numero.format(t.voltaram)} voltaram
                </span>
              }
            />
            <Cartao
              titulo="Conversões"
              valor={numero.format(t.conversoes)}
              icone={<Target className="w-6 h-6 text-success" />}
              fundo="bg-success/10"
              rodape={<Tendencia atual={t.conversoes} anterior={ant.conversoes} />}
            />
            <Cartao
              titulo="Receita gerada"
              valor={`R$ ${t.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              icone={<DollarSign className="w-6 h-6 text-accent" />}
              fundo="bg-accent/10"
              rodape={<Tendencia atual={t.receita} anterior={ant.receita} />}
            />
            <Cartao
              titulo="Taxa de conversão"
              valor={`${taxa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
              icone={<Eye className="w-6 h-6 text-warning" />}
              fundo="bg-warning/10"
              rodape={<Tendencia atual={taxa} anterior={taxaAnterior} />}
            />
          </>
        )}
      </div>

      {todas && resumo && (
        <Card data-testid="quadro-por-loja">
          <CardHeader>
            <CardTitle>Por Loja</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              ariaLabel="Números por Loja"
              rows={resumo.por_loja}
              rowKey={(l) => l.tenant_id}
              columns={[
                { key: 'loja', header: 'Loja', cell: (l) => nomeDaLoja(resumo.lojas, l.tenant_id), card: 'title' },
                { key: 'contatos', header: 'Contatos', cell: (l) => l.contatos, headClassName: 'text-right', cellClassName: 'text-right' },
                { key: 'anuncio', header: 'Conversas de anúncio', cell: (l) => <span className="font-semibold">{l.conversas_anuncio}</span>, headClassName: 'text-right', cellClassName: 'text-right' },
                { key: 'novos', header: 'Novos', cell: (l) => l.novos, headClassName: 'text-right', cellClassName: 'text-right' },
                { key: 'voltaram', header: 'Voltaram', cell: (l) => l.voltaram, headClassName: 'text-right', cellClassName: 'text-right' },
                { key: 'conversoes', header: 'Conversões', cell: (l) => l.conversoes, headClassName: 'text-right', cellClassName: 'text-right' },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <AnunciosConversas resumo={resumo} isLoading={isLoading} />

      {/* Gráficos e Análises */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrafficChart data={resumo?.por_dia} isLoading={isLoading} />
        <ConversionFunnel
          metrics={t ? { totalLeads: t.contatos, totalConversions: t.conversoes } : undefined}
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SourceBreakdown data={fontesSomadas(resumo?.por_fonte ?? [])} isLoading={isLoading} />
        </div>

        {/* Resultado por fonte, no período */}
        <Card>
          <CardHeader>
            <CardTitle>Resultado por fonte</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <DashboardCardSkeleton />
            ) : (
              <div className="space-y-4">
                {(resumo?.por_fonte ?? []).slice(0, todas ? 8 : 5).map((source) => {
                  const IconComponent = getSourceIcon(source.tipo || 'organic');
                  const colorClass = getSourceColor(source.tipo || 'organic');
                  const rate = source.contatos > 0 ? (source.conversoes / source.contatos) * 100 : 0;

                  return (
                    <div key={`${source.tenant_id}|${source.fonte_id ?? 'sem'}`} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center space-x-3">
                        <div className={`w-8 h-8 shrink-0 ${colorClass} rounded-lg flex items-center justify-center`}>
                          <IconComponent className="w-4 h-4 text-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm break-words">{source.fonte}</p>
                          {todas && resumo && (
                            <p className="text-xs text-muted-foreground">{nomeDaLoja(resumo.lojas, source.tenant_id)}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {source.contatos} contatos • {source.conversoes} conversões
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">
                          {rate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                {(!resumo || resumo.por_fonte.length === 0) && (
                  <EmptyState
                    icon={<Globe />}
                    title="Nenhum contato com origem no período"
                    description="Contatos que chegam por anúncio ou por uma fonte cadastrada aparecem aqui."
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

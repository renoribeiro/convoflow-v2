import { useMemo, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/shared/ResponsiveTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { DashboardCardSkeleton } from '@/components/shared/Skeleton';
import { rotuloDiaLongo } from '@/lib/datas/brasilia';
import {
  AnuncioDoResumo,
  AnuncioPorDia,
  ResumoRastreamento,
  nomeDaLoja,
  tituloDoAnuncio,
  titulosPorAnuncio,
} from '@/lib/rastreamento/resumo';

interface Props {
  resumo?: ResumoRastreamento;
  isLoading?: boolean;
}

/**
 * "Conversas iniciadas por anúncio" (2026-11-12): cada conversa que alguém
 * começou clicando num anúncio, novos e quem voltou, por anúncio ou por dia,
 * com o ID do anúncio para conferir com o Gerenciador linha a linha. Em
 * "Todas as Lojas", cada linha diz a Loja.
 */
export const AnunciosConversas = ({ resumo, isLoading }: Props) => {
  const [visao, setVisao] = useState<'anuncio' | 'dia'>('anuncio');
  const todas = !!resumo?.todas_lojas;
  const titulos = useMemo(() => titulosPorAnuncio(resumo?.anuncios ?? []), [resumo]);
  const total = resumo?.totais;
  const lojas = resumo?.lojas ?? [];

  const idDoAnuncio = (a: { anuncio_id: string }) => (a.anuncio_id === 'sem_id' ? 'sem ID' : a.anuncio_id);
  const colunaLoja: ResponsiveColumn<{ tenant_id: string }> = {
    key: 'loja', header: 'Loja', cell: (a) => nomeDaLoja(lojas, a.tenant_id), card: 'subtitle',
  };
  const numeros = <T extends { conversas: number; novos: number; voltaram: number }>(): ResponsiveColumn<T>[] => [
    { key: 'conversas', header: 'Conversas', cell: (a) => <span className="font-semibold">{a.conversas}</span>, headClassName: 'text-right', cellClassName: 'text-right' },
    { key: 'novos', header: 'Novos', cell: (a) => a.novos, headClassName: 'text-right', cellClassName: 'text-right' },
    { key: 'voltaram', header: 'Voltaram', cell: (a) => a.voltaram, headClassName: 'text-right', cellClassName: 'text-right' },
  ];
  const colunasPorAnuncio: ResponsiveColumn<AnuncioDoResumo>[] = [
    ...(todas ? [colunaLoja as ResponsiveColumn<AnuncioDoResumo>] : []),
    { key: 'anuncio', header: 'Anúncio', cell: (a) => tituloDoAnuncio(a), card: 'title', cellClassName: 'min-w-[10rem]' },
    { key: 'id', header: 'ID do anúncio', cell: (a) => <span className="font-mono text-xs break-all">{idDoAnuncio(a)}</span>, cardFull: true },
    ...numeros<AnuncioDoResumo>(),
  ];
  const colunasPorDia: ResponsiveColumn<AnuncioPorDia>[] = [
    { key: 'dia', header: 'Dia', cell: (a) => <span className="whitespace-nowrap">{rotuloDiaLongo(a.dia)}</span>, card: 'badge' },
    ...(todas ? [colunaLoja as ResponsiveColumn<AnuncioPorDia>] : []),
    { key: 'anuncio', header: 'Anúncio', cell: (a) => titulos.get(`${a.tenant_id}|${a.anuncio_id}`) ?? tituloDoAnuncio(a), card: 'title', cellClassName: 'min-w-[10rem]' },
    { key: 'id', header: 'ID do anúncio', cell: (a) => <span className="font-mono text-xs break-all">{idDoAnuncio(a)}</span>, cardFull: true },
    ...numeros<AnuncioPorDia>(),
  ];

  return (
    <Card data-testid="quadro-conversas-anuncio">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Conversas iniciadas por anúncio</CardTitle>
          <FeatureHelp helpKey="page:tracking-anuncios" />
        </div>
        {total && (
          <p className="text-sm text-muted-foreground">
            {total.conversas_anuncio} conversas no período: {total.novos} de contatos novos e{' '}
            {total.voltaram} de quem já era contato e voltou. Só WhatsApp, nos números conectados ao ConvoFlow.
          </p>
        )}
        <Tabs value={visao} onValueChange={(v) => setVisao(v as 'anuncio' | 'dia')}>
          <TabsList>
            <TabsTrigger value="anuncio">Por anúncio</TabsTrigger>
            <TabsTrigger value="dia">Por dia</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <DashboardCardSkeleton />
        ) : !resumo || resumo.anuncios.length === 0 ? (
          <EmptyState
            compacto
            icon={<Megaphone />}
            title="Nenhuma conversa de anúncio no período"
            description="Quando alguém clicar em um anúncio da Meta e mandar mensagem no WhatsApp, a conversa aparece aqui."
          />
        ) : visao === 'anuncio' ? (
          <ResponsiveTable
            ariaLabel="Conversas iniciadas por anúncio, por anúncio"
            rows={resumo.anuncios}
            rowKey={(a) => `${a.tenant_id}|${a.anuncio_id}`}
            columns={colunasPorAnuncio}
          />
        ) : (
          <ResponsiveTable
            ariaLabel="Conversas iniciadas por anúncio, por dia"
            rows={resumo.anuncios_por_dia}
            rowKey={(a) => `${a.dia}|${a.tenant_id}|${a.anuncio_id}`}
            columns={colunasPorDia}
          />
        )}
      </CardContent>
    </Card>
  );
};

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CreditCard,
  FlaskConical,
  Loader2,
  RefreshCw,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import { supabase } from '@/integrations/supabase/client';
import {
  CONTA_BILLING_COLUMNS,
  currentMonthRevenue,
  formatCents,
  formatDate,
  formatMonth,
  statusLabel,
  summarizeContas,
  unrecoveredFailures,
  upcomingTotal,
  type BillingOverview,
  type ContaBillingRow,
  type FailedPayment,
  type LegacyConta,
  type MonthRevenue,
  type UpcomingCharge,
} from '@/lib/billing/adminBilling';
import { stripeService } from '@/services/stripeService';
import { CouponManager } from '@/components/admin/billing/CouponManager';
import { StripeConnectionStatus } from '@/components/admin/billing/StripeConnectionStatus';
import { AttendantSeatsDialog } from '@/components/admin/billing/AttendantSeatsDialog';

/**
 * Administração › Faturamento (superadmin).
 *
 * Duas fontes, cada uma no que sabe (ver src/lib/billing/adminBilling.ts):
 *   - as linhas das Contas: pagantes, teste, pagamento pendente, cancelamento
 *     agendado;
 *   - o Stripe ao vivo (stripe-admin › billing_overview): receita mensal,
 *     próximas cobranças, receita por mês, falhas.
 * A Conta com assinatura fora da conta do Stripe atual aparece à parte, com o
 * rótulo de conta antiga, e não entra em número nenhum.
 */
export function BillingDashboard() {
  const [aba, setAba] = useState('contas');

  const contasQuery = useQuery({
    queryKey: ['admin-billing', 'contas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select(CONTA_BILLING_COLUMNS)
        .eq('kind', 'account')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContaBillingRow[];
    },
  });

  const stripeQuery = useQuery({
    queryKey: ['admin-billing', 'overview'],
    queryFn: () => stripeService.getBillingOverview(),
    retry: false,
  });

  const overview: BillingOverview | undefined = stripeQuery.data;
  const legacy = overview?.legacy ?? [];
  const legacyIds = new Set(legacy.map((l) => l.tenantId));
  const resumo = summarizeContas(contasQuery.data ?? [], legacyIds);
  const mesAtual = currentMonthRevenue(overview);
  const carregandoContas = contasQuery.isLoading;
  const carregandoStripe = stripeQuery.isLoading;
  const valorStripe = (v: string) => (carregandoStripe ? <Loader2 className="h-5 w-5 animate-spin" /> : overview ? v : '—');

  return (
    <div className="space-y-6">
      {/* ---- Pelas Contas ---- */}
      <section className="space-y-3" aria-labelledby="fat-contas">
        <h3 id="fat-contas" className="text-sm font-semibold text-muted-foreground">
          Pelas Contas
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Cartao
            titulo="Contas pagantes"
            icone={<CreditCard className="h-4 w-4 text-muted-foreground" />}
            valor={carregandoContas ? null : resumo.pagantes.length}
            nota="Assinatura ativa na conta do Stripe atual"
          />
          <Cartao
            titulo="Em teste"
            icone={<FlaskConical className="h-4 w-4 text-muted-foreground" />}
            valor={carregandoContas ? null : resumo.emTeste.length}
            nota={
              resumo.emTeste[0]?.trial_ends_at
                ? `O próximo termina em ${formatDate(resumo.emTeste[0].trial_ends_at)}`
                : 'Nenhum teste em andamento'
            }
          />
          <Cartao
            titulo="Pagamento pendente"
            icone={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
            valor={carregandoContas ? null : resumo.pendentes.length}
            nota="O Stripe ainda está tentando cobrar"
          />
          <Cartao
            titulo="Cancelamento agendado"
            icone={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
            valor={carregandoContas ? null : resumo.cancelamentos.length}
            nota="Pagam até o fim do período e saem"
          />
        </div>
        {contasQuery.error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Não foi possível ler as Contas: {(contasQuery.error as Error).message}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      {/* ---- No Stripe, ao vivo ---- */}
      <section className="space-y-3" aria-labelledby="fat-stripe">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="fat-stripe" className="text-sm font-semibold text-muted-foreground">
            No Stripe, ao vivo
            {overview ? (
              <span className="ml-2 font-normal">
                (consultado às {new Date(overview.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
              </span>
            ) : null}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => stripeQuery.refetch()}
            disabled={stripeQuery.isFetching}
            className="gap-2"
          >
            {stripeQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Cartao
            titulo="Receita mensal recorrente"
            icone={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
            valor={valorStripe(formatCents(overview?.mrr.net))}
            nota={
              overview
                ? `Plano ${formatCents(overview.mrr.plan)} · Lojas extras ${formatCents(overview.mrr.extraStores)} · Cupons −${formatCents(overview.mrr.discounts)}`
                : 'Com lojas extras e cupons'
            }
          />
          <Cartao
            titulo="Próximas cobranças"
            icone={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
            valor={valorStripe(String(overview?.upcoming.length ?? 0))}
            nota={overview ? `Somam ${formatCents(upcomingTotal(overview))}` : 'Uma por assinatura'}
          />
          <Cartao
            titulo="Recebido no mês"
            icone={<Wallet className="h-4 w-4 text-muted-foreground" />}
            valor={valorStripe(formatCents(mesAtual?.amount ?? 0))}
            nota={mesAtual ? `${formatMonth(mesAtual.month)} · ${mesAtual.invoices} fatura(s) paga(s)` : 'Faturas pagas no mês'}
          />
          <Cartao
            titulo="Pagamentos que falharam"
            icone={<XCircle className="h-4 w-4 text-muted-foreground" />}
            valor={valorStripe(String(overview?.failedPayments.length ?? 0))}
            nota={overview ? `Últimos 90 dias · ${unrecoveredFailures(overview)} sem recuperação` : 'Últimos 90 dias'}
          />
        </div>
        {stripeQuery.error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>O Stripe não respondeu</AlertTitle>
            <AlertDescription>
              {(stripeQuery.error as Error).message} Sem o Stripe, as Contas com assinatura na conta antiga não puderam
              ser separadas: as listas das Contas podem incluí-las.
            </AlertDescription>
          </Alert>
        ) : null}
        {overview?.warnings.length ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                {overview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
      </section>

      {legacy.length ? <ContasDaContaAntiga contas={legacy} /> : null}

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList className="h-auto max-w-full flex-wrap">
          <TabsTrigger value="contas">Contas</TabsTrigger>
          <TabsTrigger value="stripe">Stripe</TabsTrigger>
          <TabsTrigger value="coupons">Cupons</TabsTrigger>
          <TabsTrigger value="conexao">Conexão</TabsTrigger>
        </TabsList>

        <TabsContent value="contas" className="space-y-4">
          <ListaDeContas
            titulo="Em teste"
            descricao="Filtradas pelo status do teste no Stripe, com a data em que o teste termina e a cobrança começa."
            linhas={resumo.emTeste}
            vazio="Nenhuma Conta em teste"
            carregando={carregandoContas}
            detalhe={{ header: 'Termina em', cell: (c) => formatDate(c.trial_ends_at) }}
          />
          <ListaDeContas
            titulo="Pagamento pendente"
            descricao="O cartão foi recusado e o Stripe está tentando de novo. A Conta continua liberada enquanto isso."
            linhas={resumo.pendentes}
            vazio="Nenhum pagamento pendente"
            carregando={carregandoContas}
            detalhe={{ header: 'Situação', cell: (c) => statusLabel(c.subscription_status) }}
          />
          <ListaDeContas
            titulo="Cancelamento agendado"
            descricao="A assinatura termina nesta data e não renova."
            linhas={resumo.cancelamentos}
            vazio="Nenhum cancelamento agendado"
            carregando={carregandoContas}
            detalhe={{ header: 'Cancela em', cell: (c) => formatDate(c.subscription_cancel_at) }}
          />
          <ListaDeContas
            titulo="Contas pagantes"
            descricao="Assinatura ativa. Lojas extras contratadas ao lado."
            linhas={resumo.pagantes}
            vazio="Nenhuma Conta pagante"
            carregando={carregandoContas}
            detalhe={{ header: 'Lojas extras', cell: (c) => String(c.store_slots_extra ?? 0) }}
          />
          <AtendentesPorConta contas={contasQuery.data ?? []} carregando={carregandoContas} />
        </TabsContent>

        <TabsContent value="stripe" className="space-y-4">
          <ProximasCobrancas linhas={overview?.upcoming ?? []} carregando={carregandoStripe} />
          <ReceitaPorMes linhas={overview?.revenueByMonth ?? []} carregando={carregandoStripe} />
          <Falhas linhas={overview?.failedPayments ?? []} carregando={carregandoStripe} />
        </TabsContent>

        <TabsContent value="coupons" className="space-y-4">
          <CouponManager />
        </TabsContent>

        <TabsContent value="conexao" className="space-y-4">
          <StripeConnectionStatus />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Cartao({
  titulo,
  icone,
  valor,
  nota,
}: {
  titulo: string;
  icone: ReactNode;
  valor: ReactNode;
  nota: string;
}) {
  return (
    <Card data-testid={`cartao-${titulo}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{titulo}</CardTitle>
        {icone}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid="valor">
          {valor === null ? <Loader2 className="h-5 w-5 animate-spin" /> : valor}
        </div>
        <p className="text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  );
}

function ContasDaContaAntiga({ contas }: { contas: LegacyConta[] }) {
  return (
    <Card className="border-amber-300" data-testid="contas-conta-antiga">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Fora da conta atual do Stripe
        </CardTitle>
        <CardDescription>
          A assinatura destas Contas está na conta ANTIGA do Stripe, que não se comunica mais com o ConvoFlow: nada do que
          acontece lá (renovação, cartão recusado, cancelamento) chega aqui. Elas não entram em nenhum número desta aba.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveTable
          ariaLabel="Contas com assinatura na conta antiga do Stripe"
          rows={contas}
          rowKey={(c) => c.tenantId}
          columns={[
            { key: 'conta', header: 'Conta', card: 'title', cellClassName: 'font-medium', cell: (c) => c.contaName },
            {
              key: 'rotulo',
              header: 'Onde está',
              card: 'badge',
              cell: () => <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Conta antiga do Stripe</Badge>,
            },
            { key: 'status', header: 'Situação gravada', cell: (c) => statusLabel(c.subscriptionStatus) },
            {
              key: 'assinatura',
              header: 'Assinatura',
              card: 'subtitle',
              cell: (c) => <span className="break-all font-mono text-xs">{c.subscriptionId}</span>,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function ListaDeContas({
  titulo,
  descricao,
  linhas,
  vazio,
  carregando,
  detalhe,
}: {
  titulo: string;
  descricao: string;
  linhas: ContaBillingRow[];
  vazio: string;
  carregando: boolean;
  detalhe: { header: string; cell: (c: ContaBillingRow) => ReactNode };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveTable
          ariaLabel={titulo}
          rows={linhas}
          rowKey={(c) => c.id}
          loading={carregando}
          empty={vazio}
          columns={[
            { key: 'conta', header: 'Conta', card: 'title', cellClassName: 'font-medium', cell: (c) => c.name ?? '—' },
            { key: 'detalhe', header: detalhe.header, cell: detalhe.cell },
          ]}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Todas as Contas — pagantes, em teste e com acesso manual —, cada uma com o
 * botão que abre as vagas de atendente das Lojas dela. As quatro listas acima
 * separam por situação de cobrança; esta não, porque a vaga extra também é
 * dada a quem tem acesso manual.
 */
function AtendentesPorConta({ contas, carregando }: { contas: ContaBillingRow[]; carregando: boolean }) {
  const [aberta, setAberta] = useState<{ id: string; name: string | null } | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Atendentes por Loja</CardTitle>
        <CardDescription>
          Toda Loja tem 2 vagas de atendente. Para dar mais a uma Loja, como combinado com o cliente, abra a Conta em
          "Atendentes".
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveTable
          ariaLabel="Atendentes por Loja"
          rows={contas}
          rowKey={(c) => c.id}
          loading={carregando}
          empty="Nenhuma Conta"
          columns={[
            { key: 'conta', header: 'Conta', card: 'title', cellClassName: 'font-medium', cell: (c) => c.name ?? '—' },
          ]}
          actionsHeader="Vagas"
          actions={(c) => (
            <Button size="sm" variant="outline" onClick={() => setAberta({ id: c.id, name: c.name ?? null })}>
              Atendentes
            </Button>
          )}
        />
      </CardContent>
      <AttendantSeatsDialog conta={aberta} onOpenChange={(v) => !v && setAberta(null)} />
    </Card>
  );
}

function ProximasCobrancas({ linhas, carregando }: { linhas: UpcomingCharge[]; carregando: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Próximas cobranças</CardTitle>
        <CardDescription>
          A próxima fatura de cada assinatura, já com lojas extras e cupons. Quem agendou o cancelamento não aparece: não
          há próxima cobrança.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveTable
          ariaLabel="Próximas cobranças"
          rows={linhas}
          rowKey={(u) => u.subscriptionId}
          loading={carregando}
          empty="Nenhuma cobrança prevista"
          columns={[
            { key: 'conta', header: 'Conta', card: 'title', cellClassName: 'font-medium', cell: (u) => u.contaName },
            { key: 'data', header: 'Data', cell: (u) => formatDate(u.date) },
            { key: 'valor', header: 'Valor', cell: (u) => formatCents(u.amount, u.currency) },
            { key: 'status', header: 'Situação', card: 'badge', cell: (u) => <Badge variant="secondary">{statusLabel(u.status)}</Badge> },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function ReceitaPorMes({ linhas, carregando }: { linhas: MonthRevenue[]; carregando: boolean }) {
  const recentes = [...linhas].reverse();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Receita recebida por mês</CardTitle>
        <CardDescription>
          Soma das faturas pagas nos últimos 12 meses, pelo horário de Brasília. Reembolsos não são descontados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveTable
          ariaLabel="Receita recebida por mês"
          rows={recentes}
          rowKey={(m) => m.month}
          loading={carregando}
          empty="Sem dados do Stripe"
          columns={[
            { key: 'mes', header: 'Mês', card: 'title', cellClassName: 'font-medium', cell: (m) => formatMonth(m.month) },
            { key: 'valor', header: 'Recebido', cell: (m) => formatCents(m.amount) },
            { key: 'faturas', header: 'Faturas pagas', cell: (m) => String(m.invoices) },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function Falhas({ linhas, carregando }: { linhas: FailedPayment[]; carregando: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pagamentos que falharam</CardTitle>
        <CardDescription>
          Cobranças recusadas nos últimos 90 dias. "Recuperado" quer dizer que a mesma fatura foi paga depois.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveTable
          ariaLabel="Pagamentos que falharam"
          rows={linhas}
          rowKey={(f) => f.chargeId}
          loading={carregando}
          empty="Nenhum pagamento falhou"
          columns={[
            { key: 'conta', header: 'Conta', card: 'title', cellClassName: 'font-medium', cell: (f) => f.contaName },
            { key: 'data', header: 'Data', cell: (f) => formatDate(f.date) },
            { key: 'valor', header: 'Valor', cell: (f) => formatCents(f.amount, f.currency) },
            { key: 'motivo', header: 'Motivo', cell: (f) => f.reason ?? '—' },
            {
              key: 'recuperado',
              header: 'Situação',
              card: 'badge',
              cell: (f) =>
                f.recovered ? <Badge variant="secondary">Recuperado</Badge> : <Badge variant="destructive">Não recuperado</Badge>,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

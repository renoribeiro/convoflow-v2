import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Copy, ListChecks, Loader2, RefreshCw, XCircle } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { env } from '@/lib/env';
import {
  WEBHOOK_EVENTS,
  formatCents,
  stripeWebhookUrl,
  type EnsureApiProductResult,
  type PriceCheck,
  type ProductCheck,
  type StripeStatus,
} from '@/lib/billing/adminBilling';
import { stripeService } from '@/services/stripeService';
import { useToast } from '@/hooks/use-toast';

/**
 * Aba Conexão do Faturamento (superadmin). SÓ mostra o estado: a chave do
 * Stripe é a secret STRIPE_SECRET_KEY do Supabase, a mesma do checkout, do
 * webhook e dos cupons — não há campo para salvar chave aqui. "Testar Conexão"
 * só consulta de novo; não grava nada.
 */
export function StripeConnectionStatus() {
  const consulta = useQuery({
    queryKey: ['admin-billing', 'stripe-status'],
    queryFn: () => stripeService.getStripeStatus(),
  });
  const status: StripeStatus | undefined = consulta.data;
  const urlDoWebhook = status?.webhook.url ?? stripeWebhookUrl(env.get('SUPABASE_URL') ?? '');
  const faltando = new Set(status?.webhook.missingEvents ?? []);
  const { toast } = useToast();
  // A única escrita desta aba: marca no endpoint do Stripe os eventos que
  // faltam, sem tirar nenhum. Aparece só quando falta algum.
  const marcarEventos = useMutation({
    mutationFn: () => stripeService.ensureWebhookEvents(),
    onSuccess: (r) => {
      toast({
        title: r.added.length ? 'Eventos marcados no Stripe' : 'Nada a marcar',
        description: r.added.length ? r.added.join(', ') : 'O webhook já recebia todos os eventos.',
      });
      void consulta.refetch();
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível marcar os eventos', description: e.message, variant: 'destructive' }),
  });
  // Resultado de "Criar produto e preço da API": fica na tela até sair da aba,
  // para dar tempo de copiar os dois ids para os secrets.
  const [apiCriada, setApiCriada] = useState<EnsureApiProductResult | null>(null);
  const criarApi = useMutation({
    mutationFn: () => stripeService.ensureApiProduct(),
    onSuccess: (r) => {
      setApiCriada(r);
      toast({
        title: r.createdProduct || r.createdPrice ? 'Produto e preço da API criados' : 'Produto e preço da API já existiam',
      });
      void consulta.refetch();
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível criar o produto da API', description: e.message, variant: 'destructive' }),
  });
  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: 'Copiado' });
    } catch {
      toast({ title: 'Não foi possível copiar', description: 'Selecione o valor e copie à mão.', variant: 'destructive' });
    }
  };
  const apiConfigurada =
    !!status?.apiProduct?.found && status.apiProduct.active !== false && !!status.prices.api?.found && status.prices.api.active !== false;
  const podeMarcar =
    !!status?.connected && status.webhook.found && !status.webhook.error && status.webhook.missingEvents.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              Conexão com o Stripe
              {consulta.isLoading ? null : status?.connected ? (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Conectado
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="mr-1 h-3 w-3" /> Sem conexão
                </Badge>
              )}
              {status?.connected && status.mode !== 'unknown' ? (
                <Badge variant="outline">{status.mode === 'live' ? 'Produção' : 'Modo de teste'}</Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              A chave é a secret <code>STRIPE_SECRET_KEY</code> do Supabase — a mesma do checkout, do webhook e dos
              cupons. Trocar de conta do Stripe é trocar as secrets, não esta tela.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => consulta.refetch()}
            disabled={consulta.isFetching}
            className="gap-2 self-start"
          >
            {consulta.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Testar Conexão
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {consulta.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando o Stripe…
            </p>
          ) : consulta.error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{(consulta.error as Error).message}</AlertDescription>
            </Alert>
          ) : status && !status.connected ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{status.error ?? 'O Stripe não respondeu.'}</AlertDescription>
            </Alert>
          ) : status?.account ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Conta</dt>
                <dd className="font-medium">{status.account.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ID da conta</dt>
                <dd className="break-all font-mono text-xs">{status.account.id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">E-mail</dt>
                <dd className="break-all">{status.account.email ?? '—'}</dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {status?.connected ? (
        <Card>
          <CardHeader>
            <CardTitle>Preços usados no checkout</CardTitle>
            <CardDescription>Lidos das secrets e conferidos na conta do Stripe conectada.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Preco titulo="Plano da Conta" check={status.prices.gerente} />
            <Preco titulo="Loja extra" check={status.prices.storeSlot} />
          </CardContent>
        </Card>
      ) : null}

      {status?.connected && status.attendantProduct ? (
        <Card>
          <CardHeader>
            <CardTitle>Produto do atendente extra</CardTitle>
            <CardDescription>
              Cada Conta tem o próprio preço neste produto, definido em Contas › Atendentes. Sem ele, as vagas extras
              valem, mas não são cobradas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Produto check={status.attendantProduct} />
          </CardContent>
        </Card>
      ) : null}

      {status?.connected ? (
        <Card>
          <CardHeader>
            <CardTitle>API e integrações</CardTitle>
            <CardDescription>
              O produto e o preço mensal do complemento da API. Sem eles, o complemento não é cobrado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-4 md:grid-cols-2">
              {status.apiProduct ? <Produto check={status.apiProduct} titulo="API e integrações" /> : null}
              {status.prices.api ? <Preco titulo="API e integrações" check={status.prices.api} /> : null}
            </div>
            {!apiConfigurada ? (
              <Button onClick={() => criarApi.mutate()} disabled={criarApi.isPending} className="gap-2">
                {criarApi.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Criar produto e preço da API no Stripe
              </Button>
            ) : null}
            {apiCriada ? (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20" data-testid="api-ids">
                {(
                  [
                    [apiCriada.productEnv, apiCriada.productId],
                    [apiCriada.priceEnv, apiCriada.priceId],
                  ] as const
                ).map(([nome, valor]) => (
                  <div key={nome} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{nome}</span>
                    <code className="break-all rounded bg-background px-1.5 py-0.5 text-xs">{valor}</code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => copiar(valor)}
                      aria-label={`Copiar ${nome}`}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </Button>
                  </div>
                ))}
                <p>
                  Cole estes dois valores nos secrets STRIPE_PRODUCT_API e STRIPE_PRICE_API do Supabase (Edge Functions ›
                  Secrets) e publique de novo as funções.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
          <CardDescription>
            É por ele que o estado de cada assinatura chega à Conta. No Stripe, o endpoint precisa apontar para este
            endereço e receber os {WEBHOOK_EVENTS.length} eventos abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <code className="block break-all rounded bg-muted px-2 py-1 text-xs" data-testid="webhook-url">
            {urlDoWebhook}
          </code>
          {status?.connected ? (
            status.webhook.error ? (
              <p className="text-sm text-destructive">{status.webhook.error}</p>
            ) : !status.webhook.found ? (
              <p className="text-sm text-destructive">Nenhum endpoint da conta conectada aponta para este endereço.</p>
            ) : status.webhook.enabled === false ? (
              <p className="text-sm text-destructive">O endpoint existe, mas está desativado no Stripe.</p>
            ) : (
              <p className="text-sm text-green-700">Endpoint encontrado e ativo.</p>
            )
          ) : null}
          <ul className="space-y-1 text-sm" aria-label="Eventos do webhook">
            {WEBHOOK_EVENTS.map((evento) => {
              const conferido = !!status?.connected && status.webhook.found;
              const falta = conferido && faltando.has(evento);
              return (
                <li key={evento} className="flex items-center gap-2">
                  {!conferido ? (
                    <span className="h-4 w-4" />
                  ) : falta ? (
                    <XCircle className="h-4 w-4 text-destructive" aria-label="falta" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="ok" />
                  )}
                  <code className="text-xs">{evento}</code>
                </li>
              );
            })}
          </ul>
          {podeMarcar ? (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
              <p>
                Faltam {status?.webhook.missingEvents.length} evento(s). Sem eles, o que chega por esses eventos não é
                gravado (por exemplo, o reembolso na lista de cobranças).
              </p>
              <Button
                size="sm"
                onClick={() => marcarEventos.mutate()}
                disabled={marcarEventos.isPending}
                className="gap-2"
              >
                {marcarEventos.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
                Marcar os eventos que faltam
              </Button>
              <p className="text-xs text-muted-foreground">
                Só acrescenta eventos ao endpoint do Stripe. Nenhum é tirado e o segredo do webhook não muda.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Produto({ check, titulo = 'Atendente extra' }: { check: ProductCheck; titulo?: string }) {
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm" data-testid={`produto-${check.env}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{titulo}</span>
        {check.found && check.active !== false ? (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">OK</Badge>
        ) : (
          <Badge variant="destructive">Problema</Badge>
        )}
      </div>
      {check.found ? (
        <p>
          {check.name ?? 'Produto encontrado'}
          {check.active === false ? ' (produto arquivado no Stripe)' : ''}
        </p>
      ) : (
        <p className="text-destructive">{check.error ?? 'Produto não encontrado.'}</p>
      )}
      <p className="break-all font-mono text-xs text-muted-foreground">
        {check.env}: {check.id ?? 'não definida'}
      </p>
    </div>
  );
}

function Preco({ titulo, check }: { titulo: string; check: PriceCheck }) {
  const periodo = check.interval === 'month' ? 'mês' : check.interval === 'year' ? 'ano' : check.interval;
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm" data-testid={`preco-${check.env}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{titulo}</span>
        {check.found && check.active !== false ? (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">OK</Badge>
        ) : (
          <Badge variant="destructive">Problema</Badge>
        )}
      </div>
      {check.found ? (
        <p>
          {formatCents(check.unitAmount, check.currency ?? 'brl')}
          {periodo ? ` / ${periodo}` : ''}
          {check.productName ? ` — ${check.productName}` : ''}
          {check.active === false ? ' (preço arquivado no Stripe)' : ''}
        </p>
      ) : (
        <p className="text-destructive">{check.error ?? 'Preço não encontrado.'}</p>
      )}
      <p className="break-all font-mono text-xs text-muted-foreground">
        {check.env}: {check.id ?? 'não definida'}
      </p>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Check, AlertTriangle, CreditCard, Loader2, Store, RotateCcw, XCircle } from 'lucide-react';
import { useTenant, useIsGerente } from '@/contexts/TenantContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/lib/queryClient';
import { useTenant as useTenantCtx } from '@/contexts/TenantContext';

// =============================================================================
// PLANO GERENTE — R$ 499,90/mês (inclui 5 lojas) + lojas extras R$ 99,90/mês
// -----------------------------------------------------------------------------
// Os rótulos do plano, a chave `CHECKOUT_ENABLED` e a chamada ao Stripe moram
// em `@/lib/billing/checkout`, não aqui. Antes esta tela e a PaywallScreen
// tinham cada uma a SUA constante `CHECKOUT_ENABLED`, com valores opostos — a
// tela que bloqueia não cobrava e a tela que cobra ficava atrás do bloqueio.
// Uma decisão, um arquivo.
// =============================================================================
import {
  criarSessaoDeCheckout,
  INCLUDED_SLOTS,
  PLAN_NAME,
  PLAN_PRICE_LABEL,
  SLOT_PRICE_LABEL,
} from '@/lib/billing/checkout';
import { describeSubscription, type BadgeTone } from '@/lib/billing/subscriptionView';
import {
  cancelConfirmation,
  dataCurta,
  subscriptionActions,
} from '@/lib/billing/subscriptionActions';
import { gerenciarAssinatura, type ManageResponse } from '@/lib/billing/manageSubscription';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** Quanto esperar o stripe-webhook confirmar a mudança (a tela pergunta de 2 em 2 s). */
const ESPERA_WEBHOOK_MS = 30_000;
const INTERVALO_WEBHOOK_MS = 2_000;

/** Cor do selo por situação da assinatura. */
const BADGE_CLASS: Record<BadgeTone, string> = {
  ativo: 'bg-green-500 hover:bg-green-600',
  teste: 'bg-blue-500 hover:bg-blue-600',
  pendente: 'bg-amber-500 hover:bg-amber-600',
  nenhum: '',
};

export const SubscriptionSettings = () => {
  const { tenant, profile } = useTenant();
  const { refreshTenant } = useTenantCtx();
  const queryClient = useQueryClient();
  const isGerente = useIsGerente();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [buyingSlots, setBuyingSlots] = useState(false);
  const [extraSlots, setExtraSlots] = useState(1);

  // Cancelar / desfazer / cartão (entrega 3)
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [previa, setPrevia] = useState<ManageResponse | null>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<null | 'cancelar' | 'desfazer' | 'cartao'>(null);
  const [aguardandoStripe, setAguardandoStripe] = useState(false);

  // A Conta de cobrança. Para o Gerente é SEMPRE a própria Conta
  // (profile.tenant_id), mesmo com uma Loja em foco pelo seletor: a Loja não
  // tem assinatura, e ler a linha dela mostrava "Sem assinatura" a quem paga.
  const contaId = isGerente ? ((profile?.tenant_id as string | null | undefined) ?? null) : null;
  const buscarConta = !!tenant && !!contaId && contaId !== tenant.id;
  const consultaConta = useQuery({
    queryKey: [QUERY_KEYS.TENANT, 'billing-row', contaId],
    enabled: buscarConta,
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('*').eq('id', contaId as string).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const conta = buscarConta ? consultaConta.data ?? null : tenant;
  const contaAlvoId = conta?.id ?? null;

  /**
   * O estado da Conta volta pelo stripe-webhook, não pela edge function. Depois
   * de agendar ou desfazer, pergunta à linha da Conta até o webhook gravar (ou
   * desistir em 30 s — a tela continua certa quando ele chegar).
   */
  const esperarWebhook = async (esperaCancelamento: boolean) => {
    if (!contaAlvoId) return;
    setAguardandoStripe(true);
    const fim = Date.now() + ESPERA_WEBHOOK_MS;
    try {
      while (Date.now() < fim) {
        const { data } = await supabase
          .from('tenants')
          .select('subscription_will_cancel')
          .eq('id', contaAlvoId)
          .maybeSingle();
        if (data && (data.subscription_will_cancel === true) === esperaCancelamento) break;
        await new Promise((r) => setTimeout(r, INTERVALO_WEBHOOK_MS));
      }
    } finally {
      await refreshTenant();
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TENANT] });
      setAguardandoStripe(false);
    }
  };

  // Volta do portal do Stripe (?cartao=atualizado): alinha a assinatura ao
  // cartão novo e limpa o parâmetro, uma vez só.
  const cartaoConferido = useRef(false);
  useEffect(() => {
    if (!isGerente || cartaoConferido.current) return;
    const params = new URLSearchParams(window.location?.search ?? '');
    if (params.get('cartao') !== 'atualizado') return;
    cartaoConferido.current = true;
    params.delete('cartao');
    const busca = params.toString();
    window.history?.replaceState?.(null, '', `${window.location.pathname}${busca ? `?${busca}` : ''}`);
    gerenciarAssinatura('card_sync')
      .then(() => toast({ title: 'Cartão atualizado', description: 'As próximas cobranças usam o cartão novo.' }))
      .catch((e: Error) =>
        toast({ title: 'Não foi possível conferir o cartão', description: e.message, variant: 'destructive' }),
      );
  }, [isGerente, toast]);

  if (!tenant) return null;
  if (buscarConta && consultaConta.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!conta) return null;

  // Situação da assinatura, lida da linha da Conta que o stripe-webhook mantém
  // igual ao Stripe. "Tem assinatura" = ativa, em teste grátis ou com
  // pagamento pendente (carência) — os mesmos status que liberam o sistema.
  // Antes só 'active' contava, e quem estava no teste via "Sem assinatura" com
  // um botão de assinar de novo.
  const situacao = describeSubscription(conta);
  const temAssinatura = situacao.hasSubscription;

  // Colunas de slots são adicionadas pela migração V2 — leitura defensiva.
  const includedSlots = (conta as { store_slots_included?: number }).store_slots_included ?? INCLUDED_SLOTS;
  const purchasedExtra = (conta as { store_slots_extra?: number }).store_slots_extra ?? 0;
  const totalSlots = includedSlots + purchasedExtra;

  const startCheckout = async (body: { extraSlots?: number }, setBusy: (v: boolean) => void) => {
    try {
      setBusy(true);
      // `criarSessaoDeCheckout` já anexa o referral do Rewardful, já checa a
      // chave CHECKOUT_ENABLED compartilhada e já lança com a frase em pt-BR
      // que o SERVIDOR escreveu (409 de assinatura ativa, cobrança não
      // configurada, capacidade negada) em vez da genérica "non-2xx".
      window.location.href = await criarSessaoDeCheckout(body);
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast({
        title: 'Erro ao iniciar checkout',
        description: error.message || 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSubscribe = () => startCheckout({}, setLoading);

  /**
   * Contratar Loja adicional segue por DOIS caminhos, e escolher errado era o
   * defeito:
   *
   *   sem assinatura  -> checkout, levando as vagas junto no carrinho
   *   com assinatura  -> muda a QUANTIDADE do item na assinatura existente
   *                      (update-store-slots). Um segundo checkout era recusado
   *                      com 409 pelo create-checkout-session, entao quem ja
   *                      assinava nunca conseguia contratar mais nenhuma Loja.
   *
   * A funcao recebe o TOTAL desejado, nao o incremento: repetir o pedido nao
   * acumula. Por isso somamos aqui, uma vez, ao que ja existe.
   */
  const handleBuySlots = async () => {
    const pedido = Math.max(1, Math.min(100, extraSlots));

    if (!temAssinatura) {
      await startCheckout({ extraSlots: pedido }, setBuyingSlots);
      return;
    }

    try {
      setBuyingSlots(true);
      const { data, error } = await supabase.functions.invoke('update-store-slots', {
        body: { totalExtraSlots: purchasedExtra + pedido },
      });
      if (error) {
        throw new Error(
          await mensagemDaEdgeFunction(error, 'Não foi possível contratar as Lojas adicionais.'),
        );
      }
      if (data?.error) throw new Error(data.error);

      const capacidade = data?.slots?.capacity;
      toast({
        title: 'Lojas adicionais contratadas',
        description: capacidade
          ? `Sua Conta passa a ter ${capacidade} lojas. A diferença entra na próxima fatura.`
          : 'A diferença entra na próxima fatura.',
      });

      // A linha da Conta mudou: refaz o tenant e o contador de vagas, senão a
      // tela segue mostrando o número antigo por 30 minutos (faixa estática).
      await refreshTenant();
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TENANT] });
    } catch (err: any) {
      toast({
        title: 'Erro ao contratar Lojas',
        description: err.message || 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setBuyingSlots(false);
    }
  };

  const acoes = subscriptionActions({
    isGerente,
    status: conta.subscription_status,
    willCancel: conta.subscription_will_cancel,
  });

  const abrirCancelamento = async () => {
    setPrevia(null);
    setErroPrevia(null);
    setDialogoAberto(true);
    try {
      setPrevia(await gerenciarAssinatura('preview'));
    } catch (e) {
      setErroPrevia(e instanceof Error ? e.message : 'Não foi possível consultar a assinatura agora.');
    }
  };

  const confirmarCancelamento = async () => {
    setOcupado('cancelar');
    try {
      const r = await gerenciarAssinatura('schedule_cancel');
      setDialogoAberto(false);
      const quando = dataCurta(r.endsAt);
      toast({
        title: 'Cancelamento agendado',
        description:
          r.phase === 'trial'
            ? `Nada será cobrado. O sistema continua liberado até ${quando ?? 'o fim do teste'}.`
            : `Sem nova cobrança. O sistema continua liberado até ${quando ?? 'o fim do período já pago'}.`,
      });
      await esperarWebhook(true);
    } catch (e) {
      toast({
        title: 'Não foi possível cancelar',
        description: e instanceof Error ? e.message : 'Tente de novo em alguns minutos.',
        variant: 'destructive',
      });
    } finally {
      setOcupado(null);
    }
  };

  const desfazerCancelamento = async () => {
    setOcupado('desfazer');
    try {
      const r = await gerenciarAssinatura('undo_cancel');
      toast(
        r.needsCard
          ? {
            title: 'Cancelamento desfeito, mas falta o cartão',
            description:
              'O cartão que estava salvo não está mais disponível. Clique em "Atualizar cartão" antes do fim do teste, senão a assinatura é encerrada.',
            variant: 'destructive',
          }
          : { title: 'Cancelamento desfeito', description: 'A assinatura continua normalmente.' },
      );
      await esperarWebhook(false);
    } catch (e) {
      toast({
        title: 'Não foi possível desfazer',
        description: e instanceof Error ? e.message : 'Tente de novo em alguns minutos.',
        variant: 'destructive',
      });
    } finally {
      setOcupado(null);
    }
  };

  const atualizarCartao = async () => {
    setOcupado('cartao');
    try {
      const r = await gerenciarAssinatura('card_portal');
      if (!r.url) throw new Error('O Stripe não devolveu o endereço da troca de cartão.');
      window.location.href = r.url;
      // Sem setOcupado(null): a página está saindo para o Stripe.
    } catch (e) {
      toast({
        title: 'Não foi possível abrir a troca de cartão',
        description: e instanceof Error ? e.message : 'Tente de novo em alguns minutos.',
        variant: 'destructive',
      });
      setOcupado(null);
    }
  };

  const confirmacao = previa?.phase ? cancelConfirmation(previa.phase, previa.endsAt) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Seu Plano Atual</span>
            {situacao.badge ? (
              <Badge className={BADGE_CLASS[situacao.badge.tone]}>{situacao.badge.label}</Badge>
            ) : (
              <Badge variant="outline">{conta.plan_type?.toUpperCase() || 'BASIC'}</Badge>
            )}
          </CardTitle>
          <CardDescription>Gerencie sua assinatura e faturamento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-full ${temAssinatura ? 'bg-green-100' : 'bg-gray-100'}`}>
              <CreditCard className={`w-6 h-6 ${temAssinatura ? 'text-green-600' : 'text-gray-600'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{situacao.title}</h3>
              <p className="text-sm text-muted-foreground">{situacao.description}</p>
            </div>
          </div>

          {situacao.alert && (
            <Alert variant={situacao.alert.tone}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{situacao.alert.title}</AlertTitle>
              <AlertDescription>{situacao.alert.description}</AlertDescription>
            </Alert>
          )}

          {/* Plano Gerente */}
          <div className="border rounded-lg p-5 space-y-4">
            <div className="flex items-baseline justify-between">
              <h4 className="font-semibold text-lg">{PLAN_NAME}</h4>
              <div className="text-right">
                <span className="text-2xl font-bold">{PLAN_PRICE_LABEL}</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> {INCLUDED_SLOTS} lojas incluídas
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Alternância e comparação entre lojas
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Automação, Chatbots e Campanhas
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Gestores e Atendentes por loja
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Loja adicional por {SLOT_PRICE_LABEL}/mês
              </li>
            </ul>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2 md:flex-row md:justify-end md:items-center">
          {aguardandoStripe ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground md:mr-auto">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Confirmando com o Stripe…
            </span>
          ) : null}
          {temAssinatura ? (
            <>
              {acoes.undo ? (
                <Button onClick={desfazerCancelamento} disabled={ocupado !== null} className="gap-2">
                  {ocupado === 'desfazer' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Desfazer cancelamento
                </Button>
              ) : null}
              {acoes.updateCard ? (
                <Button variant="outline" onClick={atualizarCartao} disabled={ocupado !== null} className="gap-2">
                  {ocupado === 'cartao' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  Atualizar cartão
                </Button>
              ) : null}
              {acoes.cancel ? (
                <Button
                  variant="ghost"
                  onClick={abrirCancelamento}
                  disabled={ocupado !== null}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <XCircle className="w-4 h-4" />
                  Cancelar assinatura
                </Button>
              ) : null}
              {!isGerente ? (
                <span className="text-xs text-muted-foreground">
                  Só o Gerente da Conta cancela ou troca o cartão.
                </span>
              ) : null}
            </>
          ) : (
            <Button
              onClick={handleSubscribe}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 w-full md:w-auto"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Assinar Agora por {PLAN_PRICE_LABEL}/mês
            </Button>
          )}
        </CardFooter>
      </Card>

      <AlertDialog open={dialogoAberto} onOpenChange={(aberto) => (ocupado ? null : setDialogoAberto(aberto))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmacao?.title ?? 'Cancelar a assinatura?'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground" data-testid="confirmacao-cancelamento">
                {erroPrevia ? (
                  <p className="text-destructive">{erroPrevia}</p>
                ) : confirmacao ? (
                  confirmacao.paragraphs.map((p) => <p key={p}>{p}</p>)
                ) : (
                  <p className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Consultando a data no Stripe…
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado !== null}>{confirmacao?.keepLabel ?? 'Voltar'}</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmarCancelamento}
              disabled={!confirmacao || previa?.canCancel === false || ocupado !== null}
            >
              {ocupado === 'cancelar' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {confirmacao?.confirmLabel ?? 'Cancelar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lojas / slots — só para o Gerente */}
      {isGerente && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5" /> Lojas do seu grupo
            </CardTitle>
            <CardDescription>
              Seu plano inclui {includedSlots} lojas. Contrate lojas extras por {SLOT_PRICE_LABEL}/mês cada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="rounded-md border px-3 py-2">
                <span className="text-muted-foreground">Incluídas:</span>{' '}
                <span className="font-semibold">{includedSlots}</span>
              </div>
              <div className="rounded-md border px-3 py-2">
                <span className="text-muted-foreground">Extras contratadas:</span>{' '}
                <span className="font-semibold">{purchasedExtra}</span>
              </div>
              <div className="rounded-md border px-3 py-2">
                <span className="text-muted-foreground">Total disponível:</span>{' '}
                <span className="font-semibold">{totalSlots}</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex items-center gap-2">
              <label htmlFor="extra-slots" className="text-sm text-muted-foreground">
                Quantas lojas extras?
              </label>
              <Input
                id="extra-slots"
                type="number"
                min={1}
                max={100}
                value={extraSlots}
                onChange={(e) => setExtraSlots(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="w-20"
              />
            </div>
            <Button onClick={handleBuySlots} disabled={buyingSlots}>
              {buyingSlots ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Contratar {extraSlots} loja{extraSlots > 1 ? 's' : ''} por {SLOT_PRICE_LABEL}/mês cada
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};

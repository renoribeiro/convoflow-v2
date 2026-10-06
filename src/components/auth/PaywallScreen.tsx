import { useEffect, useRef, useState } from 'react';
import { Lock, Check, LogOut, Loader2, RefreshCw, AlertTriangle, Mail, Gift, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant, useRole } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/lib/queryClient';
import { supabase } from '@/integrations/supabase/client';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import {
  COMO_CANCELAR_NO_TESTE,
  TRIAL_DAYS,
  TRIAL_OFFER_ENABLED,
  trialChargeDateLabel,
} from '@/lib/billing/trialOffer';
import {
  checkoutReturnFrom,
  CONFIRMACAO_INTERVALO_MS,
  CONFIRMACAO_LIMITE_MS,
  paywallVariant,
} from '@/lib/billing/paywallState';
import {
  criarSessaoDeCheckout,
  CHECKOUT_ENABLED,
  INCLUDED_SLOTS,
  PLAN_FEATURES,
  PLAN_NAME,
  PLAN_PRICE_LABEL,
  SUPORTE_EMAIL,
} from '@/lib/billing/checkout';

/**
 * Tela de bloqueio de uma Conta sem acesso liberado (nem pago, nem manual).
 * Ocupa a tela inteira — sem sidebar, sem menu.
 *
 * DUAS TELAS, PORQUE SÃO DUAS SITUAÇÕES DIFERENTES:
 *
 *   GERENTE    → bloqueio PARCIAL. Ele é a única pessoa que pode resolver: só a
 *                Conta assina, e a Conta é dele. Vê o plano, o preço e um botão
 *                que abre o checkout de verdade.
 *   GESTOR e   → bloqueio TOTAL. Não existe caminho de pagamento para eles: o
 *   ATENDENTE    servidor recusaria (`create-checkout-session` exige
 *                `kind='account'`). Mostrar preço a quem não pode pagar é pior
 *                que não mostrar nada — a pessoa tenta, falha e não entende.
 *   SUPERADMIN   nunca chega aqui: tem bypass em `useTenantAccess`.
 *
 * POR QUE O CAMINHO DE PAGAMENTO MORA AQUI, e não numa lista de rotas liberadas
 * no DashboardLayout: a alternativa seria deixar `/dashboard/settings` passar,
 * e essa tela tem sete abas — WhatsApp, Equipe, Segurança, Integrações. Liberar
 * a rota liberaria tudo isso junto, e obrigaria a uma segunda trava por aba,
 * fora de sincronia com a primeira. Aqui a superfície é um botão.
 * `create-checkout-session` resolve o tenant pelo JWT (`profiles.tenant_id`),
 * nunca pela Loja em foco, então o checkout funciona daqui sem sidebar nenhuma.
 *
 * CONTA NOVA x CONTA QUE VOLTOU A TRAVAR (teste grátis, entrega 2). O gerente
 * de uma Conta que NUNCA assinou vê a oferta do teste grátis ("Começar teste
 * grátis", sem cobrança hoje, data e valor da primeira cobrança, como cancelar);
 * o de uma Conta que já assinou vê "Assinar agora", como sempre. A pergunta é
 * feita à PRÓPRIA Conta do gerente (profile.tenant_id), nunca à Loja em foco:
 * uma Loja nunca tem assinatura e faria a Conta antiga parecer nova. Na dúvida
 * (carregando, erro), não se promete teste. A oferta só aparece com
 * TRIAL_OFFER_ENABLED ligada — ver src/lib/billing/trialOffer.ts.
 *
 * VOLTANDO DO STRIPE (?checkout=success): "Confirmando seu pagamento", e a tela
 * pergunta de novo a cada poucos segundos, passando por cima do cache de 30 min
 * (invalidação explícita). Quando o webhook libera a Conta, o DashboardLayout
 * troca esta tela pelo sistema sozinho. Nesse estado NÃO há botão de pagar:
 * um segundo checkout criaria uma segunda assinatura.
 *
 * QUEM É O DONO DA CONTA. Seria útil dizer ao gestor "fale com fulano", e
 * deliberadamente não dizemos: o RLS de `tenants` só entrega a linha da própria
 * Loja (`id = get_current_user_tenant_id()`), e o perfil do Gerente vive em
 * outro tenant. Nomeá-lo exigiria uma RPC nova em SECURITY DEFINER expondo
 * nome/e-mail de outra Conta a quem hoje não os alcança. Não vale o furo — a
 * saída é o contato de suporte abaixo.
 */
export const PaywallScreen = () => {
  const role = useRole();
  const { logout } = useAuth();
  const { tenant, refreshTenant, profile } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [enviando, setEnviando] = useState(false);
  const [reconferindo, setReconferindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [demorando, setDemorando] = useState(false);
  // Lido uma vez: é como a pessoa CHEGOU aqui (o Stripe devolve com ?checkout=).
  const [retorno] = useState(() => checkoutReturnFrom(window.location?.search));

  const podeAssinar = role === 'gerente' && CHECKOUT_ENABLED;

  // A Conta de cobrança do gerente já assinou alguma vez? Mesma regra do
  // servidor (trialDaysForCheckout): subscription_id preenchido = já assinou.
  const contaId =
    role === 'gerente' ? ((profile?.tenant_id as string | null | undefined) ?? null) : null;
  const perguntarConta = TRIAL_OFFER_ENABLED && podeAssinar && !!contaId;
  const consultaConta = useQuery({
    queryKey: [QUERY_KEYS.TENANT, 'paywall-conta', contaId],
    enabled: perguntarConta,
    retry: false,
    queryFn: async (): Promise<boolean | null> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, subscription_id')
        .eq('id', contaId as string)
        .maybeSingle();
      if (error) throw error;
      return data ? data.subscription_id == null : null;
    },
  });

  const variante = paywallVariant({
    role,
    checkoutEnabled: CHECKOUT_ENABLED,
    trialOfferEnabled: TRIAL_OFFER_ENABLED,
    contaNuncaAssinou: consultaConta.data ?? null,
    retorno,
  });

  // Confirmando: pergunta de novo a cada poucos segundos, por cima do cache.
  // `refreshTenant` muda de identidade a cada render do TenantProvider; pelo
  // ref, o intervalo não recomeça (e o limite de tempo continua contando).
  const recarregar = useRef({ refreshTenant, queryClient });
  recarregar.current = { refreshTenant, queryClient };
  useEffect(() => {
    if (variante !== 'confirmando') return;
    const inicio = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - inicio >= CONFIRMACAO_LIMITE_MS) {
        setDemorando(true);
        window.clearInterval(id);
        return;
      }
      const { refreshTenant: recarregarConta, queryClient: qc } = recarregar.current;
      void Promise.resolve(recarregarConta()).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: [QUERY_KEYS.TENANT, 'access-state'] });
    }, CONFIRMACAO_INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [variante]);

  // O tenant em mãos pode ser a Conta (gerente) ou a Loja (gestor/atendente).
  // Chamar a Loja de "Conta" no texto confunde exatamente quem está tentando
  // entender por que o sistema não abre.
  const nome = tenant?.name?.trim() || null;
  const ehConta = tenant?.kind === 'account';

  const handleAssinar = async () => {
    setFalha(null);
    setEnviando(true);
    try {
      const url = await criarSessaoDeCheckout();
      window.location.href = url;
      // Sem `setEnviando(false)`: a página está saindo para o Stripe.
    } catch (erro) {
      const mensagem =
        erro instanceof Error && erro.message
          ? erro.message
          : 'Não foi possível iniciar o pagamento.';
      // A frase fica NA TELA, não só num toast que some em segundos — é ela que
      // diz se o problema é a cobrança fora do ar, uma assinatura já ativa ou
      // permissão. Sem isso o botão volta a falhar calado, que é o defeito que
      // esta tela existe para consertar.
      setFalha(mensagem);
      toast({
        title: 'Não foi possível abrir o pagamento',
        description: mensagem,
        variant: 'destructive',
      });
      setEnviando(false);
    }
  };

  /**
   * "Já paguei". Cobre o pagamento feito em outra aba, a liberação manual que o
   * superadmin acabou de conceder e o 409 ("esta Conta já possui assinatura
   * ativa") — os três são a mesma coisa: a linha em cache está velha.
   */
  const handleReconferir = async () => {
    setReconferindo(true);
    try {
      await refreshTenant();
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TENANT] });
      toast({
        title: 'Acesso reconferido',
        description: 'Se o pagamento já foi confirmado, o sistema abre em seguida.',
      });
    } finally {
      setReconferindo(false);
    }
  };

  const dataDaCobranca = trialChargeDateLabel();
  const carregandoConta = perguntarConta && consultaConta.isLoading && variante !== 'confirmando';

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-2 border-brand-primary/20">
        {carregandoConta ? (
          // Não pisca "Acesso bloqueado" na cara de quem acabou de se cadastrar.
          <CardContent className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        ) : variante === 'confirmando' ? (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <CardTitle className="text-2xl">Confirmando seu pagamento</CardTitle>
                <FeatureHelp helpKey="page:paywall" docsLink={false} />
              </div>
              <CardDescription>
                Você voltou do Stripe. Assim que o pagamento for confirmado, o sistema abre
                sozinho. Costuma levar poucos segundos; não precisa recarregar a página.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {demorando ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Está demorando mais que o normal</AlertTitle>
                  <AlertDescription>
                    Se o cartão foi cadastrado, nada se perdeu. Clique em "Reconferir acesso" daqui a
                    alguns minutos. Não assine de novo: isso criaria uma segunda assinatura.
                  </AlertDescription>
                </Alert>
              ) : null}
              <Button
                variant="outline"
                onClick={handleReconferir}
                disabled={reconferindo}
                className="w-full gap-2"
              >
                {reconferindo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Reconferir acesso
              </Button>
              <ContatoDeSuporte titulo="Passou muito tempo e nada?" />
            </CardContent>
          </>
        ) : variante === 'teste-gratis' ? (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Gift className="h-7 w-7 text-muted-foreground" />
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <CardTitle className="text-2xl">Comece seu teste grátis de {TRIAL_DAYS} dias</CardTitle>
                <FeatureHelp helpKey="page:paywall" docsLink={false} />
              </div>
              <CardDescription>
                {nome && ehConta ? (
                  <>
                    A Conta <strong>{nome}</strong> está pronta.{' '}
                  </>
                ) : (
                  <>Sua Conta está pronta. </>
                )}
                Falta cadastrar o cartão para liberar o sistema para você e suas Lojas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ul className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm" data-testid="termos-do-teste">
                <li>
                  <strong>Hoje você não paga nada.</strong>
                </li>
                <li>
                  A primeira cobrança, de {PLAN_PRICE_LABEL}, acontece em{' '}
                  <strong>{dataDaCobranca}</strong>, no fim do teste. Depois, {PLAN_PRICE_LABEL} por mês
                  ({PLAN_NAME} com {INCLUDED_SLOTS} lojas incluídas).
                </li>
                <li>Para não ser cobrado, {COMO_CANCELAR_NO_TESTE}.</li>
              </ul>

              <ul className="space-y-2 text-sm">
                {PLAN_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>

              {retorno === 'cancel' ? <SaiuDoPagamento /> : null}

              {falha ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Pagamento não iniciado</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>{falha}</p>
                    <p className="text-xs">Se continuar assim, fale com o suporte pelo contato abaixo.</p>
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button
                onClick={handleAssinar}
                disabled={enviando}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Começar teste grátis
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                O cartão é cadastrado no ambiente seguro do Stripe.
              </p>

              <Button
                variant="outline"
                onClick={handleReconferir}
                disabled={reconferindo}
                className="w-full gap-2"
              >
                {reconferindo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Já cadastrei o cartão, reconferir acesso
              </Button>

              <ContatoDeSuporte titulo="Ficou com alguma dúvida?" />
            </CardContent>
          </>
        ) : (
          <>
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Lock className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <CardTitle className="text-2xl">Acesso bloqueado</CardTitle>
            <FeatureHelp helpKey="page:paywall" docsLink={false} />
          </div>
          <CardDescription>
            {podeAssinar ? (
              <>
                {nome && ehConta ? (
                  <>
                    A Conta <strong>{nome}</strong> não está ativa.{' '}
                  </>
                ) : (
                  <>Sua Conta não está ativa. </>
                )}
                Assine para liberar o sistema para todas as suas Lojas.
              </>
            ) : (
              <>
                {nome ? (
                  <>
                    A Conta responsável {ehConta ? 'por' : 'pela Loja'} <strong>{nome}</strong> não
                    está ativa.{' '}
                  </>
                ) : (
                  <>A Conta a que você pertence não está ativa. </>
                )}
                Por isso o sistema não abre.
              </>
            )}
          </CardDescription>
        </CardHeader>

        {podeAssinar ? (
          // ----------------------------------------------- GERENTE: pode pagar
          <CardContent className="space-y-5">
            <div className="text-center">
              <span className="text-4xl font-bold">{PLAN_PRICE_LABEL}</span>
              <span className="text-muted-foreground">/mês</span>
              <p className="text-sm text-muted-foreground mt-1">
                {PLAN_NAME} com {INCLUDED_SLOTS} lojas incluídas
              </p>
            </div>

            <ul className="space-y-2 text-sm">
              {PLAN_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>

            {retorno === 'cancel' ? <SaiuDoPagamento /> : null}

            {falha ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Pagamento não iniciado</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{falha}</p>
                  <p className="text-xs">
                    Se continuar assim, fale com o suporte pelo contato abaixo. Ninguém precisa
                    ficar sem acesso esperando o checkout.
                  </p>
                </AlertDescription>
              </Alert>
            ) : null}

            <Button
              onClick={handleAssinar}
              disabled={enviando}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Assinar agora por {PLAN_PRICE_LABEL}/mês
            </Button>

            <Button
              variant="outline"
              onClick={handleReconferir}
              disabled={reconferindo}
              className="w-full gap-2"
            >
              {reconferindo ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Já paguei, reconferir acesso
            </Button>

            <ContatoDeSuporte titulo="Prefere resolver com uma pessoa?" />
          </CardContent>
        ) : (
          // ------------------------------ GESTOR / ATENDENTE: nada a contratar
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Quem contrata o plano é a <strong>Conta</strong>, nunca a Loja. A Loja onde você
              trabalha herda o acesso dela, então não há nada para você assinar ou configurar
              nesta tela.
            </p>
            <p className="text-sm text-muted-foreground">
              Fale com a pessoa responsável pela Conta, o <strong>Gerente</strong>. Assim que o
              acesso for regularizado, todas as Lojas voltam juntas e você entra normalmente. Não
              é preciso liberar uma por uma.
            </p>

            <ContatoDeSuporte titulo="Não sabe quem responde pela Conta?" />
          </CardContent>
        )}

          </>
        )}

        <CardFooter className="justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-2"
            onClick={() => logout()}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

/** Aviso de quem voltou do Stripe pelo "voltar", sem concluir. */
const SaiuDoPagamento = () => (
  <Alert>
    <Info className="h-4 w-4" />
    <AlertDescription>Você saiu do pagamento antes de terminar. Nada foi cobrado.</AlertDescription>
  </Alert>
);

/**
 * A saída que nunca falha. Está nas duas variantes de propósito: o checkout
 * pode estar fora do ar e o Gerente pode não estar por perto — em nenhum dos
 * dois casos a tela pode virar um beco sem saída.
 */
const ContatoDeSuporte = ({ titulo }: { titulo: string }) => (
  <div className="rounded-md border bg-muted/40 p-3 space-y-2">
    <p className="text-xs font-medium">{titulo}</p>
    <a
      href={`mailto:${SUPORTE_EMAIL}`}
      className="inline-flex items-center gap-2 text-xs text-brand-primary hover:underline"
    >
      <Mail className="h-3.5 w-3.5" />
      Falar com o suporte por email
    </a>
    <p className="text-xs text-muted-foreground">{SUPORTE_EMAIL}</p>
  </div>
);

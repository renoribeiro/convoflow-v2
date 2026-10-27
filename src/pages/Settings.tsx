
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User,
  Shield,
  Database,
  CreditCard,
  Headset,
  CalendarClock,
  Zap,
  Users,
  KeyRound,
} from 'lucide-react';
import { AttendanceSettings } from '@/components/settings/AttendanceSettings';
import { VisibilitySettings } from '@/components/settings/VisibilitySettings';
import { RotationSettings } from '@/components/settings/RotationSettings';
import { ResponseRuleSettings } from '@/components/settings/ResponseRuleSettings';
import { FollowupSettings } from '@/components/settings/FollowupSettings';
import { QuickRepliesSettings } from '@/components/settings/QuickRepliesSettings';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { IntegrationSettings } from '@/components/settings/IntegrationSettings';
import { SubscriptionSettings } from '@/components/settings/SubscriptionSettings';
import { ApiKeysSettings } from '@/components/settings/ApiKeysSettings';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { useCapabilities, useIsGerente, useTenant } from '@/contexts/TenantContext';
import { API_ADDON_RELEASED } from '@/lib/api/release';
import { useApiAddonEstado } from '@/lib/api/addon';
import { abaDeConfiguracoes } from '@/lib/access/abasConfiguracoes';
import { useSearchParams } from 'react-router-dom';

/**
 * Ajuda contextual da aba aberta. "profile" fica de fora de propósito:
 * ProfileSettings já traz o próprio botão no cabeçalho do card, porque o mesmo
 * componente também atende a rota /dashboard/profile.
 */
const ajudaDaAba = (value: string): string | null =>
  value === 'profile' ? null : abaDeConfiguracoes(value).helpKey;

interface ContextoDasAbas {
  gerente: boolean;
  /** A API está ligada na Conta do usuário (api_addon_estado). */
  apiAtiva: boolean;
}

interface AbaConfig {
  value: string;
  icon: typeof User;
  render: () => JSX.Element;
}

/** Quem alcança a aba: a regra declarada em src/lib/access/abasConfiguracoes.ts. */
const abaVisivel = (value: string, capabilities: Record<string, boolean>, ctx: ContextoDasAbas): boolean => {
  const aba = abaDeConfiguracoes(value);
  if (aba.requer && !capabilities[aba.requer]) return false;
  if (aba.soGerenteComApi && !(ctx.gerente && (API_ADDON_RELEASED || ctx.apiAtiva))) return false;
  return true;
};

/**
 * As abas e quem alcança cada uma.
 *
 * ASSINATURA exige `billing.view`, que na matriz de capacidades é verdadeiro
 * só para gerente e superadmin. Quem responde pela cobrança é a CONTA, e a
 * Conta é do Gerente — Gestor e Atendente pertencem a uma Loja, que não assina
 * nada (ver a RPC tenant_access_state e a trava de `kind` no
 * create-checkout-session).
 *
 * Até 2026-08-18 esta lista era fixa e a aba aparecia para todo mundo: um
 * Atendente via o plano, o preço e um botão "Assinar Agora". O servidor já
 * recusava o checkout dele (`billing.manage` nega o atendente, e o tenant dele
 * não é `kind='account'`), então isto é conserto de VISIBILIDADE — nunca houve
 * risco de um atendente contratar de fato. Mas oferecer um botão que não
 * poderia funcionar é errado por si só.
 *
 * ATENDIMENTO fica sem `requer` de propósito: o AttendanceSettings já mostra as
 * preferências da Loja em modo leitura para quem não tem `store.admin`, e ver
 * como a Loja está configurada é útil para o atendente.
 */
const ABAS: AbaConfig[] = [
  { value: 'profile', icon: User, render: () => <ProfileSettings /> },
  { value: 'attendance', icon: Headset, render: () => <AttendanceSettings /> },
  // Sem `requer`, como ATENDIMENTO: o painel mostra os valores em modo leitura
  // para quem não tem `store.admin`. Saber o que a própria Loja esconde dele é
  // o que explica ao atendente por que a lista dele é menor que o número do
  // Dashboard.
  // Três cartões, quatro assuntos, na ordem em que uma conversa passa por
  // eles: quem vê o quê e quem pode transferir (VisibilitySettings), como as
  // conversas novas são distribuídas (RotationSettings, 20260915000001) e o
  // que acontece quando ninguém responde (ResponseRuleSettings, 20260916000001).
  // Os títulos numerados são o que segura a leitura com três cartões; um
  // quarto assunto aqui pede aba própria, não um quarto cartão.
  {
    value: 'visibility',
    icon: Users,
    render: () => (
      <div className="space-y-6">
        {/* O caminho inteiro (bot → rodízio → visibilidade → SLA → regra de
            tempo) explicado numa entrada só — os três cartões abaixo são as
            etapas dele. Ponto de montagem de concept:conversation-routing. */}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Como uma conversa chega ao atendente, do início ao fim</span>
          <FeatureHelp helpKey="concept:conversation-routing" />
        </p>
        <section aria-labelledby="escala-sec-1" className="space-y-2">
          <h2 id="escala-sec-1" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            1. Quem vê e quem transfere
          </h2>
          <VisibilitySettings />
        </section>
        <section aria-labelledby="escala-sec-2" className="space-y-2" data-tour="distribuicao">
          <h2 id="escala-sec-2" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            2. Como a conversa nova chega
          </h2>
          <RotationSettings />
        </section>
        <section aria-labelledby="escala-sec-3" className="space-y-2" data-tour="horario-funcionamento">
          <h2 id="escala-sec-3" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            3. Se ninguém responde
          </h2>
          <ResponseRuleSettings />
        </section>
      </div>
    ),
  },
  // Sem `requer` — e aqui não é só leitura para o atendente, é edição mesmo.
  // Quem atende o dia inteiro é quem sabe qual trecho está faltando, e o RLS
  // de `quick_replies` reflete isso: compara a Conta e nada mais.
  {
    value: 'quick-replies',
    icon: Zap,
    render: () => <QuickRepliesSettings />,
  },
  // Sem `requer`, pelo mesmo motivo de ATENDIMENTO: o painel já mostra os
  // valores em modo leitura para quem não tem `store.admin`, e saber o que a
  // Loja cancela sozinho muda como o atendente planeja o proprio follow-up.
  {
    value: 'followups',
    icon: CalendarClock,
    render: () => <FollowupSettings />,
  },
  {
    value: 'subscription',
    icon: CreditCard,
    render: () => <SubscriptionSettings />,
  },
  // A aba "Notificações" saiu em 2026-10-25 (achado 113 do checkup de
  // usabilidade, ops-privado/checkup-ux/RELATORIO_CHECKUP_UX.md): gravava
  // profiles.notification_prefs e nada no sistema lia essa preferência. A
  // coluna continua no banco. Para construir de verdade: o sino e as funções
  // que criam avisos precisam respeitar a escolha; aí a aba, o passo do
  // onboarding (migração nova em onboarding_checklist) e o tour voltam.
  { value: 'security', icon: Shield, render: () => <SecuritySettings /> },
  // Só quem tem store.admin: o servidor (RLS dos webhooks) recusa o resto, e o
  // atendente via um formulário que não salvava (achado 119 do checkup).
  { value: 'integrations', icon: Database, render: () => <IntegrationSettings /> },
  // Só o Gerente, e só com a API liberada para o público OU já ligada na Conta
  // dele (Conta de teste que o superadmin ligou). Gestor e Atendente nunca.
  {
    value: 'api',
    icon: KeyRound,
    render: () => <ApiKeysSettings />,
  },
];

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const capabilities = useCapabilities();
  const gerente = useIsGerente();
  const { profile } = useTenant();
  const contaId = gerente ? ((profile?.tenant_id as string | null | undefined) ?? null) : null;
  // Com a API liberada ao público a aba não depende do estado; sem isso só
  // consulta quando é Gerente.
  const estadoApi = useApiAddonEstado(contaId, gerente && !API_ADDON_RELEASED);
  const contexto: ContextoDasAbas = { gerente, apiAtiva: estadoApi.data?.ativo === true };

  const abasVisiveis = ABAS.filter((aba) => abaVisivel(aba.value, capabilities, contexto));

  /**
   * Aba pedida pela URL, se ela existir PARA ESTE CARGO. Sem esta checagem, um
   * `?tab=subscription` digitado à mão abriria o painel de cobrança mesmo sem a
   * aba na barra — esconder o botão não é esconder a tela.
   */
  const pedida = searchParams.get('tab');
  const currentTab =
    pedida && abasVisiveis.some((a) => a.value === pedida) ? pedida : 'profile';

  // Aba controlada pela URL: sobrevive a remontagens (foco da janela, etc.) e
  // permite deep-link (ex.: /dashboard/settings?tab=integrations).
  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        prev.set('tab', value);
        return prev;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        helpKey="page:settings"
        description="Seu perfil e o jeito de trabalhar da Loja: atendimento, distribuição, respostas rápidas e mais"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Configurações' }
        ]}
      />

      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
        {/* Quebra de linha em vez de grade de N colunas iguais: com nove abas
            os rótulos ("Distribuição e transferência", "Respostas rápidas") passavam
            por cima dos vizinhos até 1440px. Quebrar mantém todas visíveis;
            rolar esconderia aba, que é o que se quer evitar numa tela de
            configuração. */}
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {abasVisiveis.map((aba) => {
            const Icon = aba.icon;
            return (
              <TabsTrigger key={aba.value} value={aba.value} className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {abaDeConfiguracoes(aba.value).label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {ajudaDaAba(currentTab) && (
          <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
            <span>Como funciona esta aba</span>
            <FeatureHelp helpKey={ajudaDaAba(currentTab) as string} />
          </div>
        )}

        {abasVisiveis.map((aba) => (
          <TabsContent key={aba.value} value={aba.value}>
            {aba.render()}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

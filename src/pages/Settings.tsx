
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User,
  Bell,
  Shield,
  Database,
  CreditCard,
  Headset,
  CalendarClock,
  Zap,
  Users,
} from 'lucide-react';
import { AttendanceSettings } from '@/components/settings/AttendanceSettings';
import { VisibilitySettings } from '@/components/settings/VisibilitySettings';
import { RotationSettings } from '@/components/settings/RotationSettings';
import { ResponseRuleSettings } from '@/components/settings/ResponseRuleSettings';
import { FollowupSettings } from '@/components/settings/FollowupSettings';
import { QuickRepliesSettings } from '@/components/settings/QuickRepliesSettings';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { IntegrationSettings } from '@/components/settings/IntegrationSettings';
import { SubscriptionSettings } from '@/components/settings/SubscriptionSettings';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { useCapabilities } from '@/contexts/TenantContext';
import { Capability } from '@/types/userHierarchy';
import { useSearchParams } from 'react-router-dom';

/**
 * Ajuda contextual de cada aba. "profile" fica de fora de propósito:
 * ProfileSettings já traz o próprio botão no cabeçalho do card, porque o mesmo
 * componente também atende a rota /dashboard/profile.
 */
const TAB_HELP_KEYS: Record<string, string> = {
  attendance: 'page:settings-attendance',
  visibility: 'page:settings-visibility',
  'quick-replies': 'page:settings-quick-replies',
  followups: 'page:settings-followups',
  subscription: 'page:settings-subscription',
  notifications: 'page:settings-notifications',
  security: 'page:settings-security',
  integrations: 'page:settings-integrations',
};

interface AbaConfig {
  value: string;
  label: string;
  icon: typeof User;
  /** Capacidade exigida para a aba existir. Ausente = todo mundo vê. */
  requer?: Capability;
  render: () => JSX.Element;
}

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
  { value: 'profile', label: 'Perfil', icon: User, render: () => <ProfileSettings /> },
  { value: 'attendance', label: 'Atendimento', icon: Headset, render: () => <AttendanceSettings /> },
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
    label: 'Escala/Transferência',
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
        <section aria-labelledby="escala-sec-2" className="space-y-2">
          <h2 id="escala-sec-2" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            2. Como a conversa nova chega
          </h2>
          <RotationSettings />
        </section>
        <section aria-labelledby="escala-sec-3" className="space-y-2">
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
    label: 'Respostas rápidas',
    icon: Zap,
    render: () => <QuickRepliesSettings />,
  },
  // Sem `requer`, pelo mesmo motivo de ATENDIMENTO: o painel já mostra os
  // valores em modo leitura para quem não tem `store.admin`, e saber o que a
  // Loja cancela sozinho muda como o atendente planeja o proprio follow-up.
  {
    value: 'followups',
    label: 'Follow-ups',
    icon: CalendarClock,
    render: () => <FollowupSettings />,
  },
  {
    value: 'subscription',
    label: 'Assinatura',
    icon: CreditCard,
    requer: 'billing.view',
    render: () => <SubscriptionSettings />,
  },
  { value: 'notifications', label: 'Notificações', icon: Bell, render: () => <NotificationSettings /> },
  { value: 'security', label: 'Segurança', icon: Shield, render: () => <SecuritySettings /> },
  { value: 'integrations', label: 'Integrações', icon: Database, render: () => <IntegrationSettings /> },
];

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const capabilities = useCapabilities();

  const abasVisiveis = ABAS.filter((aba) => !aba.requer || capabilities[aba.requer]);

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
        description="Gerencie as configurações da sua conta e preferências do sistema"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Configurações' }
        ]}
      />

      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
        {/* Quebra de linha em vez de grade de N colunas iguais: com nove abas
            os rótulos ("Escala/Transferência", "Respostas rápidas") passavam
            por cima dos vizinhos até 1440px. Quebrar mantém todas visíveis;
            rolar esconderia aba, que é o que se quer evitar numa tela de
            configuração. */}
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {abasVisiveis.map((aba) => {
            const Icon = aba.icon;
            return (
              <TabsTrigger key={aba.value} value={aba.value} className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {aba.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TAB_HELP_KEYS[currentTab] && (
          <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
            <span>Como funciona esta aba</span>
            <FeatureHelp helpKey={TAB_HELP_KEYS[currentTab]} />
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

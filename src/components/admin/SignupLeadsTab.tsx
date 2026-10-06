/**
 * Administração › Cadastros — quem se cadastrou pelo site, e o que aconteceu.
 *
 * É daqui que vendas liga para quem não conseguiu terminar: convite que não
 * saiu (limite de e-mail, endereço recusado, erro) e cadastro interrompido.
 * Nada disso se perde — a ficha fica mesmo quando a Conta é desfeita ou limpa.
 *
 * Também mostra o termômetro do envio de e-mail (auth_email_failures): quando
 * as falhas por limite começam a aparecer, é hora de seguir
 * docs/RUNBOOK_trocar_envio_email.md.
 *
 * Só o superadmin lê as duas tabelas (RLS, migração 20260926000002).
 */
import { useQuery } from '@tanstack/react-query';
import { Mail, Phone, UserPlus, AlertTriangle, MailWarning } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/shared/ResponsiveTable';
import { supabase } from '@/integrations/supabase/client';
import { PUBLIC_SIGNUP_ENABLED } from '@/lib/signup/release';
import {
  failureReasonLabel,
  formatPhoneBR,
  leadSituation,
  type LeadTenantInfo,
  type LeadTone,
  type SignupLead,
} from '@/lib/signup/leadStatus';

// Tabelas novas, fora dos tipos gerados em types.ts.
type ClienteSolto = {
  from(t: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const db = supabase as unknown as ClienteSolto;

interface FalhaDeEnvio {
  created_at: string;
  source: string;
  reason: 'quota' | 'not_authorized' | 'other';
}

const TOM: Record<LeadTone, string> = {
  ok: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300',
  neutral: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  attention: 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
  muted: 'bg-muted text-muted-foreground',
};

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export function SignupLeadsTab() {
  const fichas = useQuery({
    queryKey: ['signup-requests', 'admin'],
    queryFn: async () => {
      const { data, error } = await db
        .from('signup_requests')
        .select(
          'id, created_at, first_name, last_name, email, company_name, phone, terms_version, privacy_version, terms_accepted_at, status, failure_code, failure_detail, tenant_id, cleaned_at',
        )
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as SignupLead[];
    },
  });

  const contaIds = [...new Set((fichas.data ?? []).map((f) => f.tenant_id).filter(Boolean))] as string[];
  const contas = useQuery({
    queryKey: ['signup-requests', 'admin-tenants', contaIds.join(',')],
    enabled: contaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, subscription_status')
        .in('id', contaIds);
      if (error) throw error;
      const mapa = new Map<string, LeadTenantInfo>();
      for (const t of data ?? []) mapa.set(t.id, { subscription_status: t.subscription_status });
      return mapa;
    },
  });

  const falhas = useQuery({
    queryKey: ['signup-requests', 'admin-email-failures'],
    queryFn: async () => {
      const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await db
        .from('auth_email_failures')
        .select('created_at, source, reason')
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as FalhaDeEnvio[];
    },
  });

  const agora = Date.now();
  const em = (dias: number) => (f: { created_at: string }) =>
    agora - new Date(f.created_at).getTime() <= dias * 24 * 60 * 60 * 1000;

  const lista = fichas.data ?? [];
  const cadastros30 = lista.filter(em(30)).length;
  const paraContato = lista.filter((f) => leadSituation(f, null).needsContact).length;
  const falhas7 = (falhas.data ?? []).filter(em(7));
  const limite7 = falhas7.filter((f) => f.reason === 'quota').length;
  const recusa7 = falhas7.filter((f) => f.reason === 'not_authorized').length;

  const colunas: ResponsiveColumn<SignupLead>[] = [
    {
      key: 'pessoa',
      header: 'Pessoa',
      card: 'title',
      cell: (f) => (
        <div className="min-w-0">
          <div className="font-medium">
            {f.first_name} {f.last_name}
          </div>
          <div className="text-xs text-muted-foreground">{f.company_name}</div>
        </div>
      ),
    },
    {
      key: 'contato',
      header: 'Contato',
      card: 'field',
      cell: (f) => (
        <div className="space-y-0.5 text-sm">
          <a href={`mailto:${f.email}`} className="flex items-center gap-1 hover:underline">
            <Mail className="h-3.5 w-3.5 flex-shrink-0" /> <span className="break-all">{f.email}</span>
          </a>
          <a href={`tel:+55${f.phone.replace(/^55/, '')}`} className="flex items-center gap-1 hover:underline">
            <Phone className="h-3.5 w-3.5 flex-shrink-0" /> {formatPhoneBR(f.phone)}
          </a>
        </div>
      ),
    },
    {
      key: 'situacao',
      header: 'Situação',
      card: 'badge',
      cell: (f) => {
        const s = leadSituation(f, f.tenant_id ? contas.data?.get(f.tenant_id) ?? null : null);
        const motivo = f.status === 'invite_failed' ? failureReasonLabel(f.failure_code) : null;
        return (
          <div className="space-y-1">
            <Badge variant="outline" className={TOM[s.tone]}>
              {s.label}
            </Badge>
            {motivo ? <div className="text-xs text-muted-foreground">{motivo}</div> : null}
          </div>
        );
      },
    },
    {
      key: 'quando',
      header: 'Cadastrou em',
      card: 'field',
      cell: (f) => <span className="text-sm whitespace-nowrap">{dataHora(f.created_at)}</span>,
    },
    {
      key: 'aceite',
      header: 'Aceite dos Termos',
      card: 'field',
      hideBelow: '2xl',
      cell: (f) => (
        <span className="text-xs text-muted-foreground">
          Termos {f.terms_version} · Política {f.privacy_version}
          <br />
          em {dataHora(f.terms_accepted_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <span>Como funciona esta aba</span>
        <FeatureHelp helpKey="page:admin-signups" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex flex-wrap items-center gap-2">
            Cadastro pelo site
            <Badge variant="outline" className={PUBLIC_SIGNUP_ENABLED ? TOM.ok : TOM.muted}>
              {PUBLIC_SIGNUP_ENABLED ? 'ligado' : 'desligado'}
            </Badge>
          </CardTitle>
          <CardDescription>
            {PUBLIC_SIGNUP_ENABLED
              ? 'Os botões "Começar teste grátis" da página de vendas levam ao formulário de cadastro.'
              : 'Os botões da página de vendas levam ao login; ninguém se cadastra sozinho ainda. Esta lista fica vazia até o cadastro ser ligado.'}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cadastros (30 dias)</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cadastros30}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Para vendas ligar</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paraContato}</div>
            <p className="text-xs text-muted-foreground">Convite que não saiu ou cadastro interrompido</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">E-mails de login barrados (7 dias)</CardTitle>
            <MailWarning className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{limite7 + recusa7}</div>
            <p className="text-xs text-muted-foreground">
              {limite7} por limite por hora · {recusa7} por endereço recusado. Todos os e-mails de
              login contam: convites, redefinição de senha e cadastro.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cadastros recebidos</CardTitle>
          <CardDescription>Os mais recentes primeiro (até 300).</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            ariaLabel="Cadastros pelo site"
            rows={lista}
            rowKey={(f) => f.id}
            loading={fichas.isLoading}
            error={fichas.isError ? 'Não foi possível carregar os cadastros.' : undefined}
            empty="Nenhum cadastro pelo site ainda."
            columns={colunas}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default SignupLeadsTab;

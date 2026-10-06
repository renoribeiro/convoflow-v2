// =============================================================================
// A situação de um cadastro pelo site, em pt-BR, para a aba Admin › Cadastros
// =============================================================================

export type LeadStatus =
  | 'received'
  | 'email_exists'
  | 'invited'
  | 'invite_failed'
  | 'abandoned'
  | 'expired_unconfirmed'
  | 'expired_unpaid';

export type LeadFailureCode =
  | 'email_quota'
  | 'email_not_authorized'
  | 'email_exists'
  | 'invite_error'
  | 'processing_error';

export interface SignupLead {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  company_name: string;
  phone: string;
  terms_version: string;
  privacy_version: string;
  terms_accepted_at: string;
  status: LeadStatus;
  failure_code: LeadFailureCode | null;
  failure_detail: string | null;
  tenant_id: string | null;
  cleaned_at: string | null;
}

export interface LeadTenantInfo {
  subscription_status: string | null;
}

export type LeadTone = 'ok' | 'neutral' | 'attention' | 'muted';

export interface LeadSituation {
  label: string;
  tone: LeadTone;
  /** Vendas deveria procurar esta pessoa (o cadastro não chegou ao fim). */
  needsContact: boolean;
}

const MOTIVO: Record<LeadFailureCode, string> = {
  email_quota: 'o envio de e-mail atingiu o limite por hora',
  email_not_authorized: 'o envio de e-mail recusou o endereço',
  email_exists: 'o e-mail já tinha login',
  invite_error: 'erro ao enviar o convite',
  processing_error: 'o processamento parou no meio',
};

export function failureReasonLabel(code: LeadFailureCode | null): string | null {
  return code ? MOTIVO[code] ?? null : null;
}

export function leadSituation(lead: Pick<SignupLead, 'status' | 'failure_code'>, tenant: LeadTenantInfo | null): LeadSituation {
  switch (lead.status) {
    case 'received':
      return { label: 'Processando', tone: 'neutral', needsContact: false };
    case 'email_exists':
      return { label: 'E-mail já tinha login', tone: 'muted', needsContact: false };
    case 'invited': {
      const s = tenant?.subscription_status ?? null;
      if (s === 'active') return { label: 'Assinante', tone: 'ok', needsContact: false };
      if (s === 'trialing') return { label: 'Em teste grátis', tone: 'ok', needsContact: false };
      if (s === 'past_due') return { label: 'Pagamento pendente', tone: 'attention', needsContact: false };
      if (s) return { label: 'Assinatura encerrada', tone: 'muted', needsContact: false };
      return { label: 'Convite enviado', tone: 'neutral', needsContact: false };
    }
    case 'invite_failed':
      return {
        label: lead.failure_code === 'email_exists' ? 'E-mail já tinha login' : 'Convite não saiu',
        tone: lead.failure_code === 'email_exists' ? 'muted' : 'attention',
        needsContact: lead.failure_code !== 'email_exists',
      };
    case 'abandoned':
      return { label: 'Cadastro interrompido', tone: 'attention', needsContact: true };
    case 'expired_unconfirmed':
      return { label: 'Removido: não aceitou o convite em 48 h', tone: 'muted', needsContact: false };
    case 'expired_unpaid':
      return { label: 'Removido: não assinou em 30 dias', tone: 'muted', needsContact: false };
    default:
      return { label: String(lead.status), tone: 'muted', needsContact: false };
  }
}

/** "11999990000" → "(11) 99999-0000"; o resto volta como veio. */
export function formatPhoneBR(digits: string): string {
  const d = digits.replace(/\D/g, '');
  const local = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits;
}

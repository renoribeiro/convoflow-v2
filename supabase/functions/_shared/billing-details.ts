// =============================================================================
// billing-details.ts — "Dados para a nota fiscal" no servidor (nota fiscal, parte 1)
// =============================================================================
// Só decisão, zero I/O — mesma convenção de subscription-state.ts, para o
// Vitest testar sem Deno. Quem faz I/O é o create-checkout-session.
//
// O checkout só sai com a linha da Conta em `tenant_billing_details`
// (migração 20261013000001). Quem garante que a linha é VÁLIDA é o gatilho do
// banco (normaliza e recusa); aqui só se confere que ela existe e está
// inteira. A cópia do navegador (src/lib/billing/dadosFiscais.ts) é vigiada
// por src/lib/billing/dadosFiscaisParity.test.ts.
//
// PRIVACIDADE: nada aqui monta texto com o documento. O CPF/CNPJ vai para o
// cliente do Stripe só no `metadata` (não aparece em fatura, recibo nem
// e-mail do Stripe), nunca num campo público.
// =============================================================================

export interface BillingDetailsRow {
  person_type?: string | null;
  tax_id?: string | null;
  legal_name?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  city_ibge_code?: string | null;
  state?: string | null;
  invoice_email?: string | null;
}

/** A frase do 422 quando falta a linha (o navegador mostra como veio). */
export const BILLING_DETAILS_MISSING_MESSAGE =
  'Antes de assinar, preencha os dados para a nota fiscal (CPF ou CNPJ, nome e endereço). Eles ficam na tela de assinatura, logo acima do botão.';

const preenchido = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

/**
 * O que falta para a linha valer (lista vazia = pode assinar). O código IBGE
 * não entra: pode faltar quando o endereço foi digitado à mão, e a emissão
 * (parte 2) resolve pela cidade e UF.
 */
export function billingDetailsMissing(row: BillingDetailsRow | null | undefined): string[] {
  if (!row) return ['linha'];
  const faltando: string[] = [];
  const tipo = row.person_type;
  if (tipo !== 'cpf' && tipo !== 'cnpj') faltando.push('person_type');
  const doc = typeof row.tax_id === 'string' ? row.tax_id : '';
  if (tipo === 'cpf' && !/^[0-9]{11}$/.test(doc)) faltando.push('tax_id');
  if (tipo === 'cnpj' && !/^[0-9A-Z]{12}[0-9]{2}$/.test(doc)) faltando.push('tax_id');
  for (const campo of ['legal_name', 'street', 'number', 'district', 'city', 'state', 'invoice_email'] as const) {
    if (!preenchido(row[campo])) faltando.push(campo);
  }
  if (!/^[0-9]{8}$/.test(row.cep ?? '')) faltando.push('cep');
  return faltando;
}

/**
 * Os parâmetros de `stripe.customers.update` a partir da linha: nome,
 * e-mail e endereço vão nos campos do cliente (aparecem na fatura do Stripe);
 * o documento vai SÓ no metadata.
 *
 * `cpf_cnpj` é o nome que o app de nota fiscal da NFE.io no Stripe também lê —
 * deixa a parte 2 livre para usar o provedor ou o portal do governo.
 */
export function stripeCustomerUpdate(row: BillingDetailsRow, tenantId: string): Record<string, unknown> {
  const linha1 = [row.street?.trim(), row.number?.trim()].filter(Boolean).join(', ');
  const linha2 = [row.complement?.trim(), row.district?.trim()].filter(Boolean).join(' - ');
  return {
    name: row.legal_name?.trim() || undefined,
    email: row.invoice_email?.trim() || undefined,
    address: {
      line1: linha1 || undefined,
      line2: linha2 || undefined,
      city: row.city?.trim() || undefined,
      state: row.state?.trim() || undefined,
      postal_code: row.cep ?? undefined,
      country: 'BR',
    },
    metadata: {
      tenant_id: tenantId,
      tipo_pessoa: row.person_type ?? '',
      cpf_cnpj: row.tax_id ?? '',
      codigo_ibge: row.city_ibge_code ?? '',
    },
  };
}

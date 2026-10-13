/**
 * create-checkout-session recusa assinar sem os "Dados para a nota fiscal"
 * (nota fiscal, parte 1), e o que vai para o cliente do Stripe.
 *
 * A regra é pura (supabase/functions/_shared/billing-details.ts). A ordem no
 * handler — recusar ANTES de criar qualquer coisa no Stripe — é conferida no
 * próprio arquivo da edge function. Documentos inventados.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BILLING_DETAILS_MISSING_MESSAGE,
  billingDetailsMissing,
  stripeCustomerUpdate,
  type BillingDetailsRow,
} from '../../../supabase/functions/_shared/billing-details.ts';
import { dadosFiscaisCompletos, type DadosFiscais } from './dadosFiscais';

const LINHA: BillingDetailsRow = {
  person_type: 'cpf',
  tax_id: '11144477735',
  legal_name: 'Fulano de Teste',
  cep: '60000000',
  street: 'Rua Exemplo',
  number: '100',
  complement: null,
  district: 'Centro',
  city: 'Fortaleza',
  city_ibge_code: '2304400',
  state: 'CE',
  invoice_email: 'nota@exemplo.com.br',
};

describe('billingDetailsMissing (servidor)', () => {
  it('sem linha: recusa, com a frase da tela', () => {
    expect(billingDetailsMissing(null)).toEqual(['linha']);
    expect(BILLING_DETAILS_MISSING_MESSAGE).toMatch(/dados para a nota fiscal/);
    expect(BILLING_DETAILS_MISSING_MESSAGE).toMatch(/CPF ou CNPJ/);
  });

  it('linha completa passa; sem código IBGE e sem complemento também', () => {
    expect(billingDetailsMissing(LINHA)).toEqual([]);
    expect(billingDetailsMissing({ ...LINHA, city_ibge_code: null, complement: null })).toEqual([]);
    expect(billingDetailsMissing({ ...LINHA, person_type: 'cnpj', tax_id: '12ABC34501DE35' })).toEqual([]);
  });

  it.each([
    ['person_type', { person_type: 'rg' }],
    ['tax_id', { tax_id: '111.444.777-35' }],
    ['tax_id', { person_type: 'cnpj', tax_id: '11144477735' }],
    ['legal_name', { legal_name: '  ' }],
    ['street', { street: '' }],
    ['number', { number: null }],
    ['district', { district: '' }],
    ['city', { city: '' }],
    ['state', { state: '' }],
    ['invoice_email', { invoice_email: '' }],
    ['cep', { cep: '6000000' }],
  ] as const)('falta %s', (campo, troca) => {
    expect(billingDetailsMissing({ ...LINHA, ...troca })).toContain(campo);
  });

  it('servidor e navegador concordam sobre linhas que o banco aceitaria', () => {
    const casos: BillingDetailsRow[] = [
      LINHA,
      { ...LINHA, city_ibge_code: null },
      { ...LINHA, street: '' },
      { ...LINHA, invoice_email: '' },
      { ...LINHA, cep: '' },
      { ...LINHA, person_type: 'cnpj', tax_id: '11222333000181', legal_name: 'Fulano Ltda' },
    ];
    for (const c of casos) {
      expect(billingDetailsMissing(c).length === 0).toBe(dadosFiscaisCompletos(c as unknown as DadosFiscais));
    }
  });
});

describe('stripeCustomerUpdate', () => {
  it('nome, e-mail e endereço nos campos do cliente; o documento SÓ no metadata', () => {
    const p = stripeCustomerUpdate({ ...LINHA, complement: 'Sala 2' }, 'aaaaaaaa-0000-4000-8000-000000000001');
    expect(p).toMatchObject({
      name: 'Fulano de Teste',
      email: 'nota@exemplo.com.br',
      address: { line1: 'Rua Exemplo, 100', line2: 'Sala 2 - Centro', city: 'Fortaleza', state: 'CE', postal_code: '60000000', country: 'BR' },
      metadata: { tenant_id: 'aaaaaaaa-0000-4000-8000-000000000001', tipo_pessoa: 'cpf', cpf_cnpj: '11144477735', codigo_ibge: '2304400' },
    });
    const { metadata, ...publico } = p as { metadata: unknown };
    expect(JSON.stringify(publico)).not.toContain('11144477735');
    expect(metadata).toBeDefined();
    // nada de tax_id_data / tax_ids: aparece em fatura e recibo do Stripe
    expect(Object.keys(p)).not.toContain('tax_id_data');
  });
});

describe('a edge function recusa ANTES de mexer no Stripe', () => {
  const fonte = fs.readFileSync(
    path.resolve(__dirname, '../../../supabase/functions/create-checkout-session/index.ts'),
    'utf8',
  );

  it('lê tenant_billing_details e devolve 422 com a frase', () => {
    expect(fonte).toContain('.from("tenant_billing_details")');
    expect(fonte).toMatch(/billingDetailsMissing\([\s\S]*?status: 422/);
    expect(fonte).toContain('BILLING_DETAILS_MISSING_MESSAGE');
  });

  it('a recusa vem antes de criar o cliente e a sessão no Stripe', () => {
    const recusa = fonte.indexOf('billingDetailsMissing(dadosFiscais');
    expect(recusa).toBeGreaterThan(0);
    expect(recusa).toBeLessThan(fonte.indexOf('await clienteDaConta('));
    expect(recusa).toBeLessThan(fonte.indexOf('stripe.checkout.sessions.create('));
    expect(fonte.indexOf('stripe.customers.update(')).toBeGreaterThan(fonte.indexOf('await clienteDaConta('));
  });

  it('não registra o documento em log', () => {
    const logs = fonte.match(/console\.(log|warn|error)\([^;]*\);/g) ?? [];
    for (const l of logs) expect(l).not.toMatch(/dadosFiscais[^E]|tax_id/);
  });
});

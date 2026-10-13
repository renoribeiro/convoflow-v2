/**
 * O formulário "Dados para a nota fiscal" (nota fiscal, parte 1).
 *
 * Trava: máscara do documento, o CEP preenche o endereço, a busca que falha
 * deixa preencher à mão, os erros aparecem por campo sem repetir o número, e
 * nada do que é digitado vai para o console. Documento e endereço inventados.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { buscarCep } = vi.hoisted(() => ({ buscarCep: vi.fn() }));
vi.mock('@/lib/billing/cep', async (original) => {
  const real = await original<typeof import('@/lib/billing/cep')>();
  return { ...real, buscarCep };
});

import { DadosFiscaisForm } from './DadosFiscaisForm';
import { FORMULARIO_VAZIO, type FormularioDadosFiscais } from '@/lib/billing/dadosFiscais';

const onSalvar = vi.fn();
const espioes: Array<ReturnType<typeof vi.spyOn>> = [];

const montar = (inicial: Partial<FormularioDadosFiscais> = {}) =>
  render(
    <DadosFiscaisForm
      inicial={{ ...FORMULARIO_VAZIO, invoice_email: 'eu@exemplo.com.br', ...inicial }}
      salvando={false}
      onSalvar={onSalvar}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  buscarCep.mockResolvedValue({
    ok: true,
    fonte: 'viacep',
    endereco: { street: 'Rua Exemplo', district: 'Centro', city: 'Fortaleza', state: 'CE', city_ibge_code: '2304400' },
  });
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) espioes.push(vi.spyOn(console, m));
});

afterEach(() => {
  // nada do que foi digitado (documento) passou pelo console
  for (const e of espioes) {
    for (const chamada of e.mock.calls) expect(JSON.stringify(chamada)).not.toMatch(/111\.?444\.?777|11222333/);
  }
  espioes.splice(0).forEach((e) => e.mockRestore());
});

// Muita digitação por teste: folga para a suíte completa numa máquina carregada.
describe('DadosFiscaisForm', { timeout: 30_000 }, () => {
  it('máscara do CNPJ e do CPF; trocar o tipo reformata', async () => {
    const user = userEvent.setup();
    montar();
    const doc = screen.getByLabelText('CNPJ');
    await user.type(doc, '11222333000181');
    expect(doc).toHaveValue('11.222.333/0001-81');
    await user.click(screen.getByRole('radio', { name: 'Pessoa física (CPF)' }));
    expect(screen.getByLabelText('CPF')).toHaveValue('112.223.330-00');
    expect(screen.getByLabelText('Nome completo')).toBeInTheDocument();
  });

  it('o CEP preenche rua, bairro, cidade e UF (e guarda o código IBGE)', async () => {
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByLabelText('CEP'), '60000000');
    await waitFor(() => expect(screen.getByLabelText('Cidade')).toHaveValue('Fortaleza'));
    expect(buscarCep).toHaveBeenCalledWith('60000000');
    expect(screen.getByLabelText('CEP')).toHaveValue('60000-000');
    expect(screen.getByLabelText('Rua, avenida ou logradouro')).toHaveValue('Rua Exemplo');
    expect(screen.getByLabelText('Bairro')).toHaveValue('Centro');
    expect(screen.getByLabelText('UF')).toHaveValue('CE');

    await user.type(screen.getByLabelText('CNPJ'), '11222333000181');
    await user.type(screen.getByLabelText('Razão social'), 'Fulano Comércio Ltda');
    await user.type(screen.getByLabelText('Número'), '100');
    await user.click(screen.getByRole('button', { name: 'Salvar dados' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({
        person_type: 'cnpj',
        tax_id: '11.222.333/0001-81',
        cep: '60000-000',
        city_ibge_code: '2304400',
        state: 'CE',
        invoice_email: 'eu@exemplo.com.br',
      }),
    );
  });

  it('busca do CEP fora do ar: avisa e deixa preencher à mão', async () => {
    buscarCep.mockResolvedValue({ ok: false, motivo: 'indisponivel' });
    const user = userEvent.setup();
    montar({ person_type: 'cpf' });
    await user.type(screen.getByLabelText('CEP'), '60000000');
    expect(await screen.findByText(/não respondeu agora/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('CPF'), '11144477735');
    await user.type(screen.getByLabelText('Nome completo'), 'Fulano de Teste');
    await user.type(screen.getByLabelText('Rua, avenida ou logradouro'), 'Rua Exemplo');
    await user.type(screen.getByLabelText('Número'), 'S/N');
    await user.type(screen.getByLabelText('Bairro'), 'Centro');
    await user.type(screen.getByLabelText('Cidade'), 'Fortaleza');
    await user.selectOptions(screen.getByLabelText('UF'), 'CE');
    await user.click(screen.getByRole('button', { name: 'Salvar dados' }));
    expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ city: 'Fortaleza', state: 'CE', city_ibge_code: '', number: 'S/N' }));
  });

  it('salvar vazio: um erro por campo, sem repetir o número, e nada é salvo', async () => {
    const user = userEvent.setup();
    montar({ person_type: 'cpf' });
    await user.type(screen.getByLabelText('CPF'), '11144477736');
    await user.click(screen.getByRole('button', { name: 'Salvar dados' }));
    expect(onSalvar).not.toHaveBeenCalled();
    expect(screen.getByText('CPF inválido: confira os números.')).toBeInTheDocument();
    expect(screen.getByText('Informe o nome completo.')).toBeInTheDocument();
    expect(screen.getByText('O CEP tem 8 números.')).toBeInTheDocument();
    expect(screen.getByText('Escolha o estado (UF).')).toBeInTheDocument();
    // depois de corrigir, o erro some na hora
    await user.clear(screen.getByLabelText('CPF'));
    await user.type(screen.getByLabelText('CPF'), '11144477735');
    expect(screen.queryByText('CPF inválido: confira os números.')).toBeNull();
  });

  it('mostra o erro que veio do servidor', () => {
    render(
      <DadosFiscaisForm inicial={FORMULARIO_VAZIO} salvando={false} onSalvar={onSalvar} erroDoServidor="Só o Gerente da Conta pode salvar os dados para a nota fiscal." />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Só o Gerente da Conta');
  });
});

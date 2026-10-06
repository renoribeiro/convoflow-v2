/**
 * Aba Configurações › Escala/Transferência — cartão "Transferência por tempo
 * sem resposta" (migração 20260916000001).
 *
 * O que a tela precisa garantir:
 *  - nasce desligada, com 60 min e 3 transferências, e "Tudo salvo";
 *  - desligada, os campos não aparecem; ligada, aparecem com o horário padrão
 *    (seg–sex 09–18, Brasília) e o exemplo "sexta 17:50 → segunda 09:50";
 *  - minutos fora da faixa bloqueiam o salvar com a mensagem do lib;
 *  - fechar todos os dias bloqueia o salvar;
 *  - salvar manda as QUATRO chaves de uma vez (business_hours inteiro);
 *  - a prévia mostra os números que a RPC devolveu;
 *  - atendente vê só a frase de leitura; sem `store.admin` é só leitura.
 * Quem faz valer a regra é o banco (docs/teste_regra_tempo_resposta.sql).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { updateTenantSettings, estado } = vi.hoisted(() => ({
  updateTenantSettings: vi.fn(),
  estado: {
    settings: {} as Record<string, unknown>,
    canEdit: true,
    canManage: true,
    loading: false,
    preview: null as null | { turns: number; breached: number; never_replied: number },
  },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: { id: 'loja-1', settings: estado.settings },
    profile: { id: 'p-gestor', role: 'gestor' },
    loading: estado.loading,
    updateTenantSettings,
  }),
  useCan: () => estado.canEdit,
}));

vi.mock('@/hooks/useConversationRotation', () => ({
  useCanManageRotation: () => estado.canManage,
}));

vi.mock('@/hooks/useResponseRule', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useResponseRule')>();
  return {
    ...actual,
    useResponseRulePreview: () => ({ data: estado.preview, isLoading: false }),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ResponseRuleSettings } from './ResponseRuleSettings';

const abrir = () => render(<ResponseRuleSettings />);
const chave = () => screen.getByRole('switch', { name: /Transferir conversa sem resposta/i });
const salvar = () => screen.getByRole('button', { name: /salvar regra/i });

beforeEach(() => {
  updateTenantSettings.mockReset().mockResolvedValue(undefined);
  estado.settings = {};
  estado.canEdit = true;
  estado.canManage = true;
  estado.loading = false;
  estado.preview = null;
});

describe('ResponseRuleSettings', () => {
  it('nasce desligada, sem campos, "Tudo salvo" e salvar desabilitado', () => {
    abrir();
    expect(chave()).not.toBeChecked();
    expect(screen.queryByLabelText(/Tempo sem resposta/i)).not.toBeInTheDocument();
    expect(screen.getByText('Tudo salvo.')).toBeInTheDocument();
    expect(salvar()).toBeDisabled();
  });

  it('ligada: 60 min, 3 transferências, seg–sex 09–18 e o exemplo sexta 17:50 → segunda 09:50', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(chave());
    expect(screen.getByLabelText(/Tempo sem resposta/i)).toHaveValue(60);
    expect(screen.getByLabelText(/Máximo de transferências/i)).toHaveValue(3);
    expect(screen.getByRole('switch', { name: /Segunda aberto/i })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Sábado aberto/i })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Domingo aberto/i })).not.toBeChecked();
    expect(screen.getByLabelText(/Segunda abre às/i)).toHaveValue('09:00');
    expect(screen.getByLabelText(/Segunda fecha às/i)).toHaveValue('18:00');
    expect(screen.getByText(/cliente escreve na sexta 17:50/)).toBeInTheDocument();
    expect(screen.getByText(/muda de responsável na segunda 09:50/)).toBeInTheDocument();
    expect(salvar()).toBeEnabled();
  });

  it('minutos abaixo de 5 bloqueiam o salvar com a mensagem certa', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(chave());
    const minutos = screen.getByLabelText(/Tempo sem resposta/i);
    await user.clear(minutos);
    await user.type(minutos, '3');
    expect(screen.getByText(/entre 5 e 1440 minutos/)).toBeInTheDocument();
    expect(salvar()).toBeDisabled();
    expect(updateTenantSettings).not.toHaveBeenCalled();
  });

  it('fechar todos os dias bloqueia o salvar', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(chave());
    for (const dia of ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']) {
      await user.click(screen.getByRole('switch', { name: new RegExp(`${dia} aberto`, 'i') }));
    }
    expect(screen.getByText(/Deixe pelo menos um dia aberto/)).toBeInTheDocument();
    expect(salvar()).toBeDisabled();
  });

  it('salvar manda as quatro chaves, com business_hours inteiro', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(chave());
    const minutos = screen.getByLabelText(/Tempo sem resposta/i);
    await user.clear(minutos);
    await user.type(minutos, '30');
    await user.click(screen.getByRole('switch', { name: /Sábado aberto/i }));
    await user.click(salvar());
    expect(updateTenantSettings).toHaveBeenCalledTimes(1);
    const [patch] = updateTenantSettings.mock.calls[0];
    expect(patch.response_rule_enabled).toBe(true);
    expect(patch.response_rule_minutes).toBe(30);
    expect(patch.response_rule_max_transfers).toBe(3);
    expect(patch.business_hours.timezone).toBe('America/Sao_Paulo');
    expect(patch.business_hours.schedule['6']).toEqual({ start: '09:00', end: '18:00' });
    expect(patch.business_hours.schedule['0']).toBeNull();
    expect(patch.business_hours.schedule['1']).toEqual({ start: '09:00', end: '18:00' });
  });

  it('a prévia mostra o efeito com o histórico da Loja', async () => {
    const user = userEvent.setup();
    estado.preview = { turns: 167, breached: 88, never_replied: 40 };
    abrir();
    await user.click(chave());
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/das 167 esperas dos últimos 30 dias/);
    expect(status).toHaveTextContent(/88 teriam passado do limite/);
    expect(status).toHaveTextContent(/40 nunca receberam resposta humana/);
  });

  it('lê o que está gravado', () => {
    estado.settings = {
      response_rule_enabled: true,
      response_rule_minutes: 15,
      response_rule_max_transfers: 5,
      business_hours: { timezone: 'America/Manaus', schedule: { '1': { start: '08:00', end: '12:00' } } },
    };
    abrir();
    expect(chave()).toBeChecked();
    expect(screen.getByLabelText(/Tempo sem resposta/i)).toHaveValue(15);
    expect(screen.getByLabelText(/Máximo de transferências/i)).toHaveValue(5);
    expect(screen.getByLabelText(/Segunda abre às/i)).toHaveValue('08:00');
    // schedule presente com dia ausente = fechado (regra do motor)
    expect(screen.getByRole('switch', { name: /Terça aberto/i })).not.toBeChecked();
    expect(screen.getByText('Tudo salvo.')).toBeInTheDocument();
  });

  it('atendente vê só a frase de leitura', () => {
    estado.canManage = false;
    estado.canEdit = false;
    estado.settings = { response_rule_enabled: true, response_rule_minutes: 45 };
    abrir();
    expect(screen.getByText(/sem resposta por 45 min de funcionamento passa para um colega/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /salvar regra/i })).not.toBeInTheDocument();
  });

  it('gestor sem store.admin vê os valores, mas não edita', () => {
    estado.canEdit = false;
    estado.settings = { response_rule_enabled: true };
    abrir();
    expect(screen.getByText(/Apenas Gerente ou Gestor pode alterar/)).toBeInTheDocument();
    expect(chave()).toBeDisabled();
    expect(screen.queryByRole('button', { name: /salvar regra/i })).not.toBeInTheDocument();
  });
});

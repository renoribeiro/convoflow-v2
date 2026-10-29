/**
 * Aba Configurações › Horário (lote 6e, decisão D6, achado 114).
 *
 * O que a tela precisa garantir:
 *  - abre com o horário salvo (ou o padrão seg–sex 09–18, Brasília) e "Tudo salvo";
 *  - "Salvar horário" manda SÓ business_hours, inteiro, e nunca liga nem
 *    desliga a transferência (nenhuma chave response_rule_*);
 *  - fechar todos os dias ou fim antes do início bloqueia o salvar;
 *  - sem `store.admin` (Atendente) é uma frase de leitura, sem salvar;
 *  - Gerente sem Loja aberta recebe o aviso para escolher a Loja.
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
    semLoja: false,
  },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: estado.semLoja ? null : { id: 'loja-1', name: 'Loja Exemplo', settings: estado.settings },
    loading: false,
    updateTenantSettings,
  }),
  useCan: () => estado.canEdit,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { BusinessHoursSettings } from './BusinessHoursSettings';

const abrir = () => render(<BusinessHoursSettings />);
const salvar = () => screen.getByRole('button', { name: /salvar horário/i });
const dia = (nome: string) => screen.getByRole('switch', { name: new RegExp(`${nome} aberto`, 'i') });

beforeEach(() => {
  updateTenantSettings.mockReset().mockResolvedValue(undefined);
  estado.settings = {};
  estado.canEdit = true;
  estado.semLoja = false;
});

describe('BusinessHoursSettings', () => {
  it('abre com o padrão seg a sex 09 às 18, "Tudo salvo" e salvar desabilitado', () => {
    abrir();
    expect(dia('Segunda')).toBeChecked();
    expect(dia('Sábado')).not.toBeChecked();
    expect(dia('Domingo')).not.toBeChecked();
    expect(screen.getByLabelText(/Segunda abre às/i)).toHaveValue('09:00');
    expect(screen.getByLabelText(/Segunda fecha às/i)).toHaveValue('18:00');
    expect(screen.getByText('Tudo salvo.')).toBeInTheDocument();
    expect(salvar()).toBeDisabled();
  });

  it('salvar manda só business_hours, sem mexer na transferência', async () => {
    const user = userEvent.setup();
    estado.settings = { response_rule_enabled: false };
    abrir();
    await user.click(dia('Sábado'));
    expect(screen.getByText('Você tem alterações não salvas.')).toBeInTheDocument();
    await user.click(salvar());
    expect(updateTenantSettings).toHaveBeenCalledTimes(1);
    const [patch] = updateTenantSettings.mock.calls[0]!;
    expect(Object.keys(patch)).toEqual(['business_hours']);
    expect(patch.business_hours.timezone).toBe('America/Sao_Paulo');
    expect(patch.business_hours.schedule['6']).toEqual({ start: '09:00', end: '18:00' });
    expect(patch.business_hours.schedule['0']).toBeNull();
    expect(patch.business_hours.schedule['1']).toEqual({ start: '09:00', end: '18:00' });
  });

  it('fechar todos os dias bloqueia o salvar', async () => {
    const user = userEvent.setup();
    abrir();
    for (const nome of ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']) await user.click(dia(nome));
    expect(screen.getByText(/Deixe pelo menos um dia aberto/)).toBeInTheDocument();
    expect(salvar()).toBeDisabled();
  });

  it('fim antes do início bloqueia o salvar', async () => {
    const user = userEvent.setup();
    abrir();
    const fecha = screen.getByLabelText(/Segunda fecha às/i);
    await user.clear(fecha);
    await user.type(fecha, '08:00');
    expect(screen.getByText(/O fim precisa ser depois do início/)).toBeInTheDocument();
    expect(salvar()).toBeDisabled();
  });

  it('lê o que está gravado', () => {
    estado.settings = {
      business_hours: { timezone: 'America/Manaus', schedule: { '1': { start: '08:00', end: '12:00' } } },
    };
    abrir();
    expect(screen.getByLabelText(/Segunda abre às/i)).toHaveValue('08:00');
    expect(dia('Terça')).not.toBeChecked();
    expect(screen.getByText('Tudo salvo.')).toBeInTheDocument();
  });

  it('o Atendente lê o horário numa frase e não salva', () => {
    estado.canEdit = false;
    abrir();
    expect(screen.getByText(/Segunda a sexta, 09:00 às 18:00\. Fuso: Brasília/)).toBeInTheDocument();
    expect(screen.getByText(/Apenas Gerente ou Gestor muda o horário/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /salvar horário/i })).not.toBeInTheDocument();
  });

  it('o Gerente sem Loja aberta recebe o aviso para escolher a Loja', () => {
    estado.semLoja = true;
    abrir();
    expect(screen.getByText(/Escolha uma Loja no seletor de Conta/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /salvar horário/i })).not.toBeInTheDocument();
  });
});

/**
 * Funil vazio ou na Conta: a situação de cada cargo, as etapas prontas e o
 * pedido de reabrir a janela depois de trocar de Loja.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ETAPAS_PADRAO, ETAPAS_PADRAO_TEXTO, criarEtapasPadrao, situacaoDoFunil } from './estadoVazio';
import { ACAO_FUNIL_TTL_MS, consumirAcaoFunil, pedirAcaoFunil, useFunilPendente } from './funilPendente';

describe('situacaoDoFunil', () => {
  it('Gerente com a Conta em foco: escolher a Loja, tenha ou não etapa', () => {
    expect(situacaoDoFunil({ role: 'gerente', emConta: true, temEtapas: false })).toBe('conta');
    expect(situacaoDoFunil({ role: 'gerente', emConta: true, temEtapas: true })).toBe('conta');
  });

  it('Gerente numa Loja sem etapa: pode criar', () => {
    expect(situacaoDoFunil({ role: 'gerente', emConta: false, temEtapas: false })).toBe('sem-etapas-configura');
  });

  it('Gestor sem etapa: pode criar', () => {
    expect(situacaoDoFunil({ role: 'gestor', emConta: false, temEtapas: false })).toBe('sem-etapas-configura');
  });

  it('Atendente sem etapa: pede a quem pode', () => {
    expect(situacaoDoFunil({ role: 'atendente', emConta: false, temEtapas: false })).toBe('sem-etapas-atendente');
  });

  it('com etapa, numa Loja: pronto para todo cargo', () => {
    for (const role of ['gerente', 'gestor', 'atendente'] as const) {
      expect(situacaoDoFunil({ role, emConta: false, temEtapas: true })).toBe('pronto');
    }
  });
});

describe('etapas prontas', () => {
  it('cinco, na ordem combinada, e o texto da tela', () => {
    expect(ETAPAS_PADRAO).toEqual(['Novo contato', 'Em atendimento', 'Proposta', 'Fechado', 'Perdido']);
    expect(ETAPAS_PADRAO_TEXTO).toBe('Novo contato, Em atendimento, Proposta, Fechado e Perdido');
  });

  it('criarEtapasPadrao chama a função com a Loja e devolve quantas criou', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 5, error: null });
    await expect(criarEtapasPadrao({ rpc } as never, 'aaaaaaaa-0000-4000-8000-0000000000b1')).resolves.toBe(5);
    expect(rpc).toHaveBeenCalledWith('funnel_criar_etapas_padrao', { p_tenant_id: 'aaaaaaaa-0000-4000-8000-0000000000b1' });
  });

  it('erro da função sobe (a tela mostra a mensagem)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Só o Gestor ou o Gerente cria as etapas do funil.' } });
    await expect(criarEtapasPadrao({ rpc } as never, 'x')).rejects.toMatchObject({ message: /Gestor ou o Gerente/ });
  });
});

describe('reabrir a janela depois de trocar de Loja', () => {
  afterEach(() => useFunilPendente.getState().limpar());

  it('o pedido é lido uma vez só', () => {
    pedirAcaoFunil('novo-lead');
    expect(consumirAcaoFunil()).toBe('novo-lead');
    expect(consumirAcaoFunil()).toBeNull();
  });

  it('pedido velho não reabre nada', () => {
    pedirAcaoFunil('configurar-etapas');
    expect(consumirAcaoFunil(Date.now() + ACAO_FUNIL_TTL_MS + 1)).toBeNull();
  });
});

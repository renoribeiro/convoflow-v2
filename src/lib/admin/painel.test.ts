import { describe, expect, it } from 'vitest';
import { abaDoAdmin, CAMINHO_DA_MANUTENCAO, contarEstrutura } from './painel';

describe('abaDoAdmin (achado 134)', () => {
  it('abre a aba pedida no endereço', () => {
    expect(abaDoAdmin('settings')).toBe('settings');
    expect(abaDoAdmin('reports')).toBe('reports');
  });

  it('sem pedido, ou com pedido estranho, abre a Visão Geral', () => {
    expect(abaDoAdmin(null)).toBe('overview');
    expect(abaDoAdmin('')).toBe('overview');
    expect(abaDoAdmin('manutencao')).toBe('overview');
  });

  it('a faixa de manutenção leva à aba Configurações', () => {
    expect(CAMINHO_DA_MANUTENCAO).toBe('/dashboard/admin?tab=settings');
    expect(abaDoAdmin(new URL(CAMINHO_DA_MANUTENCAO, 'https://exemplo.com.br').searchParams.get('tab'))).toBe('settings');
  });
});

describe('contarEstrutura (achado 132)', () => {
  it('conta Contas e Lojas pela estrutura, não pelos cargos', () => {
    const tenants = [
      { kind: 'account' },
      { kind: 'account' },
      { kind: 'store' },
      { kind: 'store' },
      { kind: 'store' },
    ];
    expect(contarEstrutura(tenants)).toEqual({ contas: 2, lojas: 3 });
  });

  it('linha sem tipo não entra em nenhuma das duas', () => {
    expect(contarEstrutura([{ kind: null }, {}, { kind: 'account' }])).toEqual({ contas: 1, lojas: 0 });
  });

  it('sem nada carregado: zero e zero', () => {
    expect(contarEstrutura([])).toEqual({ contas: 0, lojas: 0 });
  });
});

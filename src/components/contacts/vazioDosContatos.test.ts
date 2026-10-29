import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { vazioDosContatos } from './ContactsTable';

/**
 * Vazio de Contatos (lote 6c, B13): com filtro, "Limpar filtros" e o texto do
 * filtro (etiqueta sozinha tem frase própria); sem filtro, "Novo Contato".
 */

const SEM_FILTRO = { search: '', stage: '', source: '', tags: [] as string[] };
const novo = vi.fn();
const limpar = vi.fn();

describe('vazioDosContatos', () => {
  it('sem filtro: Novo Contato', () => {
    const v = vazioDosContatos(SEM_FILTRO, 'all', null, novo, limpar);
    expect(v.title).toBe('Nenhum contato ainda');
    expect(v.action?.label).toBe('Novo Contato');
    expect(v.action?.onClick).toBe(novo);
  });

  it('só uma etiqueta: frase da etiqueta e Limpar filtros', () => {
    const v = vazioDosContatos({ ...SEM_FILTRO, tags: ['t1'] }, 'all', null, novo, limpar);
    expect(v.title).toBe('Nenhum contato com esta etiqueta');
    expect(v.description).toMatch(/tem a etiqueta escolhida/);
    expect(v.action).toEqual({ label: 'Limpar filtros', onClick: limpar });
  });

  it('só etiquetas (mais de uma): plural', () => {
    const v = vazioDosContatos({ ...SEM_FILTRO, tags: ['t1', 't2'] }, 'all', null, novo, limpar);
    expect(v.title).toBe('Nenhum contato com estas etiquetas');
    expect(v.description).toMatch(/alguma das etiquetas/);
  });

  it('busca, etapa, fonte, canal ou número: frase geral e Limpar filtros', () => {
    for (const [f, canal, numero] of [
      [{ ...SEM_FILTRO, search: 'ana' }, 'all', null],
      [{ ...SEM_FILTRO, stage: 'e1' }, 'all', null],
      [{ ...SEM_FILTRO, source: 'f1', tags: ['t1'] }, 'all', null],
      [SEM_FILTRO, 'instagram', null],
      [SEM_FILTRO, 'all', 'inst-1'],
    ] as const) {
      const v = vazioDosContatos(f, canal, numero, novo, limpar);
      expect(v.title).toBe('Nenhum contato encontrado');
      expect(v.action?.label).toBe('Limpar filtros');
    }
  });
});

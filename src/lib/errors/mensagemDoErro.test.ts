import { describe, it, expect } from 'vitest';
import { motivoDoErro, tituloDoErro } from './mensagemDoErro';

/** Lote 3 do checkup (achado 36): erro do banco vira frase do que fazer. */
describe('motivoDoErro', () => {
  it('nunca repete o texto cru, a tabela nem o código', () => {
    const cru = { code: 'XX000', message: 'insert or update on table "contacts" violates something' };
    const frase = motivoDoErro(cru);
    expect(frase).not.toMatch(/contacts|XX000|violates|table/i);
    expect(frase).toMatch(/Tente de novo/);
  });

  it('permissão, cadastro repetido, campo inválido e rede têm frase própria', () => {
    expect(motivoDoErro({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/Peça ao Gestor da Loja/);
    expect(motivoDoErro({ code: '23505', message: 'duplicate key value' })).toMatch(/Já existe um cadastro igual/);
    expect(motivoDoErro({ code: '23502' })).toMatch(/campo está vazio/);
    expect(motivoDoErro(new TypeError('Failed to fetch'))).toMatch(/Confira a internet/);
  });

  it('título pela ação', () => {
    expect(tituloDoErro('salvar')).toBe('Não foi possível salvar');
    expect(tituloDoErro('excluir')).toBe('Não foi possível excluir');
    expect(tituloDoErro('carregar')).toBe('Não foi possível carregar');
  });
});

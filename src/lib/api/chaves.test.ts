import { describe, expect, it } from 'vitest';
import {
  ACEITE_VERSAO,
  ACEITE_VERSAO_REGEX,
  ESCOPOS_PADRAO,
  alternarEscopo,
  argsDeCriarChave,
  contarAtivas,
  erroDoFormulario,
  rotuloDasLojas,
} from './chaves';

describe('constantes', () => {
  it('a versão do aceite tem o formato que o servidor exige', () => {
    expect(ACEITE_VERSAO).toMatch(ACEITE_VERSAO_REGEX);
  });

  it('mensagens e mídia começam desligadas', () => {
    expect(ESCOPOS_PADRAO).not.toContain('mensagens');
    expect(ESCOPOS_PADRAO).not.toContain('midia');
  });
});

describe('alternarEscopo', () => {
  it('não liga mídia sem o histórico', () => {
    expect(alternarEscopo(['contatos'], 'midia', true)).toEqual(['contatos']);
  });
  it('liga mídia com o histórico ligado', () => {
    expect(alternarEscopo(['mensagens'], 'midia', true)).toEqual(['mensagens', 'midia']);
  });
  it('desligar o histórico desliga a mídia', () => {
    expect(alternarEscopo(['mensagens', 'midia', 'funil'], 'mensagens', false)).toEqual(['funil']);
  });
});

describe('erroDoFormulario', () => {
  const ok = { nome: 'Painel', escopos: ['contatos'], lojas: null, validade: 90, aceite: true };
  it('aceita um formulário completo', () => expect(erroDoFormulario(ok)).toBeNull());
  it('exige nome', () => expect(erroDoFormulario({ ...ok, nome: '  ' })).toMatch(/nome/i));
  it('limita o nome a 60', () => expect(erroDoFormulario({ ...ok, nome: 'a'.repeat(61) })).toMatch(/60/));
  it('exige o aceite', () => expect(erroDoFormulario({ ...ok, aceite: false })).toMatch(/confirmação/));
  it('exige ao menos uma permissão', () => expect(erroDoFormulario({ ...ok, escopos: [] })).toMatch(/permissão/));
  it('exige Loja quando não são todas', () => expect(erroDoFormulario({ ...ok, lojas: [] })).toMatch(/Loja/));
  it('recusa mídia sem histórico', () =>
    expect(erroDoFormulario({ ...ok, escopos: ['midia'] })).toMatch(/histórico/));
});

describe('argsDeCriarChave', () => {
  it('monta exatamente os argumentos da RPC', () => {
    expect(argsDeCriarChave({ nome: ' Painel ', escopos: ['contatos'], lojas: null, validade: 30 })).toEqual({
      p_nome: 'Painel',
      p_escopos: ['contatos'],
      p_lojas: null,
      p_validade_dias: 30,
      p_aceite_versao: ACEITE_VERSAO,
    });
  });
});

describe('listas', () => {
  it('conta como em uso ativa, suspensa e dono inativo', () => {
    expect(
      contarAtivas([
        { estado: 'ativa' },
        { estado: 'suspensa' },
        { estado: 'revogada' },
        { estado: 'expirada' },
        { estado: 'dono_inativo' },
      ]),
    ).toBe(3);
  });
  it('rotula as Lojas', () => {
    expect(rotuloDasLojas(null, {})).toBe('Todas');
    expect(rotuloDasLojas(['a', 'b'], { a: 'Centro' })).toBe('Centro, Loja removida');
  });
});

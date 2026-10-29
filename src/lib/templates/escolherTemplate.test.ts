import { describe, it, expect } from 'vitest';
import {
  chaveDoTemplate,
  parametrosParaTemplate,
  templateCompleto,
  templateDoBanco,
  templatesAprovados,
  motivoDaListaDeTemplates,
} from './escolherTemplate';

describe('escolherTemplate', () => {
  it('só os aprovados, em ordem alfabética', () => {
    const lista = templatesAprovados([
      { name: 'zeta', language: 'pt_BR', status: 'APPROVED' },
      { name: 'alfa', language: 'pt_BR', status: 'approved' },
      { name: 'beta', language: 'pt_BR', status: 'PAUSED' },
    ]);
    expect(lista.map((t) => t.name)).toEqual(['alfa', 'zeta']);
  });

  it('a chave junta nome e idioma', () => {
    expect(chaveDoTemplate({ name: 'a', language: 'es' })).toBe('a::es');
    expect(chaveDoTemplate({ nome: 'a', idioma: 'es' })).toBe('a::es');
  });

  it('um campo por variável, guardando o que já foi escrito', () => {
    expect(parametrosParaTemplate({ name: 'a', language: 'pt_BR', paramCount: 3 }, ['x'])).toEqual(['x', '', '']);
    expect(parametrosParaTemplate({ name: 'a', language: 'pt_BR', paramCount: 1 }, ['x', 'y'])).toEqual(['x']);
    expect(parametrosParaTemplate({ name: 'a', language: 'pt_BR' })).toEqual([]);
  });

  it('completo: nome e nenhuma variável em branco', () => {
    expect(templateCompleto({ nome: 'a', idioma: 'pt_BR', parametros: [] })).toBe(true);
    expect(templateCompleto({ nome: 'a', idioma: 'pt_BR', parametros: ['x', ' '] })).toBe(false);
    expect(templateCompleto({ nome: ' ', idioma: 'pt_BR', parametros: [] })).toBe(false);
  });

  it('lê o que veio do banco', () => {
    expect(templateDoBanco({ template_name: 'a', template_language: null, template_params: [1, 'b'] })).toEqual({
      nome: 'a',
      idioma: 'pt_BR',
      parametros: ['1', 'b'],
    });
    expect(templateDoBanco({})).toEqual({ nome: '', idioma: 'pt_BR', parametros: [] });
  });
});

describe('motivoDaListaDeTemplates', () => {
  it('acesso vencido vira o que fazer', () => {
    expect(motivoDaListaDeTemplates('Error validating access token: Session has expired')).toMatch(/Reconecte o número/);
  });
  it('sem wabaId', () => {
    expect(motivoDaListaDeTemplates('connection_config.wabaId ausente')).toMatch(/identificação da conta/);
  });
  it('o resto não mostra inglês', () => {
    expect(motivoDaListaDeTemplates('Internal Server Error')).toBe('a Meta não respondeu agora. Tente Atualizar daqui a pouco');
  });
});

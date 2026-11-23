/**
 * Nome do lead e Primeiro contato no chatbot (2026-11-18).
 * Lado servidor: supabase/functions/_shared/nome-do-lead.ts e o motor
 * (chatbot-engine.ts: bloco "Atualizar contato" com lead_name e a condição
 * primeiro_contato).
 */
import { describe, expect, it } from 'vitest';
import {
  limparNomeDoLead,
  podeTrocarNomeDoContato,
  valorPrimeiroContato,
  variavelUnica,
} from '../../../supabase/functions/_shared/nome-do-lead';
import {
  CONDITION_FALSE_HANDLE,
  CONDITION_TRUE_HANDLE,
  evaluateCondition,
  resolveNextNodeId,
  substituteVariables,
} from '../../../supabase/functions/_shared/chatbot-engine';
import { CONDITION_ONLY_VARIABLES } from '@/lib/chatbot/flowConstants';
import { UpdateContactNodeDataSchema } from '@/lib/validations/chatbot-flow';

describe('limparNomeDoLead', () => {
  it.each([
    ['Ana', 'Ana', 'Ana'],
    ['meu nome é ana', 'Ana', 'Ana'],
    ['Maria Clara', 'Maria Clara', 'Maria'],
    ['meu nome é teodora quimera', 'Teodora Quimera', 'Teodora'],
    ['Sou a Maria Clara Souza Lima', 'Maria Clara Souza Lima', 'Maria'],
    ['  me chamo   JOÃO  pedro ', 'João Pedro', 'João'],
    ['aqui é a Bia!', 'Bia', 'Bia'],
    ["Joana D'Ávila", "Joana D'ávila", 'Joana'],
    ['Souza', 'Souza', 'Souza'],
  ])('%s', (entrada, completo, primeiro) => {
    expect(limparNomeDoLead(entrada)).toEqual({ completo, primeiro });
  });

  it.each([
    ['Qual preço da limpeza de pele?'],
    ['Qual preço da limpeza de pele'],
    ['Bom dia'],
    ['Boa tarde, tudo bem'],
    ['Oi, aqui é a Bia'],
    ['Ana, quero botox'],
    ['Olá'],
    ['Quero fazer botox'],
    ['Sim'],
    ['Não'],
    ['Obrigada'],
    ['Limpeza de pele'],
    ['Informação'],
    ['Ana?'],
    ['Teodora Quimera Souza Lima Neta'],
    ['😊🙏'],
    [''],
    ['   '],
    ['meu nome é'],
    ['12345'],
    ['Ana 2'],
    ['[Áudio]'],
    ['[Figurinha]'],
  ])('sem nome: %j', (entrada) => {
    expect(limparNomeDoLead(entrada)).toBeNull();
  });

  it('não texto vira null', () => {
    expect(limparNomeDoLead(undefined)).toBeNull();
  });
});

describe('podeTrocarNomeDoContato', () => {
  const telefone = '5585999990201';
  it('troca nome vazio, telefone ou nome do perfil', () => {
    expect(podeTrocarNomeDoContato({ atual: '', telefone })).toBe(true);
    expect(podeTrocarNomeDoContato({ atual: null, telefone })).toBe(true);
    expect(podeTrocarNomeDoContato({ atual: telefone, telefone })).toBe(true);
    expect(podeTrocarNomeDoContato({ atual: '+55 (85) 99999-0201', telefone })).toBe(true);
    expect(podeTrocarNomeDoContato({ atual: 'Ana 🌸', telefone, nomeDoPerfil: 'ana 🌸' })).toBe(true);
  });
  it('nunca troca um nome salvo à mão', () => {
    expect(podeTrocarNomeDoContato({ atual: 'Teodora Quimera (indicação)', telefone, nomeDoPerfil: 'Teodora' })).toBe(false);
    expect(podeTrocarNomeDoContato({ atual: 'Carla Souza', telefone })).toBe(false);
  });
});

describe('variável do valor', () => {
  it('reconhece {nome} sozinho', () => {
    expect(variavelUnica('{nome}')).toBe('nome');
    expect(variavelUnica(' { nome } ')).toBe('nome');
    expect(variavelUnica('Sr. {nome}')).toBeNull();
  });
  it('"Muito prazer, {nome}!" sai com o primeiro nome limpo', () => {
    const limpo = limparNomeDoLead('meu nome é teodora quimera');
    expect(substituteVariables('Muito prazer, {nome}!', { nome: limpo?.primeiro } as never)).toBe('Muito prazer, Teodora!');
  });
});

describe('primeiro contato escolhe o caminho', () => {
  // A forma do começo do fluxo: Início → Condição
  // {primeiro_contato} é igual a "sim" → A (pede o nome) / B (boas vindas).
  const arestas = [
    { id: 'e1', chatbot_id: 'b', source_node_id: 'cond', target_node_id: 'pede-nome', source_handle: CONDITION_TRUE_HANDLE },
    { id: 'e2', chatbot_id: 'b', source_node_id: 'cond', target_node_id: 'boas-vindas', source_handle: CONDITION_FALSE_HANDLE },
  ];
  const caminho = (anteriores: number) => {
    const ok = evaluateCondition('equals', valorPrimeiroContato(anteriores), 'sim');
    return resolveNextNodeId(arestas as never, 'cond', ok ? CONDITION_TRUE_HANDLE : CONDITION_FALSE_HANDLE);
  };
  it('primeiro contato vai para o caminho A', () => {
    expect(caminho(0)).toBe('pede-nome');
  });
  it('contato que volta vai para o caminho B', () => {
    expect(caminho(1)).toBe('boas-vindas');
    expect(caminho(40)).toBe('boas-vindas');
  });
});

describe('o construtor oferece as peças', () => {
  it('a Condição lista primeiro_contato e o bloco aceita lead_name', () => {
    expect(CONDITION_ONLY_VARIABLES.map((v) => v.token)).toContain('primeiro_contato');
    expect(UpdateContactNodeDataSchema.safeParse({ field: 'lead_name', value: '{nome}' }).success).toBe(true);
  });
});

/**
 * Interpolação de resposta rápida e o atalho da barra.
 *
 * O que estes testes protegem: a promessa de que o atendente escreve
 * `{first_name}` UMA vez, em qualquer lugar do produto, e funciona. Se alguém
 * trocar o interpolador por um segundo parser (foi assim que a chave dupla
 * `{{}}` entrou na semente da tabela antiga), estes testes quebram.
 */
import { describe, it, expect } from 'vitest';
import { substituteVariables } from '@/lib/chatbot/flowEngine';
import { buildQuickReplyContext, shouldOpenQuickReplies } from './quickReplyContext';

const contato = {
  name: 'Helena Duarte',
  phone: '5511999998888',
  email: 'helena@exemplo.com',
};

/** Data fixa: senão {date} muda de valor conforme o dia em que o teste roda. */
const AGORA = new Date('2026-08-24T14:30:00-03:00');

describe('buildQuickReplyContext', () => {
  it('deriva o primeiro nome a partir do nome completo', () => {
    const ctx = buildQuickReplyContext(contato, AGORA);
    expect(ctx.first_name).toBe('Helena');
    expect(ctx.name).toBe('Helena Duarte');
  });

  it('expõe telefone e e-mail', () => {
    const ctx = buildQuickReplyContext(contato, AGORA);
    expect(ctx.phone).toBe('5511999998888');
    expect(ctx.email).toBe('helena@exemplo.com');
  });

  it('formata data e hora em pt-BR', () => {
    const ctx = buildQuickReplyContext(contato, AGORA);
    expect(ctx.date).toBe('24/08/2026');
    expect(ctx.time).toBe('14:30');
    expect(ctx.datetime).toBe('24/08/2026 14:30');
  });

  it('promove campos personalizados a variáveis', () => {
    const ctx = buildQuickReplyContext(
      { ...contato, custom_fields: { cidade: 'Recife', plano: 'ouro' } },
      AGORA,
    );
    expect(ctx.cidade).toBe('Recife');
    expect(ctx.plano).toBe('ouro');
  });

  it('ignora campo personalizado que não é primitivo, em vez de virar [object Object]', () => {
    const ctx = buildQuickReplyContext(
      { ...contato, custom_fields: { endereco: { rua: 'X' } } },
      AGORA,
    );
    expect(ctx.endereco).toBeNull();
  });

  it('aguenta contato ausente sem estourar', () => {
    const ctx = buildQuickReplyContext(null, AGORA);
    expect(ctx.name).toBeNull();
    expect(ctx.first_name).toBe('');
  });
});

describe('interpolação na inserção', () => {
  it('troca {first_name} pelo nome de quem está na conversa', () => {
    const ctx = buildQuickReplyContext(contato, AGORA);
    expect(substituteVariables('Olá {first_name}, tudo bem?', ctx)).toBe(
      'Olá Helena, tudo bem?',
    );
  });

  it('mantém token desconhecido literal, sem apagar nem esvaziar', () => {
    const ctx = buildQuickReplyContext(contato, AGORA);
    expect(substituteVariables('Seu código é {codigo_pedido}.', ctx)).toBe(
      'Seu código é {codigo_pedido}.',
    );
  });

  it('usa chave SIMPLES — a chave dupla da tabela antiga não resolve', () => {
    // Este é o teste que registra o defeito da semente antiga: `{{nome}}` casa
    // só o miolo e sobra chave dos dois lados. É o motivo de a coluna
    // `variables` ter sido removida e de a ajuda falar em {variavel}.
    const ctx = buildQuickReplyContext(contato, AGORA);
    expect(substituteVariables('Olá {{name}}!', ctx)).toBe('Olá {Helena Duarte}!');
    expect(substituteVariables('Olá {name}!', ctx)).toBe('Olá Helena Duarte!');
  });

  it('tolera espaço dentro das chaves', () => {
    const ctx = buildQuickReplyContext(contato, AGORA);
    expect(substituteVariables('Olá { first_name }!', ctx)).toBe('Olá Helena!');
  });

  it('resolve várias variáveis na mesma mensagem', () => {
    const ctx = buildQuickReplyContext(contato, AGORA);
    expect(
      substituteVariables('{first_name}, confirmamos para {date} às {time}.', ctx),
    ).toBe('Helena, confirmamos para 24/08/2026 às 14:30.');
  });
});

describe('shouldOpenQuickReplies', () => {
  it('abre com "/" no campo vazio', () => {
    expect(shouldOpenQuickReplies('/', '')).toBe(true);
  });

  it('NÃO abre quando já existe texto — "9h/18h" é texto, não comando', () => {
    expect(shouldOpenQuickReplies('/', 'Atendemos das 9h')).toBe(false);
  });

  it('NÃO abre com qualquer outro caractere', () => {
    expect(shouldOpenQuickReplies('a', '')).toBe(false);
    expect(shouldOpenQuickReplies('//', '')).toBe(false);
  });
});

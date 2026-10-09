import { describe, it, expect } from 'vitest';
import { motivoDaRecusaMeta } from './metaErrors';

describe('motivoDaRecusaMeta', () => {
  it('código da skill vira frase em pt-BR, com o código no fim', () => {
    expect(motivoDaRecusaMeta(131047, 'Re-engagement message')).toBe(
      'Fora da janela de 24 horas: este telefone não escreveu para este número nas últimas 24 horas. Envie um template aprovado. (código 131047 da Meta)',
    );
    expect(motivoDaRecusaMeta('132001', null)).toContain('Confira na tela Templates.');
  });

  it('código fora da skill mantém a frase do servidor (a da Meta)', () => {
    expect(motivoDaRecusaMeta(131042, 'Business eligibility payment issue')).toBe(
      'Business eligibility payment issue (código 131042 da Meta)',
    );
  });

  it('códigos que a skill descreve de um jeito duvidoso não ganham frase própria', () => {
    expect(motivoDaRecusaMeta(368, 'Temporarily blocked')).toBe('Temporarily blocked (código 368 da Meta)');
    expect(motivoDaRecusaMeta(132005, 'Translated text too long')).toBe(
      'Translated text too long (código 132005 da Meta)',
    );
  });

  it('sem código, só a frase do servidor', () => {
    expect(motivoDaRecusaMeta(undefined, 'Token Meta não encontrado no Vault.')).toBe(
      'Token Meta não encontrado no Vault.',
    );
    expect(motivoDaRecusaMeta(null, '')).toBe('A Meta recusou o envio.');
  });
});

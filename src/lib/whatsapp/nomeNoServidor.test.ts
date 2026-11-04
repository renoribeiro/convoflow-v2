import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  NOME_NO_SERVIDOR_EVOLUTION,
  baseDoNomeNoServidor,
  gerarNomeNoServidor,
  normalizarNomeNoServidor,
  problemaNoNomeNoServidor,
  sufixoAleatorio,
  temNomeNoServidor,
} from './nomeNoServidor';
import { tipoDeConexao } from './tipoDeConexao';
import {
  EVOLUTION_INSTANCE_NAME_PATTERN,
  MENSAGEM_NOME_EM_USO_NO_CONVOFLOW,
  MENSAGEM_NOME_EM_USO_NO_SERVIDOR,
  MENSAGEM_NOME_INVALIDO,
  nomeEmUsoNaCriacao,
  situacaoDoNomeNaEvolution,
} from '../../../supabase/functions/_shared/evolution-instance-name.ts';

/**
 * O nome do número no servidor de conexão (decisão do dono, 2026-11-04): nasce
 * do nome digitado, só com o que a Evolution aceita, e o servidor confere se
 * está livre na própria Evolution antes de criar. Nada toca a rede.
 */

describe('nome no servidor gerado a partir do nome do número', () => {
  it('"WhatsApp Vendas" vira whatsapp_vendas mais 4 caracteres', () => {
    expect(gerarNomeNoServidor('WhatsApp Vendas', 'k3f9')).toBe('whatsapp_vendas_k3f9');
  });

  it('sem acento, minúsculo, pontuação e espaço viram um _ só', () => {
    expect(baseDoNomeNoServidor('Recepção Ótica  (Centro)!')).toBe('recepcao_otica_centro');
    expect(baseDoNomeNoServidor('  Loja-Norte 2 ')).toBe('loja-norte_2');
  });

  it('nome sem letra nem número vira "numero"', () => {
    expect(gerarNomeNoServidor('', 'ab12')).toBe('numero_ab12');
    expect(gerarNomeNoServidor('📱 ✨', 'ab12')).toBe('numero_ab12');
  });

  it('nome comprido é cortado sem deixar _ sobrando no fim', () => {
    const nome = gerarNomeNoServidor('Atendimento '.repeat(10), 'zz99');
    expect(nome.length).toBeLessThanOrEqual(45);
    expect(nome).not.toMatch(/__/);
    expect(nome.endsWith('_zz99')).toBe(true);
  });

  it('o sufixo tem 4 letras minúsculas ou algarismos e varia', () => {
    const vistos = new Set(Array.from({ length: 50 }, () => sufixoAleatorio()));
    for (const s of vistos) expect(s).toMatch(/^[a-z0-9]{4}$/);
    expect(vistos.size).toBeGreaterThan(40);
  });

  it('todo nome gerado passa na regra da tela e na do servidor', () => {
    for (const nome of ['WhatsApp Vendas', 'Recepção', '', 'São João / Matriz', 'A', 'x'.repeat(200)]) {
      const gerado = gerarNomeNoServidor(nome);
      expect(problemaNoNomeNoServidor(gerado), gerado).toBeNull();
      expect(EVOLUTION_INSTANCE_NAME_PATTERN.test(gerado), gerado).toBe(true);
    }
  });
});

describe('nome digitado em "Avançado"', () => {
  it('o campo já limpa enquanto a pessoa digita', () => {
    expect(normalizarNomeNoServidor('Agência Cliente 01')).toBe('agencia_cliente_01');
    expect(normalizarNomeNoServidor('a/b')).toBe('a_b');
  });

  it('curto, longo ou com caractere errado tem frase que diz o que fazer', () => {
    expect(problemaNoNomeNoServidor('ab')).toMatch(/pelo menos 3/);
    expect(problemaNoNomeNoServidor('a'.repeat(101))).toMatch(/no máximo 100/);
    expect(problemaNoNomeNoServidor('Vendas')).toMatch(/minúsculas/);
    expect(problemaNoNomeNoServidor('vendas_01')).toBeNull();
  });
});

describe('a regra da tela é a do servidor', () => {
  it('mesmo padrão', () => {
    expect(NOME_NO_SERVIDOR_EVOLUTION.source).toBe(EVOLUTION_INSTANCE_NAME_PATTERN.source);
  });

  it('as frases do servidor são em português, sem jargão e dizem o que fazer', () => {
    for (const m of [MENSAGEM_NOME_INVALIDO, MENSAGEM_NOME_EM_USO_NO_CONVOFLOW, MENSAGEM_NOME_EM_USO_NO_SERVIDOR]) {
      expect(m).toMatch(/servidor de conexão/i);
      expect(m).not.toMatch(/instance|instância|403|409|código interno/i);
    }
    expect(MENSAGEM_NOME_EM_USO_NO_SERVIDOR).toMatch(/Gerar de novo/);
  });
});

describe('o servidor confere o nome na Evolution antes de criar', () => {
  const resposta = (status: number, corpo?: unknown) =>
    new Response(corpo === undefined ? '' : JSON.stringify(corpo), { status });

  it('404 é nome livre (SKILL.md, regra 10)', async () => {
    const req = vi.fn(async () => resposta(404, { message: 'Instance "x" not found' }));
    expect(await situacaoDoNomeNaEvolution(req, 'vendas_k3f9')).toBe('livre');
    expect(req).toHaveBeenCalledWith('/instance/fetchInstances?instanceName=vendas_k3f9');
  });

  it('a lista com o mesmo nome é nome em uso (formato v2 e v1)', async () => {
    expect(await situacaoDoNomeNaEvolution(async () => resposta(200, [{ name: 'vendas_k3f9' }]), 'vendas_k3f9')).toBe('em_uso');
    expect(
      await situacaoDoNomeNaEvolution(async () => resposta(200, [{ instance: { instanceName: 'vendas_k3f9' } }]), 'vendas_k3f9'),
    ).toBe('em_uso');
  });

  it('lista vazia, ou só com outros nomes, é nome livre', async () => {
    expect(await situacaoDoNomeNaEvolution(async () => resposta(200, []), 'vendas_k3f9')).toBe('livre');
    expect(await situacaoDoNomeNaEvolution(async () => resposta(200, [{ name: 'outro' }]), 'vendas_k3f9')).toBe('livre');
  });

  it('sem resposta clara não bloqueia: a criação confere de novo', async () => {
    expect(await situacaoDoNomeNaEvolution(async () => resposta(401), 'vendas_k3f9')).toBe('desconhecido');
    expect(await situacaoDoNomeNaEvolution(async () => resposta(500), 'vendas_k3f9')).toBe('desconhecido');
    expect(await situacaoDoNomeNaEvolution(async () => resposta(200, { erro: true }), 'vendas_k3f9')).toBe('desconhecido');
    expect(
      await situacaoDoNomeNaEvolution(async () => {
        throw new Error('rede');
      }, 'vendas_k3f9'),
    ).toBe('desconhecido');
  });

  it('a recusa de nome repetido no /instance/create vira "nome em uso", não "acesso recusado"', () => {
    expect(nomeEmUsoNaCriacao(403, '{"status":403,"response":{"message":["This name \\"vendas\\" is already in use."]}}')).toBe(true);
    expect(nomeEmUsoNaCriacao(403, '{"message":"Forbidden"}')).toBe(false);
    expect(nomeEmUsoNaCriacao(500, 'already in use')).toBe(false);
  });

  it('evolution-provision pergunta antes de criar e responde 409 com a frase', () => {
    const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const fonte = fs.readFileSync(path.join(raiz, 'supabase/functions/evolution-provision/index.ts'), 'utf8');
    const conferencia = fonte.indexOf('situacaoDoNomeNaEvolution(');
    const criacao = fonte.indexOf("'/instance/create'");
    expect(conferencia).toBeGreaterThan(0);
    expect(conferencia).toBeLessThan(criacao);
    expect(fonte).toMatch(/MENSAGEM_NOME_EM_USO_NO_SERVIDOR \}, 409\)/);
    expect(fonte).toMatch(/nomeEmUsoNaCriacao\(createRes\.status/);
  });
});

describe('tipo de conexão e quem tem nome no servidor', () => {
  it('os quatro rótulos da decisão do dono', () => {
    expect(tipoDeConexao('evolution')).toBe('QR Code (Evolution)');
    expect(tipoDeConexao(null)).toBe('QR Code (Evolution)');
    expect(tipoDeConexao('waha')).toBe('Seu servidor (WAHA)');
    expect(tipoDeConexao('official')).toBe('API oficial da Meta');
    expect(tipoDeConexao('instagram')).toBe('Instagram');
  });

  it('só Evolution e WAHA têm nome no servidor', () => {
    expect(temNomeNoServidor('evolution')).toBe(true);
    expect(temNomeNoServidor(null)).toBe(true);
    expect(temNomeNoServidor('waha')).toBe(true);
    expect(temNomeNoServidor('official')).toBe(false);
    expect(temNomeNoServidor('instagram')).toBe(false);
  });
});

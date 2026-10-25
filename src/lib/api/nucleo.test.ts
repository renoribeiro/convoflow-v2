/**
 * O núcleo da API pública (supabase/functions/_shared/api/nucleo.ts). Roda no
 * Deno, mas não importa nada do Deno: o banco entra por parâmetro, e aqui é
 * falso. A prova do RLS de verdade é a suíte SQL docs/teste_api_chaves.sql.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  apiLiberada,
  arrayDeUuids,
  atenderRest,
  CAMPOS_APROVADOS,
  caminhoDaApi,
  chaveBemFormada,
  codificarCursor,
  decodificarCursor,
  erroDoUso,
  ErroApi,
  executarLeitura,
  filtrosParaRegistro,
  hashDaChave,
  ipDoPedido,
  lerChaveDoPedido,
  mapearContato,
  mapearConversa,
  mapearEtapa,
  mapearLoja,
  mapearMensagem,
  mapearMetricas,
  mapearPessoa,
  montarLeitura,
  ocultarChave,
  rotaRest,
  ROTAS_REST,
  sqlDaChamada,
  type Chamada,
  type ComoDono,
  type Contexto,
  type DependenciasApi,
  type LinhaDeRegistro,
  type UsoDaChave,
} from '../../../supabase/functions/_shared/api/nucleo';

// Chave inventada, montada em pedaços para a checagem de dado pessoal não
// confundir com uma chave de verdade.
const CHAVE = 'cf_live_' + 'Teste'.repeat(6) + 'Ab';
const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const LOJA_1 = 'aaaaaaaa-0000-4000-8000-000000000002';
const LOJA_2 = 'aaaaaaaa-0000-4000-8000-000000000003';
const LOJA_FORA = 'aaaaaaaa-0000-4000-8000-0000000000ff';
const DONO = 'aaaaaaaa-0000-4000-8000-00000000000a';
const CHAVE_ID = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const CONVERSA = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const ORIGEM = 'https://projeto-teste.supabase.co';

const hdr = (h: Record<string, string>) => new Headers(h);

function usoOk(extra: Partial<UsoDaChave> = {}): UsoDaChave {
  return {
    resultado: 'ok',
    chave_id: CHAVE_ID,
    conta_id: CONTA,
    dono_user_id: DONO,
    escopos: ['contatos', 'conversas', 'mensagens', 'funil', 'equipe', 'metricas', 'midia'],
    lojas: [CONTA, LOJA_1, LOJA_2],
    restante_minuto: 59,
    restante_dia: 4999,
    ...extra,
  };
}

/** Linhas do banco com colunas a MAIS (inclusive proibidas): o mapeador tem de jogar fora. */
const LIXO = {
  connection_config: { token: 'segredo' },
  evolution_api_key: 'segredo',
  stripe_customer_id: 'cus_FAKE123',
  ip_address: '10.0.0.1',
  capabilities: { tudo: true },
  notes: 'nota interna',
  media_url: `${LOJA_1}/inbound/wamid.X.jpg`,
  hash: 'f'.repeat(64),
};

interface Fake {
  deps: DependenciasApi;
  registros: LinhaDeRegistro[];
  chamadas: Chamada[];
  ordem: string[];
  log: ReturnType<typeof vi.fn>;
}

function fake(opts: {
  uso?: UsoDaChave | null | 'lanca';
  papel?: string;
  uid?: string;
  liberada?: boolean;
  linhas?: (c: Chamada) => Record<string, unknown>[];
  registrarLanca?: boolean;
  habilitada?: string;
  contasDeTeste?: string;
} = {}): Fake {
  const registros: LinhaDeRegistro[] = [];
  const chamadas: Chamada[] = [];
  const ordem: string[] = [];
  const log = vi.fn();
  const deps: DependenciasApi = {
    log,
    agora: () => new Date('2026-10-24T12:00:00Z'),
    origemDoProjeto: ORIGEM,
    liberacao: { habilitada: opts.habilitada ?? 'true', contasDeTeste: opts.contasDeTeste ?? '' },
    async usarChave() {
      ordem.push('usarChave');
      if (opts.uso === 'lanca') throw new Error('banco fora');
      return opts.uso === undefined ? usoOk() : opts.uso;
    },
    async comoDono(userId, fn) {
      ordem.push(`comoDono:${userId}`);
      const q: ComoDono = {
        async quemSou() {
          ordem.push('quemSou');
          return { papel: opts.papel ?? 'authenticated', uid: opts.uid ?? userId };
        },
        async contaLiberada() {
          ordem.push('contaLiberada');
          return opts.liberada ?? true;
        },
        async chamar(c) {
          ordem.push(`chamar:${c.funcao}`);
          chamadas.push(c);
          return opts.linhas ? opts.linhas(c) : [];
        },
      };
      return fn(q);
    },
    async assinar(caminhos, validade) {
      ordem.push(`assinar:${validade}`);
      return caminhos.map((p) => ({ path: p, signedUrl: `${ORIGEM}/storage/v1/object/sign/whatsapp-media/${p}?token=t` }));
    },
    async registrar(l) {
      if (opts.registrarLanca) throw new Error('insert falhou');
      registros.push(l);
    },
  };
  return { deps, registros, chamadas, ordem, log };
}

const pedido = (caminho: string, cab: Record<string, string> = { authorization: `Bearer ${CHAVE}` }, metodo = 'GET') => ({
  metodo,
  url: `${ORIGEM}/functions/v1/api-v1${caminho}`,
  cabecalhos: hdr(cab),
});

describe('a chave', () => {
  it('lê do Authorization: Bearer e do X-API-Key', () => {
    expect(lerChaveDoPedido(hdr({ authorization: `Bearer ${CHAVE}` }))).toBe(CHAVE);
    expect(lerChaveDoPedido(hdr({ authorization: `bearer   ${CHAVE}  ` }))).toBe(CHAVE);
    expect(lerChaveDoPedido(hdr({ 'x-api-key': CHAVE }))).toBe(CHAVE);
    expect(lerChaveDoPedido(hdr({}))).toBeNull();
    expect(lerChaveDoPedido(hdr({ authorization: 'Basic abc' }))).toBeNull();
  });

  it('formato: cf_live_ + 32 letras e números', () => {
    expect(chaveBemFormada(CHAVE)).toBe(true);
    expect(chaveBemFormada(CHAVE.slice(0, -1))).toBe(false);
    expect(chaveBemFormada(CHAVE + 'x')).toBe(false);
    expect(chaveBemFormada(CHAVE.replace('cf_live_', 'cf_test_'))).toBe(false);
    expect(chaveBemFormada(CHAVE.slice(0, -1) + '-')).toBe(false);
  });

  it('hash: SHA-256 em hex, igual ao do banco (sha256(convert_to(chave, UTF8)))', async () => {
    // sha256("abc") conhecido
    expect(await hashDaChave('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await hashDaChave(CHAVE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('nada com cara de chave sai em texto de log', () => {
    expect(ocultarChave(`falhou com ${CHAVE} no meio`)).toBe('falhou com cf_live_*** no meio');
  });

  it('IP: primeiro do x-forwarded-for', () => {
    expect(ipDoPedido(hdr({ 'x-forwarded-for': '10.0.0.7, 10.0.0.8' }))).toBe('10.0.0.7');
    expect(ipDoPedido(hdr({ 'x-real-ip': '10.0.0.9' }))).toBe('10.0.0.9');
    expect(ipDoPedido(hdr({}))).toBeNull();
  });
});

describe('a chave de liberação do servidor', () => {
  it('API_ADDON_ENABLED=true abre para todos', () => {
    expect(apiLiberada('true', '', CONTA)).toBe(true);
  });
  it('desligada: só as Contas da lista de teste', () => {
    expect(apiLiberada(undefined, CONTA, CONTA)).toBe(true);
    expect(apiLiberada('false', ` ${CONTA.toUpperCase()} , lixo`, CONTA)).toBe(true);
    expect(apiLiberada('false', CONTA, LOJA_1)).toBe(false);
    expect(apiLiberada('', '', CONTA)).toBe(false);
    expect(apiLiberada('TRUE', '', CONTA)).toBe(false);
    expect(apiLiberada(undefined, CONTA, null)).toBe(false);
  });
});

describe('resultado de api_chave_usar → erro', () => {
  it.each([
    ['ok', null],
    ['chave_invalida', 'chave_invalida'],
    ['chave_revogada', 'chave_revogada'],
    ['chave_expirada', 'chave_expirada'],
    ['dono_inativo', 'dono_inativo'],
    ['api_desligada', 'api_desligada'],
    ['limite_minuto', 'limite_minuto'],
    ['limite_dia', 'limite_dia'],
    ['qualquer_outra', 'indisponivel'],
    [null, 'indisponivel'],
  ])('%s → %s', (r, e) => {
    expect(erroDoUso(r as string | null)).toBe(e);
  });
});

describe('cursor e parâmetros', () => {
  it('cursor vai e volta; lixo é parâmetro inválido', () => {
    const c = { ts: '2026-10-01T10:00:00.000Z', id: CONTA };
    expect(decodificarCursor(codificarCursor(c))).toEqual(c);
    expect(() => decodificarCursor('nao-e-cursor')).toThrow(ErroApi);
    expect(() => decodificarCursor(btoa('{"t":"x","i":"y"}'))).toThrow(/cursor/);
  });

  it('parâmetro desconhecido é erro (errar o nome de um filtro não vira "tudo")', () => {
    expect(() => montarLeitura('contatos', { loja: LOJA_1 })).toThrow(/desconhecido: loja/);
  });

  it('limite de 1 a 100, padrão 50', () => {
    expect((montarLeitura('contatos', {}) as { limite: number }).limite).toBe(50);
    expect((montarLeitura('contatos', { limite: '100' }) as { limite: number }).limite).toBe(100);
    expect(() => montarLeitura('contatos', { limite: '101' })).toThrow(/limite/);
    expect(() => montarLeitura('contatos', { limite: '0' })).toThrow(/limite/);
    expect(() => montarLeitura('contatos', { limite: '2.5' })).toThrow(/limite/);
  });

  it('ids, datas e booleanos', () => {
    expect(() => montarLeitura('contatos', { loja_id: 'x' })).toThrow(/loja_id/);
    expect(() => montarLeitura('conversas', { desde: 'ontem' })).toThrow(/desde/);
    expect(() => montarLeitura('conversas', { arquivada: 'talvez' })).toThrow(/arquivada/);
    const l = montarLeitura('conversas', { arquivada: 'false', desde: '2026-10-01' });
    expect(l).toMatchObject({ arquivada: false, desde: '2026-10-01T00:00:00.000Z' });
  });

  it('rotas da v1 e o prefixo da função', () => {
    expect(caminhoDaApi('/api-v1/v1/contatos')).toBe('/v1/contatos');
    expect(caminhoDaApi('/functions/v1/api-v1/v1/lojas/')).toBe('/v1/lojas');
    expect(caminhoDaApi('/v1/lojas')).toBe('/v1/lojas');
    expect(rotaRest('/v1/contatos')).toEqual({ rota: '/v1/contatos', recurso: 'contatos' });
    expect(rotaRest(`/v1/conversas/${CONVERSA}/mensagens`)).toEqual({
      rota: '/v1/conversas/{id}/mensagens', recurso: 'mensagens', conversaId: CONVERSA,
    });
    expect(rotaRest('/v1/conversas/xx/mensagens')).toBeNull();
    expect(rotaRest('/v1/tenants')).toBeNull();
    expect(ROTAS_REST.map((r) => r.caminho)).toHaveLength(7);
  });

  it('a chamada SQL só aceita função e tipo da lista fixa', () => {
    expect(sqlDaChamada({ funcao: 'api_v1_lojas', tipos: ['uuid[]'], args: ['{}'] })).toBe(
      'SELECT * FROM public.api_v1_lojas($1::uuid[])',
    );
    expect(() => sqlDaChamada({ funcao: 'tenants' as never, tipos: [], args: [] })).toThrow(/fora da lista/);
    expect(() => sqlDaChamada({ funcao: 'api_v1_lojas', tipos: ['uuid); DROP TABLE x;--'], args: [1] })).toThrow(/tipo/);
    expect(() => arrayDeUuids(['x'])).toThrow();
  });

  it('o registro guarda só filtros conhecidos e nunca a chave', () => {
    expect(filtrosParaRegistro({ busca: `oi ${CHAVE}`, chave: CHAVE, loja_id: LOJA_1 })).toEqual({
      busca: 'oi cf_live_***',
      loja_id: LOJA_1,
    });
  });
});

describe('nenhum campo proibido em resposta nenhuma', () => {
  const PROIBIDOS = /connection_config|evolution|stripe|ip_address|capabilit|notes|media_url|hash|token|secret/i;
  const casos: Array<[keyof typeof CAMPOS_APROVADOS, (l: Record<string, unknown>) => unknown]> = [
    ['lojas', mapearLoja],
    ['contatos', mapearContato],
    ['conversas', mapearConversa],
    ['mensagens', (l) => mapearMensagem(l)],
    ['funil', mapearEtapa],
    ['equipe', mapearPessoa],
    ['metricas', mapearMetricas],
  ];
  it.each(casos)('%s: só os campos aprovados', (recurso, mapear) => {
    const saida = mapear({ id: CONTA, etapa_id: LOJA_1, ...LIXO }) as Record<string, unknown>;
    const aprovados = CAMPOS_APROVADOS[recurso];
    for (const k of Object.keys(saida)) expect(aprovados).toContain(k);
    expect(JSON.stringify(saida)).not.toMatch(PROIBIDOS);
  });
});

const ctx = (extra: Partial<Contexto> = {}): Contexto => ({
  chaveId: CHAVE_ID,
  contaId: CONTA,
  donoUserId: DONO,
  escopos: ['contatos', 'conversas', 'mensagens', 'funil', 'equipe', 'metricas', 'midia'],
  lojas: [CONTA, LOJA_1, LOJA_2],
  restanteMinuto: 59,
  restanteDia: 4999,
  ...extra,
});

describe('a leitura como o dono', () => {
  it('confere o papel ANTES de ler; como postgres, nada é lido', async () => {
    const f = fake({ papel: 'postgres' });
    await expect(executarLeitura(ctx(), montarLeitura('contatos', {}), f.deps)).rejects.toThrow(/como o dono/);
    expect(f.chamadas).toHaveLength(0);
  });

  it('confere que o sub é o do dono da chave', async () => {
    const f = fake({ uid: 'aaaaaaaa-0000-4000-8000-0000000000bb' });
    await expect(executarLeitura(ctx(), montarLeitura('lojas', {}), f.deps)).rejects.toThrow(/como o dono/);
    expect(f.chamadas).toHaveLength(0);
  });

  it('ordem: dono → quem sou → Conta liberada → leitura', async () => {
    const f = fake();
    await executarLeitura(ctx(), montarLeitura('lojas', {}), f.deps);
    expect(f.ordem).toEqual([`comoDono:${DONO}`, 'quemSou', 'contaLiberada', 'chamar:api_v1_lojas']);
  });

  it('Conta bloqueada (sem pagamento): 402, nada lido', async () => {
    const f = fake({ liberada: false });
    await expect(executarLeitura(ctx(), montarLeitura('contatos', {}), f.deps)).rejects.toMatchObject({ codigo: 'conta_bloqueada', status: 402 });
    expect(f.chamadas).toHaveLength(0);
  });

  it('escopo: chave sem "contatos" não lê contatos', async () => {
    const f = fake();
    await expect(executarLeitura(ctx({ escopos: ['funil'] }), montarLeitura('contatos', {}), f.deps)).rejects.toMatchObject({ codigo: 'sem_permissao' });
    expect(f.ordem).toEqual([]);
  });

  it('Loja fora da chave: recusa; sem Loja: todas as da chave', async () => {
    const f = fake();
    await expect(executarLeitura(ctx(), montarLeitura('funil', { loja_id: LOJA_FORA }), f.deps)).rejects.toMatchObject({ codigo: 'loja_fora_da_chave' });
    await executarLeitura(ctx(), montarLeitura('funil', {}), f.deps);
    expect(f.chamadas[0]?.args[0]).toBe(`{${CONTA},${LOJA_1},${LOJA_2}}`);
    await executarLeitura(ctx(), montarLeitura('funil', { loja_id: LOJA_1 }), f.deps);
    expect(f.chamadas[1]?.args[0]).toBe(`{${LOJA_1}}`);
  });

  it('texto da última mensagem só com o escopo "mensagens"', async () => {
    const f = fake();
    await executarLeitura(ctx({ escopos: ['conversas'] }), montarLeitura('conversas', {}), f.deps);
    await executarLeitura(ctx({ escopos: ['conversas', 'mensagens'] }), montarLeitura('conversas', {}), f.deps);
    expect(f.chamadas.map((c) => c.args[5])).toEqual([false, true]);
  });

  it('paginação: página cheia devolve o cursor da última linha', async () => {
    const linhas = [
      { id: LOJA_1, atualizado_em: '2026-10-03T10:00:00Z' },
      { id: LOJA_2, atualizado_em: '2026-10-02T10:00:00Z' },
    ];
    const f = fake({ linhas: () => linhas });
    const r = await executarLeitura(ctx(), montarLeitura('contatos', { limite: '2' }), f.deps);
    expect(decodificarCursor(r.proximo as string)).toEqual({ ts: '2026-10-02T10:00:00.000Z', id: LOJA_2 });
    const ultima = await executarLeitura(ctx(), montarLeitura('contatos', { limite: '3' }), f.deps);
    expect(ultima.proximo).toBeNull();
  });

  describe('mídia', () => {
    const mensagens = [
      { id: 'aaaaaaaa-0000-4000-8000-0000000000e1', tem_midia: true, tipo: 'image' },
      { id: 'aaaaaaaa-0000-4000-8000-0000000000e2', tem_midia: false, tipo: 'text' },
    ];
    const midia = [
      { id: 'aaaaaaaa-0000-4000-8000-0000000000e1', tenant_id: LOJA_1, direction: 'inbound', evolution_message_id: 'wamid.X', media_url: `${LOJA_1}/inbound/wamid.X.jpg` },
    ];
    const linhas = (c: Chamada) => (c.funcao === 'api_v1_midia' ? midia : mensagens);

    it('midia=1 exige o escopo "midia"', async () => {
      const f = fake({ linhas });
      const l = montarLeitura('mensagens', { midia: '1' }, CONVERSA);
      await expect(executarLeitura(ctx({ escopos: ['mensagens'] }), l, f.deps)).rejects.toMatchObject({ codigo: 'sem_permissao' });
    });

    it('com o escopo: link de 15 minutos, só da mídia da própria mensagem; ids no registro', async () => {
      const f = fake({ linhas });
      const r = await executarLeitura(ctx(), montarLeitura('mensagens', { midia: '1' }, CONVERSA), f.deps);
      expect(f.ordem).toContain('assinar:900');
      const [com, sem] = r.dados as Array<Record<string, unknown>>;
      expect(com?.midia).toEqual({
        url: expect.stringContaining('/object/sign/whatsapp-media/'),
        expira_em: '2026-10-24T12:15:00.000Z',
      });
      expect(sem?.midia).toBeUndefined();
      expect(r.midiaIds).toEqual(['aaaaaaaa-0000-4000-8000-0000000000e1']);
    });

    it('caminho que não bate com a mensagem (outra Loja) não ganha link', async () => {
      const outra = [{ ...midia[0], media_url: `${LOJA_2}/inbound/wamid.X.jpg` }];
      const f = fake({ linhas: (c) => (c.funcao === 'api_v1_midia' ? outra : mensagens) });
      const r = await executarLeitura(ctx(), montarLeitura('mensagens', { midia: '1' }, CONVERSA), f.deps);
      expect(r.midiaIds).toEqual([]);
      expect(f.ordem.some((o) => o.startsWith('assinar'))).toBe(false);
    });

    it('sem midia=1: nem lê a mídia', async () => {
      const f = fake({ linhas });
      await executarLeitura(ctx(), montarLeitura('mensagens', {}, CONVERSA), f.deps);
      expect(f.chamadas.map((c) => c.funcao)).toEqual(['api_v1_mensagens']);
    });

    it('MCP (semMidia): nunca assina, mesmo pedindo', async () => {
      const f = fake({ linhas });
      await expect(
        executarLeitura(ctx(), montarLeitura('mensagens', { midia: '1' }, CONVERSA), f.deps, { semMidia: true }),
      ).rejects.toMatchObject({ codigo: 'sem_permissao' });
    });
  });
});

describe('REST: o pedido inteiro', () => {
  it('sem chave: 401, sem registro (só um endereço batido)', async () => {
    const f = fake();
    const r = await atenderRest(pedido('/v1/lojas', {}), f.deps);
    expect(r.status).toBe(401);
    expect(r.cabecalhos['WWW-Authenticate']).toMatch(/Bearer/);
    expect(f.registros).toHaveLength(0);
    expect(f.ordem).toEqual([]);
  });

  it('chave mal formada: 401 e registrada, sem ir ao banco', async () => {
    const f = fake();
    const r = await atenderRest(pedido('/v1/lojas', { authorization: 'Bearer cf_live_curta' }), f.deps);
    expect(r).toMatchObject({ status: 401, corpo: { erro: { codigo: 'chave_invalida' } } });
    expect(f.ordem).toEqual([]);
    expect(f.registros).toHaveLength(1);
  });

  it.each([
    ['chave_revogada', 401],
    ['chave_expirada', 401],
    ['dono_inativo', 403],
    ['api_desligada', 403],
    ['limite_minuto', 429],
    ['limite_dia', 429],
  ])('%s → %i, registrada, nada lido', async (resultado, status) => {
    const f = fake({ uso: { ...usoOk(), resultado } });
    const r = await atenderRest(pedido('/v1/contatos'), f.deps);
    expect(r.status).toBe(status);
    expect((r.corpo as { erro: { codigo: string } }).erro.codigo).toBe(resultado);
    if (status === 429) expect(r.cabecalhos['Retry-After']).toBeTruthy();
    expect(f.chamadas).toHaveLength(0);
    expect(f.registros).toHaveLength(1);
    expect(f.registros[0]).toMatchObject({ status, resultado, chave_id: CHAVE_ID, conta_id: CONTA });
  });

  it('banco fora na conferência da chave: 503 (na dúvida, recusa)', async () => {
    const f = fake({ uso: 'lanca' });
    const r = await atenderRest(pedido('/v1/contatos'), f.deps);
    expect(r.status).toBe(503);
    expect(f.chamadas).toHaveLength(0);
  });

  it('chave de liberação desligada e Conta fora da lista: 503', async () => {
    const f = fake({ habilitada: 'false', contasDeTeste: LOJA_FORA });
    const r = await atenderRest(pedido('/v1/lojas'), f.deps);
    expect(r).toMatchObject({ status: 503, corpo: { erro: { codigo: 'indisponivel' } } });
    expect(f.chamadas).toHaveLength(0);
  });

  it('desligada, mas Conta de teste: atende', async () => {
    const f = fake({ habilitada: 'false', contasDeTeste: CONTA });
    expect((await atenderRest(pedido('/v1/lojas'), f.deps)).status).toBe(200);
  });

  it('pedido bom: 200, sem cache, limites no cabeçalho, UMA linha de registro', async () => {
    const f = fake({ linhas: () => [{ id: LOJA_1, nome: 'Loja', tipo: 'loja', ...LIXO }] });
    const r = await atenderRest(pedido('/v1/lojas', { authorization: `Bearer ${CHAVE}`, 'x-forwarded-for': '10.0.0.7' }), f.deps);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ dados: [{ id: LOJA_1, nome: 'Loja', tipo: 'loja' }], proximo: null });
    expect(r.cabecalhos).toMatchObject({ 'Cache-Control': 'no-store', 'X-Limite-Restante-Minuto': '59', 'X-Limite-Restante-Dia': '4999' });
    expect(f.registros).toEqual([
      expect.objectContaining({ canal: 'rest', metodo: 'GET', rota: '/v1/lojas', linhas: 1, status: 200, resultado: 'ok', ip: '10.0.0.7' }),
    ]);
  });

  it('registro que não grava: 503 e o dado NÃO sai', async () => {
    const f = fake({ registrarLanca: true, linhas: () => [{ id: LOJA_1, nome: 'Loja', tipo: 'loja' }] });
    const r = await atenderRest(pedido('/v1/lojas'), f.deps);
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.corpo)).not.toContain('Loja');
  });

  it('a chave nunca vai para o registro nem para o log', async () => {
    const f = fake({ uso: 'lanca' });
    await atenderRest(pedido(`/v1/contatos?busca=${CHAVE}`), f.deps);
    const g = fake();
    await atenderRest(pedido(`/v1/contatos?busca=${encodeURIComponent(CHAVE)}`), g.deps);
    const tudo = JSON.stringify([f.registros, f.log.mock.calls, g.registros, g.log.mock.calls]);
    expect(tudo).not.toContain(CHAVE.slice(8));
  });

  it('405 para quem não é GET; 404 para endereço que não existe; OPTIONS sem permissão de CORS', async () => {
    const f = fake();
    expect((await atenderRest(pedido('/v1/lojas', undefined, 'POST'), f.deps)).status).toBe(405);
    expect((await atenderRest(pedido('/v1/tenants'), f.deps)).status).toBe(404);
    const opt = await atenderRest(pedido('/v1/lojas', {}, 'OPTIONS'), f.deps);
    expect(opt.status).toBe(204);
    expect(Object.keys(opt.cabecalhos).join(',')).not.toMatch(/Access-Control/i);
    expect(f.registros.map((r) => r.status)).toEqual([405, 404]);
  });

  it('parâmetro errado: 400 com a explicação, registrado', async () => {
    const f = fake();
    const r = await atenderRest(pedido('/v1/contatos?limite=500'), f.deps);
    expect(r).toMatchObject({ status: 400, corpo: { erro: { codigo: 'parametro_invalido' } } });
    expect(f.registros).toHaveLength(1);
  });

  it('o ?host= que o Vercel acrescenta (api.convoflow.com.br) é ignorado; outro host continua erro', async () => {
    // Achado na ida ao ar (2026-10-25): a regra "has: host" do vercel.json repassa
    // o host casado como parâmetro, e todo pedido pelo endereço público dava 400.
    const f = fake();
    expect((await atenderRest(pedido('/v1/lojas?host=api.convoflow.com.br'), f.deps)).status).toBe(200);
    expect((await atenderRest(pedido('/v1/contatos?limite=2&host=api.convoflow.com.br'), f.deps)).status).toBe(200);
    const outro = await atenderRest(pedido('/v1/lojas?host=outro.exemplo.com.br'), f.deps);
    expect(outro).toMatchObject({ status: 400, corpo: { erro: { codigo: 'parametro_invalido' } } });
    expect(f.registros.map((r) => r.filtros)).not.toContainEqual(expect.objectContaining({ host: expect.anything() }));
  });

  it('erro inesperado na leitura: 500 sem detalhe interno', async () => {
    const f = fake({ papel: 'postgres' });
    const r = await atenderRest(pedido('/v1/lojas'), f.deps);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.corpo)).not.toMatch(/dono|postgres/);
  });
});

describe('a ponte com o banco (banco.ts) troca de papel antes de ler', () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const banco = fs.readFileSync(path.resolve(HERE, '../../../supabase/functions/_shared/api/banco.ts'), 'utf8');
  const nucleo = fs.readFileSync(path.resolve(HERE, '../../../supabase/functions/_shared/api/nucleo.ts'), 'utf8');

  it('SET LOCAL ROLE authenticated e o sub do dono, dentro da transação, antes de entregar o executor', () => {
    const inicio = banco.indexOf('sql().begin(');
    const papel = banco.indexOf("SET LOCAL ROLE authenticated", inicio);
    const claims = banco.indexOf("set_config('request.jwt.claims'", inicio);
    const entrega = banco.indexOf('return await fn(q)', inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(papel).toBeGreaterThan(inicio);
    expect(claims).toBeGreaterThan(papel);
    expect(entrega).toBeGreaterThan(claims);
  });

  it('o núcleo não conhece a chave de serviço', () => {
    expect(nucleo).not.toMatch(/SERVICE_ROLE|service_role|createClient/);
  });
});

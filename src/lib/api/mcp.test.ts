/**
 * As ferramentas MCP (supabase/functions/_shared/api/mcp.ts): os 7 nomes do
 * estudo, descrições em pt-BR, só leitura, e nunca mídia (decisão do dono).
 */
import { describe, expect, it } from 'vitest';

import { avisoDeMidia, FERRAMENTAS, INSTRUCOES_DO_SERVIDOR, rodarFerramenta } from '../../../supabase/functions/_shared/api/mcp';
import { montarLeitura, type Chamada, type Contexto, type DependenciasApi } from '../../../supabase/functions/_shared/api/nucleo';

const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const LOJA = 'aaaaaaaa-0000-4000-8000-000000000002';
const DONO = 'aaaaaaaa-0000-4000-8000-00000000000a';
const CONVERSA = 'aaaaaaaa-0000-4000-8000-0000000000d1';

const ctx = (escopos: Contexto['escopos'] = ['contatos', 'conversas', 'mensagens', 'funil', 'equipe', 'metricas', 'midia']): Contexto => ({
  chaveId: 'aaaaaaaa-0000-4000-8000-0000000000c1',
  contaId: CONTA,
  donoUserId: DONO,
  escopos,
  lojas: [CONTA, LOJA],
  restanteMinuto: 10,
  restanteDia: 10,
});

function deps(linhas: (c: Chamada) => Record<string, unknown>[] = () => []) {
  const chamadas: Chamada[] = [];
  let assinou = false;
  const d: DependenciasApi = {
    agora: () => new Date('2026-10-24T12:00:00Z'),
    liberacao: { habilitada: 'true', contasDeTeste: '' },
    usarChave: async () => null,
    comoDono: async (uid, fn) =>
      fn({
        quemSou: async () => ({ papel: 'authenticated', uid }),
        contaLiberada: async () => true,
        chamar: async (c) => {
          chamadas.push(c);
          return linhas(c);
        },
      }),
    assinar: async () => {
      assinou = true;
      return [];
    },
    registrar: async () => {},
  };
  return { d, chamadas, assinou: () => assinou };
}

describe('ferramentas MCP', () => {
  it('as 7 do estudo, com título e descrição em pt-BR', () => {
    expect(FERRAMENTAS.map((f) => f.nome)).toEqual([
      'listar_lojas', 'buscar_contatos', 'listar_conversas', 'ler_conversa', 'resumo_funil', 'metricas', 'equipe',
    ]);
    for (const f of FERRAMENTAS) {
      expect(f.descricao.length).toBeGreaterThan(40);
      expect(f.titulo).toBeTruthy();
    }
    expect(INSTRUCOES_DO_SERVIDOR).toMatch(/só para leitura/);
  });

  it('cada entrada é aceita pela leitura do recurso (nenhum campo inventado)', () => {
    for (const f of FERRAMENTAS) {
      const exemplo: Record<string, unknown> = {};
      for (const [k, c] of Object.entries(f.entrada)) {
        exemplo[k] = c.tipo === 'uuid' ? LOJA : c.tipo === 'data' ? '2026-10-01' : c.tipo === 'booleano' ? true : c.tipo === 'inteiro' ? 10 : 'x';
      }
      delete exemplo.cursor;
      expect(() => montarLeitura(f.recurso, exemplo)).not.toThrow();
    }
  });

  it('nenhuma ferramenta aceita pedir mídia', () => {
    for (const f of FERRAMENTAS) expect(Object.keys(f.entrada)).not.toContain('midia');
  });

  it('ler_conversa: diz "tem foto"/"tem áudio" e nunca assina link, mesmo com midia nos argumentos', async () => {
    const { d, chamadas, assinou } = deps(() => [
      { id: 'aaaaaaaa-0000-4000-8000-0000000000e1', tem_midia: true, tipo: 'image' },
      { id: 'aaaaaaaa-0000-4000-8000-0000000000e2', tem_midia: true, tipo: 'audio' },
      { id: 'aaaaaaaa-0000-4000-8000-0000000000e3', tem_midia: false, tipo: 'text' },
    ]);
    const r = await rodarFerramenta('ler_conversa', { conversa_id: CONVERSA, midia: true }, ctx(), d);
    expect(r.erro).toBeNull();
    const dados = JSON.parse(r.texto).dados as Array<Record<string, unknown>>;
    expect(dados.map((m) => m.midia)).toEqual(['tem foto', 'tem áudio', undefined]);
    expect(JSON.stringify(dados)).not.toMatch(/url|sign/);
    expect(chamadas.map((c) => c.funcao)).toEqual(['api_v1_mensagens']);
    expect(assinou()).toBe(false);
  });

  it('escopo faltando volta como erro da ferramenta, sem ler', async () => {
    const { d, chamadas } = deps();
    const r = await rodarFerramenta('ler_conversa', { conversa_id: CONVERSA }, ctx(['conversas']), d);
    expect(r.erro?.codigo).toBe('sem_permissao');
    expect(chamadas).toHaveLength(0);
  });

  it('parâmetro inválido vira erro legível', async () => {
    const { d } = deps();
    const r = await rodarFerramenta('buscar_contatos', { loja_id: 'nao-e-id' }, ctx(), d);
    expect(r.erro?.codigo).toBe('parametro_invalido');
    expect(r.texto).toMatch(/loja_id/);
  });

  it('ferramenta desconhecida', async () => {
    const { d } = deps();
    expect((await rodarFerramenta('apagar_tudo', {}, ctx(), d)).erro?.codigo).toBe('nao_encontrado');
  });

  it('avisos de mídia', () => {
    expect(avisoDeMidia('image')).toBe('tem foto');
    expect(avisoDeMidia('ptt')).toBe('tem áudio');
    expect(avisoDeMidia('document')).toBe('tem documento');
    expect(avisoDeMidia(null)).toBe('tem arquivo');
  });
});

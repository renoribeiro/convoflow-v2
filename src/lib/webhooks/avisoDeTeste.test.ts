import { describe, it, expect, vi } from 'vitest';
import {
  entregarAviso,
  cabecalhosDoAviso,
  motivoDaFalha,
} from '../../../supabase/functions/_shared/webhook-entrega.ts';
import {
  enviarAvisoDeTeste,
  LEAD_DE_TESTE,
  TESTES_POR_MINUTO,
  type DepsDoTeste,
} from '../../../supabase/functions/_shared/aviso-de-teste.ts';
import { OutboundUrlError } from '../../../supabase/functions/_shared/safe-outbound-url.ts';

const PUBLICO = async () => ['8.8.8.8'];
const INTERNO = async () => ['10.0.0.5'];

function resposta(status: number): Response {
  return new Response(status === 204 ? null : 'ok', { status });
}

describe('entregarAviso', () => {
  it('aceita 2xx e devolve o código', async () => {
    const f = vi.fn(async () => resposta(200));
    const r = await entregarAviso('https://hook.exemplo.com/x', '{}', {}, { fetchImpl: f as unknown as typeof fetch, resolver: PUBLICO });
    expect(r).toEqual({ aceito: true, status: 200, erro: null });
    expect(f).toHaveBeenCalledOnce();
  });

  it('código de erro vira "HTTP n" com o código guardado', async () => {
    const f = vi.fn(async () => resposta(404));
    const r = await entregarAviso('https://hook.exemplo.com/x', '{}', {}, { fetchImpl: f as unknown as typeof fetch, resolver: PUBLICO });
    expect(r).toEqual({ aceito: false, status: 404, erro: 'HTTP 404' });
  });

  it('endereço de rede interna é recusado antes de sair', async () => {
    const f = vi.fn(async () => resposta(200));
    const r = await entregarAviso('https://interno.exemplo.com/x', '{}', {}, { fetchImpl: f as unknown as typeof fetch, resolver: INTERNO });
    expect(r).toEqual({ aceito: false, status: null, erro: 'endereco_bloqueado: private_address' });
    expect(f).not.toHaveBeenCalled();
    const ip = await entregarAviso('http://169.254.169.254/latest', '{}', {}, { fetchImpl: f as unknown as typeof fetch, resolver: PUBLICO });
    expect(ip.erro).toBe('endereco_bloqueado: private_address');
  });

  it('redirecionamento não é seguido', async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://10.0.0.1' } }));
    const r = await entregarAviso('https://hook.exemplo.com/x', '{}', {}, { fetchImpl: f as unknown as typeof fetch, resolver: PUBLICO });
    expect(r.erro).toBe('endereco_bloqueado: redirect');
    expect((f.mock.calls[0] as unknown[] | undefined)?.[1]).toMatchObject({ redirect: 'manual', method: 'POST' });
  });

  it('demora vira tempo_esgotado; queda de rede vira sem_conexao', async () => {
    const lento = vi.fn(async () => { throw new DOMException('timeout', 'TimeoutError'); });
    const r = await entregarAviso('https://hook.exemplo.com/x', '{}', {}, { fetchImpl: lento as unknown as typeof fetch, resolver: PUBLICO });
    expect(r).toEqual({ aceito: false, status: null, erro: 'tempo_esgotado' });
    expect(motivoDaFalha(new TypeError('fetch failed'))).toBe('sem_conexao');
    expect(motivoDaFalha(new OutboundUrlError('unresolved', 'x'))).toBe('endereco_bloqueado: unresolved');
  });
});

describe('cabecalhosDoAviso', () => {
  it('assina só com senha e marca o teste', async () => {
    const sem = await cabecalhosDoAviso({ evento: 'lead.novo', entregaId: 'e1', corpo: '{}' });
    expect(sem).toEqual({ 'Content-Type': 'application/json', 'X-ConvoFlow-Event': 'lead.novo', 'X-ConvoFlow-Delivery': 'e1' });
    const com = await cabecalhosDoAviso({ evento: 'lead.novo', entregaId: 'e1', corpo: '{}', segredo: 's', teste: true });
    expect(com['X-ConvoFlow-Test']).toBe('true');
    expect(com['X-ConvoFlow-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});

const LOJA = { id: 'loja-1', name: 'Loja Centro', kind: 'store', parent_tenant_id: 'conta-1' };
const AVISO = { id: 'aviso-1', tenant_id: 'loja-1', url: 'https://hook.exemplo.com/x', secret: null };

function deps(over: Partial<DepsDoTeste> = {}): DepsDoTeste & { gravados: unknown[]; enviados: unknown[] } {
  const gravados: unknown[] = [];
  const enviados: unknown[] = [];
  return {
    chamador: { tenant_id: 'loja-1', role: 'gestor', status: 'active' },
    aviso: AVISO,
    lojaDoAviso: LOJA,
    testesNoUltimoMinuto: async () => 0,
    montarCorpo: async (loja) => ({ lead_id: LEAD_DE_TESTE.lead_id, nome: LEAD_DE_TESTE.nome, loja }),
    entregar: async (url, corpo, cab) => {
      enviados.push({ url, corpo, cab });
      return { aceito: true, status: 200, erro: null };
    },
    gravarHistorico: async (linha) => {
      gravados.push(linha);
      return { error: null };
    },
    novoId: () => 'entrega-1',
    gravados,
    enviados,
    ...over,
  } as DepsDoTeste & { gravados: unknown[]; enviados: unknown[] };
}

describe('enviarAvisoDeTeste', () => {
  it('gestor da Loja: manda o Lead novo falso, grava no histórico e devolve o código', async () => {
    const d = deps();
    const r = await enviarAvisoDeTeste(d);
    expect(r).toEqual({ status: 200, body: { ok: true, aceito: true, status: 200, erro: null, no_historico: true } });
    const env = d.enviados[0] as { url: string; corpo: string; cab: Record<string, string> };
    expect(env.url).toBe(AVISO.url);
    expect(JSON.parse(env.corpo)).toEqual({ lead_id: LEAD_DE_TESTE.lead_id, nome: LEAD_DE_TESTE.nome, loja: 'Loja Centro' });
    expect(env.cab['X-ConvoFlow-Event']).toBe('lead.novo');
    expect(env.cab['X-ConvoFlow-Test']).toBe('true');
    expect(env.cab['X-ConvoFlow-Delivery']).toBe('entrega-1');
    expect(d.gravados[0]).toMatchObject({ id: 'entrega-1', tenant_id: 'loja-1', webhook_id: 'aviso-1' });
  });

  it('os dados do teste são claramente falsos', () => {
    expect(LEAD_DE_TESTE.lead_id).toBe('00000000-0000-4000-8000-000000000000');
    expect(LEAD_DE_TESTE.nome).toMatch(/teste/i);
    expect(LEAD_DE_TESTE.mensagem).toMatch(/teste/i);
    expect(LEAD_DE_TESTE.telefone).toMatch(/99999/);
  });

  it('gerente na Loja filha da Conta dele: pode', async () => {
    const r = await enviarAvisoDeTeste(deps({ chamador: { tenant_id: 'conta-1', role: 'gerente', status: 'active' } }));
    expect(r.status).toBe(200);
  });

  it('gerente de outra Conta: "não existe", e nada sai', async () => {
    const d = deps({ chamador: { tenant_id: 'conta-2', role: 'gerente', status: 'active' } });
    const r = await enviarAvisoDeTeste(d);
    expect(r.status).toBe(404);
    expect(d.enviados).toHaveLength(0);
    expect(d.gravados).toHaveLength(0);
  });

  it('gestor de outra Loja: "não existe"', async () => {
    const r = await enviarAvisoDeTeste(deps({ chamador: { tenant_id: 'loja-2', role: 'gestor', status: 'active' } }));
    expect(r.status).toBe(404);
  });

  it('atendente (sem store.admin) não testa', async () => {
    const d = deps({ chamador: { tenant_id: 'loja-1', role: 'atendente', status: 'active' } });
    const r = await enviarAvisoDeTeste(d);
    expect(r.status).toBe(403);
    expect(d.enviados).toHaveLength(0);
  });

  it('suspenso não testa', async () => {
    const r = await enviarAvisoDeTeste(deps({ chamador: { tenant_id: 'loja-1', role: 'gestor', status: 'suspended' } }));
    expect(r.status).toBe(403);
  });

  it('superadmin sem Conta no perfil pode', async () => {
    const r = await enviarAvisoDeTeste(deps({ chamador: { tenant_id: null, role: 'superadmin', status: 'active' } }));
    expect(r.status).toBe(200);
  });

  it(`no máximo ${TESTES_POR_MINUTO} por minuto`, async () => {
    const d = deps({ testesNoUltimoMinuto: async () => TESTES_POR_MINUTO });
    const r = await enviarAvisoDeTeste(d);
    expect(r.status).toBe(429);
    expect(String(r.body.error)).not.toMatch(/[-–—]/);
    expect(d.enviados).toHaveLength(0);
  });

  it('o outro sistema recusa: volta o código, e o histórico guarda', async () => {
    const d = deps({ entregar: async () => ({ aceito: false, status: 404, erro: 'HTTP 404' }) });
    const r = await enviarAvisoDeTeste(d);
    expect(r.body).toMatchObject({ ok: true, aceito: false, status: 404, erro: 'HTTP 404' });
    expect(d.gravados[0]).toMatchObject({ resultado: { aceito: false, status: 404 } });
  });

  it('aviso que não existe', async () => {
    const r = await enviarAvisoDeTeste(deps({ aviso: null }));
    expect(r.status).toBe(404);
  });

  it('banco sem o corpo: pede para tentar de novo e não manda nada', async () => {
    const d = deps({ montarCorpo: async () => { throw new Error('x'); } });
    const r = await enviarAvisoDeTeste(d);
    expect(r.status).toBe(503);
    expect(d.enviados).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Item 14, lote 2: porta dos 6 workers do cron e do automation-processor.
import {
  CRON_SECRET_HEADER,
  CRON_SECRET_RPC,
  carriesSecretKey,
  cronSecretLoader,
  decideBackendCaller,
  parseKeyDictionary,
  resetCronSecretCache,
  secretKeys,
} from '../../../supabase/functions/_shared/backend-caller';

const PUB = 'sb_publishable_teste123';
const SEC = 'sb_secret_teste456';
const SEC_SERVICE = 'sb_secret_do_cliente_de_servico';
const LEGACY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura';
const CRON = 'c'.repeat(64);

const env: Record<string, string> = {
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }),
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: SEC }),
  SUPABASE_SERVICE_ROLE_KEY: SEC_SERVICE,
  SUPABASE_ANON_KEY: PUB,
};
const getEnv = (n: string) => env[n];

function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

async function decide(headers: Headers, cron: string | null = CRON, keys = secretKeys(getEnv)) {
  let loads = 0;
  const decision = await decideBackendCaller(headers, {
    secretKeys: keys,
    loadCronSecret: async () => {
      loads++;
      return cron;
    },
  });
  return { decision, loads };
}

describe('secretKeys', () => {
  it('junta o dicionário novo e a chave do cliente de serviço', () => {
    expect([...secretKeys(getEnv)].sort()).toEqual([SEC, SEC_SERVICE].sort());
  });

  it('nunca inclui a publishable nem uma legada (JWT)', () => {
    const keys = secretKeys((n) =>
      ({
        SUPABASE_SECRET_KEYS: JSON.stringify({ a: SEC, b: PUB, c: LEGACY }),
        SUPABASE_SERVICE_ROLE_KEY: LEGACY,
      })[n],
    );
    expect([...keys]).toEqual([SEC]);
  });

  it('dicionário inválido vira lista vazia', () => {
    expect(parseKeyDictionary('não é json')).toEqual([]);
    expect(parseKeyDictionary('["sb_secret_x"]')).toEqual([]);
    expect(parseKeyDictionary(undefined)).toEqual([]);
  });
});

describe('carriesSecretKey', () => {
  const keys = new Set([SEC]);
  it('aceita no apikey e no Bearer', () => {
    expect(carriesSecretKey(h({ apikey: SEC }), keys)).toBe(true);
    expect(carriesSecretKey(h({ Authorization: `Bearer ${SEC}` }), keys)).toBe(true);
  });
  it('recusa publishable e lista vazia', () => {
    expect(carriesSecretKey(h({ apikey: PUB }), keys)).toBe(false);
    expect(carriesSecretKey(h({ apikey: SEC }), new Set())).toBe(false);
  });
});

describe('decideBackendCaller', () => {
  it('cron com o segredo certo passa', async () => {
    const { decision } = await decide(h({ apikey: PUB, [CRON_SECRET_HEADER]: CRON }));
    expect(decision).toEqual({ ok: true, via: 'cron-secret' });
  });

  it('motor do chatbot com a chave secreta passa, sem ler o Vault', async () => {
    const { decision, loads } = await decide(h({ apikey: SEC_SERVICE, Authorization: `Bearer ${SEC_SERVICE}` }));
    expect(decision).toEqual({ ok: true, via: 'secret-key' });
    expect(loads).toBe(0);
  });

  it('publishable sozinha NÃO passa — era a porta aberta antes do lote 2', async () => {
    const { decision, loads } = await decide(h({ apikey: PUB, Authorization: `Bearer ${PUB}` }));
    expect(decision).toMatchObject({ ok: false, status: 401 });
    expect(loads).toBe(0); // sem cabeçalho do cron, não custa RPC
  });

  it('legada não passa', async () => {
    const { decision } = await decide(h({ apikey: LEGACY, Authorization: `Bearer ${LEGACY}` }));
    expect(decision).toMatchObject({ ok: false, status: 401 });
  });

  it('segredo errado ou de outro tamanho: 401', async () => {
    expect((await decide(h({ [CRON_SECRET_HEADER]: 'd'.repeat(64) }))).decision).toMatchObject({ ok: false, status: 401 });
    expect((await decide(h({ [CRON_SECRET_HEADER]: CRON.slice(1) }))).decision).toMatchObject({ ok: false, status: 401 });
  });

  it('Vault sem segredo, curto ou com erro: 503 (falha fechada)', async () => {
    expect((await decide(h({ [CRON_SECRET_HEADER]: CRON }), null)).decision).toMatchObject({ ok: false, status: 503 });
    expect((await decide(h({ [CRON_SECRET_HEADER]: 'curto' }), 'curto')).decision).toMatchObject({ ok: false, status: 503 });
    const threw = await decideBackendCaller(h({ [CRON_SECRET_HEADER]: CRON }), {
      secretKeys: new Set(),
      loadCronSecret: async () => {
        throw new Error('rpc caiu');
      },
    });
    expect(threw).toMatchObject({ ok: false, status: 503 });
  });

  it('sem chaves secretas no ambiente, o cron continua passando', async () => {
    const { decision } = await decide(h({ [CRON_SECRET_HEADER]: CRON }), CRON, new Set());
    expect(decision).toEqual({ ok: true, via: 'cron-secret' });
  });
});

describe('cronSecretLoader', () => {
  beforeEach(() => resetCronSecretCache());

  function client(values: Array<{ data: unknown; error: unknown }>) {
    const calls: string[] = [];
    return {
      calls,
      rpc: async (fn: string) => {
        calls.push(fn);
        return values[Math.min(calls.length - 1, values.length - 1)];
      },
    };
  }

  it('chama a RPC certa e guarda por 60 s', async () => {
    let t = 1_000;
    const c = client([{ data: CRON, error: null }]);
    const load = cronSecretLoader(c, () => t);
    expect(await load()).toBe(CRON);
    t += 59_000;
    expect(await load()).toBe(CRON);
    expect(c.calls).toEqual([CRON_SECRET_RPC]);
    t += 2_000;
    await load();
    expect(c.calls.length).toBe(2);
  });

  it('não guarda Vault vazio nem erro', async () => {
    const c = client([
      { data: null, error: null },
      { data: null, error: { message: 'x' } },
      { data: CRON, error: null },
    ]);
    const load = cronSecretLoader(c, () => 0);
    expect(await load()).toBeNull();
    expect(await load()).toBeNull();
    expect(await load()).toBe(CRON);
  });
});

// Cada função de backend tem de passar pela porta ANTES de qualquer trabalho.
// Se alguém tirar a linha, ou movê-la para depois do createClient/req.json,
// este teste quebra.
describe('as 7 funções de backend usam a porta', () => {
  const FUNCS = [
    'job-worker',
    'automation-processor',
    'process-campaign-dispatch',
    'process-followup-dispatch',
    'webhook-dispatcher',
    'process-report-dispatch',
    'policy-watch',
  ];

  for (const fn of FUNCS) {
    it(fn, () => {
      const src = readFileSync(resolve(__dirname, `../../../supabase/functions/${fn}/index.ts`), 'utf-8');
      expect(src).toContain("import { guardBackendCaller } from '../_shared/backend-gate.ts'");
      const serveAt = src.search(/\bserve\(async \(req/);
      expect(serveAt).toBeGreaterThan(-1);
      const body = src.slice(serveAt);
      const gateAt = body.search(/const denied = await guardBackendCaller\(req, logger\);?\s*\n\s*if \(denied\) return denied/);
      expect(gateAt).toBeGreaterThan(-1);
      for (const work of ['createClient(', 'req.json(', 'req.text(', '.from(', '.rpc(']) {
        const at = body.indexOf(work);
        if (at > -1) expect(at).toBeGreaterThan(gateAt);
      }
      expect(src).not.toContain('project-key');
    });
  }

  // policy-watch nasceu com createLogger('policy-watch') no nível do módulo: a
  // string não tem .headers e a função quebrava no boot (500 em toda chamada,
  // nunca conferiu um documento). O logger nasce da requisição.
  it('nenhuma função cria o logger com string', () => {
    for (const fn of FUNCS) {
      const src = readFileSync(resolve(__dirname, `../../../supabase/functions/${fn}/index.ts`), 'utf-8');
      expect(src, fn).not.toMatch(/createLogger\(\s*['"`]/);
    }
  });
});

import { describe, it, expect } from 'vitest';
// Parte pura do instagram-token-renewal (fatia 4), compartilhada com o Deno.
import {
  buildRefreshUrl,
  classifyRefreshResponse,
  currentRenewalState,
  decideRenewal,
  EXPIRING_SOON_DAYS as SERVER_EXPIRING_DAYS,
  FAILURE_KIND,
  FAILURE_MESSAGES,
  failure,
  failureMessage,
  MIN_TOKEN_AGE_HOURS,
  parseExpiresIn,
  RENEWAL_WINDOW_DAYS,
  validateRunRequest,
} from '../../supabase/functions/instagram-token-renewal/logic';
import { matchVerifyToken } from '../../supabase/functions/_shared/cryptoSignature';
import {
  currentRenewalStatus,
  INSTAGRAM_EXPIRING_SOON_DAYS as CLIENT_EXPIRING_DAYS,
} from '@/lib/instagram/connection';

const H = 3_600_000;
const D = 86_400_000;
const NOW = new Date('2026-10-25T09:20:00.000Z');

/** Config como o banco grava: datas em ISO, renewal opcional. */
function cfg(opts: {
  issuedAgoMs: number;
  expiresInMs: number;
  renewal?: Record<string, unknown> | null;
  sameToken?: boolean;
}) {
  const issued = new Date(NOW.getTime() - opts.issuedAgoMs).toISOString();
  const c: Record<string, unknown> = {
    igAccountId: '17841419262135883',
    tokenIssuedAt: issued,
    tokenExpiresAt: new Date(NOW.getTime() + opts.expiresInMs).toISOString(),
  };
  if (opts.renewal) {
    c.renewal = {
      ...opts.renewal,
      forTokenIssuedAt: opts.sameToken === false ? '2020-01-01T00:00:00.000Z' : issued,
    };
  }
  return c;
}

describe('decideRenewal — renovar ou pular', () => {
  it('renova: ativa, token com mais de 24 h, faltando 30 dias ou menos', () => {
    expect(decideRenewal({ isActive: true, connectionConfig: cfg({ issuedAgoMs: 31 * D, expiresInMs: 29 * D }) }, NOW))
      .toEqual({ action: 'renew' });
    // limite exato: 30 dias ainda renova
    expect(decideRenewal({ isActive: true, connectionConfig: cfg({ issuedAgoMs: 30 * D, expiresInMs: 30 * D }) }, NOW))
      .toEqual({ action: 'renew' });
    // is_active nulo = ativa (padrão da tabela)
    expect(decideRenewal({ isActive: null, connectionConfig: cfg({ issuedAgoMs: 31 * D, expiresInMs: 29 * D }) }, NOW))
      .toEqual({ action: 'renew' });
  });

  it('pula quando faltam mais de 30 dias (not_due)', () => {
    expect(decideRenewal({ isActive: true, connectionConfig: cfg({ issuedAgoMs: 2 * D, expiresInMs: 58 * D }) }, NOW))
      .toEqual({ action: 'skip', reason: 'not_due' });
    expect(decideRenewal({ isActive: true, connectionConfig: cfg({ issuedAgoMs: 2 * D, expiresInMs: 30 * D + 1 }) }, NOW))
      .toEqual({ action: 'skip', reason: 'not_due' });
  });

  it('execução manual (ignoreWindow) renova antes dos 30 dias — é o teste depois de 25/09', () => {
    // o token de teste: emitido 24/09 00:16 UTC, vence 23/11 00:16 UTC
    const test = {
      tokenIssuedAt: '2026-09-24T00:16:36.715273+00:00',
      tokenExpiresAt: '2026-11-23T00:16:36.715273+00:00',
    };
    const antes = new Date('2026-09-25T00:10:00Z');
    const depois = new Date('2026-09-25T00:20:00Z');
    expect(decideRenewal({ isActive: true, connectionConfig: test }, antes, { ignoreWindow: true }))
      .toEqual({ action: 'skip', reason: 'too_young' });
    expect(decideRenewal({ isActive: true, connectionConfig: test }, depois, { ignoreWindow: true }))
      .toEqual({ action: 'renew' });
    // sem ignoreWindow, o cron só pega a partir de 24/10
    expect(decideRenewal({ isActive: true, connectionConfig: test }, depois))
      .toEqual({ action: 'skip', reason: 'not_due' });
    expect(decideRenewal({ isActive: true, connectionConfig: test }, new Date('2026-10-24T01:00:00Z')))
      .toEqual({ action: 'renew' });
  });

  it('respeita as regras da Meta mesmo forçando: menos de 24 h e vencido', () => {
    expect(
      decideRenewal({ isActive: true, connectionConfig: cfg({ issuedAgoMs: MIN_TOKEN_AGE_HOURS * H - 1, expiresInMs: 5 * D }) }, NOW, { ignoreWindow: true }),
    ).toEqual({ action: 'skip', reason: 'too_young' });
    expect(
      decideRenewal({ isActive: true, connectionConfig: cfg({ issuedAgoMs: 61 * D, expiresInMs: 0 }) }, NOW, { ignoreWindow: true }),
    ).toEqual({ action: 'skip', reason: 'expired' });
    expect(
      decideRenewal({ isActive: true, connectionConfig: cfg({ issuedAgoMs: 61 * D, expiresInMs: -H }) }, NOW),
    ).toEqual({ action: 'skip', reason: 'expired' });
  });

  it('pula instância desligada e config sem datas legíveis', () => {
    expect(decideRenewal({ isActive: false, connectionConfig: cfg({ issuedAgoMs: 31 * D, expiresInMs: 29 * D }) }, NOW))
      .toEqual({ action: 'skip', reason: 'inactive' });
    expect(decideRenewal({ isActive: true, connectionConfig: { igAccountId: '1' } }, NOW))
      .toEqual({ action: 'skip', reason: 'no_dates' });
    expect(decideRenewal({ isActive: true, connectionConfig: { tokenIssuedAt: 'ontem', tokenExpiresAt: '2026-11-01' } }, NOW))
      .toEqual({ action: 'skip', reason: 'no_dates' });
    expect(decideRenewal({ isActive: true, connectionConfig: null }, NOW))
      .toEqual({ action: 'skip', reason: 'no_dates' });
  });

  it('precisa reconectar: para de tentar — mesmo forçando — até o token ser trocado', () => {
    const parado = cfg({ issuedAgoMs: 31 * D, expiresInMs: 20 * D, renewal: { status: 'needs_reconnect' } });
    expect(decideRenewal({ isActive: true, connectionConfig: parado }, NOW))
      .toEqual({ action: 'skip', reason: 'needs_reconnect' });
    expect(decideRenewal({ isActive: true, connectionConfig: parado }, NOW, { ignoreWindow: true }))
      .toEqual({ action: 'skip', reason: 'needs_reconnect' });
    // token trocado por outro caminho (reconexão / runbook): o estado velho não vale
    const trocado = cfg({ issuedAgoMs: 31 * D, expiresInMs: 20 * D, renewal: { status: 'needs_reconnect' }, sameToken: false });
    expect(decideRenewal({ isActive: true, connectionConfig: trocado }, NOW)).toEqual({ action: 'renew' });
  });

  it('falha passageira não para nada: amanhã tenta de novo', () => {
    const passageira = cfg({ issuedAgoMs: 31 * D, expiresInMs: 20 * D, renewal: { status: 'retrying' } });
    expect(decideRenewal({ isActive: true, connectionConfig: passageira }, NOW)).toEqual({ action: 'renew' });
  });

  it('as constantes são as da regra combinada', () => {
    expect(RENEWAL_WINDOW_DAYS).toBe(30);
    expect(MIN_TOKEN_AGE_HOURS).toBe(24);
    expect(SERVER_EXPIRING_DAYS).toBe(7);
  });
});

describe('classifyRefreshResponse — o que a Meta respondeu', () => {
  it('sucesso: token novo e expires_in da Meta (nunca 60 dias suposto)', () => {
    expect(classifyRefreshResponse(200, { access_token: ' IGnovo ', token_type: 'bearer', expires_in: 5183944 }))
      .toEqual({ ok: true, accessToken: 'IGnovo', expiresIn: 5183944 });
    expect(classifyRefreshResponse(200, { access_token: 'IGnovo' }))
      .toEqual({ ok: true, accessToken: 'IGnovo', expiresIn: null });
  });

  it('parseExpiresIn aceita só segundos plausíveis', () => {
    expect(parseExpiresIn(5183944)).toBe(5183944);
    expect(parseExpiresIn('5183944')).toBe(5183944);
    for (const lixo of [0, -1, 1.5, NaN, Infinity, 400 * 86400 + 1, '60d', null, undefined, {}]) {
      expect(parseExpiresIn(lixo)).toBeNull();
    }
  });

  it('200 sem token é falha passageira (nada é gravado)', () => {
    expect(classifyRefreshResponse(200, {})).toMatchObject({ ok: false, reason: 'bad_response', kind: 'transient' });
    expect(classifyRefreshResponse(200, null)).toMatchObject({ ok: false, reason: 'bad_response', kind: 'transient' });
    expect(classifyRefreshResponse(200, { access_token: '   ' })).toMatchObject({ ok: false, kind: 'transient' });
  });

  it('precisa reconectar: 190, 102, 401 OAuth, permissão retirada', () => {
    expect(classifyRefreshResponse(400, { error: { code: 190, type: 'OAuthException' } }))
      .toEqual({ ok: false, reason: 'token_invalid', kind: 'needs_reconnect', metaCode: 190 });
    expect(classifyRefreshResponse(400, { error: { code: 190, error_subcode: 463 } }))
      .toMatchObject({ reason: 'token_invalid', kind: 'needs_reconnect' });
    expect(classifyRefreshResponse(400, { error: { code: 102 } }))
      .toMatchObject({ reason: 'token_invalid', kind: 'needs_reconnect' });
    expect(classifyRefreshResponse(401, { error: { type: 'OAuthException', message: 'x' } }))
      .toMatchObject({ reason: 'token_invalid', kind: 'needs_reconnect', metaCode: null });
    expect(classifyRefreshResponse(403, { error: { code: 10 } }))
      .toMatchObject({ reason: 'permission_removed', kind: 'needs_reconnect' });
    expect(classifyRefreshResponse(403, { error: { code: 200 } }))
      .toMatchObject({ reason: 'permission_removed', kind: 'needs_reconnect' });
  });

  it('passageira: limite de chamadas, instabilidade, erro desconhecido', () => {
    for (const code of [4, 17, 32, 613, 80002, 80006]) {
      expect(classifyRefreshResponse(400, { error: { code } })).toMatchObject({ reason: 'rate_limited', kind: 'transient' });
    }
    expect(classifyRefreshResponse(429, null)).toMatchObject({ reason: 'rate_limited', kind: 'transient' });
    expect(classifyRefreshResponse(500, null)).toMatchObject({ reason: 'meta_unavailable', kind: 'transient' });
    expect(classifyRefreshResponse(400, { error: { code: 2 } })).toMatchObject({ reason: 'meta_unavailable', kind: 'transient' });
    expect(classifyRefreshResponse(400, { error: { code: 999, is_transient: true } }))
      .toMatchObject({ reason: 'meta_unavailable', kind: 'transient' });
    // não reconhecido: tenta amanhã (os avisos de 7 dias e vencimento continuam valendo)
    expect(classifyRefreshResponse(400, { error: { code: 100, message: 'Invalid parameter' } }))
      .toEqual({ ok: false, reason: 'meta_error', kind: 'transient', metaCode: 100 });
    expect(classifyRefreshResponse(400, 'não é json')).toMatchObject({ reason: 'meta_error', kind: 'transient' });
  });

  it('rede e cofre vazio', () => {
    expect(failure('network_error')).toEqual({ ok: false, reason: 'network_error', kind: 'transient', metaCode: null });
    expect(failure('token_missing')).toEqual({ ok: false, reason: 'token_missing', kind: 'needs_reconnect', metaCode: null });
  });

  it('toda falha tem tipo e frase simples, sem jargão; o genérico leva o código', () => {
    for (const [reason, msg] of Object.entries(FAILURE_MESSAGES)) {
      expect(FAILURE_KIND[reason as keyof typeof FAILURE_KIND]).toMatch(/^(transient|needs_reconnect)$/);
      expect(msg).not.toMatch(/token|oauth|api\b|graph|refresh|expires/i);
    }
    expect(failureMessage('meta_error', 100)).toBe('O Instagram recusou a renovação. (código 100)');
    expect(failureMessage('token_invalid', 190)).toBe('O Instagram não aceita mais o acesso atual desta conta.');
  });
});

describe('pedido de execução e URL', () => {
  it('corpo vazio = cron: todas, sem forçar, de verdade', () => {
    expect(validateRunRequest(null)).toEqual({ ok: true, value: { dryRun: false, instanceId: null, ignoreWindow: false } });
    expect(validateRunRequest({})).toEqual({ ok: true, value: { dryRun: false, instanceId: null, ignoreWindow: false } });
  });

  it('execução manual', () => {
    expect(
      validateRunRequest({ dryRun: true, ignoreWindow: true, instanceId: 'cccccccc-0000-4000-8000-000000000003' }),
    ).toEqual({
      ok: true,
      value: { dryRun: true, ignoreWindow: true, instanceId: 'cccccccc-0000-4000-8000-000000000003' },
    });
  });

  it('recusa lixo', () => {
    expect(validateRunRequest([]).ok).toBe(false);
    expect(validateRunRequest({ dryRun: 'sim' }).ok).toBe(false);
    expect(validateRunRequest({ ignoreWindow: 1 }).ok).toBe(false);
    expect(validateRunRequest({ instanceId: 'x' }).ok).toBe(false);
  });

  it('a URL é a do refresh documentado, com o token codificado', () => {
    const u = new URL(buildRefreshUrl('IG+a/b=c'));
    expect(`${u.origin}${u.pathname}`).toBe('https://graph.instagram.com/refresh_access_token');
    expect(u.searchParams.get('grant_type')).toBe('ig_refresh_token');
    expect(u.searchParams.get('access_token')).toBe('IG+a/b=c');
  });
});

describe('autenticação do cron (matchVerifyToken, tempo constante)', () => {
  const segredo = 'ab'.repeat(32);
  it('só o segredo exato passa', () => {
    expect(matchVerifyToken(segredo, [segredo])).toBe(0);
    expect(matchVerifyToken(segredo.slice(0, -1) + 'c', [segredo])).toBe(-1);
    expect(matchVerifyToken(segredo + 'a', [segredo])).toBe(-1);
    expect(matchVerifyToken('', [segredo])).toBe(-1);
    expect(matchVerifyToken(null, [segredo])).toBe(-1);
  });
  it('sem segredo configurado, nada passa (a função recusa antes, com 503)', () => {
    expect(matchVerifyToken(segredo, [''])).toBe(-1);
    expect(matchVerifyToken(segredo, [undefined])).toBe(-1);
  });
});

describe('paridade: a tela e a edge function leem o mesmo estado', () => {
  it('mesmo marco de "vai vencer"', () => {
    expect(CLIENT_EXPIRING_DAYS).toBe(SERVER_EXPIRING_DAYS);
  });

  it('o estado de renovação só vale para o token atual — nos dois lados', () => {
    const casos: unknown[] = [
      null,
      {},
      { tokenIssuedAt: 'A' },
      { tokenIssuedAt: 'A', renewal: { status: 'ok', forTokenIssuedAt: 'A' } },
      { tokenIssuedAt: 'A', renewal: { status: 'retrying', forTokenIssuedAt: 'A', message: 'm' } },
      { tokenIssuedAt: 'A', renewal: { status: 'needs_reconnect', forTokenIssuedAt: 'A' } },
      { tokenIssuedAt: 'B', renewal: { status: 'needs_reconnect', forTokenIssuedAt: 'A' } },
      { tokenIssuedAt: 'A', renewal: { status: 'quebrado', forTokenIssuedAt: 'A' } },
      { tokenIssuedAt: 'A', renewal: { status: 'ok' } },
      { tokenIssuedAt: 'A', renewal: 'lixo' },
    ];
    for (const c of casos) {
      expect(currentRenewalStatus(c)?.status ?? null).toBe(currentRenewalState(c)?.status ?? null);
    }
  });
});

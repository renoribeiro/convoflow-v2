import { describe, it, expect, vi } from 'vitest';
import {
  assertPublicUrl,
  isBlockedIp,
  hostnameLooksInternal,
  safeFetch,
  OutboundUrlError,
  type Resolver,
} from '../../../supabase/functions/_shared/safe-outbound-url.ts';

/**
 * O servidor só chama endereço PÚBLICO informado por cliente (WAHA).
 * Nenhum teste toca a rede: o resolvedor e o fetch são falsos.
 */

const resolvesTo = (...ips: string[]): Resolver => async () => ips;
const reason = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'passou';
  } catch (e) {
    return e instanceof OutboundUrlError ? e.reason : `outro erro: ${String(e)}`;
  }
};

describe('IPs bloqueados', () => {
  it.each([
    '127.0.0.1', '127.8.8.8', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.10',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3',
    '0:0:0:0:0:ffff:7f00:1', '64:ff9b::a00:1', '2001:db8::1', '2002:7f00:1::', 'ff02::1',
  ])('%s é interno ou reservado', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    '%s é público',
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    },
  );
});

describe('nomes internos pela forma', () => {
  it.each(['localhost', 'api.localhost', 'waha.local', 'metadata.google.internal', 'metadata', 'waha', 'db', 'svc.cluster.local'])(
    '%s é recusado sem consultar DNS',
    (h) => {
      expect(hostnameLooksInternal(h)).toBe(true);
    },
  );
  it('nome público passa', () => {
    expect(hostnameLooksInternal('waha.exemplo.com.br')).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  it('aceita https público que resolve para IP público', async () => {
    const url = await assertPublicUrl('https://waha.exemplo.com.br/', resolvesTo('8.8.8.8'));
    expect(url.hostname).toBe('waha.exemplo.com.br');
  });

  it.each([
    ['http://localhost:3000', 'internal_hostname'],
    ['http://127.0.0.1:5432', 'private_address'],
    ['http://2130706433/', 'private_address'], // 127.0.0.1 escrito em decimal
    ['http://0x7f.0.0.1/', 'private_address'],
    ['http://[::1]:8080/', 'private_address'],
    ['http://169.254.169.254/latest/meta-data/', 'private_address'],
    ['http://metadata.google.internal/', 'internal_hostname'],
    ['ftp://waha.exemplo.com.br', 'protocol'],
    ['https://usuario:senha@waha.exemplo.com.br', 'credentials_in_url'],
    ['isto não é endereço', 'invalid_url'],
  ])('%s → %s', async (raw, expected) => {
    const resolver = vi.fn(resolvesTo('8.8.8.8'));
    expect(await reason(assertPublicUrl(raw, resolver))).toBe(expected);
  });

  it('nome que resolve para IP interno é recusado (mesmo com um público junto)', async () => {
    expect(await reason(assertPublicUrl('https://waha.exemplo.com.br', resolvesTo('8.8.8.8', '10.0.0.7')))).toBe('private_address');
    expect(await reason(assertPublicUrl('https://waha.exemplo.com.br', resolvesTo('::ffff:192.168.0.2')))).toBe('private_address');
  });

  it('nome que não resolve é recusado (falha fechada)', async () => {
    expect(await reason(assertPublicUrl('https://nao-existe.exemplo.com.br', resolvesTo()))).toBe('unresolved');
  });
});

describe('safeFetch', () => {
  it('não segue redirecionamento: 302 vira recusa', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }));
    const r = await reason(safeFetch('https://waha.exemplo.com.br/api/health', {}, { resolver: resolvesTo('8.8.8.8'), fetchImpl }));
    expect(r).toBe('redirect');
    expect(fetchImpl).toHaveBeenCalledWith('https://waha.exemplo.com.br/api/health', expect.objectContaining({ redirect: 'manual' }));
  });

  it('endereço interno nem chega a ser chamado', async () => {
    const fetchImpl = vi.fn();
    expect(await reason(safeFetch('http://10.0.0.1/api', {}, { resolver: resolvesTo(), fetchImpl }))).toBe('private_address');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('endereço público: devolve a resposta', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const res = await safeFetch('https://waha.exemplo.com.br/api/health', {}, { resolver: resolvesTo('8.8.8.8'), fetchImpl });
    expect(res.status).toBe(200);
  });
});

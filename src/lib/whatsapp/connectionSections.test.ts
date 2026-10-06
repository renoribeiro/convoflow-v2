import { describe, it, expect } from 'vitest';
import {
  connectionSummary,
  instagramAccountHandle,
  isConnected,
  onlyWhatsApp,
  splitByChannel,
  totalCardTexts,
} from './connectionSections';

const NOW = new Date('2026-10-25T12:00:00Z');

const waOpen = { id: 'wa-1', provider: 'official', status: 'open' };
const waClosed = { id: 'wa-2', provider: 'evolution', status: 'close' };
const waLegacy = { id: 'wa-3', provider: null, status: 'open' };
const igValid = {
  id: 'ig-1',
  provider: 'instagram',
  status: 'connected',
  profile_name: '@convoflow',
  connection_config: { igUsername: 'convoflow', tokenExpiresAt: '2026-11-24T10:43:29Z' },
};
const igExpired = {
  id: 'ig-2',
  provider: 'instagram',
  status: 'connected',
  connection_config: { tokenExpiresAt: '2026-10-20T00:00:00Z' },
};

describe('splitByChannel', () => {
  it('Instagram numa seção, todo o resto (inclusive provider nulo, legado) na do WhatsApp', () => {
    const { whatsapp, instagram } = splitByChannel([waOpen, igValid, waLegacy, igExpired, waClosed]);
    expect(whatsapp.map((r) => r.id)).toEqual(['wa-1', 'wa-3', 'wa-2']);
    expect(instagram.map((r) => r.id)).toEqual(['ig-1', 'ig-2']);
  });
});

describe('contadores do topo', () => {
  it('só WhatsApp: os números e o rótulo de sempre', () => {
    const s = connectionSummary([waOpen, waClosed, waLegacy], NOW);
    expect(s).toEqual({ total: 3, connected: 2, disconnected: 1, whatsapp: 3, instagram: 0 });
    expect(totalCardTexts(s)).toEqual({ label: 'Total de Instâncias', breakdown: null });
  });

  it('com Instagram: soma as duas seções; Instagram conta pela validade, não pelo status', () => {
    const s = connectionSummary([waOpen, waClosed, igValid, igExpired], NOW);
    expect(s).toEqual({ total: 4, connected: 2, disconnected: 2, whatsapp: 2, instagram: 2 });
    expect(totalCardTexts(s)).toEqual({
      label: 'Total de conexões',
      breakdown: '2 instâncias de WhatsApp · 2 contas do Instagram',
    });
  });

  it('singular', () => {
    const s = connectionSummary([waOpen, igValid], NOW);
    expect(totalCardTexts(s).breakdown).toBe('1 instância de WhatsApp · 1 conta do Instagram');
  });

  it('só Instagram', () => {
    const s = connectionSummary([igValid], NOW);
    expect(s).toEqual({ total: 1, connected: 1, disconnected: 0, whatsapp: 0, instagram: 1 });
    expect(totalCardTexts(s).breakdown).toBe('0 instâncias de WhatsApp · 1 conta do Instagram');
  });

  it('status "connected" do Instagram não o faz conectado se o acesso venceu', () => {
    expect(isConnected(igExpired, NOW)).toBe(false);
    expect(isConnected(igValid, NOW)).toBe(true);
  });
});

describe('instagramAccountHandle', () => {
  it('igUsername da conexão, com um "@" só', () => {
    expect(instagramAccountHandle(igValid)).toBe('@convoflow');
    expect(instagramAccountHandle({ connection_config: { igUsername: '@@loja' } })).toBe('@loja');
  });
  it('sem igUsername, cai para profile_name', () => {
    expect(instagramAccountHandle({ profile_name: '@convoflow', connection_config: {} })).toBe('@convoflow');
  });
  it('sem nenhum dos dois: null (a tela diz "@ não informado")', () => {
    expect(instagramAccountHandle({ connection_config: null })).toBeNull();
    expect(instagramAccountHandle({ profile_name: '  ' })).toBeNull();
  });
});

describe('onlyWhatsApp — seletores de "Instância do WhatsApp" (fatia 4b)', () => {
  it('tira a conta do Instagram e mantém todo WhatsApp, inclusive o legado sem provider', () => {
    expect(onlyWhatsApp([waOpen, igValid, waLegacy, igExpired, waClosed]).map((r) => r.id)).toEqual(['wa-1', 'wa-3', 'wa-2']);
    expect(onlyWhatsApp([igValid])).toEqual([]);
  });
});

describe('Instagram desligado (fatia 4b)', () => {
  it('desligada conta como desconectada, mesmo com acesso válido', () => {
    expect(isConnected({ ...igValid, is_active: false }, NOW)).toBe(false);
    expect(isConnected({ ...igValid, is_active: true }, NOW)).toBe(true);
    const s = connectionSummary([waOpen, { ...igValid, is_active: false }], NOW);
    expect(s).toMatchObject({ connected: 1, disconnected: 1 });
  });

  it('is_active não muda nada no WhatsApp (o status manda, como sempre)', () => {
    expect(isConnected({ ...waOpen, is_active: false }, NOW)).toBe(true);
  });
});

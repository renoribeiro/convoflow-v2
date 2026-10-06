/**
 * Fatia 4b — o que a tela decide mostrar ao conectar, reconectar, desligar e
 * religar o Instagram, e a lista do superadmin. O servidor decide de verdade;
 * aqui se prova que a tela não oferece o que o servidor vai recusar e que as
 * frases dizem exatamente o que acontece.
 */
import { describe, it, expect } from 'vitest';
import {
  callbackErrorText,
  connectSuccessText,
  instagramActions,
  readInstagramCallback,
  toggleConfirmText,
  withoutInstagramCallback,
} from './connectFlow';
import { instagramConnectRows } from './connectAdmin';

const STATE = 'b'.repeat(64);

describe('volta do Instagram na tela', () => {
  it('sem parâmetros do Instagram: nada a fazer', () => {
    expect(readInstagramCallback('')).toEqual({ kind: 'none' });
    expect(readInstagramCallback('?tab=debug')).toEqual({ kind: 'none' });
  });

  it('com código e state: concluir', () => {
    expect(readInstagramCallback(`?ig_state=${STATE}&ig_code=AQB123`)).toEqual({ kind: 'code', code: 'AQB123', state: STATE });
    // Um "#_" colado junto não vai para o servidor.
    expect(readInstagramCallback(`?ig_state=${STATE}&ig_code=${encodeURIComponent('AQB123#_')}`)).toEqual({
      kind: 'code', code: 'AQB123', state: STATE,
    });
  });

  it('cancelou no Instagram ou voltou sem código: erro, sem chamar o servidor', () => {
    expect(readInstagramCallback(`?ig_state=${STATE}&ig_error=access_denied&ig_error_description=x`)).toEqual({
      kind: 'error', error: 'access_denied', description: 'x',
    });
    expect(readInstagramCallback(`?ig_state=${STATE}`)).toEqual({ kind: 'error', error: 'missing_code', description: null });
    expect(readInstagramCallback('?ig_code=abc')).toEqual({ kind: 'error', error: 'missing_code', description: null });
  });

  it('tira só os parâmetros do Instagram da barra (um F5 não repete o pedido)', () => {
    expect(withoutInstagramCallback(`?ig_state=${STATE}&ig_code=x`)).toBe('');
    expect(withoutInstagramCallback(`?tab=debug&ig_state=${STATE}&ig_error=access_denied&ig_error_description=y`)).toBe('?tab=debug');
  });

  it('textos de erro', () => {
    expect(callbackErrorText('access_denied')).toEqual({
      title: 'Conexão cancelada',
      description: 'Você cancelou a autorização no Instagram. Nada foi alterado.',
    });
    expect(callbackErrorText('missing_code').description).toContain('Nada foi alterado');
  });
});

describe('mensagem de sucesso mostra a validade', () => {
  const instance = { name: 'Instagram @convoflow', profile_name: '@convoflow', is_active: true, valid_until: '2026-11-24T10:43:29.415655+00:00' };

  it('conectar: conta, Loja e "Válida até" em Brasília', () => {
    expect(connectSuccessText({ mode: 'connect', instance, username: 'convoflow' })).toEqual({
      title: 'Instagram conectado',
      description: '@convoflow foi conectada a esta Loja. Válida até 24/11/2026 às 07:43.',
    });
  });

  it('reconectar: mesmo cartão, histórico continua; desligada avisa como religar', () => {
    const t = connectSuccessText({ mode: 'reconnect', instance: { ...instance, is_active: false }, username: null });
    expect(t.title).toBe('Instagram reconectado');
    expect(t.description).toContain('@convoflow foi reconectada no mesmo cartão; o histórico continua.');
    expect(t.description).toContain('Válida até 24/11/2026 às 07:43.');
    expect(t.description).toContain('clique em Religar');
  });
});

describe('o que a tela oferece', () => {
  it('Loja liberada + Gestor/Gerente: conectar, reconectar e desligar', () => {
    expect(instagramActions({ connectEnabled: true, canConfigure: true })).toEqual({
      showSection: true, showConnect: true, showReconnect: true, showToggle: true,
    });
  });

  it('Loja sem a chave (Central Vagas): nem seção nem botão; desligar continua', () => {
    expect(instagramActions({ connectEnabled: false, canConfigure: true })).toEqual({
      showSection: false, showConnect: false, showReconnect: false, showToggle: true,
    });
  });

  it('Atendente: nada', () => {
    expect(instagramActions({ connectEnabled: true, canConfigure: false })).toEqual({
      showSection: false, showConnect: false, showReconnect: false, showToggle: false,
    });
  });
});

describe('confirmação de desligar/religar diz exatamente o que acontece', () => {
  it('desligar: histórico fica, mensagens do período se perdem', () => {
    const t = toggleConfirmText({ handle: '@convoflow', turnOn: false });
    expect(t.title).toBe('Desligar @convoflow?');
    expect(t.action).toBe('Desligar');
    const body = t.body.join(' ');
    expect(body).toContain('O histórico fica');
    expect(body).toContain('NÃO entram no ConvoFlow e se perdem');
    expect(body).toContain('não voltam quando você religar');
  });

  it('religar: volta a receber daqui para frente, o período desligado não volta', () => {
    const t = toggleConfirmText({ handle: '@convoflow', turnOn: true });
    expect(t.title).toBe('Religar @convoflow?');
    expect(t.action).toBe('Religar');
    expect(t.body.join(' ')).toContain('não voltam');
  });
});

describe('lista do superadmin (Conectar Instagram por Loja)', () => {
  const tenants = [
    { id: 'c1', name: 'Conta Teste Gerente', kind: 'account', parent_tenant_id: null },
    { id: 'l1', name: 'Loja Teste', kind: 'store', parent_tenant_id: 'c1' },
    { id: 'c2', name: 'Grupo Vaga', kind: 'account', parent_tenant_id: null },
    { id: 'l2', name: 'Central Vagas', kind: 'store', parent_tenant_id: 'c2' },
    { id: 'l3', name: 'Ótica Centro', kind: 'store', parent_tenant_id: null },
  ];

  it('só Lojas; liberadas primeiro; nome da Conta ao lado', () => {
    expect(instagramConnectRows(tenants, new Set(['l1']))).toEqual([
      { id: 'l1', name: 'Loja Teste', parentName: 'Conta Teste Gerente', enabled: true },
      { id: 'l2', name: 'Central Vagas', parentName: 'Grupo Vaga', enabled: false },
      { id: 'l3', name: 'Ótica Centro', parentName: null, enabled: false },
    ]);
  });

  it('busca pela Loja ou pela Conta, sem acento', () => {
    expect(instagramConnectRows(tenants, new Set(), 'otica').map((r) => r.id)).toEqual(['l3']);
    expect(instagramConnectRows(tenants, new Set(), 'vaga').map((r) => r.id)).toEqual(['l2']);
    expect(instagramConnectRows(tenants, new Set(), 'gerente').map((r) => r.id)).toEqual(['l1']);
  });
});

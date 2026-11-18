import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  resolverRemetenteEvolution,
  tipoDoJid,
  telefoneDoJid,
  numerosDaInstancia,
} from '../../../supabase/functions/_shared/evolution-remetente.ts';

// Números inventados (padrão falso do CLAUDE.md). O "sender" do corpo do
// webhook do Evolution é o PRÓPRIO número conectado: o erro de 2026-11-18 foi
// usar esse campo como remetente, e toda mensagem virou um contato só.
const PROPRIO = '5585999990000';
const SENDER = `${PROPRIO}@s.whatsapp.net`;
const CLIENTE_A = '5585999990201';
const CLIENTE_B = '5585999990302';
const INSTANCIA = 'loja_teste_0001';

const resolver = (key: Record<string, unknown>, extra: { telefoneDaInstancia?: string } = {}) =>
  resolverRemetenteEvolution({ key, sender: SENDER, instancia: INSTANCIA, ...extra });

describe('resolverRemetenteEvolution', () => {
  it('@lid com remoteJidAlt: o telefone vem do remoteJidAlt, nunca do sender', () => {
    const r = resolver({
      id: '3EB0AAAAAAAAAAAAAAAA01',
      fromMe: false,
      remoteJid: '99999000001111@lid',
      remoteJidAlt: `${CLIENTE_A}@s.whatsapp.net`,
      participant: '',
      addressingMode: 'lid',
    });
    expect(r).toEqual({
      ok: true,
      telefone: CLIENTE_A,
      dados: {
        remoteJid: '99999000001111@lid',
        remoteJidAlt: `${CLIENTE_A}@s.whatsapp.net`,
        participant: null,
        fromMe: false,
        instance: INSTANCIA,
      },
    });
  });

  it('@lid com senderPn (Baileys antigo) também resolve', () => {
    const r = resolver({ remoteJid: '99999000001111@lid', senderPn: `${CLIENTE_B}@s.whatsapp.net`, fromMe: false });
    expect(r.ok && r.telefone).toBe(CLIENTE_B);
  });

  it('@lid sem telefone é ignorado (os dígitos do @lid não são telefone)', () => {
    const r = resolver({ remoteJid: '99999000001111@lid', fromMe: false });
    expect(r).toMatchObject({ ok: false, motivo: 'lid_sem_telefone' });
  });

  it('número comum: o telefone é o do remoteJid', () => {
    const r = resolver({ remoteJid: `${CLIENTE_B}@s.whatsapp.net`, fromMe: false });
    expect(r.ok && r.telefone).toBe(CLIENTE_B);
  });

  it('duas pessoas diferentes viram dois telefones, com o mesmo sender', () => {
    const a = resolver({ remoteJid: '99999000001111@lid', remoteJidAlt: `${CLIENTE_A}@s.whatsapp.net` });
    const b = resolver({ remoteJid: `${CLIENTE_B}@s.whatsapp.net` });
    expect(a.ok && a.telefone).toBe(CLIENTE_A);
    expect(b.ok && b.telefone).toBe(CLIENTE_B);
  });

  it('remetente igual ao próprio número (sender) nunca vira contato', () => {
    expect(resolver({ remoteJid: SENDER, fromMe: false })).toMatchObject({ ok: false, motivo: 'numero_da_instancia' });
    expect(resolver({ remoteJid: '99999000001111@lid', remoteJidAlt: SENDER })).toMatchObject({
      ok: false,
      motivo: 'numero_da_instancia',
    });
  });

  it('o phone_number da linha também conta como próprio número', () => {
    const r = resolverRemetenteEvolution({
      key: { remoteJid: `${CLIENTE_A}@s.whatsapp.net` },
      sender: undefined,
      telefoneDaInstancia: '+55 (85) 99999-0201',
      instancia: INSTANCIA,
    });
    expect(r).toMatchObject({ ok: false, motivo: 'numero_da_instancia' });
  });

  it('status@broadcast é ignorado', () => {
    expect(resolver({ remoteJid: 'status@broadcast', participant: `${CLIENTE_A}@s.whatsapp.net` })).toMatchObject({
      ok: false,
      motivo: 'status',
    });
  });

  it('canal (newsletter) é ignorado', () => {
    expect(resolver({ remoteJid: '120363000000000000@newsletter' })).toMatchObject({ ok: false, motivo: 'canal' });
  });

  it('grupo é ignorado', () => {
    expect(
      resolver({ remoteJid: '120363000000000001@g.us', participant: `${CLIENTE_A}@s.whatsapp.net` }),
    ).toMatchObject({ ok: false, motivo: 'grupo' });
  });

  it('eco de mensagem do bot (fromMe): o destino é o cliente, não o próprio número', () => {
    const r = resolver({
      id: '3EB0AAAAAAAAAAAAAAAA02',
      fromMe: true,
      remoteJid: '99999000001111@lid',
      remoteJidAlt: `${CLIENTE_A}@s.whatsapp.net`,
    });
    expect(r).toMatchObject({ ok: true, telefone: CLIENTE_A, dados: { fromMe: true } });
  });

  it('eco de mensagem para o próprio número (fromMe) é ignorado', () => {
    expect(resolver({ fromMe: true, remoteJid: SENDER })).toMatchObject({ ok: false, motivo: 'numero_da_instancia' });
  });

  it('sem remoteJid não resolve', () => {
    expect(resolver({ fromMe: false })).toMatchObject({ ok: false, motivo: 'sem_remote_jid' });
  });
});

describe('ajudantes de JID', () => {
  it('tipoDoJid', () => {
    expect(tipoDoJid(`${CLIENTE_A}@s.whatsapp.net`)).toBe('pessoa');
    expect(tipoDoJid(`${CLIENTE_A}@c.us`)).toBe('pessoa');
    expect(tipoDoJid('1@lid')).toBe('lid');
    expect(tipoDoJid('1@g.us')).toBe('grupo');
    expect(tipoDoJid('status@broadcast')).toBe('status');
    expect(tipoDoJid('1@newsletter')).toBe('canal');
    expect(tipoDoJid(undefined)).toBe('outro');
  });
  it('telefoneDoJid tira o aparelho (:N) e recusa o que não é pessoa', () => {
    expect(telefoneDoJid(`${CLIENTE_A}:12@s.whatsapp.net`)).toBe(CLIENTE_A);
    expect(telefoneDoJid('99999000001111@lid')).toBeNull();
  });
  it('numerosDaInstancia junta sender e phone_number', () => {
    expect([...numerosDaInstancia(SENDER, null)]).toEqual([PROPRIO]);
    expect(numerosDaInstancia(undefined, undefined).size).toBe(0);
  });
});

describe('evolution-webhook usa a regra', () => {
  const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const fonte = fs.readFileSync(path.join(RAIZ, 'supabase', 'functions', 'evolution-webhook', 'index.ts'), 'utf8');

  it('o telefone nunca sai do sender do corpo do webhook', () => {
    expect(fonte).not.toMatch(/sender\.replace\(/);
    expect(fonte).not.toMatch(/rawPhone\s*=\s*sender/);
  });

  it('entrada e saída passam por resolverRemetenteEvolution e guardam os dados do remetente', () => {
    expect((fonte.match(/resolverRemetenteEvolution\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(fonte).toMatch(/metadata:\s*\{\s*evolution:\s*remetente\.dados\s*\}/);
  });
});

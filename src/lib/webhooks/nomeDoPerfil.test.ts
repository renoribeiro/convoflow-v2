import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  limparNomeDoPerfil,
  nomeDoPerfilMeta,
  nomeDoPerfilWaha,
  contatoNovoDaEvolution,
} from '../../../supabase/functions/_shared/nome-do-perfil.ts';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fonte = (nome: string) =>
  fs.readFileSync(path.join(RAIZ, 'supabase', 'functions', nome, 'index.ts'), 'utf8');

describe('limparNomeDoPerfil', () => {
  it('limpa espaços e caracteres de controle', () => {
    expect(limparNomeDoPerfil('  Ana   Souza\n', '5585999990201')).toBe('Ana Souza');
  });
  it('vazio, só espaço ou não texto vira null', () => {
    expect(limparNomeDoPerfil('   ', '1')).toBeNull();
    expect(limparNomeDoPerfil(undefined, '1')).toBeNull();
    expect(limparNomeDoPerfil(42, '1')).toBeNull();
  });
  it('o telefone no lugar do nome não é nome', () => {
    expect(limparNomeDoPerfil('5585999990201', '5585999990201')).toBeNull();
    expect(limparNomeDoPerfil('+55 (85) 99999-0201', '5585999990201')).toBeNull();
    expect(limparNomeDoPerfil('Loja 5585999990201', '5585999990201')).toBe('Loja 5585999990201');
  });
  it('corta nomes enormes em 120 letras', () => {
    expect(limparNomeDoPerfil('a'.repeat(300), '1')).toHaveLength(120);
  });
});

describe('Meta: value.contacts[].profile.name (SKILL §3.5)', () => {
  const value = {
    contacts: [
      { profile: { name: 'Outra Pessoa' }, wa_id: '5585999990299' },
      { profile: { name: 'Ana Perfil' }, wa_id: '5585999990201' },
    ],
  };
  it('casa o wa_id com o from da mensagem', () => {
    expect(nomeDoPerfilMeta(value, '5585999990201')).toBe('Ana Perfil');
  });
  it('um contato só, sem wa_id igual: usa o único', () => {
    expect(nomeDoPerfilMeta({ contacts: [{ profile: { name: 'Bia' } }] }, '5585999990201')).toBe('Bia');
  });
  it('sem contacts, sem nome', () => {
    expect(nomeDoPerfilMeta({}, '5585999990201')).toBeNull();
    expect(nomeDoPerfilMeta(null, '5585999990201')).toBeNull();
    expect(nomeDoPerfilMeta({ contacts: [{ wa_id: '5585999990201' }] }, '5585999990201')).toBeNull();
  });
});

describe('WAHA: nome no dado bruto do motor', () => {
  it('WEBJS: _data.notifyName', () => {
    expect(nomeDoPerfilWaha({ from: 'x@c.us', _data: { notifyName: 'Ana' } }, '5585999990201')).toBe('Ana');
  });
  it('NOWEB: _data.pushName', () => {
    expect(nomeDoPerfilWaha({ _data: { pushName: 'Bia' } }, '5585999990201')).toBe('Bia');
  });
  it('GOWS: _data.Info.PushName', () => {
    expect(nomeDoPerfilWaha({ _data: { Info: { PushName: 'Caio' } } }, '5585999990201')).toBe('Caio');
  });
  it('sem _data, ou só o telefone: sem nome, e nada quebra', () => {
    expect(nomeDoPerfilWaha({ from: '5585999990201@c.us' }, '5585999990201')).toBeNull();
    expect(nomeDoPerfilWaha({ _data: { pushName: '5585999990201' } }, '5585999990201')).toBeNull();
    expect(nomeDoPerfilWaha(undefined, '5585999990201')).toBeNull();
  });
});

describe('Evolution: o contato novo leva a primeira mensagem', () => {
  it('nome do perfil e primeira mensagem', () => {
    expect(contatoNovoDaEvolution({
      telefone: '5585999990201', pushName: 'Ana', tenantId: 't', instanciaId: 'i', primeiraMensagem: 'Oi, vi o anúncio',
    })).toEqual({
      phone: '5585999990201', name: 'Ana', name_source: 'whatsapp', tenant_id: 't', whatsapp_instance_id: 'i', first_message: 'Oi, vi o anúncio',
    });
  });
  it('sem nome no perfil: o telefone, como sempre', () => {
    expect(contatoNovoDaEvolution({
      telefone: '5585999990201', pushName: undefined, tenantId: 't', instanciaId: 'i', primeiraMensagem: '',
    })).toMatchObject({ name: '5585999990201', name_source: 'telefone', first_message: null });
  });
});

describe('as funções de chegada usam o nome', () => {
  it('meta-webhook manda o nome do perfil para receber_mensagem_whatsapp', () => {
    const s = fonte('meta-webhook');
    expect(s).toContain("rpc('receber_mensagem_whatsapp'");
    expect(s).toContain('p_nome: nomeDoPerfil');
    expect(s).toContain('nomeDoPerfilMeta(value, msg.from)');
    expect(s).not.toContain("rpc('process_incoming_message'");
  });
  it('waha-webhook manda o nome do motor', () => {
    const s = fonte('waha-webhook');
    expect(s).toContain("rpc('receber_mensagem_whatsapp'");
    expect(s).toContain('p_nome: nomeDoPerfilWaha(msg, phone)');
  });
  it('evolution-webhook cria o contato com a primeira mensagem', () => {
    const s = fonte('evolution-webhook');
    expect(s).toContain('contatoNovoDaEvolution({');
    expect(s).toContain('primeiraMensagem: rawMessageContent');
  });
});

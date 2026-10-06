import { describe, it, expect } from 'vitest';
import {
  asContactChannelFilter,
  contactIdentifier,
  contactLabel,
  contactMatchesSearch,
  contactSearchOrFilter,
  instagramNameWithHandle,
} from './identity';

const wa = { channel: 'whatsapp', name: 'Ana Beatriz Nogueira', phone: '5585999990201', username: null, email: 'ana@exemplo.com' };
const waNoName = { channel: 'whatsapp', name: null, phone: '5585999990201', username: null };
const ig = { channel: 'instagram', name: 'Paulo Andrade | Tráfego Pago', phone: null, username: 'opauloandrade' };
const igNoHandle = { channel: 'instagram', name: 'Tânia Moura', phone: null, username: null };
const igBare = { channel: 'instagram', name: null, phone: null, username: null };

describe('contactIdentifier — telefone no WhatsApp, @ no Instagram, nunca em branco', () => {
  it('WhatsApp: o telefone, exatamente como está', () => {
    expect(contactIdentifier(wa)).toBe('5585999990201');
  });
  it('WhatsApp sem canal gravado (legado) continua sendo WhatsApp', () => {
    expect(contactIdentifier({ phone: '5511999990000' })).toBe('5511999990000');
  });
  it('WhatsApp com telefone nulo continua como antes (vazio) — não é Instagram', () => {
    expect(contactIdentifier({ channel: 'whatsapp', phone: null })).toBe('');
  });
  it('Instagram: o @', () => {
    expect(contactIdentifier(ig)).toBe('@opauloandrade');
  });
  it('Instagram sem @ ainda: "Instagram", nunca vazio', () => {
    expect(contactIdentifier(igNoHandle)).toBe('Instagram');
    expect(contactIdentifier(igBare)).toBe('Instagram');
  });
});

describe('contactLabel — onde a tela usava `name || phone`', () => {
  it('WhatsApp é literalmente name || phone', () => {
    expect(contactLabel(wa)).toBe(wa.name);
    expect(contactLabel(waNoName)).toBe('5585999990201');
  });
  it('Instagram: nome, senão @, senão "Instagram"', () => {
    expect(contactLabel(ig)).toBe('Paulo Andrade | Tráfego Pago');
    expect(contactLabel({ ...ig, name: '  ' })).toBe('@opauloandrade');
    expect(contactLabel(igBare)).toBe('Instagram');
  });
});

describe('instagramNameWithHandle', () => {
  it('nome + (@) — e só o @ sem nome, nunca "@a (@a)"', () => {
    expect(instagramNameWithHandle(ig)).toBe('Paulo Andrade | Tráfego Pago (@opauloandrade)');
    expect(instagramNameWithHandle({ ...ig, name: null })).toBe('@opauloandrade');
    expect(instagramNameWithHandle(igNoHandle)).toBe('Tânia Moura (Instagram)');
  });
});

describe('contactMatchesSearch — busca da lista de Contatos', () => {
  it('acha contato do Instagram pelo nome', () => {
    expect(contactMatchesSearch(ig, 'tráfego')).toBe(true);
  });
  it('acha pelo @, com ou sem o "@" digitado', () => {
    expect(contactMatchesSearch(ig, 'opaulo')).toBe(true);
    expect(contactMatchesSearch(ig, '@opaulo')).toBe(true);
    expect(contactMatchesSearch(ig, '@OPAULO')).toBe(true);
  });
  it('WhatsApp continua achando por nome, telefone e e-mail', () => {
    expect(contactMatchesSearch(wa, 'nogueira')).toBe(true);
    expect(contactMatchesSearch(wa, '9990201')).toBe(true);
    expect(contactMatchesSearch(wa, 'ana@exemplo')).toBe(true);
    expect(contactMatchesSearch(wa, 'opaulo')).toBe(false);
  });
  it('"@" sozinho não vira "acha todo mundo" pelo @', () => {
    expect(contactMatchesSearch(igBare, '@')).toBe(false);
    expect(contactMatchesSearch(ig, '@')).toBe(false);
  });
  it('busca vazia deixa todos', () => {
    expect(contactMatchesSearch(igBare, '  ')).toBe(true);
  });
});

describe('contactSearchOrFilter — busca no servidor (paleta de comandos)', () => {
  it('nome, telefone e @ — o @ sem o "@"', () => {
    expect(contactSearchOrFilter('@opaulo')).toBe('name.ilike.%@opaulo%,phone.ilike.%@opaulo%,username.ilike.%opaulo%');
  });
  it('escapa os mesmos caracteres de antes', () => {
    expect(contactSearchOrFilter('a,b%')).toBe('name.ilike.%a\\,b\\%%,phone.ilike.%a\\,b\\%%,username.ilike.%a\\,b\\%%');
  });
  it('menos de 2 caracteres não busca, como antes', () => {
    expect(contactSearchOrFilter('a')).toBeNull();
  });
});

describe('asContactChannelFilter', () => {
  it('lixo vira "all"', () => {
    expect(asContactChannelFilter('instagram')).toBe('instagram');
    expect(asContactChannelFilter('whatsapp')).toBe('whatsapp');
    expect(asContactChannelFilter('sms')).toBe('all');
    expect(asContactChannelFilter(null)).toBe('all');
  });
});

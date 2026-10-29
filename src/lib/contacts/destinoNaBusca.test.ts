import { describe, expect, it } from 'vitest';
import { contatoDoEndereco, destinoDoContatoNaBusca } from './destinoNaBusca';

const ID = 'aaaaaaaa-0000-4000-8000-0000000000d1';

describe('destinoDoContatoNaBusca', () => {
  it('com conversa: abre a conversa do contato', () => {
    expect(destinoDoContatoNaBusca({ contactId: ID, temConversa: true, alcancaConversas: true })).toBe(
      `/dashboard/conversations?contact=${ID}`,
    );
  });

  it('sem conversa: abre o cartão do contato, nunca cria conversa', () => {
    expect(destinoDoContatoNaBusca({ contactId: ID, temConversa: false, alcancaConversas: true })).toBe(
      `/dashboard/contacts?contact=${ID}`,
    );
  });

  it('sem acesso à tela Conversas: o cartão', () => {
    expect(destinoDoContatoNaBusca({ contactId: ID, temConversa: true, alcancaConversas: false })).toBe(
      `/dashboard/contacts?contact=${ID}`,
    );
  });
});

describe('contatoDoEndereco', () => {
  it('lê o ?contact= da tela Contatos', () => {
    expect(contatoDoEndereco(new URLSearchParams(`contact=${ID}`))).toBe(ID);
    expect(contatoDoEndereco(new URLSearchParams(''))).toBeNull();
    expect(contatoDoEndereco(new URLSearchParams('contact='))).toBeNull();
  });
});

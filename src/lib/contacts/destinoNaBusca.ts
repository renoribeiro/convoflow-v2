/**
 * Clicar num contato na busca rápida (Ctrl+K), lote 6d, achado 28, decisão
 * D12: abre a conversa dele; sem conversa (ou sem acesso à tela Conversas),
 * abre o cartão do contato em Contatos. Antes a busca levava à lista inteira
 * de Contatos e ignorava o contato escolhido.
 *
 * "Tem conversa" é o que a RLS deixa a pessoa ver: com a visibilidade restrita
 * (20260914000001), a conversa de outra pessoa não aparece, e aí o destino é o
 * cartão. Nunca a criação de uma conversa nova: o link de Conversas com
 * ?contact= criaria uma quando não acha.
 */
export function destinoDoContatoNaBusca(opcoes: {
  contactId: string;
  temConversa: boolean;
  alcancaConversas: boolean;
}): string {
  const id = encodeURIComponent(opcoes.contactId);
  return opcoes.temConversa && opcoes.alcancaConversas
    ? `/dashboard/conversations?contact=${id}`
    : `/dashboard/contacts?contact=${id}`;
}

/** O contato que a busca mandou abrir em Contatos (?contact=), ou null. */
export function contatoDoEndereco(params: URLSearchParams): string | null {
  const id = params.get('contact')?.trim();
  return id ? id : null;
}

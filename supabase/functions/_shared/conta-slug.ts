// =============================================================================
// conta-slug — o slug de uma Conta nova de gerente
// =============================================================================
// Usado pelo manage-user (Conta criada quando o superadmin convida um gerente)
// e pelo public-signup (Conta criada pelo cadastro no site). As duas Contas
// têm de nascer no MESMO formato — é o que faz uma ser indistinguível da outra
// para o resto do sistema.
//
// Formato: `<nome-sem-acento>-<sufixo>`, ex.: "maria-souza-1a2b3c4d". O slug é
// NOT NULL e único em `tenants`; o sufixo aleatório resolve a unicidade.
//
// Sem nada do Deno: roda também no Vitest (src/lib/signup/*.test.ts).
// =============================================================================

/** A parte legível do slug: minúsculas, sem acento, hífen entre palavras. */
export function contaSlugBase(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // tira acento
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      // O corte em 40 pode parar logo depois de um hífen ("empresa-de-"): sem
      // esta linha o slug final sairia com hífen duplo ("empresa-de--1a2b").
      .replace(/-+$/g, '') || 'conta'
  );
}

/** Slug completo. `sufixo` vem de fora para o teste poder fixá-lo. */
export function contaSlug(nome: string, sufixo: string): string {
  return `${contaSlugBase(nome)}-${sufixo}`;
}

/** Sufixo aleatório de 8 caracteres hexadecimais. */
export function sufixoAleatorio(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

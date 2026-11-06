/**
 * O que mudou entre as etiquetas que o contato tinha e as marcadas agora. É isso,
 * e só isso, que vai para `set_contact_tags`: etiqueta que não mudou não é tocada.
 */
export function diferencaDeEtiquetas(atuais: string[], marcadas: string[]) {
  const antes = new Set(atuais);
  const depois = new Set(marcadas);
  return {
    adicionar: [...depois].filter((id) => !antes.has(id)),
    remover: [...antes].filter((id) => !depois.has(id)),
  };
}

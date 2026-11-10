// =============================================================================
// Os limites do teste grátis e do cadastro: tipos, valores padrão e o texto
// =============================================================================
// Sem dependência nenhuma, para a página de vendas e a ajuda usarem sem puxar o
// cliente do banco. Os valores reais moram em public.limites_da_plataforma e o
// superadmin muda na tela "Limites de uso"; LIMITES_PADRAO são os números com
// que a tabela nasce (migração 20261109000001), os mesmos que os Termos citam.
// =============================================================================

export interface LimitesDaPlataforma {
  teste_lojas: number;
  teste_numeros: number;
  teste_numeros_qr: number;
  teste_mensagens_dia: number;
  teste_contatos_campanha: number;
  cadastro_por_hora: number;
  cadastro_por_dia: number;
  atualizado_em?: string | null;
  atualizado_por?: string | null;
}

/** Os campos que o superadmin muda, na ordem da tela. */
export const CAMPOS_DOS_LIMITES = [
  'teste_lojas',
  'teste_numeros',
  'teste_numeros_qr',
  'teste_mensagens_dia',
  'teste_contatos_campanha',
  'cadastro_por_hora',
  'cadastro_por_dia',
] as const;
export type CampoDoLimite = (typeof CAMPOS_DOS_LIMITES)[number];

/** Os valores com que a tabela nasce (a migração usa os mesmos). */
export const LIMITES_PADRAO: Record<CampoDoLimite, number> = {
  teste_lojas: 2,
  teste_numeros: 2,
  teste_numeros_qr: 1,
  teste_mensagens_dia: 300,
  teste_contatos_campanha: 100,
  cadastro_por_hora: 20,
  cadastro_por_dia: 100,
};

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

/** As linhas que a tela de bloqueio mostra antes do cartão. */
export function resumoDosLimitesDoTeste(l: Pick<LimitesDaPlataforma, CampoDoLimite>): string[] {
  const qr =
    l.teste_numeros_qr === 0
      ? 'nenhum por QR Code'
      : l.teste_numeros_qr >= l.teste_numeros
        ? 'todos podem ser por QR Code'
        : `${plural(l.teste_numeros_qr, 'por QR Code', 'por QR Code')}`;
  return [
    `Até ${plural(l.teste_lojas, 'Loja', 'Lojas')}.`,
    `Até ${plural(l.teste_numeros, 'número de WhatsApp', 'números de WhatsApp')} (${qr}).`,
    `Até ${l.teste_mensagens_dia} mensagens enviadas por dia.`,
    `Campanhas de até ${l.teste_contatos_campanha} contatos por disparo.`,
  ];
}

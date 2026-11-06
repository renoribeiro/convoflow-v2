import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';

/**
 * A Loja aberta tem funil montado? Decide o selo "Contato novo" da lista de
 * Conversas: ele quer dizer "sem etapa no funil", e numa Loja sem etapas isso
 * vale para todo contato, para sempre. Sem resposta ainda (ou com erro), o selo
 * fica escondido: ele não pisca e some.
 *
 * Chave em `funnel_stages`: criar ou apagar etapa já invalida esse prefixo.
 */
export function useLojaTemEtapas(): boolean {
  const { data } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['funnel_stages', 'existe'],
    select: 'id',
    limit: 1,
    silent: true,
  });
  return (data?.length ?? 0) > 0;
}

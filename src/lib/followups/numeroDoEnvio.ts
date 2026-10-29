/**
 * Por qual número sai o follow up agendado: a mesma regra do servidor
 * (process-followup-dispatch, resolveInstance). Primeiro o número do follow up,
 * depois o da conversa do contato, por fim o número de WhatsApp ativo mais
 * antigo da Loja. A tela precisa saber antes de salvar, porque só número da
 * API Oficial oferece template aprovado, e a lista é a da conta Meta dele.
 */
import { channelOfProvider } from '@/lib/conversations/channel';

export interface NumeroDaLoja {
  id: string;
  provider?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
}

export function numeroDoEnvio<T extends NumeroDaLoja>(
  numeros: readonly T[],
  preferidos: ReadonlyArray<string | null | undefined>,
): T | null {
  for (const id of preferidos) {
    const achado = id ? numeros.find((n) => n.id === id) : undefined;
    if (achado) return achado;
  }
  const ativos = numeros
    .filter((n) => n.is_active !== false && channelOfProvider(n.provider) === 'whatsapp')
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  return ativos[0] ?? null;
}

export const ehNumeroOficial = (n: NumeroDaLoja | null | undefined): boolean => n?.provider === 'official';

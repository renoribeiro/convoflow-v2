import { useCallback, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { QUERY_KEYS } from '@/lib/queryClient';
import { classifyMediaUrl } from '@/lib/media/whatsappMedia';

/**
 * Link temporário da mídia das Conversas.
 *
 * O bucket `whatsapp-media` é privado: cada foto, áudio, vídeo e documento abre
 * por um link assinado que vale 1 hora, entregue pela função `media-links` a
 * quem vê a mensagem. Este hook pede os links das mensagens da tela num pedido
 * só (o lote junta o que chega no mesmo instante, até 100 por chamada) e guarda
 * cada link por mensagem por 50 minutos: rolar a conversa ou voltar a ela não
 * pede de novo, e o link é trocado antes de vencer.
 */

/** Um pouco antes da 1 hora do link. */
export const MEDIA_LINK_CACHE_MS = 50 * 60 * 1000;
const POR_CHAMADA = 100;
const JANELA_DO_LOTE_MS = 10;

export type MediaResolution = {
  /** O que vai no src/href. null = nada para mostrar ainda. */
  url: string | null;
  state: 'ready' | 'loading' | 'unavailable';
};

type Pendente = { resolve: (url: string | null) => void; reject: (e: unknown) => void };
let fila = new Map<string, Pendente[]>();
let agendado: ReturnType<typeof setTimeout> | null = null;

async function esvaziarFila() {
  const lote = fila;
  fila = new Map();
  agendado = null;
  const ids = [...lote.keys()];
  for (let i = 0; i < ids.length; i += POR_CHAMADA) {
    const parte = ids.slice(i, i + POR_CHAMADA);
    try {
      const { data, error } = await supabase.functions.invoke('media-links', { body: { message_ids: parte } });
      if (error) throw error;
      const links = ((data as { links?: Record<string, string> } | null)?.links ?? {}) as Record<string, string>;
      for (const id of parte) lote.get(id)?.forEach((p) => p.resolve(links[id] ?? null));
    } catch (e) {
      logger.warn('[useMediaLinks] media-links falhou', { error: e instanceof Error ? e.message : String(e) });
      for (const id of parte) lote.get(id)?.forEach((p) => p.reject(e));
    }
  }
}

/** Pede o link de uma mensagem; os pedidos do mesmo instante viram uma chamada. */
export function pedirLinkDaMidia(messageId: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const lista = fila.get(messageId) ?? [];
    lista.push({ resolve, reject });
    fila.set(messageId, lista);
    if (!agendado) agendado = setTimeout(() => void esvaziarFila(), JANELA_DO_LOTE_MS);
  });
}

/** Só para testes. */
export function __resetMediaLinkQueue() {
  if (agendado) clearTimeout(agendado);
  agendado = null;
  fila = new Map();
}

function origemDoProjeto(): string | undefined {
  try {
    return env.get('SUPABASE_URL') || undefined;
  } catch {
    return undefined;
  }
}

type ComMidia = { id: string; media_url?: string | null };

/**
 * Devolve `resolver(id, valorGravado)`: o endereço que a bolha usa para aquela
 * mensagem. Link de fora passa direto; arquivo nosso espera o link assinado.
 * Se o link não vier (função fora do ar, mensagem sem permissão), a URL pública
 * antiga ainda é tentada quando é isso que está gravado.
 */
export function useMediaLinks(mensagens: ComMidia[]): (id: string, valor: string | null | undefined) => MediaResolution {
  const origem = origemDoProjeto();
  const alvos = useMemo(
    () =>
      mensagens.filter((m) => classifyMediaUrl(m.media_url ?? null, origem).kind === 'storage')
        .map((m) => ({ id: m.id, media_url: m.media_url as string })),
    [mensagens, origem],
  );

  const resultados = useQueries({
    queries: alvos.map((a) => ({
      // O valor gravado entra na chave: a mídia recebida chega primeiro sem
      // arquivo e ganha o caminho segundos depois; aí o link é pedido de novo.
      queryKey: [QUERY_KEYS.MEDIA_LINKS, a.id, a.media_url],
      queryFn: () => pedirLinkDaMidia(a.id),
      staleTime: MEDIA_LINK_CACHE_MS,
      gcTime: MEDIA_LINK_CACHE_MS,
      refetchInterval: MEDIA_LINK_CACHE_MS,
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  });

  const porId = useMemo(() => {
    const m = new Map<string, { data: string | null | undefined; status: 'pending' | 'error' | 'success' }>();
    alvos.forEach((a, i) => m.set(a.id, { data: resultados[i]?.data, status: resultados[i]?.status ?? 'pending' }));
    return m;
  }, [alvos, resultados]);

  return useCallback(
    (id: string, valor: string | null | undefined): MediaResolution => {
      const ref = classifyMediaUrl(valor ?? null, origem);
      if (ref.kind === 'none') return { url: null, state: 'ready' };
      if (ref.kind === 'external') return { url: ref.url, state: 'ready' };
      const r = porId.get(id);
      if (r?.data) return { url: r.data, state: 'ready' };
      if (!r || r.status === 'pending') return { url: null, state: 'loading' };
      return ref.fallbackUrl ? { url: ref.fallbackUrl, state: 'ready' } : { url: null, state: 'unavailable' };
    },
    [porId, origem],
  );
}

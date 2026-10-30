// =============================================================================
// conversations/localizacao — enviar uma localização pelas Conversas
// =============================================================================
// Lote 6f, B5, decisão D4. O envio em si é do servidor (whatsapp-send-message,
// type 'location'), igual nos três provedores: Evolution (/message/sendLocation),
// WAHA (/api/sendLocation) e API Oficial (type: location). Os três exigem
// latitude e longitude; nome e endereço são opcionais.
//
// Este arquivo só monta o ponto, de dois jeitos:
//   1. "Usar minha localização": a posição do aparelho, com a permissão do
//      navegador (navigator.geolocation).
//   2. "Digitar o endereço": a busca do OpenStreetMap (Nominatim), UMA busca
//      por clique, só no Brasil. A regra de uso do serviço proíbe busca a cada
//      tecla; o navegador manda o endereço do site no Referer, como ela pede.
//      Só o texto digitado sai do navegador.
//
// O PWA não guarda as respostas da busca (regra NetworkOnly em vite.config.ts).
// =============================================================================

export interface PontoDoMapa {
  latitude: number;
  longitude: number;
  /** Nome do lugar que aparece no cartão do WhatsApp ("Loja Centro"). */
  nome?: string;
  /** Endereço por extenso, abaixo do nome. */
  endereco?: string;
}

export type ResultadoDaBusca =
  | { ok: true; pontos: PontoDoMapa[] }
  | { ok: false; motivo: 'curto' | 'nao_encontrado' | 'indisponivel' };

export type ResultadoDaPosicao =
  | { ok: true; ponto: PontoDoMapa }
  | { ok: false; motivo: 'sem_suporte' | 'negada' | 'indisponivel' | 'demorou' };

export const TEXTOS_DA_LOCALIZACAO = {
  sem_suporte: 'Este navegador não informa a localização. Digite o endereço.',
  negada:
    'O navegador não deixou usar sua localização. Libere a localização para este site nas configurações do navegador, ou digite o endereço.',
  indisponivel_posicao: 'Não foi possível descobrir onde você está agora. Tente de novo ou digite o endereço.',
  demorou: 'A localização demorou demais para chegar. Tente de novo ou digite o endereço.',
  curto: 'Digite o endereço com rua, número e cidade.',
  nao_encontrado: 'Nenhum lugar encontrado com esse endereço. Confira a rua, o número e a cidade.',
  indisponivel_busca: 'A busca de endereço não respondeu agora. Tente de novo em instantes ou use sua localização.',
} as const;

const BUSCA = 'https://nominatim.openstreetmap.org/search';
export const TEMPO_LIMITE_MS = 8_000;
const MINIMO_DE_LETRAS = 5;

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Latitude e longitude que existem no mapa. A mesma regra do servidor. */
export function pontoValido(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/** O link "Ver no mapa": o mesmo que a bolha da conversa abre. */
export function linkDoMapa(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/** "-23.55052, -46.63331": as coordenadas em texto, com 5 casas (cerca de 1 metro). */
export function coordenadasEmTexto(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

/** O texto que a conversa grava para a mensagem (lista e busca usam). */
export function textoDaLocalizacao(p: PontoDoMapa): string {
  return p.nome?.trim() || p.endereco?.trim() || 'Localização';
}

/**
 * Busca o endereço no OpenStreetMap. Até 5 lugares, no Brasil. Sem resposta
 * no tempo limite, ou resposta estranha, vira 'indisponivel'.
 */
export async function buscarEndereco(
  texto: string,
  fetchImpl: Fetch = fetch as unknown as Fetch,
  limiteMs = TEMPO_LIMITE_MS,
): Promise<ResultadoDaBusca> {
  const q = (texto ?? '').trim();
  if (q.replace(/\s+/g, '').length < MINIMO_DE_LETRAS) return { ok: false, motivo: 'curto' };

  const url = `${BUSCA}?${new URLSearchParams({
    q,
    format: 'jsonv2',
    countrycodes: 'br',
    limit: '5',
    'accept-language': 'pt-BR',
  }).toString()}`;

  const controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const relogio = controle ? setTimeout(() => controle.abort(), limiteMs) : null;
  try {
    const r = await fetchImpl(url, controle ? { signal: controle.signal } : undefined);
    if (!r.ok) return { ok: false, motivo: 'indisponivel' };
    const corpo = await r.json();
    if (!Array.isArray(corpo)) return { ok: false, motivo: 'indisponivel' };
    const pontos: PontoDoMapa[] = [];
    for (const item of corpo as Array<Record<string, unknown>>) {
      const latitude = Number(item?.lat);
      const longitude = Number(item?.lon);
      if (!pontoValido(latitude, longitude)) continue;
      const endereco = typeof item?.display_name === 'string' ? item.display_name.trim() : '';
      const nome = typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : undefined;
      pontos.push({ latitude, longitude, endereco: endereco || undefined, nome });
    }
    return pontos.length ? { ok: true, pontos } : { ok: false, motivo: 'nao_encontrado' };
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

interface Geolocalizacao {
  getCurrentPosition: (
    ok: (p: { coords: { latitude: number; longitude: number } }) => void,
    erro: (e: { code: number }) => void,
    opcoes?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
  ) => void;
}

/**
 * A posição do aparelho, com a permissão do navegador. O navegador pergunta à
 * pessoa na primeira vez; recusar vira 'negada', com o caminho para liberar.
 */
export function lerPosicaoAtual(
  geo: Geolocalizacao | undefined = typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
  limiteMs = 15_000,
): Promise<ResultadoDaPosicao> {
  if (!geo) return Promise.resolve({ ok: false, motivo: 'sem_suporte' });
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (p) => {
        const { latitude, longitude } = p.coords;
        resolve(
          pontoValido(latitude, longitude)
            ? { ok: true, ponto: { latitude, longitude } }
            : { ok: false, motivo: 'indisponivel' },
        );
      },
      // 1 = permissão negada, 2 = posição indisponível, 3 = tempo esgotado.
      (e) => resolve({ ok: false, motivo: e.code === 1 ? 'negada' : e.code === 3 ? 'demorou' : 'indisponivel' }),
      { enableHighAccuracy: true, timeout: limiteMs, maximumAge: 60_000 },
    );
  });
}

/** A frase do motivo da busca de endereço, para o aviso da janela. */
export function motivoDaBusca(motivo: Extract<ResultadoDaBusca, { ok: false }>['motivo']): string {
  if (motivo === 'curto') return TEXTOS_DA_LOCALIZACAO.curto;
  if (motivo === 'nao_encontrado') return TEXTOS_DA_LOCALIZACAO.nao_encontrado;
  return TEXTOS_DA_LOCALIZACAO.indisponivel_busca;
}

/** A frase do motivo da posição do aparelho, para o aviso da janela. */
export function motivoDaPosicao(motivo: Extract<ResultadoDaPosicao, { ok: false }>['motivo']): string {
  if (motivo === 'sem_suporte') return TEXTOS_DA_LOCALIZACAO.sem_suporte;
  if (motivo === 'negada') return TEXTOS_DA_LOCALIZACAO.negada;
  if (motivo === 'demorou') return TEXTOS_DA_LOCALIZACAO.demorou;
  return TEXTOS_DA_LOCALIZACAO.indisponivel_posicao;
}

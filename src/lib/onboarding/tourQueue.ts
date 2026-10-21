/**
 * Fila de UM pedido de tour.
 *
 * Quem pede ("Fazer agora", "Começar") quase sempre navega em seguida, e às
 * vezes troca a Loja em foco — o que recarrega o painel inteiro (o AuthGuard
 * mostra o carregando enquanto o TenantContext relê a Loja). Um estado React
 * dentro do painel morreria junto. Esta fila fica fora do React (zustand, no
 * módulo) e o TourHost, montado no DashboardLayout, pega o pedido quando a
 * tela do tour estiver aberta.
 *
 * Pedido velho (a navegação não aconteceu) é descartado: o tour nunca aparece
 * minutos depois, numa tela que a pessoa abriu por outro motivo.
 */
import { create } from 'zustand';

/** Depois disto o pedido não vale mais. */
export const TOUR_REQUEST_TTL_MS = 20_000;

export interface TourRequest {
  tourId: string;
  at: number;
}

interface TourQueueState {
  pending: TourRequest | null;
  request: (tourId: string) => void;
  clear: () => void;
}

export const useTourQueue = create<TourQueueState>()((set) => ({
  pending: null,
  request: (tourId) => set({ pending: { tourId, at: Date.now() } }),
  clear: () => set({ pending: null }),
}));

export const requestTour = (tourId: string) => useTourQueue.getState().request(tourId);

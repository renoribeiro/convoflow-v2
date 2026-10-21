/**
 * Roda o tour pedido na fila (src/lib/onboarding/tourQueue.ts) quando a tela
 * dele estiver aberta. Montado UMA vez, no DashboardLayout — depois do
 * bloqueio de pagamento: com a Conta bloqueada o layout devolve a tela de
 * bloqueio antes de chegar aqui, e nada aparece.
 *
 * Sair da tela do tour encerra o tour. Terminar ou fechar grava em
 * user_onboarding.state.tours (só registro: nenhum tour reabre sozinho).
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { patchOnboardingState } from '@/lib/onboarding/api';
import { markTourDone, isOnboardingRole } from '@/lib/onboarding/state';
import { getTour, routeMatches } from '@/lib/onboarding/tours';
import { TOUR_REQUEST_TTL_MS, useTourQueue } from '@/lib/onboarding/tourQueue';
import { logger } from '@/lib/logger';
import { startTour, type TourHandle } from './TourRunner';

export function TourHost() {
  const pending = useTourQueue((s) => s.pending);
  const clear = useTourQueue((s) => s.clear);
  const location = useLocation();
  const role = useRole();
  const { profile } = useTenant();
  const userId = (profile?.user_id as string | undefined) ?? null;
  const queryClient = useQueryClient();

  const ativo = useRef<(TourHandle & { route: string }) | null>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      ativo.current?.destroy();
      ativo.current = null;
    };
  }, []);

  // Saiu da tela do tour: ele acaba.
  useEffect(() => {
    const a = ativo.current;
    if (a && !routeMatches(a.route, location.pathname, location.search)) a.destroy();
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!pending) return;
    if (!isOnboardingRole(role)) {
      clear();
      return;
    }
    if (Date.now() - pending.at > TOUR_REQUEST_TTL_MS) {
      clear();
      return;
    }
    const tour = getTour(pending.tourId);
    if (!tour) {
      clear();
      return;
    }
    // A navegação ainda não chegou: espera o próximo render.
    if (!routeMatches(tour.route, location.pathname, location.search)) return;

    clear();
    ativo.current?.destroy();
    startTour(tour, {
      onFinish: () => {
        if (ativo.current?.route === tour.route) ativo.current = null;
        if (userId) {
          void patchOnboardingState(queryClient, userId, (s) => markTourDone(s, tour.id, new Date().toISOString()));
        }
      },
    })
      .then((handle) => {
        if (!handle) return;
        if (!montado.current) {
          handle.destroy();
          return;
        }
        ativo.current = { ...handle, route: tour.route };
      })
      .catch((error) => logger.warn('[onboarding] tour não abriu', { tourId: tour.id, error }));
  }, [pending, role, location.pathname, location.search, clear, queryClient, userId]);

  return null;
}

export default TourHost;

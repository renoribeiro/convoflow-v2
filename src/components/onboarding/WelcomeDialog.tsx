/**
 * Boas-vindas: aparece UMA vez, no Dashboard, na primeira visita com o sistema
 * liberado (com a Conta bloqueada o DashboardLayout mostra a tela de bloqueio
 * e o Dashboard nem monta). Superadmin nunca vê.
 *
 * Qualquer saída conta como "vista": "Começar", "Agora não", o X ou Esc. Para
 * ver de novo: Ajuda › "Ver tutorial de novo".
 *
 * "Começar" é o clique que abre o primeiro tour:
 *   Gerente e Gestor → destaque da lista "Primeiros passos", aqui mesmo;
 *   Atendente        → a tela de Conversas, em 4 passos.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/TenantContext';
import { useHelpVisibility } from '@/hooks/useHelpVisibility';
import { useOnboardingState } from '@/hooks/useOnboarding';
import { isOnboardingRole, markWelcomeSeen, shouldShowWelcome } from '@/lib/onboarding/state';
import { getTour } from '@/lib/onboarding/tours';
import { requestTour } from '@/lib/onboarding/tourQueue';
import { WELCOME_COPY, WELCOME_FOOTNOTE, welcomeTitle } from '@/lib/onboarding/welcome';

export function WelcomeDialog() {
  const { state, role, update } = useOnboardingState();
  const { profile } = useTenant();
  const { canAccess } = useHelpVisibility();
  const navigate = useNavigate();
  const [fechada, setFechada] = useState(false);

  if (!isOnboardingRole(role)) return null;
  const aberta = !fechada && shouldShowWelcome(role, state);
  const texto = WELCOME_COPY[role];

  const marcarVista = () => {
    setFechada(true);
    void update((s) => markWelcomeSeen(s, new Date().toISOString()));
  };

  const comecar = () => {
    marcarVista();
    const tourId = role === 'atendente' ? 'conversas' : 'primeiros-passos';
    const tour = getTour(tourId);
    if (!tour || !canAccess(tour)) return;
    requestTour(tour.id);
    if (tour.route !== '/dashboard') navigate(tour.route);
  };

  return (
    <Dialog open={aberta} onOpenChange={(open) => !open && marcarVista()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader className="space-y-3 text-left">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <DialogTitle className="text-lg">{welcomeTitle(profile?.first_name)}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{texto.intro}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5">
          {texto.bullets.map((linha) => (
            <li key={linha} className="flex items-start gap-2.5 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{linha}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">{WELCOME_FOOTNOTE}</p>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
          <Button variant="outline" onClick={marcarVista}>
            Agora não
          </Button>
          <Button onClick={comecar} autoFocus>
            Começar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default WelcomeDialog;

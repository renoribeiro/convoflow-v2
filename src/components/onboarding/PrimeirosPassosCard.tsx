/**
 * "Primeiros passos" — a lista de configuração do Dashboard, por cargo.
 *
 * Substituiu o cartão de tutoriais (OnboardingTutorialsCard) no mesmo lugar.
 * O que está feito vem da função onboarding_checklist (dado real, a cada
 * visita); quem vê a lista e quando ela some está em
 * src/lib/onboarding/checklist.ts (decideChecklistView).
 *
 * Cada passo pendente tem:
 *   "Fazer agora"      → abre a tela e destaca onde clicar (tour). Nada é
 *                        destacado sem este clique.
 *   "Ver passo a passo"→ o tutorial (ou a referência) na Ajuda.
 *
 * No celular (lote 6f, B12, decisão D11) a lista vem curta: o progresso, os 2
 * próximos passos pendentes e "Ver todos". Do tablet para cima, a lista
 * inteira. É só CSS (max-md:hidden): o passo escondido continua na página,
 * sem piscar a lista inteira antes de encolher.
 */
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, PartyPopper, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useTenant } from '@/contexts/TenantContext';
import { useMyStores } from '@/hooks/useMyStores';
import { useOnboardingChecklist } from '@/hooks/useOnboarding';
import {
  PRIORITY_LABELS,
  planFazerAgora,
  stepHelpHref,
  type ChecklistItem,
} from '@/lib/onboarding/checklist';
import { hideChecklist } from '@/lib/onboarding/state';
import { requestTour } from '@/lib/onboarding/tourQueue';
import {
  CHECKLIST_COMO_VOLTAR,
  CHECKLIST_DONE_BODY,
  CHECKLIST_DONE_TITLE,
  CHECKLIST_SUBTITLE,
} from '@/lib/onboarding/welcome';

const PRIORITY_BADGE: Record<ChecklistItem['priority'], string> = {
  obrigatorio: 'border-primary/40 bg-primary/10 text-primary',
  recomendado: 'border-border bg-muted text-muted-foreground',
  opcional: 'border-dashed border-border bg-transparent text-muted-foreground',
};

export function PrimeirosPassosCard() {
  const { role, summary, view, onboarding } = useOnboardingChecklist();
  const { tenant, setActiveTenant } = useTenant();
  const { stores } = useMyStores();
  const navigate = useNavigate();
  const [verTodos, setVerTodos] = useState(false);

  if (view === 'oculto' || !summary || !role || role === 'superadmin') return null;

  const esconder = () => {
    void onboarding.update((s) => hideChecklist(s, new Date().toISOString()));
    toast.info(CHECKLIST_COMO_VOLTAR);
  };

  if (view === 'pronto') {
    return (
      <Moldura className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <PartyPopper className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="primeiros-passos-titulo" className="text-sm font-semibold text-foreground">
            {CHECKLIST_DONE_TITLE}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{CHECKLIST_DONE_BODY}</p>
        </div>
        <Button size="sm" variant="outline" onClick={esconder}>
          Fechar
        </Button>
      </Moldura>
    );
  }

  const fazerAgora = (item: ChecklistItem) => {
    const plano = planFazerAgora({
      role,
      item,
      emLoja: (tenant as { kind?: string | null } | null)?.kind === 'store',
      lojas: stores.map((s) => ({ id: s.id, name: s.name })),
    });
    switch (plano.tipo) {
      case 'abrir':
        if (plano.tourId) requestTour(plano.tourId);
        navigate(plano.screen);
        return;
      case 'trocar-loja':
        if (plano.tourId) requestTour(plano.tourId);
        toast.info(`Abrimos a Loja ${plano.lojaNome} para este passo.`);
        navigate(plano.screen);
        setActiveTenant(plano.lojaId);
        return;
      case 'escolher-loja':
        requestTour(plano.tourId);
        return;
      case 'criar-loja':
        toast.info('Crie a primeira Loja antes deste passo.');
        requestTour(plano.tourId);
        navigate(plano.screen);
        return;
      default:
        return;
    }
  };

  const pct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;

  // Celular: só os 2 próximos pendentes, até a pessoa pedir "Ver todos".
  const proximos = summary.items.filter((i) => !i.done).slice(0, 2).map((i) => i.id);
  const sobra = summary.items.length - proximos.length;
  const curto = !verTodos && sobra > 0;

  return (
    <Moldura>
      <div className="flex items-start gap-3">
        <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:flex">
          <Rocket className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="primeiros-passos-titulo" className="text-sm font-semibold text-foreground">
            Primeiros passos
          </h2>
          <p className={cn('mt-0.5 text-sm text-muted-foreground', curto && 'max-md:hidden')}>
            {CHECKLIST_SUBTITLE[role]}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Progress value={pct} className="h-2 flex-1" aria-label="Progresso dos primeiros passos" />
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {summary.done} de {summary.total}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={esconder}
          className="h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground"
        >
          Esconder
        </Button>
      </div>

      <ol className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        {summary.items.map((item) => {
          const href = stepHelpHref(item);
          const posicao = proximos.indexOf(item.id);
          return (
            <li
              key={item.id}
              className={cn(
                'flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4',
                curto && posicao < 0 && 'max-md:hidden',
                // O primeiro à vista no celular não ganha a linha de cima.
                curto && posicao === 0 && 'max-md:border-t-0',
              )}
              data-passo={item.id}
              data-feito={item.done ? 'sim' : 'nao'}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p
                    className={cn(
                      'flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium',
                      item.done ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    <span className="sr-only">{item.done ? 'Feito: ' : 'Pendente: '}</span>
                    {item.title}
                    {!item.done && (
                      <Badge
                        variant="outline"
                        className={cn('px-1.5 py-0 text-[10px] font-medium', PRIORITY_BADGE[item.priority])}
                      >
                        {PRIORITY_LABELS[item.priority]}
                      </Badge>
                    )}
                  </p>
                  {!item.done && <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>}
                </div>
              </div>

              {!item.done && (
                <div className="flex shrink-0 flex-wrap gap-2 pl-8 sm:pl-0">
                  {item.screen && (
                    <Button size="sm" onClick={() => fazerAgora(item)}>
                      Fazer agora
                    </Button>
                  )}
                  {href && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={href}>Ver passo a passo</Link>
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {sobra > 0 && (
        <div className="mt-3 flex justify-center md:hidden">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setVerTodos((v) => !v)}
            aria-expanded={verTodos}
          >
            {verTodos ? 'Ver menos' : 'Ver todos'}
          </Button>
        </div>
      )}
    </Moldura>
  );
}

/** A moldura dos dois estados (lista e "tudo pronto"); o tour aponta para ela. */
function Moldura({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      data-tour="primeiros-passos"
      aria-labelledby="primeiros-passos-titulo"
      className={cn('rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5', className)}
    >
      {children}
    </section>
  );
}

export default PrimeirosPassosCard;

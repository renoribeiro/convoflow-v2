import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  visibleQuickFilters,
  type QuickFilterCount,
  type QuickFilterCounts,
  type QuickFilterType,
} from './quickFilters';

interface QuickFilterPillsProps {
  value: QuickFilterType;
  onChange: (value: QuickFilterType) => void;
  /** Contagens do conjunto carregado. Chave ausente = sem contagem conhecida. */
  counts?: QuickFilterCounts;
  /** Sinalização de SLA da Loja. Desligada, a pílula "Não respondidas" não existe. */
  slaEnabled?: boolean;
  /** Gestor/gerente: liga a pílula "Responsável indisponível". */
  canSeeIneligible?: boolean;
  className?: string;
}

/**
 * Texto do selo. O "+" não é enfeite: separa "esta é a fila inteira" de "isto é
 * o que já carreguei".
 *
 * As pílulas de coluna real perguntam o total ao servidor e mostram o número
 * seco — é o fundo da fila, e é o que faz uma fila filtrada parar de parecer
 * infinita enquanto ela trabalha. As derivadas só sabem contar o que já veio,
 * então enquanto houver página por carregar sai "12+", que se lê como "pelo
 * menos 12". Rolando até o fim, o piso alcança o total e o "+" some sozinho.
 */
function formatCount({ value, exact }: QuickFilterCount): string {
  return exact ? String(value) : `${value}+`;
}

/** Complemento do tooltip explicando o que aquele número está contando. */
function countHint(count: QuickFilterCount | undefined): string {
  if (!count) return '';
  return count.exact
    ? ` ${count.value} no total.`
    : ` ${count.value} entre as conversas já carregadas. Role para ver o resto.`;
}

/** Verde-limão da pílula ativa e o quase-preto que fica legível em cima dele. */
const ACTIVE_BG = '#DAE27C';
const ACTIVE_FG = '#211E0B';

/** Id compartilhado da animação — o fundo "desliza" entre as pílulas. */
const ACTIVE_LAYOUT_ID = 'conversations-quick-filter-active';

export const QuickFilterPills = ({
  value,
  onChange,
  counts = {},
  slaEnabled = false,
  canSeeIneligible = false,
  className,
}: QuickFilterPillsProps) => {
  const reduceMotion = useReducedMotion();
  const filters = visibleQuickFilters(slaEnabled, { canSeeIneligible });

  // A fila rola de lado (a coluna da lista tem 320px no desktop) e a barra de
  // rolagem fica escondida — sem uma pista, cinco das oito pílulas não
  // existiam para quem atende. As setas e o esmaecimento nas pontas são a
  // pista: aparecem só do lado em que ainda há pílula escondida.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState({ left: false, right: false });

  const updateHidden = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setHidden((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateHidden();
    el.addEventListener('scroll', updateHidden, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateHidden) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', updateHidden);
      observer?.disconnect();
    };
  }, [updateHidden, filters.length]);

  const scrollByStep = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({
      left: direction * 160,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  return (
    // O padding (className) fica no de fora; setas e esmaecimento se alinham
    // pelas bordas do rolável, não pelas do padding.
    <div className={cn('min-w-0', className)}>
      <div className="relative">
        {hidden.left && (
          <>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => scrollByStep(-1)}
              aria-label="Ver filtros anteriores"
              className="absolute left-0 top-1/2 z-20 h-6 w-6 -translate-y-1/2 rounded-full bg-background shadow-sm"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {hidden.right && (
          <>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => scrollByStep(1)}
              aria-label="Ver mais filtros"
              className="absolute right-0 top-1/2 z-20 h-6 w-6 -translate-y-1/2 rounded-full bg-background shadow-sm"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <div
          ref={scrollerRef}
          role="group"
          aria-label="Filtros rápidos de conversas"
          className={cn(
            'flex items-center gap-2 overflow-x-auto snap-x snap-mandatory',
            // Barra escondida em todo navegador; quem avisa que há mais são as
            // setas e o esmaecimento acima.
            '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          {filters.map(({ id, label, hint }) => {
            const isActive = value === id;
            const count = counts[id];

            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-pressed={isActive}
                    // Clicar na pílula já ativa desfaz o filtro e volta para "Todas".
                    onClick={() => onChange(isActive ? 'todas' : id)}
                    className={cn(
                      'relative h-8 flex-shrink-0 snap-start rounded-full border px-3 text-xs font-medium',
                      isActive
                        ? 'border-transparent hover:bg-transparent'
                        : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                    style={isActive ? { color: ACTIVE_FG } : undefined}
                  >
                    {isActive && (
                      <motion.span
                        layoutId={ACTIVE_LAYOUT_ID}
                        className="absolute inset-0 rounded-full"
                        style={{ backgroundColor: ACTIVE_BG }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 420, damping: 34 }
                        }
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
                      {label}
                      {count !== undefined && (
                        <Badge
                          variant="secondary"
                          className="h-4 min-w-[1rem] justify-center rounded-full border-transparent px-1 text-[10px] font-semibold"
                          style={
                            isActive
                              ? { backgroundColor: 'rgba(33, 30, 11, 0.14)', color: ACTIVE_FG }
                              : undefined
                          }
                        >
                          {formatCount(count)}
                        </Badge>
                      )}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  {hint}
                  {countHint(count)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
};

import { useRef, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ConversationViewToggleProps {
  /** `true` = lista separada por nível de atendimento; `false` = lista única. */
  grouped: boolean;
  onChange: (grouped: boolean) => void;
  className?: string;
}

/** Mesmo par de cores da pílula ativa dos filtros rápidos. */
const ACTIVE_BG = '#DAE27C';
const ACTIVE_FG = '#211E0B';

/**
 * Id próprio da animação. NÃO reaproveitar o das `QuickFilterPills`: os dois
 * ficam na tela ao mesmo tempo e o fundo saltaria de um componente para o outro.
 */
const ACTIVE_LAYOUT_ID = 'conversations-view-toggle-active';

/** A ordem daqui é a ordem visual e a ordem de navegação pelas setas. */
const VIEW_OPTIONS = [
  { grouped: false, label: 'Lista' },
  { grouped: true, label: 'Por pendência' },
] as const;

/**
 * Seletor de duas opções para o modo de exibição da lista de conversas.
 *
 * Substitui o antigo botão só de ícone: as duas escolhas ficam à mostra, então
 * dá para ver o que existe sem clicar e sem depender de tooltip. Cabe na coluna
 * de 320px (~155px de largura).
 */
export const ConversationViewToggle = ({
  grouped,
  onChange,
  className,
}: ConversationViewToggleProps) => {
  const reduceMotion = useReducedMotion();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Padrão ARIA de radiogroup: só a opção marcada entra no Tab, e as setas
  // andam entre as opções já trocando a seleção.
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) return;

    event.preventDefault();
    const next = (index + (forward ? 1 : -1) + VIEW_OPTIONS.length) % VIEW_OPTIONS.length;
    const nextOption = VIEW_OPTIONS[next];
    if (!nextOption) return;

    onChange(nextOption.grouped);
    optionRefs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Modo de exibição das conversas"
      className={cn(
        'inline-flex flex-shrink-0 items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5',
        className,
      )}
    >
      {VIEW_OPTIONS.map((option, index) => {
        const isActive = option.grouped === grouped;

        return (
          <Button
            key={option.label}
            ref={(node) => {
              optionRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            variant="ghost"
            size="sm"
            onClick={() => onChange(option.grouped)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'relative h-7 rounded-full px-2.5 text-xs font-medium',
              isActive
                ? 'hover:bg-transparent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            style={isActive ? { color: ACTIVE_FG } : undefined}
          >
            {isActive && (
              <motion.span
                layoutId={ACTIVE_LAYOUT_ID}
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: ACTIVE_BG }}
                transition={
                  reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
                }
              />
            )}
            <span className="relative z-10 whitespace-nowrap">{option.label}</span>
          </Button>
        );
      })}
    </div>
  );
};

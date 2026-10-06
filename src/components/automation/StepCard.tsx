/**
 * Card de uma etapa (ou gatilho) no canvas do construtor de automações.
 * Visual por categoria: borda colorida + ícone branco em círculo colorido +
 * título + subtítulo + selo de status. Memoizado para performance.
 */
import React from 'react';
import { Trash2, CheckCircle2, AlertTriangle, ChevronRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_STYLES, type StepCategory } from './automationCatalog';
import type { LucideIcon } from 'lucide-react';

interface StepCardProps {
  category: StepCategory;
  Icon: LucideIcon;
  title: string;
  subtitle?: string;
  status?: 'complete' | 'incomplete' | null;
  selected?: boolean;
  isTrigger?: boolean;
  runsLabel?: string;
  onClick?: () => void;
  onDelete?: () => void;
}

const StepCardBase: React.FC<StepCardProps> = ({
  category,
  Icon,
  title,
  subtitle,
  status = null,
  selected = false,
  isTrigger = false,
  runsLabel,
  onClick,
  onDelete,
}) => {
  const s = CATEGORY_STYLES[category];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${s.label}: ${title}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        'group relative w-72 rounded-xl border bg-card text-left shadow-sm cursor-pointer outline-none',
        'border-l-4 transition-all duration-200 ease-out',
        'animate-in fade-in slide-in-from-top-1',
        'hover:shadow-md hover:-translate-y-0.5 motion-reduce:transform-none',
        'focus-visible:ring-2 focus-visible:ring-offset-2',
        s.border,
        s.cardBg,
        selected && cn('ring-2 ring-offset-2 shadow-md', s.ring),
        isTrigger && 'w-80 bg-gradient-to-br from-emerald-50 to-card dark:from-emerald-950/50 dark:to-card',
      )}
    >
      <div className="flex items-start gap-3 p-3.5">
        {/* Ícone em círculo colorido */}
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm', s.iconBg)}>
          <Icon className="h-5 w-5" />
        </div>

        {/* Conteúdo */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[10px] font-semibold uppercase tracking-wide', s.text)}>{s.label}</span>
            {isTrigger && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </div>
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          {subtitle && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{subtitle}</p>
          )}

          {/* Rodapé: status + runs */}
          <div className="mt-2 flex items-center gap-2">
            {status === 'complete' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Configurado
              </span>
            )}
            {status === 'incomplete' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Incompleto
              </span>
            )}
            {runsLabel && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <Users className="h-2.5 w-2.5" /> {runsLabel}
              </span>
            )}
          </div>
        </div>

        {/* Excluir */}
        {onDelete && (
          <button
            type="button"
            aria-label="Excluir etapa"
            title="Excluir"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:flex focus-visible:flex"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export const StepCard = React.memo(StepCardBase);
export default StepCard;

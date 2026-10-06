/**
 * Conector vertical entre etapas, com botão "+" no meio para inserir uma etapa
 * naquele ponto. Quando o fluxo está ativo, a linha pulsa (respeita
 * prefers-reduced-motion). Usa AddStepPopover para escolher o tipo.
 */
import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddStepPopover } from './AddStepPopover';

interface FlowConnectorProps {
  onInsert: (subtypeKey: string) => void;
  active?: boolean;
  /** Linha mais curta no topo (logo abaixo do gatilho). */
  compact?: boolean;
}

export const FlowConnector: React.FC<FlowConnectorProps> = ({ onInsert, active = false, compact = false }) => {
  return (
    <div className={cn('relative flex w-full flex-col items-center', compact ? 'h-8' : 'h-12')}>
      {/* Linha */}
      <div
        className={cn(
          'w-0.5 flex-1 rounded-full',
          active
            ? 'bg-gradient-to-b from-emerald-400 to-emerald-500 bg-[length:100%_8px] motion-safe:animate-pulse'
            : 'bg-slate-300 dark:bg-slate-700',
        )}
      />
      {/* Botão "+" central */}
      <AddStepPopover onSelect={onInsert}>
        <button
          type="button"
          aria-label="Inserir etapa aqui"
          title="Inserir etapa"
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm',
            'opacity-60 transition-all hover:scale-110 hover:border-primary hover:text-primary hover:opacity-100',
            'focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </AddStepPopover>
    </div>
  );
};

export default FlowConnector;

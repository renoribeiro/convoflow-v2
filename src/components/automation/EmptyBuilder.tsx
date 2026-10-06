/**
 * Estado vazio do construtor: quando o fluxo ainda não tem gatilho, guia o
 * usuário a escolher um — mostrando a grade de gatilhos disponíveis.
 */
import React from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TRIGGERS, CATEGORY_STYLES } from './automationCatalog';

interface EmptyBuilderProps {
  onPick: (triggerKey: string) => void;
}

export const EmptyBuilder: React.FC<EmptyBuilderProps> = ({ onPick }) => {
  const s = CATEGORY_STYLES.trigger;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
        <Zap className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-semibold">Comece escolhendo um gatilho</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        O gatilho define o evento que inicia o fluxo automaticamente. Escolha um abaixo para começar.
      </p>

      <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
        {TRIGGERS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onPick(t.key)}
            className={cn(
              'flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-all',
              'hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md motion-reduce:transform-none',
            )}
          >
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white', s.iconBg)}>
              <t.Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t.label}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default EmptyBuilder;

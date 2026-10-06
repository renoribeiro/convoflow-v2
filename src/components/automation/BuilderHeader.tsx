/**
 * Cabeçalho do construtor: nome editável inline, toggle Ativo com brilho,
 * estatísticas do fluxo e ações (Salvar / Testar / Histórico / Fechar).
 */
import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Save, X, History, FlaskConical, Pencil, Activity, CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowStat } from './useAutomationStats';

interface BuilderHeaderProps {
  name: string;
  onNameChange: (v: string) => void;
  nameInvalid?: boolean;
  active: boolean;
  onActiveChange: (v: boolean) => void;
  stat?: FlowStat;
  onSave: () => void;
  saving?: boolean;
  onClose: () => void;
  onHistory: () => void;
}

export const BuilderHeader: React.FC<BuilderHeaderProps> = ({
  name,
  onNameChange,
  nameInvalid = false,
  active,
  onActiveChange,
  stat,
  onSave,
  saving = false,
  onClose,
  onHistory,
}) => {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      {/* Breadcrumb */}
      <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
        <span>Automação</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">{name || 'Novo fluxo'}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Esquerda: nome + ativo */}
        <div className="flex flex-1 items-center gap-3">
          <div className="relative min-w-[200px] max-w-md flex-1">
            <Pencil className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Nome do fluxo *"
              className={cn(
                'border-transparent bg-transparent pl-8 font-medium hover:border-input focus:border-input',
                nameInvalid && 'border-destructive focus-visible:ring-destructive',
              )}
            />
          </div>

          <label
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all',
              active
                ? 'border-emerald-300 bg-emerald-50 shadow-[0_0_0_3px_rgba(16,185,129,0.15)] dark:border-emerald-800 dark:bg-emerald-950/40'
                : 'border-input bg-muted/40',
            )}
          >
            <Switch checked={active} onCheckedChange={onActiveChange} />
            <span className={cn('text-xs font-medium', active ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
              {active ? 'Ativo' : 'Inativo'}
            </span>
          </label>
        </div>

        {/* Direita: stats + ações */}
        <div className="flex items-center gap-3">
          {stat && stat.executions > 0 && (
            <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
              <span className="inline-flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> {stat.executions} exec.</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> {stat.successRate}%</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onHistory} title="Histórico de execuções">
              <History className="mr-1.5 h-4 w-4" /> Histórico
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button variant="outline" size="sm" disabled className="opacity-60">
                    <FlaskConical className="mr-1.5 h-4 w-4" /> Testar
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Em breve</TooltipContent>
            </Tooltip>
            <Button size="sm" onClick={onSave} disabled={saving}>
              <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="mr-1.5 h-4 w-4" /> Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuilderHeader;

import { AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  formatWaitingTime,
  SLA_CRITICAL_HINT,
  SLA_LEVEL_META,
  type SlaLevel,
} from './slaLevels';

interface SlaIndicatorProps {
  /** Nível já resolvido. 'ok' não renderiza nada. */
  level: SlaLevel;
  lastMessageAt: string | null;
  className?: string;
  /** Aviso do nível crítico. Padrão: o do WhatsApp (a janela de 24 h vale nos dois canais). */
  criticalHint?: string;
}

/**
 * Selo de espera na linha da conversa: bolinha colorida + "aguardando há Xh".
 *
 * Compacto de propósito — a coluna da lista tem 320px no desktop e esta linha
 * ainda divide espaço com as etiquetas do contato.
 */
export const SlaIndicator = ({ level, lastMessageAt, className, criticalHint = SLA_CRITICAL_HINT }: SlaIndicatorProps) => {
  if (level === 'ok') return null;

  const meta = SLA_LEVEL_META[level];

  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-1 leading-none', className)}
      title={`${meta.label}: aguardando resposta ${formatWaitingTime(lastMessageAt)}`}
    >
      <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', meta.dotClass)} aria-hidden />
      <span className={cn('truncate text-[10px] font-medium', meta.textClass)}>
        aguardando {formatWaitingTime(lastMessageAt)}
      </span>
      {level === 'critica' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertTriangle
              className={cn('h-3 w-3 flex-shrink-0', meta.textClass)}
              aria-label={criticalHint}
            />
          </TooltipTrigger>
          <TooltipContent className="text-xs">{criticalHint}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
};

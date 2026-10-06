import { Store } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  LOJA_WIDE_HINT,
  LOJA_WIDE_LABEL,
  useConversationVisibilityConfig,
} from '@/hooks/useConversationVisibilityConfig';

interface LojaWideHintProps {
  className?: string;
}

/**
 * Etiqueta "Toda a Loja" ao lado de um número agregado.
 *
 * Só aparece para um ATENDENTE cuja Loja restringiu a visibilidade de
 * conversas: para ele, a lista de Conversas mostra só as dele, mas os números
 * do Dashboard continuam da Loja inteira (decisão de produto, migração
 * 20260914000001). Sem a etiqueta, "12 conversas ativas" e uma lista com 3
 * pareceriam contradição. Para todo mundo mais a etiqueta não existe — o
 * número e a lista dizem a mesma coisa.
 *
 * Uma frase só, definida em `useConversationVisibilityConfig`. Não escreva
 * variações locais.
 */
export const LojaWideHint = ({ className }: LojaWideHintProps) => {
  const { isRestricted } = useConversationVisibilityConfig();
  if (!isRestricted) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground',
            className,
          )}
          aria-label={LOJA_WIDE_HINT}
          data-testid="loja-wide-hint"
        >
          <Store className="h-3 w-3" aria-hidden />
          {LOJA_WIDE_LABEL}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{LOJA_WIDE_HINT}</TooltipContent>
    </Tooltip>
  );
};

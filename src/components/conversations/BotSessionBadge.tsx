import { Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface BotSessionBadgeProps {
  /** Nome do bot; null enquanto os nomes não carregaram (ou bot apagado). */
  botName: string | null;
  /** 'sm' na linha da lista, 'md' no cabeçalho do chat. */
  size?: 'sm' | 'md';
  className?: string;
}

export const BOT_SESSION_LABEL = 'Bot em atendimento';

export const botSessionHint = (botName: string | null): string =>
  botName
    ? `O chatbot "${botName}" está conduzindo esta conversa. Para atender você mesmo, encerre a sessão do bot no menu ⋮. Senão, vocês dois falam com o cliente ao mesmo tempo.`
    : 'Um chatbot está conduzindo esta conversa. Para atender você mesmo, encerre a sessão do bot no menu ⋮. Senão, vocês dois falam com o cliente ao mesmo tempo.';

/**
 * Selo "Bot em atendimento" — a mesma cara na lista e no cabeçalho do chat.
 *
 * Só é montado quando HÁ sessão ativa (quem decide é quem chama); sem sessão
 * não existe estado vazio nem selo cinza. Segue o visual dos outros selos da
 * linha (`OwnerChip`, "Novo Lead"): Badge outline sem borda, texto pequeno,
 * na cor de destaque — o bot é uma condição da conversa, não um alerta.
 */
export const BotSessionBadge = ({ botName, size = 'md', className }: BotSessionBadgeProps) => {
  const label = size === 'md' && botName ? `${BOT_SESSION_LABEL} · ${botName}` : BOT_SESSION_LABEL;

  return (
    <Tooltip>
      {/* O <span> é o gatilho porque `Badge` não repassa ref (é uma função
          sem forwardRef) e o Tooltip precisa do nó para se posicionar. */}
      <TooltipTrigger asChild>
        <span className={cn('inline-flex min-w-0 max-w-full', className)}>
          <Badge
            variant="outline"
            data-testid="bot-session-badge"
            aria-label={botSessionHint(botName)}
            className={cn(
              'max-w-full gap-1 border-0 bg-accent/15 font-medium text-accent',
              size === 'sm' ? 'px-1.5 text-[10px]' : 'px-2 text-xs',
            )}
          >
            <Bot className={cn('flex-shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} aria-hidden />
            <span className="truncate">{label}</span>
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{botSessionHint(botName)}</TooltipContent>
    </Tooltip>
  );
};

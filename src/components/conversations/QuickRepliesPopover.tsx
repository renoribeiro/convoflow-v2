import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { substituteVariables } from '@/lib/chatbot/flowEngine';
import { useQuickReplies } from '@/hooks/useQuickReplies';
import { buildQuickReplyContext, type QuickReplyContact } from './quickReplyContext';

interface QuickRepliesPopoverProps {
  /** Recebe o conteúdo JÁ com as variáveis trocadas. Preenche o campo — NÃO envia. */
  onSelect: (content: string) => void;
  /** Estado controlado (o pai abre quando o usuário digita "/" no campo vazio). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Contato da conversa aberta, para resolver {first_name} e companhia. */
  contact?: QuickReplyContact | null;
  disabled?: boolean;
}

/**
 * Paleta de respostas rápidas do compositor.
 *
 * As respostas vêm da tabela `quick_replies` da Loja. Até 2026-08-24 eram cinco
 * constantes no código — o comentário que pedia esta tabela estava neste
 * arquivo desde então.
 *
 * As variáveis são trocadas na INSERÇÃO, e a lista já mostra o texto resolvido:
 * o atendente lê "Olá Helena, tudo bem?" e escolhe, em vez de escolher
 * "Olá {first_name}" e ter que arrumar o token na mão. É o motivo de a
 * biblioteca morar dentro da conversa e não só numa tela de configuração.
 */
export function QuickRepliesPopover({
  onSelect,
  open,
  onOpenChange,
  contact,
  disabled,
}: QuickRepliesPopoverProps) {
  const { quickReplies, isLoading } = useQuickReplies();

  // Um contexto por abertura basta: {date}/{time} não precisam de precisão de
  // segundo, e recalcular a cada tecla da busca só geraria lixo.
  const resolvidas = useMemo(() => {
    const ctx = buildQuickReplyContext(contact);
    return quickReplies.map((r) => ({
      id: r.id,
      title: r.name,
      content: substituteVariables(r.content, ctx),
    }));
  }, [quickReplies, contact]);

  const handleSelect = (content: string) => {
    onSelect(content);
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label="Respostas rápidas"
            >
              <Zap className="w-5 h-5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Respostas rápidas <span className="opacity-60">(digite /)</span>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" side="top" className="w-80 p-0">
        {isLoading ? (
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : resolvidas.length === 0 ? (
          // Loja sem nenhuma resposta ainda. Uma caixa vazia aqui só faz o
          // atendente achar que quebrou — o caminho para criar vai junto.
          <div className="p-4 text-sm space-y-2">
            <p className="font-medium">Nenhuma resposta rápida ainda</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Respostas rápidas são trechos que o time reaproveita: saudação, horário de
              funcionamento, dados para pagamento. Qualquer cargo pode criar.
            </p>
            <Link
              to="/dashboard/settings?tab=quick-replies"
              className="inline-block text-xs font-medium text-accent hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Criar em Configurações › Respostas rápidas
            </Link>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Buscar resposta rápida..." />
            <CommandList>
              <CommandEmpty>Nenhuma resposta encontrada.</CommandEmpty>
              <CommandGroup heading="Respostas rápidas">
                {resolvidas.map((reply) => (
                  <CommandItem
                    key={reply.id}
                    value={`${reply.title} ${reply.content}`}
                    onSelect={() => handleSelect(reply.content)}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <span className="text-sm font-medium">{reply.title}</span>
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {reply.content}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

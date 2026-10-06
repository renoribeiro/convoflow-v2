import { useState, type MouseEvent } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useToggleSlaMute } from '@/hooks/useSlaMute';

interface SlaMuteButtonProps {
  conversationId: string;
  /** True quando a conversa já está fora da sinalização. */
  isMuted: boolean;
}

/**
 * "Cliente não vai responder" — tira a conversa da sinalização de SLA.
 *
 * Silenciar pede confirmação (some da fila de pendências de todo mundo);
 * voltar a sinalizar é imediato, porque é a ação de desfazer.
 *
 * O botão vive dentro da linha clicável da conversa, então todo clique aqui
 * para de propagar: quem aperta o sino não quis abrir a conversa.
 */
export const SlaMuteButton = ({ conversationId, isMuted }: SlaMuteButtonProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toggleMute = useToggleSlaMute();

  const isPending = toggleMute.isPending;

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (isMuted) {
      toggleMute.mutate({ conversationId, muted: false });
      return;
    }
    setConfirmOpen(true);
  };

  const label = isMuted ? 'Voltar a sinalizar' : 'Marcar como não respondido pelo cliente';
  const Icon = isMuted ? Bell : BellOff;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            disabled={isPending}
            onClick={handleClick}
            className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">{label}</TooltipContent>
      </Tooltip>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        {/* Renderizado em portal — os cliques daqui não voltam para a linha. */}
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como não respondido?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta conversa deixará de ser sinalizada como pendente. Você pode reverter a qualquer
              momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toggleMute.mutate({ conversationId, muted: true })}
            >
              Marcar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

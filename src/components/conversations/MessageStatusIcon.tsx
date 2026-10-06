import { AlertCircle, Ban, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { RenderableMessage } from './MessageBubble';

type MessageStatus = RenderableMessage['status'];

const STATUS_LABEL: Record<NonNullable<MessageStatus>, string> = {
  pending: 'Pendente',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falhou',
  deleted: 'Mensagem apagada',
};

/** Single WhatsApp-style checkmark (inline SVG, ~14px). */
function SingleTick({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 11"
      width="14"
      height="11"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M1 6.2 4.1 9.3 11.2 1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Double WhatsApp-style checkmark (inline SVG, ~14px). */
function DoubleTick({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 11"
      width="18"
      height="11"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M1 6.2 4.1 9.3 11.2 1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 6.2 9.6 9.3 16.7 1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface MessageStatusIconProps {
  status: MessageStatus;
}

/**
 * Delivery-status indicator shown on outbound messages, mirroring WhatsApp:
 * one tick (sent), two ticks (delivered), two lilac ticks (read), error / clock.
 * A deleted message leaves the delivery track entirely and shows a muted ban
 * sign — without its own case it would fall through to the pulsing clock and
 * read as "still sending".
 * Color transitions smoothly so a sent→read change animates.
 */
export function MessageStatusIcon({ status }: MessageStatusIconProps) {
  const label = status ? STATUS_LABEL[status] : STATUS_LABEL.pending;

  const icon = (() => {
    switch (status) {
      case 'sent':
        return <SingleTick className="text-muted-foreground transition-colors duration-200" />;
      case 'delivered':
        return <DoubleTick className="text-muted-foreground transition-colors duration-200" />;
      case 'read':
        return <DoubleTick className="text-accent transition-colors duration-200" />;
      case 'failed':
        return <AlertCircle className="w-3.5 h-3.5 text-destructive" />;
      case 'deleted':
        return <Ban className="w-3.5 h-3.5 text-muted-foreground" />;
      case 'pending':
      default:
        return <Clock className="w-3.5 h-3.5 text-warning animate-pulse" />;
    }
  })();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center" aria-label={label}>
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

import { cn } from '@/lib/utils';
import {
  CHANNEL_LABEL,
  CONVERSATION_CHANNELS,
  otherChannel,
  type ConversationChannel,
} from '@/lib/conversations/channel';
import { ChannelLogo } from './ChannelLogo';

interface ChannelSwitchProps {
  value: ConversationChannel;
  onChange: (channel: ConversationChannel) => void;
  /**
   * Conversas aguardando resposta no canal que NÃO está aberto — número exato,
   * contado no servidor. `undefined` enquanto a contagem não chegou.
   */
  awaitingInOther?: number;
  className?: string;
}

/** "3 conversas aguardando resposta no Instagram". */
export const awaitingBadgeLabel = (count: number, channel: ConversationChannel): string =>
  `${count} ${count === 1 ? 'conversa aguardando' : 'conversas aguardando'} resposta no ${CHANNEL_LABEL[channel]}`;

/**
 * A chave WhatsApp / Instagram de Conversas. Cada lado é uma lista própria. No
 * lado que não está aberto aparece o selo com as conversas que aguardam
 * resposta ali — a mesma regra da pílula "Aguardando".
 */
export function ChannelSwitch({ value, onChange, awaitingInOther, className }: ChannelSwitchProps) {
  const other = otherChannel(value);
  return (
    <div
      role="group"
      aria-label="Canal das conversas"
      className={cn('grid grid-cols-2 gap-1 rounded-lg bg-muted p-1', className)}
    >
      {CONVERSATION_CHANNELS.map((channel) => {
        const active = channel === value;
        const badge = channel === other && (awaitingInOther ?? 0) > 0 ? awaitingInOther! : null;
        return (
          <button
            key={channel}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(channel);
            }}
            className={cn(
              'relative flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
            )}
          >
            <ChannelLogo channel={channel} />
            <span>{CHANNEL_LABEL[channel]}</span>
            {badge !== null && (
              <span
                data-testid={`awaiting-badge-${channel}`}
                title={awaitingBadgeLabel(badge, channel)}
                aria-label={awaitingBadgeLabel(badge, channel)}
                className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--unread-strong))] px-1 text-[10px] font-bold text-[hsl(var(--unread-on-strong))]"
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

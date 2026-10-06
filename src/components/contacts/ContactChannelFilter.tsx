import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChannelLogo } from '@/components/conversations/ChannelLogo';
import {
  CONTACT_CHANNEL_FILTERS,
  CONTACT_CHANNEL_FILTER_LABEL,
  type ContactChannelFilter as ChannelFilterValue,
} from '@/lib/contacts/identity';

interface ContactChannelFilterProps {
  value: ChannelFilterValue;
  onChange: (value: ChannelFilterValue) => void;
  className?: string;
}

/**
 * Filtro de canal de Contatos: Todos / WhatsApp / Instagram. Só aparece na
 * Loja que tem conta de Instagram — sem ela, todo contato é de WhatsApp e o
 * filtro não diria nada.
 */
export function ContactChannelFilter({ value, onChange, className }: ContactChannelFilterProps) {
  return (
    <div
      role="group"
      aria-label="Canal dos contatos"
      className={cn('inline-grid grid-cols-3 gap-1 rounded-lg bg-muted p-1', className)}
    >
      {CONTACT_CHANNEL_FILTERS.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(option);
            }}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
            )}
          >
            {option === 'all' ? (
              <Users className="h-4 w-4" aria-hidden />
            ) : (
              <ChannelLogo channel={option} />
            )}
            <span>{CONTACT_CHANNEL_FILTER_LABEL[option]}</span>
          </button>
        );
      })}
    </div>
  );
}

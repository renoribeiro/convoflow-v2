import { Instagram } from 'lucide-react';
import whatsappLogo from '@/assets/logos/whatsapp.svg';
import { cn } from '@/lib/utils';
import type { ConversationChannel } from '@/lib/conversations/channel';

/**
 * Logo do canal. Instagram vem do lucide; o lucide não tem WhatsApp, então ele
 * é um arquivo (src/assets/logos/whatsapp.svg). Decorativo: quem usa põe o
 * nome do canal em texto ao lado.
 */
export function ChannelLogo({ channel, className }: { channel: ConversationChannel; className?: string }) {
  if (channel === 'instagram') {
    return <Instagram className={cn('h-4 w-4 text-[#E4405F]', className)} aria-hidden data-channel-logo="instagram" />;
  }
  return (
    <img
      src={whatsappLogo}
      alt=""
      aria-hidden
      data-channel-logo="whatsapp"
      className={cn('h-4 w-4', className)}
    />
  );
}

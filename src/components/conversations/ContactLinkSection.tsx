import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link2, MessageCircle, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { ChannelLogo } from '@/components/conversations/ChannelLogo';
import { LinkContactDialog, type LinkSource } from '@/components/contacts/LinkContactDialog';
import { supabase } from '@/integrations/supabase/client';
import { useCan, useTenant } from '@/contexts/TenantContext';
import { useContactHasConversation } from '@/hooks/useContactHasConversation';
import { useUnlinkContact } from '@/hooks/useContactLinks';
import { useWhatsAppInstancesWithAdapter } from '@/hooks/useWhatsAppApi';
import { CHANNEL_LABEL, asChannel, hasInstagramInstance, otherChannel } from '@/lib/conversations/channel';
import { contactIdentifier } from '@/lib/contacts/identity';
import { linkedCounterpartId, type ContactLink } from '@/lib/contacts/links';

/**
 * "Mesma pessoa no outro canal" — o topo do painel do contato.
 *
 * Sem vínculo: o botão para vincular (só para quem tem contacts.manage; quem
 * decide de verdade é o servidor). Com vínculo: as duas identidades, o atalho
 * para a conversa do outro canal (só se a pessoa ENXERGA essa conversa — a
 * leitura passa pelo RLS normal) e o "Desvincular" para quem pode.
 */
interface ContactLinkSectionProps {
  contact: LinkSource;
  link: ContactLink | undefined;
  onOpenConversation?: (conversationId: string) => void;
}

export function ContactLinkSection({ contact, link, onOpenConversation }: ContactLinkSectionProps) {
  const { tenant } = useTenant();
  const canManage = useCan('contacts.manage');
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const unlinkMutation = useUnlinkContact();
  const { instances } = useWhatsAppInstancesWithAdapter();

  const channel = asChannel(contact.channel);
  const other = otherChannel(channel);
  const otherId = link ? linkedCounterpartId(link, contact.id) : null;

  const counterpart = useQuery({
    queryKey: ['contact-link-counterpart', tenant?.id, otherId],
    enabled: !!otherId,
    queryFn: async () => {
      const [contactRes, convRes] = await Promise.all([
        supabase.from('contacts').select('id, channel, name, phone, username').eq('id', otherId as string).maybeSingle(),
        // RLS normal: só volta se a pessoa enxerga a conversa.
        supabase.from('conversations').select('id').eq('contact_id', otherId as string).maybeSingle(),
      ]);
      return {
        contact: contactRes.data as { id: string; channel: string | null; name: string | null; phone: string | null; username: string | null } | null,
        conversationId: (convRes.data as { id: string } | null)?.id ?? null,
      };
    },
  });

  const conversationId = counterpart.data?.conversationId ?? null;
  const { data: hiddenExists } = useContactHasConversation(
    otherId,
    !!otherId && !counterpart.isLoading && !conversationId,
  );

  if (!link) {
    // Loja só de WhatsApp: não há com quem vincular, e o botão seria ruído.
    if (!canManage || (channel === 'whatsapp' && !hasInstagramInstance(instances))) return null;
    return (
      <div className="border-b border-border/50 px-4 py-3">
        <Button variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => setLinkOpen(true)}>
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
          {other === 'instagram' ? 'Vincular a um contato do Instagram' : 'Vincular a um contato do WhatsApp'}
        </Button>
        <LinkContactDialog open={linkOpen} onOpenChange={setLinkOpen} source={contact} />
      </div>
    );
  }

  const otherContact = counterpart.data?.contact ?? null;

  return (
    <div className="space-y-2 border-b border-border/50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        Mesma pessoa nos dois canais
      </p>

      <ul className="space-y-1.5 text-xs">
        <li className="flex items-center gap-2">
          <ChannelLogo channel={channel} className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="sr-only">{CHANNEL_LABEL[channel]}: </span>
          <span className="truncate text-foreground">{contactIdentifier(contact)}</span>
          <span className="ml-auto text-muted-foreground">esta conversa</span>
        </li>
        <li className="flex items-center gap-2">
          <ChannelLogo channel={other} className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="sr-only">{CHANNEL_LABEL[other]}: </span>
          {counterpart.isLoading ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <span className="truncate text-foreground">
              {otherContact ? contactIdentifier(otherContact) : CHANNEL_LABEL[other]}
            </span>
          )}
          <span className="ml-auto flex-shrink-0">
            {conversationId && onOpenConversation ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => onOpenConversation(conversationId)}
              >
                <MessageCircle className="mr-1 h-3 w-3" />
                Abrir conversa
              </Button>
            ) : !counterpart.isLoading && !conversationId ? (
              <span className="text-muted-foreground">{hiddenExists ? 'conversa de outra pessoa' : 'sem conversa'}</span>
            ) : null}
          </span>
        </li>
      </ul>

      {channel === 'instagram' && (
        <p className="text-[11px] text-muted-foreground">
          Funil, etiquetas, notas e campos abaixo são os do contato do WhatsApp.
        </p>
      )}

      {link.can_unlink && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setConfirmUnlink(true)}
        >
          <Unlink className="mr-1.5 h-3.5 w-3.5" />
          Desvincular
        </Button>
      )}

      <ConfirmationDialog
        isOpen={confirmUnlink}
        onClose={() => setConfirmUnlink(false)}
        onConfirm={() =>
          unlinkMutation.mutate({ contactId: contact.id }, { onSettled: () => setConfirmUnlink(false) })
        }
        title="Desvincular contatos?"
        description="Os dois contatos voltam a ser independentes, cada um no seu canal. O que foi gravado no contato do WhatsApp ao vincular continua lá."
        confirmText="Desvincular"
        cancelText="Cancelar"
        variant="destructive"
        isLoading={unlinkMutation.isPending}
        icon={<Unlink className="h-5 w-5 text-red-500" />}
      />
    </div>
  );
}

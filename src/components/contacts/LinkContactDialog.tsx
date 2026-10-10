import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Link2, Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { ChannelLogo } from '@/components/conversations/ChannelLogo';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useLinkCandidates, useLinkContacts, type LinkCandidate } from '@/hooks/useContactLinks';
import { useTransferConversation } from '@/hooks/useConversationAssignment';
import { memberFirstName, useTeamMemberLookup } from '@/hooks/useTeamDirectory';
import { CHANNEL_LABEL, asChannel, otherChannel, type ConversationChannel } from '@/lib/conversations/channel';
import { contactDisplayName } from '@/lib/instagram/contactProfile';
import { contactIdentifier } from '@/lib/contacts/identity';
import {
  automaticLinkEffects,
  buildLinkChoices,
  conflictKey,
  defaultSide,
  findLinkConflicts,
  type LinkConflict,
  type LinkSide,
  type LinkableContact,
} from '@/lib/contacts/links';

/**
 * Vincular à mão o contato do WhatsApp ao do Instagram da mesma pessoa.
 *
 * Passo 1, o seletor: só busca o que a pessoa digita (2+ caracteres) — o
 * sistema nunca sugere ninguém. Passo 2, a confirmação: os conflitos viram
 * perguntas (nome, e-mail, etapa, campos), o resto aparece como "acontece
 * sozinho", e responsáveis diferentes ganham um aviso com a opção de passar a
 * conversa do Instagram para quem cuida da do WhatsApp.
 *
 * Quem decide se pode é o servidor (contact_link_create): contacts.manage e
 * ver as duas conversas. O seletor já esconde o que não passaria.
 */

export interface LinkSource {
  id: string;
  channel?: string | null;
  name?: string | null;
  phone?: string | null;
  username?: string | null;
}

interface LinkContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: LinkSource | null;
  onLinked?: () => void;
}

interface FullContactRow {
  id: string;
  channel: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  notes: string | null;
  current_stage_id: string | null;
  custom_fields: unknown;
  opt_out_mass_message: boolean | null;
  is_blocked: boolean | null;
  stage: { name: string | null } | null;
  contact_tags: Array<{ tag_id: string }> | null;
}

interface ConversationOwnerRow {
  id: string;
  contact_id: string;
  assigned_profile_id: string | null;
}

const FIELD_LABEL: Record<LinkConflict['field'], string> = {
  name: 'Nome',
  email: 'E-mail',
  stage: 'Etapa do funil',
  custom_field: 'Campo',
};

const conflictLabel = (c: LinkConflict) => (c.field === 'custom_field' ? `Campo "${c.key}"` : FIELD_LABEL[c.field]);

const toLinkable = (row: FullContactRow): LinkableContact => ({
  id: row.id,
  channel: row.channel,
  name: row.name,
  email: row.email,
  phone: row.phone,
  username: row.username,
  notes: row.notes,
  current_stage_id: row.current_stage_id,
  stage_name: row.stage?.name ?? null,
  custom_fields: row.custom_fields,
  opt_out_mass_message: row.opt_out_mass_message,
  is_blocked: row.is_blocked,
  tag_ids: (row.contact_tags ?? []).map((t) => t.tag_id),
});

function IdentityLine({ contact }: { contact: { channel?: string | null; name?: string | null; phone?: string | null; username?: string | null } }) {
  const channel = asChannel(contact.channel);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ChannelLogo channel={channel} className="h-4 w-4 flex-shrink-0" />
      <span className="sr-only">{CHANNEL_LABEL[channel]}: </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{contactDisplayName(contact, channel)}</p>
        <p className="truncate text-xs text-muted-foreground">{contactIdentifier(contact)}</p>
      </div>
    </div>
  );
}

export function LinkContactDialog({ open, onOpenChange, source, onLinked }: LinkContactDialogProps) {
  const { tenant } = useTenant();
  const sourceChannel: ConversationChannel = asChannel(source?.channel);
  const targetChannel = otherChannel(sourceChannel);

  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<LinkCandidate | null>(null);
  const [selection, setSelection] = useState<Record<string, LinkSide>>({});
  const [transferOwner, setTransferOwner] = useState(false);

  // Abrir de novo começa do zero.
  useEffect(() => {
    if (!open) return;
    setSearch('');
    setPicked(null);
    setSelection({});
    setTransferOwner(false);
  }, [open, source?.id]);

  const candidates = useLinkCandidates(open && !picked ? source?.id : null, search);
  const linkMutation = useLinkContacts();
  const transferMutation = useTransferConversation();
  const lookupMember = useTeamMemberLookup();

  const whatsappId = picked ? (sourceChannel === 'whatsapp' ? source?.id : picked.contact_id) : null;
  const instagramId = picked ? (sourceChannel === 'instagram' ? source?.id : picked.contact_id) : null;

  // Passo 2: os dois contatos inteiros e as conversas que a pessoa enxerga.
  const details = useQuery({
    queryKey: ['contact-link-preview', tenant?.id, whatsappId, instagramId],
    enabled: open && !!whatsappId && !!instagramId,
    queryFn: async () => {
      const ids = [whatsappId as string, instagramId as string];
      const [contactsRes, convRes] = await Promise.all([
        supabase
          .from('contacts')
          .select(`
            id, channel, name, email, phone, username, notes, current_stage_id, custom_fields,
            opt_out_mass_message, is_blocked,
            stage:funnel_stages!contacts_current_stage_id_fkey ( name ),
            contact_tags ( tag_id )
          `)
          .in('id', ids),
        supabase.from('conversations').select('id, contact_id, assigned_profile_id').in('contact_id', ids),
      ]);
      if (contactsRes.error) throw new Error(contactsRes.error.message);
      const rows = (contactsRes.data ?? []) as unknown as FullContactRow[];
      const conversations = (convRes.data ?? []) as unknown as ConversationOwnerRow[];
      const wa = rows.find((r) => r.id === whatsappId);
      const ig = rows.find((r) => r.id === instagramId);
      if (!wa || !ig) throw new Error('contato não encontrado');
      return {
        wa: toLinkable(wa),
        ig: toLinkable(ig),
        waConversation: conversations.find((c) => c.contact_id === whatsappId) ?? null,
        igConversation: conversations.find((c) => c.contact_id === instagramId) ?? null,
      };
    },
  });

  const conflicts = useMemo(
    () => (details.data ? findLinkConflicts(details.data.wa, details.data.ig) : []),
    [details.data],
  );
  const effects = useMemo(
    () => (details.data ? automaticLinkEffects(details.data.wa, details.data.ig) : []),
    [details.data],
  );

  const waOwner = details.data?.waConversation?.assigned_profile_id ?? null;
  const igOwner = details.data?.igConversation?.assigned_profile_id ?? null;
  const ownersDiffer = !!details.data?.waConversation && !!details.data?.igConversation && waOwner !== igOwner;
  const ownerName = (profileId: string | null) => {
    if (!profileId) return 'ninguém';
    const member = lookupMember(profileId);
    return member ? memberFirstName(member) : 'outra pessoa';
  };

  const handleConfirm = () => {
    if (!whatsappId || !instagramId) return;
    const igConversationId = details.data?.igConversation?.id ?? null;
    linkMutation.mutate(
      { whatsappContactId: whatsappId, instagramContactId: instagramId, choices: buildLinkChoices(conflicts, selection) },
      {
        onSuccess: () => {
          if (transferOwner && waOwner && igConversationId) {
            transferMutation.mutate({ conversationId: igConversationId, toProfileId: waOwner });
          }
          onOpenChange(false);
          onLinked?.();
        },
      },
    );
  };

  const term = search.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {!picked ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Vincular a um contato do {CHANNEL_LABEL[targetChannel]}
              </DialogTitle>
              <DialogDescription>
                Use quando for a mesma pessoa nos dois canais. O sistema nunca junta contatos sozinho: só você decide.
              </DialogDescription>
            </DialogHeader>

            {source && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <IdentityLine contact={source} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="link-contact-search">Buscar no {CHANNEL_LABEL[targetChannel]}</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="link-contact-search"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={targetChannel === 'instagram' ? 'Nome ou @ do Instagram' : 'Nome ou telefone do WhatsApp'}
                  className="pl-8"
                />
              </div>
              {term.length < 2 && (
                <p className="text-xs text-muted-foreground">Digite pelo menos 2 letras ou números.</p>
              )}
            </div>

            {term.length >= 2 && (
              <div className="max-h-64 space-y-1 overflow-y-auto" role="list" aria-label="Contatos encontrados">
                {candidates.isLoading ? (
                  <>
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </>
                ) : candidates.isError ? (
                  <p className="text-sm text-destructive">Não foi possível buscar. Tente novamente.</p>
                ) : (candidates.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum contato encontrado. Só aparecem contatos do {CHANNEL_LABEL[targetChannel]} desta Loja,
                    ainda sem vínculo, cujas conversas você pode ver.
                  </p>
                ) : (
                  (candidates.data ?? []).map((c) => (
                    <button
                      key={c.contact_id}
                      type="button"
                      role="listitem"
                      onClick={() => setPicked(c)}
                      className="w-full rounded-md border border-transparent px-3 py-2 text-left hover:border-border hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <IdentityLine contact={c} />
                    </button>
                  ))
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirmar vínculo</DialogTitle>
              <DialogDescription>
                Os dois contatos e as duas conversas continuam existindo, cada um no seu canal. O que estiver escolhido
                abaixo é gravado no contato do WhatsApp.
              </DialogDescription>
            </DialogHeader>

            {details.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : details.isError || !details.data ? (
              <p className="text-sm text-destructive">Não foi possível carregar os dois contatos. Tente novamente.</p>
            ) : (
              <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-border px-3 py-2">
                    <IdentityLine contact={details.data.wa} />
                  </div>
                  <div className="rounded-md border border-border px-3 py-2">
                    <IdentityLine contact={details.data.ig} />
                  </div>
                </div>

                {conflicts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nada a escolher: os dois contatos não se contradizem.</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">Escolha o que vale</p>
                    {conflicts.map((c) => {
                      const key = conflictKey(c);
                      const value = selection[key] ?? defaultSide(c);
                      return (
                        <fieldset key={key} className="space-y-1.5">
                          <legend className="text-xs font-medium text-muted-foreground">{conflictLabel(c)}</legend>
                          <RadioGroup
                            value={value}
                            onValueChange={(v) => setSelection((prev) => ({ ...prev, [key]: v as LinkSide }))}
                          >
                            {(['whatsapp', 'instagram'] as const).map((side) => (
                              <div key={side} className="flex items-start gap-2">
                                <RadioGroupItem value={side} id={`${key}-${side}`} className="mt-0.5" />
                                <Label htmlFor={`${key}-${side}`} className="flex min-w-0 items-start gap-1.5 font-normal">
                                  <ChannelLogo channel={side} className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                                  <span className="sr-only">{CHANNEL_LABEL[side]}: </span>
                                  <span className="break-words">{side === 'whatsapp' ? c.whatsapp : c.instagram}</span>
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        </fieldset>
                      );
                    })}
                  </div>
                )}

                {effects.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Acontece sozinho</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                      {effects.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {ownersDiffer && (
                  <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2">
                    <p className="text-sm text-foreground">
                      As conversas têm responsáveis diferentes: {ownerName(waOwner)} no WhatsApp e {ownerName(igOwner)} no
                      Instagram. Vincular não muda isso.
                    </p>
                    {waOwner && (
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id="link-transfer-owner"
                          checked={transferOwner}
                          onCheckedChange={(v) => setTransferOwner(v === true)}
                          className="mt-0.5"
                        />
                        <Label htmlFor="link-transfer-owner" className="font-normal">
                          Passar a conversa do Instagram para {ownerName(waOwner)}
                        </Label>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Se a etapa mudar, as automações de etapa disparam como num arraste no Funil. Para desfazer, use
                  “Desvincular” no painel do contato — o que foi gravado no WhatsApp continua lá.
                </p>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setPicked(null)} disabled={linkMutation.isPending}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={handleConfirm} disabled={!details.data || linkMutation.isPending}>
                {linkMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Vincular
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

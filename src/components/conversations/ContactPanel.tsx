import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  CalendarClock,
  ExternalLink,
  Info,
  ListChecks,
  Plus,
  StickyNote,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TagBadge } from '@/components/etiquetas/TagBadge';
import { LeadTagsDialog } from '@/components/etiquetas/LeadTagsDialog';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useContactFollowups } from '@/hooks/useContactFollowups';
import { useTenant } from '@/contexts/TenantContext';
import { useQueryClient } from '@tanstack/react-query';
import { useIsBelowXl } from '@/hooks/use-mobile';
import { initialsOf } from '@/lib/conversations/channel';
import { contactDisplayName, instagramHandle } from '@/lib/instagram/contactProfile';

interface ContactPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  contactId?: string;
  contact: any | null;
  isLoading?: boolean;
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border/50">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-accent/10 transition-colors">
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function ContactPanelBody({
  onOpenChange,
  conversationId,
  contactId,
  contact,
  isLoading,
}: Omit<ContactPanelProps, 'open'>) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [notes, setNotes] = useState<string>('');
  const notesTimerRef = useRef<number | null>(null);
  const lastSavedNotesRef = useRef<string>('');

  // Sync local notes when the contact changes.
  useEffect(() => {
    const next = contact?.notes ?? '';
    setNotes(next);
    lastSavedNotesRef.current = next;
  }, [contactId, contact?.notes]);

  const { data: funnelStages = [] } = useSupabaseQuery({
    table: 'funnel_stages',
    select: 'id, name, color',
    filters: tenant?.id ? [{ column: 'tenant_id', operator: 'eq', value: tenant.id }] : [],
    enabled: !!tenant?.id,
  });

  const { data: followups = [], isLoading: followupsLoading } = useContactFollowups(contactId);

  const updateContactMutation = useSupabaseMutation({
    table: 'contacts',
    operation: 'update',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId, tenant?.id] });
    },
  });

  const currentTagIds = useMemo(
    () =>
      ((contact?.contact_tags ?? []) as any[])
        .map((ct) => ct.tags?.id)
        .filter(Boolean) as string[],
    [contact],
  );

  const tags = useMemo(
    () =>
      ((contact?.contact_tags ?? []) as any[])
        .map((ct) => ct.tags)
        .filter(Boolean) as Array<{ id: string; name: string; color: string }>,
    [contact],
  );

  const customFields = useMemo(() => {
    const raw = contact?.custom_fields;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    return Object.entries(raw as Record<string, unknown>).filter(([, v]) => v != null && v !== '');
  }, [contact]);

  const handleStageChange = (stageId: string) => {
    if (!contactId) return;
    updateContactMutation.mutate({
      data: { current_stage_id: stageId || null },
      options: { filter: { column: 'id', operator: 'eq', value: contactId } },
    });
  };

  // Debounced notes auto-save (1s after the user stops typing).
  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (notesTimerRef.current) window.clearTimeout(notesTimerRef.current);
    notesTimerRef.current = window.setTimeout(() => {
      if (!contactId || value === lastSavedNotesRef.current) return;
      lastSavedNotesRef.current = value;
      updateContactMutation.mutate({
        data: { notes: value || null },
        options: { filter: { column: 'id', operator: 'eq', value: contactId } },
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (notesTimerRef.current) window.clearTimeout(notesTimerRef.current);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="w-14 h-14 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Nenhum contato selecionado.
      </div>
    );
  }

  const stageColor: string | undefined = contact.stage?.color ?? undefined;
  const isInstagramContact = (contact as { channel?: string | null }).channel === 'instagram';
  // Sem nome: "Cliente do Instagram" no Instagram; no WhatsApp, o de sempre.
  const displayName = isInstagramContact
    ? contactDisplayName(contact as { name?: string | null; username?: string | null }, 'instagram')
    : contact.name || 'Contato';
  const igHandle = isInstagramContact
    ? instagramHandle((contact as { username?: string | null }).username)
    : null;
  const initials = isInstagramContact
    ? initialsOf(displayName)
    : contact.name
      ? contact.name.split(' ').map((n: string) => n?.[0] ?? '').join('').toUpperCase().slice(0, 2)
      : 'C';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border px-4 py-4">
        <div className="flex flex-col items-center gap-2 w-full">
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Detalhes do contato
              <FeatureHelp helpKey="page:conversations-contact" />
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar painel"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <Avatar className="w-14 h-14">
            {contact.avatar_url && <AvatarImage src={contact.avatar_url} alt={displayName} />}
            <AvatarFallback className="text-base">{initials}</AvatarFallback>
          </Avatar>
          <div className="text-center">
            <p className="font-semibold text-foreground">{displayName}</p>
            {/* Contato do Instagram não tem telefone: mostra o @ (se o nome já não for ele). */}
            {isInstagramContact
              ? igHandle && igHandle !== displayName && <p className="text-sm text-muted-foreground">{igHandle}</p>
              : <p className="text-sm text-muted-foreground">{contact.phone}</p>}
            {contact.email && <p className="text-xs text-muted-foreground">{contact.email}</p>}
          </div>
          <Button asChild variant="outline" size="sm" className="mt-1">
            <Link to="/dashboard/contacts">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Ver perfil completo
            </Link>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {/* Funil */}
        <CollapsibleSection title="Funil" icon={<ListChecks className="w-4 h-4 text-muted-foreground" />}>
          <div className="space-y-2">
            {contact.stage?.name ? (
              <Badge
                variant="outline"
                className="text-xs"
                style={stageColor ? { backgroundColor: `${stageColor}20`, color: stageColor, borderColor: stageColor } : undefined}
              >
                {contact.stage.name}
              </Badge>
            ) : (
              <p className="text-xs text-muted-foreground">Sem etapa definida</p>
            )}
            <Select value={contact.current_stage_id ?? ''} onValueChange={handleStageChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Mover para etapa..." />
              </SelectTrigger>
              <SelectContent>
                {(funnelStages as any[]).map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CollapsibleSection>

        {/* Etiquetas */}
        <CollapsibleSection title="Etiquetas" icon={<TagIcon className="w-4 h-4 text-muted-foreground" />}>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.length > 0 ? (
              tags.map((tag) => <TagBadge key={tag.id} name={tag.name} color={tag.color} />)
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma etiqueta</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-7 text-xs"
            onClick={() => setIsTagDialogOpen(true)}
            disabled={!contactId}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Adicionar
          </Button>
        </CollapsibleSection>

        {/* Fonte do lead */}
        <CollapsibleSection title="Fonte do lead" icon={<Info className="w-4 h-4 text-muted-foreground" />} defaultOpen={false}>
          <p className="text-sm text-foreground">{contact.lead_sources?.name || 'Não informada'}</p>
        </CollapsibleSection>

        {/* Campos personalizados */}
        {customFields.length > 0 && (
          <CollapsibleSection title="Campos personalizados" icon={<Info className="w-4 h-4 text-muted-foreground" />} defaultOpen={false}>
            <dl className="space-y-1.5">
              {customFields.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-2 text-xs">
                  <dt className="text-muted-foreground truncate">{key}</dt>
                  <dd className="text-foreground text-right truncate">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </CollapsibleSection>
        )}

        {/* Notas */}
        <CollapsibleSection title="Notas" icon={<StickyNote className="w-4 h-4 text-muted-foreground" />}>
          <Textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Adicione uma anotação sobre este contato..."
            className="min-h-[80px] text-sm resize-none"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">Salvo automaticamente</p>
        </CollapsibleSection>

        {/* Follow-ups pendentes */}
        <CollapsibleSection title="Follow-ups pendentes" icon={<CalendarClock className="w-4 h-4 text-muted-foreground" />}>
          {followupsLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : followups.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum follow-up pendente</p>
          ) : (
            <ul className="space-y-2">
              {followups.map((f) => (
                <li key={f.id} className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground truncate">{f.task}</span>
                    {f.status === 'overdue' && (
                      <Badge variant="outline" className="h-4 px-1 text-[9px] border-warning/40 text-warning">
                        Atrasado
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(new Date(f.due_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>

        {/* Informações */}
        <CollapsibleSection title="Informações" icon={<Info className="w-4 h-4 text-muted-foreground" />} defaultOpen={false}>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Criado em</dt>
              <dd className="text-foreground">
                {contact.created_at ? format(new Date(contact.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Última interação</dt>
              <dd className="text-foreground">
                {contact.last_interaction_at
                  ? format(new Date(contact.last_interaction_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                  : '—'}
              </dd>
            </div>
          </dl>
        </CollapsibleSection>
      </ScrollArea>

      {contactId && (
        <LeadTagsDialog
          open={isTagDialogOpen}
          onOpenChange={setIsTagDialogOpen}
          contactId={contactId}
          currentTagIds={currentTagIds}
        />
      )}
    </div>
  );
}

/**
 * Right-side contact info panel. Desktop: animated inline aside (320px) that
 * shrinks the chat area. Mobile: a full-width Sheet drawer from the right.
 */
export function ContactPanel(props: ContactPanelProps) {
  const { open, onOpenChange } = props;
  // Drawer abaixo de xl (1280px), não só no celular: a 768px o painel de
  // 320px ao lado da lista de 320px deixava 64px para o chat, e a 1024
  // (sidebar expandida) ainda só 144px. A partir de 1280 o chat fica com
  // 400px ao lado das duas colunas.
  const asSheet = useIsBelowXl();

  if (asSheet) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <ContactPanelBody {...props} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="contact-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="h-full flex-shrink-0 overflow-hidden border-l border-border bg-card"
        >
          <div className="h-full w-80">
            <ContactPanelBody {...props} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

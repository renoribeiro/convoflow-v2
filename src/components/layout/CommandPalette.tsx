import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  Bot,
  FileText,
  Filter,
  GaugeCircle,
  Instagram,
  LayoutDashboard,
  MessageCircle,
  Megaphone,
  Phone,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { DialogTitle } from '@/components/ui/dialog';
import { useAcessoTelas } from '@/hooks/useAcessoTelas';
import { TELAS, acessoATela, caminhoDaTela } from '@/lib/access/telas';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';
import { channelOfProvider } from '@/lib/conversations/channel';
import { contactIdentifier, contactLabel, contactSearchOrFilter } from '@/lib/contacts/identity';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';

type PageItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  keywords?: string[];
};

/**
 * Páginas da busca rápida: as mesmas telas e a mesma regra do menu, lidas do
 * registro único (src/lib/access/telas.ts). Aqui só o ícone e as palavras que
 * a pessoa costuma digitar. Até 2026-10-26 a lista tinha regras próprias: o
 * Gestor não achava "Equipe", e apareciam rótulos como "Tracking" (achado 26).
 */
const ICONES: Record<string, LucideIcon> = {
  '': LayoutDashboard,
  conversations: MessageCircle,
  contacts: Users,
  funnel: Filter,
  tracking: Activity,
  reports: FileText,
  chatbots: Bot,
  campaigns: Megaphone,
  templates: FileText,
  followups: Send,
  automation: Workflow,
  'whatsapp-numbers': Smartphone,
  settings: Settings,
  help: FileText,
  team: UsersRound,
  'store-comparison': GaugeCircle,
  admin: ShieldCheck,
  'admin/users': UsersRound,
  'admin/usage-limits': GaugeCircle,
  profile: UserCog,
  notifications: Bell,
};

const PALAVRAS: Record<string, string[]> = {
  '': ['inicio', 'home'],
  conversations: ['chat', 'mensagens'],
  contacts: ['leads'],
  funnel: ['pipeline', 'kanban', 'etapas'],
  tracking: ['rastreio', 'analytics', 'tracking', 'fontes'],
  reports: ['reports', 'analytics'],
  chatbots: ['bot', 'ia'],
  campaigns: ['disparo', 'broadcast'],
  templates: ['modelos', 'meta'],
  followups: ['lembrete', 'sequencia', 'followups'],
  automation: ['workflow', 'fluxo'],
  'whatsapp-numbers': ['numeros', 'whatsapp', 'instancias', 'sessoes', 'conexoes'],
  settings: ['preferencias', 'config'],
  help: ['ajuda', 'tutorial', 'duvida'],
  team: ['usuarios', 'time', 'convidar'],
  'store-comparison': ['lojas', 'comparar'],
  profile: ['conta', 'avatar', 'perfil'],
};

type ContactRow = {
  id: string;
  name: string | null;
  /** Nulo no Instagram — a linha mostra o @ (contactIdentifier). */
  phone: string | null;
  channel: string | null;
  username: string | null;
  last_interaction_at: string | null;
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CommandPalette = ({ open, onOpenChange }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const { ctx } = useAcessoTelas();
  const { instances } = useWhatsAppInstances();
  // Conta do Instagram não é "sessão WhatsApp": cada canal no seu grupo.
  const whatsappInstances = instances.filter((i) => channelOfProvider(i.provider) === 'whatsapp');
  const instagramAccounts = instances.filter((i) => channelOfProvider(i.provider) === 'instagram');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Reset on close.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // Debounce search input (180ms) — used only for server-side contact lookup.
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => window.clearTimeout(handle);
  }, [search]);

  // Acesso por módulo depende apenas do toggle de produto (is_enabled) e do
  // papel do usuário — sem verificação de plano/assinatura.
  const accessiblePages: PageItem[] = useMemo(
    () =>
      TELAS.filter((t) => acessoATela(t, ctx) === 'liberado').map((t) => ({
        label: t.nome,
        path: caminhoDaTela(t),
        icon: ICONES[t.chave] ?? FileText,
        keywords: PALAVRAS[t.chave],
      })),
    [ctx],
  );

  // Contacts: lightweight server-side query, only runs while palette is open.
  const { data: contacts = [] } = useQuery<ContactRow[]>({
    queryKey: ['contacts', 'command-palette', tenantId, debouncedSearch],
    enabled: open && !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from('contacts')
        .select('id, name, phone, channel, username, last_interaction_at')
        .eq('tenant_id', tenantId!)
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .limit(20);

      // Nome, telefone ou @ do Instagram.
      const orFilter = contactSearchOrFilter(debouncedSearch);
      if (orFilter) {
        query = query.or(orFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ContactRow[];
    },
  });

  const handleSelect = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const handleSelectContact = (contactId: string) => {
    onOpenChange(false);
    // Sem rota dedicada de detalhe — leva à lista de contatos com filtro de id.
    navigate(`/dashboard/contacts?contact=${contactId}`);
  };

  const handleSelectInstance = (instanceId: string) => {
    onOpenChange(false);
    navigate(`/dashboard/whatsapp-numbers?instance=${instanceId}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* O CommandDialog do shadcn monta um DialogContent sem titulo, e ai o
          leitor de tela anuncia um dialogo sem nome. Titulo so para leitor de
          tela — mesmo padrao ja usado no MessageBubble. */}
      <DialogTitle className="sr-only">Busca rápida</DialogTitle>
      <CommandInput
        placeholder="Buscar páginas, contatos e sessões..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Páginas">
          {accessiblePages.map((page) => {
            const Icon = page.icon;
            // cmdk filtra por value + keywords; concatenamos pra suportar busca
            // por sinônimos PT-BR (ex.: "sessoes" → "Números WhatsApp").
            const value = [page.label, ...(page.keywords ?? [])].join(' ');
            return (
              <CommandItem
                key={page.path}
                value={value}
                onSelect={() => handleSelect(page.path)}
              >
                <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{page.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {whatsappInstances.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Sessões WhatsApp">
              {whatsappInstances.map((instance) => (
                <CommandItem
                  key={instance.id}
                  value={`${instance.name} ${instance.number} ${instance.instanceKey}`}
                  onSelect={() => handleSelectInstance(instance.id)}
                >
                  <Phone className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{instance.name}</span>
                    {instance.number && (
                      <span className="text-xs text-muted-foreground">
                        {instance.number} · {instance.status}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {instagramAccounts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Contas do Instagram">
              {instagramAccounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={`${account.name} instagram`}
                  onSelect={() => handleSelectInstance(account.id)}
                >
                  <Instagram className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{account.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {contacts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Contatos">
              {contacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={`${contact.name ?? ''} ${contactIdentifier(contact)}`}
                  onSelect={() => handleSelectContact(contact.id)}
                >
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{contactLabel(contact)}</span>
                    {contact.name && (
                      <span className="text-xs text-muted-foreground">{contactIdentifier(contact)}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
};

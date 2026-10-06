
import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { ContactModal } from '@/components/contacts/ContactModal';
import { ContactFilters } from '@/components/contacts/ContactFilters';
import { InstanceSelector } from '@/components/conversations/InstanceSelector';
import { Plus, Download, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsBelowLg } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useWhatsAppInstancesWithAdapter } from '@/hooks/useWhatsAppApi';
import { ContactChannelFilter } from '@/components/contacts/ContactChannelFilter';
import { buildContactsCsv, type ContactExportRow } from '@/lib/contacts/exportCsv';
import { type ContactChannelFilter as ChannelFilterValue } from '@/lib/contacts/identity';
import {
  INSTANCE_SELECTOR_ALL_LABEL,
  hasInstagramInstance,
  instancesOfChannel,
} from '@/lib/conversations/channel';

export default function Contacts() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    stage: '',
    source: '',
    tags: []
  });
  const { tenant } = useTenant();
  const { instances } = useWhatsAppInstancesWithAdapter();

  // Canal. O filtro só aparece na Loja que tem conta de Instagram; sem ela o
  // canal fica em "Todos" e a tela é a de sempre.
  const hasInstagram = hasInstagramInstance(instances);
  const [channelChoice, setChannelChoice] = useState<ChannelFilterValue>('all');
  const channel: ChannelFilterValue = hasInstagram ? channelChoice : 'all';
  const selectorInstances = channel === 'all' ? instances : instancesOfChannel(instances, channel);
  const selectorAllLabel =
    channel !== 'all'
      ? INSTANCE_SELECTOR_ALL_LABEL[channel]
      : hasInstagram
        ? 'Todas as conexões'
        : INSTANCE_SELECTOR_ALL_LABEL.whatsapp;

  const changeChannel = (next: ChannelFilterValue) => {
    setChannelChoice(next);
    // A conexão escolhida pode ser do outro canal: aí volta para "todas".
    if (
      next !== 'all' &&
      activeInstanceId &&
      !instancesOfChannel(instances, next).some((it) => it.row.id === activeInstanceId)
    ) {
      setActiveInstanceId(null);
    }
  };

  // Abaixo de lg os filtros viram gaveta (Sheet): a coluna fixa de 320px
  // deixava 262px para a tabela a 768 e nada a 390. O estado dos filtros é
  // o mesmo nos dois modos — só muda onde o painel é montado.
  const filtersAsSheet = useIsBelowLg();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    (filters.search ? 1 : 0) + (filters.stage ? 1 : 0) + (filters.source ? 1 : 0) + filters.tags.length;

  const handleExport = async () => {
    if (!tenant?.id) {
      toast.error('Tenant não identificado.');
      return;
    }
    if (isExporting) return;

    setIsExporting(true);
    toast.info('Preparando exportação...');

    try {
      let query = supabase
        .from('contacts')
        .select(`
          name,
          email,
          phone,
          channel,
          username,
          notes,
          created_at,
          stage:funnel_stages!contacts_current_stage_id_fkey ( name ),
          lead_sources:lead_source_id ( name )
        `)
        .eq('tenant_id', tenant.id);

      if (activeInstanceId) {
        query = query.eq('whatsapp_instance_id', activeInstanceId);
      }
      if (channel !== 'all') {
        query = query.eq('channel', channel);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      const rows = data ?? [];
      if (rows.length === 0) {
        toast.warning('Nenhum contato para exportar.');
        return;
      }

      const csvContent = '﻿' + buildContactsCsv(rows as unknown as ContactExportRow[]);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `contatos_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exportados ${rows.length} contatos.`);
    } catch (err) {
      toast.error('Falha ao exportar contatos.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contatos"
        helpKey="page:contacts"
        description="Gerencie todos os seus leads e contatos em um só lugar"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Contatos' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {filtersAsSheet && (
              <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
                <Filter className="w-4 h-4 mr-2" />
                Filtros
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exportando...' : 'Exportar'}
            </Button>
            <Button onClick={() => setIsModalOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Novo Contato
            </Button>
          </div>
        }
      />

      {/* Layout lado a lado: Filtros à esquerda, Tabela à direita.
          A coluna tem 288px em lg/xl e 320px só em 2xl: a 1280px cada pixel
          da coluna é pixel a menos para a tabela de 7 colunas. */}
      <div className="flex gap-6">
        {!filtersAsSheet && (
          <div className="w-72 2xl:w-80 flex-shrink-0">
            <ContactFilters filters={filters} onFiltersChange={setFilters} searchByHandle={hasInstagram} />
          </div>
        )}
        
        {/* Tabela à direita */}
        <div className="flex-1 space-y-3 min-w-0">
          {hasInstagram && <ContactChannelFilter value={channel} onChange={changeChannel} />}
          {instances.length > 0 && (
            <InstanceSelector
              instances={selectorInstances}
              selectedId={activeInstanceId}
              onChange={(id) => setActiveInstanceId(id === '__all__' ? null : id)}
              allLabel={selectorAllLabel}
            />
          )}
          {/* Ajuste: abrir modal ao editar */}
          <ContactsTable
            filters={filters}
            whatsappInstanceId={activeInstanceId}
            channel={channel}
            onEdit={(id) => { setSelectedContact(id); setIsModalOpen(true); }}
          />
        </div>
      </div>

      {filtersAsSheet && (
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader className="sr-only">
              <SheetTitle>Filtros de contatos</SheetTitle>
            </SheetHeader>
            <ContactFilters filters={filters} onFiltersChange={setFilters} searchByHandle={hasInstagram} />
          </SheetContent>
        </Sheet>
      )}

      <ContactModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedContact(null);
        }}
        contactId={selectedContact}
      />
    </div>
  );
}

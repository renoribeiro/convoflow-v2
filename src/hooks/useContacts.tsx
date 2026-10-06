import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Contact {
  id: string;
  /**
   * Nulo para contato que não é de WhatsApp (o Instagram identifica por IGSID,
   * não por telefone). Todo leitor tem que tratar a ausência — ver
   * `contacts.external_id`, que é o identificador de verdade.
   */
  phone: string | null;
  /** 'whatsapp' | 'instagram' (coluna contacts.channel). */
  channel?: string;
  /** @ do Instagram, sem o "@". */
  username?: string | null;
  name: string | null;
  email: string | null;
  current_stage_id: string | null;
  lead_source_id: string | null;
  whatsapp_instance_id: string | null;
  first_message: string | null;
  last_interaction_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  stage?: {
    name: string;
    color: string;
  };
  source?: {
    name: string;
    type: string;
  };
  tags?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          stage:funnel_stages!contacts_current_stage_id_fkey(name, color),
          source:lead_sources(name, type),
          tags:contact_tags(
            tag:tags(id, name, color)
          )
        `)
        .order('last_interaction_at', { ascending: false, nullsFirst: false });

      if (error) throw error;

      const formattedContacts = data?.map(contact => ({
        ...contact,
        tags: contact.tags?.map((t: any) => t.tag).filter(Boolean) || []
      })) || [];

      setContacts(formattedContacts);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar contatos',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const createContact = async (contactData: { phone: string; name?: string; email?: string; tenant_id: string }) => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .insert([contactData])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Contato criado com sucesso',
        description: `${contactData.name || contactData.phone} foi adicionado.`
      });

      await fetchContacts();
      return data;
    } catch (error: any) {
      toast({
        title: 'Erro ao criar contato',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const updateContact = async (id: string, contactData: Partial<Contact>) => {
    try {
      const { error } = await supabase
        .from('contacts')
        .update(contactData)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Contato atualizado',
        description: 'As alterações foram salvas.'
      });

      await fetchContacts();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar contato',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const deleteContact = async (id: string) => {
    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Contato removido',
        description: 'O contato foi removido com sucesso.'
      });

      await fetchContacts();
    } catch (error: any) {
      toast({
        title: 'Erro ao remover contato',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  return {
    contacts,
    loading,
    fetchContacts,
    createContact,
    updateContact,
    deleteContact
  };
}
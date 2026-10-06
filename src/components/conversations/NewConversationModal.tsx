import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquarePlus, Phone, Send } from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

interface NewConversationModalProps {
  onConversationCreated?: (contactId: string) => void;
}

export const NewConversationModal = ({ onConversationCreated }: NewConversationModalProps) => {
  const [open, setOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { tenant } = useTenant();
  const { sendMessage } = useEvolutionApi();

  // Buscar instâncias do WhatsApp ativas
  const { 
    data: whatsappInstances = [], 
    isLoading: instancesLoading, 
    error: instancesError 
  } = useSupabaseQuery({
    table: 'whatsapp_instances',
    queryKey: ['whatsapp-instances-active'],
    select: 'id, name, instance_key, status, phone_number',
    filters: [
      { column: 'tenant_id', operator: 'eq', value: tenant?.id },
      { column: 'is_active', operator: 'eq', value: true },
      { column: 'status', operator: 'eq', value: 'open' }
    ],
    enabled: !!tenant?.id
  });

  const formatPhoneNumber = (phone: string) => {
    // Remove todos os caracteres não numéricos
    const cleaned = phone.replace(/\D/g, '');
    
    // Se não começar com 55 (código do Brasil), adiciona
    if (!cleaned.startsWith('55') && cleaned.length >= 10) {
      return '55' + cleaned;
    }
    
    return cleaned;
  };

  const validatePhoneNumber = (phone: string) => {
    const cleaned = formatPhoneNumber(phone);
    // Verifica se tem pelo menos 12 dígitos (55 + DDD + número)
    return cleaned.length >= 12 && cleaned.length <= 15;
  };

  const handleStartConversation = async () => {
    if (!selectedInstance) {
      toast({
        title: "Erro",
        description: "Selecione uma instância do WhatsApp",
        variant: "destructive"
      });
      return;
    }

    if (!phoneNumber.trim()) {
      toast({
        title: "Erro",
        description: "Digite o número do WhatsApp",
        variant: "destructive"
      });
      return;
    }

    if (!validatePhoneNumber(phoneNumber)) {
      toast({
        title: "Erro",
        description: "Número de telefone inválido. Use o formato: (11) 99999-9999",
        variant: "destructive"
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: "Erro",
        description: "Digite uma mensagem para iniciar a conversa",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);
      const selectedInstanceData = whatsappInstances.find(inst => inst.id === selectedInstance);
      
      if (!selectedInstanceData) {
        throw new Error('Instância selecionada não encontrada');
      }

      // Verificar se o contato já existe nesta instância específica.
      // Contatos são per-instance — mesma pessoa em duas instâncias = dois contatos.
      let { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('phone', formattedPhone)
        .eq('tenant_id', tenant?.id)
        .eq('whatsapp_instance_id', selectedInstance)
        .maybeSingle();

      let contactId = existingContact?.id;

      // Se o contato não existe, criar um novo
      if (!contactId) {
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            phone: formattedPhone,
            name: `Contato ${formattedPhone}`,
            tenant_id: tenant?.id,
            whatsapp_instance_id: selectedInstance,
            last_interaction_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (contactError) {
          throw contactError;
        }

        contactId = newContact.id;
      }

      // Enviar mensagem via Evolution API
      await sendMessage(selectedInstanceData.instance_key, formattedPhone, message);

      // Salvar mensagem no banco de dados
      await supabase.from('messages').insert({
        contact_id: contactId,
        tenant_id: tenant?.id,
        whatsapp_instance_id: selectedInstance,
        direction: 'outbound',
        message_type: 'text',
        content: message,
        status: 'sent',
      });

      // Atualizar última interação do contato
      await supabase
        .from('contacts')
        .update({
          last_interaction_at: new Date().toISOString(),
        })
        .eq('id', contactId);

      toast({
        title: "Sucesso",
        description: "Conversa iniciada com sucesso!",
      });

      // Resetar formulário
      setSelectedInstance('');
      setPhoneNumber('');
      setMessage('');
      setOpen(false);

      // Notificar componente pai
      if (onConversationCreated && contactId) {
        onConversationCreated(contactId);
      }

    } catch (error) {
      logger.error('[NewConversationModal] erro ao iniciar conversa', {
        error: error instanceof Error ? error.message : String(error),
      });
      toast({
        title: "Erro",
        description: "Falha ao iniciar conversa. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    // Aplicar máscara de telefone brasileiro
    const cleaned = value.replace(/\D/g, '');
    let formatted = cleaned;
    
    if (cleaned.length >= 2) {
      formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
    }
    if (cleaned.length >= 7) {
      formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7, 11)}`;
    }
    
    setPhoneNumber(formatted);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* Ocupa a linha inteira: o espaçamento fica por conta de quem usa. */}
        <Button className="w-full" data-new-conversation>
          <MessageSquarePlus className="w-4 h-4 mr-2" />
          Nova Conversa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5" />
            Iniciar Nova Conversa
            <FeatureHelp helpKey="page:conversations-new" />
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="instance">Instância do WhatsApp</Label>
            <Select value={selectedInstance} onValueChange={setSelectedInstance} disabled={instancesLoading}>
              <SelectTrigger>
                <SelectValue placeholder={instancesLoading ? "Carregando instâncias..." : "Selecione uma instância"} />
              </SelectTrigger>
              <SelectContent>
                {whatsappInstances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id}>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      <span>{instance.name}</span>
                      {instance.phone_number && (
                        <span className="text-muted-foreground text-sm">
                          ({instance.phone_number})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {instancesError && (
              <p className="text-sm text-destructive">
                Erro ao carregar instâncias do WhatsApp. Tente novamente.
              </p>
            )}
            {!instancesLoading && !instancesError && whatsappInstances.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma instância do WhatsApp conectada encontrada.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Número do WhatsApp</Label>
            <Input
              id="phone"
              placeholder="(11) 99999-9999"
              value={phoneNumber}
              onChange={(e) => handlePhoneChange(e.target.value)}
              maxLength={15}
            />
            <p className="text-sm text-muted-foreground">
              Digite o número com DDD (apenas números brasileiros)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Mensagem inicial</Label>
            <Textarea
              id="message"
              placeholder="Digite sua mensagem para iniciar a conversa..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={1000}
            />
            <p className="text-sm text-muted-foreground">
              {message.length}/1000 caracteres
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleStartConversation} disabled={loading || instancesLoading || instancesError || whatsappInstances.length === 0}>
            {loading ? (
              "Enviando..."
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Iniciar Conversa
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
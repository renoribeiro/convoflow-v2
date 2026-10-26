
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import { WEBHOOK_EVENT_TYPES, validateWebhookForm } from '@/lib/webhooks';
import { Settings, Webhook, Copy } from 'lucide-react';

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
}

export const IntegrationSettings = () => {
  const [webhookForm, setWebhookForm] = useState<Partial<WebhookConfig>>({
    name: '',
    url: '',
    events: [],
    active: true
  });
  const [isEditingWebhook, setIsEditingWebhook] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Webhooks de saída configurados pela Conta (tabela `webhooks`, tenant-scoped).
  const { data: webhooksRaw = [] } = useSupabaseQuery({
    table: 'webhooks',
    queryKey: ['webhooks'],
    select: '*',
    orderBy: [{ column: 'created_at', ascending: false }],
    // Degrada para lista vazia sem popup de erro (ex.: antes da migração da
    // tabela `webhooks`, ou falha transitória). Nada crítico depende disso aqui.
    silent: true,
  });
  const webhooks = webhooksRaw as unknown as Array<{
    id: string;
    name: string;
    url: string;
    events: string[];
    is_active: boolean;
    secret?: string | null;
  }>;
  
  // Mutation para salvar webhook
  const saveWebhookMutation = useSupabaseMutation({
    table: 'webhooks',
    operation: isEditingWebhook ? 'update' : 'insert',
    invalidateQueries: [['webhooks']],
    successMessage: isEditingWebhook ? 'Webhook atualizado!' : 'Webhook criado!'
  });
  
  // Mutation para deletar webhook
  const deleteWebhookMutation = useSupabaseMutation({
    table: 'webhooks',
    operation: 'delete',
    invalidateQueries: [['webhooks']],
    successMessage: 'Webhook removido!'
  });
  
  const eventTypes = WEBHOOK_EVENT_TYPES;

  const handleSaveWebhook = async () => {
    const validation = validateWebhookForm(webhookForm);
    if (!validation.valid) {
      toast({ title: 'Erro', description: validation.error, variant: 'destructive' });
      return;
    }

    // A tabela usa `is_active`; o formulário usa `active`. Traduzimos aqui.
    const data = {
      name: webhookForm.name?.trim(),
      url: webhookForm.url?.trim(),
      events: webhookForm.events || [],
      secret: webhookForm.secret || null,
      is_active: webhookForm.active ?? true,
    };

    try {
      if (isEditingWebhook) {
        await saveWebhookMutation.mutateAsync({
          data,
          options: { filter: { column: 'id', operator: 'eq', value: isEditingWebhook } },
        });
      } else {
        // tenant_id é injetado automaticamente pelo useSupabaseMutation.
        await saveWebhookMutation.mutateAsync({ data });
      }

      setWebhookForm({ name: '', url: '', events: [], active: true });
      setIsEditingWebhook(null);
    } catch {
      // O hook já exibe o toast de erro.
    }
  };

  const handleEditWebhook = (webhook: any) => {
    setWebhookForm({
      name: webhook.name,
      url: webhook.url,
      events: webhook.events || [],
      secret: webhook.secret || '',
      active: webhook.is_active,
    });
    setIsEditingWebhook(webhook.id);
  };

  // Remover webhook pede confirmação (o sistema de destino para de receber).
  const [removerAlvo, setRemoverAlvo] = useState<{ id: string; name: string; url: string } | null>(null);

  const handleDeleteWebhook = async (id: string) => {
    await deleteWebhookMutation.mutateAsync({
      data: {},
      options: { filter: { column: 'id', operator: 'eq', value: id } },
    });
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: 'URL copiada para a área de transferência'
    });
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Integrações
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
            <div className="text-sm text-muted-foreground">
              Configure webhooks para receber notificações em tempo real sobre eventos do sistema.
            </div>
            
            {/* Formulário de Webhook */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {isEditingWebhook ? 'Editar Webhook' : 'Novo Webhook'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="webhook-name">Nome *</Label>
                    <Input
                      id="webhook-name"
                      value={webhookForm.name || ''}
                      onChange={(e) => setWebhookForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Sistema de CRM"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="webhook-url">URL do Endpoint *</Label>
                    <Input
                      id="webhook-url"
                      value={webhookForm.url || ''}
                      onChange={(e) => setWebhookForm(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="https://exemplo.com/webhook"
                    />
                  </div>
                </div>
                
                <div>
                  <Label>Eventos</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                    {eventTypes.map((event) => (
                      <div key={event.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={event.id}
                          checked={webhookForm.events?.includes(event.id) || false}
                          onChange={(e) => {
                            const events = webhookForm.events || [];
                            if (e.target.checked) {
                              setWebhookForm(prev => ({ 
                                ...prev, 
                                events: [...events, event.id] 
                              }));
                            } else {
                              setWebhookForm(prev => ({ 
                                ...prev, 
                                events: events.filter(id => id !== event.id) 
                              }));
                            }
                          }}
                          className="rounded"
                        />
                        <Label htmlFor={event.id} className="text-sm">
                          {event.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="webhook-secret">Secret (Opcional)</Label>
                  <Input
                    id="webhook-secret"
                    value={webhookForm.secret || ''}
                    onChange={(e) => setWebhookForm(prev => ({ ...prev, secret: e.target.value }))}
                    placeholder="Chave secreta para validação"
                    type="password"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={webhookForm.active || false}
                    onCheckedChange={(checked) => setWebhookForm(prev => ({ ...prev, active: checked }))}
                  />
                  <Label>Webhook ativo</Label>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    onClick={handleSaveWebhook}
                    disabled={saveWebhookMutation.isPending}
                  >
                    {saveWebhookMutation.isPending ? 'Salvando...' : (isEditingWebhook ? 'Atualizar' : 'Criar Webhook')}
                  </Button>
                  {isEditingWebhook && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setWebhookForm({ name: '', url: '', events: [], active: true });
                        setIsEditingWebhook(null);
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            
            {/* Lista de Webhooks */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Webhooks Configurados</h3>
              {webhooks.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Webhook className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Nenhum webhook configurado</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {webhooks.map((webhook) => (
                    <Card key={webhook.id}>
                      <CardContent className="p-4">
                        {/* No celular os botões descem para baixo do endereço: lado a
                            lado, eles saíam do cartão (achado 121 do checkup). */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-medium">{webhook.name}</h4>
                              {webhook.is_active ? (
                                <Badge variant="default" className="bg-green-500">Ativo</Badge>
                              ) : (
                                <Badge variant="secondary">Inativo</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span className="min-w-0 break-all">{webhook.url}</span>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => copyToClipboard(webhook.url)}
                                className="h-6 w-6 p-0"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="mt-2">
                              <span className="text-xs text-muted-foreground">
                                Eventos: {webhook.events?.length || 0} configurados
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex shrink-0 gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleEditWebhook(webhook)}
                            >
                              Editar
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setRemoverAlvo({ id: webhook.id, name: webhook.name, url: webhook.url })}
                              disabled={deleteWebhookMutation.isPending}
                            >
                              Remover
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
            
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Documentação de Webhooks</h4>
              {/* O botão "Ver Documentação" ("em breve") saiu em 2026-10-25
                  (achado 120 do checkup): não existe página com o formato dos
                  avisos, e o texto mandava a pessoa consultá-la. */}
              <p className="text-sm text-muted-foreground">
                Cada aviso é enviado ao endereço cadastrado no formato JSON, pelo método POST. Ainda não há uma página que descreva o conteúdo de cada evento: para montar a integração, cadastre um endereço de teste e veja um aviso de verdade chegar.
              </p>
            </div>
        </div>
      </CardContent>

      <ConfirmationDialog
        isOpen={!!removerAlvo}
        onClose={() => setRemoverAlvo(null)}
        onConfirm={async () => {
          if (removerAlvo) await handleDeleteWebhook(removerAlvo.id);
        }}
        title={`Remover o webhook "${removerAlvo?.name ?? ''}"?`}
        description={`O endereço ${removerAlvo?.url ?? ''} para de receber os avisos do ConvoFlow agora. Se outro sistema depende deles (um CRM, uma automação), ele deixa de ser avisado.`}
        reversivel={false}
        confirmText="Remover webhook"
        variant="destructive"
        isLoading={deleteWebhookMutation.isPending}
      />
    </Card>
  );
};

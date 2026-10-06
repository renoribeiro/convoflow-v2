
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ComingSoonButton } from '@/components/shared/ComingSoonButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import { WEBHOOK_EVENT_TYPES, validateWebhookForm } from '@/lib/webhooks';
import { 
  Settings, 
  Webhook, 
  Database, 
  Mail, 
  ShoppingCart, 
  BarChart3, 
  Zap, 
  CheckCircle, 
  AlertCircle,
  ExternalLink,
  Copy,
  RefreshCw,
  CreditCard
} from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: 'crm' | 'ecommerce' | 'analytics' | 'automation' | 'communication' | 'payment';
  status: 'connected' | 'disconnected' | 'error';
  config?: Record<string, any>;
  webhook_url?: string;
}

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
}

export const IntegrationSettings = () => {
  const [activeTab, setActiveTab] = useState('integrations');
  const [webhookForm, setWebhookForm] = useState<Partial<WebhookConfig>>({
    name: '',
    url: '',
    events: [],
    active: true
  });
  const [isEditingWebhook, setIsEditingWebhook] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Webhooks de saída configurados pela Conta (tabela `webhooks`, tenant-scoped).
  // (Os cards de "Integrações" abaixo são um catálogo estático — não há tabela.)
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
  
  // Integrações disponíveis
  const availableIntegrations: Integration[] = [
    {
      id: 'hubspot',
      name: 'HubSpot',
      description: 'Sincronize contatos e leads com o HubSpot CRM',
      icon: Database,
      category: 'crm',
      status: 'disconnected'
    },
    {
      id: 'salesforce',
      name: 'Salesforce',
      description: 'Integração completa com Salesforce CRM',
      icon: Database,
      category: 'crm',
      status: 'disconnected'
    },
    {
      id: 'shopify',
      name: 'Shopify',
      description: 'Conecte sua loja Shopify para automação de vendas',
      icon: ShoppingCart,
      category: 'ecommerce',
      status: 'disconnected'
    },
    {
      id: 'woocommerce',
      name: 'WooCommerce',
      description: 'Integração com lojas WooCommerce',
      icon: ShoppingCart,
      category: 'ecommerce',
      status: 'disconnected'
    },
    {
      id: 'google-analytics',
      name: 'Google Analytics',
      description: 'Rastreamento avançado de conversões',
      icon: BarChart3,
      category: 'analytics',
      status: 'disconnected'
    },
    {
      id: 'zapier',
      name: 'Zapier',
      description: 'Conecte com mais de 5000 aplicações',
      icon: Zap,
      category: 'automation',
      status: 'disconnected'
    },
    {
      id: 'mailchimp',
      name: 'Mailchimp',
      description: 'Sincronização de listas de email marketing',
      icon: Mail,
      category: 'communication',
      status: 'disconnected'
    },
    {
      id: 'stripe',
      name: 'Stripe',
      description: 'Gateway de pagamento para processar assinaturas e cobranças',
      icon: CreditCard,
      category: 'payment',
      status: 'disconnected'
    }
  ];
  
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

  const handleDeleteWebhook = async (id: string) => {
    try {
      await deleteWebhookMutation.mutateAsync({
        data: {},
        options: { filter: { column: 'id', operator: 'eq', value: id } },
      });
    } catch {
      // O hook já exibe o toast de erro.
    }
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: 'URL copiada para a área de transferência'
    });
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge variant="default" className="bg-green-500">Conectado</Badge>;
      case 'error':
        return <Badge variant="destructive">Erro</Badge>;
      default:
        return <Badge variant="secondary">Desconectado</Badge>;
    }
  };
  
  const groupedIntegrations = availableIntegrations.reduce((acc, integration) => {
    (acc[integration.category] ??= []).push(integration);
    return acc;
  }, {} as Record<string, Integration[]>);
  
  const categoryLabels = {
    crm: 'CRM',
    ecommerce: 'E-commerce',
    analytics: 'Analytics',
    automation: 'Automação',
    communication: 'Comunicação',
    payment: 'Pagamentos'
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start md:grid md:grid-cols-2">
            <TabsTrigger value="integrations">Integrações</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          </TabsList>
          
          <TabsContent value="integrations" className="space-y-6">
            <div className="text-sm text-muted-foreground">
              Conecte o ConvoFlow com suas ferramentas favoritas para automatizar fluxos de trabalho.
            </div>
            
            {Object.entries(groupedIntegrations).map(([category, integrations]) => (
              <div key={category}>
                <h3 className="text-lg font-semibold mb-3">{categoryLabels[category as keyof typeof categoryLabels]}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {integrations.map((integration) => {
                    const Icon = integration.icon;
                    return (
                      <Card key={integration.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-primary/10 rounded-lg">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <h4 className="font-medium">{integration.name}</h4>
                                {getStatusIcon(integration.status)}
                              </div>
                            </div>
                            {getStatusBadge(integration.status)}
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-4">
                            {integration.description}
                          </p>
                          
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant={integration.status === 'connected' ? 'outline' : 'default'}
                              className="flex-1"
                              onClick={() => {
                                toast({
                                  title: 'Integração em desenvolvimento',
                                  description: `A integração com ${integration.name} estará disponível em breve.`
                                });
                              }}
                            >
                              {integration.status === 'connected' ? 'Configurar' : 'Conectar'}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => {
                                window.open(`https://www.${integration.id}.com`, '_blank');
                              }}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                {category !== 'communication' && <Separator className="my-6" />}
              </div>
            ))}
            
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Precisa de uma integração específica?</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Entre em contato conosco para solicitar novas integrações ou use nossa API para criar integrações personalizadas.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => {
                    toast({
                      title: 'Solicitação enviada',
                      description: 'Entraremos em contato em breve para discutir sua solicitação de integração.'
                    });
                  }}
                >
                  Solicitar Integração
                </Button>
                {/* Apontava para https://docs.convoflow.com/api — dominio que
                    nao resolve (DNS falha), ou seja, abria uma aba de erro.
                    Enquanto nao existir site de documentacao, o botao diz que
                    nao existe em vez de fingir que leva a algum lugar. */}
                <ComingSoonButton size="sm" variant="outline" motivo="Documentação da API em breve">
                  Ver Documentação da API
                </ComingSoonButton>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="webhooks" className="space-y-6">
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
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-medium">{webhook.name}</h4>
                              {webhook.is_active ? (
                                <Badge variant="default" className="bg-green-500">Ativo</Badge>
                              ) : (
                                <Badge variant="secondary">Inativo</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>{webhook.url}</span>
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
                          
                          <div className="flex gap-2">
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
                              onClick={() => handleDeleteWebhook(webhook.id)}
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
              <p className="text-sm text-muted-foreground mb-3">
                Os webhooks enviam dados em formato JSON via POST. Consulte nossa documentação para detalhes sobre o formato dos payloads.
              </p>
              {/* Mesmo caso: docs.convoflow.com nao resolve. */}
              <ComingSoonButton size="sm" variant="outline" motivo="Documentação de webhooks em breve">
                Ver Documentação
              </ComingSoonButton>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

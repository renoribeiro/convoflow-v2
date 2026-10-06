import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Plug,
  Settings,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  Zap,
  Globe,
  Database,
  Mail,
  MessageSquare,
  Calendar,
  CreditCard,
  BarChart3,
  Users,
  FileText,
  Cloud,
  Shield,
  Key,
  Webhook,
  Code,
  Play,
  Pause,
  RotateCcw,
  Save
} from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';

interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  provider: string;
  status: 'active' | 'inactive' | 'error' | 'pending';
  icon: React.ElementType;
  config: Record<string, any>;
  webhook_url?: string;
  api_key?: string;
  secret_key?: string;
  created_at: string;
  updated_at: string;
  last_sync?: string;
  sync_count: number;
  error_count: number;
}

interface IntegrationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  provider: string;
  icon: React.ElementType;
  fields: IntegrationField[];
  documentation_url: string;
  popular: boolean;
}

interface IntegrationField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select' | 'textarea' | 'boolean';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  description?: string;
}

// Templates de integração disponíveis
const integrationTemplates: IntegrationTemplate[] = [
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Conecte com mais de 5000 aplicativos via Zapier',
    category: 'Automação',
    provider: 'Zapier',
    icon: Zap,
    popular: true,
    documentation_url: 'https://zapier.com/apps/webhook',
    fields: [
      {
        name: 'webhook_url',
        label: 'URL do Webhook',
        type: 'url',
        required: true,
        placeholder: 'https://hooks.zapier.com/hooks/catch/...',
        description: 'URL do webhook fornecida pelo Zapier'
      },
      {
        name: 'events',
        label: 'Eventos',
        type: 'select',
        required: true,
        options: [
          { value: 'new_contact', label: 'Novo Contato' },
          { value: 'new_message', label: 'Nova Mensagem' },
          { value: 'campaign_sent', label: 'Campanha Enviada' },
          { value: 'automation_triggered', label: 'Automação Disparada' }
        ]
      }
    ]
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    description: 'Sincronize dados com planilhas do Google',
    category: 'Produtividade',
    provider: 'Google',
    icon: FileText,
    popular: true,
    documentation_url: 'https://developers.google.com/sheets/api',
    fields: [
      {
        name: 'spreadsheet_id',
        label: 'ID da Planilha',
        type: 'text',
        required: true,
        placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        description: 'ID da planilha do Google Sheets'
      },
      {
        name: 'sheet_name',
        label: 'Nome da Aba',
        type: 'text',
        required: true,
        placeholder: 'Contatos',
        description: 'Nome da aba onde os dados serão inseridos'
      },
      {
        name: 'api_key',
        label: 'Chave da API',
        type: 'password',
        required: true,
        description: 'Chave da API do Google Cloud'
      }
    ]
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    description: 'Sincronize contatos com listas do Mailchimp',
    category: 'Email Marketing',
    provider: 'Mailchimp',
    icon: Mail,
    popular: false,
    documentation_url: 'https://mailchimp.com/developer/marketing/',
    fields: [
      {
        name: 'api_key',
        label: 'Chave da API',
        type: 'password',
        required: true,
        description: 'Chave da API do Mailchimp'
      },
      {
        name: 'list_id',
        label: 'ID da Lista',
        type: 'text',
        required: true,
        placeholder: 'a1b2c3d4e5',
        description: 'ID da lista onde os contatos serão adicionados'
      },
      {
        name: 'double_optin',
        label: 'Double Opt-in',
        type: 'boolean',
        required: false,
        description: 'Exigir confirmação por email'
      }
    ]
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Integre com o CRM HubSpot',
    category: 'CRM',
    provider: 'HubSpot',
    icon: Users,
    popular: true,
    documentation_url: 'https://developers.hubspot.com/',
    fields: [
      {
        name: 'api_key',
        label: 'Chave da API',
        type: 'password',
        required: true,
        description: 'Chave privada da API do HubSpot'
      },
      {
        name: 'portal_id',
        label: 'Portal ID',
        type: 'text',
        required: true,
        placeholder: '12345678',
        description: 'ID do portal HubSpot'
      }
    ]
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Envie notificações para canais do Slack',
    category: 'Comunicação',
    provider: 'Slack',
    icon: MessageSquare,
    popular: false,
    documentation_url: 'https://api.slack.com/',
    fields: [
      {
        name: 'webhook_url',
        label: 'URL do Webhook',
        type: 'url',
        required: true,
        placeholder: 'https://hooks.slack.com/services/...',
        description: 'URL do webhook do Slack'
      },
      {
        name: 'channel',
        label: 'Canal',
        type: 'text',
        required: true,
        placeholder: '#geral',
        description: 'Canal onde as mensagens serão enviadas'
      }
    ]
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Crie eventos no Google Calendar',
    category: 'Produtividade',
    provider: 'Google',
    icon: Calendar,
    popular: false,
    documentation_url: 'https://developers.google.com/calendar',
    fields: [
      {
        name: 'calendar_id',
        label: 'ID do Calendário',
        type: 'text',
        required: true,
        placeholder: 'primary',
        description: 'ID do calendário do Google'
      },
      {
        name: 'api_key',
        label: 'Chave da API',
        type: 'password',
        required: true,
        description: 'Chave da API do Google Cloud'
      }
    ]
  }
];

// Integrações mockadas
const mockIntegrations: Integration[] = [
  {
    id: '1',
    name: 'Zapier Webhook',
    description: 'Webhook para automações Zapier',
    category: 'Automação',
    provider: 'Zapier',
    status: 'active',
    icon: Zap,
    config: {
      webhook_url: 'https://hooks.zapier.com/hooks/catch/123456/abcdef',
      events: ['new_contact', 'new_message']
    },
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-03T10:00:00Z',
    last_sync: '2024-01-03T09:30:00Z',
    sync_count: 1250,
    error_count: 3
  },
  {
    id: '2',
    name: 'Google Sheets - Contatos',
    description: 'Sincronização de contatos com planilha',
    category: 'Produtividade',
    provider: 'Google',
    status: 'active',
    icon: FileText,
    config: {
      spreadsheet_id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      sheet_name: 'Contatos',
      api_key: '***hidden***'
    },
    created_at: '2024-01-02T14:00:00Z',
    updated_at: '2024-01-03T08:00:00Z',
    last_sync: '2024-01-03T08:15:00Z',
    sync_count: 856,
    error_count: 0
  },
  {
    id: '3',
    name: 'HubSpot CRM',
    description: 'Integração com CRM HubSpot',
    category: 'CRM',
    provider: 'HubSpot',
    status: 'error',
    icon: Users,
    config: {
      api_key: '***hidden***',
      portal_id: '12345678'
    },
    created_at: '2024-01-01T16:00:00Z',
    updated_at: '2024-01-03T07:00:00Z',
    last_sync: '2024-01-02T22:00:00Z',
    sync_count: 234,
    error_count: 15
  }
];

const IntegrationCard = ({ integration, onEdit, onDelete, onToggle }: {
  integration: Integration;
  onEdit: (integration: Integration) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}) => {
  const getStatusIcon = () => {
    switch (integration.status) {
      case 'active': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'inactive': return <Pause className="h-5 w-5 text-gray-500" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'pending': return <RefreshCw className="h-5 w-5 text-yellow-500 animate-spin" />;
    }
  };

  const getStatusBadge = () => {
    const variants = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      error: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800'
    };

    const labels = {
      active: 'Ativo',
      inactive: 'Inativo',
      error: 'Erro',
      pending: 'Pendente'
    };

    return (
      <Badge className={variants[integration.status]}>
        {labels[integration.status]}
      </Badge>
    );
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <integration.icon className="h-8 w-8 text-primary" />
            <div>
              <h3 className="font-semibold">{integration.name}</h3>
              <p className="text-sm text-muted-foreground">{integration.description}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            {getStatusBadge()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Categoria:</span>
            <span className="ml-2 font-medium">{integration.category}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Provedor:</span>
            <span className="ml-2 font-medium">{integration.provider}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Sincronizações:</span>
            <span className="ml-2 font-medium">{integration.sync_count.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Erros:</span>
            <span className={`ml-2 font-medium ${
              integration.error_count > 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              {integration.error_count}
            </span>
          </div>
        </div>

        {integration.last_sync && (
          <div className="text-xs text-muted-foreground mb-4">
            Última sincronização: {new Date(integration.last_sync).toLocaleString()}
          </div>
        )}

        <Separator className="mb-4" />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(integration)}
            >
              <Edit className="h-4 w-4 mr-1" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggle(integration.id)}
            >
              {integration.status === 'active' ? (
                <>
                  <Pause className="h-4 w-4 mr-1" />
                  Pausar
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Ativar
                </>
              )}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(integration.id)}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Excluir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const TemplateCard = ({ template, onSelect }: {
  template: IntegrationTemplate;
  onSelect: (template: IntegrationTemplate) => void;
}) => {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onSelect(template)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <template.icon className="h-8 w-8 text-primary" />
            <div>
              <h3 className="font-semibold">{template.name}</h3>
              <p className="text-sm text-muted-foreground">{template.description}</p>
            </div>
          </div>
          {template.popular && (
            <Badge className="bg-blue-100 text-blue-800">Popular</Badge>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">Categoria:</span>
            <span className="ml-2 font-medium">{template.category}</span>
          </div>
          <Button variant="outline" size="sm">
            <ExternalLink className="h-4 w-4 mr-1" />
            Docs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const IntegrationForm = ({ template, onSave, onCancel }: {
  template: IntegrationTemplate;
  onSave: (data: any) => void;
  onCancel: () => void;
}) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  const toggleSecretVisibility = (fieldName: string) => {
    setShowSecrets(prev => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  const renderField = (field: IntegrationField) => {
    const value = formData[field.name] || '';

    switch (field.type) {
      case 'text':
      case 'url':
        return (
          <Input
            type={field.type}
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
        );
      
      case 'password':
        return (
          <div className="relative">
            <Input
              type={showSecrets[field.name] ? 'text' : 'password'}
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2"
              onClick={() => toggleSecretVisibility(field.name)}
            >
              {showSecrets[field.name] ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        );
      
      case 'textarea':
        return (
          <Textarea
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            rows={3}
          />
        );
      
      case 'select':
        return (
          <Select value={value} onValueChange={(val) => handleFieldChange(field.name, val)}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      
      case 'boolean':
        return (
          <Switch
            checked={value}
            onCheckedChange={(checked) => handleFieldChange(field.name, checked)}
          />
        );
      
      default:
        return null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: `${template.name} - ${new Date().toLocaleDateString()}`,
      description: template.description,
      category: template.category,
      provider: template.provider,
      config: formData
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <template.icon className="h-6 w-6" />
          <span>Configurar {template.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {template.fields.map((field) => (
            <div key={field.name}>
              <Label htmlFor={field.name}>
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {renderField(field)}
              {field.description && (
                <p className="text-xs text-muted-foreground mt-1">
                  {field.description}
                </p>
              )}
            </div>
          ))}

          <Separator />

          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <div className="flex items-center space-x-2">
              <Button type="button" variant="outline" asChild>
                <a href={template.documentation_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Documentação
                </a>
              </Button>
              <Button type="submit">
                <Save className="h-4 w-4 mr-2" />
                Salvar Integração
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const IntegrationsList = () => {
  const [integrations, setIntegrations] = useState<Integration[]>(mockIntegrations);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'error'>('all');
  const { toast } = useToast();

  const filteredIntegrations = integrations.filter(integration => {
    if (filter === 'all') return true;
    return integration.status === filter;
  });

  const handleEdit = (integration: Integration) => {
    toast({
      title: "Editar integração",
      description: `Editando ${integration.name}`
    });
  };

  const handleDelete = (id: string) => {
    setIntegrations(prev => prev.filter(i => i.id !== id));
    toast({
      title: "Integração removida",
      description: "A integração foi removida com sucesso"
    });
  };

  const handleToggle = (id: string) => {
    setIntegrations(prev => prev.map(integration => {
      if (integration.id === id) {
        const newStatus = integration.status === 'active' ? 'inactive' : 'active';
        return { ...integration, status: newStatus };
      }
      return integration;
    }));
    
    const integration = integrations.find(i => i.id === id);
    const action = integration?.status === 'active' ? 'pausada' : 'ativada';
    
    toast({
      title: "Status alterado",
      description: `Integração ${action} com sucesso`
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
          >
            Todas ({integrations.length})
          </Button>
          <Button 
            variant={filter === 'active' ? 'default' : 'outline'}
            onClick={() => setFilter('active')}
          >
            Ativas ({integrations.filter(i => i.status === 'active').length})
          </Button>
          <Button 
            variant={filter === 'inactive' ? 'default' : 'outline'}
            onClick={() => setFilter('inactive')}
          >
            Inativas ({integrations.filter(i => i.status === 'inactive').length})
          </Button>
          <Button 
            variant={filter === 'error' ? 'default' : 'outline'}
            onClick={() => setFilter('error')}
          >
            Com Erro ({integrations.filter(i => i.status === 'error').length})
          </Button>
        </div>
        <Button variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredIntegrations.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {filteredIntegrations.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Plug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma integração encontrada</h3>
            <p className="text-muted-foreground">
              {filter === 'all' ? 
                'Você ainda não configurou nenhuma integração.' :
                `Não há integrações com status "${filter}".`
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const AvailableIntegrations = ({ onSelectTemplate }: {
  onSelectTemplate: (template: IntegrationTemplate) => void;
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const categories = Array.from(new Set(integrationTemplates.map(t => t.category)));
  
  const filteredTemplates = integrationTemplates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const popularTemplates = filteredTemplates.filter(t => t.popular);
  const otherTemplates = filteredTemplates.filter(t => !t.popular);

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <Input
            placeholder="Buscar integrações..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map(category => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {popularTemplates.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Integrações Populares</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {popularTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={onSelectTemplate}
              />
            ))}
          </div>
        </div>
      )}

      {otherTemplates.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">
            {popularTemplates.length > 0 ? 'Outras Integrações' : 'Integrações Disponíveis'}
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {otherTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={onSelectTemplate}
              />
            ))}
          </div>
        </div>
      )}

      {filteredTemplates.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma integração encontrada</h3>
            <p className="text-muted-foreground">
              Tente ajustar os filtros de busca ou categoria.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export const IntegrationManager = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<IntegrationTemplate | null>(null);
  const { toast } = useToast();

  const handleSelectTemplate = (template: IntegrationTemplate) => {
    setSelectedTemplate(template);
  };

  const handleSaveIntegration = (data: any) => {
    // Aqui você salvaria a integração no banco de dados
    console.log('Saving integration:', data);
    
    toast({
      title: "Integração criada",
      description: `${data.name} foi configurada com sucesso`
    });
    
    setSelectedTemplate(null);
  };

  const handleCancelForm = () => {
    setSelectedTemplate(null);
  };

  if (selectedTemplate) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleCancelForm}>
            ← Voltar
          </Button>
          <div>
            <h2 className="text-2xl font-bold">Nova Integração</h2>
            <p className="text-muted-foreground">
              Configure sua integração com {selectedTemplate.name}
            </p>
          </div>
        </div>

        <IntegrationForm
          template={selectedTemplate}
          onSave={handleSaveIntegration}
          onCancel={handleCancelForm}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gerenciador de Integrações</h2>
          <p className="text-muted-foreground">
            Conecte o ConvoFlow com suas ferramentas favoritas
          </p>
        </div>
      </div>

      <Tabs defaultValue="active" className="space-y-6">
        <TabsList>
          <TabsTrigger value="active">Integrações Ativas</TabsTrigger>
          <TabsTrigger value="available">Adicionar Integração</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <IntegrationsList />
        </TabsContent>

        <TabsContent value="available">
          <AvailableIntegrations onSelectTemplate={handleSelectTemplate} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Settings,
  Key,
  Shield,
  Globe,
  Zap,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Save,
  Download,
  Upload,
  Code,
  Terminal,
  Database,
  Cloud,
  Server,
  Lock,
  Unlock,
  Info,
  ExternalLink,
  FileText,
  BarChart3,
  TrendingUp,
  Users,
  MessageSquare,
  Mail,
  Smartphone,
  Webhook,
  Link as LinkIcon,
  Hash,
  Timer,
  Gauge,
  Network,
  Cpu,
  HardDrive,
  MemoryStick,
  Wifi,
  WifiOff,
  PlayCircle,
  PauseCircle,
  StopCircle,
  RotateCcw,
  TestTube,
  Bug,
  Wrench,
  Cog,
  Layers,
  Package,
  Boxes,
  Archive,
  FolderOpen,
  FileCode,
  Monitor,
  Smartphone as Mobile,
  Tablet,
  Watch,
  Headphones,
  Mic,
  Camera,
  Video,
  Image,
  Music,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Star,
  Heart,
  ThumbsUp,
  Share,
  Send,
  Inbox,
  Outbox,
  Archive as ArchiveIcon,
  Bookmark,
  Flag,
  Tag,
  Filter,
  Search,
  SortAsc,
  SortDesc,
  Calendar,
  CalendarDays,
  MapPin,
  Navigation,
  Compass,
  Route,
  Car,
  Plane,
  Ship,
  Train,
  Bike,
  Walk,
  Home,
  Building,
  Store,
  Factory,
  Warehouse,
  School,
  Hospital,
  Bank,
  Church,
  TreePine,
  Mountain,
  Sun,
  Moon,
  CloudRain,
  Snowflake,
  Wind,
  Thermometer,
  Droplets,
  Flame,
  Zap as Lightning,
  Rainbow,
  Sunrise,
  Sunset
} from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';

interface ApiEndpoint {
  id: string;
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  category: string;
  version: string;
  status: 'active' | 'inactive' | 'deprecated' | 'beta';
  authentication: {
    type: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
    required: boolean;
    location?: 'header' | 'query' | 'body';
    key_name?: string;
  };
  rate_limit: {
    requests_per_minute: number;
    requests_per_hour: number;
    requests_per_day: number;
  };
  headers: Record<string, string>;
  parameters: ApiParameter[];
  response_format: 'json' | 'xml' | 'text' | 'binary';
  cache_ttl: number;
  timeout: number;
  retry_attempts: number;
  created_at: string;
  updated_at: string;
  last_used: string;
  usage_count: number;
  success_rate: number;
  avg_response_time: number;
}

interface ApiParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description?: string;
  default_value?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

interface ApiKey {
  id: string;
  name: string;
  description: string;
  key: string;
  type: 'read' | 'write' | 'admin' | 'webhook';
  status: 'active' | 'inactive' | 'expired' | 'revoked';
  permissions: string[];
  rate_limit: {
    requests_per_minute: number;
    requests_per_hour: number;
    requests_per_day: number;
  };
  allowed_ips: string[];
  allowed_domains: string[];
  expires_at?: string;
  created_at: string;
  last_used?: string;
  usage_count: number;
}

interface WebhookConfig {
  id: string;
  name: string;
  description: string;
  url: string;
  events: string[];
  status: 'active' | 'inactive' | 'failed';
  secret: string;
  headers: Record<string, string>;
  retry_attempts: number;
  timeout: number;
  created_at: string;
  last_triggered?: string;
  success_count: number;
  failure_count: number;
  last_error?: string;
}

interface ApiMetrics {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  avg_response_time: number;
  requests_per_minute: number;
  error_rate: number;
  uptime_percentage: number;
  last_24h_requests: number;
  peak_requests_per_minute: number;
  most_used_endpoint: string;
  slowest_endpoint: string;
  fastest_endpoint: string;
}

// Dados mockados
const mockEndpoints: ApiEndpoint[] = [
  {
    id: '1',
    name: 'Send Message',
    description: 'Envia uma mensagem via WhatsApp',
    url: '/api/v1/messages/send',
    method: 'POST',
    category: 'messaging',
    version: 'v1',
    status: 'active',
    authentication: {
      type: 'api_key',
      required: true,
      location: 'header',
      key_name: 'apikey'
    },
    rate_limit: {
      requests_per_minute: 60,
      requests_per_hour: 1000,
      requests_per_day: 10000
    },
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    parameters: [
      { name: 'to', type: 'string', required: true, description: 'Número do destinatário' },
      { name: 'message', type: 'string', required: true, description: 'Conteúdo da mensagem' },
      { name: 'type', type: 'string', required: false, default_value: 'text', validation: { enum: ['text', 'image', 'video', 'audio', 'document'] } }
    ],
    response_format: 'json',
    cache_ttl: 0,
    timeout: 30000,
    retry_attempts: 3,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-03T10:00:00Z',
    last_used: '2024-01-03T15:30:00Z',
    usage_count: 15420,
    success_rate: 98.7,
    avg_response_time: 245
  },
  {
    id: '2',
    name: 'Get Messages',
    description: 'Recupera mensagens recebidas',
    url: '/api/v1/messages',
    method: 'GET',
    category: 'messaging',
    version: 'v1',
    status: 'active',
    authentication: {
      type: 'bearer',
      required: true,
      location: 'header'
    },
    rate_limit: {
      requests_per_minute: 120,
      requests_per_hour: 2000,
      requests_per_day: 20000
    },
    headers: {
      'Accept': 'application/json'
    },
    parameters: [
      { name: 'limit', type: 'number', required: false, default_value: 50, validation: { min: 1, max: 100 } },
      { name: 'offset', type: 'number', required: false, default_value: 0, validation: { min: 0 } },
      { name: 'from', type: 'string', required: false, description: 'Filtrar por remetente' },
      { name: 'date_from', type: 'string', required: false, description: 'Data inicial (ISO 8601)' },
      { name: 'date_to', type: 'string', required: false, description: 'Data final (ISO 8601)' }
    ],
    response_format: 'json',
    cache_ttl: 300,
    timeout: 15000,
    retry_attempts: 2,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-02T14:00:00Z',
    last_used: '2024-01-03T15:25:00Z',
    usage_count: 8934,
    success_rate: 99.2,
    avg_response_time: 156
  },
  {
    id: '3',
    name: 'Create Contact',
    description: 'Cria um novo contato',
    url: '/api/v1/contacts',
    method: 'POST',
    category: 'contacts',
    version: 'v1',
    status: 'active',
    authentication: {
      type: 'api_key',
      required: true,
      location: 'header',
      key_name: 'Authorization'
    },
    rate_limit: {
      requests_per_minute: 30,
      requests_per_hour: 500,
      requests_per_day: 5000
    },
    headers: {
      'Content-Type': 'application/json'
    },
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Nome do contato' },
      { name: 'phone', type: 'string', required: true, description: 'Número de telefone' },
      { name: 'email', type: 'string', required: false, description: 'Email do contato' },
      { name: 'tags', type: 'array', required: false, description: 'Tags do contato' }
    ],
    response_format: 'json',
    cache_ttl: 0,
    timeout: 10000,
    retry_attempts: 2,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
    last_used: '2024-01-03T12:15:00Z',
    usage_count: 2156,
    success_rate: 97.8,
    avg_response_time: 89
  },
  {
    id: '4',
    name: 'Webhook Events',
    description: 'Recebe eventos via webhook',
    url: '/api/v1/webhooks/events',
    method: 'POST',
    category: 'webhooks',
    version: 'v1',
    status: 'beta',
    authentication: {
      type: 'none',
      required: false
    },
    rate_limit: {
      requests_per_minute: 1000,
      requests_per_hour: 10000,
      requests_per_day: 100000
    },
    headers: {
      'Content-Type': 'application/json'
    },
    parameters: [
      { name: 'event_type', type: 'string', required: true, description: 'Tipo do evento' },
      { name: 'data', type: 'object', required: true, description: 'Dados do evento' },
      { name: 'timestamp', type: 'string', required: true, description: 'Timestamp do evento' }
    ],
    response_format: 'json',
    cache_ttl: 0,
    timeout: 5000,
    retry_attempts: 1,
    created_at: '2024-01-02T10:00:00Z',
    updated_at: '2024-01-03T10:00:00Z',
    last_used: '2024-01-03T15:45:00Z',
    usage_count: 45678,
    success_rate: 99.9,
    avg_response_time: 23
  },
  {
    id: '5',
    name: 'Analytics Report',
    description: 'Gera relatório de analytics',
    url: '/api/v1/analytics/report',
    method: 'GET',
    category: 'analytics',
    version: 'v1',
    status: 'deprecated',
    authentication: {
      type: 'oauth2',
      required: true,
      location: 'header'
    },
    rate_limit: {
      requests_per_minute: 10,
      requests_per_hour: 100,
      requests_per_day: 500
    },
    headers: {
      'Accept': 'application/json'
    },
    parameters: [
      { name: 'start_date', type: 'string', required: true, description: 'Data inicial' },
      { name: 'end_date', type: 'string', required: true, description: 'Data final' },
      { name: 'metrics', type: 'array', required: false, description: 'Métricas a incluir' }
    ],
    response_format: 'json',
    cache_ttl: 3600,
    timeout: 60000,
    retry_attempts: 1,
    created_at: '2023-12-01T10:00:00Z',
    updated_at: '2023-12-15T10:00:00Z',
    last_used: '2024-01-01T10:00:00Z',
    usage_count: 234,
    success_rate: 94.2,
    avg_response_time: 1245
  }
];

const mockApiKeys: ApiKey[] = [
  {
    id: '1',
    name: 'Production API Key',
    description: 'Chave principal para ambiente de produção',
    key: 'pk_live_1234567890abcdef',
    type: 'admin',
    status: 'active',
    permissions: ['messages:read', 'messages:write', 'contacts:read', 'contacts:write', 'analytics:read'],
    rate_limit: {
      requests_per_minute: 1000,
      requests_per_hour: 10000,
      requests_per_day: 100000
    },
    allowed_ips: ['192.168.1.100', '10.0.0.50'],
    allowed_domains: ['app.convoflow.com', 'api.convoflow.com'],
    expires_at: '2024-12-31T23:59:59Z',
    created_at: '2024-01-01T10:00:00Z',
    last_used: '2024-01-03T15:30:00Z',
    usage_count: 25678
  },
  {
    id: '2',
    name: 'Development API Key',
    description: 'Chave para ambiente de desenvolvimento',
    key: 'pk_test_abcdef1234567890',
    type: 'write',
    status: 'active',
    permissions: ['messages:read', 'messages:write', 'contacts:read'],
    rate_limit: {
      requests_per_minute: 100,
      requests_per_hour: 1000,
      requests_per_day: 5000
    },
    allowed_ips: ['127.0.0.1', '192.168.1.0/24'],
    allowed_domains: ['localhost', 'dev.convoflow.com'],
    created_at: '2024-01-01T10:00:00Z',
    last_used: '2024-01-03T14:20:00Z',
    usage_count: 1234
  },
  {
    id: '3',
    name: 'Webhook API Key',
    description: 'Chave específica para webhooks',
    key: 'wh_1234567890abcdef',
    type: 'webhook',
    status: 'active',
    permissions: ['webhooks:receive'],
    rate_limit: {
      requests_per_minute: 2000,
      requests_per_hour: 20000,
      requests_per_day: 200000
    },
    allowed_ips: [],
    allowed_domains: [],
    created_at: '2024-01-02T10:00:00Z',
    last_used: '2024-01-03T15:45:00Z',
    usage_count: 45678
  },
  {
    id: '4',
    name: 'Read-only API Key',
    description: 'Chave apenas para leitura',
    key: 'pk_readonly_fedcba0987654321',
    type: 'read',
    status: 'inactive',
    permissions: ['messages:read', 'contacts:read', 'analytics:read'],
    rate_limit: {
      requests_per_minute: 200,
      requests_per_hour: 2000,
      requests_per_day: 10000
    },
    allowed_ips: [],
    allowed_domains: ['dashboard.convoflow.com'],
    expires_at: '2024-06-30T23:59:59Z',
    created_at: '2024-01-01T10:00:00Z',
    last_used: '2024-01-02T10:00:00Z',
    usage_count: 567
  }
];

const mockWebhooks: WebhookConfig[] = [
  {
    id: '1',
    name: 'Message Events',
    description: 'Recebe eventos de mensagens',
    url: 'https://app.example.com/webhooks/messages',
    events: ['message.received', 'message.sent', 'message.delivered', 'message.read'],
    status: 'active',
    secret: 'whsec_1234567890abcdef',
    headers: {
      'User-Agent': 'ConvoFlow-Webhook/1.0',
      'Content-Type': 'application/json'
    },
    retry_attempts: 3,
    timeout: 30000,
    created_at: '2024-01-01T10:00:00Z',
    last_triggered: '2024-01-03T15:45:00Z',
    success_count: 12456,
    failure_count: 23
  },
  {
    id: '2',
    name: 'Contact Events',
    description: 'Recebe eventos de contatos',
    url: 'https://crm.example.com/api/webhooks',
    events: ['contact.created', 'contact.updated', 'contact.deleted'],
    status: 'active',
    secret: 'whsec_abcdef1234567890',
    headers: {
      'Authorization': 'Bearer token123',
      'X-Source': 'ConvoFlow'
    },
    retry_attempts: 2,
    timeout: 15000,
    created_at: '2024-01-02T10:00:00Z',
    last_triggered: '2024-01-03T12:30:00Z',
    success_count: 3456,
    failure_count: 12
  },
  {
    id: '3',
    name: 'System Events',
    description: 'Eventos do sistema',
    url: 'https://monitoring.example.com/webhooks',
    events: ['system.error', 'system.warning', 'system.maintenance'],
    status: 'failed',
    secret: 'whsec_fedcba0987654321',
    headers: {},
    retry_attempts: 5,
    timeout: 10000,
    created_at: '2024-01-01T10:00:00Z',
    last_triggered: '2024-01-03T10:00:00Z',
    success_count: 234,
    failure_count: 45,
    last_error: 'Connection timeout after 10 seconds'
  }
];

const mockMetrics: ApiMetrics = {
  total_requests: 125678,
  successful_requests: 123456,
  failed_requests: 2222,
  avg_response_time: 187,
  requests_per_minute: 45,
  error_rate: 1.77,
  uptime_percentage: 99.95,
  last_24h_requests: 12456,
  peak_requests_per_minute: 234,
  most_used_endpoint: 'Send Message',
  slowest_endpoint: 'Analytics Report',
  fastest_endpoint: 'Webhook Events'
};

const getStatusBadge = (status: string) => {
  const variants = {
    active: 'bg-status-success/15 text-status-success',
    inactive: 'bg-muted text-muted-foreground',
    deprecated: 'bg-status-error/15 text-status-error',
    beta: 'bg-status-info/15 text-status-info',
    failed: 'bg-status-error/15 text-status-error',
    expired: 'bg-status-warning/15 text-status-warning',
    revoked: 'bg-status-error/15 text-status-error'
  };

  const labels = {
    active: 'Ativo',
    inactive: 'Inativo',
    deprecated: 'Descontinuado',
    beta: 'Beta',
    failed: 'Falhou',
    expired: 'Expirado',
    revoked: 'Revogado'
  };

  return (
    <Badge className={variants[status as keyof typeof variants]}>
      {labels[status as keyof typeof labels]}
    </Badge>
  );
};

const getMethodBadge = (method: string) => {
  const variants = {
    GET: 'bg-status-success/15 text-status-success',
    POST: 'bg-status-info/15 text-status-info',
    PUT: 'bg-status-warning/15 text-status-warning',
    DELETE: 'bg-status-error/15 text-status-error',
    PATCH: 'bg-accent/15 text-accent'
  };

  return (
    <Badge className={variants[method as keyof typeof variants]}>
      {method}
    </Badge>
  );
};

const EndpointCard = ({ endpoint, onEdit, onDelete, onTest }: {
  endpoint: ApiEndpoint;
  onEdit: (endpoint: ApiEndpoint) => void;
  onDelete: (id: string) => void;
  onTest: (endpoint: ApiEndpoint) => void;
}) => {
  const getSuccessRateColor = (rate: number) => {
    if (rate >= 99) return 'text-status-success';
    if (rate >= 95) return 'text-status-warning';
    return 'text-status-error';
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold">{endpoint.name}</h3>
                {getMethodBadge(endpoint.method)}
                {getStatusBadge(endpoint.status)}
              </div>
              <p className="text-sm text-muted-foreground">{endpoint.description}</p>
              <code className="text-xs bg-muted px-2 py-1 rounded mt-1 inline-block">
                {endpoint.method} {endpoint.url}
              </code>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Categoria:</span>
            <span className="ml-2 font-medium capitalize">{endpoint.category}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Versão:</span>
            <span className="ml-2 font-medium">{endpoint.version}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Uso:</span>
            <span className="ml-2 font-medium">{endpoint.usage_count.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Taxa de Sucesso:</span>
            <span className={`ml-2 font-medium ${getSuccessRateColor(endpoint.success_rate)}`}>
              {endpoint.success_rate.toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Tempo Médio:</span>
            <span className="ml-2 font-medium">{endpoint.avg_response_time}ms</span>
          </div>
          <div>
            <span className="text-muted-foreground">Rate Limit:</span>
            <span className="ml-2 font-medium">{endpoint.rate_limit.requests_per_minute}/min</span>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mb-4">
          Última utilização: {new Date(endpoint.last_used).toLocaleString()}
        </div>

        <Separator className="mb-4" />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => onTest(endpoint)}>
              <TestTube className="h-4 w-4 mr-1" />
              Testar
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(endpoint)}>
              <Edit className="h-4 w-4 mr-1" />
              Editar
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(endpoint.id)}
            className="text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const ApiKeyCard = ({ apiKey, onEdit, onDelete, onToggleStatus }: {
  apiKey: ApiKey;
  onEdit: (apiKey: ApiKey) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
}) => {
  const [showKey, setShowKey] = useState(false);
  const { toast } = useToast();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiKey.key);
    toast({
      title: "Chave copiada",
      description: "A chave da API foi copiada para a área de transferência"
    });
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return key;
    return key.substring(0, 8) + '•'.repeat(key.length - 12) + key.substring(key.length - 4);
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold">{apiKey.name}</h3>
                {getStatusBadge(apiKey.status)}
                <Badge variant="outline" className="capitalize">
                  {apiKey.type}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{apiKey.description}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex items-center space-x-2">
            <Label className="text-sm font-medium">Chave:</Label>
            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono">
              {showKey ? apiKey.key : maskKey(apiKey.key)}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={copyToClipboard}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Uso:</span>
            <span className="ml-2 font-medium">{apiKey.usage_count.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Rate Limit:</span>
            <span className="ml-2 font-medium">{apiKey.rate_limit.requests_per_minute}/min</span>
          </div>
          {apiKey.expires_at && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Expira em:</span>
              <span className="ml-2 font-medium">
                {new Date(apiKey.expires_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {apiKey.permissions.length > 0 && (
          <div className="mb-4">
            <Label className="text-sm font-medium mb-2 block">Permissões:</Label>
            <div className="flex flex-wrap gap-1">
              {apiKey.permissions.map((permission, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {permission}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground mb-4">
          {apiKey.last_used ? (
            <>Última utilização: {new Date(apiKey.last_used).toLocaleString()}</>
          ) : (
            'Nunca utilizada'
          )}
        </div>

        <Separator className="mb-4" />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleStatus(apiKey.id)}
            >
              {apiKey.status === 'active' ? (
                <>
                  <Lock className="h-4 w-4 mr-1" />
                  Desativar
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4 mr-1" />
                  Ativar
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(apiKey)}>
              <Edit className="h-4 w-4 mr-1" />
              Editar
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(apiKey.id)}
            className="text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const WebhookCard = ({ webhook, onEdit, onDelete, onTest, onToggleStatus }: {
  webhook: WebhookConfig;
  onEdit: (webhook: WebhookConfig) => void;
  onDelete: (id: string) => void;
  onTest: (webhook: WebhookConfig) => void;
  onToggleStatus: (id: string) => void;
}) => {
  const successRate = webhook.success_count + webhook.failure_count > 0 
    ? (webhook.success_count / (webhook.success_count + webhook.failure_count)) * 100 
    : 0;

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 99) return 'text-status-success';
    if (rate >= 95) return 'text-status-warning';
    return 'text-status-error';
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Webhook className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold">{webhook.name}</h3>
                {getStatusBadge(webhook.status)}
              </div>
              <p className="text-sm text-muted-foreground">{webhook.description}</p>
              <code className="text-xs bg-muted px-2 py-1 rounded mt-1 inline-block">
                {webhook.url}
              </code>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Sucessos:</span>
            <span className="ml-2 font-medium text-status-success">{webhook.success_count.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Falhas:</span>
            <span className="ml-2 font-medium text-status-error">{webhook.failure_count.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Taxa de Sucesso:</span>
            <span className={`ml-2 font-medium ${getSuccessRateColor(successRate)}`}>
              {successRate.toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Timeout:</span>
            <span className="ml-2 font-medium">{webhook.timeout / 1000}s</span>
          </div>
        </div>

        {webhook.events.length > 0 && (
          <div className="mb-4">
            <Label className="text-sm font-medium mb-2 block">Eventos:</Label>
            <div className="flex flex-wrap gap-1">
              {webhook.events.map((event, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {event}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {webhook.last_error && (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Último erro:</strong> {webhook.last_error}
            </AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-muted-foreground mb-4">
          {webhook.last_triggered ? (
            <>Último disparo: {new Date(webhook.last_triggered).toLocaleString()}</>
          ) : (
            'Nunca disparado'
          )}
        </div>

        <Separator className="mb-4" />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => onTest(webhook)}>
              <TestTube className="h-4 w-4 mr-1" />
              Testar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleStatus(webhook.id)}
            >
              {webhook.status === 'active' ? (
                <>
                  <PauseCircle className="h-4 w-4 mr-1" />
                  Pausar
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-1" />
                  Ativar
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(webhook)}>
              <Edit className="h-4 w-4 mr-1" />
              Editar
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(webhook.id)}
            className="text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const EndpointsList = () => {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>(mockEndpoints);
  const [filter, setFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const filteredEndpoints = endpoints.filter(endpoint => {
    const matchesSearch = endpoint.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         endpoint.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         endpoint.url.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filter === 'all' || endpoint.status === filter;
    const matchesCategory = categoryFilter === 'all' || endpoint.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const handleEdit = (endpoint: ApiEndpoint) => {
    toast({
      title: "Editar endpoint",
      description: `Editando ${endpoint.name}`
    });
  };

  const handleDelete = (id: string) => {
    setEndpoints(prev => prev.filter(e => e.id !== id));
    toast({
      title: "Endpoint removido",
      description: "O endpoint foi removido com sucesso"
    });
  };

  const handleTest = (endpoint: ApiEndpoint) => {
    toast({
      title: "Testando endpoint",
      description: `Enviando requisição de teste para ${endpoint.name}`
    });
  };

  const categories = [...new Set(endpoints.map(e => e.category))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <Input
              placeholder="Buscar endpoints..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
              <SelectItem value="deprecated">Descontinuado</SelectItem>
              <SelectItem value="beta">Beta</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredEndpoints.map((endpoint) => (
          <EndpointCard
            key={endpoint.id}
            endpoint={endpoint}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onTest={handleTest}
          />
        ))}
      </div>

      {filteredEndpoints.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum endpoint encontrado</h3>
            <p className="text-muted-foreground">
              {searchTerm ? 
                'Nenhum endpoint corresponde aos filtros aplicados.' :
                'Você ainda não configurou nenhum endpoint.'
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const ApiKeysList = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(mockApiKeys);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const filteredApiKeys = apiKeys.filter(apiKey => {
    const matchesSearch = apiKey.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         apiKey.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filter === 'all' || apiKey.status === filter;
    return matchesSearch && matchesStatus;
  });

  const handleEdit = (apiKey: ApiKey) => {
    toast({
      title: "Editar chave da API",
      description: `Editando ${apiKey.name}`
    });
  };

  const handleDelete = (id: string) => {
    setApiKeys(prev => prev.filter(k => k.id !== id));
    toast({
      title: "Chave removida",
      description: "A chave da API foi removida com sucesso"
    });
  };

  const handleToggleStatus = (id: string) => {
    setApiKeys(prev => prev.map(key => {
      if (key.id === id) {
        const newStatus = key.status === 'active' ? 'inactive' : 'active';
        return { ...key, status: newStatus };
      }
      return key;
    }));
    
    const apiKey = apiKeys.find(k => k.id === id);
    const action = apiKey?.status === 'active' ? 'desativada' : 'ativada';
    
    toast({
      title: "Status atualizado",
      description: `Chave da API ${action} com sucesso`
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <Input
              placeholder="Buscar chaves da API..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nova Chave
          </Button>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
              <SelectItem value="expired">Expirado</SelectItem>
              <SelectItem value="revoked">Revogado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {filteredApiKeys.map((apiKey) => (
          <ApiKeyCard
            key={apiKey.id}
            apiKey={apiKey}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleStatus={handleToggleStatus}
          />
        ))}
      </div>

      {filteredApiKeys.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma chave encontrada</h3>
            <p className="text-muted-foreground">
              {searchTerm ? 
                'Nenhuma chave corresponde aos filtros aplicados.' :
                'Você ainda não criou nenhuma chave da API.'
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const WebhooksList = () => {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>(mockWebhooks);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const filteredWebhooks = webhooks.filter(webhook => {
    const matchesSearch = webhook.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         webhook.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         webhook.url.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filter === 'all' || webhook.status === filter;
    return matchesSearch && matchesStatus;
  });

  const handleEdit = (webhook: WebhookConfig) => {
    toast({
      title: "Editar webhook",
      description: `Editando ${webhook.name}`
    });
  };

  const handleDelete = (id: string) => {
    setWebhooks(prev => prev.filter(w => w.id !== id));
    toast({
      title: "Webhook removido",
      description: "O webhook foi removido com sucesso"
    });
  };

  const handleTest = (webhook: WebhookConfig) => {
    toast({
      title: "Testando webhook",
      description: `Enviando evento de teste para ${webhook.name}`
    });
  };

  const handleToggleStatus = (id: string) => {
    setWebhooks(prev => prev.map(webhook => {
      if (webhook.id === id) {
        const newStatus = webhook.status === 'active' ? 'inactive' : 'active';
        return { ...webhook, status: newStatus };
      }
      return webhook;
    }));
    
    const webhook = webhooks.find(w => w.id === id);
    const action = webhook?.status === 'active' ? 'pausado' : 'ativado';
    
    toast({
      title: "Status atualizado",
      description: `Webhook ${action} com sucesso`
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <Input
              placeholder="Buscar webhooks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Novo Webhook
          </Button>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
              <SelectItem value="failed">Falhou</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {filteredWebhooks.map((webhook) => (
          <WebhookCard
            key={webhook.id}
            webhook={webhook}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onTest={handleTest}
            onToggleStatus={handleToggleStatus}
          />
        ))}
      </div>

      {filteredWebhooks.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Webhook className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum webhook encontrado</h3>
            <p className="text-muted-foreground">
              {searchTerm ? 
                'Nenhum webhook corresponde aos filtros aplicados.' :
                'Você ainda não configurou nenhum webhook.'
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const ApiMetrics = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-status-info/15 rounded-lg">
                <Activity className="h-6 w-6 text-status-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Requisições</p>
                <p className="text-2xl font-bold">{mockMetrics.total_requests.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-status-success/15 rounded-lg">
                <CheckCircle className="h-6 w-6 text-status-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Sucesso</p>
                <p className="text-2xl font-bold">{(100 - mockMetrics.error_rate).toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-accent/15 rounded-lg">
                <Clock className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tempo Médio</p>
                <p className="text-2xl font-bold">{mockMetrics.avg_response_time}ms</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-primary/15 rounded-lg">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Uptime</p>
                <p className="text-2xl font-bold">{mockMetrics.uptime_percentage.toFixed(2)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Estatísticas de Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Requisições por minuto</span>
                <span className="font-semibold">{mockMetrics.requests_per_minute}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Pico de requisições/min</span>
                <span className="font-semibold">{mockMetrics.peak_requests_per_minute}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Últimas 24h</span>
                <span className="font-semibold">{mockMetrics.last_24h_requests.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Taxa de erro</span>
                <span className="font-semibold text-status-error">{mockMetrics.error_rate.toFixed(2)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Endpoints Mais Utilizados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Mais usado</span>
                <span className="font-semibold">{mockMetrics.most_used_endpoint}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Mais lento</span>
                <span className="font-semibold text-status-error">{mockMetrics.slowest_endpoint}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Mais rápido</span>
                <span className="font-semibold text-status-success">{mockMetrics.fastest_endpoint}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Alertas e Notificações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Todos os sistemas estão funcionando normalmente. Última verificação: {new Date().toLocaleTimeString()}
              </AlertDescription>
            </Alert>
            
            {mockMetrics.error_rate > 5 && (
              <Alert className="border-status-error/30 bg-status-error/10">
                <AlertTriangle className="h-4 w-4 text-status-error" />
                <AlertDescription className="text-status-error">
                  Taxa de erro elevada detectada ({mockMetrics.error_rate.toFixed(2)}%). Verifique os logs para mais detalhes.
                </AlertDescription>
              </Alert>
            )}

            {mockMetrics.avg_response_time > 1000 && (
              <Alert className="border-status-warning/30 bg-status-warning/10">
                <Clock className="h-4 w-4 text-status-warning" />
                <AlertDescription className="text-status-warning">
                  Tempo de resposta elevado detectado ({mockMetrics.avg_response_time}ms). Considere otimizar os endpoints.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const ApiDocumentation = () => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Endpoints Disponíveis</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              <div className="space-y-2">
                {mockEndpoints.map((endpoint) => (
                  <div
                    key={endpoint.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedEndpoint?.id === endpoint.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedEndpoint(endpoint)}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      {getMethodBadge(endpoint.method)}
                      <span className="font-medium text-sm">{endpoint.name}</span>
                    </div>
                    <code className="text-xs text-muted-foreground">{endpoint.url}</code>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Documentação da API</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedEndpoint ? (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    {getMethodBadge(selectedEndpoint.method)}
                    <h3 className="text-lg font-semibold">{selectedEndpoint.name}</h3>
                    {getStatusBadge(selectedEndpoint.status)}
                  </div>
                  <p className="text-muted-foreground mb-4">{selectedEndpoint.description}</p>
                  <code className="bg-muted px-3 py-2 rounded block">
                    {selectedEndpoint.method} {selectedEndpoint.url}
                  </code>
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="font-semibold mb-3">Autenticação</h4>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Tipo:</span>
                        <span className="ml-2 font-medium capitalize">{selectedEndpoint.authentication.type}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Obrigatório:</span>
                        <span className="ml-2 font-medium">
                          {selectedEndpoint.authentication.required ? 'Sim' : 'Não'}
                        </span>
                      </div>
                      {selectedEndpoint.authentication.location && (
                        <div>
                          <span className="text-muted-foreground">Localização:</span>
                          <span className="ml-2 font-medium capitalize">{selectedEndpoint.authentication.location}</span>
                        </div>
                      )}
                      {selectedEndpoint.authentication.key_name && (
                        <div>
                          <span className="text-muted-foreground">Nome da Chave:</span>
                          <span className="ml-2 font-medium">{selectedEndpoint.authentication.key_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="font-semibold mb-3">Parâmetros</h4>
                  {selectedEndpoint.parameters.length > 0 ? (
                    <div className="space-y-3">
                      {selectedEndpoint.parameters.map((param, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex items-center space-x-2 mb-2">
                            <code className="bg-muted px-2 py-1 rounded text-sm">{param.name}</code>
                            <Badge variant="outline" className="text-xs">{param.type}</Badge>
                            {param.required && (
                              <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
                            )}
                          </div>
                          {param.description && (
                            <p className="text-sm text-muted-foreground mb-2">{param.description}</p>
                          )}
                          {param.default_value !== undefined && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Valor padrão:</span>
                              <code className="ml-2 bg-muted px-2 py-1 rounded">
                                {JSON.stringify(param.default_value)}
                              </code>
                            </div>
                          )}
                          {param.validation && (
                            <div className="text-sm mt-2">
                              <span className="text-muted-foreground">Validação:</span>
                              <div className="ml-2 space-y-1">
                                {param.validation.min !== undefined && (
                                  <div>Mínimo: {param.validation.min}</div>
                                )}
                                {param.validation.max !== undefined && (
                                  <div>Máximo: {param.validation.max}</div>
                                )}
                                {param.validation.pattern && (
                                  <div>Padrão: <code>{param.validation.pattern}</code></div>
                                )}
                                {param.validation.enum && (
                                  <div>Valores permitidos: {param.validation.enum.join(', ')}</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Nenhum parâmetro necessário.</p>
                  )}
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="font-semibold mb-3">Rate Limiting</h4>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Por minuto:</span>
                        <span className="ml-2 font-medium">{selectedEndpoint.rate_limit.requests_per_minute}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Por hora:</span>
                        <span className="ml-2 font-medium">{selectedEndpoint.rate_limit.requests_per_hour}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Por dia:</span>
                        <span className="ml-2 font-medium">{selectedEndpoint.rate_limit.requests_per_day}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="font-semibold mb-3">Configurações</h4>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Formato de resposta:</span>
                        <span className="ml-2 font-medium uppercase">{selectedEndpoint.response_format}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Timeout:</span>
                        <span className="ml-2 font-medium">{selectedEndpoint.timeout / 1000}s</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cache TTL:</span>
                        <span className="ml-2 font-medium">{selectedEndpoint.cache_ttl}s</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tentativas:</span>
                        <span className="ml-2 font-medium">{selectedEndpoint.retry_attempts}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="font-semibold mb-3">Headers Padrão</h4>
                  {Object.keys(selectedEndpoint.headers).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(selectedEndpoint.headers).map(([key, value]) => (
                        <div key={key} className="flex items-center space-x-2">
                          <code className="bg-muted px-2 py-1 rounded text-sm">{key}</code>
                          <span>:</span>
                          <code className="bg-muted px-2 py-1 rounded text-sm">{value}</code>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Nenhum header padrão configurado.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Selecione um endpoint</h3>
                <p className="text-muted-foreground">
                  Escolha um endpoint da lista ao lado para ver sua documentação completa.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default function ApiSettings() {
  const { toast } = useToast();
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configurações da API</h1>
          <p className="text-muted-foreground">
            Gerencie endpoints, chaves de API, webhooks e monitore o desempenho
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="endpoints" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="keys">Chaves da API</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="docs">Documentação</TabsTrigger>
        </TabsList>
        
        <TabsContent value="endpoints">
          <EndpointsList />
        </TabsContent>
        
        <TabsContent value="keys">
          <ApiKeysList />
        </TabsContent>
        
        <TabsContent value="webhooks">
          <WebhooksList />
        </TabsContent>
        
        <TabsContent value="metrics">
          <ApiMetrics />
        </TabsContent>
        
        <TabsContent value="docs">
          <ApiDocumentation />
        </TabsContent>
      </Tabs>
    </div>
  );
}
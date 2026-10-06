import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  User,
  Edit,
  Trash2,
  Plus,
  Eye,
  Settings,
  MessageSquare,
  Users,
  Database,
  Shield,
  Clock,
  MapPin,
  Smartphone,
  Monitor,
  Calendar,
  FileText,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useToast } from '@/hooks/use-toast';

interface AuditEntry {
  id: string;
  timestamp: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatar?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  resource_name?: string;
  old_values?: any;
  new_values?: any;
  ip_address: string;
  user_agent: string;
  session_id: string;
  location?: {
    country: string;
    city: string;
    region: string;
  };
  device_info?: {
    type: 'desktop' | 'mobile' | 'tablet';
    os: string;
    browser: string;
  };
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  success: boolean;
  error_message?: string;
}

interface AuditFilter {
  user_id?: string;
  action?: string;
  resource_type?: string;
  risk_level?: string;
  success?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

const mockAuditEntries: AuditEntry[] = [
  {
    id: '1',
    timestamp: new Date().toISOString(),
    user_id: 'user_123',
    user_name: 'João Silva',
    user_email: 'joao@example.com',
    user_avatar: 'https://github.com/shadcn.png',
    action: 'create',
    resource_type: 'contact',
    resource_id: 'contact_456',
    resource_name: 'Maria Santos',
    new_values: { name: 'Maria Santos', phone: '+5511999999999', email: 'maria@example.com' },
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    session_id: 'session_789',
    location: { country: 'Brasil', city: 'São Paulo', region: 'SP' },
    device_info: { type: 'desktop', os: 'Windows 10', browser: 'Chrome' },
    risk_level: 'low',
    success: true
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    user_id: 'user_456',
    user_name: 'Ana Costa',
    user_email: 'ana@example.com',
    action: 'update',
    resource_type: 'campaign',
    resource_id: 'campaign_789',
    resource_name: 'Campanha Black Friday',
    old_values: { status: 'draft', scheduled_at: null },
    new_values: { status: 'scheduled', scheduled_at: '2024-01-15T10:00:00Z' },
    ip_address: '192.168.1.101',
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    session_id: 'session_abc',
    location: { country: 'Brasil', city: 'Rio de Janeiro', region: 'RJ' },
    device_info: { type: 'mobile', os: 'iOS 17', browser: 'Safari' },
    risk_level: 'medium',
    success: true
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    user_id: 'user_789',
    user_name: 'Carlos Oliveira',
    user_email: 'carlos@example.com',
    action: 'delete',
    resource_type: 'automation_flow',
    resource_id: 'flow_123',
    resource_name: 'Fluxo de Boas-vindas',
    old_values: { name: 'Fluxo de Boas-vindas', active: true, steps: 5 },
    ip_address: '192.168.1.102',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    session_id: 'session_def',
    location: { country: 'Brasil', city: 'Belo Horizonte', region: 'MG' },
    device_info: { type: 'desktop', os: 'macOS', browser: 'Safari' },
    risk_level: 'high',
    success: true
  },
  {
    id: '4',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    user_id: 'user_123',
    user_name: 'João Silva',
    user_email: 'joao@example.com',
    action: 'login_failed',
    resource_type: 'auth',
    ip_address: '203.0.113.1',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64)',
    session_id: 'session_ghi',
    location: { country: 'Desconhecido', city: 'Desconhecido', region: 'Desconhecido' },
    device_info: { type: 'desktop', os: 'Linux', browser: 'Firefox' },
    risk_level: 'critical',
    success: false,
    error_message: 'Tentativa de login com credenciais inválidas'
  },
  {
    id: '5',
    timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    user_id: 'user_456',
    user_name: 'Ana Costa',
    user_email: 'ana@example.com',
    action: 'view',
    resource_type: 'report',
    resource_id: 'report_456',
    resource_name: 'Relatório de Vendas',
    ip_address: '192.168.1.101',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    session_id: 'session_jkl',
    location: { country: 'Brasil', city: 'Rio de Janeiro', region: 'RJ' },
    device_info: { type: 'desktop', os: 'Windows 10', browser: 'Edge' },
    risk_level: 'low',
    success: true
  },
  {
    id: '6',
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    user_id: 'user_789',
    user_name: 'Carlos Oliveira',
    user_email: 'carlos@example.com',
    action: 'export',
    resource_type: 'contacts',
    resource_name: 'Lista de Contatos',
    new_values: { format: 'csv', total_records: 1250 },
    ip_address: '192.168.1.102',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    session_id: 'session_mno',
    location: { country: 'Brasil', city: 'Belo Horizonte', region: 'MG' },
    device_info: { type: 'desktop', os: 'macOS', browser: 'Chrome' },
    risk_level: 'medium',
    success: true
  }
];

const getActionIcon = (action: string) => {
  switch (action) {
    case 'create':
      return <Plus className="h-4 w-4" />;
    case 'update':
    case 'edit':
      return <Edit className="h-4 w-4" />;
    case 'delete':
      return <Trash2 className="h-4 w-4" />;
    case 'view':
      return <Eye className="h-4 w-4" />;
    case 'login':
    case 'login_failed':
      return <User className="h-4 w-4" />;
    case 'export':
      return <Download className="h-4 w-4" />;
    case 'settings':
      return <Settings className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
};

const getActionColor = (action: string, success: boolean) => {
  if (!success) return 'bg-status-error/10 text-status-error border-status-error/30';

  switch (action) {
    case 'create':
      return 'bg-status-success/10 text-status-success border-status-success/30';
    case 'update':
    case 'edit':
      return 'bg-status-info/10 text-status-info border-status-info/30';
    case 'delete':
      return 'bg-status-error/10 text-status-error border-status-error/30';
    case 'view':
      return 'bg-muted text-muted-foreground border-border';
    case 'export':
      return 'bg-accent/10 text-accent border-accent/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

const getRiskLevelColor = (level: string) => {
  switch (level) {
    case 'critical':
      return 'bg-status-error/15 text-status-error';
    case 'high':
      return 'bg-status-warning/15 text-status-warning';
    case 'medium':
      return 'bg-status-warning/10 text-status-warning';
    case 'low':
      return 'bg-status-success/15 text-status-success';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getDeviceIcon = (type: string) => {
  switch (type) {
    case 'mobile':
      return <Smartphone className="h-4 w-4" />;
    case 'tablet':
      return <Smartphone className="h-4 w-4" />;
    case 'desktop':
      return <Monitor className="h-4 w-4" />;
    default:
      return <Monitor className="h-4 w-4" />;
  }
};

const AuditEntry = ({ entry, onViewDetails }: { entry: AuditEntry; onViewDetails: (entry: AuditEntry) => void }) => {
  return (
    <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={entry.user_avatar} />
              <AvatarFallback>
                {entry.user_name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium text-sm">{entry.user_name}</div>
              <div className="text-xs text-muted-foreground">{entry.user_email}</div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 mb-2">
            <Badge className={getActionColor(entry.action, entry.success)}>
              {getActionIcon(entry.action)}
              <span className="ml-1 capitalize">{entry.action.replace('_', ' ')}</span>
            </Badge>
            <Badge variant="outline">
              <span className="capitalize">{entry.resource_type.replace('_', ' ')}</span>
            </Badge>
            <Badge className={getRiskLevelColor(entry.risk_level)}>
              <Shield className="h-3 w-3 mr-1" />
              {entry.risk_level.toUpperCase()}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {format(new Date(entry.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
            </span>
          </div>
          
          <div className="mb-2">
            {entry.resource_name && (
              <p className="text-sm font-medium">
                {entry.action === 'create' && 'Criou: '}
                {entry.action === 'update' && 'Atualizou: '}
                {entry.action === 'delete' && 'Deletou: '}
                {entry.action === 'view' && 'Visualizou: '}
                {entry.action === 'export' && 'Exportou: '}
                {entry.resource_name}
              </p>
            )}
            {entry.error_message && (
              <p className="text-sm text-status-error">{entry.error_message}</p>
            )}
          </div>
          
          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
            <div className="flex items-center space-x-1">
              <MapPin className="h-3 w-3" />
              <span>{entry.location?.city}, {entry.location?.region}</span>
            </div>
            <div className="flex items-center space-x-1">
              {getDeviceIcon(entry.device_info?.type || 'desktop')}
              <span>{entry.device_info?.os} - {entry.device_info?.browser}</span>
            </div>
            <span>IP: {entry.ip_address}</span>
          </div>
        </div>
        
        <Button variant="outline" size="sm" onClick={() => onViewDetails(entry)}>
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const AuditFilters = ({ filters, onFiltersChange }: { 
  filters: AuditFilter; 
  onFiltersChange: (filters: AuditFilter) => void; 
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Filter className="h-5 w-5" />
          <span>Filtros de Auditoria</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="search">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Buscar usuário, ação..."
                value={filters.search || ''}
                onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
                className="pl-10"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="action">Ação</Label>
            <Select value={filters.action || 'all'} onValueChange={(value) => onFiltersChange({ ...filters, action: value === 'all' ? undefined : value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="create">Criar</SelectItem>
                <SelectItem value="update">Atualizar</SelectItem>
                <SelectItem value="delete">Deletar</SelectItem>
                <SelectItem value="view">Visualizar</SelectItem>
                <SelectItem value="export">Exportar</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="login_failed">Login Falhado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="resource">Recurso</Label>
            <Select value={filters.resource_type || 'all'} onValueChange={(value) => onFiltersChange({ ...filters, resource_type: value === 'all' ? undefined : value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="contact">Contatos</SelectItem>
                <SelectItem value="campaign">Campanhas</SelectItem>
                <SelectItem value="automation_flow">Automações</SelectItem>
                <SelectItem value="report">Relatórios</SelectItem>
                <SelectItem value="auth">Autenticação</SelectItem>
                <SelectItem value="settings">Configurações</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="risk">Nível de Risco</Label>
            <Select value={filters.risk_level || 'all'} onValueChange={(value) => onFiltersChange({ ...filters, risk_level: value === 'all' ? undefined : value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="low">Baixo</SelectItem>
                <SelectItem value="medium">Médio</SelectItem>
                <SelectItem value="high">Alto</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <Label htmlFor="dateFrom">Data Inicial</Label>
            <Input
              id="dateFrom"
              type="datetime-local"
              value={filters.dateFrom ? format(filters.dateFrom, "yyyy-MM-dd'T'HH:mm") : ''}
              onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value ? new Date(e.target.value) : undefined })}
            />
          </div>
          
          <div>
            <Label htmlFor="dateTo">Data Final</Label>
            <Input
              id="dateTo"
              type="datetime-local"
              value={filters.dateTo ? format(filters.dateTo, "yyyy-MM-dd'T'HH:mm") : ''}
              onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value ? new Date(e.target.value) : undefined })}
            />
          </div>
          
          <div>
            <Label htmlFor="success">Status</Label>
            <Select value={filters.success?.toString() || 'all'} onValueChange={(value) => onFiltersChange({ ...filters, success: value === 'all' ? undefined : value === 'true' })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="true">Sucesso</SelectItem>
                <SelectItem value="false">Falha</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const AuditDetails = ({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) => {
  if (!entry) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Detalhes da Auditoria</CardTitle>
          <Button variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>ID da Entrada</Label>
            <Input value={entry.id} readOnly />
          </div>
          <div>
            <Label>Timestamp</Label>
            <Input value={format(new Date(entry.timestamp), 'dd/MM/yyyy HH:mm:ss.SSS', { locale: ptBR })} readOnly />
          </div>
          <div>
            <Label>Usuário</Label>
            <div className="flex items-center space-x-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={entry.user_avatar} />
                <AvatarFallback>
                  {entry.user_name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <span>{entry.user_name} ({entry.user_email})</span>
            </div>
          </div>
          <div>
            <Label>Ação</Label>
            <div className="flex items-center space-x-2">
              <Badge className={getActionColor(entry.action, entry.success)}>
                {getActionIcon(entry.action)}
                <span className="ml-1 capitalize">{entry.action.replace('_', ' ')}</span>
              </Badge>
            </div>
          </div>
          <div>
            <Label>Tipo de Recurso</Label>
            <Input value={entry.resource_type.replace('_', ' ')} readOnly />
          </div>
          {entry.resource_name && (
            <div>
              <Label>Nome do Recurso</Label>
              <Input value={entry.resource_name} readOnly />
            </div>
          )}
          <div>
            <Label>Nível de Risco</Label>
            <div className="flex items-center space-x-2">
              <Badge className={getRiskLevelColor(entry.risk_level)}>
                <Shield className="h-3 w-3 mr-1" />
                {entry.risk_level.toUpperCase()}
              </Badge>
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Badge className={entry.success ? 'bg-status-success/15 text-status-success' : 'bg-status-error/15 text-status-error'}>
              {entry.success ? 'Sucesso' : 'Falha'}
            </Badge>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Endereço IP</Label>
            <Input value={entry.ip_address} readOnly />
          </div>
          <div>
            <Label>ID da Sessão</Label>
            <Input value={entry.session_id} readOnly />
          </div>
          {entry.location && (
            <div>
              <Label>Localização</Label>
              <Input value={`${entry.location.city}, ${entry.location.region}, ${entry.location.country}`} readOnly />
            </div>
          )}
          {entry.device_info && (
            <div>
              <Label>Dispositivo</Label>
              <Input value={`${entry.device_info.type} - ${entry.device_info.os} (${entry.device_info.browser})`} readOnly />
            </div>
          )}
        </div>
        
        <div>
          <Label>User Agent</Label>
          <Textarea value={entry.user_agent} readOnly rows={2} />
        </div>
        
        {entry.error_message && (
          <div>
            <Label>Mensagem de Erro</Label>
            <Textarea value={entry.error_message} readOnly rows={2} className="text-status-error" />
          </div>
        )}
        
        {entry.old_values && (
          <div>
            <Label>Valores Anteriores (JSON)</Label>
            <Textarea 
              value={JSON.stringify(entry.old_values, null, 2)} 
              readOnly 
              rows={6}
              className="font-mono text-sm"
            />
          </div>
        )}
        
        {entry.new_values && (
          <div>
            <Label>Novos Valores (JSON)</Label>
            <Textarea 
              value={JSON.stringify(entry.new_values, null, 2)} 
              readOnly 
              rows={6}
              className="font-mono text-sm"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const AuditStats = () => {
  const stats = {
    total: mockAuditEntries.length,
    successful: mockAuditEntries.filter(e => e.success).length,
    failed: mockAuditEntries.filter(e => !e.success).length,
    critical: mockAuditEntries.filter(e => e.risk_level === 'critical').length,
    high: mockAuditEntries.filter(e => e.risk_level === 'high').length,
    users: new Set(mockAuditEntries.map(e => e.user_id)).size
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-status-success">{stats.successful}</div>
          <div className="text-sm text-muted-foreground">Sucessos</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-status-error">{stats.failed}</div>
          <div className="text-sm text-muted-foreground">Falhas</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-status-error">{stats.critical}</div>
          <div className="text-sm text-muted-foreground">Críticos</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-status-warning">{stats.high}</div>
          <div className="text-sm text-muted-foreground">Alto Risco</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-status-info">{stats.users}</div>
          <div className="text-sm text-muted-foreground">Usuários</div>
        </CardContent>
      </Card>
    </div>
  );
};

export const AuditTrail = () => {
  const [filters, setFilters] = useState<AuditFilter>({
    dateFrom: startOfDay(subDays(new Date(), 7)),
    dateTo: endOfDay(new Date())
  });
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [filteredEntries, setFilteredEntries] = useState<AuditEntry[]>(mockAuditEntries);
  const { toast } = useToast();

  useEffect(() => {
    let filtered = mockAuditEntries;

    if (filters.action) {
      filtered = filtered.filter(entry => entry.action === filters.action);
    }

    if (filters.resource_type) {
      filtered = filtered.filter(entry => entry.resource_type === filters.resource_type);
    }

    if (filters.risk_level) {
      filtered = filtered.filter(entry => entry.risk_level === filters.risk_level);
    }

    if (filters.success !== undefined) {
      filtered = filtered.filter(entry => entry.success === filters.success);
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(entry => 
        entry.user_name.toLowerCase().includes(search) ||
        entry.user_email.toLowerCase().includes(search) ||
        entry.action.toLowerCase().includes(search) ||
        entry.resource_type.toLowerCase().includes(search) ||
        (entry.resource_name && entry.resource_name.toLowerCase().includes(search))
      );
    }

    if (filters.dateFrom) {
      filtered = filtered.filter(entry => new Date(entry.timestamp) >= filters.dateFrom!);
    }

    if (filters.dateTo) {
      filtered = filtered.filter(entry => new Date(entry.timestamp) <= filters.dateTo!);
    }

    if (filters.user_id) {
      filtered = filtered.filter(entry => entry.user_id === filters.user_id);
    }

    setFilteredEntries(filtered);
  }, [filters]);

  const handleExportAudit = () => {
    const csvContent = [
      ['Timestamp', 'User', 'Action', 'Resource Type', 'Resource Name', 'Risk Level', 'Success', 'IP Address', 'Location'].join(','),
      ...filteredEntries.map(entry => [
        entry.timestamp,
        `"${entry.user_name} (${entry.user_email})"`,
        entry.action,
        entry.resource_type,
        entry.resource_name || '',
        entry.risk_level,
        entry.success ? 'Yes' : 'No',
        entry.ip_address,
        entry.location ? `"${entry.location.city}, ${entry.location.region}"` : ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_trail_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Auditoria exportada",
      description: "O relatório de auditoria foi exportado com sucesso"
    });
  };

  const handleRefresh = () => {
    toast({
      title: "Auditoria atualizada",
      description: "Os dados de auditoria foram atualizados com sucesso"
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Trilha de Auditoria</h2>
          <p className="text-muted-foreground">
            Monitore e rastreie todas as ações dos usuários no sistema
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button onClick={handleExportAudit}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      <AuditStats />

      <Tabs defaultValue="entries" className="space-y-6">
        <TabsList>
          <TabsTrigger value="entries">Entradas</TabsTrigger>
          <TabsTrigger value="analytics">Análise</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="space-y-6">
          <AuditFilters filters={filters} onFiltersChange={setFilters} />
          
          {selectedEntry && (
            <AuditDetails entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
          )}
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Entradas de Auditoria ({filteredEntries.length})</CardTitle>
                <Badge variant="outline">
                  Últimos 7 dias
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredEntries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma entrada de auditoria encontrada com os filtros aplicados
                  </div>
                ) : (
                  filteredEntries.map((entry) => (
                    <AuditEntry 
                      key={entry.id} 
                      entry={entry} 
                      onViewDetails={setSelectedEntry}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Ações por Tipo (7 dias)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {['create', 'update', 'delete', 'view', 'export', 'login'].map((action) => {
                    const count = mockAuditEntries.filter(e => e.action === action).length;
                    const percentage = (count / mockAuditEntries.length) * 100;
                    return (
                      <div key={action} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {getActionIcon(action)}
                          <span className="capitalize">{action.replace('_', ' ')}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-24 bg-muted rounded-full h-2">
                            <div
                              className="bg-status-info h-2 rounded-full"
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium">{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Níveis de Risco (7 dias)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {['low', 'medium', 'high', 'critical'].map((level) => {
                    const count = mockAuditEntries.filter(e => e.risk_level === level).length;
                    const percentage = (count / mockAuditEntries.length) * 100;
                    return (
                      <div key={level} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Shield className="h-4 w-4" />
                          <span className="capitalize">{level}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-24 bg-muted rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                level === 'critical' ? 'bg-status-error' :
                                level === 'high' ? 'bg-status-warning' :
                                level === 'medium' ? 'bg-status-warning' : 'bg-status-success'
                              }`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium">{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Alertas de segurança e atividades suspeitas serão exibidos aqui.
            </AlertDescription>
          </Alert>
          
          <div className="grid grid-cols-1 gap-4">
            {mockAuditEntries.filter(e => e.risk_level === 'critical' || !e.success).map((entry) => (
              <Alert key={entry.id} className="border-status-error/30">
                <AlertTriangle className="h-4 w-4 text-status-error" />
                <AlertDescription>
                  <div className="flex items-center justify-between">
                    <div>
                      <strong>{entry.user_name}</strong> - {entry.action.replace('_', ' ')} 
                      {entry.resource_name && ` (${entry.resource_name})`}
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(new Date(entry.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })} - 
                        IP: {entry.ip_address}
                      </div>
                    </div>
                    <Badge className={getRiskLevelColor(entry.risk_level)}>
                      {entry.risk_level.toUpperCase()}
                    </Badge>
                  </div>
                </AlertDescription>
              </Alert>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
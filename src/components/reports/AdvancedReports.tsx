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
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Checkbox } from '@/components/ui/checkbox';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import {
  FileText,
  Download,
  Share2,
  Calendar,
  Filter,
  TrendingUp,
  TrendingDown,
  Users,
  MessageSquare,
  Phone,
  Mail,
  Target,
  Clock,
  DollarSign,
  Percent,
  Eye,
  Settings,
  RefreshCw,
  Save,
  Plus,
  Edit,
  Trash2,
  Copy,
  ExternalLink,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Zap,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info
} from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';
import { 
  useReportTemplates, 
  useReportData, 
  useGenerateReport,
  useCreateReportTemplate,
  useUpdateReportTemplate,
  useDeleteReportTemplate,
  useReportStatistics
} from '@/hooks/useReports';
import { DashboardCardSkeleton } from '@/components/shared/Skeleton';

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'chart' | 'table' | 'metric' | 'dashboard';
  config: ReportConfig;
  created_at: string;
  updated_at: string;
  created_by: string;
  is_public: boolean;
  usage_count: number;
}

interface ReportConfig {
  data_source: string;
  metrics: string[];
  dimensions: string[];
  filters: ReportFilter[];
  chart_type?: 'bar' | 'line' | 'pie' | 'area' | 'table';
  time_range: {
    type: 'relative' | 'absolute';
    value: string;
    start_date?: string;
    end_date?: string;
  };
  grouping?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

interface ReportFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'between' | 'in' | 'not_in';
  value: any;
}

interface ReportData {
  id: string;
  name: string;
  data: any[];
  metadata: {
    total_records: number;
    generated_at: string;
    execution_time: number;
    data_freshness: string;
  };
}

// Templates padrão para fallback quando não há dados
const defaultTemplates: ReportTemplate[] = [
  {
    id: 'default-1',
    name: 'Conversões por Canal',
    description: 'Análise de conversões por canal de comunicação',
    category: 'Conversões',
    type: 'chart',
    config: {
      data_source: 'conversations',
      metrics: ['conversion_rate', 'total_conversions'],
      dimensions: ['channel'],
      filters: [],
      chart_type: 'bar',
      time_range: { type: 'relative', value: '30d' },
      grouping: 'day'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'Sistema',
    is_public: true,
    usage_count: 0
  },
  {
    id: 'default-2',
    name: 'Performance de Campanhas',
    description: 'Métricas de performance das campanhas de marketing',
    category: 'Campanhas',
    type: 'dashboard',
    config: {
      data_source: 'campaigns',
      metrics: ['open_rate', 'click_rate', 'conversion_rate', 'roi'],
      dimensions: ['campaign_name', 'campaign_type'],
      filters: [],
      time_range: { type: 'relative', value: '7d' },
      grouping: 'day'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'Sistema',
    is_public: true,
    usage_count: 0
  }
];

// Dados mockados para os relatórios
const mockReportData = {
  conversions_by_channel: [
    { channel: 'WhatsApp', conversions: 145, rate: 12.5 },
    { channel: 'Email', conversions: 89, rate: 8.2 },
    { channel: 'SMS', conversions: 67, rate: 15.3 },
    { channel: 'Website', conversions: 234, rate: 6.8 },
    { channel: 'Social Media', conversions: 123, rate: 9.1 }
  ],
  campaign_performance: [
    { date: '2024-01-01', opens: 1250, clicks: 156, conversions: 23, roi: 2.3 },
    { date: '2024-01-02', opens: 1180, clicks: 142, conversions: 19, roi: 2.1 },
    { date: '2024-01-03', opens: 1320, clicks: 178, conversions: 28, roi: 2.8 },
    { date: '2024-01-04', opens: 1290, clicks: 165, conversions: 25, roi: 2.5 },
    { date: '2024-01-05', opens: 1410, clicks: 189, conversions: 31, roi: 3.1 },
    { date: '2024-01-06', opens: 1380, clicks: 172, conversions: 27, roi: 2.7 },
    { date: '2024-01-07', opens: 1450, clicks: 198, conversions: 34, roi: 3.4 }
  ],
  sales_funnel: [
    { stage: 'Visitantes', count: 10000, percentage: 100 },
    { stage: 'Leads', count: 2500, percentage: 25 },
    { stage: 'Qualificados', count: 750, percentage: 7.5 },
    { stage: 'Propostas', count: 300, percentage: 3 },
    { stage: 'Fechados', count: 90, percentage: 0.9 }
  ],
  engagement_by_hour: [
    { hour: '00:00', messages: 45, response_rate: 85 },
    { hour: '01:00', messages: 23, response_rate: 78 },
    { hour: '02:00', messages: 12, response_rate: 82 },
    { hour: '03:00', messages: 8, response_rate: 75 },
    { hour: '04:00', messages: 15, response_rate: 80 },
    { hour: '05:00', messages: 28, response_rate: 88 },
    { hour: '06:00', messages: 67, response_rate: 92 },
    { hour: '07:00', messages: 123, response_rate: 94 },
    { hour: '08:00', messages: 189, response_rate: 96 },
    { hour: '09:00', messages: 234, response_rate: 98 },
    { hour: '10:00', messages: 267, response_rate: 97 },
    { hour: '11:00', messages: 298, response_rate: 95 },
    { hour: '12:00', messages: 312, response_rate: 93 },
    { hour: '13:00', messages: 289, response_rate: 91 },
    { hour: '14:00', messages: 276, response_rate: 89 },
    { hour: '15:00', messages: 245, response_rate: 87 },
    { hour: '16:00', messages: 223, response_rate: 85 },
    { hour: '17:00', messages: 198, response_rate: 83 },
    { hour: '18:00', messages: 167, response_rate: 81 },
    { hour: '19:00', messages: 134, response_rate: 79 },
    { hour: '20:00', messages: 98, response_rate: 77 },
    { hour: '21:00', messages: 76, response_rate: 75 },
    { hour: '22:00', messages: 54, response_rate: 73 },
    { hour: '23:00', messages: 43, response_rate: 71 }
  ]
};

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0', '#ffb347'];

const ReportChart = ({ data, config, title }: {
  data: any[];
  config: ReportConfig;
  title: string;
}) => {
  const renderChart = () => {
    switch (config.chart_type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.dimensions[0]} />
              <YAxis />
              <Tooltip />
              <Legend />
              {config.metrics.map((metric, index) => (
                <Bar key={metric} dataKey={metric} fill={COLORS[index % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.dimensions[0]} />
              <YAxis />
              <Tooltip />
              <Legend />
              {config.metrics.map((metric, index) => (
                <Line 
                  key={metric} 
                  type="monotone" 
                  dataKey={metric} 
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.dimensions[0]} />
              <YAxis />
              <Tooltip />
              <Legend />
              {config.metrics.map((metric, index) => (
                <Area 
                  key={metric}
                  type="monotone" 
                  dataKey={metric} 
                  stackId="1"
                  stroke={COLORS[index % COLORS.length]}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );
      
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey={config.metrics[0]}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );
      
      default:
        return (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Tipo de gráfico não suportado
          </div>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" />
              Exportar
            </Button>
            <Button variant="outline" size="sm">
              <Share2 className="h-4 w-4 mr-1" />
              Compartilhar
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {renderChart()}
      </CardContent>
    </Card>
  );
};

const ReportMetrics = ({ data }: { data: any[] }) => {
  const calculateMetrics = () => {
    if (!data || data.length === 0) return {};
    
    // Exemplo de cálculos de métricas
    const total = data.reduce((sum, item) => sum + (item.conversions || item.count || 0), 0);
    const average = total / data.length;
    const max = Math.max(...data.map(item => item.conversions || item.count || 0));
    const min = Math.min(...data.map(item => item.conversions || item.count || 0));
    
    return { total, average, max, min };
  };

  const metrics = calculateMetrics();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <Target className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{metrics.total?.toLocaleString() || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">Média</p>
              <p className="text-2xl font-bold">{metrics.average?.toFixed(1) || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-orange-500" />
            <div>
              <p className="text-sm text-muted-foreground">Máximo</p>
              <p className="text-2xl font-bold">{metrics.max?.toLocaleString() || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-sm text-muted-foreground">Mínimo</p>
              <p className="text-2xl font-bold">{metrics.min?.toLocaleString() || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const ReportFilters = ({ config, onConfigChange }: {
  config: ReportConfig;
  onConfigChange: (config: ReportConfig) => void;
}) => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const handleTimeRangeChange = (value: string) => {
    onConfigChange({
      ...config,
      time_range: { type: 'relative', value }
    });
  };

  const handleChartTypeChange = (chart_type: any) => {
    onConfigChange({
      ...config,
      chart_type
    });
  };

  const handleGroupingChange = (grouping: any) => {
    onConfigChange({
      ...config,
      grouping
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Filter className="h-5 w-5" />
          <span>Filtros e Configurações</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Período</Label>
            <Select value={config.time_range.value} onValueChange={handleTimeRangeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="1y">Último ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>Tipo de Gráfico</Label>
            <Select value={config.chart_type} onValueChange={handleChartTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Barras</SelectItem>
                <SelectItem value="line">Linha</SelectItem>
                <SelectItem value="area">Área</SelectItem>
                <SelectItem value="pie">Pizza</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>Agrupamento</Label>
            <Select value={config.grouping} onValueChange={handleGroupingChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Por Dia</SelectItem>
                <SelectItem value="week">Por Semana</SelectItem>
                <SelectItem value="month">Por Mês</SelectItem>
                <SelectItem value="quarter">Por Trimestre</SelectItem>
                <SelectItem value="year">Por Ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {config.time_range.value === 'custom' && (
          <div>
            <Label>Período Personalizado</Label>
            <DatePickerWithRange
              date={dateRange}
              onDateChange={setDateRange}
              className="w-full"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ReportBuilder = ({ onSave }: { onSave: (template: Partial<ReportTemplate>) => void }) => {
  const createTemplateMutation = useCreateReportTemplate();
  const [config, setConfig] = useState<ReportConfig>({
    data_source: 'conversations',
    metrics: ['count'],
    dimensions: ['date'],
    filters: [],
    chart_type: 'bar',
    time_range: { type: 'relative', value: '30d' },
    grouping: 'day'
  });
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const { toast } = useToast();

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Erro",
        description: "Nome do relatório é obrigatório",
        variant: "destructive"
      });
      return;
    }

    try {
      const template = {
        name,
        description,
        category: category || 'Personalizado',
        type: 'chart' as const,
        config,
        is_public: false
      };

      await createTemplateMutation.mutateAsync(template);
      onSave(template);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao salvar relatório",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informações do Relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Nome do Relatório *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Conversões por Canal"
            />
          </div>
          
          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o objetivo deste relatório..."
              rows={3}
            />
          </div>
          
          <div>
            <Label htmlFor="category">Categoria</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex: Vendas, Marketing, Atendimento"
            />
          </div>
        </CardContent>
      </Card>

      <ReportFilters config={config} onConfigChange={setConfig} />

      <Card>
        <CardHeader>
          <CardTitle>Visualização</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportChart
            data={mockReportData.conversions_by_channel}
            config={config}
            title="Preview do Relatório"
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end space-x-4">
        <Button variant="outline">
          Cancelar
        </Button>
        <Button 
          onClick={handleSave}
          disabled={createTemplateMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {createTemplateMutation.isPending ? 'Salvando...' : 'Salvar Relatório'}
        </Button>
      </div>
    </div>
  );
};

const ReportTemplateCard = ({ template, onUse, onEdit, onDelete }: {
  template: ReportTemplate;
  onUse: (template: ReportTemplate) => void;
  onEdit: (template: ReportTemplate) => void;
  onDelete: (id: string) => void;
}) => {
  const getTypeIcon = () => {
    switch (template.type) {
      case 'chart': return <BarChart3 className="h-5 w-5" />;
      case 'table': return <FileText className="h-5 w-5" />;
      case 'metric': return <Activity className="h-5 w-5" />;
      case 'dashboard': return <PieChartIcon className="h-5 w-5" />;
    }
  };

  const getTypeLabel = () => {
    switch (template.type) {
      case 'chart': return 'Gráfico';
      case 'table': return 'Tabela';
      case 'metric': return 'Métrica';
      case 'dashboard': return 'Dashboard';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            {getTypeIcon()}
            <div>
              <h3 className="font-semibold">{template.name}</h3>
              <p className="text-sm text-muted-foreground">{template.description}</p>
            </div>
          </div>
          <Badge variant="outline">{getTypeLabel()}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Categoria:</span>
            <span className="ml-2 font-medium">{template.category}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Usos:</span>
            <span className="ml-2 font-medium">{template.usage_count}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Criado por:</span>
            <span className="ml-2 font-medium">{template.created_by}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Público:</span>
            <span className="ml-2 font-medium">{template.is_public ? 'Sim' : 'Não'}</span>
          </div>
        </div>

        <Separator className="mb-4" />

        <div className="flex items-center justify-between">
          <Button onClick={() => onUse(template)}>
            <Eye className="h-4 w-4 mr-2" />
            Visualizar
          </Button>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(template)}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Copy className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onDelete(template.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ReportsList = () => {
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  
  // Buscar templates do Supabase
  const { data: templates, isLoading: templatesLoading, error: templatesError } = useReportTemplates({
    includePublic: true
  });
  
  // Mutations para gerenciar templates
  const deleteTemplateMutation = useDeleteReportTemplate();
  const generateReportMutation = useGenerateReport();
  
  // Usar templates padrão se não houver dados
  const displayTemplates = templates && templates.length > 0 ? templates : defaultTemplates;

  const categories = Array.from(new Set(displayTemplates.map(t => t.category)));
  
  const filteredTemplates = displayTemplates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filter === 'all' || template.category === filter;
    return matchesSearch && matchesCategory;
  });

  const handleUse = async (template: ReportTemplate) => {
    try {
      await generateReportMutation.mutateAsync({
        templateId: template.id,
        config: template.config,
        name: `${template.name} - ${new Date().toLocaleDateString()}`
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao gerar relatório",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (template: ReportTemplate) => {
    toast({
      title: "Editar relatório",
      description: `Editando ${template.name}`
    });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplateMutation.mutateAsync(id);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao remover relatório",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <Input
            placeholder="Buscar relatórios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
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
        <Button variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {templatesLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <DashboardCardSkeleton key={i} />
          ))}
        </div>
      ) : templatesError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar templates: {templatesError.message}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredTemplates.map((template) => (
            <ReportTemplateCard
              key={template.id}
              template={template}
              onUse={handleUse}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {filteredTemplates.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum relatório encontrado</h3>
            <p className="text-muted-foreground">
              Tente ajustar os filtros de busca ou categoria.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const ReportViewer = ({ template }: { template: ReportTemplate }) => {
  const [config, setConfig] = useState<ReportConfig>(template.config);
  const { toast } = useToast();
  
  // Buscar dados do relatório do Supabase
  const { data: reportData, isLoading, error, refetch } = useReportData({
    templateId: template.id,
    limit: 1
  });
  
  const generateReportMutation = useGenerateReport();
  
  // Usar dados mockados como fallback
  const getReportData = () => {
    if (reportData && reportData.length > 0) {
      return reportData[0].data;
    }
    
    // Fallback para dados mockados
    switch (template.category) {
      case 'Conversões': return mockReportData.conversions_by_channel;
      case 'Campanhas': return mockReportData.campaign_performance;
      case 'Vendas': return mockReportData.sales_funnel;
      case 'Engajamento': return mockReportData.engagement_by_hour;
      default: return mockReportData.conversions_by_channel;
    }
  };

  const handleRefresh = async () => {
    try {
      if (reportData && reportData.length > 0) {
        // Se já existe dados, apenas refetch
        await refetch();
      } else {
        // Se não existe dados, gerar novo relatório
        await generateReportMutation.mutateAsync({
          templateId: template.id,
          config: config,
          name: `${template.name} - ${new Date().toLocaleDateString()}`
        });
        await refetch();
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao atualizar relatório",
        variant: "destructive"
      });
    }
  };

  const data = getReportData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{template.name}</h2>
          <p className="text-muted-foreground">{template.description}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh} 
            disabled={isLoading || generateReportMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(isLoading || generateReportMutation.isPending) ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline">
            <Share2 className="h-4 w-4 mr-2" />
            Compartilhar
          </Button>
        </div>
      </div>

      <ReportFilters config={config} onConfigChange={setConfig} />
      
      <ReportMetrics data={data} />
      
      <ReportChart data={data} config={config} title={template.name} />
    </div>
  );
};

export const AdvancedReports = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [activeTab, setActiveTab] = useState('templates');
  const { toast } = useToast();

  const handleSaveReport = (reportData: Partial<ReportTemplate>) => {
    console.log('Saving report:', reportData);
    toast({
      title: "Relatório criado",
      description: "Seu relatório personalizado foi salvo com sucesso"
    });
    setActiveTab('templates');
  };

  if (selectedTemplate) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
            ← Voltar
          </Button>
        </div>
        <ReportViewer template={selectedTemplate} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Relatórios Avançados</h2>
          <p className="text-muted-foreground">
            Crie e visualize relatórios personalizados com dados em tempo real
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="templates">Relatórios Salvos</TabsTrigger>
          <TabsTrigger value="builder">Criar Relatório</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <ReportsList />
        </TabsContent>

        <TabsContent value="builder">
          <ReportBuilder onSave={handleSaveReport} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
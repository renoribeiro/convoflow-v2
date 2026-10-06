import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { CalendarIcon, Filter, X, Search, TrendingUp, Users, Target, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

// Interfaces
interface AdvancedFiltersProps {
  onFiltersChange: (filters: AnalyticsFilters) => void;
  initialFilters?: Partial<AnalyticsFilters>;
  className?: string;
}

export interface AnalyticsFilters {
  dateRange?: DateRange;
  quickDate: string;
  sources: string[];
  status: string[];
  conversionStatus: string;
  revenueRange: {
    min?: number;
    max?: number;
  };
  leadScore: {
    min?: number;
    max?: number;
  };
  campaigns: string[];
  utmSources: string[];
  utmMediums: string[];
  devices: string[];
  locations: string[];
  assignedTo: string[];
  tags: string[];
  customFields: Record<string, any>;
  segmentation: {
    type: 'none' | 'source' | 'campaign' | 'location' | 'device' | 'custom';
    value?: string;
  };
}

// Opções de filtros
const sourceOptions = [
  'Facebook Ads',
  'Instagram',
  'Google Ads',
  'Site Orgânico',
  'Tráfego Direto',
  'Linktree',
  'YouTube',
  'LinkedIn',
  'WhatsApp',
  'Email Marketing',
  'Referência'
];

const statusOptions = [
  'Novo Lead',
  'Qualificado',
  'Em Contato',
  'Proposta Enviada',
  'Em Negociação',
  'Convertido',
  'Perdido',
  'Inativo'
];

const conversionStatusOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'converted', label: 'Convertidos' },
  { value: 'not_converted', label: 'Não Convertidos' },
  { value: 'in_progress', label: 'Em Progresso' }
];

const deviceOptions = [
  'Desktop',
  'Mobile',
  'Tablet'
];

const quickDateOptions = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: '1y', label: 'Último ano' },
  { value: 'custom', label: 'Período personalizado' }
];

const segmentationOptions = [
  { value: 'none', label: 'Sem segmentação' },
  { value: 'source', label: 'Por fonte de tráfego' },
  { value: 'campaign', label: 'Por campanha' },
  { value: 'location', label: 'Por localização' },
  { value: 'device', label: 'Por dispositivo' },
  { value: 'custom', label: 'Segmentação personalizada' }
];

export const AdvancedFilters = ({
  onFiltersChange,
  initialFilters,
  className
}: AdvancedFiltersProps) => {
  const [filters, setFilters] = useState<AnalyticsFilters>({
    quickDate: '30d',
    sources: [],
    status: [],
    conversionStatus: 'all',
    revenueRange: {},
    leadScore: {},
    campaigns: [],
    utmSources: [],
    utmMediums: [],
    devices: [],
    locations: [],
    assignedTo: [],
    tags: [],
    customFields: {},
    segmentation: { type: 'none' },
    ...initialFilters
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Atualizar filtros quando mudarem
  useEffect(() => {
    onFiltersChange(filters);
  }, [filters, onFiltersChange]);

  // Funções auxiliares
  const updateFilter = <K extends keyof AnalyticsFilters>(
    key: K,
    value: AnalyticsFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleArrayFilter = (key: keyof AnalyticsFilters, value: string) => {
    const currentArray = filters[key] as string[];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    updateFilter(key, newArray);
  };

  const handleQuickDateChange = (value: string) => {
    updateFilter('quickDate', value);
    
    if (value !== 'custom') {
      const now = new Date();
      let from: Date | undefined;
      
      switch (value) {
        case 'today':
          from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          updateFilter('dateRange', { from, to: now });
          break;
        case '7d':
          from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          updateFilter('dateRange', { from, to: now });
          break;
        case '30d':
          from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          updateFilter('dateRange', { from, to: now });
          break;
        case '90d':
          from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          updateFilter('dateRange', { from, to: now });
          break;
        case '6m':
          from = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
          updateFilter('dateRange', { from, to: now });
          break;
        case '1y':
          from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          updateFilter('dateRange', { from, to: now });
          break;
      }
    }
  };

  const clearAllFilters = () => {
    setFilters({
      quickDate: '30d',
      sources: [],
      status: [],
      conversionStatus: 'all',
      revenueRange: {},
      leadScore: {},
      campaigns: [],
      utmSources: [],
      utmMediums: [],
      devices: [],
      locations: [],
      assignedTo: [],
      tags: [],
      customFields: {},
      segmentation: { type: 'none' }
    });
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.sources.length > 0) count++;
    if (filters.status.length > 0) count++;
    if (filters.conversionStatus !== 'all') count++;
    if (filters.revenueRange.min || filters.revenueRange.max) count++;
    if (filters.leadScore.min || filters.leadScore.max) count++;
    if (filters.campaigns.length > 0) count++;
    if (filters.devices.length > 0) count++;
    if (filters.locations.length > 0) count++;
    if (filters.assignedTo.length > 0) count++;
    if (filters.tags.length > 0) count++;
    if (filters.segmentation.type !== 'none') count++;
    return count;
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Filtros Avançados</CardTitle>
            {getActiveFiltersCount() > 0 && (
              <Badge variant="secondary" className="text-xs">
                {getActiveFiltersCount()} ativo{getActiveFiltersCount() > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Menos filtros' : 'Mais filtros'}
            </Button>
            {getActiveFiltersCount() > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
              >
                <X className="w-4 h-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Filtros básicos - sempre visíveis */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Período */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Período:</Label>
            <Select value={filters.quickDate} onValueChange={handleQuickDateChange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quickDateOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data personalizada */}
          {filters.quickDate === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-60 justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateRange?.from ? (
                    filters.dateRange.to ? (
                      <>
                        {format(filters.dateRange.from, "dd/MM/yyyy")} -{" "}
                        {format(filters.dateRange.to, "dd/MM/yyyy")}
                      </>
                    ) : (
                      format(filters.dateRange.from, "dd/MM/yyyy")
                    )
                  ) : (
                    <span>Selecionar período</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={filters.dateRange?.from}
                  selected={filters.dateRange}
                  onSelect={(range) => updateFilter('dateRange', range)}
                  numberOfMonths={2}
                  className="p-3"
                />
              </PopoverContent>
            </Popover>
          )}

          {/* Status de conversão */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Conversão:</Label>
            <Select 
              value={filters.conversionStatus} 
              onValueChange={(value) => updateFilter('conversionStatus', value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {conversionStatusOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Segmentação */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Segmentar por:</Label>
            <Select 
              value={filters.segmentation.type} 
              onValueChange={(value) => updateFilter('segmentation', { type: value as any })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {segmentationOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filtros avançados - expansíveis */}
        {isExpanded && (
          <>
            <Separator />
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Fontes de tráfego */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Fontes de Tráfego
                </Label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {sourceOptions.map(source => (
                    <div key={source} className="flex items-center space-x-2">
                      <Checkbox
                        id={`source-${source}`}
                        checked={filters.sources.includes(source)}
                        onCheckedChange={() => toggleArrayFilter('sources', source)}
                      />
                      <Label htmlFor={`source-${source}`} className="text-sm">
                        {source}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status do lead */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Status do Lead
                </Label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {statusOptions.map(status => (
                    <div key={status} className="flex items-center space-x-2">
                      <Checkbox
                        id={`status-${status}`}
                        checked={filters.status.includes(status)}
                        onCheckedChange={() => toggleArrayFilter('status', status)}
                      />
                      <Label htmlFor={`status-${status}`} className="text-sm">
                        {status}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dispositivos */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Dispositivos
                </Label>
                <div className="space-y-1">
                  {deviceOptions.map(device => (
                    <div key={device} className="flex items-center space-x-2">
                      <Checkbox
                        id={`device-${device}`}
                        checked={filters.devices.includes(device)}
                        onCheckedChange={() => toggleArrayFilter('devices', device)}
                      />
                      <Label htmlFor={`device-${device}`} className="text-sm">
                        {device}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* Filtros de valor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Faixa de receita */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Faixa de Receita (R$)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Mín"
                    value={filters.revenueRange.min || ''}
                    onChange={(e) => updateFilter('revenueRange', {
                      ...filters.revenueRange,
                      min: e.target.value ? Number(e.target.value) : undefined
                    })}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">até</span>
                  <Input
                    type="number"
                    placeholder="Máx"
                    value={filters.revenueRange.max || ''}
                    onChange={(e) => updateFilter('revenueRange', {
                      ...filters.revenueRange,
                      max: e.target.value ? Number(e.target.value) : undefined
                    })}
                    className="w-24"
                  />
                </div>
              </div>

              {/* Score do lead */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Score do Lead</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Mín"
                    min="0"
                    max="100"
                    value={filters.leadScore.min || ''}
                    onChange={(e) => updateFilter('leadScore', {
                      ...filters.leadScore,
                      min: e.target.value ? Number(e.target.value) : undefined
                    })}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">até</span>
                  <Input
                    type="number"
                    placeholder="Máx"
                    min="0"
                    max="100"
                    value={filters.leadScore.max || ''}
                    onChange={(e) => updateFilter('leadScore', {
                      ...filters.leadScore,
                      max: e.target.value ? Number(e.target.value) : undefined
                    })}
                    className="w-24"
                  />
                </div>
              </div>
            </div>

            {/* Busca por campanha/UTM */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Buscar por Campanha/UTM</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Digite o nome da campanha, UTM source, medium..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

const sourceOptions = [
  'Facebook Ads',
  'Instagram',
  'Google Ads',
  'Site Orgânico',
  'Tráfego Direto',
  'Linktree',
  'YouTube',
  'LinkedIn'
];

const statusOptions = [
  'Todos',
  'Novos Leads',
  'Qualificados',
  'Em Negociação',
  'Convertidos',
  'Perdidos'
];

interface TrackingFiltersProps {
  dateRange?: DateRange;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  selectedSources: string[];
  onSourcesChange: (sources: string[]) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
}

export const TrackingFilters = ({
  dateRange,
  onDateRangeChange,
  selectedSources,
  onSourcesChange,
  selectedStatus,
  onStatusChange
}: TrackingFiltersProps) => {
  const [quickDate, setQuickDate] = useState('30d');

  const handleSourceToggle = (source: string) => {
    const newSources = selectedSources.includes(source) 
      ? selectedSources.filter(s => s !== source)
      : [...selectedSources, source];
    onSourcesChange(newSources);
  };

  const clearAllFilters = () => {
    onDateRangeChange(undefined);
    onSourcesChange([]);
    onStatusChange('Todos');
    setQuickDate('30d');
  };

  const quickDateOptions = [
    { value: 'today', label: 'Hoje' },
    { value: '7d', label: 'Últimos 7 dias' },
    { value: '30d', label: 'Últimos 30 dias' },
    { value: '90d', label: 'Últimos 90 dias' },
    { value: 'custom', label: 'Período personalizado' }
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros:</span>
          </div>

          {/* Filtro de Data Rápido */}
          <Select value={quickDate} onValueChange={(value) => {
            setQuickDate(value);
            if (value !== 'custom') {
              // Calculate date range based on quick selection
              const now = new Date();
              let from: Date | undefined;
              
              switch (value) {
                case 'today':
                  from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  onDateRangeChange({ from, to: now });
                  break;
                case '7d':
                  from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                  onDateRangeChange({ from, to: now });
                  break;
                case '30d':
                  from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                  onDateRangeChange({ from, to: now });
                  break;
                case '90d':
                  from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                  onDateRangeChange({ from, to: now });
                  break;
                default:
                  onDateRangeChange(undefined);
              }
            }
          }}>
            <SelectTrigger className="w-[180px]">
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

          {/* Seletor de Data Personalizada */}
          {quickDate === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM/yyyy")} -{" "}
                        {format(dateRange.to, "dd/MM/yyyy")}
                      </>
                    ) : (
                      format(dateRange.from, "dd/MM/yyyy")
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
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={onDateRangeChange}
                  numberOfMonths={2}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          )}

          {/* Filtro de Status */}
          <Select value={selectedStatus} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(status => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro de Fontes */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                Fontes de Tráfego
                {selectedSources.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {selectedSources.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-2">
                <h4 className="font-medium">Selecionar Fontes</h4>
                <div className="space-y-2">
                  {sourceOptions.map(source => (
                    <div key={source} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={source}
                        checked={selectedSources.includes(source)}
                        onChange={() => handleSourceToggle(source)}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor={source} className="text-sm">
                        {source}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Limpar Filtros */}
          {(selectedSources.length > 0 || selectedStatus !== 'Todos' || dateRange) && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              <X className="w-4 h-4 mr-1" />
              Limpar
            </Button>
          )}
        </div>

        {/* Tags dos Filtros Ativos */}
        {(selectedSources.length > 0 || selectedStatus !== 'Todos') && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
            {selectedSources.map(source => (
              <Badge key={source} variant="secondary" className="flex items-center gap-1">
                {source}
                <button onClick={() => handleSourceToggle(source)}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            {selectedStatus !== 'Todos' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                {selectedStatus}
                <button onClick={() => onStatusChange('Todos')}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

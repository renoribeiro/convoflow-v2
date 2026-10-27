
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

/**
 * Filtros da aba Dashboard do Rastreamento: só o PERÍODO.
 *
 * Até 2026-10-25 havia também "Status" e "Fontes de Tráfego", com listas fixas
 * ("Linktree", "LinkedIn", "Qualificados"...) que o painel recebia e não usava:
 * escolher não mudava nenhum número (achado 63 do checkup). Saíram. Se um dia
 * voltarem, que venham das fontes e etapas reais da Loja e filtrem de verdade.
 */
interface TrackingFiltersProps {
  dateRange?: DateRange;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
}

export const TrackingFilters = ({
  dateRange,
  onDateRangeChange,
}: TrackingFiltersProps) => {
  const [quickDate, setQuickDate] = useState('30d');

  const clearAllFilters = () => {
    onDateRangeChange(undefined);
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
            <SelectTrigger className="w-[180px]" aria-label="Período">
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

          {/* Limpar Filtros */}
          {dateRange && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              <X className="w-4 h-4 mr-1" />
              Limpar
            </Button>
          )}
        </div>

      </CardContent>
    </Card>
  );
};

import { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { PeriodPreset, UsePeriodFilterResult } from '@/hooks/usePeriodFilter';

interface DashboardHeaderProps {
  period: UsePeriodFilterResult;
}

const PRESETS: { value: Exclude<PeriodPreset, 'custom'>; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
];

export const DashboardHeader = ({ period }: DashboardHeaderProps) => {
  const [open, setOpen] = useState(false);
  const { preset, setPreset, setCustom, custom } = period;

  const handleSelectRange = (range: DateRange | undefined) => {
    setCustom({ from: range?.from, to: range?.to });
    if (range?.from && range?.to) {
      setPreset('custom');
      setOpen(false);
    }
  };

  const customLabel =
    custom.from && custom.to
      ? `${format(custom.from, 'dd/MM', { locale: ptBR })} – ${format(custom.to, 'dd/MM', { locale: ptBR })}`
      : 'Personalizado';

  return (
    <PageHeader
      title="Dashboard"
      helpKey="page:dashboard"
      description="Visão geral das suas conversas, contatos e métricas de WhatsApp"
      actions={
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/60 p-1">
          {PRESETS.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={preset === p.value ? 'default' : 'ghost'}
              className="h-8 px-3"
              onClick={() => setPreset(p.value)}
            >
              {p.label}
            </Button>
          ))}

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={preset === 'custom' ? 'default' : 'ghost'}
                className={cn('h-8 px-3 gap-1.5')}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{customLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: custom.from, to: custom.to }}
                onSelect={handleSelectRange}
                numberOfMonths={2}
                locale={ptBR}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      }
    />
  );
};

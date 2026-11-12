import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Filter } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { dataParaCalendario, diaDoCalendario, diaIso, rotuloDiaLongo } from '@/lib/datas/brasilia';
import {
  OPCOES_DE_PERIODO,
  PERIODO_PADRAO,
  PeriodoRapido,
  PeriodoRastreamento,
  periodoPersonalizado,
  periodoRapido,
} from '@/lib/rastreamento/resumo';

/**
 * Filtros da aba Resumo do Rastreamento: só o PERÍODO, em dias de Brasília.
 *
 * Até 2026-10-25 havia também "Status" e "Fontes de Tráfego", com listas fixas
 * que o painel recebia e não usava (achado 63 do checkup). Saíram.
 *
 * Desde 2026-11-12 o período é de DIAS (ano, mês, dia), não de instantes do
 * navegador: "Hoje" é o dia de Brasília e o dia vira à meia noite de Brasília,
 * em qualquer fuso do computador. Antes o banco virava o dia às 21h.
 */
interface TrackingFiltersProps {
  periodo: PeriodoRastreamento;
  onPeriodoChange: (periodo: PeriodoRastreamento) => void;
}

export const TrackingFilters = ({ periodo, onPeriodoChange }: TrackingFiltersProps) => {
  const escolherRapido = (value: string) => {
    const rapido = value as PeriodoRapido;
    if (rapido === 'custom') {
      onPeriodoChange({ ...periodo, rapido: 'custom' });
      return;
    }
    onPeriodoChange(periodoRapido(rapido));
  };

  const escolherNoCalendario = (range: DateRange | undefined) => {
    if (!range?.from) return;
    const de = diaDoCalendario(range.from);
    const ate = diaDoCalendario(range.to ?? range.from);
    onPeriodoChange(periodoPersonalizado(de, ate));
  };

  const selecionado: DateRange = {
    from: dataParaCalendario(periodo.de),
    to: dataParaCalendario(periodo.ate),
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Período:</span>
          </div>

          <Select value={periodo.rapido} onValueChange={escolherRapido}>
            <SelectTrigger className="w-[200px]" aria-label="Período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPCOES_DE_PERIODO.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {periodo.rapido === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-[240px] justify-start text-left font-normal')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {rotuloDiaLongo(diaIso(periodo.de))} a {rotuloDiaLongo(diaIso(periodo.ate))}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={selecionado.from}
                  selected={selecionado}
                  onSelect={escolherNoCalendario}
                  numberOfMonths={2}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          )}

          <span className="text-sm text-muted-foreground" data-testid="periodo-rastreamento">
            {periodo.rapido === 'today'
              ? `Hoje, ${rotuloDiaLongo(diaIso(periodo.ate))}`
              : `${rotuloDiaLongo(diaIso(periodo.de))} a ${rotuloDiaLongo(diaIso(periodo.ate))}`}
            {' '}(horário de Brasília)
          </span>

          {periodo.rapido !== PERIODO_PADRAO && (
            <Button variant="ghost" size="sm" onClick={() => onPeriodoChange(periodoRapido(PERIODO_PADRAO))}>
              Voltar aos últimos 30 dias
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

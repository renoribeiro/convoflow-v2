import { CHART_STATUS } from '@/lib/chartColors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { X, Search, CalendarIcon, Filter } from 'lucide-react';
import { useContacts } from '@/hooks/useContacts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface FollowupFiltersProps {
  filters: {
    search: string;
    type: string;
    priority: string;
    status: string;
    contactId: string;
    dateFrom?: Date;
    dateTo?: Date;
  };
  onFiltersChange: (filters: any) => void;
}

const followupTypes = [
  { value: 'call', label: 'Ligação' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'task', label: 'Tarefa' }
];

const priorities = [
  { value: 'low', label: 'Baixa', color: CHART_STATUS.success },
  { value: 'medium', label: 'Média', color: CHART_STATUS.warning },
  { value: 'high', label: 'Alta', color: CHART_STATUS.error }
];

const statuses = [
  { value: 'pending', label: 'Pendente' },
  { value: 'completed', label: 'Concluído' },
  { value: 'overdue', label: 'Em Atraso' }
];

export const FollowupFilters = ({ filters, onFiltersChange }: FollowupFiltersProps) => {
  const { data: contacts = [], isLoading: contactsLoading } = useContacts();

  const updateFilters = (key: string, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: '',
      type: '',
      priority: '',
      status: '',
      contactId: '',
      dateFrom: undefined,
      dateTo: undefined
    });
  };

  const hasActiveFilters = Object.values(filters).some(value => 
    value !== '' && value !== undefined
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs">
                Ativos
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpar
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Busca */}
        <div>
          <Label htmlFor="search">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              id="search"
              placeholder="Buscar por tarefa, contato ou descrição..."
              value={filters.search}
              onChange={(e) => updateFilters('search', e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Tipo de Follow-up */}
        <div>
          <Label>Tipo de Follow-up</Label>
          <Select 
            value={filters.type || 'all'} 
            onValueChange={(value) => updateFilters('type', value === 'all' ? '' : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {followupTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prioridade */}
        <div>
          <Label>Prioridade</Label>
          <Select 
            value={filters.priority || 'all'} 
            onValueChange={(value) => updateFilters('priority', value === 'all' ? '' : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas as prioridades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              {priorities.map((priority) => (
                <SelectItem key={priority.value} value={priority.value}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: priority.color }}
                    />
                    {priority.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div>
          <Label>Status</Label>
          <Select 
            value={filters.status || 'all'} 
            onValueChange={(value) => updateFilters('status', value === 'all' ? '' : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {statuses.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Contato */}
        <div>
          <Label>Contato</Label>
          {contactsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select 
              value={filters.contactId || 'all'} 
              onValueChange={(value) => updateFilters('contactId', value === 'all' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os contatos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os contatos</SelectItem>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Período */}
        <div className="space-y-2">
          <Label>Período</Label>
          <div className="grid grid-cols-2 gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !filters.dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateFrom ? (
                    format(filters.dateFrom, "dd/MM/yyyy", { locale: ptBR })
                  ) : (
                    "Data inicial"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.dateFrom}
                  onSelect={(date) => updateFilters('dateFrom', date)}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !filters.dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateTo ? (
                    format(filters.dateTo, "dd/MM/yyyy", { locale: ptBR })
                  ) : (
                    "Data final"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.dateTo}
                  onSelect={(date) => updateFilters('dateTo', date)}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
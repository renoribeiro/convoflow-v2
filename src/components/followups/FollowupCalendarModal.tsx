
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, Loader2 } from 'lucide-react';
import { useFollowups } from '@/hooks/useFollowups';
import type { IndividualFollowup } from '@/lib/followups/types';

interface FollowupCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
}



export const FollowupCalendarModal = ({ isOpen, onClose }: FollowupCalendarModalProps) => {
  const { followups, loading } = useFollowups();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'month' | 'week'>('month');

  // Group followups by date
  const followupsByDate = useMemo(() => {
    const grouped: Record<string, IndividualFollowup[]> = {};
    
    followups.forEach(followup => {
      if (followup.scheduled_at) {
        const dateKey = followup.scheduled_at.split('T')[0];
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(followup);
      }
    });
    
    return grouped;
  }, [followups]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Dias do mês anterior para completar a primeira semana
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const prevDate = new Date(year, month, -i);
      days.push({
        date: prevDate,
        isCurrentMonth: false,
        dateString: prevDate.toISOString().split('T')[0]
      });
    }
    
    // Dias do mês atual
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDateObj = new Date(year, month, day);
      days.push({
        date: currentDateObj,
        isCurrentMonth: true,
        dateString: currentDateObj.toISOString().split('T')[0]
      });
    }
    
    return days;
  };

  const formatMonth = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'call': return '📞';
      case 'email': return '📧';
      case 'whatsapp': return '💬';
      default: return '📅';
    }
  };

  const days = getDaysInMonth(currentDate);
  const selectedEvents = selectedDate ? followupsByDate[selectedDate] || [] : [];

  const formatFollowupTime = (followup: IndividualFollowup) => {
    if (followup.scheduled_at) {
      const date = new Date(followup.scheduled_at);
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return '';
  };

  const getFollowupTitle = (followup: IndividualFollowup) => {
    return followup.task || `Follow-up ${followup.type}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* No celular ocupa a tela inteira (dvh: a barra do navegador entra na
          conta); a partir de sm volta a ser o diálogo largo de sempre. */}
      <DialogContent className="max-w-6xl h-[100dvh] max-h-none rounded-none sm:h-auto sm:max-h-[80vh] sm:rounded-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calendário de Follow-ups</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Controles do calendário */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={goToPreviousMonth}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <h3 className="text-lg font-semibold capitalize">
                  {formatMonth(currentDate)}
                </h3>
                <Button variant="outline" size="sm" onClick={goToNextMonth}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              
              <Select value={viewType} onValueChange={(value: 'month' | 'week') => setViewType(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mês</SelectItem>
                  <SelectItem value="week">Semana</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" size="sm" onClick={goToToday}>
              <CalendarIcon className="w-4 h-4 mr-2" />
              Hoje
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendário */}
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="ml-2">Carregando follow-ups...</span>
                    </div>
                  ) : (
                    // Sete colunas não cabem em 342px; abaixo disso a grade rola
                    // de lado dentro do cartão (min-w) em vez de estourar o diálogo.
                    <div className="overflow-x-auto">
                      <div className="min-w-[420px]">
                      <div className="grid grid-cols-7 gap-1 mb-4">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
                          <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                            {day}
                          </div>
                        ))}
                      </div>
                      
                      <div className="grid grid-cols-7 gap-1">
                        {days.map((day, index) => {
                          const events = followupsByDate[day.dateString] || [];
                          const isSelected = selectedDate === day.dateString;
                          const isToday = day.dateString === new Date().toISOString().split('T')[0];
                          
                          return (
                            <div
                              key={index}
                              className={`
                                min-h-[80px] p-1 border rounded cursor-pointer hover:bg-muted/50 transition-colors
                                ${!day.isCurrentMonth ? 'opacity-40' : ''}
                                ${isSelected ? 'bg-primary/10 border-primary' : 'border-border'}
                                ${isToday ? 'bg-blue-50 border-blue-300' : ''}
                              `}
                              onClick={() => setSelectedDate(day.dateString)}
                            >
                              <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : ''}`}>
                                {day.date.getDate()}
                              </div>
                              <div className="space-y-1">
                                {events.slice(0, 2).map((event) => (
                                  <div
                                    key={event.id}
                                    className="text-xs p-1 rounded bg-primary/20 truncate"
                                    title={getFollowupTitle(event)}
                                  >
                                    {getTypeIcon(event.type)} {formatFollowupTime(event)}
                                  </div>
                                ))}
                                {events.length > 2 && (
                                  <div className="text-xs text-muted-foreground">
                                    +{events.length - 2} mais
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Detalhes do dia selecionado */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {selectedDate ? 
                      new Date(selectedDate).toLocaleDateString('pt-BR', { 
                        day: 'numeric', 
                        month: 'long' 
                      }) : 
                      'Selecione um dia'
                    }
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : selectedEvents.length > 0 ? (
                    <div className="space-y-3">
                      {selectedEvents.map((followup) => (
                        <div key={followup.id} className="p-3 border rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{getTypeIcon(followup.type)}</span>
                              <div>
                                <p className="font-medium text-sm">{getFollowupTitle(followup)}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {followup.contacts?.name || 'Contato não encontrado'}
                                </p>
                              </div>
                            </div>
                            <Badge className={getPriorityColor(followup.priority)}>
                              {followup.priority}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatFollowupTime(followup)}
                          </div>
                          {followup.task && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              {followup.task}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhum follow-up agendado</p>
                      {selectedDate && (
                        <p className="text-xs mt-1">
                          para {new Date(selectedDate).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

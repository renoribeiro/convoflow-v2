
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ComingSoonButton } from '@/components/shared/ComingSoonButton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScheduleModal, type SchedulePayload } from './ScheduleModal';
import { 
  useReportSchedules, 
  useCreateReportSchedule, 
  useUpdateReportSchedule, 
  useDeleteReportSchedule, 
  useToggleReportSchedule 
} from '@/hooks/useReports';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, Mail, MessageSquare, MoreHorizontal, Plus, Edit, AlertCircle } from 'lucide-react';

// Tipos baseados no schema do banco.
// Nullable onde a coluna é nullable: a linha que vem do Supabase tem
// `is_active: boolean | null`, `recipients: Json` etc., e declarar tudo como
// não-nulo aqui só empurrava a divergência para um erro de tipo no handleEdit.
interface Schedule {
  id: string;
  name: string;
  template_id: string | null;
  cron_expression: string;
  recipients: unknown;
  parameters?: any;
  is_active: boolean | null;
  last_run?: string | null;
  next_run?: string | null;
  created_by?: string | null;
  created_at: string | null;
  updated_at: string | null;
  report_templates?: {
    name: string;
    type: string | null;
  } | null;
}

// Função para detectar frequência baseada na cron expression
const getFrequencyFromCron = (cronExpr: string) => {
  const parts = cronExpr.split(' ');
  if (parts.length >= 5) {
    if (parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
      return 'daily';
    } else if (parts[2] === '*' && parts[3] === '*' && parts[4] !== '*') {
      return 'weekly';
    } else if (parts[2] !== '*' && parts[3] === '*' && parts[4] === '*') {
      return 'monthly';
    }
  }
  return 'unknown';
};

const getFrequencyLabel = (frequency: string) => {
  const labels = {
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
    unknown: 'Personalizado'
  };
  return labels[frequency as keyof typeof labels] || frequency;
};

// (Havia aqui um getMethodIcon com ícone de WhatsApp. Ninguém o chamava, e a
// entrega agendada é só por e-mail — removido para não sugerir um canal que o
// agendador não usa.)

const DIAS_DA_SEMANA: Record<string, string> = {
  '0': 'domingo', '1': 'segunda-feira', '2': 'terça-feira', '3': 'quarta-feira',
  '4': 'quinta-feira', '5': 'sexta-feira', '6': 'sábado', '7': 'domingo',
};

/**
 * Mostra a expressão cron em português. Antes a tela exibia a expressão crua
 * ("8 18 * * 3"), que não diz nada para quem usa — e, pior, exibia igual uma
 * expressão quebrada, escondendo que aquela agenda nunca ia disparar.
 */
const descreverCron = (expr?: string | null): string => {
  if (!expr) return 'Horário não definido';
  const [min, hora, dia, , dow] = expr.trim().split(/\s+/);
  if (!min || !hora || !/^\d+$/.test(min) || !/^\d+$/.test(hora)) return expr;

  const horario = `${hora.padStart(2, '0')}:${min.padStart(2, '0')}`;
  if (dow && dow !== '*') {
    const nome = DIAS_DA_SEMANA[dow];
    return nome ? `Toda ${nome} às ${horario}` : expr;
  }
  if (dia && dia !== '*') return `Todo dia ${dia} às ${horario}`;
  return `Todo dia às ${horario}`;
};

/**
 * `recipients` é jsonb: pode chegar como array (o que a tela grava) ou como
 * string. `recipients?.length` numa string contava as LETRAS — um único e-mail
 * aparecia como "18 destinatário(s)".
 */
const recipientCount = (recipients: unknown): number => {
  if (Array.isArray(recipients)) return recipients.length;
  if (typeof recipients === 'string') {
    return recipients.split(/[,;\n]/).filter((r) => r.trim()).length;
  }
  return 0;
};

export const ScheduleList = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const { toast } = useToast();
  
  // Buscar agendamentos do banco de dados
  const { data: schedules = [], isLoading, error } = useReportSchedules();
  
  // Mutations para gerenciar agendamentos
  const createScheduleMutation = useCreateReportSchedule();
  const updateScheduleMutation = useUpdateReportSchedule();
  const deleteScheduleMutation = useDeleteReportSchedule();
  const toggleScheduleMutation = useToggleReportSchedule();

  const handleEdit = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setShowModal(true);
  };

  const handleSave = async (scheduleData: SchedulePayload) => {
    try {
      // A modal já entrega no formato da tabela (SchedulePayload): repassamos
      // sem remapear. O remapeamento que existia aqui lia campos que a modal
      // nunca mandou (`reportName`, `isActive`), então `name` chegava undefined
      // numa coluna NOT NULL e `template_id` ia com a string 'default_template'
      // numa coluna uuid. Nenhum agendamento conseguia ser salvo.
      if (selectedSchedule) {
        await updateScheduleMutation.mutateAsync({
          id: selectedSchedule.id,
          ...scheduleData,
        });
      } else {
        await createScheduleMutation.mutateAsync({
          ...scheduleData,
          // Sem template: o relatório é montado pelo tipo/período gravados em
          // `parameters`, não por uma linha de report_templates.
          template_id: null,
        });
      }
      
      // Fechar modal e limpar seleção apenas após sucesso
      setShowModal(false);
      setSelectedSchedule(null);
      
      toast({
        title: 'Sucesso',
        description: selectedSchedule ? 'Agendamento atualizado com sucesso!' : 'Agendamento criado com sucesso!',
      });
      
    } catch (error) {
      console.error('Erro detalhado ao salvar agendamento:', error);
      
      // Propagar o erro para que o ScheduleModal possa tratá-lo
      throw error;
    }
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar agendamentos: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Agendamentos</h2>
          <p className="text-muted-foreground">
            Configure envios automáticos de relatórios
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Agendamento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{schedules.length}</p>
                )}
              </div>
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Ativos</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p className="text-2xl font-bold text-green-600">
                    {schedules.filter(s => s.is_active).length}
                  </p>
                )}
              </div>
              <Clock className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Diários</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p className="text-2xl font-bold text-blue-600">
                    {schedules.filter(s => getFrequencyFromCron(s.cron_expression) === 'daily').length}
                  </p>
                )}
              </div>
              <Mail className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Semanais</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p className="text-2xl font-bold text-green-600">
                    {schedules.filter(s => getFrequencyFromCron(s.cron_expression) === 'weekly').length}
                  </p>
                )}
              </div>
              <MessageSquare className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-36" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Schedules List */}
      {!isLoading && schedules.length > 0 && (
        <div className="space-y-4">
          {schedules.map((schedule) => (
            <Card key={schedule.id}>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">
                        {schedule.report_templates?.name || schedule.name}
                      </h3>
                      <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                        {schedule.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge variant="outline">
                        {getFrequencyLabel(getFrequencyFromCron(schedule.cron_expression))}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>
                          {descreverCron(schedule.cron_expression)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        <span>{recipientCount(schedule.recipients)} destinatário(s)</span>
                      </div>
                      
                      <div>
                        <span>
                          Próximo: {schedule.next_run ? 
                            new Date(schedule.next_run).toLocaleDateString('pt-BR') : 
                            'Não agendado'
                          }
                        </span>
                      </div>
                    </div>

                    {schedule.last_run && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        Último envio: {new Date(schedule.last_run).toLocaleDateString('pt-BR')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!schedule.is_active}
                      onCheckedChange={(checked) => {
                        toggleScheduleMutation.mutate({
                          id: schedule.id,
                          isActive: checked,
                        });
                      }}
                      disabled={toggleScheduleMutation.isPending}
                    />
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleEdit(schedule)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <ComingSoonButton variant="ghost" size="icon" motivo="Mais ações em breve">
                      <MoreHorizontal className="w-4 h-4" />
                    </ComingSoonButton>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && schedules.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum agendamento encontrado</h3>
            <p className="text-muted-foreground mb-4">
              Crie seu primeiro agendamento para automatizar o envio de relatórios.
            </p>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Agendamento
            </Button>
          </CardContent>
        </Card>
      )}

      <ScheduleModal
        open={showModal}
        onOpenChange={setShowModal}
        schedule={selectedSchedule}
        onSave={handleSave}
      />
    </div>
  );
};

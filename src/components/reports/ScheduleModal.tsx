
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
import { Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Schedule {
  id?: string;
  reportName: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: string;
  dayOfMonth?: number;
  time: string;
  recipients: string[];
  isActive: boolean;
}

/**
 * O que a modal entrega para quem salva — já no formato da tabela
 * report_schedules. Antes a modal devolvia um objeto e a ScheduleList lia
 * outros nomes de campo (`reportName`, `isActive`), então `name` chegava
 * `undefined` numa coluna NOT NULL. O tipo abaixo existe para que essa
 * divergência não volte em silêncio.
 */
export interface SchedulePayload {
  name: string;
  cron_expression: string;
  recipients: string[];
  parameters: {
    deliveryMethods: 'email'[];
    frequency: 'daily' | 'weekly' | 'monthly';
    dayOfWeek?: string;
    dayOfMonth?: number;
    time: string;
    dateRange: string;
    reportType: string;
  };
  is_active: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Período de dados de cada frequência. Relatório semanal fala dos últimos 7
 * dias — o usuário não precisa escolher isso à mão. O agendador respeita o
 * valor gravado aqui (ver resolveDateRange em _shared/report-scheduler.ts).
 */
const DATE_RANGE_BY_FREQUENCY: Record<'daily' | 'weekly' | 'monthly', string> = {
  daily: '1day',
  weekly: '7days',
  monthly: '30days',
};

// Interface para dados do banco — espelha a linha real de report_schedules,
// com as colunas nullable como nullable e `recipients` como jsonb.
interface DatabaseSchedule {
  id?: string;
  name: string;
  template_id?: string | null;
  cron_expression: string;
  recipients?: unknown;
  parameters?: any;
  is_active?: boolean | null;
  last_run?: string | null;
  next_run?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  report_templates?: {
    name: string;
    type: string | null;
  } | null;
}

interface ScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Aceita o formato do formulário e a linha crua do banco: a lista passa a
  // linha direto ao clicar em Editar.
  schedule?: Schedule | DatabaseSchedule | null;
  onSave: (schedule: SchedulePayload) => void | Promise<void>;
}

// Até 2026-10-25 havia aqui uma lista de 6 "relatórios" ("Relatório
// Financeiro", "Análise de Fontes de Tráfego"...) e todos mandavam o mesmo
// conteúdo (reportType 'general'). Virou um nome livre, e a tela diz o que vai
// no email (achado 73 do checkup).

// O `value` é o número que vai para a expressão cron (0 = domingo), NÃO o
// rótulo. Guardar "Quarta-feira" gerava `8 18 * * Quarta-feira`, que o leitor de
// cron do agendador não entende — e agenda que não é entendida nunca dispara.
const daysOfWeek = [
  { value: '1', label: 'Segunda-feira' },
  { value: '2', label: 'Terça-feira' },
  { value: '3', label: 'Quarta-feira' },
  { value: '4', label: 'Quinta-feira' },
  { value: '5', label: 'Sexta-feira' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
];

export const ScheduleModal = ({ open, onOpenChange, schedule, onSave }: ScheduleModalProps) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Schedule>({
    reportName: '',
    frequency: 'weekly',
    time: '09:00',
    recipients: [],
    isActive: true
  });
  const [newRecipient, setNewRecipient] = useState('');

  // Função para converter cron expression para formato do modal
  const parseCronExpression = (cronExpr: string) => {
    // Formato básico: "0 9 * * 1" (todo segunda às 9h)
    // Para simplificar, vamos assumir alguns padrões comuns
    const parts = cronExpr.split(' ');
    if (parts.length >= 5) {
      const hour = parseInt(parts[1]) || 9;
      const minute = parseInt(parts[0]) || 0;
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      
      // Detectar frequência baseada no padrão
      if (parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
        return { frequency: 'daily' as const, time };
      } else if (parts[2] === '*' && parts[3] === '*' && parts[4] !== '*') {
        return { frequency: 'weekly' as const, time, dayOfWeek: parts[4] };
      } else if (parts[2] !== '*' && parts[3] === '*' && parts[4] === '*') {
        return { frequency: 'monthly' as const, time, dayOfMonth: parseInt(parts[2]) };
      }
    }
    return { frequency: 'weekly' as const, time: '09:00' };
  };

  useEffect(() => {
    if (schedule) {
      // Se é um agendamento do banco de dados, converter para o formato do modal
      if ('cron_expression' in schedule) {
        const dbSchedule = schedule as any as DatabaseSchedule;
        const cronData = parseCronExpression(dbSchedule.cron_expression);
        setFormData({
          reportName: dbSchedule.report_templates?.name || dbSchedule.name,
          frequency: cronData.frequency,
          time: cronData.time,
          dayOfWeek: cronData.dayOfWeek,
          dayOfMonth: cronData.dayOfMonth,
          recipients: Array.isArray(dbSchedule.recipients)
            ? dbSchedule.recipients.filter((r): r is string => typeof r === 'string')
            : [],
          isActive: dbSchedule.is_active !== false,
        });
      } else {
        setFormData(schedule);
      }
    } else {
      setFormData({
        reportName: '',
        frequency: 'weekly',
        time: '09:00',
        recipients: [],
        isActive: true
      });
    }
  }, [schedule, open]);

  const addRecipient = () => {
    const value = newRecipient.trim();
    if (!value) return;

    // Só e-mail: a entrega agendada é por e-mail. Um telefone digitado aqui
    // seria aceito e depois ignorado pelo envio, sem ninguém avisar.
    if (!EMAIL_RE.test(value)) {
      toast({
        title: 'Email inválido',
        description: 'Digite um email completo, como nome@empresa.com.br.',
        variant: 'destructive',
      });
      return;
    }

    if (formData.recipients.includes(value)) {
      setNewRecipient('');
      return;
    }

    setFormData({
      ...formData,
      recipients: [...formData.recipients, value]
    });
    setNewRecipient('');
  };

  const removeRecipient = (recipient: string) => {
    setFormData({
      ...formData,
      recipients: formData.recipients.filter(r => r !== recipient)
    });
  };

  // Função para gerar cron expression baseada na frequência
  const generateCronExpression = () => {
    const [hour, minute] = formData.time.split(':').map(Number);
    
    switch (formData.frequency) {
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly': {
        const dayOfWeek = formData.dayOfWeek || '1'; // Segunda-feira por padrão
        return `${minute} ${hour} * * ${dayOfWeek}`;
      }
      case 'monthly': {
        const dayOfMonth = formData.dayOfMonth || 1;
        return `${minute} ${hour} ${dayOfMonth} * *`;
      }
      default:
        return `${minute} ${hour} * * 1`; // Segunda-feira por padrão
    }
  };

  const handleSave = async () => {
    // Validação dos campos obrigatórios
    if (!formData.reportName.trim()) {
      toast({
        title: 'Falta o nome',
        description: 'Dê um nome ao agendamento, por exemplo "Resumo semanal para a diretoria".',
        variant: 'destructive',
      });
      return;
    }

    // Email digitado e não confirmado no "+" entra na lista em vez de ser
    // ignorado em silêncio.
    let recipients = formData.recipients;
    const pendente = newRecipient.trim();
    if (pendente) {
      if (!EMAIL_RE.test(pendente)) {
        toast({
          title: 'Email inválido',
          description: `"${pendente}" não é um endereço de email. Corrija ou apague o campo antes de salvar.`,
          variant: 'destructive',
        });
        return;
      }
      if (!recipients.includes(pendente)) recipients = [...recipients, pendente];
      setFormData({ ...formData, recipients });
      setNewRecipient('');
    }

    if (!formData.time) {
      toast({
        title: 'Confira o formulário',
        description: 'Por favor, defina um horário.',
        variant: 'destructive',
      });
      return;
    }

    if (recipients.length === 0) {
      toast({
        title: 'Confira o formulário',
        description: 'Adicione pelo menos um email de quem vai receber.',
        variant: 'destructive',
      });
      return;
    }

    // Validação específica para frequência semanal
    if (formData.frequency === 'weekly' && !formData.dayOfWeek) {
      toast({
        title: 'Confira o formulário',
        description: 'Por favor, selecione o dia da semana.',
        variant: 'destructive',
      });
      return;
    }

    // Validação específica para frequência mensal
    if (formData.frequency === 'monthly' && !formData.dayOfMonth) {
      toast({
        title: 'Confira o formulário',
        description: 'Por favor, selecione o dia do mês.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Formato do banco. `template_id` NÃO é enviado daqui: a coluna é uuid e
      // o valor fixo que existia ('template_1') fazia o Postgres recusar a
      // linha inteira (22P02) — nenhum agendamento chegava a ser salvo.
      const scheduleData: SchedulePayload = {
        name: formData.reportName.trim(),
        cron_expression: generateCronExpression(),
        recipients,
        parameters: {
          deliveryMethods: ['email'],
          frequency: formData.frequency,
          dayOfWeek: formData.dayOfWeek,
          dayOfMonth: formData.dayOfMonth,
          time: formData.time,
          dateRange: DATE_RANGE_BY_FREQUENCY[formData.frequency],
          reportType: 'general',
        },
        is_active: formData.isActive,
      };

      await onSave(scheduleData);

      // Fechar o modal após salvar com sucesso
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao salvar agendamento:', error);
      toast({
        title: 'Não foi possível salvar o agendamento',
        description: 'Tente de novo em instantes. Se continuar, fale com o suporte do ConvoFlow.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {schedule ? 'Editar Agendamento' : 'Novo Agendamento'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Relatório */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reportName">Nome do agendamento</Label>
              <Input
                id="reportName"
                value={formData.reportName}
                onChange={(e) => setFormData({ ...formData, reportName: e.target.value })}
                placeholder="Ex: Resumo semanal para a diretoria"
              />
              <p className="text-xs text-muted-foreground">
                Todo agendamento manda o mesmo relatório da Loja: contatos, conversas, mensagens, contatos por etapa do funil e os números de atendimento, no período da frequência escolhida.
              </p>
            </div>
          </div>

          <Separator />

          {/* Frequência e Horário */}
          <div className="space-y-4">
            <h3 className="font-medium">Configurações de Agendamento</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>Frequência</Label>
                  <DicaDoCampo rotulo="Frequência" texto="Diário fala do último dia, Semanal dos últimos 7 dias e Mensal dos últimos 30. O envio sai no horário de Brasília, em até 5 minutos." />
                </div>
                <Select
                  value={formData.frequency}
                  onValueChange={(value: any) => setFormData({...formData, frequency: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diário</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({...formData, time: e.target.value})}
                />
              </div>
            </div>

            {/* Dia da Semana para Semanal */}
            {formData.frequency === 'weekly' && (
              <div className="space-y-2">
                <Label>Dia da Semana</Label>
                <Select
                  value={formData.dayOfWeek}
                  onValueChange={(value) => setFormData({...formData, dayOfWeek: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {daysOfWeek.map(day => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dia do Mês para Mensal */}
            {formData.frequency === 'monthly' && (
              <div className="space-y-2">
                <Label>Dia do Mês</Label>
                <Select
                  value={formData.dayOfMonth?.toString()}
                  onValueChange={(value) => setFormData({...formData, dayOfMonth: parseInt(value)})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({length: 28}, (_, i) => i + 1).map(day => (
                      <SelectItem key={day} value={day.toString()}>
                        Dia {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Separator />

          {/* Entrega */}
          <div className="space-y-2">
            <h3 className="font-medium">Entrega</h3>
            <p className="text-sm text-muted-foreground">
              O relatório é enviado por email para as pessoas abaixo.
            </p>
          </div>

          <Separator />

          {/* Destinatários */}
          <div className="space-y-4">
            <h3 className="font-medium">Destinatários</h3>

            <div className="flex gap-2">
              <Input
                type="email"
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                placeholder="nome@empresa.com.br"
                onKeyPress={(e) => e.key === 'Enter' && addRecipient()}
              />
              <Button onClick={addRecipient}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {formData.recipients.length > 0 && (
              <div className="space-y-2">
                <Label>Destinatários configurados:</Label>
                <div className="flex flex-wrap gap-2">
                  {formData.recipients.map((recipient, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {recipient}
                      <button onClick={() => removeRecipient(recipient)}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            {schedule ? 'Atualizar' : 'Criar'} Agendamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

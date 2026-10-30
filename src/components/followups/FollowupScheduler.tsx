import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
  CalendarIcon, Clock, Phone, Mail, MessageSquare, User, Repeat, Loader2,
  Hand, Send, Workflow, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useFollowupMutations } from '@/hooks/useFollowups';
import { useFollowupSequences } from '@/hooks/useFollowupSequences';
import { useContacts } from '@/hooks/useContacts';
import { useTenantId } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import type { FollowupMode, IndividualFollowup } from '@/lib/followups/types';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
import {
  dataParaCalendario,
  diaDoCalendario,
  diaEmBrasilia,
  diaJaPassouEmBrasilia,
  horaEmBrasilia,
  horarioNoFuturo,
  instanteEmBrasilia,
} from '@/lib/datas/brasilia';
import { toast } from 'sonner';
import { contactChannel, contactIdentifier } from '@/lib/contacts/identity';
import { contactAllowedInFollowupMode, followupPickerContacts } from '@/lib/followups/contactPicker';
import { useWhatsAppInstancesSafe } from '@/hooks/useWhatsAppApi';
import { ehNumeroOficial, numeroDoEnvio } from '@/lib/followups/numeroDoEnvio';
import { EscolherTemplate } from '@/components/templates/EscolherTemplate';
import { TEMPLATE_VAZIO, templateCompleto, templateDoBanco, type TemplateEscolhido } from '@/lib/templates/escolherTemplate';

interface FollowupSchedulerProps {
  onClose: () => void;
  /**
   * Editar: o mesmo formulário de criar (achado 98). O modo e o contato ficam
   * fixos; tipo, mensagem ou template, data, hora, prioridade, recorrência e
   * notas mudam. Antes a edição tinha outra lista de tipos, sem WhatsApp, não
   * mudava a mensagem e gravava o dia às 20h59.
   */
  followup?: IndividualFollowup | null;
}

/** Tipos que só existem em follow up antigo: aparecem na edição dele, não na criação. */
const TIPOS_ANTIGOS: Record<string, string> = {
  meeting: 'Reunião',
  visit: 'Visita',
  task: 'Tarefa',
  other: 'Outro',
};

/** Modo do formulário a partir do follow up gravado (tarefa de sequência edita como manual). */
const modoDoFollowup = (f: IndividualFollowup): FollowupMode => (f.mode === 'scheduled' ? 'scheduled' : 'manual');

/** Dia e hora de Brasília do follow up gravado: o envio (agendado) ou o prazo. */
function quandoDoFollowup(f: IndividualFollowup): { date: Date | undefined; time: string } {
  const iso = (f.mode === 'scheduled' ? f.scheduled_at : null) ?? f.due_date;
  if (!iso) return { date: undefined, time: '' };
  const instante = new Date(iso);
  return { date: dataParaCalendario(diaEmBrasilia(instante)), time: horaEmBrasilia(instante) };
}

const followupTypes = [
  { id: 'call', name: 'Ligação', icon: Phone, description: 'Fazer uma ligação telefônica' },
  { id: 'email', name: 'Email', icon: Mail, description: 'Enviar um email' },
  { id: 'whatsapp', name: 'WhatsApp', icon: MessageSquare, description: 'Enviar mensagem no WhatsApp' },
];

const modeOptions: { id: FollowupMode; name: string; icon: typeof Hand; description: string }[] = [
  { id: 'manual', name: 'Manual', icon: Hand, description: 'Tarefa para você executar e concluir' },
  { id: 'scheduled', name: 'Agendado', icon: Send, description: 'Envia WhatsApp automático na data/hora' },
  { id: 'sequence', name: 'Sequência', icon: Workflow, description: 'Cadência automática de vários passos' },
];

const taskTemplates = [
  'Ligar para apresentar nova proposta',
  'Enviar material complementar por email',
  'Follow up sobre proposta enviada',
  'Verificar interesse no produto/serviço',
  'Agendar reunião de apresentação',
  'Solicitar feedback sobre atendimento',
];

export const FollowupScheduler = ({ onClose, followup = null }: FollowupSchedulerProps) => {
  const editando = !!followup;
  const { createFollowup, updateFollowup, deleteFollowup } = useFollowupMutations();
  const { sequences, loading: sequencesLoading, enrollContact } = useFollowupSequences();
  const { contacts, loading: contactsLoading } = useContacts();
  const tenantId = useTenantId();

  const [mode, setMode] = useState<FollowupMode>(followup ? modoDoFollowup(followup) : 'manual');
  const [quandoOriginal] = useState(() => (followup ? quandoDoFollowup(followup) : { date: undefined, time: '' }));
  const [formData, setFormData] = useState(() => ({
    contactId: followup?.contact_id ?? '',
    // O título automático do agendado não volta para o campo.
    task: followup?.task && followup.task !== 'Envio agendado de WhatsApp' ? followup.task : '',
    type: followup && followup.mode !== 'scheduled' ? followup.type ?? '' : '',
    priority: followup?.priority ?? 'medium',
    date: quandoOriginal.date,
    time: quandoOriginal.time,
    notes: followup?.notes ?? '',
    messageBody: followup?.message_body ?? '',
    sequenceId: '',
    recurring: followup?.recurring ?? false,
    recurringType: followup?.recurring_type ?? 'weekly',
    recurringCount: followup?.recurring_count ?? 1,
  }));
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // Envio agendado por número da API Oficial: mensagem livre ou template
  // aprovado escolhido da lista (achado 93, decisão D12).
  const [porTemplate, setPorTemplate] = useState(!!followup?.template_name);
  const [template, setTemplate] = useState<TemplateEscolhido>(followup ? templateDoBanco(followup) : TEMPLATE_VAZIO);
  const { instances } = useWhatsAppInstancesSafe();
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Janela de 24h: timestamp da última mensagem recebida do contato.
  const [windowOpen, setWindowOpen] = useState<boolean | null>(null);

  // Checa a janela de 24h ao escolher contato (modo agendado/sequência).
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!formData.contactId || mode === 'manual' || !tenantId) {
        setWindowOpen(null);
        return;
      }
      // Só o instante do último inbound do contato, da Loja inteira
      // (loja_contact_last_message, migração 20260914000001). A janela de 24h
      // é um fato do WhatsApp, não da visibilidade de quem agenda: um atendente
      // restrito também precisa saber se pode mandar texto livre.
      const { data } = await (supabase as any).rpc('loja_contact_last_message', {
        p_tenant_id: tenantId,
        p_direction: 'inbound',
        p_contact_id: formData.contactId,
      });
      if (cancelled) return;
      const lastAt = (data as Array<{ last_at: string }> | null)?.[0]?.last_at;
      if (!lastAt) {
        setWindowOpen(false);
        return;
      }
      const last = new Date(lastAt).getTime();
      setWindowOpen(Date.now() - last < 24 * 60 * 60 * 1000);
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [formData.contactId, mode, tenantId]);

  const selectedContact = contacts.find((c) => c.id === formData.contactId);
  const numero = numeroDoEnvio(
    instances.map((i) => i.row),
    [followup?.whatsapp_instance_id, selectedContact?.whatsapp_instance_id],
  );
  const usaTemplate = mode === 'scheduled' && ehNumeroOficial(numero) && porTemplate;
  const selectedType = followupTypes.find((t) => t.id === formData.type);
  // Agendado e Sequência mandam WhatsApp sozinhos: contato do Instagram não
  // entra na lista deles (ver lib/followups/contactPicker.ts).
  const pickerContacts = followupPickerContacts(contacts, mode);

  const changeMode = (next: FollowupMode) => {
    setMode(next);
    // Contato do Instagram escolhido no Manual não pode seguir para um modo que
    // envia WhatsApp: a escolha é desfeita e a pessoa escolhe de novo.
    if (selectedContact && !contactAllowedInFollowupMode(selectedContact, next)) {
      setFormData((p) => ({ ...p, contactId: '' }));
    }
  };

  const validateForm = () => {
    const e: Record<string, string> = {};
    if (!formData.contactId) e.contactId = 'Selecione um contato';
    else if (selectedContact && !contactAllowedInFollowupMode(selectedContact, mode)) {
      e.contactId = 'Contato do Instagram não recebe WhatsApp automático. Use o modo Manual.';
    }

    if (mode === 'sequence') {
      if (!formData.sequenceId) e.sequenceId = 'Selecione a sequência';
      setErrors(e);
      return Object.keys(e).length === 0;
    }

    if (mode === 'manual') {
      if (!formData.task.trim()) e.task = 'Descrição da tarefa é obrigatória';
      if (!formData.type) e.type = 'Selecione o tipo de follow up';
    }
    if (mode === 'scheduled') {
      if (usaTemplate) {
        if (!templateCompleto(template)) e.template = 'Escolha o template e preencha as variáveis';
      } else if (!formData.messageBody.trim()) {
        e.messageBody = 'Escreva a mensagem a enviar';
      }
    }

    if (!formData.date) e.date = 'Selecione uma data';
    if (!formData.time) {
      e.time = 'Selecione um horário';
    } else if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(formData.time)) {
      e.time = 'Formato de horário inválido (HH:MM)';
    }
    // Hora de Brasília. Na edição, data e hora que não mudaram não são
    // cobradas: dá para ajustar a nota de uma tarefa atrasada sem remarcar.
    const mudouQuando =
      !editando ||
      formData.time !== quandoOriginal.time ||
      formData.date?.getTime() !== quandoOriginal.date?.getTime();
    if (formData.date && formData.time && mudouQuando && !horarioNoFuturo(diaDoCalendario(formData.date), formData.time)) {
      e.date = `Data e horário não podem ser no passado (agora são ${horaEmBrasilia(new Date())} em Brasília)`;
    }
    if (formData.recurring && formData.recurringCount < 1) {
      e.recurringCount = 'Número de repetições deve ser maior que 0';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.error('Por favor, corrija os erros no formulário');
      return;
    }
    setIsSubmitting(true);
    try {
      // Modo SEQUÊNCIA: apenas inscreve o contato na cadência.
      if (mode === 'sequence') {
        const ok = await enrollContact({
          sequenceId: formData.sequenceId,
          contactId: formData.contactId,
        });
        if (ok) onClose();
        return;
      }

      // O dia e a hora escolhidos são de Brasília, em qualquer computador.
      const instante = instanteEmBrasilia(diaDoCalendario(formData.date!), formData.time);
      if (!instante) throw new Error('horário inválido');
      const iso = instante.toISOString();

      const base = {
        contact_id: formData.contactId,
        priority: formData.priority,
        due_date: iso,
        recurring: formData.recurring,
        recurring_type: formData.recurring ? formData.recurringType : null,
        recurring_count: formData.recurring ? formData.recurringCount : null,
      };

      const payload =
        mode === 'scheduled'
          ? {
              ...base,
              mode: 'scheduled' as const,
              type: 'whatsapp',
              task: formData.task.trim() || 'Envio agendado de WhatsApp',
              message_body: usaTemplate ? null : formData.messageBody,
              // Com template, o número fica gravado: a lista era a da conta
              // Meta dele, e outro número poderia não ter aquele template.
              whatsapp_instance_id: usaTemplate ? numero?.id ?? null : followup?.whatsapp_instance_id ?? null,
              template_name: usaTemplate ? template.nome.trim() : null,
              template_language: usaTemplate ? template.idioma : null,
              template_params: usaTemplate && template.parametros.length > 0 ? template.parametros : null,
              scheduled_at: iso,
              notes: formData.notes || null,
            }
          : {
              ...base,
              mode: 'manual' as const,
              type: formData.type,
              task: formData.task,
              notes: formData.notes || null,
            };

      if (followup) {
        // Na edição o contato e o modo ficam; o resto é o que está na tela.
        const { contact_id: _contato, mode: _modo, ...mudancas } = payload as Record<string, unknown>;
        const ok = await updateFollowup(followup.id, mudancas as never);
        if (ok) onClose();
        return;
      }

      const result = await createFollowup(payload as never);
      if (result) {
        toast.success(mode === 'scheduled' ? 'Envio agendado!' : 'Follow up criado!');
        onClose();
      }
    } catch (error) {
      toast.error('Não foi possível salvar o follow up. Tente de novo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactSelect = (
    <div className="space-y-2">
      <Label>Contato *</Label>
      <Select
        value={formData.contactId}
        onValueChange={(v) => {
          setFormData((p) => ({ ...p, contactId: v }));
          setErrors((p) => ({ ...p, contactId: '' }));
        }}
        disabled={contactsLoading || editando}
      >
        <SelectTrigger aria-label="Contato" className={errors.contactId ? 'border-destructive' : ''}>
          <SelectValue placeholder={contactsLoading ? 'Carregando contatos...' : 'Selecione um contato'} />
        </SelectTrigger>
        <SelectContent>
          {pickerContacts.length > 0 ? (
            pickerContacts.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {/* WhatsApp: "Nome (telefone)", como sempre. Instagram: o @ no
                      lugar do telefone — e só o @ quando ainda não há nome. */}
                  {contactChannel(c) === 'instagram' && !c.name?.trim() ? (
                    <span>{contactIdentifier(c)}</span>
                  ) : (
                    <>
                      <span>{c.name}</span>
                      <span className="text-muted-foreground text-sm">({contactIdentifier(c)})</span>
                    </>
                  )}
                </div>
              </SelectItem>
            ))
          ) : (
            <SelectItem value="no-contacts" disabled>
              Nenhum contato encontrado
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {errors.contactId && <p className="text-sm text-destructive">{errors.contactId}</p>}
    </div>
  );

  const dateTimeFields = (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label>{mode === 'scheduled' ? 'Data do envio' : 'Data'}</Label>
        <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !formData.date && 'text-muted-foreground',
                errors.date && 'border-destructive',
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formData.date ? format(formData.date, 'PPP', { locale: ptBR }) : 'Selecionar data'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={formData.date}
              onSelect={(date) => {
                setFormData((p) => ({ ...p, date }));
                setIsDatePickerOpen(false);
                setErrors((p) => ({ ...p, date: '' }));
              }}
              disabled={(date) =>
                diaJaPassouEmBrasilia(diaDoCalendario(date)) && date.getTime() !== quandoOriginal.date?.getTime()
              }
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        {errors.date && <p className="text-sm text-destructive mt-1">{errors.date}</p>}
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="time">{mode === 'scheduled' ? 'Hora do envio' : 'Hora'}</Label>
          <DicaDoCampo
            rotulo={mode === 'scheduled' ? 'Hora do envio' : 'Hora'}
            texto="Hora de Brasília. Hoje vale, desde que a hora ainda não tenha passado."
          />
        </div>
        <div className="relative">
          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="time"
            type="time"
            value={formData.time}
            onChange={(e) => {
              setFormData((p) => ({ ...p, time: e.target.value }));
              setErrors((p) => ({ ...p, time: '' }));
            }}
            className={`pl-10 ${errors.time ? 'border-destructive' : ''}`}
          />
        </div>
        {errors.time && <p className="text-sm text-destructive mt-1">{errors.time}</p>}
      </div>
    </div>
  );

  const recurrenceCard = (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Repeat className="w-5 h-5" /> Recorrência
          </CardTitle>
          <Switch
            aria-label="Recorrência"
            checked={formData.recurring}
            onCheckedChange={(checked) => setFormData((p) => ({ ...p, recurring: checked }))}
          />
        </div>
      </CardHeader>
      {formData.recurring && (
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Frequência</Label>
              <Select
                value={formData.recurringType}
                onValueChange={(v) => setFormData((p) => ({ ...p, recurringType: v }))}
              >
                <SelectTrigger aria-label="Frequência"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diário</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="recurringCount">Repetições</Label>
              <Input
                id="recurringCount"
                type="number"
                min="1"
                max="365"
                value={formData.recurringCount}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, recurringCount: parseInt(e.target.value) || 1 }))
                }
                className={errors.recurringCount ? 'border-destructive' : ''}
              />
              {errors.recurringCount && (
                <p className="text-sm text-destructive mt-1">{errors.recurringCount}</p>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar Follow up' : 'Novo Follow up'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Seletor de MODO (na edição o modo fica: só aparece o escolhido) */}
          {editando ? (
            <p className="text-sm text-muted-foreground">
              {mode === 'scheduled'
                ? 'Envio agendado de WhatsApp: a mensagem sai sozinha na data e hora marcadas.'
                : 'Lembrete para quem atende, sem mensagem automática.'}
            </p>
          ) : (
          <div>
            <Label>Como este follow up vai funcionar?</Label>
            <div className="grid grid-cols-3 gap-3 mt-2">
              {modeOptions.map((m) => {
                const Icon = m.icon;
                return (
                  <Card
                    key={m.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      mode === m.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => changeMode(m.id)}
                  >
                    <CardContent className="p-4 text-center">
                      <Icon className="w-6 h-6 mx-auto mb-2 text-primary" />
                      <h4 className="font-medium text-sm">{m.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
          )}

          {contactSelect}

          {/* Indicador de janela de 24h (modos com envio) */}
          {mode !== 'manual' && formData.contactId && windowOpen !== null && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-md border p-3 text-sm',
                windowOpen
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-warning/30 bg-warning/10 text-warning',
              )}
            >
              {windowOpen ? (
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <span>
                {windowOpen
                  ? 'Janela de 24h aberta: pode enviar mensagem livre.'
                  : ehNumeroOficial(numero)
                  ? 'Fora da janela de 24h. Este número é da API Oficial: só template aprovado chega. Escolha "Template aprovado" abaixo.'
                  : 'Fora da janela de 24h. Em número oficial (Meta), só template aprovado será entregue; o envio livre pode ser bloqueado por conformidade.'}
              </span>
            </div>
          )}

          {/* MODO SEQUÊNCIA */}
          {mode === 'sequence' && (
            <div className="space-y-2">
              <Label>Sequência *</Label>
              {sequencesLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando sequências...
                </div>
              ) : sequences.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma sequência criada ainda. Crie uma em Follow ups → Sequências.
                </p>
              ) : (
                <Select
                  value={formData.sequenceId}
                  onValueChange={(v) => {
                    setFormData((p) => ({ ...p, sequenceId: v }));
                    setErrors((p) => ({ ...p, sequenceId: '' }));
                  }}
                >
                  <SelectTrigger aria-label="Sequência" className={errors.sequenceId ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Selecione a sequência" />
                  </SelectTrigger>
                  <SelectContent>
                    {sequences
                      .filter((s) => s.is_active)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.steps.length} passos)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              {errors.sequenceId && <p className="text-sm text-destructive">{errors.sequenceId}</p>}
            </div>
          )}

          {/* MODO MANUAL: tipo da tarefa */}
          {mode === 'manual' && (
            <div>
              <Label>Tipo de Follow up</Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                {[
                  ...followupTypes,
                  // Follow up antigo com tipo que a criação não oferece mais: aparece
                  // marcado em vez de abrir vazio.
                  ...(TIPOS_ANTIGOS[formData.type]
                    ? [{ id: formData.type, name: TIPOS_ANTIGOS[formData.type]!, icon: Clock, description: '' }]
                    : []),
                ].map((type) => {
                  const Icon = type.icon;
                  return (
                    <Card
                      key={type.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        formData.type === type.id ? 'ring-2 ring-primary' : ''
                      } ${errors.type ? 'border-destructive' : ''}`}
                      onClick={() => {
                        setFormData((p) => ({ ...p, type: type.id }));
                        setErrors((p) => ({ ...p, type: '' }));
                      }}
                    >
                      <CardContent className="p-4 text-center">
                        <Icon className="w-6 h-6 mx-auto mb-2 text-primary" />
                        <h4 className="font-medium text-sm">{type.name}</h4>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              {errors.type && <p className="text-sm text-destructive mt-1">{errors.type}</p>}
            </div>
          )}

          {/* MODO MANUAL: descrição da tarefa */}
          {mode === 'manual' && (
            <div>
              <Label htmlFor="task">Descrição da Tarefa</Label>
              <Textarea
                id="task"
                value={formData.task}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, task: e.target.value }));
                  setErrors((p) => ({ ...p, task: '' }));
                }}
                placeholder="Descreva o que deve ser feito..."
                className={errors.task ? 'border-destructive' : ''}
              />
              {errors.task && <p className="text-sm text-destructive mt-1">{errors.task}</p>}
              <div className="mt-2">
                <p className="text-sm text-muted-foreground mb-2">Modelos sugeridos:</p>
                <div className="flex flex-wrap gap-1">
                  {taskTemplates.map((t, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent text-xs"
                      onClick={() => setFormData((p) => ({ ...p, task: t }))}
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* MODO AGENDADO: número oficial escolhe entre mensagem e template */}
          {mode === 'scheduled' && ehNumeroOficial(numero) && (
            <div className="space-y-3">
              <Label>Tipo de envio</Label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { valor: false, titulo: 'Mensagem', texto: 'Texto livre: só chega a quem escreveu nas últimas 24 horas' },
                  { valor: true, titulo: 'Template aprovado', texto: 'Mensagem pronta que a Meta aprovou: chega a qualquer contato' },
                ] as const).map((op) => (
                  <button
                    key={op.titulo}
                    type="button"
                    onClick={() => {
                      setPorTemplate(op.valor);
                      setErrors((p) => ({ ...p, template: '', messageBody: '' }));
                    }}
                    aria-pressed={porTemplate === op.valor}
                    className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                      porTemplate === op.valor ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <span className="text-sm font-medium">{op.titulo}</span>
                    <span className="text-xs text-muted-foreground">{op.texto}</span>
                  </button>
                ))}
              </div>
              {usaTemplate && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <EscolherTemplate
                    instanceId={numero?.id ?? null}
                    valor={template}
                    aoMudar={(v) => {
                      setTemplate(v);
                      setErrors((p) => ({ ...p, template: '' }));
                    }}
                    dicaDasVariaveis="Pode usar {{primeiro_nome}}, {{contact_name}} ou {{telefone}}: o contato recebe o dele."
                    idBase="followup-tpl"
                  />
                  {errors.template && <p className="text-sm text-destructive mt-2">{errors.template}</p>}
                </div>
              )}
            </div>
          )}

          {/* MODO AGENDADO: composição da mensagem */}
          {mode === 'scheduled' && !usaTemplate && (
            <div>
              <Label htmlFor="messageBody">Mensagem a enviar</Label>
              <Textarea
                id="messageBody"
                value={formData.messageBody}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, messageBody: e.target.value }));
                  setErrors((p) => ({ ...p, messageBody: '' }));
                }}
                placeholder="Olá {{primeiro_nome}}, tudo bem? ..."
                rows={4}
                className={errors.messageBody ? 'border-destructive' : ''}
              />
              {errors.messageBody && <p className="text-sm text-destructive mt-1">{errors.messageBody}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                Variáveis: {'{{contact_name}}'}, {'{{primeiro_nome}}'}, {'{{telefone}}'}
              </p>
            </div>
          )}

          {/* Data/hora — manual (vencimento) e agendado (envio) */}
          {mode !== 'sequence' && dateTimeFields}

          {/* Prioridade — manual e agendado */}
          {mode !== 'sequence' && (
            <div>
              <Label>Prioridade</Label>
              <Select
                value={formData.priority}
                onValueChange={(v) => setFormData((p) => ({ ...p, priority: v }))}
              >
                <SelectTrigger aria-label="Prioridade"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Recorrência — manual e agendado */}
          {mode !== 'sequence' && recurrenceCard}

          {/* Notas — manual e agendado */}
          {mode !== 'sequence' && (
            <div>
              <Label htmlFor="notes">Notas Adicionais</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Informações extras sobre este follow up..."
              />
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            {editando && (
              <Button
                variant="outline"
                className="mr-auto text-destructive"
                onClick={() => setConfirmarExclusao(true)}
                disabled={isSubmitting || excluindo}
              >
                Excluir
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting || contactsLoading}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : editando ? (
                'Salvar alterações'
              ) : mode === 'sequence' ? (
                'Inscrever na sequência'
              ) : mode === 'scheduled' ? (
                'Agendar envio'
              ) : (
                'Criar follow up'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>

      {followup && (
        <ConfirmationDialog
          isOpen={confirmarExclusao}
          onClose={() => setConfirmarExclusao(false)}
          onConfirm={async () => {
            setExcluindo(true);
            const ok = await deleteFollowup(followup.id);
            setExcluindo(false);
            if (ok) onClose();
          }}
          title="Excluir este follow up?"
          description="O lembrete sai da lista e, se ele era um envio agendado, a mensagem não é mais enviada."
          reversivel={false}
          confirmText="Excluir follow up"
          variant="destructive"
          isLoading={excluindo}
        />
      )}
    </Dialog>
  );
};

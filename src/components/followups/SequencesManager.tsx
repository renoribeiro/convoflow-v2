import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { Plus, Trash2, Workflow, MessageSquare, Hand, Loader2, GripVertical } from 'lucide-react';
import { useFollowupSequences } from '@/hooks/useFollowupSequences';
import { sequenceFormSchema } from '@/lib/validations/followup';
import type { SequenceActionType, SequenceDelayUnit } from '@/lib/followups/types';
import { toast } from 'sonner';

interface StepDraft {
  action_type: SequenceActionType;
  delay_amount: number;
  delay_unit: SequenceDelayUnit;
  message_body: string;
  task_title: string;
  task_priority: 'high' | 'medium' | 'low';
}

const emptyStep = (): StepDraft => ({
  action_type: 'whatsapp',
  delay_amount: 1,
  delay_unit: 'days',
  message_body: '',
  task_title: '',
  task_priority: 'medium',
});

const unitLabel: Record<SequenceDelayUnit, string> = {
  minutes: 'minuto(s)',
  hours: 'hora(s)',
  days: 'dia(s)',
};

function SequenceBuilderModal({ onClose }: { onClose: () => void }) {
  const { createSequence } = useFollowupSequences();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stopOnReply, setStopOnReply] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [saving, setSaving] = useState(false);

  const updateStep = (i: number, patch: Partial<StepDraft>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStep = () => setSteps((prev) => [...prev, emptyStep()]);
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const values = {
      name,
      description: description || null,
      is_active: isActive,
      stop_on_reply: stopOnReply,
      steps: steps.map((s) => ({
        action_type: s.action_type,
        delay_amount: Number(s.delay_amount) || 0,
        delay_unit: s.delay_unit,
        message_body: s.action_type === 'whatsapp' ? s.message_body : null,
        task_title: s.action_type === 'manual_task' ? s.task_title : null,
        task_priority: s.task_priority,
      })),
    };
    const parsed = sequenceFormSchema.safeParse(values);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Revise os dados da sequência');
      return;
    }
    setSaving(true);
    const result = await createSequence(parsed.data);
    setSaving(false);
    if (result) onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova sequência de follow-up</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="seq-name">Nome *</Label>
            <Input
              id="seq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Reativação de leads frios"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seq-desc">Descrição</Label>
            <Textarea
              id="seq-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para que serve esta sequência..."
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="font-medium text-sm">Parar ao receber resposta</p>
              <p className="text-xs text-muted-foreground">
                Pausa a cadência automaticamente quando o contato responder.
              </p>
            </div>
            <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="font-medium text-sm">Ativa</p>
              <p className="text-xs text-muted-foreground">
                Sequências inativas não inscrevem novos contatos.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Passos */}
          <div className="space-y-3">
            <Label>Passos da cadência</Label>
            {steps.map((step, i) => (
              <Card key={i} className="border-l-4 border-l-primary/40">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                      Passo {i + 1}
                    </div>
                    {steps.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeStep(i)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Ação</Label>
                      <Select
                        value={step.action_type}
                        onValueChange={(v) => updateStep(i, { action_type: v as SequenceActionType })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="whatsapp">
                            <span className="flex items-center gap-2">
                              <MessageSquare className="w-4 h-4" /> WhatsApp (automático)
                            </span>
                          </SelectItem>
                          <SelectItem value="manual_task">
                            <span className="flex items-center gap-2">
                              <Hand className="w-4 h-4" /> Tarefa manual
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">
                        {i === 0 ? 'Após a inscrição' : 'Após o passo anterior'}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={0}
                          value={step.delay_amount}
                          onChange={(e) => updateStep(i, { delay_amount: parseInt(e.target.value) || 0 })}
                          className="w-20"
                        />
                        <Select
                          value={step.delay_unit}
                          onValueChange={(v) => updateStep(i, { delay_unit: v as SequenceDelayUnit })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">{unitLabel.minutes}</SelectItem>
                            <SelectItem value="hours">{unitLabel.hours}</SelectItem>
                            <SelectItem value="days">{unitLabel.days}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {step.action_type === 'whatsapp' ? (
                    <div>
                      <Label className="text-xs">Mensagem</Label>
                      <Textarea
                        value={step.message_body}
                        onChange={(e) => updateStep(i, { message_body: e.target.value })}
                        placeholder="Olá {{primeiro_nome}}, ..."
                        rows={3}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Tarefa do operador</Label>
                        <Input
                          value={step.task_title}
                          onChange={(e) => updateStep(i, { task_title: e.target.value })}
                          placeholder="Ex.: Ligar para o cliente"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Prioridade</Label>
                        <Select
                          value={step.task_priority}
                          onValueChange={(v) =>
                            updateStep(i, { task_priority: v as 'high' | 'medium' | 'low' })
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">Alta</SelectItem>
                            <SelectItem value="medium">Média</SelectItem>
                            <SelectItem value="low">Baixa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" size="sm" onClick={addStep}>
              <Plus className="w-4 h-4 mr-2" /> Adicionar passo
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Criar sequência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SequencesManager() {
  const { sequences, loading, deleteSequence, toggleActive } = useFollowupSequences();
  const [showBuilder, setShowBuilder] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Cadências automáticas multi-passo (WhatsApp + tarefas). Pausam ao receber resposta.</span>
          <FeatureHelp helpKey="page:followups-sequences" />
        </p>
        <Button size="sm" onClick={() => setShowBuilder(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova sequência
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando sequências...
        </div>
      ) : sequences.length === 0 ? (
        <EmptyState
          icon={<Workflow className="w-full h-full" />}
          title="Nenhuma sequência criada"
          description="Crie uma cadência para acompanhar contatos automaticamente."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sequences.map((seq) => (
            <Card key={seq.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Workflow className="w-4 h-4 text-primary" />
                    {seq.name}
                  </CardTitle>
                  <Switch
                    checked={seq.is_active}
                    onCheckedChange={(c) => toggleActive(seq.id, c)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {seq.description && (
                  <p className="text-sm text-muted-foreground">{seq.description}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{seq.steps.length} passo(s)</Badge>
                  {seq.stop_on_reply && <Badge variant="secondary">Para ao responder</Badge>}
                  <Badge variant={seq.is_active ? 'default' : 'outline'}>
                    {seq.is_active ? 'Ativa' : 'Inativa'}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {seq.steps.map((st) => (
                    <div key={st.id} className="text-xs text-muted-foreground flex items-center gap-2">
                      {st.action_type === 'whatsapp' ? (
                        <MessageSquare className="w-3 h-3" />
                      ) : (
                        <Hand className="w-3 h-3" />
                      )}
                      Passo {st.step_order}: {st.action_type === 'whatsapp' ? 'WhatsApp' : 'Tarefa'} ·
                      após {st.delay_amount} {unitLabel[st.delay_unit as SequenceDelayUnit]}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Excluir a sequência "${seq.name}"?`)) deleteSequence(seq.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1 text-red-500" /> Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showBuilder && <SequenceBuilderModal onClose={() => setShowBuilder(false)} />}
    </div>
  );
}

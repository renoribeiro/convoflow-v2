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
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { Plus, Trash2, Workflow, MessageSquare, Hand, Loader2, GripVertical, Edit, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useFollowupSequences, type SequenceWithSteps } from '@/hooks/useFollowupSequences';
import { sequenceFormSchema } from '@/lib/validations/followup';
import type { SequenceActionType, SequenceDelayUnit } from '@/lib/followups/types';
import { toast } from 'sonner';
import { useMetaWabaGroups } from '@/hooks/useMetaTemplates';
import { EscolherTemplateDaLoja } from '@/components/templates/EscolherTemplate';
import { TEMPLATE_VAZIO, templateCompleto, templateDoBanco, type TemplateEscolhido } from '@/lib/templates/escolherTemplate';

interface StepDraft {
  action_type: SequenceActionType;
  delay_amount: number;
  delay_unit: SequenceDelayUnit;
  message_body: string;
  task_title: string;
  task_priority: 'high' | 'medium' | 'low';
  /** Passo de WhatsApp que sai como template aprovado (número da API Oficial). */
  por_template: boolean;
  template: TemplateEscolhido;
  /** Conta Meta da lista (instância alça), quando a Loja tem mais de uma. */
  conta_template: string | null;
}

const emptyStep = (): StepDraft => ({
  action_type: 'whatsapp',
  delay_amount: 1,
  delay_unit: 'days',
  message_body: '',
  task_title: '',
  task_priority: 'medium',
  por_template: false,
  template: TEMPLATE_VAZIO,
  conta_template: null,
});

/** O passo gravado, de volta para o formulário (editar). */
const passoDoBanco = (st: SequenceWithSteps['steps'][number]): StepDraft => ({
  action_type: (st.action_type as SequenceActionType) ?? 'whatsapp',
  delay_amount: st.delay_amount ?? 0,
  delay_unit: (st.delay_unit as SequenceDelayUnit) ?? 'days',
  message_body: st.message_body ?? '',
  task_title: st.task_title ?? '',
  task_priority: (st.task_priority as StepDraft['task_priority']) ?? 'medium',
  por_template: !!st.template_name,
  template: templateDoBanco(st),
  conta_template: null,
});

const unitLabel: Record<SequenceDelayUnit, string> = {
  minutes: 'minuto(s)',
  hours: 'hora(s)',
  days: 'dia(s)',
};

type AcoesDaLista = Pick<ReturnType<typeof useFollowupSequences>, 'createSequence' | 'updateSequence'>;

/**
 * Recebe as ações da lista (não abre outro useFollowupSequences): assim, ao
 * salvar, é a lista da tela que recarrega.
 */
function SequenceBuilderModal({
  onClose,
  acoes,
  sequencia = null,
}: {
  onClose: () => void;
  acoes: AcoesDaLista;
  sequencia?: SequenceWithSteps | null;
}) {
  const { createSequence, updateSequence } = acoes;
  const editando = !!sequencia;
  const [name, setName] = useState(sequencia?.name ?? '');
  const [description, setDescription] = useState(sequencia?.description ?? '');
  const [stopOnReply, setStopOnReply] = useState(sequencia?.stop_on_reply ?? true);
  const [isActive, setIsActive] = useState(sequencia?.is_active ?? true);
  const [steps, setSteps] = useState<StepDraft[]>(
    sequencia && sequencia.steps.length > 0 ? sequencia.steps.map(passoDoBanco) : [emptyStep()],
  );
  const [saving, setSaving] = useState(false);
  // Template só existe na API Oficial: sem conta Meta na Loja, a escolha nem aparece.
  const { groups: contasMeta } = useMetaWabaGroups();
  const temApiOficial = contasMeta.length > 0;

  const updateStep = (i: number, patch: Partial<StepDraft>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStep = () => setSteps((prev) => [...prev, emptyStep()]);
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const passoSemTemplate = steps.findIndex(
      (s) => s.action_type === 'whatsapp' && s.por_template && !templateCompleto(s.template),
    );
    if (passoSemTemplate >= 0) {
      toast.error(`Passo ${passoSemTemplate + 1}: escolha o template aprovado e preencha as variáveis.`);
      return;
    }
    const values = {
      name,
      description: description || null,
      is_active: isActive,
      stop_on_reply: stopOnReply,
      steps: steps.map((s) => ({
        action_type: s.action_type,
        delay_amount: Number(s.delay_amount) || 0,
        delay_unit: s.delay_unit,
        message_body: s.action_type === 'whatsapp' && !(s.por_template && temApiOficial) ? s.message_body : null,
        ...(s.action_type === 'whatsapp' && s.por_template && temApiOficial
          ? {
              template_name: s.template.nome.trim(),
              template_language: s.template.idioma,
              template_params: s.template.parametros.length > 0 ? s.template.parametros : null,
            }
          : { template_name: null, template_language: null, template_params: null }),
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
    const result = sequencia ? await updateSequence(sequencia.id, parsed.data) : await createSequence(parsed.data);
    setSaving(false);
    if (result) onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar sequência' : 'Nova sequência de follow up'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Decisão D12: a edição vale só para quem entra depois. */}
          {sequencia && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Os passos novos valem para quem entrar na sequência daqui em diante.{' '}
                {sequencia.inscritosAtivos === 0
                  ? 'Ninguém está nela agora.'
                  : sequencia.inscritosAtivos === 1
                  ? '1 contato está nela agora e segue os passos antigos até o fim.'
                  : `${sequencia.inscritosAtivos.toLocaleString('pt-BR')} contatos estão nela agora e seguem os passos antigos até o fim.`}{' '}
                "Ativa" e "Parar ao receber resposta" valem na hora para todos.
              </AlertDescription>
            </Alert>
          )}
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
                Encerra a cadência do contato quando ele responder.
              </p>
            </div>
            <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="font-medium text-sm">Ativa</p>
              <p className="text-xs text-muted-foreground">
                Desligada, não inscreve ninguém e encerra quem está nela no próximo passo.
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
                    <div className="space-y-3">
                      {temApiOficial && (
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { valor: false, titulo: 'Mensagem' },
                            { valor: true, titulo: 'Template aprovado' },
                          ] as const).map((op) => (
                            <button
                              key={op.titulo}
                              type="button"
                              aria-pressed={step.por_template === op.valor}
                              onClick={() => updateStep(i, { por_template: op.valor })}
                              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                                step.por_template === op.valor ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:border-primary/50'
                              }`}
                            >
                              {op.titulo}
                            </button>
                          ))}
                        </div>
                      )}
                      {temApiOficial && step.por_template ? (
                        <EscolherTemplateDaLoja
                          instanceIdDaConta={step.conta_template}
                          aoMudarConta={(id) => updateStep(i, { conta_template: id })}
                          valor={step.template}
                          aoMudar={(v) => updateStep(i, { template: v })}
                          dicaDasVariaveis="Pode usar {{primeiro_nome}}, {{contact_name}} ou {{telefone}}."
                          idBase={`passo-${i}-tpl`}
                        />
                      ) : (
                        <div>
                          <Label htmlFor={`passo-${i}-msg`} className="text-xs">Mensagem</Label>
                          <Textarea
                            id={`passo-${i}-msg`}
                            value={step.message_body}
                            onChange={(e) => updateStep(i, { message_body: e.target.value })}
                            placeholder="Olá {{primeiro_nome}}, ..."
                            rows={3}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Tarefa para o atendente</Label>
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
            {editando ? 'Salvar alterações' : 'Criar sequência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SequencesManager() {
  const { sequences, loading, deleteSequence, toggleActive, createSequence, updateSequence } = useFollowupSequences();
  const acoes = { createSequence, updateSequence };
  // Excluir sequência pede a confirmação do sistema e diz o que acontece com
  // quem está nela (antes, a caixa do navegador só perguntava o nome).
  const [sequenciaParaExcluir, setSequenciaParaExcluir] = useState<{ id: string; name: string } | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  // Editar sequência (achado 99): o mesmo formulário de criar, preenchido.
  const [sequenciaEmEdicao, setSequenciaEmEdicao] = useState<SequenceWithSteps | null>(null);

  return (
    <div className="space-y-4">
      {/* No celular o botão desce para baixo do texto: lado a lado, ele saía
          da tela (lote 5 do checkup). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <span>Sequências de mensagens de WhatsApp e tarefas que seguem sozinhas, passo a passo. Com "Parar ao receber resposta", elas param quando o cliente responde.</span>
          <FeatureHelp helpKey="page:followups-sequences" />
        </p>
        <Button size="sm" className="shrink-0 self-start sm:self-auto" onClick={() => setShowBuilder(true)}>
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
          action={{ label: 'Nova sequência', onClick: () => setShowBuilder(true), icon: <Plus className="w-4 h-4 mr-2" /> }}
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
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setSequenciaEmEdicao(seq)}>
                    <Edit className="w-4 h-4 mr-1" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSequenciaParaExcluir({ id: seq.id, name: seq.name })}
                  >
                    <Trash2 className="w-4 h-4 mr-1 text-red-500" /> Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showBuilder && <SequenceBuilderModal acoes={acoes} onClose={() => setShowBuilder(false)} />}
      {sequenciaEmEdicao && (
        <SequenceBuilderModal acoes={acoes} sequencia={sequenciaEmEdicao} onClose={() => setSequenciaEmEdicao(null)} />
      )}

      <ConfirmationDialog
        isOpen={!!sequenciaParaExcluir}
        onClose={() => setSequenciaParaExcluir(null)}
        onConfirm={async () => {
          if (sequenciaParaExcluir) await deleteSequence(sequenciaParaExcluir.id);
        }}
        title={`Excluir a sequência "${sequenciaParaExcluir?.name ?? ''}"?`}
        description="A sequência e os passos dela somem. Os contatos que estão nela saem da sequência e não recebem os próximos passos. Para mudar os passos sem tirar ninguém, use Editar."
        reversivel={false}
        confirmText="Excluir sequência"
        variant="destructive"
      />
    </div>
  );
}

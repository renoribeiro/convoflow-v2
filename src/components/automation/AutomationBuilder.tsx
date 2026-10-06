import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useQuickReplies } from '@/hooks/useQuickReplies';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import { useTenantVariables } from '@/hooks/useTenantVariables';
import { ZoomIn, ZoomOut, Maximize, MousePointerClick } from 'lucide-react';
import { cn } from '@/lib/utils';

import { AutomationAnalytics } from './AutomationAnalytics';
import { StepCard } from './StepCard';
import { FlowConnector } from './FlowConnector';
import { StepConfigPanel } from './StepConfigPanel';
import { BuilderHeader } from './BuilderHeader';
import { EmptyBuilder } from './EmptyBuilder';
import { useAutomationStats } from './useAutomationStats';
import {
  getCatalogEntry,
  UNKNOWN_ENTRY,
  TRIGGERS,
  type CatalogEntry,
  type StepCategory,
} from './automationCatalog';
import { validateConfig, validateStep } from './stepValidation';

interface AutomationStep {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'delay';
  config: Record<string, any>;
  position: { x: number; y: number };
  connections: string[];
}

interface AutomationFlow {
  id?: string;
  name: string;
  description: string;
  active: boolean;
  steps: AutomationStep[];
  trigger_type: string;
  trigger_config: Record<string, any>;
}

interface AutomationBuilderProps {
  flowId?: string;
  onClose: () => void;
}

const TRIGGER_SEL = '__trigger__';

/** Resumo curto de uma etapa/gatilho para o subtítulo do card. */
function summarize(
  entry: CatalogEntry,
  config: Record<string, any>,
  ctx: { funnelStages: { id: string; name: string }[]; quickReplies: { id: string; name: string }[] },
): string {
  const stageName = (id: string) => ctx.funnelStages.find((s) => s.id === id)?.name || '—';
  const respostaName = (id: string) => ctx.quickReplies.find((r) => r.id === id)?.name || '—';
  switch (entry.key) {
    case 'send_message':
      return config.custom_message?.trim() || (config.quick_reply_id ? `Resposta rápida: ${respostaName(config.quick_reply_id)}` : '');
    case 'add_tag':
      return config.tag_name ? `Tag: ${config.tag_name}` : '';
    case 'update_contact':
      return config.value ? `${config.field === 'custom' ? config.custom_key : config.field || 'campo'} = ${config.value}` : '';
    case 'change_funnel_stage':
      return config.stage_id ? `Para: ${stageName(config.stage_id)}` : '';
    case 'schedule_followup':
      return config.delay_hours ? `${config.followup_type || 'whatsapp'} em ${config.delay_hours}h` : '';
    case 'delay':
      return config.delay_value ? `Aguardar ${config.delay_value} ${config.delay_type || ''}` : '';
    case 'variable_condition':
      return config.variable ? `{${config.variable}} ${config.operator || ''} ${config.value || ''}`.trim() : '';
    case 'contact_has_tag':
      return config.tag_name ? `Tem tag: ${config.tag_name}` : '';
    case 'contact_in_stage':
      return config.stage_id ? `Em: ${stageName(config.stage_id)}` : '';
    case 'message_contains':
      return Array.isArray(config.keywords) && config.keywords.length ? config.keywords.join(', ') : '';
    case 'variable_captured':
      return config.variable_name ? `Quando {${config.variable_name}} for capturada` : '';
    case 'message_received':
      return Array.isArray(config.keywords) && config.keywords.length ? `Palavras: ${config.keywords.join(', ')}` : 'Qualquer mensagem';
    case 'funnel_stage_changed':
      return config.to_stage ? `→ ${stageName(config.to_stage)}` : '';
    default:
      return '';
  }
}

export const AutomationBuilder = ({ flowId, onClose }: AutomationBuilderProps) => {
  const [flow, setFlow] = useState<AutomationFlow>({
    name: '',
    description: '',
    active: false,
    steps: [],
    trigger_type: '',
    trigger_config: {},
  });
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showHistory, setShowHistory] = useState(false);

  const { toast } = useToast();
  const { customVariables } = useTenantVariables();
  const { byFlow } = useAutomationStats();

  const { data: existingFlowData } = useSupabaseQuery({
    table: 'automation_flows',
    queryKey: ['automation-flow', flowId],
    select: '*',
    filters: flowId ? [{ column: 'id', operator: 'eq', value: flowId }] : [],
    enabled: !!flowId,
  });

  // Mesma fonte do popover do compositor e da aba de Configurações: uma resposta
  // criada em qualquer um dos três aparece aqui sem recarregar a página.
  const { quickReplies } = useQuickReplies();

  const { data: funnelStages = [] } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['funnel-stages'],
    select: 'id, name, color',
  });

  const saveFlowMutation = useSupabaseMutation({
    table: 'automation_flows',
    operation: flowId ? 'update' : 'insert',
    invalidateQueries: [['automation-flows']],
    successMessage: flowId ? 'Fluxo atualizado!' : 'Fluxo criado!',
  });

  // Carregar fluxo existente (ao editar) — tolera jsonb legado salvo como string.
  useEffect(() => {
    const row = existingFlowData?.[0] as Record<string, any> | undefined;
    if (!row) return;
    const parseJson = <T,>(value: unknown, fallback: T): T => {
      if (value == null) return fallback;
      if (typeof value === 'string') {
        try { return JSON.parse(value) as T; } catch { return fallback; }
      }
      return value as T;
    };
    setFlow({
      id: row.id,
      name: row.name ?? '',
      description: row.description ?? '',
      active: !!row.active,
      trigger_type: row.trigger_type ?? '',
      trigger_config: parseJson<Record<string, any>>(row.trigger_config, {}),
      steps: parseJson<AutomationStep[]>(row.steps, []),
    });
  }, [existingFlowData]);

  // ---- mutações de estado ----
  const updateStepConfig = (stepId: string, key: string, value: any) => {
    setFlow((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => (s.id === stepId ? { ...s, config: { ...s.config, [key]: value } } : s)),
    }));
  };

  const setStepSubtype = (stepId: string, subtype: string) => {
    const entry = getCatalogEntry(subtype);
    setFlow((prev) => ({
      ...prev,
      steps: prev.steps.map((s) =>
        s.id === stepId
          ? { ...s, type: (entry?.category ?? s.type) as AutomationStep['type'], config: { ...s.config, type: subtype } }
          : s,
      ),
    }));
  };

  const handleInsert = (index: number, subtype: string) => {
    const entry = getCatalogEntry(subtype);
    if (!entry) return;
    const newStep: AutomationStep = {
      id: `step_${Date.now()}`,
      type: entry.category as AutomationStep['type'],
      config: { type: subtype },
      position: { x: 0, y: 0 },
      connections: [],
    };
    setFlow((prev) => {
      const steps = [...prev.steps];
      steps.splice(index, 0, newStep);
      return { ...prev, steps };
    });
    setSelectedStep(newStep.id);
  };

  const removeStep = (stepId: string) => {
    setFlow((prev) => ({ ...prev, steps: prev.steps.filter((s) => s.id !== stepId) }));
    if (selectedStep === stepId) setSelectedStep(null);
  };

  const handleTriggerChange = (triggerType: string) => {
    setFlow((prev) => ({ ...prev, trigger_type: triggerType, trigger_config: {} }));
    setSelectedStep(TRIGGER_SEL);
  };

  const handleSave = async () => {
    try {
      setAttemptedSave(true);
      const missing: string[] = [];
      if (!flow.name.trim()) missing.push('dê um nome ao fluxo');
      if (!flow.trigger_type) missing.push('escolha um gatilho');
      if (flow.steps.length === 0) missing.push('adicione pelo menos uma etapa');
      if (missing.length > 0) {
        toast({ title: 'Faltou preencher', description: `Para salvar: ${missing.join('; ')}.`, variant: 'destructive' });
        return;
      }

      const dataToSave = {
        name: flow.name.trim(),
        description: flow.description || '',
        active: flow.active,
        trigger_type: flow.trigger_type,
        steps: flow.steps,
        trigger_config: flow.trigger_config,
      };

      if (flowId) {
        await saveFlowMutation.mutateAsync({ data: dataToSave, options: { filter: { column: 'id', operator: 'eq', value: flowId } } });
      } else {
        await saveFlowMutation.mutateAsync({ data: dataToSave });
      }
      onClose();
    } catch (error: any) {
      toast({ title: 'Erro', description: `Erro ao salvar fluxo: ${error?.message || 'desconhecido'}`, variant: 'destructive' });
    }
  };

  // ---- dados derivados ----
  const triggerEntry = getCatalogEntry(flow.trigger_type);
  const ctx = { funnelStages, quickReplies };
  const stat = flowId ? byFlow.get(flowId) : undefined;

  // painel: gatilho ou etapa selecionada
  const selectedStepObj = selectedStep && selectedStep !== TRIGGER_SEL ? flow.steps.find((s) => s.id === selectedStep) : null;
  const selectedEntry =
    selectedStep === TRIGGER_SEL
      ? triggerEntry
      : selectedStepObj
        ? getCatalogEntry(selectedStepObj.config.type) ?? UNKNOWN_ENTRY
        : null;

  const renderPanel = () => {
    if (selectedStep === TRIGGER_SEL && triggerEntry) {
      return (
        <div className="flex h-full flex-col">
          <div className="border-b p-3">
            <Label className="text-xs">Tipo de gatilho</Label>
            <Select value={flow.trigger_type} onValueChange={handleTriggerChange}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 overflow-hidden">
            <StepConfigPanel
              entry={triggerEntry}
              config={flow.trigger_config}
              onChange={(key, value) => setFlow((prev) => ({ ...prev, trigger_config: { ...prev.trigger_config, [key]: value } }))}
              funnelStages={funnelStages}
              quickReplies={quickReplies}
              customVariables={customVariables}
              attemptedSave={attemptedSave}
            />
          </div>
        </div>
      );
    }
    if (selectedStepObj && selectedEntry) {
      return (
        <StepConfigPanel
          entry={selectedEntry}
          config={selectedStepObj.config}
          onChange={(key, value) => updateStepConfig(selectedStepObj.id, key, value)}
          onChangeType={(subtype) => setStepSubtype(selectedStepObj.id, subtype)}
          funnelStages={funnelStages}
          quickReplies={quickReplies}
          customVariables={customVariables}
          attemptedSave={attemptedSave}
        />
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <MousePointerClick className="h-6 w-6 opacity-50" />
        <p>Clique no gatilho ou em uma etapa para configurar.</p>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <BuilderHeader
        name={flow.name}
        onNameChange={(v) => setFlow((p) => ({ ...p, name: v }))}
        nameInvalid={attemptedSave && !flow.name.trim()}
        active={flow.active}
        onActiveChange={(v) => setFlow((p) => ({ ...p, active: v }))}
        stat={stat}
        onSave={handleSave}
        saving={saveFlowMutation.isPending}
        onClose={onClose}
        onHistory={() => (flowId ? setShowHistory(true) : toast({ title: 'Salve o fluxo primeiro', description: 'O histórico aparece depois que o fluxo é salvo.' }))}
      />

      <div className="flex flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
        {/* Canvas */}
        <div className="relative flex-1 overflow-auto rounded-xl border bg-muted/20 bg-dot-thick-neutral-300 dark:bg-dot-thick-neutral-800">
          {!flow.trigger_type ? (
            <EmptyBuilder onPick={handleTriggerChange} />
          ) : (
            <div className="origin-top transition-transform" style={{ transform: `scale(${zoom})` }}>
              <div className="flex flex-col items-center gap-0 py-8">
                {/* Gatilho */}
                {triggerEntry && (
                  <StepCard
                    isTrigger
                    category="trigger"
                    Icon={triggerEntry.Icon}
                    title={triggerEntry.label}
                    subtitle={summarize(triggerEntry, flow.trigger_config, ctx) || triggerEntry.description}
                    status={validateConfig(triggerEntry, flow.trigger_config).complete ? 'complete' : 'incomplete'}
                    selected={selectedStep === TRIGGER_SEL}
                    onClick={() => setSelectedStep(TRIGGER_SEL)}
                  />
                )}

                {/* Etapas */}
                {flow.steps.map((step, i) => {
                  const entry = getCatalogEntry(step.config.type) ?? UNKNOWN_ENTRY;
                  const v = validateStep(step);
                  return (
                    <div key={step.id} className="flex flex-col items-center">
                      <FlowConnector active={flow.active} onInsert={(sub) => handleInsert(i, sub)} />
                      <StepCard
                        category={(entry.category as StepCategory) ?? 'action'}
                        Icon={entry.Icon}
                        title={entry.label}
                        subtitle={summarize(entry, step.config, ctx) || entry.description}
                        status={v.complete ? 'complete' : 'incomplete'}
                        selected={selectedStep === step.id}
                        onClick={() => setSelectedStep(step.id)}
                        onDelete={() => removeStep(step.id)}
                      />
                    </div>
                  );
                })}

                {/* Conector final (adicionar etapa) */}
                <FlowConnector active={flow.active} onInsert={(sub) => handleInsert(flow.steps.length, sub)} />
              </div>
            </div>
          )}

          {/* Controles de zoom */}
          {flow.trigger_type && (
            <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
              <button className="p-1.5 hover:bg-muted" title="Aproximar" aria-label="Aproximar" onClick={() => setZoom((z) => Math.min(1.3, +(z + 0.1).toFixed(2)))}>
                <ZoomIn className="h-4 w-4" />
              </button>
              <button className="p-1.5 hover:bg-muted" title="Resetar zoom" aria-label="Resetar zoom" onClick={() => setZoom(1)}>
                <Maximize className="h-4 w-4" />
              </button>
              <button className="p-1.5 hover:bg-muted" title="Afastar" aria-label="Afastar" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}>
                <ZoomOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Painel lateral */}
        <aside className="shrink-0 overflow-hidden rounded-xl border bg-card lg:w-80">
          {renderPanel()}
        </aside>
      </div>

      {/* Histórico */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de execuções</DialogTitle>
          </DialogHeader>
          {flowId && <AutomationAnalytics flowId={flowId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/**
 * Painel de configuração de um gatilho/etapa. Cabeçalho com ícone + cor da
 * categoria, campos vindos do catálogo (com tooltip "?" e validação inline),
 * seção avançada em accordion, e prévia de mensagem + selo de janela 24h para
 * o "Enviar Mensagem".
 */
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle, Clock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VariableTextField } from '@/components/shared/VariableTextField';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { MessagePreview } from './MessagePreview';
import { AddStepPopover } from './AddStepPopover';
import {
  CATEGORY_STYLES,
  type CatalogEntry,
  type CatalogField,
} from './automationCatalog';
import { validateConfig } from './stepValidation';

interface StepConfigPanelProps {
  entry: CatalogEntry;
  config: Record<string, any>;
  onChange: (key: string, value: any) => void;
  funnelStages: { id: string; name: string }[];
  quickReplies: { id: string; name: string; content?: string }[];
  customVariables: string[];
  attemptedSave?: boolean;
  /** Para etapas sem tipo definido ainda: troca o subtipo. */
  onChangeType?: (subtype: string) => void;
}

export const StepConfigPanel: React.FC<StepConfigPanelProps> = ({
  entry,
  config,
  onChange,
  funnelStages,
  quickReplies,
  customVariables,
  attemptedSave = false,
  onChangeType,
}) => {
  const s = CATEGORY_STYLES[entry.category];
  const validation = validateConfig(entry, config);
  const isMissing = (key: string) => attemptedSave && validation.missingKeys.includes(key);

  const resolveOptions = (field: CatalogField): { id: string; name: string }[] => {
    if (field.options) return field.options;
    if (field.optionsSource === 'funnelStages') return funnelStages;
    if (field.optionsSource === 'quickReplies')
      return quickReplies.map((r) => ({ id: r.id, name: r.name }));
    return [];
  };

  const renderField = (field: CatalogField) => {
    const value = config[field.key];
    const set = (v: any) => onChange(field.key, v);
    const invalid = isMissing(field.key);
    const errClass = invalid ? 'border-destructive focus-visible:ring-destructive' : '';

    switch (field.type) {
      case 'text':
        return <Input value={value || ''} onChange={(e) => set(e.target.value)} placeholder={field.placeholder || field.label} className={errClass} />;
      case 'number':
        return <Input type="number" value={value ?? ''} onChange={(e) => set(Number(e.target.value))} placeholder={field.label} className={errClass} />;
      case 'time':
        return <Input type="time" value={value || ''} onChange={(e) => set(e.target.value)} className={errClass} />;
      case 'textarea':
        return <Textarea rows={3} value={value || ''} onChange={(e) => set(e.target.value)} placeholder={field.label} className={errClass} />;
      case 'boolean':
        return (
          <div className="flex items-center gap-2 pt-1">
            <Switch checked={!!value} onCheckedChange={set} />
            <span className="text-sm text-muted-foreground">{field.label}</span>
          </div>
        );
      case 'array':
        return (
          <Input
            value={Array.isArray(value) ? value.join(', ') : ''}
            onChange={(e) => set(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}
            placeholder={`${field.label} (separadas por vírgula)`}
            className={errClass}
          />
        );
      case 'text_with_vars':
        return <VariableTextField value={value || ''} onChange={set} customVariables={customVariables} placeholder={field.label} />;
      case 'textarea_with_vars':
        return <VariableTextField value={value || ''} onChange={set} customVariables={customVariables} multiline placeholder={field.label} />;
      case 'variable':
        return (
          <Select value={value || ''} onValueChange={set}>
            <SelectTrigger className={errClass}>
              <SelectValue placeholder="Selecione a variável" />
            </SelectTrigger>
            <SelectContent>
              {customVariables.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Nenhuma variável de chatbot encontrada. Crie um chatbot que colete dados (nó "Fazer Pergunta").
                </div>
              )}
              {customVariables.map((name) => (
                <SelectItem key={name} value={name}>{'{' + name + '}'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'select':
      default: {
        const opts = resolveOptions(field);
        return (
          <Select value={value || ''} onValueChange={set}>
            <SelectTrigger className={errClass}>
              <SelectValue placeholder={`Selecione ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {opts.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
    }
  };

  // IMPORTANTE: função que RETORNA JSX (chamada direta no .map), e não um
  // componente <FieldRow/>. Definir um componente dentro do render faz o React
  // remontar o input a cada tecla — o que tirava o foco/seleção ao digitar.
  const renderFieldRow = (field: CatalogField) => (
    <div key={field.key} className="space-y-1.5">
      {field.type !== 'boolean' && (
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">
            {field.label}
            {field.required && <span className="ml-0.5 text-destructive">*</span>}
          </Label>
          {field.help && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Ajuda" className="text-muted-foreground hover:text-foreground">
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{field.help}</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      {renderField(field)}
      {isMissing(field.key) && <p className="text-xs text-destructive">Campo obrigatório.</p>}
    </div>
  );

  // Etapa sem tipo definido: oferece o picker.
  if (entry.key === 'unknown' && onChangeType) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">Escolha o que esta etapa deve fazer:</p>
        <AddStepPopover onSelect={onChangeType} align="start">
          <button type="button" className="w-full rounded-lg border border-dashed p-3 text-sm hover:bg-muted">
            + Escolher tipo da etapa
          </button>
        </AddStepPopover>
      </div>
    );
  }

  const mainFields = entry.fields.filter((f) => !f.advanced);
  const advancedFields = entry.fields.filter((f) => f.advanced);
  const isSendMessage = entry.key === 'send_message';

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho */}
      <div className={cn('flex items-center gap-3 border-b p-4', s.cardBg)}>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm', s.iconBg)}>
          <entry.Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('text-[10px] font-semibold uppercase tracking-wide', s.text)}>{s.label}</p>
          <p className="truncate text-sm font-semibold">{entry.label}</p>
        </div>
        {entry.helpKey && <FeatureHelp helpKey={entry.helpKey} />}
      </div>

      {/* Corpo */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-xs text-muted-foreground">{entry.description}</p>

        {mainFields.map((field) => renderFieldRow(field))}

        {isSendMessage && (
          <>
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950/40">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-[11px] text-amber-800 dark:text-amber-200">
                Fora da janela de 24h, o WhatsApp só permite <strong>templates aprovados</strong>.
              </p>
            </div>
            <MessagePreview text={config.custom_message || ''} customVariables={customVariables} />
          </>
        )}

        {advancedFields.length > 0 && (
          <Accordion type="single" collapsible>
            <AccordionItem value="advanced" className="border-b-0">
              <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline">
                <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Opções avançadas</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                {advancedFields.map((field) => renderFieldRow(field))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Condições: deixa claro o comportamento "se falso, encerra" */}
        {entry.category === 'condition' && (
          <div className="rounded-md border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
            <p><span className="font-medium text-emerald-600 dark:text-emerald-400">✓ Se verdadeiro:</span> o fluxo continua.</p>
            <p><span className="font-medium text-red-500">✕ Se falso:</span> o fluxo é encerrado aqui.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StepConfigPanel;

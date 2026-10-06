import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { validateNodeData } from '@/lib/validations/chatbot-flow';
import { SYSTEM_VARIABLES } from '@/lib/chatbot/flowConstants';
import type { ConditionNodeData, ChatbotVariableRow } from '@/types/chatbot-flow.types';

interface Props {
  data: ConditionNodeData;
  variables: ChatbotVariableRow[];
  onChange: (patch: Partial<ConditionNodeData>) => void;
}

const OPERATORS = [
  { value: 'contains', label: 'contém' },
  { value: 'equals', label: 'igual a' },
  { value: 'not_empty', label: 'não está vazio' },
  { value: 'empty', label: 'está vazio' },
];

const ConditionPanel: React.FC<Props> = ({ data, variables, onChange }) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (d: ConditionNodeData) => {
    const r = validateNodeData('condition', d);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach((e) => { errs[e.path.join('.')] = e.message; });
      setErrors(errs);
    } else {
      setErrors({});
    }
  };

  useEffect(() => { validate(data); }, []);

  const emit = (patch: Partial<ConditionNodeData>) => {
    const next = { ...data, ...patch };
    onChange(patch);
    validate(next);
  };

  const allVarOptions = [
    ...SYSTEM_VARIABLES.map((v) => ({ value: v.token, label: `{${v.token}} (${v.label})` })),
    ...variables.map((v) => ({ value: v.name, label: `{${v.name}}` })),
  ];

  const hideValue = data.operator === 'empty' || data.operator === 'not_empty';

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Variável *</Label>
        <Select value={data.variable} onValueChange={(v) => emit({ variable: v })}>
          <SelectTrigger className={errors.variable ? 'border-destructive' : ''}>
            <SelectValue placeholder="Selecione uma variável" />
          </SelectTrigger>
          <SelectContent>
            {allVarOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.variable && <p className="text-xs text-destructive">{errors.variable}</p>}
      </div>

      <div className="space-y-1">
        <Label>Operador</Label>
        <Select value={data.operator} onValueChange={(v) => emit({ operator: v as any })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!hideValue && (
        <div className="space-y-1">
          <Label>Valor para comparar *</Label>
          <Input
            value={data.value ?? ''}
            onChange={(e) => emit({ value: e.target.value })}
            placeholder="Valor"
            className={errors.value ? 'border-destructive' : ''}
          />
          {errors.value && <p className="text-xs text-destructive">{errors.value}</p>}
        </div>
      )}

      <div className="pt-1 text-xs text-muted-foreground space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
          Saída <strong>Verdadeiro</strong>: conecte ao próximo nó quando a condição for satisfeita
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          Saída <strong>Falso</strong>: conecte ao próximo nó quando não for satisfeita
        </div>
      </div>
    </div>
  );
};

export default ConditionPanel;

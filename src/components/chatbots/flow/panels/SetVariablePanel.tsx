import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { validateNodeData } from '@/lib/validations/chatbot-flow';
import { SYSTEM_VARIABLES } from '@/lib/chatbot/flowConstants';
import { Badge } from '@/components/ui/badge';
import type { SetVariableNodeData, ChatbotVariableRow } from '@/types/chatbot-flow.types';

interface Props {
  data: SetVariableNodeData;
  variables: ChatbotVariableRow[];
  onChange: (patch: Partial<SetVariableNodeData>) => void;
}

const SetVariablePanel: React.FC<Props> = ({ data, variables, onChange }) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (d: SetVariableNodeData) => {
    const r = validateNodeData('set_variable', d);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach((e) => { errs[e.path.join('.')] = e.message; });
      setErrors(errs);
    } else {
      setErrors({});
    }
  };

  useEffect(() => { validate(data); }, []);

  const emit = (patch: Partial<SetVariableNodeData>) => {
    const next = { ...data, ...patch };
    onChange(patch);
    validate(next);
  };

  const insertToken = (token: string) => {
    emit({ value: data.value + `{${token}}` });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Nome da variável *</Label>
        <Input
          value={data.variable_name}
          onChange={(e) => emit({ variable_name: e.target.value })}
          placeholder="minha_variavel"
          className={errors.variable_name ? 'border-destructive' : ''}
        />
        {errors.variable_name && <p className="text-xs text-destructive">{errors.variable_name}</p>}
        <p className="text-[10px] text-muted-foreground">Use letras, números e _ (começando por letra)</p>
      </div>

      <div className="space-y-1">
        <Label>Valor</Label>
        <Input
          value={data.value}
          onChange={(e) => emit({ value: e.target.value })}
          placeholder="{nome_cliente} ou texto fixo"
          className={errors.value ? 'border-destructive' : ''}
        />
        {errors.value && <p className="text-xs text-destructive">{errors.value}</p>}
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          Inserir variável no valor
        </p>
        <div className="flex flex-wrap gap-1">
          {SYSTEM_VARIABLES.map((v) => (
            <Badge
              key={v.token}
              variant="outline"
              className="cursor-pointer text-[10px] hover:bg-primary/10"
              onClick={() => insertToken(v.token)}
            >
              {'{' + v.token + '}'}
            </Badge>
          ))}
          {variables.map((v) => (
            <Badge
              key={v.id}
              variant="secondary"
              className="cursor-pointer text-[10px] hover:bg-primary/20"
              onClick={() => insertToken(v.name)}
            >
              {'{' + v.name + '}'}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SetVariablePanel;

import React, { useRef, useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { validateNodeData } from '@/lib/validations/chatbot-flow';
import VariableChips from './VariableChips';
import type { SendTextNodeData, ChatbotVariableRow } from '@/types/chatbot-flow.types';

interface Props {
  data: SendTextNodeData;
  variables: ChatbotVariableRow[];
  onChange: (patch: Partial<SendTextNodeData>) => void;
}

const SendTextPanel: React.FC<Props> = ({ data, variables, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (d: SendTextNodeData) => {
    const r = validateNodeData('send_text', d);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach((e) => { errs[e.path.join('.')] = e.message; });
      setErrors(errs);
    } else {
      setErrors({});
    }
  };

  useEffect(() => { validate(data); }, []);

  const handleChange = (patch: Partial<SendTextNodeData>) => {
    const next = { ...data, ...patch };
    onChange(patch);
    validate(next);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Mensagem *</Label>
        <Textarea
          ref={textareaRef}
          value={data.message}
          onChange={(e) => handleChange({ message: e.target.value })}
          placeholder="Olá {name}! Como posso ajudar?"
          rows={4}
          className={errors.message ? 'border-destructive' : ''}
        />
        {errors.message && <p className="text-xs text-destructive">{errors.message}</p>}
      </div>

      <VariableChips
        variables={variables}
        textareaRef={textareaRef}
        currentValue={data.message}
        onInsert={(v) => handleChange({ message: v })}
      />

      <div className="space-y-1">
        <Label>Atraso antes de enviar (segundos)</Label>
        <Input
          type="number"
          min={0}
          max={300}
          value={data.delay_seconds ?? 0}
          onChange={(e) => handleChange({ delay_seconds: parseInt(e.target.value) || 0 })}
        />
      </div>
    </div>
  );
};

export default SendTextPanel;

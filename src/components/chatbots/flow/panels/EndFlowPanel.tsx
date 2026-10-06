import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { validateNodeData } from '@/lib/validations/chatbot-flow';
import type { EndFlowNodeData } from '@/types/chatbot-flow.types';

interface Props {
  data: EndFlowNodeData;
  onChange: (patch: Partial<EndFlowNodeData>) => void;
}

const EndFlowPanel: React.FC<Props> = ({ data, onChange }) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (d: EndFlowNodeData) => {
    const r = validateNodeData('end_flow', d);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach((e) => { errs[e.path.join('.')] = e.message; });
      setErrors(errs);
    } else {
      setErrors({});
    }
  };

  useEffect(() => { validate(data); }, []);

  const emit = (patch: Partial<EndFlowNodeData>) => {
    const next = { ...data, ...patch };
    onChange(patch);
    validate(next);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Mensagem de encerramento (opcional)</Label>
        <Textarea
          value={data.message ?? ''}
          onChange={(e) => emit({ message: e.target.value })}
          placeholder="Obrigado pelo contato!"
          rows={3}
          className={errors.message ? 'border-destructive' : ''}
        />
        {errors.message && <p className="text-xs text-destructive">{errors.message}</p>}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="silent-end"
          checked={data.silent ?? false}
          onCheckedChange={(v) => emit({ silent: !!v })}
        />
        <Label htmlFor="silent-end" className="cursor-pointer font-normal">
          Encerrar silenciosamente (sem enviar mensagem)
        </Label>
      </div>
    </div>
  );
};

export default EndFlowPanel;

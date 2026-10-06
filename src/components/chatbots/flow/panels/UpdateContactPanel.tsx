import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { validateNodeData } from '@/lib/validations/chatbot-flow';
import type { UpdateContactNodeData } from '@/types/chatbot-flow.types';

interface Props {
  data: UpdateContactNodeData;
  onChange: (patch: Partial<UpdateContactNodeData>) => void;
}

const FIELD_OPTIONS = [
  { value: 'name', label: 'Nome' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'tag', label: 'Tag' },
];

const UpdateContactPanel: React.FC<Props> = ({ data, onChange }) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (d: UpdateContactNodeData) => {
    const r = validateNodeData('update_contact', d);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach((e) => { errs[e.path.join('.')] = e.message; });
      setErrors(errs);
    } else {
      setErrors({});
    }
  };

  useEffect(() => { validate(data); }, []);

  const emit = (patch: Partial<UpdateContactNodeData>) => {
    const next = { ...data, ...patch };
    onChange(patch);
    validate(next);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Campo do contato</Label>
        <Select value={data.field} onValueChange={(v) => emit({ field: v as any })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Valor *</Label>
        <Input
          value={data.value}
          onChange={(e) => emit({ value: e.target.value })}
          placeholder="Valor ou {variavel}"
          className={errors.value ? 'border-destructive' : ''}
        />
        {errors.value && <p className="text-xs text-destructive">{errors.value}</p>}
      </div>
    </div>
  );
};

export default UpdateContactPanel;

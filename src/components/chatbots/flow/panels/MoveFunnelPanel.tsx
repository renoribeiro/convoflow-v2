import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { validateNodeData } from '@/lib/validations/chatbot-flow';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import type { MoveFunnelNodeData } from '@/types/chatbot-flow.types';

interface Props {
  data: MoveFunnelNodeData;
  onChange: (patch: Partial<MoveFunnelNodeData>) => void;
}

const MoveFunnelPanel: React.FC<Props> = ({ data, onChange }) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: stages = [] } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['funnel_stages', 'list'],
    select: 'id, name',
    order: { column: 'order', ascending: true },
  });

  const validate = (d: MoveFunnelNodeData) => {
    const r = validateNodeData('move_funnel', d);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach((e) => { errs[e.path.join('.')] = e.message; });
      setErrors(errs);
    } else {
      setErrors({});
    }
  };

  useEffect(() => { validate(data); }, []);

  const emit = (patch: Partial<MoveFunnelNodeData>) => {
    const next = { ...data, ...patch };
    onChange(patch);
    validate(next);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Etapa do funil *</Label>
        <Select value={data.stage_id} onValueChange={(v) => emit({ stage_id: v })}>
          <SelectTrigger className={errors.stage_id ? 'border-destructive' : ''}>
            <SelectValue placeholder="Selecione uma etapa" />
          </SelectTrigger>
          <SelectContent>
            {(stages as any[]).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.stage_id && <p className="text-xs text-destructive">{errors.stage_id}</p>}
      </div>
    </div>
  );
};

export default MoveFunnelPanel;

import React, { useRef, useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { validateNodeData } from '@/lib/validations/chatbot-flow';
import VariableChips from './VariableChips';
import type { AskQuestionNodeData, ChatbotVariableRow } from '@/types/chatbot-flow.types';

interface Props {
  data: AskQuestionNodeData;
  variables: ChatbotVariableRow[];
  onChange: (patch: Partial<AskQuestionNodeData>) => void;
}

const AskQuestionPanel: React.FC<Props> = ({ data, variables, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (d: AskQuestionNodeData) => {
    const r = validateNodeData('ask_question', d);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach((e) => { errs[e.path.join('.')] = e.message; });
      setErrors(errs);
    } else {
      setErrors({});
    }
  };

  useEffect(() => { validate(data); }, []);

  const handleChange = (patch: Partial<AskQuestionNodeData>) => {
    const next = { ...data, ...patch };
    onChange(patch);
    validate(next);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Pergunta *</Label>
        <Textarea
          ref={textareaRef}
          value={data.message}
          onChange={(e) => handleChange({ message: e.target.value })}
          placeholder="Qual é o seu nome?"
          rows={3}
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
        <Label>Salvar resposta como variável *</Label>
        <Input
          value={data.save_to_variable}
          onChange={(e) => handleChange({ save_to_variable: e.target.value })}
          placeholder="nome_cliente"
          className={errors.save_to_variable ? 'border-destructive' : ''}
        />
        {errors.save_to_variable && (
          <p className="text-xs text-destructive">{errors.save_to_variable}</p>
        )}
        <p className="text-[10px] text-muted-foreground">Use letras, números e _ (começando por letra)</p>
      </div>

      <div className="space-y-1">
        <Label>Validação da resposta</Label>
        <Select value={data.validation} onValueChange={(v) => handleChange({ validation: v as any })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma</SelectItem>
            <SelectItem value="email">E-mail</SelectItem>
            <SelectItem value="phone">Telefone</SelectItem>
            <SelectItem value="number">Número</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default AskQuestionPanel;

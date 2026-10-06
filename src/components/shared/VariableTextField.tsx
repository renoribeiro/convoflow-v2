/**
 * Campo de texto (input ou textarea) com chips clicáveis para inserir tokens
 * `{variavel}` na posição do cursor. Reutilizável por qualquer formulário que
 * precise de interpolação de variáveis (automações, etc).
 *
 * As variáveis de sistema vêm de SYSTEM_VARIABLES; as variáveis personalizadas
 * (coletadas pelos chatbots da conta) são passadas em `customVariables`.
 */
import React, { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SYSTEM_VARIABLES } from '@/lib/chatbot/flowConstants';

interface Props {
  value: string;
  onChange: (value: string) => void;
  customVariables?: string[];
  multiline?: boolean;
  placeholder?: string;
}

export const VariableTextField: React.FC<Props> = ({
  value,
  onChange,
  customVariables = [],
  multiline = false,
  placeholder,
}) => {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const insert = (token: string) => {
    const toInsert = `{${token}}`;
    const el = ref.current;
    if (!el) {
      onChange((value || '') + toInsert);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + toInsert + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + toInsert.length, start + toInsert.length);
    });
  };

  return (
    <div className="space-y-1.5">
      {multiline ? (
        <Textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
        />
      ) : (
        <Input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}

      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          Inserir variável
        </p>
        <div className="flex flex-wrap gap-1">
          {SYSTEM_VARIABLES.map((v) => (
            <Badge
              key={v.token}
              variant="outline"
              className="cursor-pointer text-[10px] hover:bg-primary/10 select-none"
              onClick={() => insert(v.token)}
              title={v.label}
            >
              {'{' + v.token + '}'}
            </Badge>
          ))}
          {customVariables.map((name) => (
            <Badge
              key={name}
              variant="secondary"
              className="cursor-pointer text-[10px] hover:bg-primary/20 select-none"
              onClick={() => insert(name)}
              title="Variável da conta (coletada pelo chatbot)"
            >
              {'{' + name + '}'}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VariableTextField;

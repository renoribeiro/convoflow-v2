/**
 * Clickable chips for inserting {variable} tokens into a textarea.
 */
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { SYSTEM_VARIABLES } from '@/lib/chatbot/flowConstants';
import type { ChatbotVariableRow } from '@/types/chatbot-flow.types';

interface Props {
  variables: ChatbotVariableRow[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsert: (newValue: string) => void;
  currentValue: string;
}

const VariableChips: React.FC<Props> = ({ variables, textareaRef, onInsert, currentValue }) => {
  const insert = (token: string) => {
    const el = textareaRef.current;
    const toInsert = `{${token}}`;
    if (!el) {
      onInsert(currentValue + toInsert);
      return;
    }
    const start = el.selectionStart ?? currentValue.length;
    const end = el.selectionEnd ?? currentValue.length;
    const next = currentValue.slice(0, start) + toInsert + currentValue.slice(end);
    onInsert(next);
    // Restore focus + cursor position after React re-render
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + toInsert.length, start + toInsert.length);
    });
  };

  return (
    <div className="space-y-1">
      {/* Explica o conceito de variável no ponto em que ele aparece pela primeira
          vez. Este componente é compartilhado por Enviar Texto, Fazer Pergunta e
          Menu de Opções, então um único ponto cobre os três painéis. */}
      <div className="flex items-center gap-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Variáveis do sistema</p>
        <FeatureHelp helpKey="concept:variables" className="h-4 w-4" />
      </div>
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
      </div>
      {variables.length > 0 && (
        <>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mt-1">
            Variáveis do chatbot
          </p>
          <div className="flex flex-wrap gap-1">
            {variables.map((v) => (
              <Badge
                key={v.id}
                variant="secondary"
                className="cursor-pointer text-[10px] hover:bg-primary/20 select-none"
                onClick={() => insert(v.name)}
              >
                {'{' + v.name + '}'}
              </Badge>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default VariableChips;

/**
 * Pré-visualização de mensagem estilo WhatsApp: mostra o texto com {variaveis}
 * resolvidas em dados fictícios, para o operador ver como a mensagem vai chegar.
 */
import React from 'react';
import { Check } from 'lucide-react';

const SAMPLE: Record<string, string> = {
  name: 'João Silva',
  first_name: 'João',
  phone: '+55 11 98888-7777',
  email: 'joao@example.com',
  date: '24/06/2026',
  time: '09:00',
  datetime: '24/06/2026 09:00',
  incoming_message: 'Olá!',
};

function fillSample(template: string, customVariables: string[]): string {
  const sample: Record<string, string> = { ...SAMPLE };
  customVariables.forEach((v) => {
    if (!(v in sample)) sample[v] = 'exemplo';
  });
  return template.replace(/\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}/g, (m, token: string) => sample[token] ?? m);
}

interface MessagePreviewProps {
  text: string;
  customVariables?: string[];
}

export const MessagePreview: React.FC<MessagePreviewProps> = ({ text, customVariables = [] }) => {
  const filled = fillSample(text || '', customVariables);

  return (
    <div className="rounded-lg bg-[#e5ddd5] p-3 dark:bg-slate-800">
      <p className="mb-2 text-center text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Prévia
      </p>
      <div className="flex justify-end">
        <div className="relative max-w-[85%] rounded-lg rounded-tr-none bg-[#dcf8c6] px-3 py-2 shadow-sm dark:bg-emerald-900">
          <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">
            {filled || <span className="italic text-slate-400">Sua mensagem aparece aqui…</span>}
          </p>
          <div className="mt-1 flex items-center justify-end gap-0.5 text-[10px] text-slate-500 dark:text-slate-300">
            09:00
            <Check className="h-3 w-3 text-sky-500" />
            <Check className="-ml-2 h-3 w-3 text-sky-500" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessagePreview;

/**
 * Corpo do conteúdo de ajuda: "Como configurar", "Exemplo" e "Dicas".
 *
 * Vive separado do <FeatureHelp /> porque dois lugares mostram o MESMO
 * conteúdo — o painel lateral contextual de cada tela e a página de Ajuda
 * (/dashboard/help). Mudança de layout aqui vale para os dois de uma vez; era
 * exatamente a duplicação que este componente existe para evitar.
 */
import React from 'react';
import { Lightbulb, ListChecks, Wand2 } from 'lucide-react';
import type { FeatureHelpEntry } from '@/lib/help/featureHelp';
import { cn } from '@/lib/utils';

interface Props {
  entry: FeatureHelpEntry;
  /**
   * Abre com o `whatItDoes` como parágrafo. O painel lateral NÃO usa (padrão),
   * porque já mostra esse texto no SheetDescription — o Radix exige a descrição
   * no cabeçalho do diálogo para leitores de tela. A página de Ajuda usa, já
   * que ali o título é o gatilho da sanfona e não existe cabeçalho separado.
   */
  includeSummary?: boolean;
  /** Classe do container (o painel lateral acrescenta o espaçamento do topo). */
  className?: string;
}

export const FeatureHelpBody: React.FC<Props> = ({
  entry,
  includeSummary = false,
  className,
}) => (
  <div className={cn('space-y-6 text-sm', className)}>
    {includeSummary && <p className="text-muted-foreground">{entry.whatItDoes}</p>}

    <section className="space-y-2">
      <h4 className="flex items-center gap-2 font-medium text-foreground">
        <ListChecks className="h-4 w-4 text-primary" />
        Como configurar
      </h4>
      <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
        {entry.howToConfigure.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </section>

    {entry.example && (
      <section className="space-y-2">
        <h4 className="flex items-center gap-2 font-medium text-foreground">
          <Wand2 className="h-4 w-4 text-primary" />
          Exemplo
        </h4>
        <p className="rounded-md bg-muted p-3 text-muted-foreground">{entry.example}</p>
      </section>
    )}

    {entry.tips && entry.tips.length > 0 && (
      <section className="space-y-2">
        <h4 className="flex items-center gap-2 font-medium text-foreground">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Dicas
        </h4>
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          {entry.tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </section>
    )}
  </div>
);

export default FeatureHelpBody;

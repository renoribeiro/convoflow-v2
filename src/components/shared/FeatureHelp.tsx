/**
 * Botão de ajuda contextual. Mostra um ícone (?) que, ao clicar, abre um painel
 * lateral explicando o que a função faz, como configurá-la e um exemplo.
 *
 * O conteúdo vem de src/lib/help/featureHelp.ts, indexado por `helpKey`.
 * Se a chave não existir, nada é renderizado (degradação segura em produção) e
 * em desenvolvimento sai um aviso no console — chave sem conteúdo é quase sempre
 * typo, e o silêncio esconderia o erro.
 */
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { FeatureHelpBody } from '@/components/shared/FeatureHelpBody';
import { getFeatureHelp } from '@/lib/help/featureHelp';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

interface Props {
  helpKey: string;
  /** Classe extra para o botão (ex.: posicionamento). */
  className?: string;
  /**
   * Mostra o link "Ver toda a documentação" (padrão: sim). Desligue onde a
   * página de Ajuda está fora de alcance de quem lê: no cadastro público
   * (visitante sem conta) e na tela de bloqueio (o bloqueio cobre /dashboard/help).
   */
  docsLink?: boolean;
}

/** Chaves já avisadas — o alerta sai uma vez por chave, não a cada render. */
const warnedKeys = new Set<string>();

export const FeatureHelp: React.FC<Props> = ({ helpKey, className, docsLink = true }) => {
  const entry = getFeatureHelp(helpKey);

  // Aviso só em desenvolvimento. A chave vai na própria mensagem porque o
  // logger censura qualquer campo de contexto cujo nome contenha "key".
  useEffect(() => {
    if (entry || !helpKey) return;
    if (!env.isDevelopment()) return;
    if (warnedKeys.has(helpKey)) return;
    warnedKeys.add(helpKey);
    logger.warn(
      `FeatureHelp: nenhum conteúdo de ajuda para a chave "${helpKey}". ` +
        'Adicione a entrada em src/lib/help/featureHelp.ts.',
    );
  }, [entry, helpKey]);

  if (!entry) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={`Ajuda: ${entry.title}`}
          title={`Como funciona: ${entry.title}`}
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors',
            className,
          )}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{entry.title}</SheetTitle>
          <SheetDescription>{entry.whatItDoes}</SheetDescription>
        </SheetHeader>

        <FeatureHelpBody entry={entry} className="mt-6" />

        {/* Saída para a documentação completa, já ancorada nesta mesma entrada. */}
        {docsLink ? (
          <div className="mt-8 border-t border-border pt-4">
            <Link
              to={`/dashboard/help#${helpKey}`}
              className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              Ver toda a documentação
            </Link>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};

export default FeatureHelp;

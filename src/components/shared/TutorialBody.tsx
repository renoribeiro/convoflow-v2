/**
 * Corpo de um tutorial: objetivo, para quem é, e os passos numerados.
 *
 * Fica separado por simetria com o <FeatureHelpBody />: um único lugar renderiza
 * o conteúdo, e a página de Ajuda só monta a sanfona em volta.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BookOpen, Target, Users } from 'lucide-react';
import { getTutorial, tutorialKey, type Tutorial } from '@/lib/help/tutorials';
import { getFeatureHelp } from '@/lib/help/featureHelp';
import { cn } from '@/lib/utils';

interface Props {
  tutorial: Tutorial;
  className?: string;
}

export const TutorialBody: React.FC<Props> = ({ tutorial, className }) => {
  // Tutorial seguinte, quando este declara um: vira o link "Próximo" no fim
  // dos passos, para quem terminou não ter que procurar na lista.
  const next = getTutorial(tutorial.nextTutorialId);

  return (
  <div className={cn('space-y-5 text-sm', className)}>
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="flex gap-2 text-foreground">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>{tutorial.goal}</span>
      </p>
      <p className="flex gap-2 text-xs text-muted-foreground">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{tutorial.forWhom}</span>
      </p>
    </div>

    <ol className="space-y-4">
      {tutorial.steps.map((step, index) => {
        const docTitle = step.helpKey ? getFeatureHelp(step.helpKey)?.title : null;

        return (
          <li key={index} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {index + 1}
            </span>

            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="font-medium text-foreground">{step.title}</p>
              <p className="text-muted-foreground">{step.body}</p>

              {step.note && (
                <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{step.note}</span>
                </p>
              )}

              {(step.screen || step.helpKey) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
                  {step.screen && (
                    <Link
                      to={step.screen}
                      className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      Ir para a tela
                    </Link>
                  )}
                  {step.helpKey && (
                    <Link
                      to={`/dashboard/help#${step.helpKey}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      {docTitle ? `Ver: ${docTitle}` : 'Ver a documentação'}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>

    {next && (
      <Link
        to={`/dashboard/help#${tutorialKey(next.id)}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Próximo tutorial: {next.title}
        <ArrowRight className="h-4 w-4" />
      </Link>
    )}
  </div>
  );
};

export default TutorialBody;

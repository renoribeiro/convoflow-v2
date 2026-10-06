/**
 * Página de Ajuda — a documentação completa do produto, navegável.
 *
 * Todo o conteúdo vem de src/lib/help/featureHelp.ts (referência) e
 * src/lib/help/tutorials.ts (tutoriais). Não existe texto de ajuda escrito aqui:
 * entrada e tutorial novos aparecem nesta página sozinhos.
 *
 * A ordem das seções é a de HELP_CATEGORIES e os rótulos vêm de
 * HELP_CATEGORY_LABELS, então nem a ordem está duplicada — 'tutorial' é a
 * primeira categoria porque quem abre a Ajuda pela primeira vez quer o caminho
 * guiado, não a referência.
 *
 * O corpo de cada tópico é o mesmo componente que o painel lateral contextual
 * usa (<FeatureHelpBody />) — uma implementação, dois lugares.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, SearchX } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { FeatureHelpBody } from '@/components/shared/FeatureHelpBody';
import { TutorialBody } from '@/components/shared/TutorialBody';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useHelpVisibility } from '@/hooks/useHelpVisibility';
import {
  HELP_CATEGORIES,
  HELP_CATEGORY_LABELS,
  getFeatureHelp,
  getHelpByCategory,
  helpEntryMatches,
  type FeatureHelpItem,
} from '@/lib/help/featureHelp';
import {
  TUTORIALS,
  getTutorialByKey,
  tutorialKey,
  tutorialMatches,
  type Tutorial,
} from '@/lib/help/tutorials';

/** Espera a sanfona abrir antes de rolar, senão a rolagem mira a altura antiga. */
const SCROLL_DELAY_MS = 150;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** Um item da sanfona: referência de tela/bloco, ou tutorial. */
type Topic =
  | { kind: 'entry'; key: string; title: string; entry: FeatureHelpItem }
  | { kind: 'tutorial'; key: string; title: string; tutorial: Tutorial };

const Help = () => {
  const location = useLocation();
  const { canSeeHelpEntry, canSeeTutorial } = useHelpVisibility();

  const [query, setQuery] = useState('');
  const [openItems, setOpenItems] = useState<string[]>([]);
  // Chave já rolada. Ref, não estado: um estado aqui entrava nas dependências
  // do efeito de rolagem, o efeito rodava de novo e o cleanup cancelava o
  // próprio timer antes dos 150 ms — o link profundo abria, mas nunca rolava.
  const scrolledForRef = useRef<string | null>(null);

  /** Chave vinda do link profundo (#page:conversations, #tutorial:montar-funil). */
  const hashKey = useMemo(() => {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [location.hash]);

  const sections = useMemo(
    () =>
      HELP_CATEGORIES.map((category) => {
        // Tutoriais não são FeatureHelpEntry: vivem em tutorials.ts e formam um
        // grupo único, sem sub-agrupamento por área.
        const groups: Array<{ area: string | null; topics: Topic[] }> =
          category === 'tutorial'
            ? [
                {
                  area: null,
                  topics: TUTORIALS.filter(canSeeTutorial)
                    .filter((tutorial) => tutorialMatches(tutorial, query))
                    .map((tutorial) => ({
                      kind: 'tutorial' as const,
                      key: tutorialKey(tutorial.id),
                      title: tutorial.title,
                      tutorial,
                    })),
                },
              ].filter((group) => group.topics.length > 0)
            : getHelpByCategory(category)
                .map((group) => ({
                  area: group.area,
                  topics: group.entries
                    .filter(canSeeHelpEntry)
                    .filter((entry) => helpEntryMatches(entry, query))
                    .map((entry) => ({
                      kind: 'entry' as const,
                      key: entry.key,
                      title: entry.title,
                      entry,
                    })),
                }))
                .filter((group) => group.topics.length > 0);

        return {
          category,
          label: HELP_CATEGORY_LABELS[category],
          groups,
          count: groups.reduce((sum, group) => sum + group.topics.length, 0),
        };
      }).filter((section) => section.count > 0),
    [canSeeHelpEntry, canSeeTutorial, query],
  );

  const resultCount = sections.reduce((sum, section) => sum + section.count, 0);
  const isSearching = query.trim().length > 0;

  // Expande o tópico apontado pelo hash (entrada de ajuda ou tutorial).
  useEffect(() => {
    if (!hashKey) return;
    if (!getFeatureHelp(hashKey) && !getTutorialByKey(hashKey)) return;
    setOpenItems((prev) => (prev.includes(hashKey) ? prev : [...prev, hashKey]));
  }, [hashKey]);

  // Rola até ele. Depende de `sections` porque no primeiro render os módulos
  // podem ainda estar carregando e o item nem existir no DOM; se `sections`
  // mudar antes dos 150 ms, o cleanup cancela e o efeito rearma o timer — a
  // marca de "já rolei" só é gravada quando a rolagem acontece de fato.
  useEffect(() => {
    if (!hashKey || scrolledForRef.current === hashKey) return;
    const target = document.getElementById(hashKey);
    if (!target) return;

    const timer = setTimeout(() => {
      scrolledForRef.current = hashKey;
      target.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }, SCROLL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hashKey, sections]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ajuda"
        description="Referência completa da plataforma: tutoriais passo-a-passo, o que cada tela faz e exemplos de uso."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Ajuda' }]}
      />

      {/* Busca fixa no topo: a lista é longa e, no celular, rolar de volta até
          o campo a cada consulta seria o gargalo da tela. */}
      <div className="sticky top-0 z-20 rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar na ajuda (ex.: template, variavel, funil)"
            aria-label="Buscar na ajuda"
            className="pl-9"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {isSearching
            ? plural(resultCount, 'resultado', 'resultados')
            : plural(resultCount, 'tópico disponível', 'tópicos disponíveis')}
          {isSearching && ' (a busca ignora acentos e maiúsculas)'}
        </p>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={<SearchX className="h-6 w-6" />}
            title="Nenhum tópico encontrado"
            description="Tente uma palavra mais curta ou outro termo. A busca procura no título, na explicação, nos passos, no exemplo e nas dicas."
            action={{ label: 'Limpar busca', onClick: () => setQuery('') }}
          />
        </div>
      ) : (
        // Uma única sanfona para a página inteira. Com uma por grupo, o
        // onValueChange de um grupo apagaria o estado aberto dos outros.
        <Accordion
          type="multiple"
          value={openItems}
          onValueChange={setOpenItems}
          className="w-full space-y-8"
        >
          {sections.map((section) => (
            <section key={section.category} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">{section.label}</h2>
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {section.count}
                </Badge>
              </div>

              {section.groups.map((group) => (
                <div key={group.area ?? '__sem-area__'}>
                  {group.area && (
                    <p className="px-1 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                      {group.area}
                    </p>
                  )}

                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    {group.topics.map((topic) => (
                      <AccordionItem
                        key={topic.key}
                        value={topic.key}
                        id={topic.key}
                        className="border-b border-border px-4 last:border-b-0 data-[state=open]:bg-muted/30"
                      >
                        <AccordionTrigger className="gap-3 text-left text-sm hover:no-underline">
                          {topic.title}
                        </AccordionTrigger>
                        <AccordionContent>
                          {topic.kind === 'tutorial' ? (
                            <TutorialBody tutorial={topic.tutorial} className="pb-2" />
                          ) : (
                            <FeatureHelpBody entry={topic.entry} includeSummary className="pb-2" />
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </Accordion>
      )}
    </div>
  );
};

export default Help;

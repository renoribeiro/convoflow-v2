import { TagBadge } from '@/components/etiquetas/TagBadge';
import { MaisComLista } from '@/components/shared/MaisComLista';
import { cn } from '@/lib/utils';

/** Na linha cabem duas; o resto fica no "+N". */
const ETIQUETAS_NA_LINHA = 2;

interface Etiqueta {
  id: string;
  name: string;
  color: string;
}

/**
 * Linha própria das etiquetas na lista de Conversas, abaixo dos selos. Quem não
 * tem etiqueta não ganha linha nenhuma: a lista segue compacta.
 *
 * Em ordem de nome, para as duas da linha não mudarem a cada atualização.
 *
 * Quando as duas não cabem, a de nome mais curto fica inteira (até metade da
 * linha) e só a mais comprida ganha reticências. Sem isso as duas encolhiam
 * juntas, e "Agendado" virava "Agen...".
 *
 * Cada etiqueta fica sobre um fundo firme (`bg-card`): o fundo dela é translúcido
 * e a tinta do texto é calculada para o cartão. Direto sobre a linha colorida da
 * conversa não lida ou aberta, o contraste caía abaixo do AA no tema escuro.
 */
export function LinhaDeEtiquetas({ tags }: { tags: Etiqueta[] }) {
  if (tags.length === 0) return null;

  const ordenadas = [...tags].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const naLinha = ordenadas.slice(0, ETIQUETAS_NA_LINHA);
  const resto = ordenadas.length - naLinha.length;
  const [primeira, segunda] = naLinha;
  const maisCurta = !primeira || !segunda ? -1 : primeira.name.length <= segunda.name.length ? 0 : 1;

  return (
    <div data-linha-de-etiquetas className="mt-1 flex min-w-0 items-center gap-1">
      {naLinha.map((tag, i) => (
        <span
          key={tag.id}
          className={cn('flex rounded-full bg-card', i === maisCurta ? 'max-w-[50%] flex-shrink-0' : 'min-w-0')}
        >
          <TagBadge name={tag.name} color={tag.color} className="min-w-0 px-1.5 font-medium" />
        </span>
      ))}
      {resto > 0 && (
        <MaisComLista
          quantidade={resto}
          rotulo={`Ver todas as ${ordenadas.length} etiquetas deste contato`}
          titulo="Etiquetas deste contato"
        >
          {ordenadas.map((tag) => (
            <TagBadge key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </MaisComLista>
      )}
    </div>
  );
}

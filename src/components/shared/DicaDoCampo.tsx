/**
 * Dica curta "?" ao lado de um campo cujo efeito não é óbvio: configuração com
 * consequência, limite, autorização, regra de distribuição, endereço de
 * entrega. Uma ou duas frases; o passo a passo fica na ajuda da tela
 * (<FeatureHelp />), não aqui.
 *
 * Abre no clique ou no toque (balão), não no passar do mouse: no celular não
 * existe "passar o mouse", e a dica precisa funcionar lá também.
 *
 * Coloque AO LADO do <Label>, nunca dentro: um botão dentro do label também
 * mexeria no campo ao ser clicado.
 *
 * Texto em pt-BR, segunda pessoa, sem hífen nem travessão, no máximo 200
 * caracteres e com as palavras do glossário (docs/GLOSSARIO_UX.md). O teste
 * src/lib/help/cobertura.test.ts confere isso em todo o src/.
 */
import { HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Props {
  /** A explicação. */
  texto: string;
  /** O nome do campo, para o leitor de tela ("O que é: Prioridade"). */
  rotulo: string;
  className?: string;
}

export function DicaDoCampo({ texto, rotulo, className }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`O que é: ${rotulo}`}
          data-dica-do-campo=""
          data-alvo-expandido=""
          className={cn(
            'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] p-3 text-xs leading-relaxed"
      >
        {texto}
      </PopoverContent>
    </Popover>
  );
}

export default DicaDoCampo;

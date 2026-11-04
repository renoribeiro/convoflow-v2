import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * O nome do número no servidor de conexão (`instance_key`), com botão de
 * copiar. É o nome do painel da Evolution (no WAHA, o da sessão) e o que as
 * automações de fora usam; não é segredo (src/lib/whatsapp/nomeNoServidor.ts).
 *
 * Um componente só para o cartão do número e as janelas de Detalhes, Excluir e
 * Renomear: o rótulo é o mesmo em todas, e a palavra "chave" não aparece (ela
 * fazia o nome parecer senha).
 *
 * - `cartao`: uma linha "Nome no servidor: ...", no tamanho do texto do cartão.
 * - `janela`: o rótulo "Nome no servidor de conexão" com a dica "?" em cima.
 */
interface Props {
  nome: string;
  provider?: string | null;
  variante: 'cartao' | 'janela';
  className?: string;
}

export function NomeNoServidor({ nome, provider, variante, className }: Props) {
  const { toast } = useToast();

  const copiar = () => {
    void navigator.clipboard.writeText(nome).then(
      () => toast({ title: 'Nome copiado', description: nome }),
      () => toast({ title: 'Não foi possível copiar', description: 'Selecione o nome e copie à mão.', variant: 'destructive' }),
    );
  };

  const valor = (
    <span className="flex min-w-0 items-center gap-1">
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground [overflow-wrap:anywhere]" data-testid="nome-no-servidor-valor">
        {nome}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        data-alvo-expandido=""
        onClick={copiar}
        title="Copiar o nome no servidor"
        aria-label="Copiar o nome no servidor"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </span>
  );

  if (variante === 'cartao') {
    return (
      <div className={cn('flex min-w-0 flex-wrap items-center gap-x-1', className)} data-testid="nome-no-servidor">
        <span>Nome no servidor:</span>{' '}
        {valor}
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)} data-testid="nome-no-servidor">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">Nome no servidor de conexão</span>
        {provider === 'waha' ? (
          <DicaDoCampo
            rotulo="Nome no servidor de conexão"
            texto="É o nome deste número no seu servidor WAHA e nas automações de fora. Não é senha."
          />
        ) : (
          <DicaDoCampo
            rotulo="Nome no servidor de conexão"
            texto="É o nome deste número no painel da Evolution e nas automações de fora. Não é senha."
          />
        )}
      </div>
      {valor}
    </div>
  );
}

export default NomeNoServidor;

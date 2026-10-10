import { useEffect, useState } from 'react';
import { Loader2, Pencil, Store } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/contexts/TenantContext';
import { useCreateStore } from '@/hooks/useCreateStore';
import { useRenameStore } from '@/hooks/useRenameStore';
import { STORE_NAME_MAX, validateStoreName } from '@/lib/stores/storeName';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Com uma Loja aqui, a janela é a de RENOMEAR essa Loja: o campo já vem com
   * o nome atual e salvar muda só o nome. Sem ela, é a criação de sempre.
   */
  store?: { id: string; name: string } | null;
}

/**
 * Criação de Loja e, com `store`, renomear uma Loja. Um campo só: o nome.
 *
 * O erro do servidor aparece DENTRO da janela e ela não fecha — quem errou o
 * nome ou esbarrou no limite de vagas precisa ler a mensagem com o campo ainda
 * na frente. O sucesso é que sai por toast, junto com o atalho para entrar na
 * Loja nova, que é quase sempre o passo seguinte.
 */
export const NewStoreDialog = ({ open, onOpenChange, store = null }: Props) => {
  const editando = !!store;
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const { setActiveTenant } = useTenant();
  const criarLoja = useCreateStore();
  const renomearLoja = useRenameStore();
  const pendente = editando ? renomearLoja.isPending : criarLoja.isPending;

  // Janela reaberta começa limpa — inclusive sem o erro da tentativa anterior.
  // Renomeando, começa com o nome atual da Loja.
  useEffect(() => {
    if (open) {
      setNome(store?.name ?? '');
      setErro(null);
    }
  }, [open, store?.id, store?.name]);

  const submeter = async () => {
    const validado = validateStoreName(nome);
    if (!validado.ok) {
      setErro(validado.error);
      return;
    }

    setErro(null);

    if (store) {
      // Nada mudou além de espaços: não há o que gravar.
      if (validado.value === store.name) {
        onOpenChange(false);
        return;
      }
      try {
        const loja = await renomearLoja.mutateAsync({ storeId: store.id, name: validado.value });
        onOpenChange(false);
        toast.success('Loja renomeada.', {
          description: `Agora ela se chama ${loja.name}.`,
        });
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Não foi possível renomear a loja.');
      }
      return;
    }

    try {
      const loja = await criarLoja.mutateAsync(validado.value);
      onOpenChange(false);
      toast.success('Loja criada com sucesso.', {
        description: `${loja.name} já faz parte da sua Conta.`,
        action: {
          label: 'Abrir a loja',
          onClick: () => setActiveTenant(loja.id),
        },
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível criar a loja.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editando ? <Pencil className="h-5 w-5" /> : <Store className="h-5 w-5" />}
            {editando ? 'Renomear Loja' : 'Nova Loja'}
          </DialogTitle>
          <DialogDescription>
            {editando
              ? 'Muda só o nome. Equipe, números de WhatsApp, conversas e histórico da Loja continuam como estão.'
              : 'A Loja nasce vazia, dentro da sua Conta. Depois de criar, convide o Gestor e os Atendentes dela em Equipe.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="nova-loja-nome">Nome da loja</Label>
          <Input
            id="nova-loja-nome"
            value={nome}
            maxLength={STORE_NAME_MAX}
            placeholder="Ex.: Loja Centro"
            autoFocus
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? 'nova-loja-erro' : undefined}
            onChange={(e) => {
              setNome(e.target.value);
              if (erro) setErro(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !pendente) {
                e.preventDefault();
                void submeter();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Use o nome pelo qual o time reconhece a operação: é ele que aparece
            no seletor de Loja.
          </p>
          {erro && (
            <p id="nova-loja-erro" role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pendente}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submeter()} disabled={pendente}>
            {pendente && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editando ? 'Salvar nome' : 'Criar Loja'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewStoreDialog;

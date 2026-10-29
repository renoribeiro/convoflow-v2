import { useEffect, useState } from 'react';
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
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
import { Loader2 } from 'lucide-react';
import type { UserRow } from '@/hooks/users/useUsers';
import { useUpdateUser } from '@/hooks/users/useManageUser';

/**
 * "Editar" da Equipe (lote 6e, decisão D2 parcial, achado 110): muda SÓ o nome
 * e o sobrenome. Cargo, Loja e Conta de quem já entrou ficam em espera até o
 * redesenho da hierarquia; a janela diz isso para ninguém procurar o campo.
 *
 * Grava pelo manage-user (action 'update'), que confere quem pode mexer em
 * quem (Gerente nas pessoas da Conta, Gestor nos Atendentes da Loja) e recusa
 * o próprio perfil: o seu nome se muda em Configurações › Perfil.
 */

export const NOME_MAX = 60;

interface Props {
  pessoa: UserRow | null;
  onClose: () => void;
}

export function EditarPessoaDialog({ pessoa, onClose }: Props) {
  const update = useUpdateUser();
  const [nome, setNome] = useState('');
  const [sobrenome, setSobrenome] = useState('');

  useEffect(() => {
    setNome(pessoa?.first_name ?? '');
    setSobrenome(pessoa?.last_name ?? '');
  }, [pessoa]);

  const nomeLimpo = nome.trim();
  const sobrenomeLimpo = sobrenome.trim();
  const erroNome = !nomeLimpo
    ? 'Informe o nome da pessoa.'
    : nomeLimpo.length > NOME_MAX
      ? `Use até ${NOME_MAX} letras.`
      : null;
  const erroSobrenome = sobrenomeLimpo.length > NOME_MAX ? `Use até ${NOME_MAX} letras.` : null;
  const mudou =
    !!pessoa && (nomeLimpo !== (pessoa.first_name ?? '') || sobrenomeLimpo !== (pessoa.last_name ?? ''));

  const salvar = async () => {
    if (!pessoa || erroNome || erroSobrenome || !mudou) return;
    try {
      await update.mutateAsync({
        targetProfileId: pessoa.id,
        patch: { first_name: nomeLimpo, last_name: sobrenomeLimpo },
      });
      onClose();
    } catch {
      // O hook já mostrou o motivo, em português, vindo do servidor.
    }
  };

  return (
    <Dialog open={!!pessoa} onOpenChange={(aberta) => !aberta && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Editar pessoa</DialogTitle>
          <DialogDescription>
            Aqui se muda o nome que a equipe vê. Cargo, Loja e Conta não mudam por aqui.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="editar-pessoa-nome">Nome *</Label>
              <DicaDoCampo
                rotulo="Nome"
                texto="É o nome que aparece na Equipe, nas Conversas e nos avisos do sino. O email de entrada não muda."
              />
            </div>
            <Input
              id="editar-pessoa-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              aria-invalid={!!erroNome}
              aria-describedby={erroNome ? 'editar-pessoa-nome-erro' : undefined}
              autoComplete="off"
            />
            {erroNome && (
              <p id="editar-pessoa-nome-erro" className="text-sm text-destructive">
                {erroNome}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editar-pessoa-sobrenome">Sobrenome</Label>
            <Input
              id="editar-pessoa-sobrenome"
              value={sobrenome}
              onChange={(e) => setSobrenome(e.target.value)}
              aria-invalid={!!erroSobrenome}
              autoComplete="off"
            />
            {erroSobrenome && <p className="text-sm text-destructive">{erroSobrenome}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!mudou || !!erroNome || !!erroSobrenome || update.isPending}>
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar nome
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

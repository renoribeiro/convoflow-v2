import { ResponsiveTable, type ResponsiveColumn } from '@/components/shared/ResponsiveTable';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { UserDetailsDialog } from './UserDetailsDialog';
import { useState } from 'react';
import { Eye, MoreHorizontal, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RoleBadge } from './RoleBadge';
import { UserStatusBadge } from './UserStatusBadge';
import { UserRow } from '@/hooks/users/useUsers';
import {
  useSuspendUser,
  useReactivateUser,
  useResetUserPassword,
  useSoftDeleteUser,
} from '@/hooks/users/useManageUser';

interface UsersTableProps {
  rows: UserRow[];
  /**
   * Nome da Loja/Conta por id, para a coluna "Loja". Sem isto a coluna mostra
   * um traco -- a tabela nao busca tenant sozinha de proposito, quem monta a
   * tela ja tem essa lista em maos.
   */
  tenantNames?: Record<string, string>;
}

/**
 * Tabela de pessoas.
 *
 * O "Ver detalhes" abre o dialogo DAQUI. Antes era uma prop opcional
 * (`onView?`) que NENHUMA das duas telas passava, entao o item existia no menu,
 * era clicavel, e nao fazia nada -- em Equipe e em Administracao.
 */
export function UsersTable({ rows, tenantNames }: UsersTableProps) {
  const [detalhe, setDetalhe] = useState<UserRow | null>(null);
  const suspend = useSuspendUser();
  const reactivate = useReactivateUser();
  const resetPwd = useResetUserPassword();
  const softDelete = useSoftDeleteUser();

  const nomeDe = (u: UserRow) => [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
  const ultimoAcesso = (u: UserRow) =>
    u.last_login_at ? format(new Date(u.last_login_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Nunca';

  // No cartão: nome lidera, cargo e status como chips, a Loja como campo.
  // Último acesso e total de acessos ficam só na tabela — no celular eles
  // vivem em "Ver detalhes" (UserDetailsDialog), que já os mostra.
  const columns: ResponsiveColumn<UserRow>[] = [
    { key: 'nome', header: 'Nome', card: 'title', cell: nomeDe },
    { key: 'funcao', header: 'Função', card: 'badge', cell: (u) => <RoleBadge role={u.role} /> },
    { key: 'status', header: 'Status', card: 'badge', cell: (u) => <UserStatusBadge status={u.status} /> },
    {
      key: 'loja',
      header: 'Loja',
      cellClassName: 'text-muted-foreground',
      cell: (u) => (u.tenant_id && tenantNames?.[u.tenant_id]) || '—',
    },
    { key: 'ultimo', header: 'Último acesso', card: 'hidden', cell: ultimoAcesso },
    { key: 'acessos', header: 'Acessos', card: 'hidden', cell: (u) => u.login_count },
  ];

  return (
    <div className="rounded-md border">
      <ResponsiveTable
        ariaLabel="Pessoas"
        rows={rows}
        rowKey={(u) => u.id}
        columns={columns}
        empty="Nenhum usuário encontrado."
        actionsHeader="Ações"
        actions={(u) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Ações de ${nomeDe(u)}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ações</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setDetalhe(u)}>
                <Eye className="mr-2 h-4 w-4" /> Ver detalhes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => resetPwd.mutate(u.id)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Redefinir senha
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {u.status === 'active' ? (
                <DropdownMenuItem onClick={() => suspend.mutate(u.id)}>
                  <Pause className="mr-2 h-4 w-4" /> Suspender
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => reactivate.mutate(u.id)}>
                  <Play className="mr-2 h-4 w-4" /> Reativar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  if (
                    window.confirm(
                      'Excluir este usuário? Descendentes serão suspensos.',
                    )
                  ) {
                    softDelete.mutate(u.id);
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <UserDetailsDialog
        row={detalhe}
        tenantName={detalhe?.tenant_id ? tenantNames?.[detalhe.tenant_id] : undefined}
        onClose={() => setDetalhe(null)}
      />
    </div>
  );
}

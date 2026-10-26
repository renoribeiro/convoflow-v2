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
import { Eye, MoreHorizontal, Pause, Play, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RoleBadge } from './RoleBadge';
import { UserStatusBadge } from './UserStatusBadge';
import { UserRow } from '@/hooks/users/useUsers';
import { SEM_MENSAGEM_DICA, type UserActivity } from '@/hooks/users/useAdminUsersActivity';
import { RelativeTime } from '@/components/shared/RelativeTime';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import {
  useCancelInvite,
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
  /**
   * Atividade por perfil (admin_users_activity). SÓ a tela do superadmin
   * passa isto, e é isto que troca as colunas de acesso pelas de atividade.
   * Equipe (gerente e gestor) não passa: continua com "Último acesso" e
   * "Acessos" do próprio perfil.
   */
  activity?: Record<string, UserActivity>;
}

/**
 * Tabela de pessoas.
 *
 * O "Ver detalhes" abre o dialogo DAQUI. Antes era uma prop opcional
 * (`onView?`) que NENHUMA das duas telas passava, entao o item existia no menu,
 * era clicavel, e nao fazia nada -- em Equipe e em Administracao.
 */
/** O texto de cada confirmação da Equipe: o que acontece, com quem, e se volta. */
export function textoDaAcao(
  tipo: 'suspender' | 'excluir' | 'cancelar' | 'senha',
  u: Pick<UserRow, 'role'>,
  nome: string,
) {
  // Gestor e Gerente têm gente abaixo deles; o servidor suspende junto.
  const temEquipeAbaixo = u.role === 'gestor' || u.role === 'gerente';
  const abaixo = temEquipeAbaixo
    ? ' As pessoas abaixo dela (os Atendentes da Loja, ou os Gestores e Atendentes da Conta) perdem o acesso junto.'
    : '';
  switch (tipo) {
    case 'suspender':
      return {
        title: `Suspender ${nome}?`,
        description: `${nome} perde o acesso agora: não entra mais no sistema, e uma tela que já estiver aberta para de mostrar conversas.${abaixo}`,
        reversivel: true,
        comoDesfazer: 'use "Reativar" neste mesmo menu. O Atendente só volta se a Loja tiver vaga.',
        confirmText: 'Suspender',
        variant: 'destructive' as const,
      };
    case 'excluir':
      return {
        title: `Excluir ${nome}?`,
        description: `${nome} perde o acesso e sai da equipe. As conversas e mensagens dela continuam no sistema.${abaixo} Para a pessoa voltar, só com um convite novo.`,
        reversivel: false,
        confirmText: 'Excluir pessoa',
        variant: 'destructive' as const,
      };
    case 'cancelar':
      return {
        title: `Cancelar o convite de ${nome}?`,
        description: 'O link do convite para de funcionar e a vaga fica livre. Para chamar a pessoa de novo, envie outro convite.',
        reversivel: false,
        confirmText: 'Cancelar convite',
        cancelText: 'Voltar',
        variant: 'destructive' as const,
      };
    case 'senha':
      return {
        title: 'Mandar email de nova senha?',
        description: `${nome} recebe um email com um link para criar uma senha nova. A senha atual continua valendo até ela trocar.`,
        confirmText: 'Enviar email',
        variant: 'default' as const,
      };
  }
}

export function UsersTable({ rows, tenantNames, activity }: UsersTableProps) {
  const [detalhe, setDetalhe] = useState<UserRow | null>(null);
  const suspend = useSuspendUser();
  const reactivate = useReactivateUser();
  const resetPwd = useResetUserPassword();
  const softDelete = useSoftDeleteUser();
  const cancelInvite = useCancelInvite();
  // Suspender, excluir, cancelar convite e redefinir senha pedem confirmação
  // (achado 109 do checkup: suspender cortava o acesso num clique, e os outros
  // usavam a caixa do navegador com "Descendentes serão suspensos").
  const [acao, setAcao] = useState<{ tipo: 'suspender' | 'excluir' | 'cancelar' | 'senha'; u: UserRow } | null>(null);

  const nomeDe = (u: UserRow) => [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
  const ultimoAcesso = (u: UserRow) =>
    u.last_login_at ? format(new Date(u.last_login_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Nunca';

  const loja: ResponsiveColumn<UserRow> = {
    key: 'loja',
    header: 'Loja',
    cellClassName: 'text-muted-foreground',
    cell: (u) => (u.tenant_id && tenantNames?.[u.tenant_id]) || '—',
  };

  // No cartão: nome lidera, cargo e status como chips, a Loja como campo.
  // Último acesso e total de acessos ficam só na tabela — no celular eles
  // vivem em "Ver detalhes" (UserDetailsDialog), que já os mostra.
  const colunasEquipe: ResponsiveColumn<UserRow>[] = [
    loja,
    { key: 'ultimo', header: 'Último acesso', card: 'hidden', cell: ultimoAcesso },
    { key: 'acessos', header: 'Acessos', card: 'hidden', cell: (u) => u.login_count },
  ];

  // Superadmin. A área útil ao lado do menu tem ~690 px a 1024, ~940 a 1280 e
  // ~1200 a 1536: as colunas entram por largura, e "Ver detalhes" mostra
  // todas em qualquer tela. No cartão (celular) fica "Visto por último".
  const atividadeDe = (u: UserRow) => activity?.[u.id];
  const colunasSuperadmin: ResponsiveColumn<UserRow>[] = [
    { ...loja, hideBelow: 'xl' },
    {
      key: 'visto',
      header: 'Visto por último',
      cell: (u) => <RelativeTime value={atividadeDe(u)?.last_seen_at} empty="Nunca" />,
    },
    {
      key: 'mensagens',
      header: 'Mensagens 7d / 30d',
      card: 'hidden',
      hideBelow: 'xl',
      cellClassName: 'tabular-nums whitespace-nowrap',
      cell: (u) => `${atividadeDe(u)?.messages_7d ?? 0} / ${atividadeDe(u)?.messages_30d ?? 0}`,
    },
    {
      key: 'ultimo',
      header: 'Último acesso',
      card: 'hidden',
      hideBelow: '2xl',
      cell: (u) => <RelativeTime value={atividadeDe(u)?.last_sign_in_at} empty="Nunca" />,
    },
    {
      key: 'ultima-mensagem',
      header: 'Última mensagem',
      card: 'hidden',
      hideBelow: '2xl',
      cell: (u) => <RelativeTime value={atividadeDe(u)?.last_message_at} empty="—" emptyTitle={SEM_MENSAGEM_DICA} />,
    },
  ];

  const columns: ResponsiveColumn<UserRow>[] = [
    { key: 'nome', header: 'Nome', card: 'title', cell: nomeDe },
    { key: 'funcao', header: 'Função', card: 'badge', cell: (u) => <RoleBadge role={u.role} /> },
    { key: 'status', header: 'Status', card: 'badge', cell: (u) => <UserStatusBadge status={u.status} /> },
    ...(activity ? colunasSuperadmin : colunasEquipe),
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
              <DropdownMenuItem onClick={() => setAcao({ tipo: 'senha', u })}>
                <RotateCcw className="mr-2 h-4 w-4" /> Redefinir senha
              </DropdownMenuItem>
              {/*
                Por status (limite de atendentes por Loja, 2026-10-09):
                  ativo     → Suspender (libera a vaga) e Excluir;
                  suspenso  → Reativar (o servidor confere se há vaga) e Excluir;
                  pendente  → Cancelar convite (o convite ocupa vaga até sair);
                  excluído  → nada: quem foi excluído volta só com convite novo.
              */}
              {u.status !== 'deleted' && <DropdownMenuSeparator />}
              {u.status === 'active' && (
                <DropdownMenuItem onClick={() => setAcao({ tipo: 'suspender', u })}>
                  <Pause className="mr-2 h-4 w-4" /> Suspender
                </DropdownMenuItem>
              )}
              {u.status === 'suspended' && (
                <DropdownMenuItem onClick={() => reactivate.mutate(u.id)}>
                  <Play className="mr-2 h-4 w-4" /> Reativar
                </DropdownMenuItem>
              )}
              {u.status === 'pending' && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setAcao({ tipo: 'cancelar', u })}
                >
                  <XCircle className="mr-2 h-4 w-4" /> Cancelar convite
                </DropdownMenuItem>
              )}
              {(u.status === 'active' || u.status === 'suspended') && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setAcao({ tipo: 'excluir', u })}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Excluir
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {acao && (
        <ConfirmationDialog
          isOpen
          onClose={() => setAcao(null)}
          {...textoDaAcao(acao.tipo, acao.u, nomeDe(acao.u))}
          onConfirm={async () => {
            const id = acao.u.id;
            if (acao.tipo === 'suspender') await suspend.mutateAsync(id);
            if (acao.tipo === 'excluir') await softDelete.mutateAsync(id);
            if (acao.tipo === 'cancelar') await cancelInvite.mutateAsync(id);
            if (acao.tipo === 'senha') await resetPwd.mutateAsync(id);
          }}
        />
      )}

      <UserDetailsDialog
        row={detalhe}
        tenantName={detalhe?.tenant_id ? tenantNames?.[detalhe.tenant_id] : undefined}
        activity={detalhe && activity ? activity[detalhe.id] ?? null : undefined}
        onClose={() => setDetalhe(null)}
      />
    </div>
  );
}

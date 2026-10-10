import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, UserPlus } from 'lucide-react';
import { useUsers, UsersFilters } from '@/hooks/users/useUsers';
import { useAdminUsersActivity } from '@/hooks/users/useAdminUsersActivity';
import { UsersTable } from '@/components/users/UsersTable';
import { InviteUserModal } from '@/components/users/InviteUserModal';
import { ROLE_LABELS, STATUS_LABELS, UserRole, UserStatus } from '@/types/userHierarchy';
import { PageHeader } from '@/components/shared/PageHeader';

export default function UsersPage() {
  const [filters, setFilters] = useState<UsersFilters>({});
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: users = [], isLoading } = useUsers({ ...filters, search });
  // Uma chamada para todo mundo (admin_users_activity): entrada, visto por
  // último, mensagens, Loja/Conta, IP e navegador. Só o superadmin executa.
  const atividade = useAdminUsersActivity();

  // A coluna "Loja" lê nome por tenant_id; aqui ele vem da própria atividade,
  // sem consulta extra. Antes esta tela não passava nada e a coluna era "—".
  const tenantNames = useMemo(() => {
    const nomes: Record<string, string> = {};
    for (const u of users) {
      const nome = atividade.data?.[u.id]?.tenant_name;
      if (u.tenant_id && nome) nomes[u.tenant_id] = nome;
    }
    return nomes;
  }, [users, atividade.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Usuários"
        helpKey="page:admin-users"
        description="Hierarquia completa de Superadmins, Contas e Lojas."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Administração', href: '/dashboard/admin' },
          { label: 'Usuários' },
        ]}
        actions={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Convidar usuário
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={filters.role ?? 'all'}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, role: v === 'all' ? undefined : (v as UserRole) }))
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Função" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as funções</SelectItem>
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.status ?? 'all'}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                status: v === 'all' ? undefined : (v as UserStatus),
              }))
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {(Object.keys(STATUS_LABELS) as UserStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {atividade.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar a atividade das pessoas (visto por último, mensagens, IP e
            navegador). A lista abaixo mostra só o que está no perfil; recarregue a página para tentar
            de novo.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          {isLoading || atividade.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <UsersTable rows={users} tenantNames={tenantNames} activity={atividade.data} />
          )}
        </CardContent>
      </Card>

      <InviteUserModal open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

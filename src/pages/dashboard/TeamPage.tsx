import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Search, Store, UserPlus } from 'lucide-react';
import { useUsers } from '@/hooks/users/useUsers';
import { UsersTable } from '@/components/users/UsersTable';
import { InviteUserModal } from '@/components/users/InviteUserModal';
import { NewStoreDialog } from '@/components/stores/NewStoreDialog';
import { useMyStores } from '@/hooks/useMyStores';
import { useAccountStoreSlots } from '@/hooks/useAccountStoreSlots';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { PageHeader } from '@/components/shared/PageHeader';

export default function TeamPage() {
  const role = useRole();
  const { profile, tenant, tenantId, setActiveTenant } = useTenant();
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [novaLojaOpen, setNovaLojaOpen] = useState(false);

  const isGerente = role === 'gerente';

  const { data: users = [], isLoading } = useUsers({ search });
  // Os dois hooks abaixo só consultam quando o cargo é gerente; para os demais
  // não sai query nenhuma e a tela fica exatamente como era.
  const { stores, isLoading: lojasCarregando } = useMyStores();
  const { capacity, isLoading: vagasCarregando } = useAccountStoreSlots();

  /**
   * Nome da Loja por id, para a coluna "Loja" da tabela de pessoas.
   *
   * A hierarquia Conta > Loja > pessoa nao aparecia em lugar nenhum: a tabela
   * listava gente sem dizer onde cada uma trabalha, e num grupo com varias
   * lojas isso e a primeira pergunta de quem olha.
   *
   * Junta as Lojas filhas (gerente) com a propria Conta/Loja em foco, que
   * cobre o gestor -- ele nao tem lista de filhas, so a Loja dele.
   */
  const tenantNames = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const loja of stores) mapa[loja.id] = loja.name;
    if (tenant?.id && tenant.name) mapa[tenant.id] = tenant.name;
    return mapa;
  }, [stores, tenant?.id, tenant?.name]);

  const lojasUsadas = stores.length;
  const dadosDeVagaProntos = isGerente && !lojasCarregando && !vagasCarregando;
  /**
   * Só bloqueia quando temos certeza de que não cabe. Capacidade zero é quase
   * sempre consulta que falhou — nesse caso o botão continua clicável e quem
   * responde é o servidor, que sabe a verdade. Errar para o lado de deixar
   * tentar é melhor do que travar um gerente que tem vaga.
   */
  const semVaga = dadosDeVagaProntos && capacity > 0 && lojasUsadas >= capacity;
  const contadorLojas = dadosDeVagaProntos
    ? `${lojasUsadas} de ${capacity} ${capacity === 1 ? 'loja' : 'lojas'}`
    : null;

  const heading = isGerente ? 'Minhas Lojas' : 'Minha Equipe';
  const description = isGerente
    ? 'Lojas da sua Conta e quem tem acesso a elas.'
    : tenant?.name
      ? `Usuários da Conta ${tenant.name}.`
      : 'Selecione uma Conta para gerenciar a equipe.';

  return (
    <div className="space-y-6">
      <PageHeader
        title={heading}
        helpKey="page:team"
        description={description}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: heading },
        ]}
        actions={
          profile ? (
            <>
              {isGerente && (
                <>
                  {contadorLojas && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {contadorLojas}
                    </span>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      {/*
                        Botão desabilitado não dispara evento de mouse, então o
                        gatilho do tooltip precisa ser o span em volta — sem
                        ele, o motivo de estar cinza não apareceria nunca.
                      */}
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={semVaga}
                            onClick={() => setNovaLojaOpen(true)}
                          >
                            <Store className="h-4 w-4 mr-2" />
                            Nova Loja
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {semVaga
                          ? `Sua Conta já usa as ${capacity} lojas do plano. Contrate lojas adicionais em Configurações › Assinatura para criar mais.`
                          : 'Cria uma Loja nova dentro da sua Conta.'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Convidar
              </Button>
            </>
          ) : undefined
        }
      />

      {isGerente && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Lojas da sua Conta</CardTitle>
          </CardHeader>
          <CardContent>
            {lojasCarregando ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-md" />
                ))}
              </div>
            ) : stores.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma loja cadastrada ainda. Use "Nova Loja" para criar a primeira.
              </p>
            ) : (
              <ul className="space-y-2">
                {stores.map((loja) => {
                  const emFoco = loja.id === tenantId;
                  return (
                    <li
                      key={loja.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Store className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate text-sm">{loja.name}</span>
                        {emFoco && (
                          <Badge variant="secondary" className="flex-shrink-0">
                            Em foco
                          </Badge>
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={emFoco}
                        onClick={() => setActiveTenant(loja.id)}
                      >
                        {emFoco ? 'Aberta' : 'Abrir'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filtrar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        {isGerente && (
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Pessoas da sua Conta</CardTitle>
          </CardHeader>
        )}
        <CardContent className={isGerente ? undefined : 'pt-6'}>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <UsersTable rows={users} tenantNames={tenantNames} />
          )}
        </CardContent>
      </Card>

      <InviteUserModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        defaultTenantId={tenant?.id ?? null}
      />

      {isGerente && (
        <NewStoreDialog open={novaLojaOpen} onOpenChange={setNovaLojaOpen} />
      )}
    </div>
  );
}

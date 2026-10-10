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
import { Pencil, Search, Store, UserPlus } from 'lucide-react';
import { useUsers } from '@/hooks/users/useUsers';
import { UsersTable } from '@/components/users/UsersTable';
import { InviteUserModal } from '@/components/users/InviteUserModal';
import { NewStoreDialog } from '@/components/stores/NewStoreDialog';
import { useMyStores, type MyStore } from '@/hooks/useMyStores';
import { useAccountStoreSlots } from '@/hooks/useAccountStoreSlots';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { canRenameStore } from '@/lib/stores/storeRename';
import { useStoreAttendantSeats } from '@/hooks/useStoreAttendantSeats';
import {
  isStoreFull,
  pendingInvitesLabel,
  seatsCounterLabel,
} from '@/lib/users/attendantSeats';

export default function TeamPage() {
  const role = useRole();
  const { profile, tenant, tenantId, setActiveTenant } = useTenant();
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [novaLojaOpen, setNovaLojaOpen] = useState(false);
  // A Loja que está sendo renomeada fica guardada depois de fechar a janela,
  // para o título não piscar de "Renomear" para "Nova" durante a animação.
  const [renomearOpen, setRenomearOpen] = useState(false);
  const [lojaRenomeada, setLojaRenomeada] = useState<{ id: string; name: string } | null>(null);

  const isGerente = role === 'gerente';
  const isSuperadmin = role === 'superadmin';
  const tenantKind = tenant?.kind ?? null;
  // Superadmin com uma Conta em foco vê as Lojas dela (para poder renomeá-las).
  const contaDoSuperadmin = isSuperadmin && tenantKind === 'account' ? tenant?.id ?? null : null;

  const { data: users = [], isLoading } = useUsers({ search });
  // Os dois hooks abaixo só consultam para o gerente (e a lista de Lojas, para
  // o superadmin com uma Conta em foco); para os demais não sai query nenhuma.
  const { stores, isLoading: lojasCarregando } = useMyStores({
    superadminAccountId: contaDoSuperadmin,
  });
  const { capacity, isLoading: vagasCarregando } = useAccountStoreSlots();

  /**
   * O cartão de Lojas, por cargo:
   *  - gerente: as Lojas da Conta dele, com "Abrir";
   *  - superadmin com uma Conta em foco: as Lojas dessa Conta, com "Abrir";
   *  - gestor, ou superadmin com uma Loja em foco: só a Loja aberta;
   *  - atendente: nenhum cartão — a tela continua só a lista de pessoas.
   * O lápis de renomear aparece onde `canRenameStore` deixa; o banco confere
   * de novo em rename_store.
   */
  const lojaAberta: MyStore | null =
    tenant && tenantKind === 'store'
      ? { id: tenant.id, name: tenant.name, parent_tenant_id: tenant.parent_tenant_id ?? null }
      : null;
  const cartaoDeLojas: { titulo: string; lojas: MyStore[]; lista: boolean } | null = isGerente
    ? { titulo: 'Lojas da sua Conta', lojas: stores, lista: true }
    : contaDoSuperadmin
      ? { titulo: 'Lojas desta Conta', lojas: stores, lista: true }
      : (role === 'gestor' || isSuperadmin) && lojaAberta
        ? { titulo: role === 'gestor' ? 'Sua Loja' : 'Loja em foco', lojas: [lojaAberta], lista: false }
        : null;

  /**
   * Vagas de atendente de cada Loja do cartão ("Atendentes: 1 de 2"). O
   * superadmin passa a Conta ou a Loja em foco; gerente e gestor, nada (a RPC
   * já sabe o alcance de cada um).
   */
  const { byStore: vagasPorLoja } = useStoreAttendantSeats({
    tenantId: isSuperadmin ? contaDoSuperadmin ?? lojaAberta?.id ?? null : null,
    enabled: !!cartaoDeLojas,
  });

  const quemRenomeia = profile
    ? {
        role: profile.role,
        tenant_id: profile.tenant_id,
        capabilities: (profile as { capabilities?: unknown }).capabilities,
      }
    : null;

  const abrirRenomear = (loja: MyStore) => {
    setLojaRenomeada({ id: loja.id, name: loja.name });
    setRenomearOpen(true);
  };

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

      {cartaoDeLojas && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{cartaoDeLojas.titulo}</CardTitle>
          </CardHeader>
          <CardContent>
            {cartaoDeLojas.lista && lojasCarregando ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-md" />
                ))}
              </div>
            ) : cartaoDeLojas.lojas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isGerente
                  ? 'Nenhuma loja cadastrada ainda. Use "Nova Loja" para criar a primeira.'
                  : 'Esta Conta ainda não tem Lojas.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {cartaoDeLojas.lojas.map((loja) => {
                  const emFoco = loja.id === tenantId;
                  const vagas = vagasPorLoja[loja.id];
                  const pendentes = vagas ? pendingInvitesLabel(vagas) : null;
                  return (
                    <li
                      key={loja.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Store className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="truncate text-sm">{loja.name}</span>
                            {emFoco && cartaoDeLojas.lista && (
                              <Badge variant="secondary" className="flex-shrink-0">
                                Em foco
                              </Badge>
                            )}
                          </span>
                          {vagas && (
                            <span
                              className="block text-xs text-muted-foreground"
                              data-testid={`vagas-${loja.id}`}
                            >
                              {seatsCounterLabel(vagas)}
                              {pendentes && ` · ${pendentes}`}
                              {isStoreFull(vagas) && ' · Loja cheia'}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        {canRenameStore(quemRenomeia, loja) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Renomear"
                            aria-label={`Renomear ${loja.name}`}
                            onClick={() => abrirRenomear(loja)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {cartaoDeLojas.lista && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={emFoco}
                            onClick={() => setActiveTenant(loja.id)}
                          >
                            {emFoco ? 'Aberta' : 'Abrir'}
                          </Button>
                        )}
                      </span>
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

      {lojaRenomeada && (
        <NewStoreDialog
          open={renomearOpen}
          onOpenChange={setRenomearOpen}
          store={lojaRenomeada}
        />
      )}
    </div>
  );
}

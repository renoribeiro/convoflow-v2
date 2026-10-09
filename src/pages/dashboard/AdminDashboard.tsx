import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { BugReportSettings } from '@/components/admin/BugReportSettings';
import { MaintenanceSettings } from '@/components/admin/MaintenanceSettings';
import { RoleDescriptionCard } from '@/components/admin/RoleDescriptionCard';
import { SystemSettings } from '@/components/settings/SystemSettings';
import { SignupLeadsTab } from '@/components/admin/SignupLeadsTab';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/shared/ResponsiveTable';
import {
  Users,
  CreditCard,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Filter,
  Download,
  Eye,
  Edit,
  Trash2,
  Plus,
  BarChart3,
  Settings,
  Calendar,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { useIsSuperAdmin } from '@/contexts/TenantContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { STATUS_LABELS, UserRole } from '@/types/userHierarchy';
import { accountStatePatch, checkboxValueFor, profileStatusOf } from '@/lib/accountStatus';
import { BillingDashboard } from '@/components/admin/billing/BillingDashboard';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { adminAccessLabel, type AccessLabelTone } from '@/lib/billing/subscriptionView';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive' | 'suspended';
  /**
   * `profiles.status` cru — a fonte da verdade do estado da conta
   * ('pending' | 'active' | 'suspended' | 'deleted'). O campo `status` acima é
   * o rótulo antigo desta tela e não distingue "convite não aceito" de
   * "suspenso pelo admin"; para gravar, use este.
   */
  profileStatus?: string;
  lastLogin: string;
  createdAt: string;
  tenantId?: string;
  tenantName?: string;
  planType?: string;
  phone?: string;
  avatarUrl?: string;
}

/**
 * Tira a mensagem de dentro do erro de uma edge function.
 *
 * O `FunctionsHttpError` do supabase-js guarda a resposta crua em `.context`.
 * As funções deste projeto devolvem DOIS formatos:
 *   { error: "texto" }                        (json() direto)
 *   { error: { message, code, requestId } }   (createErrorResponse/SecureError)
 *
 * O código antigo pegava `ctx.error` e jogava no toast sem olhar o tipo — no
 * segundo formato isso virava o famoso "[object Object]", que escondeu por
 * completo o motivo real da falha ao criar usuário.
 */
const extrairMensagemDeErro = async (error: unknown): Promise<string> => {
  const fallback = error instanceof Error ? error.message : 'Erro desconhecido';
  const contexto = (error as { context?: unknown })?.context;
  if (!contexto) return fallback;

  let corpo: any = contexto;
  if (typeof (contexto as Response)?.json === 'function') {
    corpo = await (contexto as Response).json().catch(() => null);
  }
  if (!corpo) return fallback;

  const detalhe = corpo.error ?? corpo.message;
  if (typeof detalhe === 'string' && detalhe.trim()) return detalhe;
  if (detalhe && typeof detalhe.message === 'string' && detalhe.message.trim()) {
    return detalhe.message;
  }
  return fallback;
};

/** Cor do selo de acesso (o "bloqueado" usa a variante destructive). */
const SELO_DE_ACESSO: Record<Exclude<AccessLabelTone, 'bloqueado'>, string> = {
  pago: 'bg-green-500 hover:bg-green-600',
  teste: 'bg-blue-500 hover:bg-blue-600',
  pendente: 'bg-amber-500 hover:bg-amber-600',
  manual: 'bg-purple-500 hover:bg-purple-600',
};

interface Subscription {
  id: string;
  userId: string;
  userName: string;
  plan: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  amount: number;
  currency: string;
  nextBilling: string;
  stripeSubscriptionId: string;
}

const AdminDashboard = () => {
  const { user, isLoading: authLoading } = useAuth();
  // Capturado aqui porque dentro do .map a variável `user` é sombreada pela linha.
  const currentUserId = user?.id ?? null;
  const isSuperAdmin = useIsSuperAdmin();
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeUsersDateFilter, setActiveUsersDateFilter] = useState('30');
  const [newSubscriptionsDateFilter, setNewSubscriptionsDateFilter] = useState('30');

  // Estados para modais e formulários
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [isDeleteUserOpen, setIsDeleteUserOpen] = useState(false);
  const [isViewUserOpen, setIsViewUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Estados do formulário de usuário
  const [userForm, setUserForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    // 'atendente' e não 'user': 'user' é nome de cargo legado, não casa com
    // nenhuma opção do <Select> e fazia o campo abrir vazio. O `as User['role']`
    // fica para o useState inferir o tipo da união, não o literal.
    role: 'atendente' as User['role'],
    isActive: true,
    tenantId: '',
    /** Só para Gerente: nome da Conta a criar junto com o convite. */
    newTenantName: '',
    planType: 'basic'
  });

  // Queries para buscar dados

  // Query para buscar usuários usando a view admin_users_view que já combina auth.users e profiles
  const { data: usersWithEmails = [], isLoading: usersLoading, refetch: refetchUsers, error: usersError } = useSupabaseQuery({
    table: 'admin_users_view',
    queryKey: ['admin-users', isSuperAdmin],
    select: `
      id,
      email,
      first_name,
      last_name,
      role,
      is_active,
      status,
      phone,
      created_at,
      profile_updated_at,
      tenant_id
    `,
    orderBy: [{ column: 'created_at', ascending: false }],
    enabled: !!user && !authLoading && isSuperAdmin // Só executa se estiver autenticado e for super admin
  });

  // A admin_users_view não traz colunas de acesso da Conta; carregamos os
  // tenants à parte (superadmin lê todos via RLS) e cruzamos por tenant_id.
  const { data: tenantsRows = [], refetch: refetchTenants } = useSupabaseQuery({
    table: 'tenants',
    queryKey: ['admin-tenants-access'],
    select: 'id, name, kind, parent_tenant_id, subscription_status, trial_ends_at, subscription_will_cancel, subscription_cancel_at, manual_access_granted, manual_access_granted_at',
    orderBy: [{ column: 'name', ascending: true }],
    enabled: !!user && !authLoading && isSuperAdmin,
  });
  const tenantById: Record<string, any> = {};
  for (const t of tenantsRows as any[]) tenantById[t.id] = t;

  /**
   * A linha que responde pela cobrança de um tenant.
   *
   *   Loja COM pai            → a Conta pai.
   *   Conta, ou Loja SEM pai  → ela mesma.
   *
   * Mesma regra da RPC `tenant_access_state` e de
   * `src/lib/access/tenantAccess.ts`. Aqui ela é feita no cliente porque o
   * superadmin lê todos os tenants pelo RLS, então a Conta pai já está na mão.
   *
   * Isto é o que faz o botão de liberação manual escrever no lugar certo: só a
   * Conta assina, então liberar um Gestor tem que marcar a CONTA dele — marcar a
   * Loja não destrava mais nada desde que o acesso passou a ser herdado.
   */
  const contaDeCobranca = (tenantId?: string | null): any | null => {
    const t = tenantId ? tenantById[tenantId] : null;
    if (!t) return null;
    if (t.kind === 'store' && t.parent_tenant_id) return tenantById[t.parent_tenant_id] ?? t;
    return t;
  };

  // Filtrar usuários com base no termo de busca
  const filteredUsers = usersWithEmails.filter((u: any) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
    const email = (u.email || '').toLowerCase();
    return fullName.includes(term) || email.includes(term);
  });

  // useEffect SEMPRE antes de early returns para não violar Rules of Hooks.
  // Em React Strict mode, número de hooks chamados muda entre renders →
  // erro "Rendered more hooks than during the previous render" → tela crasha.

  // Mostrar erro se não for super admin
  React.useEffect(() => {
    if (user && !isSuperAdmin && !usersLoading && !authLoading) {
      toast.error('Acesso negado: Apenas super administradores podem acessar esta página');
    }
  }, [user, isSuperAdmin, usersLoading, authLoading]);

  // Mostrar erro se houver problema na query de usuários
  React.useEffect(() => {
    if (usersError) {
      toast.error('Erro ao carregar usuários: ' + usersError.message);
    }
  }, [usersError]);

  // Mutations para CRUD de usuários
  // createUserMutation removido - agora usamos supabase.auth.signUp() diretamente

  const updateUserMutation = useSupabaseMutation({
    table: 'profiles',
    operation: 'update',
    onSuccess: () => {
      toast.success('Usuário atualizado com sucesso!');
      setIsEditUserOpen(false);
      resetUserForm();
      refetchUsers();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar usuário: ' + error.message);
    }
  });

  // Delete user agora é feito via edge function admin-create-user (método DELETE)

  // Early returns DEPOIS de todos os hooks
  if (authLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-md animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-muted rounded-md animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Funções auxiliares
  const resetUserForm = () => {
    setUserForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      // Mesmo padrão do estado inicial — senão o formulário voltava a abrir
      // vazio depois de criar ou cancelar.
      role: 'atendente' as User['role'],
      isActive: true,
      tenantId: '',
      newTenantName: '',
      planType: 'basic'
    });
  };

  const handleCreateUser = async () => {
    if (!userForm.firstName || !userForm.lastName || !userForm.email) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    // O convite é um e-mail de verdade: endereço sem domínio válido só falha lá
    // no Auth, com uma mensagem que não ajuda ninguém.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(userForm.email)) {
      toast.error('E-mail inválido. Use um endereço completo, como nome@empresa.com.br');
      return;
    }

    // Gestor e Atendente vivem dentro de uma Loja que já existe.
    if ((userForm.role === 'gestor' || userForm.role === 'atendente') && !userForm.tenantId) {
      toast.error('Selecione a Loja do usuário');
      return;
    }

    // Gerente é dono de uma Conta: ela é criada agora, junto com o convite.
    if (userForm.role === 'gerente' && !userForm.newTenantName.trim()) {
      toast.error('Informe o nome da Conta do gerente');
      return;
    }

    setIsLoading(true);
    try {
      // Usar edge function para criar usuário sem afetar sessão do admin
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: userForm.email,
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          phone: userForm.phone || null,
          role: userForm.role,
          isActive: userForm.isActive,
          tenantId: userForm.tenantId || null,
          newTenantName: userForm.newTenantName.trim() || null,
          redirectTo: window.location.origin,
        }
      });

      if (error) {
        throw new Error(await extrairMensagemDeErro(error));
      }

      if (data?.warning) {
        toast.warning('Usuário criado, mas: ' + data.warning);
      } else {
        toast.success('Usuário criado com sucesso! Um email de redefinição de senha foi enviado.');
      }

      setIsCreateUserOpen(false);
      resetUserForm();
      refetchUsers();
    } catch (error: any) {
      logger.error('Erro ao criar usuário', { error: error?.message ?? 'Erro desconhecido' });
      toast.error('Erro ao criar usuário: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditUser = () => {
    if (!selectedUser) return;

    // NÃO grave is_active aqui. Ele é espelho derivado de status (trigger
    // force_profile_is_active): escrever direto é descartado pelo banco.
    // Quem manda é status — as regras estão em @/lib/accountStatus.
    const accountState = accountStatePatch(userForm.isActive, selectedUser.profileStatus);

    updateUserMutation.mutate({
      data: {
        first_name: userForm.firstName,
        last_name: userForm.lastName,
        phone: userForm.phone,
        role: userForm.role,
        ...accountState,
        tenant_id: userForm.tenantId || null,
      },
      options: {
        filter: { column: 'user_id', operator: 'eq', value: selectedUser.id }
      }
    });
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        method: 'DELETE',
        body: { userId: selectedUser.id }
      });

      if (error) throw new Error(await extrairMensagemDeErro(error));

      toast.success('Usuário excluído com sucesso!');
      setIsDeleteUserOpen(false);
      setSelectedUser(null);
      refetchUsers();
    } catch (error: any) {
      logger.error('Erro ao excluir usuário', { error: error?.message ?? 'Erro desconhecido' });
      toast.error('Erro ao excluir usuário: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsLoading(false);
    }
  };

  // Redirect se não for super admin
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Colunas da tabela de usuários (ver ResponsiveTable para o que é `card`).
  const renderPlanoAcesso = (user: any) => {
    // Quem responde pelo acesso é a Conta, não a Loja.
    const t = contaDeCobranca(user.tenant_id);
    const propria = user.tenant_id ? tenantById[user.tenant_id] : null;
    const herda = !!t && !!propria && t.id !== propria.id;

    // Teste grátis e pagamento pendente também liberam o sistema (a trava é
    // tenant_access_state). Ver adminAccessLabel.
    const acesso = adminAccessLabel(t);
    const selo =
      acesso.tone === 'bloqueado' ? (
        <Badge variant="destructive">{acesso.label}</Badge>
      ) : (
        <Badge
          className={SELO_DE_ACESSO[acesso.tone]}
          title={
            acesso.tone === 'manual' && t?.manual_access_granted_at
              ? `Liberado em ${format(new Date(t.manual_access_granted_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`
              : undefined
          }
        >
          {acesso.label}
        </Badge>
      );

    if (!herda && !acesso.note) return selo;
    if (!herda) {
      return (
        <div className="flex flex-col items-start gap-1">
          {selo}
          <span className="text-xs text-muted-foreground">{acesso.note}</span>
        </div>
      );
    }

    // Deixa visível de onde vem o acesso, sem precisar
    // passar o mouse: a Loja não decide nada sozinha.
    return (
      <div className="flex flex-col items-start gap-1">
        {selo}
        <span className="text-xs text-muted-foreground">
          herda da Conta {t.name}
          {acesso.note ? ` · ${acesso.note}` : ''}
        </span>
      </div>
    );
  };

  const adminUserColumns: ResponsiveColumn<any>[] = [
    {
      key: 'nome',
      header: 'Nome',
      card: 'title',
      cellClassName: 'font-medium',
      cell: (user) => (
        <div className="min-w-0">
          <p>{user.first_name} {user.last_name}</p>
          {/* Enquanto a coluna E-mail está escondida (abaixo de 2xl), o e-mail mora aqui. */}
          <p className="text-xs font-normal text-muted-foreground break-all 2xl:hidden">{user.email}</p>
        </div>
      ),
      cardCell: (user) => <>{user.first_name} {user.last_name}</>,
    },
    { key: 'email', header: 'Email', card: 'subtitle', hideBelow: '2xl', cell: (user) => <span className="break-all">{user.email}</span> },
    {
      key: 'funcao',
      header: 'Função',
      card: 'badge',
      cell: (user) => (
        <Badge variant={user.role === 'superadmin' ? 'destructive' : 'secondary'}>
          {user.role}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      card: 'badge',
      cell: (user) => (
        <Badge variant={profileStatusOf(user) === 'active' ? 'default' : 'secondary'}>
          {STATUS_LABELS[profileStatusOf(user)]}
        </Badge>
      ),
    },
    { key: 'conta', header: 'Conta', cell: (user) => (user.tenant_id && tenantById[user.tenant_id]?.name) || 'N/A' },
    { key: 'plano', header: 'Plano / Acesso', cardFull: true, cell: renderPlanoAcesso },
    {
      key: 'criado',
      header: 'Criado em',
      card: 'hidden',
      hideBelow: '2xl',
      cell: (user) => format(new Date(user.created_at), 'dd/MM/yyyy', { locale: ptBR }),
    },
  ];

  const renderUserActions = (user: any) => (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(() => {
              // O alvo da liberação é sempre a Conta que responde
              // pela cobrança — para um Gestor, a Conta pai da
              // Loja dele. Marcar a Loja não destrava mais nada.
              const alvo = contaDeCobranca(user.tenant_id);
              const propria = user.tenant_id ? tenantById[user.tenant_id] : null;
              const herda = !!alvo && !!propria && alvo.id !== propria.id;
              const liberado = !!alvo?.manual_access_granted;
              const nomeAlvo = alvo?.name ?? 'Conta';

              // O superadmin precisa saber ANTES de clicar que
              // está mexendo na Conta inteira, não só nesta Loja.
              const aviso = herda
                ? ` (vale para a Conta ${nomeAlvo} e todas as Lojas dela)`
                : '';

              return (
                <Button
                  variant="outline"
                  size="sm"
                  className={liberado ? "text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600" : "text-purple-600 border-purple-200 hover:bg-purple-50 hover:text-purple-700"}
                  onClick={async () => {
                    try {
                      if (!user.tenant_id) {
                        toast.error('Usuário não possui uma Conta associada.');
                        return;
                      }
                      if (!alvo) {
                        toast.error('Não foi possível identificar a Conta que responde por este usuário.');
                        return;
                      }

                      const newValue = !liberado;
                      const { error } = await supabase
                        .from('tenants')
                        .update({
                          manual_access_granted: newValue,
                          manual_access_granted_by: newValue ? currentUserId : null,
                          manual_access_granted_at: newValue ? new Date().toISOString() : null,
                        })
                        .eq('id', alvo.id);

                      if (error) throw error;

                      // Auditoria: registra em QUAL tenant a marca
                      // foi feita, e de onde a ação partiu — sem a
                      // nota, o histórico da Conta não explica por
                      // que alguém a liberou a partir de uma Loja.
                      await supabase
                        .from('tenant_access_events' as never)
                        .insert({
                          tenant_id: alvo.id,
                          action: newValue ? 'granted' : 'revoked',
                          source: 'manual',
                          actor_user_id: currentUserId,
                          note: herda
                            ? `Ação feita a partir do usuário ${user.email} (Loja ${propria?.name ?? user.tenant_id}); aplicada na Conta ${nomeAlvo}.`
                            : `Ação feita a partir do usuário ${user.email}.`,
                        } as never);

                      toast.success(
                        newValue
                          ? `Acesso liberado para a Conta ${nomeAlvo}.`
                          : `Acesso manual revogado da Conta ${nomeAlvo}.`,
                        herda
                          ? { description: 'Vale para todas as Lojas dessa Conta.' }
                          : undefined,
                      );
                      refetchTenants();
                      refetchUsers();
                    } catch (error: any) {
                      toast.error('Erro ao alterar acesso: ' + error.message);
                    }
                  }}
                  title={
                    liberado
                      ? `Revogar o acesso manual da Conta ${nomeAlvo}${aviso}`
                      : `Liberar manualmente a Conta ${nomeAlvo}${aviso}`
                  }
                >
                  {liberado ? 'Revogar Acesso' : 'Liberar Manualmente'}
                </Button>
              );
            })()}
            <Button

              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedUser({
                  id: user.id,
                  name: `${user.first_name} ${user.last_name}`,
                  email: user.email,
                  role: user.role,
                  status: user.is_active ? 'active' : 'inactive',
                  lastLogin: '',
                  createdAt: user.created_at,
                  tenantId: user.tenant_id,
                  tenantName: '', // Removido pois não temos mais o join com tenants
                  phone: user.phone
                });
                setIsViewUserOpen(true);
              }}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedUser({
                  id: user.id,
                  name: `${user.first_name} ${user.last_name}`,
                  email: user.email,
                  role: user.role,
                  status: user.is_active ? 'active' : 'inactive',
                  profileStatus: user.status,
                  lastLogin: '',
                  createdAt: user.created_at,
                  tenantId: user.tenant_id,
                  tenantName: '', // Removido pois não temos mais o join com tenants
                  phone: user.phone
                });
                setUserForm({
                  firstName: user.first_name || '',
                  lastName: user.last_name || '',
                  email: user.email || '',
                  phone: user.phone || '',
                  role: user.role,
                  isActive: checkboxValueFor(user),
                  tenantId: user.tenant_id || '',
                  // Só a criação cria Conta; editar nunca mexe nisso.
                  newTenantName: '',
                  planType: 'basic'
                });
                setIsEditUserOpen(true);
              }}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedUser({
                  id: user.id,
                  name: `${user.first_name} ${user.last_name}`,
                  email: user.email,
                  role: user.role,
                  status: user.is_active ? 'active' : 'inactive',
                  lastLogin: '',
                  createdAt: user.created_at,
                  tenantId: user.tenant_id,
                  tenantName: user.tenants?.name,
                  phone: user.phone
                });
                setIsDeleteUserOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administração"
        helpKey="page:admin"
        description="Painel de controle para super administradores"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Administração' },
        ]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start md:grid md:grid-cols-6">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="signups">Cadastros</TabsTrigger>
          <TabsTrigger value="billing">Faturamento</TabsTrigger>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4">
          <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
            <span>Como funciona esta aba</span>
            <FeatureHelp helpKey="page:admin-settings" />
          </div>
          {/* Primeiro da aba de proposito: e a unica coisa aqui que fecha o
              sistema para a base inteira de clientes. Quem entra nesta aba
              durante uma manutencao ve o estado antes de qualquer outra coisa. */}
          <MaintenanceSettings />
          <BugReportSettings />
          <SystemSettings />
        </TabsContent>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{usersWithEmails.length}</div>
                <p className="text-xs text-muted-foreground">
                  Últimos 30 dias
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
            <span>Como funciona esta aba</span>
            <FeatureHelp helpKey="page:admin-users-tab" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Sem botão de lupa: a busca filtra enquanto se digita, então o
                botão não tinha o que fazer e não tinha handler. */}
            <div className="flex items-center w-full sm:w-auto">
              <Input
                placeholder="Buscar usuários..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-[300px]"
              />
            </div>
            <Button onClick={() => {
              resetUserForm();
              setIsCreateUserOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Usuário
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Usuários do Sistema</CardTitle>
              <CardDescription>
                Gerencie todos os usuários da plataforma
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Cartão no celular: nome lidera com o e-mail embaixo, cargo e
                  status como chips, Conta e Plano/Acesso como campos; "Criado
                  em" fica só na tabela (está em "Detalhes do Usuário"). Na
                  tabela, E-mail e Criado em somem abaixo de 2xl — oito colunas
                  passavam 153px do cartão a 1280 — e o e-mail passa a morar
                  embaixo do nome enquanto a coluna dele está escondida. */}
              <ResponsiveTable
                ariaLabel="Usuários do sistema"
                rows={filteredUsers}
                rowKey={(user: any) => user.id}
                loading={usersLoading}
                empty="Nenhum usuário encontrado"
                columns={adminUserColumns}
                actionsHeader="Ações"
                actions={renderUserActions}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cadastros pelo site (teste grátis, entrega 2): a ficha de quem se
            cadastrou, inclusive quando o convite não saiu, e o termômetro do
            envio de e-mail. */}
        <TabsContent value="signups" className="space-y-4">
          <SignupLeadsTab />
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
            <span>Como funciona esta aba</span>
            <FeatureHelp helpKey="page:admin-billing" />
          </div>
          <BillingDashboard />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
            <span>Como funciona esta aba</span>
            <FeatureHelp helpKey="page:admin-reports" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{usersWithEmails.length}</div>
                <p className="text-xs text-muted-foreground">Cadastrados na plataforma</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {usersWithEmails.filter((u: any) => u.is_active).length}
                </div>
                <p className="text-xs text-muted-foreground">Com conta ativa</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Resumo do Sistema</CardTitle>
              <CardDescription>Visão geral dos dados da plataforma</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveTable
                ariaLabel="Resumo do Sistema"
                rows={[
                  { id: 'usuarios', metrica: 'Usuários Cadastrados', valor: usersWithEmails.length, descricao: 'Total de contas na plataforma' },
                  { id: 'superadmins', metrica: 'Superadmins', valor: usersWithEmails.filter((u: any) => u.role === 'superadmin').length, descricao: 'Administradores com acesso total' },
                  { id: 'contas', metrica: 'Contas', valor: usersWithEmails.filter((u: any) => u.role === 'gerente').length, descricao: 'Gerentes (donos de Conta, gerenciam as Lojas dela)' },
                  { id: 'lojas', metrica: 'Lojas', valor: usersWithEmails.filter((u: any) => u.role === 'gestor').length, descricao: 'Lojas/Gestores (operam conversas/contatos do dia-a-dia)' },
                ]}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'metrica', header: 'Métrica', card: 'title', cellClassName: 'font-medium', cell: (r) => r.metrica },
                  { key: 'valor', header: 'Valor', cell: (r) => r.valor },
                  { key: 'descricao', header: 'Descrição', cardFull: true, cellClassName: 'text-muted-foreground', cell: (r) => r.descricao },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Modal Criar Usuário */}
      <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criar Novo Usuário</DialogTitle>
            <DialogDescription>
              Preencha as informações do novo usuário
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-firstName">Nome</Label>
                <Input
                  id="create-firstName"
                  value={userForm.firstName}
                  onChange={(e) => setUserForm(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="Nome"
                />
              </div>
              <div>
                <Label htmlFor="create-lastName">Sobrenome</Label>
                <Input
                  id="create-lastName"
                  value={userForm.lastName}
                  onChange={(e) => setUserForm(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Sobrenome"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <Label htmlFor="create-phone">Telefone</Label>
              <Input
                id="create-phone"
                value={userForm.phone}
                onChange={(e) => setUserForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div>
              <Label htmlFor="create-role">Função</Label>
              <Select value={userForm.role} onValueChange={(value) => setUserForm(prev => ({ ...prev, role: value as User['role'] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gestor">Gestor</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="atendente">Atendente</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
              {/*
                Gestor e atendente já ganham o aviso de limite por loja logo
                abaixo, junto do seletor de Loja — o cartão omite essa linha
                nesses dois casos para não repetir.
              */}
              <RoleDescriptionCard
                role={userForm.role}
                hideStoreCaps={userForm.role === 'gestor' || userForm.role === 'atendente'}
              />
            </div>
            {/*
              O vínculo depende da função, e cada uma quer uma coisa diferente:

                Superadmin → nada. Não pertence a Conta nenhuma.
                Gerente    → é DONO de uma Conta. As lojas dele vêm depois,
                             criadas por ele. Então aqui se dá NOME a uma Conta
                             nova, que o servidor cria junto com o convite.
                Gestor     → administra UMA loja que já existe.
                Atendente  → atende dentro de UMA loja que já existe.

              Nenhum destes campos existia: o formulário não perguntava nada e
              mandava tenantId nulo, então só dava pra criar Superadmin.
            */}
            {userForm.role === 'gerente' && (
              <div>
                <Label htmlFor="create-account-name">Nome da Conta</Label>
                <Input
                  id="create-account-name"
                  value={userForm.newTenantName}
                  onChange={(e) => setUserForm(prev => ({ ...prev, newTenantName: e.target.value }))}
                  placeholder="Ex.: Silva Comércio"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Uma Conta nova é criada para este gerente. As lojas dele são cadastradas depois.
                </p>
              </div>
            )}
            {(userForm.role === 'gestor' || userForm.role === 'atendente') && (
              <div>
                <Label htmlFor="create-tenant">Loja</Label>
                <Select
                  value={userForm.tenantId}
                  onValueChange={(value) => setUserForm(prev => ({ ...prev, tenantId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a Loja" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tenantsRows as any[])
                      .filter((t) => t.kind === 'store')
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {userForm.role === 'gestor'
                    ? 'Cada loja tem no máximo 1 gestor.'
                    : 'Cada loja tem no máximo 5 atendentes.'}
                </p>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="create-active"
                checked={userForm.isActive}
                onCheckedChange={(checked) => setUserForm(prev => ({ ...prev, isActive: checked as boolean }))}
              />
              <Label htmlFor="create-active">Usuário ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCreateUserOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateUser}
              disabled={isLoading}
            >
              {isLoading ? 'Criando...' : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Usuário */}
      <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize as informações do usuário
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-firstName">Nome</Label>
                <Input
                  id="edit-firstName"
                  value={userForm.firstName}
                  onChange={(e) => setUserForm(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="Nome"
                />
              </div>
              <div>
                <Label htmlFor="edit-lastName">Sobrenome</Label>
                <Input
                  id="edit-lastName"
                  value={userForm.lastName}
                  onChange={(e) => setUserForm(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Sobrenome"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <Label htmlFor="edit-phone">Telefone</Label>
              <Input
                id="edit-phone"
                value={userForm.phone}
                onChange={(e) => setUserForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div>
              <Label htmlFor="edit-role">Função</Label>
              <Select value={userForm.role} onValueChange={(value) => setUserForm(prev => ({ ...prev, role: value as User['role'] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gestor">Gestor</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="atendente">Atendente</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
              {/* Sem hideStoreCaps: este modal não mostra o aviso de limite. */}
              <RoleDescriptionCard role={userForm.role} />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-active"
                checked={userForm.isActive}
                onCheckedChange={(checked) => setUserForm(prev => ({ ...prev, isActive: checked as boolean }))}
              />
              <Label htmlFor="edit-active">Usuário ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsEditUserOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleEditUser}
              disabled={updateUserMutation.isPending}
            >
              {updateUserMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Excluir Usuário */}
      <AlertDialog open={isDeleteUserOpen} onOpenChange={setIsDeleteUserOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário "{selectedUser?.name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Visualizar Usuário */}
      <Dialog open={isViewUserOpen} onOpenChange={setIsViewUserOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Usuário</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Nome</Label>
                  <p className="text-sm text-muted-foreground">{selectedUser.name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Email</Label>
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Telefone</Label>
                  <p className="text-sm text-muted-foreground">{selectedUser.phone || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Função</Label>
                  <div>
                    <Badge variant={selectedUser.role === 'superadmin' ? 'destructive' : 'secondary'}>
                      {selectedUser.role}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div>
                    <Badge variant={selectedUser.status === 'active' ? 'default' : 'secondary'}>
                      {selectedUser.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Conta</Label>
                  <p className="text-sm text-muted-foreground">{selectedUser.tenantName || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Criado em</Label>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedUser.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsViewUserOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
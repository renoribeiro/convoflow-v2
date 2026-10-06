import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Smartphone, Wifi, WifiOff, QrCode, Trash2, RefreshCw, Webhook, Settings, Bug, Activity, AlertCircle, KeyRound, Loader2, Pencil, Instagram, Power, RotateCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/shared/PageHeader';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useTenant, useCan } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import {
  evolutionCredentialsFrom,
  evolutionServiceForRow,
} from '@/services/whatsapp/evolutionInstanceService';
import { useMetaApi } from '@/hooks/useMetaApi';
import { EmptyState } from '@/components/shared/EmptyState';
import { CreateInstanceModal } from '@/components/whatsapp/CreateInstanceModal';
import { DeleteInstanceModal } from '@/components/whatsapp/DeleteInstanceModal';
import { RenameInstanceModal } from '@/components/whatsapp/RenameInstanceModal';
import { QRCodeModal } from '@/components/whatsapp/QRCodeModal';
import { WebhookConfigModal } from '@/components/whatsapp/WebhookConfigModal';
import { WebhookDashboard } from '@/components/webhook/WebhookDashboard';
import { EnvironmentDebug } from '@/components/debug/EnvironmentDebug';
import { SupabaseDebug } from '@/components/debug/SupabaseDebug';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  instagramConnectionTexts,
  instagramConnectionView,
  type InstagramConnectionState,
} from '@/lib/instagram/connection';
import {
  connectionSummary,
  instagramAccountHandle,
  splitByChannel,
  totalCardTexts,
} from '@/lib/whatsapp/connectionSections';
import {
  callbackErrorText,
  connectSuccessText,
  instagramActions,
  readInstagramCallback,
  toggleConfirmText,
  withoutInstagramCallback,
} from '@/lib/instagram/connectFlow';
import {
  completeInstagramConnect,
  setInstagramAccountActive,
  startInstagramConnect,
  useInstagramConnectEnabled,
} from '@/hooks/useInstagramConnect';

type ProviderType = 'evolution' | 'waha' | 'official' | 'instagram';

interface WhatsAppInstance {
  id: string;
  name: string;
  instance_key: string;
  phone_number?: string;
  profile_name?: string;
  profile_picture_url?: string;
  status: 'close' | 'open' | 'connecting';
  is_active: boolean;
  qr_code?: string;
  last_connected_at?: string;
  created_at: string;
  updated_at: string;
  evolution_api_url?: string;
  evolution_api_key?: string;
  webhook_url?: string;
  provider?: ProviderType;
  connection_config?: Record<string, any>;
}

const PROVIDER_BADGE: Record<ProviderType, { label: string; className: string }> = {
  official: { label: 'Oficial', className: 'bg-emerald-600 hover:bg-emerald-600 text-white' },
  waha: { label: 'WAHA', className: 'bg-sky-600 hover:bg-sky-600 text-white' },
  evolution: { label: 'Evolution', className: 'bg-slate-600 hover:bg-slate-600 text-white' },
  // Instância de Instagram (fatia 2) é criada por procedimento manual, sem tela
  // própria. Sem esta entrada o mapa devolve undefined e a página inteira cai.
  instagram: { label: 'Instagram', className: 'bg-fuchsia-600 hover:bg-fuchsia-600 text-white' },
};

// Instagram não tem open/connecting: o que diz se a conexão atende é a
// validade do acesso (connection_config.tokenExpiresAt) e o estado da
// renovação automática. Só exibição — ver src/lib/instagram/connection.ts.
const INSTAGRAM_STATE_DOT: Record<InstagramConnectionState, string> = {
  valid: 'bg-green-500',
  unknown: 'bg-green-500',
  expiring: 'bg-yellow-500',
  needs_reconnect: 'bg-red-500',
  expired: 'bg-red-500',
};

function instagramStateIcon(state: InstagramConnectionState) {
  switch (state) {
    case 'valid':
    case 'unknown':
      return <Wifi className="h-4 w-4 text-green-600" />;
    case 'expiring':
      return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    case 'needs_reconnect':
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    case 'expired':
    default:
      return <WifiOff className="h-4 w-4 text-red-600" />;
  }
}

export default function WhatsAppNumbers() {
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [refreshingInstance, setRefreshingInstance] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('instances');

  const [registeringInstance, setRegisteringInstance] = useState<string | null>(null);
  const [pinDialogInstance, setPinDialogInstance] = useState<WhatsAppInstance | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const { tenant, loading: tenantLoading } = useTenant();
  // Espelha a policy whatsapp_instances_tenant_update: esconder o botão de quem
  // vai levar 'sem permissão' é cortesia, o bloqueio real é o RLS.
  const canConfigure = useCan('whatsapp.configure');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { verifyConnection: verifyMetaConnection } = useMetaApi();
  const navigate = useNavigate();
  const location = useLocation();

  // Instagram pela tela (fatia 4b). O botão só aparece na Loja que o
  // superadmin liberou — quem decide é instagram_connect_enabled no banco.
  const { data: igConnectEnabled = false } = useInstagramConnectEnabled(tenant?.id);
  const igActions = instagramActions({ connectEnabled: igConnectEnabled, canConfigure });
  const [igStarting, setIgStarting] = useState<string | null>(null);
  const [igCompleting, setIgCompleting] = useState(false);
  const [igToggle, setIgToggle] = useState<WhatsAppInstance | null>(null);
  const [igToggling, setIgToggling] = useState(false);
  const igCallbackHandled = useRef<string | null>(null);

  // Query para buscar instâncias do WhatsApp
  const { 
    data: instances = [], 
    isLoading, 
    error,
    refetch 
  } = useSupabaseQuery({
    table: 'whatsapp_instances',
    queryKey: ['whatsapp-instances'],
    select: '*',
    filters: [
      { column: 'tenant_id', operator: 'eq', value: tenant?.id }
    ],
    orderBy: [{ column: 'created_at', ascending: false }],
    enabled: !!tenant?.id
  });

  // Mutation para atualizar status da instância
  const updateInstanceMutation = useSupabaseMutation({
    table: 'whatsapp_instances',
    operation: 'update',
    invalidateQueries: [['whatsapp-instances']]
  });

  // Verificação automática de status a cada 30 segundos
  useEffect(() => {
    const checkConnectionStatus = async () => {
      if (instances.length === 0) return;

      // `useSupabaseQuery` devolve um union mal tipado (GenericStringError), o
      // que faz cada acesso a campo virar erro de tsc. Um cast só, aqui, em vez
      // de espalhar `any` por dez linhas.
      for (const instance of instances as WhatsAppInstance[]) {
        // Polling de status Evolution não se aplica a Meta/WAHA
        if (instance.provider && instance.provider !== 'evolution') continue;
        try {
          // Instância sem credencial salva não tem o que consultar — pular é
          // melhor que estourar no catch e marcá-la como 'close' por engano.
          if (!evolutionCredentialsFrom(instance)) continue;
          const service = evolutionServiceForRow(instance);
          const { instance: estado } = await service.getInstanceStatus(instance.instance_key);
          const status = estado?.state;
          if (status && status !== instance.status) {
            await updateInstanceMutation.mutateAsync({
              data: { 
                status,
                last_connected_at: status === 'open' ? new Date().toISOString() : instance.last_connected_at
              },
              options: { filter: { column: 'id', operator: 'eq', value: instance.id } }
            });
          }
        } catch (error) {
          console.error(`Erro ao verificar status da instância ${instance.instance_key}:`, error);
          // If the API returns an error, the instance likely no longer exists on the API side.
          // Mark it as 'close' so the UI reflects reality.
          if (instance.status === 'open' || instance.status === 'connecting') {
            try {
              await updateInstanceMutation.mutateAsync({
                data: { status: 'close' },
                options: { filter: { column: 'id', operator: 'eq', value: instance.id } }
              });
            } catch (updateErr) {
              console.warn('Failed to update instance status to close:', updateErr);
            }
          }
        }
      }
    };

    const interval = setInterval(checkConnectionStatus, 30000); // 30 segundos
    
    // Verificação inicial após 5 segundos
    const timeout = setTimeout(checkConnectionStatus, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [instances, updateInstanceMutation]);

  // Volta do Instagram: a edge function devolve o navegador para cá com
  // ?ig_state&ig_code (ou &ig_error). Tira os parâmetros da barra na hora
  // (um F5 não pode repetir o pedido) e conclui UMA vez — o ref segura o
  // efeito duplo do StrictMode, e o servidor recusaria o state repetido.
  useEffect(() => {
    const cb = readInstagramCallback(location.search);
    if (cb.kind === 'none') return;
    if (igCallbackHandled.current === location.search) return;
    igCallbackHandled.current = location.search;
    navigate({ pathname: location.pathname, search: withoutInstagramCallback(location.search) }, { replace: true });

    if (cb.kind === 'error') {
      const t = callbackErrorText(cb.error);
      toast({ title: t.title, description: t.description, variant: 'destructive' });
      return;
    }
    setIgCompleting(true);
    void completeInstagramConnect(cb.code, cb.state)
      .then((r) => {
        if (r.ok) {
          const t = connectSuccessText(r);
          toast({ title: t.title, description: t.description });
        } else {
          toast({ title: 'Instagram não conectado', description: r.message, variant: 'destructive' });
        }
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
        refetch();
      })
      .finally(() => setIgCompleting(false));
  }, [location.pathname, location.search, navigate, toast, queryClient, refetch]);

  const handleInstagramStart = async (instanceId: string | null) => {
    setIgStarting(instanceId ?? 'new');
    const r = await startInstagramConnect({ tenantId: tenant?.id ?? null, instanceId });
    // No caminho feliz a página já saiu para o Instagram.
    if (!r.ok) {
      toast({ title: 'Não foi possível abrir o Instagram', description: r.message, variant: 'destructive' });
      setIgStarting(null);
    }
  };

  const confirmInstagramToggle = async () => {
    if (!igToggle) return;
    const turnOn = !igToggle.is_active;
    setIgToggling(true);
    const r = await setInstagramAccountActive(igToggle.id, turnOn);
    setIgToggling(false);
    setIgToggle(null);
    if (!r.ok) {
      toast({ title: 'Nada foi alterado', description: r.message, variant: 'destructive' });
      return;
    }
    toast(
      turnOn
        ? { title: 'Instagram religado', description: 'As mensagens que chegarem a partir de agora entram no ConvoFlow.' }
        : { title: 'Instagram desligado', description: 'O histórico ficou. Mensagens que chegarem enquanto estiver desligada não entram.' },
    );
    queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    refetch();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'close':
      default:
        return 'bg-red-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <Wifi className="h-4 w-4 text-green-600" />;
      case 'connecting':
        return <RefreshCw className="h-4 w-4 text-yellow-600 animate-spin" />;
      case 'close':
      default:
        return <WifiOff className="h-4 w-4 text-red-600" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open':
        return 'Conectado';
      case 'connecting':
        return 'Conectando';
      case 'close':
      default:
        return 'Desconectado';
    }
  };

  const handleDisconnect = async (instance: WhatsAppInstance) => {
    try {
      // Credencial da própria instância, não o serviço global (que é nulo).
      const service = evolutionServiceForRow(instance);
      await service.disconnectInstance(instance.instance_key);
      await updateInstanceMutation.mutateAsync({
        data: { status: 'close' },
        options: { filter: { column: 'id', operator: 'eq', value: instance.id } }
      });
      toast({
        title: "Sucesso",
        description: "Instância desconectada com sucesso"
      });
      refetch();
    } catch (error) {
      // A mensagem real, não "Erro ao desconectar instância": era ela que
      // escondia o motivo verdadeiro.
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : 'Erro ao desconectar instância',
        variant: "destructive"
      });
    }
  };

  // Só abre o modal. Antes, este botão buscava o QR ANTES de abrir e só abria
  // se viesse alguma coisa — e `getQRCode` devolve null quando o serviço global
  // não existe, o que em produção é sempre. Clicar não fazia absolutamente
  // nada, nem erro. O QRCodeModal já busca o QR sozinho, com a credencial da
  // própria instância, e sabe mostrar o erro quando falha.
  const handleShowQR = (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setShowQRModal(true);
  };

  const handleConfigureWebhook = (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setShowWebhookModal(true);
  };

  const handleRefreshStatus = async (instance: WhatsAppInstance) => {
    setRefreshingInstance(instance.id);
    try {
      // `refreshInstanceStatus` do hook devolvia null sem serviço global, e o
      // `if (status)` engolia isso: clicar não atualizava nada e não avisava
      // nada. Agora a consulta usa a credencial da instância e o erro aparece.
      const service = evolutionServiceForRow(instance);
      const { instance: estado } = await service.getInstanceStatus(instance.instance_key);
      const status = estado?.state;
      if (!status) throw new Error('O servidor não informou o estado da instância.');

      await updateInstanceMutation.mutateAsync({
        data: { status },
        options: { filter: { column: 'id', operator: 'eq', value: instance.id } }
      });
      toast({
        title: "Sucesso",
        description: "Status atualizado com sucesso"
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : 'Erro ao atualizar status',
        variant: "destructive"
      });
    } finally {
      setRefreshingInstance(null);
    }
  };



  const handleRename = (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setShowRenameModal(true);
  };

  const handleDelete = (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setShowDeleteModal(true);
  };

  const doRegisterNumber = async (instance: WhatsAppInstance, pin?: string) => {
    try {
      const body: Record<string, string> = { instanceId: instance.id };
      if (pin) body.pin = pin;

      const { data, error } = await supabase.functions.invoke('register-meta-number', { body });

      if (error) {
        logger.error('register-meta-number invoke error', { instanceId: instance.id, error });
        toast({ title: 'Erro', description: 'Falha ao chamar o serviço de registro.', variant: 'destructive' });
        return;
      }

      if (data?.pin_required) {
        setPinDialogInstance(instance);
        setPinValue('');
        return;
      }

      if (!data?.success) {
        toast({ title: 'Erro ao registrar', description: data?.error ?? 'Erro desconhecido.', variant: 'destructive' });
        return;
      }

      const pinInfo = data.pin ? ` PIN de verificação em duas etapas: ${data.pin}. Guarde este PIN.` : '';
      toast({ title: 'Número registrado!', description: `Registro concluído com sucesso.${pinInfo}` });

      if (data.warning) {
        toast({ title: 'Aviso', description: data.warning, variant: 'destructive' });
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      logger.error('register-meta-number falhou', { instanceId: instance.id, message });
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  };

  const handleRegisterNumber = async (instance: WhatsAppInstance) => {
    setRegisteringInstance(instance.id);
    try {
      await doRegisterNumber(instance);
    } finally {
      setRegisteringInstance(null);
    }
  };

  const handlePinSubmit = async () => {
    if (!pinDialogInstance || pinValue.length !== 6) return;
    setPinSubmitting(true);
    try {
      await doRegisterNumber(pinDialogInstance, pinValue);
      setPinDialogInstance(null);
      setPinValue('');
    } finally {
      setPinSubmitting(false);
    }
  };

  const resetModals = () => {
    setSelectedInstance(null);
    setShowCreateModal(false);
    setShowDeleteModal(false);
    setShowQRModal(false);
    setShowWebhookModal(false);
    setShowRenameModal(false);
  };

  const now = new Date();
  // Duas seções: instâncias de WhatsApp e contas do Instagram. Os contadores do
  // topo somam as duas; sem Instagram, a tela é a de sempre.
  const typedInstances = instances as unknown as WhatsAppInstance[];
  const sections = splitByChannel(typedInstances);
  const summary = connectionSummary(typedInstances, now);
  const totalCard = totalCardTexts(summary);

  // Tenant ainda carregando — skeletons
  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Instâncias e APIs"
          helpKey="page:whatsapp-numbers"
          description="Gerencie suas instâncias e integrações de WhatsApp"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Instâncias e APIs' }
          ]}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  // Usuário sem tenant (superadmin/account_manager sem vínculo).
  // Instâncias do WhatsApp pertencem a tenants, então não há o que gerenciar aqui.
  if (!tenant) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Instâncias e APIs"
          helpKey="page:whatsapp-numbers"
          description="Gerencie suas instâncias e integrações de WhatsApp"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Instâncias e APIs' }
          ]}
        />
        <Card>
          <CardContent className="p-12">
            <EmptyState
              icon={<Smartphone className="h-6 w-6" />}
              title="Nenhuma Conta selecionada"
              description="Instâncias de WhatsApp são gerenciadas por Conta. Como superadmin, você não possui instâncias próprias. Acesse a administração para gerenciar as Contas."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Instâncias e APIs"
          helpKey="page:whatsapp-numbers"
          description="Gerencie suas instâncias e integrações de WhatsApp"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Instâncias e APIs' }
          ]}
        />
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Erro ao carregar instâncias: {error.message}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instâncias e APIs"
        helpKey="page:whatsapp-numbers"
        description={
          sections.instagram.length > 0
            ? 'Gerencie suas instâncias de WhatsApp e as contas do Instagram da Loja'
            : 'Gerencie suas instâncias e integrações de WhatsApp'
        }
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Instâncias e APIs' }
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                refetch();
                toast({
                  title: "Cache atualizado",
                  description: "Os dados foram recarregados do servidor"
                });
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Instância
            </Button>
          </div>
        }
      />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start md:grid md:grid-cols-3">
          <TabsTrigger value="instances" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Instâncias
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Monitoramento
          </TabsTrigger>
          <TabsTrigger value="debug" className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Configurações Técnicas
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="instances" className="space-y-6">

          {/* Métricas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{totalCard.label}</p>
                <p className="text-2xl font-bold">{summary.total}</p>
                {totalCard.breakdown && (
                  <p className="text-xs text-muted-foreground" data-testid="total-breakdown">{totalCard.breakdown}</p>
                )}
              </div>
              <Smartphone className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conectados</p>
                <p className="text-2xl font-bold text-green-600">{summary.connected}</p>
              </div>
              <Wifi className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Desconectados</p>
                <p className="text-2xl font-bold text-red-600">{summary.disconnected}</p>
              </div>
              <WifiOff className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

          {/* Lista de Instâncias */}
          <Card>
        <CardHeader>
          <CardTitle>Instâncias WhatsApp</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-md" />
              ))}
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-8">
              <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Nenhuma instância cadastrada</h3>
              <p className="text-muted-foreground mb-4">
                Crie sua primeira instância de WhatsApp para começar a usar a plataforma
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeira Instância
              </Button>
            </div>
          ) : (
            // flex-wrap + min-w-0 em cada linha: no celular o grupo de ações
            // (status, QR, webhook, desconectar) desce para a linha de baixo em
            // vez de empurrar a página para o lado.
            sections.whatsapp.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="no-whatsapp-instances">
                Nenhuma instância de WhatsApp cadastrada.
              </p>
            ) : (
            <div className="space-y-4">
              {sections.whatsapp.map((instance) => {
                return (
                <div key={instance.id} className="flex flex-wrap items-center justify-between gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(instance.status)}`} />
                      {getStatusIcon(instance.status)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold">{instance.name}</h4>
                        <Badge
                          className={PROVIDER_BADGE[instance.provider || 'evolution'].className}
                        >
                          {PROVIDER_BADGE[instance.provider || 'evolution'].label}
                        </Badge>
                        <Badge variant={instance.is_active ? 'default' : 'secondary'}>
                          {instance.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>Chave: {instance.instance_key}</p>
                        {instance.phone_number && (
                          <p>Número: {instance.phone_number}</p>
                        )}
                        {instance.profile_name && (
                          <p>Perfil: {instance.profile_name}</p>
                        )}
                        {instance.last_connected_at && (
                          <p>Última conexão: {format(new Date(instance.last_connected_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={instance.status === 'open' ? 'default' : 'secondary'}>
                      {getStatusText(instance.status)}
                    </Badge>
                    
                    <div className="flex flex-wrap items-center gap-1">
                      {(!instance.provider || instance.provider === 'evolution') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRefreshStatus(instance)}
                          disabled={refreshingInstance === instance.id}
                          title="Atualizar status"
                        >
                          <RefreshCw className={`h-4 w-4 ${refreshingInstance === instance.id ? 'animate-spin' : ''}`} />
                        </Button>
                      )}

                      {(!instance.provider || instance.provider === 'evolution') &&
                        instance.status === 'close' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleShowQR(instance)}
                            title="Conectar via QR Code"
                          >
                            <QrCode className="h-4 w-4" />
                          </Button>
                        )}

                      {(!instance.provider || instance.provider === 'evolution') &&
                        instance.status === 'open' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleConfigureWebhook(instance)}
                              title="Configurar Webhook"
                            >
                              <Webhook className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDisconnect(instance)}
                              className="text-red-600 hover:text-red-700"
                              title="Desconectar"
                            >
                              <WifiOff className="h-4 w-4" />
                            </Button>
                          </>
                        )}

                      {instance.provider === 'official' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => verifyMetaConnection(instance.id)}
                            title="Testar conexão Meta"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRegisterNumber(instance)}
                            disabled={registeringInstance === instance.id}
                            title="Registrar número na Cloud API"
                          >
                            {registeringInstance === instance.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <KeyRound className="h-4 w-4" />}
                          </Button>
                        </>
                      )}

                      {canConfigure && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRename(instance)}
                          title="Renomear instância"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}

                      {/* Mesma cortesia do lápis: o bloqueio real é a RPC
                          delete_whatsapp_instance (recusa sem whatsapp.configure
                          e com histórico), não este `if`. */}
                      {canConfigure && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(instance)}
                          className="text-red-600 hover:text-red-700"
                          title="Excluir instância"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            )
          )}
        </CardContent>
          </Card>

          {/* Contas do Instagram — na Loja que tem conta, ou na Loja liberada
              pelo superadmin para conectar (fatia 4b). Sem "instância" e sem
              "chave": para quem usa, é a conta do Instagram conectada. Na Loja
              sem conta e sem a chave (a VagaCerta) a seção não existe. */}
          {(sections.instagram.length > 0 || igActions.showSection) && (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <Instagram className="h-5 w-5 text-[#E4405F]" aria-hidden />
                  Contas do Instagram
                </CardTitle>
                {igActions.showConnect && (
                  <Button
                    size="sm"
                    onClick={() => handleInstagramStart(null)}
                    disabled={igStarting !== null || igCompleting}
                    data-testid="instagram-connect"
                  >
                    {igStarting === 'new' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Conectar Instagram
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {igCompleting && (
                  <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground" data-testid="instagram-completing">
                    <Loader2 className="h-4 w-4 animate-spin" /> Concluindo a conexão com o Instagram…
                  </p>
                )}
                {sections.instagram.length === 0 && (
                  <p className="text-sm text-muted-foreground" data-testid="no-instagram-accounts">
                    Nenhuma conta do Instagram conectada nesta Loja. Clique em Conectar Instagram e entre com a conta profissional da Loja.
                  </p>
                )}
                <div className="space-y-4">
                  {sections.instagram.map((account) => {
                    const ig = instagramConnectionView(account.connection_config, now);
                    const igTexts = instagramConnectionTexts(ig, { canReconnectHere: igActions.showReconnect });
                    const handle = instagramAccountHandle(account);
                    return (
                      <div
                        key={account.id}
                        data-testid="instagram-account"
                        className="flex flex-wrap items-center justify-between gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${INSTAGRAM_STATE_DOT[ig.state]}`} />
                            {instagramStateIcon(ig.state)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold">{account.name}</h4>
                              <Badge className={PROVIDER_BADGE.instagram.className}>
                                {PROVIDER_BADGE.instagram.label}
                              </Badge>
                              <Badge variant={account.is_active ? 'default' : 'secondary'}>
                                {account.is_active ? 'Ligada' : 'Desligada'}
                              </Badge>
                            </div>

                            <div className="text-sm text-muted-foreground space-y-1">
                              <p data-testid="instagram-handle">Conta: {handle ?? '@ não informado'}</p>
                              <p
                                data-testid="instagram-validity"
                                className={
                                  ig.state === 'expired' || ig.state === 'needs_reconnect'
                                    ? 'text-red-600'
                                    : ig.state === 'expiring'
                                      ? 'text-yellow-700'
                                      : undefined
                                }
                              >
                                {igTexts.detail}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              ig.state === 'expired' || ig.state === 'needs_reconnect'
                                ? 'destructive'
                                : ig.state === 'expiring'
                                  ? 'secondary'
                                  : 'default'
                            }
                          >
                            {igTexts.badge}
                          </Badge>

                          <div className="flex flex-wrap items-center gap-1">
                            {igActions.showReconnect && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleInstagramStart(account.id)}
                                disabled={igStarting !== null || igCompleting}
                              >
                                {igStarting === account.id
                                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  : <RotateCw className="h-4 w-4 mr-1" />}
                                Reconectar
                              </Button>
                            )}
                            {igActions.showToggle && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIgToggle(account)}
                                className={account.is_active ? 'text-red-600 hover:text-red-700' : undefined}
                              >
                                <Power className="h-4 w-4 mr-1" />
                                {account.is_active ? 'Desligar' : 'Religar'}
                              </Button>
                            )}
                            {canConfigure && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRename(account)}
                                title="Renomear conta"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {/* O bloqueio real é a RPC delete_whatsapp_instance,
                                que recusa com histórico — igual ao WhatsApp. */}
                            {canConfigure && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(account)}
                                className="text-red-600 hover:text-red-700"
                                title="Excluir conta do Instagram"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="monitoring" className="space-y-6">
          <WebhookDashboard />
        </TabsContent>
        
        <TabsContent value="debug" className="space-y-6">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configurações Técnicas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* <EnvironmentDebug /> */}
                {/* <SupabaseDebug /> */}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Diálogo de PIN para registro Meta */}
      <Dialog open={!!pinDialogInstance} onOpenChange={(open) => { if (!open) { setPinDialogInstance(null); setPinValue(''); } }}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>PIN necessário</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Este número já possui um PIN de verificação em duas etapas configurado. Informe o PIN de 6 dígitos para prosseguir com o registro.
          </p>
          <div className="space-y-2">
            <Label htmlFor="register-pin">PIN (6 dígitos)</Label>
            <Input
              id="register-pin"
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              inputMode="numeric"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPinDialogInstance(null); setPinValue(''); }} disabled={pinSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handlePinSubmit} disabled={pinValue.length !== 6 || pinSubmitting}>
              {pinSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Desligar / religar o Instagram — a confirmação diz exatamente o que acontece. */}
      <AlertDialog open={!!igToggle} onOpenChange={(open) => { if (!open && !igToggling) setIgToggle(null); }}>
        {igToggle && (() => {
          const t = toggleConfirmText({
            handle: instagramAccountHandle(igToggle) ?? igToggle.name,
            turnOn: !igToggle.is_active,
          });
          return (
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.title}</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    {t.body.map((line) => <p key={line}>{line}</p>)}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={igToggling}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); void confirmInstagramToggle(); }}
                  disabled={igToggling}
                  className={igToggle.is_active ? 'bg-red-600 hover:bg-red-700' : undefined}
                >
                  {igToggling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {t.action}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          );
        })()}
      </AlertDialog>

      {/* Modais */}
      <CreateInstanceModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSuccess={() => {
          resetModals();
          refetch();
        }}
      />

      {selectedInstance && (
        <>
          <DeleteInstanceModal
            open={showDeleteModal}
            onOpenChange={setShowDeleteModal}
            instance={selectedInstance}
            onSuccess={() => {
              resetModals();
              refetch();
            }}
          />

          <RenameInstanceModal
            open={showRenameModal}
            onOpenChange={setShowRenameModal}
            instance={selectedInstance}
            siblingNames={(instances as unknown as WhatsAppInstance[])
              .filter((i) => i.id !== selectedInstance.id)
              .map((i) => i.name)}
            onSuccess={() => {
              resetModals();
              refetch();
            }}
          />

          <QRCodeModal
            open={showQRModal}
            onOpenChange={setShowQRModal}
            instanceName={selectedInstance.instance_key}
            onSuccess={() => {
              resetModals();
              refetch();
            }}
          />

          <WebhookConfigModal
            open={showWebhookModal}
            onOpenChange={setShowWebhookModal}
            instance={selectedInstance}
            onSuccess={() => {
              resetModals();
              refetch();
            }}
          />
        </>
      )}
    </div>
  );
}
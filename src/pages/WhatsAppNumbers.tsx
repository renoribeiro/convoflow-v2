import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Smartphone, Wifi, WifiOff, QrCode, Trash2, RefreshCw, Webhook, Activity, AlertCircle, KeyRound, Loader2, Pencil, Instagram, Power, RotateCw, Copy, Info } from 'lucide-react';
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
import { useTenant, useCan } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { instanceAction, hasServerActions } from '@/services/whatsapp/instanceActions';
import { SAFE_INSTANCE_SELECT, rebuildSafeInstanceRow } from '@/lib/whatsapp/safeInstanceColumns';
import { useMetaApi } from '@/hooks/useMetaApi';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { CreateInstanceModal } from '@/components/whatsapp/CreateInstanceModal';
import { EscolherLojaDoNumero } from '@/components/whatsapp/EscolherLojaDoNumero';
import { consumirConectarNumero } from '@/lib/whatsapp/conectarPendente';
import { DeleteInstanceModal } from '@/components/whatsapp/DeleteInstanceModal';
import { RenameInstanceModal } from '@/components/whatsapp/RenameInstanceModal';
import { QRCodeModal } from '@/components/whatsapp/QRCodeModal';
import { WebhookConfigModal } from '@/components/whatsapp/WebhookConfigModal';
import { ViewInstanceModal } from '@/components/whatsapp/ViewInstanceModal';
import { WebhookDashboard } from '@/components/webhook/WebhookDashboard';
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
  isWhatsAppConnectedStatus,
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
  webhook_url?: string;
  provider?: ProviderType;
  connection_config?: Record<string, any>;
}

const PROVIDER_BADGE: Record<ProviderType, { label: string; className: string }> = {
  official: { label: 'API Oficial', className: 'bg-emerald-600 hover:bg-emerald-600 text-white' },
  waha: { label: 'QR Code', className: 'bg-sky-600 hover:bg-sky-600 text-white' },
  evolution: { label: 'QR Code', className: 'bg-slate-600 hover:bg-slate-600 text-white' },
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
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [refreshingInstance, setRefreshingInstance] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('instances');

  const [registeringInstance, setRegisteringInstance] = useState<string | null>(null);
  const [pinDialogInstance, setPinDialogInstance] = useState<WhatsAppInstance | null>(null);
  // Desconectar pede confirmação (achado 103 do checkup: derrubava na hora).
  const [desconectarAlvo, setDesconectarAlvo] = useState<WhatsAppInstance | null>(null);
  // O PIN gerado no registro aparece numa janela que só fecha com clique
  // (achado 108: ia num aviso que sumia sozinho).
  const [pinGerado, setPinGerado] = useState<{ nome: string; pin: string } | null>(null);
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

  // Instagram pela tela (fatia 4b). O botão aparece em toda Loja, nunca na
  // Conta, para quem tem o cargo e o alcance — quem decide é
  // instagram_connect_enabled no banco.
  const { data: igConnectEnabled = false } = useInstagramConnectEnabled(tenant?.id);
  const igActions = instagramActions({ connectEnabled: igConnectEnabled, canConfigure });
  const [igStarting, setIgStarting] = useState<string | null>(null);
  const [igCompleting, setIgCompleting] = useState(false);
  const [igToggle, setIgToggle] = useState<WhatsAppInstance | null>(null);
  const [igToggling, setIgToggling] = useState(false);
  const igCallbackHandled = useRef<string | null>(null);

  // Instâncias da Loja, só com as colunas sem segredo. Servidor e chave do
  // Evolution/WAHA moram no cofre e só o servidor os usa
  // (docs/RUNBOOK_segredos_das_instancias.md).
  const {
    data: rawInstances = [],
    isLoading,
    error,
    refetch
  } = useSupabaseQuery({
    table: 'whatsapp_instances',
    queryKey: ['whatsapp-instances'],
    select: SAFE_INSTANCE_SELECT,
    filters: [
      { column: 'tenant_id', operator: 'eq', value: tenant?.id }
    ],
    orderBy: [{ column: 'created_at', ascending: false }],
    enabled: !!tenant?.id,
    // O estado chega pelo evento do provedor (webhook), que grava no banco;
    // esta releitura do banco é o que faz a tela ver a mudança sem F5.
    refetchInterval: 30000,
  });
  const instances = useMemo(
    () => ((rawInstances ?? []) as unknown as Record<string, unknown>[]).map(rebuildSafeInstanceRow) as unknown as WhatsAppInstance[],
    [rawInstances],
  );

  // Uma conferência de estado pelo SERVIDOR quando a tela abre, para cada
  // número Evolution/WAHA. Antes o navegador perguntava ao Evolution a cada
  // 30 segundos com a chave do número, e marcava "Desconectado" em qualquer
  // erro. Agora a mudança chega sozinha pelo evento CONNECTION_UPDATE (Evolution)
  // ou session.status (WAHA); esta conferência só acerta o que mudou com a tela
  // fechada. Número sem chave salva é pulado em silêncio.
  // "Conectar número" pedido com a Conta em foco: a janela pediu a Loja, a
  // Loja em foco trocou e o painel remontou. Reabre a janela, agora na Loja.
  useEffect(() => {
    if (tenant?.kind === 'store' && canConfigure && consumirConectarNumero()) setShowCreateModal(true);
  }, [tenant?.kind, canConfigure]);

  const conferidos = useRef<string | null>(null);
  useEffect(() => {
    if (!tenant?.id || isLoading) return;
    const alvos = instances.filter((i) => hasServerActions(i.provider) && i.is_active !== false);
    const assinatura = `${tenant.id}:${alvos.map((i) => i.id).join(',')}`;
    if (!alvos.length || conferidos.current === assinatura) return;
    conferidos.current = assinatura;
    void Promise.all(alvos.map((i) => instanceAction(i.id, 'status'))).then((rs) => {
      if (rs.some((r) => r.ok && r.changed)) refetch();
    });
  }, [tenant?.id, isLoading, instances, refetch]);

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
      case 'connected':
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
      case 'connected':
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
      case 'connected':
        return 'Conectado';
      case 'connecting':
        return 'Conectando';
      case 'close':
      default:
        return 'Desconectado';
    }
  };

  const handleDisconnect = async (instance: WhatsAppInstance) => {
    // Pelo servidor, com a chave do cofre. Ele mesmo grava o estado novo.
    const r = await instanceAction(instance.id, 'disconnect');
    if (r.ok) {
      toast({ title: 'Número desconectado', description: 'Para voltar a receber mensagens, conecte de novo pelo QR Code.' });
      refetch();
    } else {
      toast({ title: 'Não foi possível desconectar', description: r.error || 'Tente de novo em instantes.', variant: 'destructive' });
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
      // O servidor pergunta ao Evolution/WAHA com a chave do cofre e grava.
      const r = await instanceAction(instance.id, 'status');
      if (r.ok) {
        toast({ title: 'Estado atualizado' });
        refetch();
      } else {
        toast({ title: 'Não foi possível atualizar o estado', description: r.error || 'Tente de novo em instantes.', variant: 'destructive' });
      }
    } finally {
      setRefreshingInstance(null);
    }
  };

  const handleDetails = (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setShowDetailsModal(true);
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
        toast({ title: 'Não deu certo', description: 'Não foi possível falar com o servidor. Tente de novo em instantes.', variant: 'destructive' });
        return;
      }

      if (data?.pin_required) {
        setPinDialogInstance(instance);
        setPinValue('');
        return;
      }

      if (!data?.success) {
        toast({ title: 'Não foi possível registrar o número', description: data?.error ?? 'Tente de novo em instantes.', variant: 'destructive' });
        return;
      }

      toast({ title: 'Número registrado', description: 'Ele já pode enviar e receber mensagens pela API Oficial.' });
      if (data.pin) setPinGerado({ nome: instance.name, pin: String(data.pin) });

      if (data.warning) {
        toast({ title: 'Aviso', description: data.warning, variant: 'destructive' });
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      logger.error('register-meta-number falhou', { instanceId: instance.id, message });
      toast({ title: 'Não foi possível registrar o número', description: 'Tente de novo em instantes. Se continuar, fale com o suporte do ConvoFlow.', variant: 'destructive' });
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
    setShowDetailsModal(false);
  };

  const now = new Date();
  // Duas seções: instâncias de WhatsApp e contas do Instagram. Os contadores do
  // topo somam as duas; sem Instagram, a tela é a de sempre.
  const typedInstances = instances;
  const sections = splitByChannel(typedInstances);
  const summary = connectionSummary(typedInstances, now);
  const totalCard = totalCardTexts(summary);

  // Tenant ainda carregando — skeletons
  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Números de WhatsApp"
          helpKey="page:whatsapp-numbers"
          description="Conecte e acompanhe os números de WhatsApp da Loja"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Números de WhatsApp' }
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
          title="Números de WhatsApp"
          helpKey="page:whatsapp-numbers"
          description="Conecte e acompanhe os números de WhatsApp da Loja"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Números de WhatsApp' }
          ]}
        />
        <Card>
          <CardContent className="p-12">
            <EmptyState
              icon={<Smartphone className="h-6 w-6" />}
              title="Nenhuma Conta selecionada"
              description="Os números de WhatsApp são de cada Conta. Como superadmin, você não tem números próprios. Abra a Administração para cuidar das Contas."
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
          title="Números de WhatsApp"
          helpKey="page:whatsapp-numbers"
          description="Conecte e acompanhe os números de WhatsApp da Loja"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Números de WhatsApp' }
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
        title="Números de WhatsApp"
        helpKey="page:whatsapp-numbers"
        description={
          sections.instagram.length > 0
            ? 'Conecte e acompanhe os números de WhatsApp e as contas do Instagram da Loja'
            : 'Conecte e acompanhe os números de WhatsApp da Loja'
        }
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Números de WhatsApp' }
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                refetch();
                toast({
                  title: 'Lista atualizada',
                  description: 'Os números foram lidos de novo.'
                });
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            {/* Conectar número exige whatsapp.configure (achado 102). A tela
                inteira já exige (registro de telas), mas uma exceção por
                pessoa pode negar a capacidade a um Gestor. */}
            {canConfigure && (
              <Button onClick={() => setShowCreateModal(true)} data-tour="whatsapp-nova-instancia">
                <Plus className="h-4 w-4 mr-2" />
                Conectar número
              </Button>
            )}
          </div>
        }
      />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start md:grid md:grid-cols-2">
          <TabsTrigger value="instances" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Números
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Monitoramento
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
                {isLoading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-bold">{summary.total}</p>}
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
                {isLoading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-bold text-success">{summary.connected}</p>}
              </div>
              <Wifi className="h-8 w-8 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Desconectados</p>
                {isLoading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-bold text-destructive">{summary.disconnected}</p>}
              </div>
              <WifiOff className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
      </div>

          {/* Lista de Instâncias */}
          <Card>
        <CardHeader>
          <CardTitle>Números de WhatsApp</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-md" />
              ))}
            </div>
          ) : instances.length === 0 && tenant.kind !== 'store' ? (
            // Conta em foco: número de WhatsApp é sempre de uma Loja (D1).
            <div data-testid="numeros-ficam-na-loja">
              <EscolherLojaDoNumero reabrirJanela={false} />
            </div>
          ) : instances.length === 0 ? (
            <EmptyState
              icon={<Smartphone />}
              title="Nenhum número conectado ainda"
              description="Conecte o número de WhatsApp da Loja para receber e responder as mensagens aqui."
              action={canConfigure ? { label: 'Conectar o primeiro número', onClick: () => setShowCreateModal(true), icon: <Plus className="h-4 w-4 mr-2" /> } : undefined}
            />
          ) : (
            // flex-wrap + min-w-0 em cada linha: no celular o grupo de ações
            // (status, QR, webhook, desconectar) desce para a linha de baixo em
            // vez de empurrar a página para o lado.
            sections.whatsapp.length === 0 ? (
              <div data-testid="no-whatsapp-instances">
                <EmptyState
                  compacto
                  icon={<Smartphone />}
                  title="Nenhum número de WhatsApp conectado."
                  action={canConfigure ? { label: 'Conectar número', onClick: () => setShowCreateModal(true), icon: <Plus className="h-4 w-4 mr-2" /> } : undefined}
                />
              </div>
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
                        {!instance.is_active && <Badge variant="secondary">Desligado</Badge>}
                      </div>
                      
                      <div className="text-sm text-muted-foreground space-y-1">
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
                    <Badge variant={isWhatsAppConnectedStatus(instance.status) ? 'default' : 'secondary'}>
                      {getStatusText(instance.status)}
                    </Badge>
                    
                    <div className="flex flex-wrap items-center gap-1">
                      {/* Evolution e WAHA: estado, QR e desconectar pedidos ao
                          servidor, que usa a chave do cofre (whatsapp-instance-action). */}
                      {canConfigure && hasServerActions(instance.provider) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRefreshStatus(instance)}
                          disabled={refreshingInstance === instance.id}
                          title="Atualizar status"
                          aria-label="Atualizar status"
                        >
                          <RefreshCw className={`h-4 w-4 ${refreshingInstance === instance.id ? 'animate-spin' : ''}`} />
                        </Button>
                      )}

                      {canConfigure && hasServerActions(instance.provider) &&
                        !isWhatsAppConnectedStatus(instance.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleShowQR(instance)}
                            title="Conectar pelo QR Code"
                            aria-label="Conectar pelo QR Code"
                          >
                            <QrCode className="h-4 w-4" />
                          </Button>
                        )}

                      {canConfigure && (!instance.provider || instance.provider === 'evolution') &&
                        isWhatsAppConnectedStatus(instance.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleConfigureWebhook(instance)}
                            title="Ver endereço de entrega"
                            aria-label="Ver endereço de entrega"
                          >
                            <Webhook className="h-4 w-4" />
                          </Button>
                        )}

                      {canConfigure && hasServerActions(instance.provider) &&
                        isWhatsAppConnectedStatus(instance.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDesconectarAlvo(instance)}
                            className="text-red-600 hover:text-red-700"
                            title="Desconectar"
                            aria-label="Desconectar"
                          >
                            <WifiOff className="h-4 w-4" />
                          </Button>
                        )}

                      {canConfigure && hasServerActions(instance.provider) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDetails(instance)}
                          title="Detalhes e chave"
                          aria-label="Detalhes e chave"
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      )}

                      {canConfigure && instance.provider === 'official' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => verifyMetaConnection(instance.id)}
                            title="Testar a conexão com a Meta"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRegisterNumber(instance)}
                            disabled={registeringInstance === instance.id}
                            title="Registrar o número na API Oficial"
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
                          title="Renomear número"
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
                          title="Excluir número"
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

          {/* Contas do Instagram — na Loja que tem conta, ou em qualquer Loja
              para quem pode conectar (fatia 4b). Sem "instância" e sem
              "chave": para quem usa, é a conta do Instagram conectada. Na Conta,
              e para o Atendente numa Loja sem conta, a seção não existe. */}
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
                {isLoading && sections.instagram.length === 0 && (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full rounded-md" />
                  </div>
                )}
                {!isLoading && sections.instagram.length === 0 && (
                  <div data-testid="no-instagram-accounts">
                    <EmptyState
                      compacto
                      icon={<Instagram />}
                      title="Nenhuma conta do Instagram conectada nesta Loja."
                      description="Clique em Conectar Instagram e entre com a conta profissional da Loja."
                      action={igActions.showConnect ? { label: 'Conectar Instagram', onClick: () => handleInstagramStart(null), icon: <Plus className="h-4 w-4 mr-2" /> } : undefined}
                    />
                  </div>
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
        
        {/* A aba "Configurações Técnicas" saiu em 2026-10-25 (achado 104 do
            checkup): abria um cartão vazio, com o conteúdo comentado. */}
      </Tabs>

      <ConfirmationDialog
        isOpen={!!desconectarAlvo}
        onClose={() => setDesconectarAlvo(null)}
        onConfirm={async () => {
          if (desconectarAlvo) await handleDisconnect(desconectarAlvo);
        }}
        title="Desconectar o número?"
        description={
          <>
            <p>
              O número "{desconectarAlvo?.name}"{desconectarAlvo?.phone_number ? ` (${desconectarAlvo.phone_number})` : ''} para de
              receber e enviar mensagens pelo ConvoFlow até ser conectado de novo.
            </p>
            <p>Mensagens que chegarem enquanto ele estiver desconectado podem não entrar no sistema.</p>
          </>
        }
        reversivel
        comoDesfazer="conecte de novo pelo botão de QR Code do número, com o celular em mãos."
        confirmText="Desconectar número"
        variant="destructive"
        icon={<WifiOff className="h-5 w-5 text-red-500" />}
      />

      {/* PIN gerado no registro: só fecha com clique em "Já guardei o PIN". */}
      <Dialog open={!!pinGerado} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-sm"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          data-testid="pin-gerado"
        >
          <DialogHeader>
            <DialogTitle>Guarde o PIN deste número</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              O número "{pinGerado?.nome}" ganhou um PIN de verificação em duas etapas. Ele é pedido se o número precisar
              ser registrado de novo, e não aparece outra vez.
            </p>
            <div className="flex items-center gap-2">
              <Input value={pinGerado?.pin ?? ''} readOnly className="font-mono text-lg tracking-widest" aria-label="PIN" />
              <Button
                variant="outline"
                size="icon"
                aria-label="Copiar PIN"
                title="Copiar PIN"
                onClick={() => {
                  if (pinGerado) {
                    navigator.clipboard.writeText(pinGerado.pin).then(
                      () => toast({ title: 'PIN copiado' }),
                      () => toast({ title: 'Não foi possível copiar', description: 'Anote o PIN à mão.', variant: 'destructive' }),
                    );
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPinGerado(null)}>Já guardei o PIN</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de PIN para registro Meta */}
      <Dialog open={!!pinDialogInstance} onOpenChange={(open) => { if (!open) { setPinDialogInstance(null); setPinValue(''); } }}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Informe o PIN do número</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Este número já tem um PIN de confirmação em duas etapas no WhatsApp. Digite os 6 números do PIN para registrar.
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
              Registrar número
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
            siblingNames={instances
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
            instanceId={selectedInstance.id}
            instanceName={selectedInstance.name}
            onSuccess={() => {
              resetModals();
              refetch();
            }}
          />

          <ViewInstanceModal
            open={showDetailsModal}
            onOpenChange={setShowDetailsModal}
            instance={selectedInstance}
            onKeyReplaced={() => refetch()}
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
import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { onlyWhatsApp } from '@/lib/whatsapp/connectionSections';
import { useTenantId } from '@/contexts/TenantContext';
import { useCampaignMutations, type Campaign, type CampaignCreateInput, type MessageType, type AudienceType } from '@/hooks/useCampaigns';
import { logger } from '@/lib/logger';
import { format, differenceInDays, differenceInHours, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  X,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Upload,
  Users,
  Tags,
  ListChecks,
  CalendarIcon,
  Send,
  Clock,
  Loader2,
  Download,
  CheckCircle,
  AlertCircle,
  Search,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface FunnelStage {
  id: string;
  name: string;
  color: string;
}

interface WhatsAppInstance {
  id: string;
  name: string;
  status: string;
  provider: string | null;
}

interface Contact {
  id: string;
  name: string | null;
  /** Nulo para contato que não é de WhatsApp. Campanha só alcança quem tem telefone. */
  phone: string | null;
  current_stage_id: string | null;
}

interface CsvRow {
  phone: string;
  name?: string;
  email?: string;
}

interface CsvParseResult {
  valid: CsvRow[];
  invalid: Array<{ row: number; reason: string }>;
}

// ─────────────────────────────────────────────
// CSV parser (no external dep)
// ─────────────────────────────────────────────

function parseCsv(text: string): CsvParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { valid: [], invalid: [] };

  const firstLine = lines[0] ?? '';
  const header = firstLine.split(',').map((h) => h.trim().toLowerCase().replace(/["']/g, ''));
  const phoneIdx = header.indexOf('phone') !== -1 ? header.indexOf('phone') : header.indexOf('telefone');
  const nameIdx = header.indexOf('name') !== -1 ? header.indexOf('name') : header.indexOf('nome');
  const emailIdx = header.indexOf('email');

  const valid: CsvRow[] = [];
  const invalid: Array<{ row: number; reason: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
    if (phoneIdx === -1 || !cols[phoneIdx]) {
      invalid.push({ row: i + 1, reason: 'Coluna "phone" ausente ou vazia' });
      continue;
    }
    const rawPhone = cols[phoneIdx].replace(/\D/g, '');
    if (rawPhone.length < 8) {
      invalid.push({ row: i + 1, reason: `Telefone inválido: "${cols[phoneIdx]}"` });
      continue;
    }
    valid.push({
      phone: rawPhone,
      name: nameIdx !== -1 ? cols[nameIdx] || undefined : undefined,
      email: emailIdx !== -1 ? cols[emailIdx] || undefined : undefined,
    });
  }

  return { valid, invalid };
}

function buildTemplateCsv(): string {
  return 'phone,name,email\n5511999990001,João Silva,joao@exemplo.com\n5511999990002,Maria Santos,';
}

// ─────────────────────────────────────────────
// Variable chips
// ─────────────────────────────────────────────

const VARIABLE_CHIPS = [
  { label: '{name}', value: '{name}' },
  { label: '{first_name}', value: '{first_name}' },
  { label: '{phone}', value: '{phone}' },
  { label: '{email}', value: '{email}' },
];

function insertAtCursor(
  ref: React.RefObject<HTMLTextAreaElement>,
  text: string,
  value: string,
  onChange: (v: string) => void
) {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const newVal = value.slice(0, start) + text + value.slice(end);
  onChange(newVal);
  // Restore cursor after React re-render
  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = start + text.length;
    el.focus();
  });
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface CampaignWizardProps {
  onClose: () => void;
  onCampaignCreated?: () => void;
  campaign?: Campaign;
}

// ─────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────

interface WizardState {
  name: string;
  description: string;
  whatsapp_instance_id: string;
  message_type: MessageType;
  message_template: string;
  media_url: string | null;
  media_caption: string;
  audience_type: AudienceType;
  // CSV
  csvRows: CsvRow[];
  csvInvalid: Array<{ row: number; reason: string }>;
  csvFileName: string;
  csvFileUrl: string | null;
  // Tags
  selectedTagIds: string[];
  // Contact list
  selectedContactIds: string[];
  contactSearch: string;
  contactStageFilter: string;
  // Schedule
  sendMode: 'immediate' | 'scheduled';
  scheduledDate: Date | null;
  scheduledTime: string;
  timezone: string;
  // Dispatch settings
  delay_between_messages: number;
  respect_business_hours: boolean;
  business_hours_start: string;
  business_hours_end: string;
  daily_send_limit: string;
  require_opt_in: boolean;
  is_template: boolean;
  template_name: string;
  template_language: string;
  template_params: string[];
}

function initState(campaign?: Campaign): WizardState {
  return {
    name: campaign?.name ?? '',
    description: campaign?.description ?? '',
    whatsapp_instance_id: campaign?.whatsapp_instance_id ?? '',
    message_type: campaign?.message_type ?? 'text',
    message_template: campaign?.message_template ?? '',
    media_url: campaign?.media_url ?? null,
    media_caption: campaign?.media_caption ?? '',
    audience_type: campaign?.audience_type ?? 'tags',
    csvRows: [],
    csvInvalid: [],
    csvFileName: '',
    csvFileUrl: null,
    selectedTagIds: campaign?.target_tags ?? [],
    selectedContactIds:
      (campaign?.audience_config as { contact_ids?: string[] } | null)?.contact_ids ?? [],
    contactSearch: '',
    contactStageFilter: 'all',
    sendMode: campaign?.scheduled_at ? 'scheduled' : 'immediate',
    scheduledDate: campaign?.scheduled_at ? new Date(campaign.scheduled_at) : null,
    scheduledTime: campaign?.scheduled_at
      ? format(new Date(campaign.scheduled_at), 'HH:mm')
      : '09:00',
    timezone: campaign?.timezone ?? 'America/Sao_Paulo',
    delay_between_messages: campaign?.delay_between_messages ?? 5,
    respect_business_hours: campaign?.respect_business_hours ?? false,
    business_hours_start: campaign?.business_hours_start ?? '09:00',
    business_hours_end: campaign?.business_hours_end ?? '18:00',
    daily_send_limit: campaign?.daily_send_limit?.toString() ?? '',
    require_opt_in: false,
    is_template: false,
    template_name: '',
    template_language: 'pt_BR',
    template_params: [],
  };
}

const STEPS = ['Conteúdo', 'Público', 'Agendamento', 'Revisão'];

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export const CampaignWizard = ({
  onClose,
  onCampaignCreated,
  campaign,
}: CampaignWizardProps) => {
  const isEdit = !!campaign;
  // In-progress = any status other than draft; skip re-dispatch on save
  const isInProgress =
    isEdit &&
    campaign.status !== 'draft' &&
    campaign.status != null;
  const tenantId = useTenantId();
  const { toast } = useToast();
  const { createCampaign, updateCampaign, scheduleCampaign } = useCampaignMutations();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(() => initState(campaign));
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  // Data from Supabase
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactCount, setContactCount] = useState(0);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const selectedInstance = instances.find((i) => i.id === state.whatsapp_instance_id) ?? null;
  const isOfficialProvider = selectedInstance?.provider === 'official';

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const set = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Load reference data ────────────────────
  useEffect(() => {
    if (!tenantId) return;
    void (async () => {
      const [{ data: inst }, { data: tgs }, { data: stgs }] = await Promise.all([
        supabase
          .from('whatsapp_instances')
          .select('id, name, status, provider')
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
        supabase
          .from('tags')
          .select('id, name, color')
          .eq('tenant_id', tenantId),
        supabase
          .from('funnel_stages')
          .select('id, name, color')
          .eq('tenant_id', tenantId)
          .order('order'),
      ]);
      // Só WhatsApp: a conta do Instagram mora na mesma tabela, mas campanha
      // não sai por ela (aparecia aqui como "(desconectada)").
      setInstances(onlyWhatsApp(inst ?? []).map((i) => ({ ...i, status: i.status ?? '', provider: i.provider ?? null })));
      setTags((tgs ?? []).map((t) => ({ ...t, color: t.color ?? '' })));
      setStages((stgs ?? []).map((s) => ({ ...s, color: s.color ?? '' })));
    })();
  }, [tenantId]);

  // ── Load contacts (contact_list audience) ──
  useEffect(() => {
    if (state.audience_type !== 'contact_list' || !tenantId) return;
    void (async () => {
      setLoadingContacts(true);
      // Só WhatsApp: campanha é disparo de WhatsApp, e contato do Instagram não
      // tem telefone (decisão do dono, 2026-09-25: nem é oferecido aqui). A rede
      // de segurança continua no servidor — schedule_campaign_messages só
      // agenda quem tem phone, e process-campaign-dispatch falha sem telefone.
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, current_stage_id')
        .eq('tenant_id', tenantId)
        .eq('channel', 'whatsapp')
        .order('name');
      setContacts(data ?? []);
      setLoadingContacts(false);
    })();
  }, [state.audience_type, tenantId]);

  // ── Tag audience contact count ─────────────
  useEffect(() => {
    if (state.audience_type !== 'tags' || !tenantId) return;
    void (async () => {
      if (state.selectedTagIds.length === 0) {
        setContactCount(0);
        return;
      }
      // A contagem é de quem a campanha alcança: contato do Instagram com a
      // mesma etiqueta não entra (o servidor também não o agenda).
      const { data: ctRows } = await supabase
        .from('contact_tags')
        .select('contact_id, contacts!inner(channel)')
        .in('tag_id', state.selectedTagIds)
        .eq('contacts.channel', 'whatsapp');
      const ids = [...new Set((ctRows ?? []).map((r: { contact_id: string }) => r.contact_id))];
      setContactCount(ids.length);
    })();
  }, [state.selectedTagIds, state.audience_type, tenantId]);

  // ── Helpers ────────────────────────────────

  const totalContacts =
    state.audience_type === 'csv_import'
      ? state.csvRows.length
      : state.audience_type === 'tags'
      ? contactCount
      : state.selectedContactIds.length;

  const estimatedDuration = () => {
    const secs = totalContacts * state.delay_between_messages;
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.ceil(secs / 60)} min`;
    const h = Math.floor(secs / 3600);
    const m = Math.ceil((secs % 3600) / 60);
    return `${h}h ${m}min`;
  };

  const scheduledAt = (): string | null => {
    if (state.sendMode !== 'scheduled' || !state.scheduledDate) return null;
    const [hh, mm] = state.scheduledTime.split(':');
    const d = new Date(state.scheduledDate);
    d.setHours(Number(hh), Number(mm), 0, 0);
    return d.toISOString();
  };

  const scheduleLabel = (): string => {
    const at = scheduledAt();
    if (!at) return 'Envio imediato';
    const d = new Date(at);
    const days = differenceInDays(d, new Date());
    const hours = differenceInHours(d, new Date()) % 24;
    const mins = differenceInMinutes(d, new Date()) % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}min`);
    return parts.length ? `em ${parts.join(' ')} (${format(d, "dd/MM HH:mm", { locale: ptBR })})` : 'Agora';
  };

  // ── Step validation ────────────────────────

  const canProceed = () => {
    if (step === 1) {
      const ok = state.name.trim().length > 0 && state.whatsapp_instance_id;
      if (isOfficialProvider && state.is_template) return ok && state.template_name.trim().length > 0;
      if (state.message_type === 'text') return ok && state.message_template.trim().length > 0;
      return ok && !!state.media_url;
    }
    if (step === 2) {
      if (state.audience_type === 'csv_import') return state.csvRows.length > 0;
      if (state.audience_type === 'tags') return state.selectedTagIds.length > 0;
      if (state.audience_type === 'contact_list') return state.selectedContactIds.length > 0;
    }
    if (step === 3) {
      if (state.sendMode === 'scheduled') return !!state.scheduledDate;
    }
    return true;
  };

  // ── Media upload ───────────────────────────

  const handleMediaUpload = async (file: File, bucket: 'campaign-media' | 'campaign-imports') => {
    if (!tenantId) return;
    setUploading(true);
    setUploadProgress(10);
    try {
      const path = `${tenantId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      setUploadProgress(80);
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      setUploadProgress(100);
      return { url: data.publicUrl, path };
    } catch (err) {
      logger.error('Falha no upload de mídia', { error: (err as Error).message });
      toast({
        title: 'Erro no upload',
        description: (err as Error).message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ── CSV upload + parse ─────────────────────

  const handleCsvFile = async (file: File) => {
    if (!tenantId) return;
    const text = await file.text();
    const result = parseCsv(text);
    set('csvRows', result.valid);
    set('csvInvalid', result.invalid);
    set('csvFileName', file.name);

    // Upload to campaign-imports bucket
    const uploaded = await handleMediaUpload(file, 'campaign-imports');
    if (uploaded) {
      set('csvFileUrl', uploaded.url);
      // Insert campaign_imports row asynchronously (table not in generated types yet)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (supabase as any).from('campaign_imports').insert({
        tenant_id: tenantId,
        file_name: file.name,
        file_url: uploaded.url,
        total_rows: result.valid.length + result.invalid.length,
        valid_rows: result.valid.length,
        invalid_rows: result.invalid.length,
        status: 'processed',
        contacts: result.valid as unknown as Record<string, unknown>[],
        errors: result.invalid as unknown as Record<string, unknown>[],
      });
    }
  };

  // ── Save / submit ──────────────────────────

  const buildPayload = (status: 'draft' | 'active' | 'scheduled'): CampaignCreateInput => {
    const at = scheduledAt();

    const audienceConfig: Record<string, unknown> =
      state.audience_type === 'csv_import'
        ? {
            file_url: state.csvFileUrl,
            total_contacts: state.csvRows.length,
            contacts: state.csvRows,
          }
        : state.audience_type === 'tags'
        ? { tag_ids: state.selectedTagIds }
        : { contact_ids: state.selectedContactIds };

    return {
      name: state.name.trim(),
      description: state.description.trim() || null,
      whatsapp_instance_id: state.whatsapp_instance_id,
      message_type: state.message_type,
      message_template: state.message_template,
      media_url: state.media_url,
      media_caption: state.media_caption || null,
      audience_type: state.audience_type,
      audience_config: audienceConfig,
      target_tags:
        state.audience_type === 'tags' ? state.selectedTagIds : [],
      target_stages: [],
      delay_between_messages: state.delay_between_messages,
      min_delay_seconds: Math.max(0, state.delay_between_messages - 2),
      max_delay_seconds: state.delay_between_messages + 2,
      respect_business_hours: state.respect_business_hours,
      business_hours_start: state.respect_business_hours ? state.business_hours_start : null,
      business_hours_end: state.respect_business_hours ? state.business_hours_end : null,
      daily_send_limit: state.daily_send_limit ? parseInt(state.daily_send_limit) : null,
      timezone: state.timezone,
      scheduled_at: at,
      require_opt_in: state.require_opt_in,
      is_template: isOfficialProvider && state.is_template,
      template_name: isOfficialProvider && state.is_template ? state.template_name.trim() : null,
      template_language: state.template_language || 'pt_BR',
      template_params: isOfficialProvider && state.is_template && state.template_params.length > 0 ? state.template_params : null,
      status,
    };
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const payload = buildPayload('draft');
      if (isEdit && campaign) {
        await updateCampaign.mutateAsync({ id: campaign.id, input: payload });
      } else {
        await createCampaign.mutateAsync(payload);
      }
      onCampaignCreated?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      if (isInProgress && campaign) {
        // Campaign is already dispatched — only update the row, don't re-schedule
        await updateCampaign.mutateAsync({
          id: campaign.id,
          input: buildPayload(campaign.status as 'active' | 'scheduled' | 'draft'),
        });
        toast({
          title: 'Alterações salvas',
          description: 'Os envios ainda pendentes usarão a nova configuração.',
        });
        onCampaignCreated?.();
        onClose();
        return;
      }

      const status = state.sendMode === 'scheduled' ? 'scheduled' : 'active';
      const payload = buildPayload(status);

      let campaignId: string;
      if (isEdit && campaign) {
        const updated = await updateCampaign.mutateAsync({ id: campaign.id, input: payload });
        campaignId = updated.id;
      } else {
        const created = await createCampaign.mutateAsync(payload);
        campaignId = created.id;
      }
      await scheduleCampaign.mutateAsync(campaignId);
      onCampaignCreated?.();
      onClose();
    } catch (err) {
      logger.error('Erro ao confirmar campanha', { error: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  // ── Filtered contacts ──────────────────────

  const filteredContacts = contacts.filter((c) => {
    const q = state.contactSearch.toLowerCase();
    const matchText =
      !q ||
      (c.name ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q);
    const matchStage =
      state.contactStageFilter === 'all' ||
      c.current_stage_id === state.contactStageFilter;
    return matchText && matchStage;
  });

  // ─────────────────────────────────────────────
  // Render steps
  // ─────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-5">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="campaign-name">Nome da Campanha *</Label>
        <Input
          id="campaign-name"
          placeholder="Ex: Promoção Junho 2025"
          value={state.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="campaign-desc">Descrição</Label>
        <Input
          id="campaign-desc"
          placeholder="Descrição opcional"
          value={state.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      {/* Instance */}
      <div className="space-y-2">
        <Label>Instância do WhatsApp *</Label>
        <Select
          value={state.whatsapp_instance_id}
          onValueChange={(v) => set('whatsapp_instance_id', v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma instância" />
          </SelectTrigger>
          <SelectContent>
            {instances
              .filter((i) => i.status === 'open')
              .map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            {instances.filter((i) => i.status !== 'open').length > 0 && (
              <>
                {instances
                  .filter((i) => i.status !== 'open')
                  .map((i) => (
                    <SelectItem key={i.id} value={i.id} disabled>
                      {i.name} (desconectada)
                    </SelectItem>
                  ))}
              </>
            )}
          </SelectContent>
        </Select>
        {instances.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma instância ativa encontrada.</p>
        )}
      </div>

      {/* Opt-in requirement toggle */}
      <div className="flex items-center gap-3">
        <Checkbox
          id="require-opt-in"
          checked={state.require_opt_in}
          onCheckedChange={(c) => set('require_opt_in', !!c)}
        />
        <Label htmlFor="require-opt-in" className="cursor-pointer">
          Exigir opt-in (só enviar para contatos que consentiram)
        </Label>
      </div>

      {/* Send type — only for official (Meta Cloud API) instances */}
      {isOfficialProvider && (
        <div className="space-y-3">
          <Label>Tipo de envio</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => set('is_template', true)}
              className={`flex flex-col items-start gap-1 rounded-lg border p-4 transition-colors text-left ${
                state.is_template
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <span className="text-sm font-medium">Template aprovado</span>
              <span className="text-xs text-muted-foreground">Recomendado para Meta Cloud API</span>
            </button>
            <button
              type="button"
              onClick={() => set('is_template', false)}
              className={`flex flex-col items-start gap-1 rounded-lg border p-4 transition-colors text-left ${
                !state.is_template
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <span className="text-sm font-medium">Texto livre</span>
              <span className="text-xs text-muted-foreground">Apenas dentro da janela de 24h</span>
            </button>
          </div>
          {!state.is_template && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Mensagens de texto livre só são entregues dentro da janela de 24h após a última
                interação do contato. Envios fora dessa janela são bloqueados pelo WhatsApp e podem
                resultar em restrições ao número.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Template fields — official provider + is_template */}
      {isOfficialProvider && state.is_template && (
        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
          <h4 className="font-medium text-sm">Configuração do Template</h4>

          <div className="space-y-2">
            <Label htmlFor="template-name">Nome do template *</Label>
            <Input
              id="template-name"
              placeholder="Ex: pedido_confirmado"
              value={state.template_name}
              onChange={(e) => set('template_name', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Nome exato do template aprovado no Gerenciador do WhatsApp Business.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-language">Idioma do template</Label>
            <Select
              value={state.template_language}
              onValueChange={(v) => set('template_language', v)}
            >
              <SelectTrigger id="template-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                <SelectItem value="en_US">English (US)</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Parâmetros do corpo</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => set('template_params', [...state.template_params, ''])}
              >
                + Adicionar parâmetro
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Valores para {'{{1}}'}, {'{{2}}'}, etc. Pode usar {'{name}'}, {'{first_name}'}, {'{phone}'}, {'{email}'}.
            </p>
            {state.template_params.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Nenhum parâmetro adicionado.</p>
            )}
            {state.template_params.map((param, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <span className="text-xs text-muted-foreground w-6 shrink-0">
                  {`{{${idx + 1}}}`}
                </span>
                <Input
                  value={param}
                  placeholder={`Ex: {name}`}
                  onChange={(e) => {
                    const updated = [...state.template_params];
                    updated[idx] = e.target.value;
                    set('template_params', updated);
                  }}
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => set('template_params', state.template_params.filter((_, i) => i !== idx))}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message type cards */}
      <div className="space-y-2">
        <Label>Tipo de Mensagem *</Label>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { type: 'text', icon: <MessageSquare className="h-5 w-5" />, label: 'Texto' },
              { type: 'image', icon: <ImageIcon className="h-5 w-5" />, label: 'Imagem' },
              { type: 'video', icon: <Video className="h-5 w-5" />, label: 'Vídeo' },
            ] as const
          ).map(({ type, icon, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => set('message_type', type)}
              className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
                state.message_type === type
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              {icon}
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Text content */}
      {state.message_type === 'text' && (
        <div className="space-y-2">
          <Label htmlFor="message-template">Mensagem *</Label>
          <div className="flex flex-wrap gap-1 mb-2">
            {VARIABLE_CHIPS.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() =>
                  insertAtCursor(
                    textareaRef as React.RefObject<HTMLTextAreaElement>,
                    chip.value,
                    state.message_template,
                    (v) => set('message_template', v)
                  )
                }
                className="px-2 py-0.5 text-xs rounded-full bg-muted border border-border hover:bg-primary/10 hover:border-primary transition-colors"
              >
                {chip.label}
              </button>
            ))}
          </div>
          <Textarea
            id="message-template"
            ref={textareaRef}
            placeholder="Olá {name}! Temos uma oferta especial para você..."
            rows={6}
            value={state.message_template}
            onChange={(e) => set('message_template', e.target.value)}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{state.message_template.length} / 4096 caracteres</span>
          </div>
          {/* WhatsApp preview bubble */}
          {state.message_template && (
            <div className="mt-3 flex justify-end">
              <div className="max-w-xs bg-green-100 dark:bg-green-900 rounded-2xl rounded-tr-sm px-4 py-2 text-sm whitespace-pre-wrap shadow-sm">
                {state.message_template.replace(/{name}/g, 'João').replace(/{first_name}/g, 'João').replace(/{phone}/g, '5511999990001').replace(/{email}/g, 'joao@exemplo.com')}
                <div className="text-xs text-green-700 dark:text-green-400 text-right mt-1">10:30 ✓✓</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Media upload — image */}
      {state.message_type === 'image' && (
        <MediaUploadSection
          accept="image/jpeg,image/png,image/webp"
          maxMB={5}
          label="Imagem *"
          hint="JPG, PNG ou WEBP até 5MB"
          mediaUrl={state.media_url}
          uploading={uploading}
          uploadProgress={uploadProgress}
          onFile={async (file) => {
            const r = await handleMediaUpload(file, 'campaign-media');
            if (r) set('media_url', r.url);
          }}
          onClear={() => set('media_url', null)}
        >
          {state.media_url && (
            <img
              src={state.media_url}
              alt="Preview"
              className="mt-2 rounded-md max-h-40 object-contain"
            />
          )}
          <div className="mt-3 space-y-2">
            <Label htmlFor="img-caption">Legenda</Label>
            <div className="flex flex-wrap gap-1 mb-1">
              {VARIABLE_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => set('media_caption', state.media_caption + chip.value)}
                  className="px-2 py-0.5 text-xs rounded-full bg-muted border hover:bg-primary/10 transition-colors"
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <Input
              id="img-caption"
              placeholder="Legenda opcional"
              value={state.media_caption}
              onChange={(e) => set('media_caption', e.target.value)}
            />
          </div>
        </MediaUploadSection>
      )}

      {/* Media upload — video */}
      {state.message_type === 'video' && (
        <MediaUploadSection
          accept="video/mp4"
          maxMB={50}
          label="Vídeo *"
          hint="MP4 até 50MB"
          mediaUrl={state.media_url}
          uploading={uploading}
          uploadProgress={uploadProgress}
          onFile={async (file) => {
            const r = await handleMediaUpload(file, 'campaign-media');
            if (r) set('media_url', r.url);
          }}
          onClear={() => set('media_url', null)}
        >
          {state.media_url && (
            <video src={state.media_url} controls className="mt-2 rounded-md max-h-40 w-full" />
          )}
          <div className="mt-3 space-y-2">
            <Label htmlFor="vid-caption">Legenda</Label>
            <Input
              id="vid-caption"
              placeholder="Legenda opcional"
              value={state.media_caption}
              onChange={(e) => set('media_caption', e.target.value)}
            />
          </div>
        </MediaUploadSection>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-5">
      {/* Audience type cards */}
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            { type: 'csv_import', icon: <Upload className="h-5 w-5" />, label: 'CSV' },
            { type: 'tags', icon: <Tags className="h-5 w-5" />, label: 'Tags' },
            { type: 'contact_list', icon: <ListChecks className="h-5 w-5" />, label: 'Contatos' },
          ] as const
        ).map(({ type, icon, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => set('audience_type', type)}
            className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
              state.audience_type === type
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border hover:border-primary/50'
            }`}
          >
            {icon}
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      {/* CSV */}
      {state.audience_type === 'csv_import' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Importar CSV</Label>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([buildTemplateCsv()], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'modelo-campanha.csv';
                a.click();
              }}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Download className="h-3 w-3" />
              Baixar modelo
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Colunas esperadas: <code>phone</code> (obrigatório), <code>name</code>, <code>email</code>
          </p>
          <DragDropCsv
            fileName={state.csvFileName}
            onFile={handleCsvFile}
          />
          {state.csvRows.length > 0 && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>{state.csvRows.length}</strong> contatos válidos
                {state.csvInvalid.length > 0 && (
                  <span className="text-orange-600 ml-2">
                    / {state.csvInvalid.length} inválidos
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}
          {state.csvInvalid.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {state.csvInvalid.slice(0, 10).map((e, i) => (
                <p key={i} className="text-xs text-red-600">
                  Linha {e.row}: {e.reason}
                </p>
              ))}
            </div>
          )}
          {state.csvRows.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Telefone</th>
                    <th className="text-left p-2">Nome</th>
                    <th className="text-left p-2">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {state.csvRows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.phone}</td>
                      <td className="p-2">{r.name ?? '—'}</td>
                      <td className="p-2">{r.email ?? '—'}</td>
                    </tr>
                  ))}
                  {state.csvRows.length > 5 && (
                    <tr className="border-t">
                      <td colSpan={3} className="p-2 text-center text-muted-foreground">
                        + {state.csvRows.length - 5} mais contatos
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {state.audience_type === 'tags' && (
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Selecione as Tags</Label>
            <div className="flex flex-wrap gap-2 min-h-[40px]">
              {tags.map((tag) => {
                const selected = state.selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      set(
                        'selectedTagIds',
                        selected
                          ? state.selectedTagIds.filter((id) => id !== tag.id)
                          : [...state.selectedTagIds, tag.id]
                      )
                    }
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                      selected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary'
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })}
              {tags.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma tag cadastrada.</p>
              )}
            </div>
          </div>
          {state.selectedTagIds.length > 0 && (
            <Alert>
              <Users className="h-4 w-4" />
              <AlertDescription>
                <strong>{contactCount}</strong> contatos encontrados para as tags selecionadas.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Contact list */}
      {state.audience_type === 'contact_list' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone"
                className="pl-8"
                value={state.contactSearch}
                onChange={(e) => set('contactSearch', e.target.value)}
              />
            </div>
            <Select value={state.contactStageFilter} onValueChange={(v) => set('contactStageFilter', v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Estágio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estágios</SelectItem>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {state.selectedContactIds.length} selecionado(s) de {filteredContacts.length}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() =>
                  set('selectedContactIds', filteredContacts.map((c) => c.id))
                }
              >
                Selecionar todos
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => set('selectedContactIds', [])}
              >
                Limpar
              </button>
            </div>
          </div>
          {loadingContacts ? (
            <p className="text-sm text-muted-foreground">Carregando contatos...</p>
          ) : (
            <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
              {filteredContacts.map((c) => {
                const selected = state.selectedContactIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) =>
                        set(
                          'selectedContactIds',
                          checked
                            ? [...state.selectedContactIds, c.id]
                            : state.selectedContactIds.filter((id) => id !== c.id)
                        )
                      }
                    />
                    <div>
                      <p className="text-sm font-medium">{c.name ?? c.phone}</p>
                      {c.name && (
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      )}
                    </div>
                  </label>
                );
              })}
              {filteredContacts.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  Nenhum contato encontrado.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Total estimate */}
      {totalContacts > 0 && (
        <p className="text-sm font-medium text-center text-muted-foreground">
          Esta campanha será enviada para{' '}
          <strong className="text-foreground">{totalContacts}</strong> contato
          {totalContacts !== 1 ? 's' : ''}.
        </p>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      {/* Send mode */}
      <div className="space-y-3">
        <Label>Quando enviar?</Label>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { mode: 'immediate', label: 'Enviar imediatamente' },
              { mode: 'scheduled', label: 'Agendar' },
            ] as const
          ).map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => set('sendMode', mode)}
              className={`rounded-lg border p-4 text-sm font-medium transition-colors ${
                state.sendMode === mode
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Date + time picker */}
      {state.sendMode === 'scheduled' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Data *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {state.scheduledDate
                    ? format(state.scheduledDate, 'dd/MM/yyyy', { locale: ptBR })
                    : 'Selecionar data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={state.scheduledDate ?? undefined}
                  onSelect={(d) => set('scheduledDate', d ?? null)}
                  disabled={(d) => d < new Date()}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-time">Hora</Label>
            <Input
              id="sched-time"
              type="time"
              value={state.scheduledTime}
              onChange={(e) => set('scheduledTime', e.target.value)}
            />
          </div>
        </div>
      )}

      {state.sendMode === 'scheduled' && state.scheduledDate && (
        <p className="text-sm text-blue-600 font-medium">{scheduleLabel()}</p>
      )}

      {/* Dispatch settings */}
      <div className="space-y-4 border rounded-lg p-4">
        <h4 className="font-medium">Configurações de Disparo</h4>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Intervalo entre mensagens</Label>
            <span className="text-sm font-medium">{state.delay_between_messages}s</span>
          </div>
          <Slider
            min={3}
            max={10}
            step={1}
            value={[state.delay_between_messages]}
            onValueChange={([v]) => set('delay_between_messages', v ?? state.delay_between_messages)}
          />
          <p className="text-xs text-muted-foreground">
            Duração estimada: {estimatedDuration()} para {totalContacts} contatos
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Checkbox
            id="biz-hours"
            checked={state.respect_business_hours}
            onCheckedChange={(c) => set('respect_business_hours', !!c)}
          />
          <Label htmlFor="biz-hours">Respeitar horário comercial</Label>
        </div>

        {state.respect_business_hours && (
          <div className="grid grid-cols-2 gap-4 pl-6">
            <div className="space-y-1">
              <Label htmlFor="bh-start">Início</Label>
              <Input
                id="bh-start"
                type="time"
                value={state.business_hours_start}
                onChange={(e) => set('business_hours_start', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bh-end">Fim</Label>
              <Input
                id="bh-end"
                type="time"
                value={state.business_hours_end}
                onChange={(e) => set('business_hours_end', e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="daily-limit">Limite diário de envios (opcional)</Label>
          <Input
            id="daily-limit"
            type="number"
            min="1"
            placeholder="Ex: 200"
            value={state.daily_send_limit}
            onChange={(e) => set('daily_send_limit', e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => {
    const instance = instances.find((i) => i.id === state.whatsapp_instance_id);
    const audienceLabel =
      state.audience_type === 'csv_import'
        ? `CSV: ${state.csvRows.length} contatos`
        : state.audience_type === 'tags'
        ? `Tags: ${contactCount} contatos`
        : `Lista: ${state.selectedContactIds.length} contatos`;

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <SummaryRow label="Campanha" value={state.name} />
          <SummaryRow label="Instância" value={instance?.name ?? '—'} />
          <SummaryRow label="Tipo" value={state.message_type} />
          <SummaryRow label="Público" value={audienceLabel} />
          <SummaryRow label="Envio" value={scheduleLabel()} />
          <SummaryRow label="Intervalo" value={`${state.delay_between_messages}s`} />
          {state.require_opt_in && (
            <SummaryRow label="Opt-in" value="Apenas contatos com consentimento" />
          )}
          {isOfficialProvider && (
            <SummaryRow
              label="Tipo de envio"
              value={state.is_template ? `Template: ${state.template_name || '—'}` : 'Texto livre'}
            />
          )}
        </div>

        {/* Message preview */}
        {state.message_type === 'text' && state.message_template && (
          <div>
            <Label className="mb-2 block">Prévia da Mensagem</Label>
            <div className="flex justify-end">
              <div className="max-w-xs bg-green-100 dark:bg-green-900 rounded-2xl rounded-tr-sm px-4 py-2 text-sm whitespace-pre-wrap shadow-sm">
                {state.message_template
                  .replace(/{name}/g, 'João')
                  .replace(/{first_name}/g, 'João')
                  .replace(/{phone}/g, '5511999990001')
                  .replace(/{email}/g, 'joao@exemplo.com')}
                <div className="text-xs text-green-700 dark:text-green-400 text-right mt-1">
                  10:30 ✓✓
                </div>
              </div>
            </div>
          </div>
        )}

        {state.media_url && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Mídia ({state.message_type}) anexada à campanha.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  const stepContent = [renderStep1, renderStep2, renderStep3, renderStep4];

  // ─────────────────────────────────────────────
  // Layout
  // ─────────────────────────────────────────────

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            {isEdit ? 'Editar Campanha' : 'Nova Campanha'}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress */}
        <div className="mt-4 space-y-1">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i < step ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((label, i) => (
              <span key={i} className={i + 1 === step ? 'text-primary font-medium' : ''}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {stepContent[step - 1]?.()}

        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 1}
          >
            Anterior
          </Button>

          <div className="flex gap-2">
            {step === 4 ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={saving || !state.name.trim()}
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Salvar como Rascunho
                </Button>
                <Button onClick={handleConfirm} disabled={saving || !canProceed()}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {isInProgress
                    ? 'Salvar alterações'
                    : state.sendMode === 'scheduled'
                    ? 'Confirmar e Agendar'
                    : 'Confirmar e Disparar'}
                </Button>
              </>
            ) : (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
                Próximo
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

interface MediaUploadSectionProps {
  accept: string;
  maxMB: number;
  label: string;
  hint: string;
  mediaUrl: string | null;
  uploading: boolean;
  uploadProgress: number;
  onFile: (file: File) => void;
  onClear: () => void;
  children?: React.ReactNode;
}

function MediaUploadSection({
  accept,
  maxMB,
  label,
  hint,
  mediaUrl,
  uploading,
  uploadProgress,
  onFile,
  onClear,
  children,
}: MediaUploadSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = (file: File) => {
    if (file.size > maxMB * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: `Tamanho máximo: ${maxMB}MB`,
        variant: 'destructive',
      });
      return;
    }
    onFile(file);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {!mediaUrl ? (
        <div
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Arraste ou clique para selecionar</p>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      ) : (
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 z-10"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>
          {children}
        </div>
      )}
      {uploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>Enviando...</span>
            <span>{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} />
        </div>
      )}
    </div>
  );
}

interface DragDropCsvProps {
  fileName: string;
  onFile: (file: File) => void;
}

function DragDropCsv({ fileName, onFile }: DragDropCsvProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      {fileName ? (
        <div className="flex flex-col items-center gap-1">
          <CheckCircle className="h-8 w-8 text-green-500" />
          <p className="text-sm font-medium">{fileName}</p>
          <p className="text-xs text-muted-foreground">Clique para substituir</p>
        </div>
      ) : (
        <>
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Arraste o arquivo CSV ou clique para selecionar</p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

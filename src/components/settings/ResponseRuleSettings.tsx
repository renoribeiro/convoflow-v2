import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, Info, Loader2, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant, useCan } from '@/contexts/TenantContext';
import { useCanManageRotation } from '@/hooks/useConversationRotation';
import { useResponseRulePreview, useResponseRuleSettings, RESPONSE_RULE_PREVIEW_DAYS } from '@/hooks/useResponseRule';
import {
  RESPONSE_RULE_MAX_TRANSFERS_MAX,
  RESPONSE_RULE_MAX_TRANSFERS_MIN,
  RESPONSE_RULE_MINUTES_MAX,
  RESPONSE_RULE_MINUTES_MIN,
  TIMEZONE_OPTIONS,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  breachMoment,
  cloneBusinessHours,
  formatLocalMoment,
  hasResponseRuleErrors,
  sameBusinessHours,
  validateResponseRule,
  type BusinessHours,
  type WeekdayKey,
} from '@/lib/conversations/responseRule';

/**
 * Configurações › Escala/Transferência — "Transferência por tempo sem
 * resposta" (migração 20260916000001).
 *
 * Quatro chaves em `tenants.settings` (response_rule_enabled,
 * response_rule_minutes, response_rule_max_transfers, business_hours) gravadas
 * por `updateTenantSettings` (merge raso — `business_hours` vai inteiro, sempre).
 *
 * Regras da tela:
 *   - a regra nasce DESLIGADA; ligada, conta minutos DE FUNCIONAMENTO desde o
 *     início da espera do cliente (não desde a última mensagem dele);
 *   - o horário de funcionamento é a MESMA chave que o chatbot lê para
 *     "fora do horário": editar aqui muda os dois de propósito;
 *   - a prévia ("com X minutos, N das esperas dos últimos 30 dias teriam sido
 *     transferidas") usa o histórico real da Loja e o horário RASCUNHADO, com
 *     atraso de digitação e cache de 5 min; se a RPC falhar, a prévia some e o
 *     resto da tela continua;
 *   - o exemplo "sexta 17:50 → segunda 09:50" é calculado aqui com o mesmo
 *     algoritmo do banco (`businessMinutesBetween`), só para o gestor entender
 *     o efeito do horário;
 *   - a sinalização de SLA (aba Atendimento) é outra coisa: só marca cor,
 *     em horas corridas desde a última mensagem. A tela diz isso.
 */

const TITLE = 'Transferência por tempo sem resposta';

/** Exemplo fixo: sexta 17:50 no fuso da Loja — o pior caso que cabe numa frase. */
const exampleStart = (timezone: string): Date => {
  // Procura a próxima sexta a partir de hoje, 17:50 no fuso da Loja.
  const now = new Date();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const label = formatLocalMoment(d, timezone);
    if (label.startsWith('sexta')) {
      // 17:50 local = ajusta pela diferença entre o horário local mostrado e 17:50.
      const [, hhmm] = label.split(' ');
      const [h, m] = hhmm.split(':').map(Number);
      return new Date(d.getTime() + ((17 - h) * 60 + (50 - m)) * 60_000);
    }
  }
  return now;
};

export const ResponseRuleSettings = () => {
  const { tenant, updateTenantSettings } = useTenant();
  const canEdit = useCan('store.admin');
  const canManage = useCanManageRotation();
  const saved = useResponseRuleSettings();

  const [enabled, setEnabled] = useState(saved.response_rule_enabled);
  // Texto, não número: o input precisa aceitar campo vazio enquanto se digita.
  const [minutesDraft, setMinutesDraft] = useState(String(saved.response_rule_minutes));
  const [maxDraft, setMaxDraft] = useState(String(saved.response_rule_max_transfers));
  const [hours, setHours] = useState<BusinessHours>(() => cloneBusinessHours(saved.business_hours));
  const [isSaving, setIsSaving] = useState(false);

  // O tenant chega depois do primeiro render (TenantContext carrega async).
  useEffect(() => {
    setEnabled(saved.response_rule_enabled);
    setMinutesDraft(String(saved.response_rule_minutes));
    setMaxDraft(String(saved.response_rule_max_transfers));
    setHours(cloneBusinessHours(saved.business_hours));
  }, [saved.response_rule_enabled, saved.response_rule_minutes, saved.response_rule_max_transfers, saved.business_hours]);

  const minutes = Number(minutesDraft);
  const maxTransfers = Number(maxDraft);
  const errors = useMemo(
    () => validateResponseRule({ minutes, maxTransfers, businessHours: hours }),
    [minutes, maxTransfers, hours],
  );
  const hasErrors = hasResponseRuleErrors(errors);

  const isDirty =
    enabled !== saved.response_rule_enabled ||
    minutes !== saved.response_rule_minutes ||
    maxTransfers !== saved.response_rule_max_transfers ||
    !sameBusinessHours(hours, saved.business_hours);

  const preview = useResponseRulePreview(minutes, hours, canManage && !errors.minutes && !errors.schedule);

  const example = useMemo(() => {
    if (errors.minutes || errors.schedule || errors.days) return null;
    const start = exampleStart(hours.timezone);
    const at = breachMoment(hours, start, minutes);
    return at ? { start: formatLocalMoment(start, hours.timezone), at: formatLocalMoment(at, hours.timezone) } : null;
  }, [hours, minutes, errors.minutes, errors.schedule, errors.days]);

  const setDay = (key: WeekdayKey, patch: { open?: boolean; start?: string; end?: string }) => {
    setHours((prev) => {
      const next = cloneBusinessHours(prev);
      const current = next.schedule[key];
      if (patch.open === false) {
        next.schedule[key] = null;
      } else if (patch.open === true) {
        next.schedule[key] = current ?? { start: '09:00', end: '18:00' };
      } else if (current) {
        next.schedule[key] = { start: patch.start ?? current.start, end: patch.end ?? current.end };
      }
      return next;
    });
  };

  const handleSave = async () => {
    if ((enabled && hasErrors) || !canEdit) return;
    setIsSaving(true);
    try {
      // Desligada com campos inválidos: grava só o desligar — o resto fica
      // como estava (a CHECK do banco recusaria um minuto fora da faixa).
      const patch = hasErrors
        ? { response_rule_enabled: false }
        : {
            response_rule_enabled: enabled,
            response_rule_minutes: minutes,
            response_rule_max_transfers: maxTransfers,
            business_hours: hours,
          };
      await updateTenantSettings(patch, { silent: true });
      toast.success(
        enabled
          ? `Regra salva: sem resposta em ${minutes} min de funcionamento, a conversa muda de responsável.`
          : 'Configurações salvas. A transferência automática está desligada.',
      );
    } catch (error) {
      const detalhe =
        (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : null) ?? 'tente novamente.';
      toast.error(`Não foi possível salvar: ${detalhe}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (saved.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{TITLE}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!tenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{TITLE}</CardTitle>
          <CardDescription>Quando o responsável não responde a tempo, a conversa passa para outro atendente.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Esta configuração é por Loja. Escolha uma Loja no seletor de Conta, no topo da tela,
              para poder ajustá-la.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Atendente: lê os valores, não configura nada.
  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{TITLE}</CardTitle>
          <CardDescription>Quando o responsável não responde a tempo, a conversa passa para outro atendente.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {saved.response_rule_enabled
                ? `Nesta Loja, uma conversa sua sem resposta por ${saved.response_rule_minutes} min de funcionamento passa para um colega, e o sino avisa quem recebeu.`
                : 'Nesta Loja a transferência automática está desligada. Apenas Gerente ou Gestor configura.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{TITLE}</CardTitle>
        <CardDescription>
          Ligada, a regra conta os minutos de funcionamento desde que o cliente começou a esperar. Se o
          responsável não responder nesse prazo, a conversa passa para o próximo do rodízio e o sino avisa
          quem recebeu. Resposta do chatbot não conta como resposta.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!canEdit && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Apenas Gerente ou Gestor pode alterar estas configurações. Você está vendo os valores
              atuais da Loja.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="response-rule-enabled">Transferir conversa sem resposta</Label>
            <p className="text-sm text-muted-foreground">
              Desligada, nada muda: quem tem a conversa fica com ela até alguém mover à mão.
            </p>
          </div>
          <Switch
            id="response-rule-enabled"
            checked={enabled}
            disabled={!canEdit}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <>
            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="response-rule-minutes">Tempo sem resposta</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="response-rule-minutes"
                    type="number"
                    min={RESPONSE_RULE_MINUTES_MIN}
                    max={RESPONSE_RULE_MINUTES_MAX}
                    step={1}
                    inputMode="numeric"
                    value={minutesDraft}
                    disabled={!canEdit}
                    onChange={(e) => setMinutesDraft(e.target.value)}
                    aria-invalid={!!errors.minutes}
                    aria-describedby={errors.minutes ? 'response-rule-minutes-erro' : undefined}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">minutos de funcionamento</span>
                </div>
                {errors.minutes && (
                  <p id="response-rule-minutes-erro" className="text-sm text-destructive">
                    {errors.minutes}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="response-rule-max">Máximo de transferências por espera</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="response-rule-max"
                    type="number"
                    min={RESPONSE_RULE_MAX_TRANSFERS_MIN}
                    max={RESPONSE_RULE_MAX_TRANSFERS_MAX}
                    step={1}
                    inputMode="numeric"
                    value={maxDraft}
                    disabled={!canEdit}
                    onChange={(e) => setMaxDraft(e.target.value)}
                    aria-invalid={!!errors.maxTransfers}
                    aria-describedby={errors.maxTransfers ? 'response-rule-max-erro' : undefined}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">vezes</span>
                </div>
                {errors.maxTransfers ? (
                  <p id="response-rule-max-erro" className="text-sm text-destructive">
                    {errors.maxTransfers}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Chegando ao limite, a conversa para de circular: o Gestor recebe um aviso no sino e
                    ela fica com quem está até alguém agir.
                  </p>
                )}
              </div>
            </div>

            {/* Prévia com o histórico da Loja — some em silêncio se a RPC falhar. */}
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm"
            >
              <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                {preview.isLoading && <p className="text-muted-foreground">Calculando com o histórico da Loja…</p>}
                {!preview.isLoading && preview.data && preview.data.turns > 0 && (
                  <p>
                    Com <strong>{minutes} min</strong>, das <strong>{preview.data.turns}</strong> esperas dos últimos{' '}
                    {RESPONSE_RULE_PREVIEW_DAYS} dias, <strong>{preview.data.breached}</strong> teriam passado do
                    limite e mudado de responsável
                    {preview.data.never_replied > 0 && (
                      <> ({preview.data.never_replied} nunca receberam resposta humana)</>
                    )}
                    .
                  </p>
                )}
                {!preview.isLoading && preview.data && preview.data.turns === 0 && (
                  <p className="text-muted-foreground">
                    Sem esperas de cliente nos últimos {RESPONSE_RULE_PREVIEW_DAYS} dias para estimar o efeito.
                  </p>
                )}
                {example && (
                  <p className="text-muted-foreground">
                    Exemplo com o horário abaixo: cliente escreve na {example.start} → sem resposta, a conversa
                    muda de responsável na {example.at}.
                  </p>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="space-y-0.5">
                <Label id="business-hours-label">Horário de funcionamento da Loja</Label>
                <p className="text-sm text-muted-foreground">
                  Só os minutos dentro deste horário contam. É o mesmo horário que o chatbot usa para saber
                  se está &quot;fora do horário&quot;.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="business-hours-tz">Fuso horário</Label>
                <Select
                  value={hours.timezone}
                  disabled={!canEdit}
                  onValueChange={(value) => setHours((prev) => ({ ...cloneBusinessHours(prev), timezone: value }))}
                >
                  <SelectTrigger id="business-hours-tz" className="w-full sm:w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(TIMEZONE_OPTIONS.some((o) => o.value === hours.timezone)
                      ? TIMEZONE_OPTIONS
                      : [{ value: hours.timezone, label: hours.timezone }, ...TIMEZONE_OPTIONS]
                    ).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ul className="divide-y divide-border rounded-md border border-border" aria-labelledby="business-hours-label">
                {WEEKDAY_KEYS.map((key) => {
                  const day = hours.schedule[key];
                  const dayError = errors.days?.[key];
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-3 p-3">
                      <div className="flex w-36 items-center gap-2">
                        <Switch
                          id={`bh-open-${key}`}
                          checked={!!day}
                          disabled={!canEdit}
                          onCheckedChange={(open) => setDay(key, { open })}
                          aria-label={`${WEEKDAY_LABELS[key]} aberto`}
                        />
                        <Label htmlFor={`bh-open-${key}`} className="cursor-pointer">
                          {WEEKDAY_LABELS[key]}
                        </Label>
                      </div>
                      {day ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            aria-label={`${WEEKDAY_LABELS[key]} abre às`}
                            value={day.start}
                            disabled={!canEdit}
                            onChange={(e) => setDay(key, { start: e.target.value })}
                            className="w-28"
                          />
                          <span className="text-sm text-muted-foreground">até</span>
                          <Input
                            type="time"
                            aria-label={`${WEEKDAY_LABELS[key]} fecha às`}
                            value={day.end}
                            disabled={!canEdit}
                            onChange={(e) => setDay(key, { end: e.target.value })}
                            className="w-28"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Fechado</span>
                      )}
                      {dayError && <p className="w-full text-sm text-destructive sm:w-auto">{dayError}</p>}
                    </li>
                  );
                })}
              </ul>
              {errors.schedule && <p className="text-sm text-destructive">{errors.schedule}</p>}
            </div>

            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Diferente da sinalização de SLA (aba Atendimento), que só colore a lista e conta horas corridas
                desde a última mensagem do cliente, esta regra age: conta minutos de funcionamento desde o
                início da espera e transfere. As duas podem ficar ligadas; não se atrapalham.
              </p>
            </div>
          </>
        )}

        {canEdit && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {isDirty ? 'Você tem alterações não salvas.' : 'Tudo salvo.'}
              </p>
              <Button onClick={handleSave} disabled={!isDirty || (enabled && hasErrors) || isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar regra
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

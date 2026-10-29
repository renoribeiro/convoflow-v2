import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info, Loader2, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant, useCan } from '@/contexts/TenantContext';
import { useResponseRuleSettings } from '@/hooks/useResponseRule';
import { motivoDoErro } from '@/lib/errors/mensagemDoErro';
import {
  TIMEZONE_OPTIONS,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  cloneBusinessHours,
  describeBusinessHours,
  sameBusinessHours,
  timezoneLabel,
  validateBusinessHours,
  type BusinessHours,
  type WeekdayKey,
} from '@/lib/conversations/responseRule';

/**
 * Configurações › Horário — o horário de funcionamento da Loja (decisão D6 do
 * lote 6e, achado 114 do checkup).
 *
 * Grava SÓ `tenants.settings.business_hours` (por `updateTenantSettings`,
 * merge raso: o objeto vai inteiro). É a mesma chave que o chatbot lê para
 * "fora do horário" e que a transferência por tempo sem resposta usa para
 * contar minutos de funcionamento. Até o lote 6e o horário morava dentro do
 * cartão da transferência e só aparecia com a chave dela ligada; agora tem
 * aba e "Salvar horário" próprios, e o cartão da transferência só o lê.
 *
 * Quem edita: `store.admin` (Gestor, Gerente com a Loja aberta, superadmin);
 * o banco confere de novo em `set_tenant_settings`. O Atendente lê o horário
 * numa frase.
 */

const TITLE = 'Horário de funcionamento da Loja';

export const BusinessHoursSettings = () => {
  const { tenant, updateTenantSettings } = useTenant();
  const canEdit = useCan('store.admin');
  const saved = useResponseRuleSettings();

  const [hours, setHours] = useState<BusinessHours>(() => cloneBusinessHours(saved.business_hours));
  const [isSaving, setIsSaving] = useState(false);

  // O tenant chega depois do primeiro render (TenantContext carrega async).
  useEffect(() => {
    setHours(cloneBusinessHours(saved.business_hours));
  }, [saved.business_hours]);

  const errors = useMemo(() => validateBusinessHours(hours), [hours]);
  const hasErrors = !!errors.schedule || !!(errors.days && Object.keys(errors.days).length > 0);
  const isDirty = !sameBusinessHours(hours, saved.business_hours);

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
    if (hasErrors || !canEdit) return;
    setIsSaving(true);
    try {
      await updateTenantSettings({ business_hours: hours }, { silent: true });
      toast.success('Horário salvo. O chatbot e a transferência por tempo sem resposta já usam este horário.');
    } catch (error) {
      toast.error(`Não foi possível salvar o horário. ${motivoDoErro(error)}`);
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
          <CardDescription>Os dias e as horas em que a Loja atende.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              O horário é de cada Loja. Escolha uma Loja no seletor de Conta, no topo da tela, para poder ajustá-lo.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Atendente (e quem não administra a Loja): lê o horário numa frase.
  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{TITLE}</CardTitle>
          <CardDescription>Os dias e as horas em que a Loja {tenant.name} atende.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            {describeBusinessHours(saved.business_hours)}. Fuso: {timezoneLabel(saved.business_hours.timezone)}.
          </p>
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Apenas Gerente ou Gestor muda o horário da Loja.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-tour="horario-funcionamento">
      <CardHeader>
        <CardTitle>{TITLE}</CardTitle>
        <CardDescription>
          Os dias e as horas em que a Loja {tenant.name} atende. O chatbot usa este horário para saber se está fora do
          horário, e a transferência por tempo sem resposta só conta os minutos dentro dele.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="business-hours-tz">Fuso horário</Label>
            <DicaDoCampo rotulo="Fuso horário" texto="Os horários abaixo valem neste fuso. O padrão é Brasília." />
          </div>
          <Select
            value={hours.timezone}
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

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label id="business-hours-label">Dias e horas</Label>
            <DicaDoCampo
              rotulo="Dias e horas"
              texto="Desligue o dia em que a Loja fecha. Sem nada salvo, vale segunda a sexta, das 9h às 18h."
            />
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
                        onChange={(e) => setDay(key, { start: e.target.value })}
                        className="w-28"
                      />
                      <span className="text-sm text-muted-foreground">até</span>
                      <Input
                        type="time"
                        aria-label={`${WEEKDAY_LABELS[key]} fecha às`}
                        value={day.end}
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

        <Separator />
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{isDirty ? 'Você tem alterações não salvas.' : 'Tudo salvo.'}</p>
          <Button onClick={handleSave} disabled={!isDirty || hasErrors || isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar horário
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

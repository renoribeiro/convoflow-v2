import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Info, Loader2, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant, useCan } from '@/contexts/TenantContext';
import { useSlaConfig } from '@/hooks/useSlaConfig';
import {
  DEFAULT_SLA_THRESHOLDS,
  SLA_LEVEL_META,
  WHATSAPP_SERVICE_WINDOW_HOURS,
  normalizeSlaThresholds,
  validateSlaThresholds,
  type SlaThresholds,
} from '@/components/conversations/slaLevels';

/**
 * Preferências de ATENDIMENTO da Loja — o primeiro painel de configuração por
 * Conta do produto (os outros são por usuário ou da plataforma).
 *
 * Padrão que os próximos devem seguir:
 *   1. Estado local espelha `tenants.settings.<chave>`, com defaults explícitos.
 *   2. Nada é salvo enquanto o usuário não confirmar — um único "Salvar
 *      alterações", desabilitado quando não há mudança.
 *   3. Escrita sempre por `updateTenantSettings` (merge raso), nunca direto na
 *      tabela: assim o TenantContext atualiza e a UI reage na hora.
 *   4. Quem pode escrever é decidido por capability (`store.admin`), não por
 *      comparação de role solta.
 *
 * Os limites são digitados em HORAS. A regra que os consome vive em
 * `src/components/conversations/slaLevels.ts`.
 */

/** Campos na ordem em que aparecem — e na ordem em que precisam crescer. */
const THRESHOLD_FIELDS: ReadonlyArray<{
  key: keyof SlaThresholds;
  label: string;
  dotClass: string;
}> = [
  { key: 'atencao', label: 'Atenção (amarelo)', dotClass: SLA_LEVEL_META.atencao.dotClass },
  { key: 'atrasada', label: 'Atrasada (laranja)', dotClass: SLA_LEVEL_META.atrasada.dotClass },
  { key: 'critica', label: 'Crítica (vermelho)', dotClass: SLA_LEVEL_META.critica.dotClass },
];

export const AttendanceSettings = () => {
  const { tenant, updateTenantSettings } = useTenant();
  const { enabled: savedEnabled, thresholds: savedThresholds, isLoading } = useSlaConfig();
  // Gerente e Gestor administram a Loja; Atendente enxerga, mas não altera.
  const canEdit = useCan('store.admin');

  const [enabled, setEnabled] = useState(savedEnabled);
  // Texto, não número: o input precisa aceitar campo vazio enquanto se digita.
  const [draft, setDraft] = useState<Record<keyof SlaThresholds, string>>({
    atencao: String(savedThresholds.atencao),
    atrasada: String(savedThresholds.atrasada),
    critica: String(savedThresholds.critica),
  });
  const [isSaving, setIsSaving] = useState(false);

  // O tenant chega depois do primeiro render (TenantContext carrega async).
  useEffect(() => {
    setEnabled(savedEnabled);
    setDraft({
      atencao: String(savedThresholds.atencao),
      atrasada: String(savedThresholds.atrasada),
      critica: String(savedThresholds.critica),
    });
  }, [savedEnabled, savedThresholds]);

  const parsed = useMemo<SlaThresholds>(
    () => ({
      atencao: Number(draft.atencao),
      atrasada: Number(draft.atrasada),
      critica: Number(draft.critica),
    }),
    [draft],
  );

  // Só valida o que vai ser salvo: com a sinalização desligada os limites não
  // são usados e não devem travar o botão.
  const errors = useMemo(
    () => (enabled ? validateSlaThresholds(parsed) : {}),
    [enabled, parsed],
  );
  const hasErrors = Object.keys(errors).length > 0;

  const isDirty =
    enabled !== savedEnabled ||
    (enabled &&
      (parsed.atencao !== savedThresholds.atencao ||
        parsed.atrasada !== savedThresholds.atrasada ||
        parsed.critica !== savedThresholds.critica));

  const setField = (key: keyof SlaThresholds) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (hasErrors || !canEdit) return;
    setIsSaving(true);
    try {
      await updateTenantSettings(
        {
          sla: {
            enabled,
            // Normaliza antes de gravar para o JSONB nunca receber NaN.
            thresholds: normalizeSlaThresholds(parsed),
          },
        },
        // O retorno é dado aqui, com o texto desta tela.
        { silent: true },
      );
      toast.success('Configurações de atendimento salvas.');
    } catch (error) {
      const detalhe = error instanceof Error ? error.message : 'tente novamente.';
      toast.error(`Não foi possível salvar as configurações: ${detalhe}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sinalização de conversas não respondidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // Superadmin sem Loja escolhida no seletor de Conta cai aqui: a configuração é
  // por Loja, então não há o que salvar. Melhor dizer isso do que oferecer um
  // formulário que só vai falhar no Salvar.
  if (!tenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sinalização de conversas não respondidas</CardTitle>
          <CardDescription>
            Marque visualmente as conversas que estão há muito tempo sem resposta da sua equipe.
          </CardDescription>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sinalização de conversas não respondidas</CardTitle>
        <CardDescription>
          Marque visualmente as conversas que estão há muito tempo sem resposta da sua equipe.
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
            <Label htmlFor="sla-enabled">Ativar sinalização</Label>
            <p className="text-sm text-muted-foreground">
              Mostra na lista de conversas há quanto tempo cada cliente espera resposta.
            </p>
          </div>
          <Switch
            id="sla-enabled"
            checked={enabled}
            disabled={!canEdit}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* A regra de transferência automática (aba Escala/Transferência) mede
            outra coisa; a frase existe para as duas não parecerem a mesma. */}
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Isto só colore a lista: conta horas corridas desde a última mensagem do cliente e não
            move a conversa. Para transferir automaticamente quem não responde, use
            &quot;Transferência por tempo sem resposta&quot; na aba Escala/Transferência. Lá a conta
            é em minutos de funcionamento, desde o início da espera.
          </p>
        </div>

        {/* Desligada, os limites não existem na tela — não ficam esmaecidos. */}
        {enabled && (
          <>
            <Separator />

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A partir de quantas horas de espera cada nível aparece:
              </p>

              {THRESHOLD_FIELDS.map(({ key, label, dotClass }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`sla-${key}`} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
                    {label}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`sla-${key}`}
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={draft[key]}
                      disabled={!canEdit}
                      onChange={(e) => setField(key)(e.target.value)}
                      aria-invalid={!!errors[key]}
                      aria-describedby={errors[key] ? `sla-${key}-erro` : undefined}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground">horas</span>
                  </div>
                  {errors[key] && (
                    <p id={`sla-${key}-erro`} className="text-sm text-destructive">
                      {errors[key]}
                    </p>
                  )}
                  {key === 'critica' && (
                    <div className="flex items-start gap-2 pt-1">
                      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        O WhatsApp permite mensagens livres por {WHATSAPP_SERVICE_WINDOW_HOURS}h após
                        a última mensagem do cliente. Recomendamos {DEFAULT_SLA_THRESHOLDS.critica}h
                        para dar margem de ação antes do prazo expirar.
                      </p>
                    </div>
                  )}
                </div>
              ))}
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
              <Button onClick={handleSave} disabled={!isDirty || hasErrors || isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar alterações
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

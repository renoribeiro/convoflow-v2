import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertTriangle, Info, Loader2, Lock, Save, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant, useCan } from '@/contexts/TenantContext';
import {
  useConversationRotation,
  useIneligibleOwners,
  useRotationSettings,
  useSaveConversationRotation,
} from '@/hooks/useConversationRotation';
import { memberDisplayName } from '@/hooks/useTeamDirectory';
import {
  ROTATION_MIN_ATENDENTES,
  ROTATION_TIMING_LABELS,
  ROTATION_TIMING_VALUES,
  ineligibleReasonLabel,
  isRotationTiming,
  rebalanceEvenly,
  validatePercentages,
  type PercentMap,
  type RotationMember,
  type RotationTiming,
} from '@/lib/conversations/rotation';

/**
 * Configurações › Escala/Transferência — "Como as conversas novas são
 * distribuídas" (migração 20260915000001).
 *
 * Três chaves em `tenants.settings` (rotation_enabled, rotation_includes_gestor,
 * rotation_timing) gravadas por `updateTenantSettings`, e as porcentagens
 * gravadas SÓ pela RPC `set_conversation_rotation` — tudo ou nada, nunca um
 * patch parcial: o objeto enviado cobre todo mundo que está na lista.
 *
 * Regras da tela:
 *   - a seção só aparece com 2+ atendentes ativos; abaixo disso, UMA linha
 *     explica por quê (a Loja não tem com quem dividir);
 *   - a soma tem de dar 100 para salvar; a tela mostra o que falta ou sobra e
 *     NÃO corrige o que o gestor digitou — o único ajuste automático acontece
 *     quando alguém entra ou sai da Loja, e é o banco quem faz;
 *   - 0 % é permitido e aparece marcado como "fora do rodízio" — a pessoa
 *     continua na Loja e com as conversas que já tem;
 *   - trocar a chave do gestor muda QUEM está na lista, então nesse caso a
 *     tela salva só as chaves; o banco divide igual e a lista se refaz.
 */

const TITLE = 'Distribuição de conversas novas';

const ROLE_LABEL: Record<string, string> = {
  atendente: 'Atendente',
  gestor: 'Gestor',
  gerente: 'Gerente',
};

const percentsOf = (members: ReadonlyArray<RotationMember>): PercentMap =>
  Object.fromEntries(members.map((m) => [m.profile_id, m.percent]));

const samePercents = (a: PercentMap, b: PercentMap): boolean => {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => k in b && a[k] === b[k]);
};

export const RotationSettings = () => {
  const { tenant, updateTenantSettings } = useTenant();
  const canEdit = useCan('store.admin');
  const saved = useRotationSettings();
  const rotation = useConversationRotation();
  const ineligible = useIneligibleOwners();
  const save = useSaveConversationRotation();

  const members = useMemo(() => rotation.data ?? [], [rotation.data]);
  const savedPercents = useMemo(() => percentsOf(members), [members]);
  const atendentesAtivos = useMemo(() => members.filter((m) => m.role === 'atendente').length, [members]);
  const hasEnough = atendentesAtivos >= ROTATION_MIN_ATENDENTES;

  const [enabled, setEnabled] = useState(saved.rotation_enabled);
  const [includesGestor, setIncludesGestor] = useState(saved.rotation_includes_gestor);
  const [timing, setTiming] = useState<RotationTiming>(saved.rotation_timing);
  const [draft, setDraft] = useState<PercentMap>(savedPercents);
  const [isSaving, setIsSaving] = useState(false);

  // O tenant e a lista chegam depois do primeiro render.
  useEffect(() => {
    setEnabled(saved.rotation_enabled);
    setIncludesGestor(saved.rotation_includes_gestor);
    setTiming(saved.rotation_timing);
  }, [saved.rotation_enabled, saved.rotation_includes_gestor, saved.rotation_timing]);
  useEffect(() => {
    setDraft(savedPercents);
  }, [savedPercents]);

  const settingsDirty =
    enabled !== saved.rotation_enabled ||
    includesGestor !== saved.rotation_includes_gestor ||
    timing !== saved.rotation_timing;
  const gestorKeyDirty = includesGestor !== saved.rotation_includes_gestor;
  const percentsDirty = !samePercents(draft, savedPercents);
  const validation = validatePercentages(draft);
  // Com a chave do gestor mudando, a lista vai mudar: as porcentagens não vão
  // junto (o banco divide igual) — então não bloqueiam o salvar.
  const percentsBlockSave = percentsDirty && !gestorKeyDirty && !validation.ok;
  const isDirty = settingsDirty || (percentsDirty && !gestorKeyDirty);
  const canSave = canEdit && isDirty && !percentsBlockSave && !isSaving;

  const setPercent = (profileId: string, raw: string) => {
    // Campo vazio = 0 enquanto digita; o resto é o número como está, sem arredondar.
    const value = raw.trim() === '' ? 0 : Number(raw);
    setDraft((prev) => ({ ...prev, [profileId]: Number.isFinite(value) ? value : (prev[profileId] ?? 0) }));
  };

  const handleSplitEvenly = () => {
    // Todo mundo como "recém-chegado": divisão igual entre todos, 0 % incluídos.
    setDraft(
      rebalanceEvenly(
        members.map((m) => ({ profile_id: m.profile_id, percent: draft[m.profile_id] ?? 0 })),
        new Set(members.map((m) => m.profile_id)),
      ),
    );
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      // Porcentagens primeiro: é o que o servidor pode recusar (22023). Se
      // recusar, as chaves não mudam e o gestor corrige com a tela intacta.
      if (percentsDirty && !gestorKeyDirty) {
        await save.mutateAsync(draft);
      }
      if (settingsDirty) {
        await updateTenantSettings(
          {
            rotation_enabled: enabled,
            rotation_includes_gestor: includesGestor,
            rotation_timing: timing,
          },
          { silent: true },
        );
      }
      if (gestorKeyDirty) {
        toast.success(
          includesGestor
            ? 'O gestor entrou no rodízio. As porcentagens foram divididas igualmente. Ajuste se quiser.'
            : 'O gestor saiu do rodízio. As porcentagens foram divididas entre os atendentes. Ajuste se quiser.',
        );
        await rotation.refetch();
      } else {
        toast.success('Distribuição de conversas salva.');
      }
    } catch (error) {
      // PostgrestError não é Error: a frase em pt-BR do banco (22023) vem em .message.
      const detalhe =
        (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : null) ?? 'tente novamente.';
      toast.error(`Não foi possível salvar a distribuição: ${detalhe}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (saved.isLoading || (rotation.isLoading && !rotation.data)) {
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
          <CardDescription>Como as conversas novas da Loja são divididas entre a equipe.</CardDescription>
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

  // Atendente: a RPC devolve vazio para ele. Nada a configurar, nada a ler.
  if (!ineligible.canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{TITLE}</CardTitle>
          <CardDescription>Como as conversas novas da Loja são divididas entre a equipe.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Apenas Gerente ou Gestor configura a distribuição. Se a sua Loja usa o rodízio, as
              conversas novas chegam já com você como responsável, sem aviso no sino.
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
          Com o rodízio ligado, cada conversa nova ganha um responsável sozinha, na proporção que
          você definir. Quem já tem responsável nunca é trocado: o cliente que volta cai com quem
          já o atendia.
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

        {/* Responsáveis indisponíveis — o gestor precisa saber que essas conversas existem. */}
        {ineligible.total > 0 && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-950/30"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {ineligible.total === 1
                  ? '1 conversa está com um responsável indisponível.'
                  : `${ineligible.total} conversas estão com responsável indisponível.`}
              </p>
              <p className="text-muted-foreground">
                {ineligible.owners
                  .map((o) => `${memberDisplayName(o)} (${ineligibleReasonLabel(o.reason)}): ${o.n_conversations}`)
                  .join(' · ')}
                . Elas continuam com essa pessoa até você mover, à mão, em{' '}
                <Link
                  to="/dashboard/conversations?quick=responsavel-indisponivel"
                  className="underline underline-offset-2"
                >
                  Conversas › Responsável indisponível
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        {!hasEnough ? (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              O rodízio aparece quando a Loja tem pelo menos {ROTATION_MIN_ATENDENTES} atendentes
              ativos. Hoje ela tem {atendentesAtivos}. Com um só, toda conversa nova é dele de
              qualquer jeito; convide o segundo em Equipe.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="rotation-enabled">Distribuir conversas novas automaticamente</Label>
                <p className="text-sm text-muted-foreground">
                  Desligado, nada muda: as conversas novas chegam sem responsável e o time assume à
                  mão, como hoje.
                </p>
              </div>
              <Switch
                id="rotation-enabled"
                checked={enabled}
                disabled={!canEdit}
                onCheckedChange={setEnabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="rotation-includes-gestor">Gestor também recebe conversas</Label>
                <p className="text-sm text-muted-foreground">
                  Ligado, o Gestor entra na lista abaixo com a própria fatia. Desligado, só os
                  atendentes recebem.
                </p>
              </div>
              <Switch
                id="rotation-includes-gestor"
                checked={includesGestor}
                disabled={!canEdit}
                onCheckedChange={setIncludesGestor}
              />
            </div>

            <div className="space-y-3">
              <Label id="rotation-timing-label">Quando a conversa ganha responsável</Label>
              <RadioGroup
                aria-labelledby="rotation-timing-label"
                value={timing}
                onValueChange={(value) => {
                  if (isRotationTiming(value)) setTiming(value);
                }}
                disabled={!canEdit}
                className="space-y-2"
              >
                {ROTATION_TIMING_VALUES.map((value) => {
                  const meta = ROTATION_TIMING_LABELS[value];
                  const id = `rotation-timing-${value}`;
                  return (
                    <div key={value} className="flex items-start gap-3 rounded-md border border-border p-3">
                      <RadioGroupItem value={value} id={id} className="mt-0.5" />
                      <div className="space-y-0.5">
                        <Label htmlFor={id} className="cursor-pointer font-medium">
                          {meta.title}
                        </Label>
                        <p className="text-sm text-muted-foreground">{meta.explanation}</p>
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Fatia de cada pessoa</Label>
                  <p className="text-sm text-muted-foreground">
                    A soma precisa dar 100. Coloque 0 para tirar alguém do rodízio sem tirar da
                    Loja: a pessoa continua com as conversas que já tem.
                  </p>
                </div>
                {canEdit && (
                  <Button type="button" variant="outline" size="sm" onClick={handleSplitEvenly} disabled={gestorKeyDirty}>
                    <Scale className="mr-2 h-4 w-4" />
                    Dividir igualmente
                  </Button>
                )}
              </div>

              {gestorKeyDirty && (
                <p className="text-xs text-muted-foreground" role="note">
                  Você mudou quem participa. Salve primeiro: a lista se refaz com divisão igual e aí
                  você ajusta as fatias.
                </p>
              )}

              <ul className="divide-y divide-border rounded-md border border-border" aria-label="Fatia de cada pessoa">
                {members.map((member) => {
                  const value = draft[member.profile_id] ?? 0;
                  const inputId = `rotation-percent-${member.profile_id}`;
                  return (
                    <li key={member.profile_id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0 space-y-0.5">
                        <Label htmlFor={inputId} className="block truncate font-medium">
                          {memberDisplayName(member)}
                        </Label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">{ROLE_LABEL[member.role] ?? member.role}</Badge>
                          {value === 0 && <Badge variant="outline">Fora do rodízio (0 %)</Badge>}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1.5">
                        <Input
                          id={inputId}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={100}
                          step={1}
                          value={value}
                          disabled={!canEdit || gestorKeyDirty}
                          onChange={(event) => setPercent(member.profile_id, event.target.value)}
                          className="w-20 text-right"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <p
                className={
                  validation.ok ? 'text-sm text-muted-foreground' : 'text-sm font-medium text-destructive'
                }
                role="status"
              >
                {validation.ok && 'Soma: 100 %.'}
                {!validation.ok && validation.reason === 'sum' && validation.missing > 0 &&
                  `Soma: ${validation.sum} %. Faltam ${validation.missing} para chegar a 100.`}
                {!validation.ok && validation.reason === 'sum' && validation.excess > 0 &&
                  `Soma: ${validation.sum} %. Passou ${validation.excess} de 100.`}
                {!validation.ok && validation.reason === 'invalid' &&
                  'Use números inteiros entre 0 e 100.'}
              </p>
            </div>
          </>
        )}

        {canEdit && hasEnough && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {isDirty ? 'Você tem alterações não salvas.' : 'Tudo salvo.'}
              </p>
              <Button onClick={handleSave} disabled={!canSave}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar distribuição
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

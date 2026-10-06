import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Info, Loader2, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant, useCan } from '@/contexts/TenantContext';
import {
  ATENDENTE_VISIBILITY_LABELS,
  ATENDENTE_VISIBILITY_VALUES,
  LOJA_WIDE_HINT,
  isAtendenteVisibility,
  useConversationVisibilityConfig,
  type AtendenteVisibility,
} from '@/hooks/useConversationVisibilityConfig';

/**
 * Configurações › Escala/Transferência — o que um ATENDENTE da Loja enxerga na
 * caixa de entrada e se ele pode transferir conversa.
 *
 * Mesmo padrão do AttendanceSettings:
 *   1. Estado local espelha `tenants.settings.{atendente_visibility,
 *      atendente_can_transfer}`, com defaults explícitos ('all' / true).
 *   2. Nada é salvo antes de "Salvar alterações" (desabilitado sem mudança).
 *   3. Escrita por `updateTenantSettings` (merge raso via set_tenant_settings),
 *      nunca direto na tabela.
 *   4. Quem escreve é decidido por capability (`store.admin`).
 *
 * As duas preferências valem SÓ para o cargo atendente. Quem faz valer é o
 * banco (policy de SELECT de conversations/messages e o trigger de
 * transferência); esta tela só grava a preferência e explica o efeito.
 */

const TITLE = 'Escala e transferência de conversas';

export const VisibilitySettings = () => {
  const { tenant, updateTenantSettings } = useTenant();
  const {
    atendente_visibility: savedVisibility,
    atendente_can_transfer: savedCanTransfer,
    isLoading,
  } = useConversationVisibilityConfig();
  // Gerente e Gestor administram a Loja; Atendente enxerga, mas não altera.
  const canEdit = useCan('store.admin');

  const [visibility, setVisibility] = useState<AtendenteVisibility>(savedVisibility);
  const [canTransfer, setCanTransfer] = useState<boolean>(savedCanTransfer);
  const [isSaving, setIsSaving] = useState(false);

  // O tenant chega depois do primeiro render (TenantContext carrega async).
  useEffect(() => {
    setVisibility(savedVisibility);
    setCanTransfer(savedCanTransfer);
  }, [savedVisibility, savedCanTransfer]);

  const isDirty = visibility !== savedVisibility || canTransfer !== savedCanTransfer;

  const handleSave = async () => {
    if (!canEdit || !isDirty) return;
    setIsSaving(true);
    try {
      await updateTenantSettings(
        { atendente_visibility: visibility, atendente_can_transfer: canTransfer },
        { silent: true },
      );
      toast.success('Configurações de escala salvas.');
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

  // Superadmin sem Loja escolhida no seletor de Conta: a configuração é por
  // Loja, então não há o que salvar.
  if (!tenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{TITLE}</CardTitle>
          <CardDescription>
            Defina o que cada atendente vê na caixa de entrada e se ele pode passar conversas adiante.
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
        <CardTitle>{TITLE}</CardTitle>
        <CardDescription>
          Defina o que cada atendente vê na caixa de entrada e se ele pode passar conversas adiante.
          Gestor e Gerente sempre veem tudo.
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

        <div className="space-y-3">
          <Label id="visibility-label">O atendente vê</Label>
          <RadioGroup
            aria-labelledby="visibility-label"
            value={visibility}
            onValueChange={(value) => {
              if (isAtendenteVisibility(value)) setVisibility(value);
            }}
            disabled={!canEdit}
            className="space-y-2"
          >
            {ATENDENTE_VISIBILITY_VALUES.map((value) => {
              const meta = ATENDENTE_VISIBILITY_LABELS[value];
              const id = `visibility-${value}`;
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
          <div className="flex items-start gap-2 pt-1">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Quem já respondeu numa conversa continua vendo-a mesmo depois de transferida, em qualquer
              opção. Os números do Dashboard continuam sendo da Loja inteira; para o atendente eles
              aparecem com a etiqueta &quot;Toda a Loja&quot;: {LOJA_WIDE_HINT}
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="can-transfer">Atendente pode transferir conversas</Label>
            <p className="text-sm text-muted-foreground">
              Desligado, o atendente ainda assume conversas sem responsável, mas só Gestor ou Gerente
              passam uma conversa para outra pessoa. A regra vale também no servidor, não só no botão.
            </p>
          </div>
          <Switch
            id="can-transfer"
            checked={canTransfer}
            disabled={!canEdit}
            onCheckedChange={setCanTransfer}
          />
        </div>

        {canEdit && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {isDirty ? 'Você tem alterações não salvas.' : 'Tudo salvo.'}
              </p>
              <Button onClick={handleSave} disabled={!isDirty || isSaving}>
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

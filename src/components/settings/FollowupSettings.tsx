import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Info, Loader2, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant, useCan } from '@/contexts/TenantContext';
import { useFollowupReplyConfig } from '@/hooks/useFollowupReplyConfig';

/**
 * Preferências de FOLLOW-UP da Loja — o que a resposta de um cliente cancela.
 *
 * Segue o padrão estabelecido por `AttendanceSettings`:
 *   1. Estado local espelha `tenants.settings.<chave>`, com defaults explícitos.
 *   2. Nada é salvo enquanto o usuário não confirmar — um único "Salvar
 *      alterações", desabilitado quando não há mudança.
 *   3. Escrita sempre por `updateTenantSettings` (merge raso), nunca direto na
 *      tabela: `public.tenants` não tem policy de UPDATE para gerente/gestor.
 *   4. Quem pode escrever é decidido por capability (`store.admin`).
 *
 * Quem lê isto em produção é `supabase/functions/_shared/followup-reply.ts`, no
 * momento em que a mensagem do cliente chega no webhook.
 *
 * A terceira trava do mesmo assunto — "parar a cadência quando o cliente
 * responder" — NÃO mora aqui: ela é por sequência (`stop_on_reply`) e fica no
 * editor de sequências, em Follow-ups › Sequências. O texto abaixo diz isso,
 * senão a pessoa procura o interruptor errado.
 */
export const FollowupSettings = () => {
  const { tenant, updateTenantSettings } = useTenant();
  const {
    cancel_scheduled_on_reply: savedScheduled,
    cancel_manual_on_reply: savedManual,
    isLoading,
  } = useFollowupReplyConfig();
  // Gerente e Gestor administram a Loja; Atendente enxerga, mas não altera.
  const canEdit = useCan('store.admin');

  const [cancelScheduled, setCancelScheduled] = useState(savedScheduled);
  const [cancelManual, setCancelManual] = useState(savedManual);
  const [isSaving, setIsSaving] = useState(false);

  // O tenant chega depois do primeiro render (TenantContext carrega async).
  useEffect(() => {
    setCancelScheduled(savedScheduled);
    setCancelManual(savedManual);
  }, [savedScheduled, savedManual]);

  const isDirty = cancelScheduled !== savedScheduled || cancelManual !== savedManual;

  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    try {
      await updateTenantSettings(
        {
          followups: {
            cancel_scheduled_on_reply: cancelScheduled,
            cancel_manual_on_reply: cancelManual,
          },
        },
        // O retorno é dado aqui, com o texto desta tela.
        { silent: true },
      );
      toast.success('Configurações de follow-up salvas.');
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
          <CardTitle>Quando o cliente responde</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // Superadmin sem Loja escolhida no seletor de Conta cai aqui: a configuração é
  // por Loja, então não há o que salvar.
  if (!tenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quando o cliente responde</CardTitle>
          <CardDescription>
            Decida o que o sistema cancela sozinho assim que o cliente responde no WhatsApp.
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
        <CardTitle>Quando o cliente responde</CardTitle>
        <CardDescription>
          Decida o que o sistema cancela sozinho assim que o cliente responde no WhatsApp.
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

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 pr-2">
            <Label htmlFor="followup-cancel-scheduled">
              Cancelar mensagens agendadas quando o cliente responder
            </Label>
            <p className="text-sm text-muted-foreground">
              Mensagens que estavam marcadas para sair depois não saem mais. Sem isto, o cliente
              responde hoje e ainda recebe amanhã a cobrança automática que já não faz sentido.
              Parece que ninguém leu o que ele escreveu.
            </p>
          </div>
          <Switch
            id="followup-cancel-scheduled"
            checked={cancelScheduled}
            disabled={!canEdit}
            onCheckedChange={setCancelScheduled}
          />
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 pr-2">
            <Label htmlFor="followup-cancel-manual">
              Cancelar tarefas manuais quando o cliente responder
            </Label>
            <p className="text-sm text-muted-foreground">
              Tarefa manual é um lembrete que alguém do time criou para si mesmo: "ligar na
              quinta", "levar a proposta". Ligando isto, a resposta do cliente apaga esses
              lembretes sozinha, e o plano que a pessoa tinha feito desaparece da lista dela sem
              aviso. Deixe desligado se você prefere que quem criou a tarefa decida o que fazer
              depois de ler a resposta.
            </p>
          </div>
          <Switch
            id="followup-cancel-manual"
            checked={cancelManual}
            disabled={!canEdit}
            onCheckedChange={setCancelManual}
          />
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Sequências têm a trava delas: cada sequência escolhe se para ao receber resposta, em
            Follow-ups › Sequências. Uma tarefa que fazia parte de uma sequência interrompida é
            encerrada junto, sem depender das opções acima: ela não tinha mais cadência a que
            servir.
          </p>
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

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import { useSetStoreExtraAttendants, useStoreAttendantSeats } from '@/hooks/useStoreAttendantSeats';
import { isStoreFull, pendingInvitesLabel, type StoreSeats } from '@/lib/users/attendantSeats';
import {
  centsToReaisInput,
  formatCents,
  parseReaisToCents,
  type AttendantStatusInfo,
} from '@/lib/billing/adminBilling';
import { stripeService } from '@/services/stripeService';

interface AttendantSeatsDialogProps {
  /** A Conta aberta; null fecha a janela. */
  conta: { id: string; name: string | null } | null;
  onOpenChange: (open: boolean) => void;
}

export const AVISO_30_DIAS =
  'Esta Conta já paga atendentes extras. Pelos Termos de Uso (cláusula 4.1), preço novo só vale depois de 30 dias de aviso ao cliente: avise antes e só então salve. O preço novo entra no próximo ciclo da assinatura, sem cobrança proporcional.';

export const CONFIRMA_30_DIAS =
  'Você avisou o cliente há pelo menos 30 dias? O preço novo entra no próximo ciclo da assinatura.';

/** O que a janela diz sobre a cobrança, a partir de attendant_status. */
export function billingSummary(s: AttendantStatusInfo): string {
  if (!s.configured) {
    return 'A cobrança de atendentes extras ainda não está ligada (falta o produto "Atendente extra" no servidor). As vagas extras valem, mas nada é cobrado.';
  }
  switch (s.subscription.state) {
    case 'none':
      return 'Conta sem assinatura (acesso manual): as vagas extras valem sem cobrança. Se ela assinar, o checkout já inclui os atendentes extras, ao preço definido aqui.';
    case 'legacy':
      return 'A assinatura desta Conta está na conta antiga do Stripe: nada é cobrado nem mudado por aqui.';
    case 'ended':
      return 'Assinatura encerrada: nada é cobrado agora. Se a Conta assinar de novo, o checkout já inclui os atendentes extras.';
    case 'past_due':
      return 'Pagamento pendente: a cobrança dos atendentes extras não muda até o pagamento ser regularizado.';
    case 'live': {
      const n = s.item?.quantity ?? 0;
      const base =
        n > 0
          ? `Na assinatura: ${n} atendente(s) extra(s) a ${formatCents(s.item?.unitAmount ?? null)}/mês cada.`
          : 'Na assinatura: nenhum atendente extra.';
      const teste = s.subscription.status === 'trialing' ? ' Em teste grátis: nada é cobrado até o fim do teste.' : '';
      return `${base}${teste} Vaga extra dada no meio do mês entra proporcional na próxima fatura.`;
    }
  }
}

/** A assinatura viva cobra diferente do concedido nas Lojas. */
export function chargeMismatch(s: AttendantStatusInfo): boolean {
  return s.configured && s.subscription.state === 'live' && (s.item?.quantity ?? 0) !== s.concedidos;
}

/**
 * Faturamento › Contas › Atendentes (superadmin).
 *
 * Em cima, a cobrança da Conta: o preço por atendente extra (um preço por
 * Conta, no produto "Atendente extra" do Stripe), o que a assinatura cobra e o
 * botão de sincronizar. Embaixo, cada Loja com o uso, o limite e as vagas
 * extras editáveis. Salvar as vagas de uma Loja já sincroniza a assinatura
 * (proporcional na próxima fatura; no teste, nada até o fim do teste).
 *
 * Conta sem assinatura (acesso manual): as vagas valem sem cobrança, e a janela
 * diz isso. Trocar o preço de quem já paga exige o aviso de 30 dias dos Termos.
 */
export function AttendantSeatsDialog({ conta, onOpenChange }: AttendantSeatsDialogProps) {
  const open = !!conta;
  const qc = useQueryClient();
  const { seats, isLoading, error } = useStoreAttendantSeats({ tenantId: conta?.id ?? null, enabled: open });
  const salvar = useSetStoreExtraAttendants();
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [nota, setNota] = useState('');
  const [preco, setPreco] = useState('');
  const [ultimo, setUltimo] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['admin-billing', 'atendentes', conta?.id ?? null],
    enabled: open,
    queryFn: () => stripeService.getAttendantStatus(conta!.id),
    retry: false,
  });
  const info = status.data;

  // Conta nova (ou reaberta) → tudo limpo.
  useEffect(() => {
    setRascunho({});
    setNota('');
    setUltimo(null);
  }, [conta?.id]);
  useEffect(() => {
    setPreco(centsToReaisInput(info?.priceCents ?? null));
  }, [info?.priceCents, conta?.id]);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['admin-billing'] });
  };

  const sincronizar = useMutation({
    mutationFn: () => stripeService.syncAttendantItem(conta!.id),
    onSuccess: (r) => {
      setUltimo(r.message);
      if (r.state === 'synced' || r.state === 'no_subscription' || r.state === 'subscription_ended') toast.success(r.message);
      else toast.warning(r.message);
      recarregar();
    },
    onError: (e: Error) => toast.error(`Cobrança não sincronizada: ${e.message}`),
  });

  const gravarPreco = useMutation({
    mutationFn: (cents: number) => stripeService.setAttendantPrice(conta!.id, cents, nota.trim() || undefined),
    onSuccess: (r) => {
      setUltimo(r.sync.message);
      toast.success(r.changed ? `Preço salvo: ${formatCents(r.priceCents)} por atendente extra.` : 'O preço já era este.');
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const centsDigitados = parseReaisToCents(preco);
  const precoMudou = centsDigitados !== null && centsDigitados !== (info?.priceCents ?? null);

  const salvarPreco = () => {
    if (centsDigitados === null || centsDigitados < 100 || centsDigitados > 100000) {
      toast.error('Informe o preço por atendente extra entre R$ 1,00 e R$ 1.000,00 por mês.');
      return;
    }
    if (info?.priceChangeNeedsNotice && !window.confirm(CONFIRMA_30_DIAS)) return;
    gravarPreco.mutate(centsDigitados);
  };

  const valorDe = (s: StoreSeats) => rascunho[s.store_id] ?? String(s.extra);
  const numeroDe = (s: StoreSeats): number | null => {
    const texto = valorDe(s).trim();
    if (!/^\d{1,3}$/.test(texto)) return null;
    const n = Number(texto);
    return n >= 0 && n <= 100 ? n : null;
  };

  const gravar = async (s: StoreSeats) => {
    const extra = numeroDe(s);
    if (extra === null) {
      toast.error('Informe de 0 a 100 vagas extras.');
      return;
    }
    try {
      const r = await salvar.mutateAsync({ storeId: s.store_id, extra, note: nota.trim() || undefined });
      setRascunho((atual) => {
        const { [s.store_id]: _, ...resto } = atual;
        return resto;
      });
      toast.success(
        r?.changed === false
          ? `${s.store_name}: nada mudou.`
          : `${s.store_name} agora tem ${s.incluidos + extra} vagas de atendente.`,
      );
      // A vaga já vale; agora a cobrança acompanha (o servidor decide se há o
      // que cobrar: sem assinatura, nada).
      if (r?.changed !== false) sincronizar.mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar as vagas.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atendentes — {conta?.name ?? 'Conta'}</DialogTitle>
          <DialogDescription>
            Toda Loja tem 2 vagas de atendente. Aqui você dá vagas extras a uma Loja, como combinado com o cliente, e
            define quanto a Conta paga por atendente extra. Ocupam vaga quem está ativo e o convite pendente; suspenso
            não. Não dá para ficar abaixo do que a Loja já usa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ---- A cobrança da Conta ---- */}
          <section className="space-y-3 rounded-md border border-border p-3" aria-label="Cobrança dos atendentes extras">
            {status.isLoading ? (
              <Skeleton className="h-16 w-full rounded-md" />
            ) : status.error ? (
              <p className="text-sm text-destructive">
                Não foi possível ler a cobrança desta Conta: {(status.error as Error).message}
              </p>
            ) : info ? (
              <>
                <p className="text-sm" data-testid="resumo-cobranca">
                  {billingSummary(info)}
                </p>
                {chargeMismatch(info) && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Concedido nas Lojas: {info.concedidos}. Cobrado na assinatura: {info.item?.quantity ?? 0}. Clique em
                      "Sincronizar cobrança".
                    </AlertDescription>
                  </Alert>
                )}
                {info.configured && info.concedidos > 0 && !info.priceCents && info.subscription.state === 'live' && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Há vagas extras e nenhum preço: defina o preço por atendente extra para a assinatura cobrar.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label htmlFor="preco-atendente">Preço por atendente extra (R$ por mês)</Label>
                    <Input
                      id="preco-atendente"
                      className="w-40"
                      inputMode="decimal"
                      placeholder="Ex.: 49,90"
                      value={preco}
                      disabled={!info.configured}
                      onChange={(e) => setPreco(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={!info.configured || !precoMudou || gravarPreco.isPending}
                    onClick={salvarPreco}
                  >
                    Salvar preço
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!info.configured || sincronizar.isPending}
                    onClick={() => sincronizar.mutate()}
                  >
                    Sincronizar cobrança
                  </Button>
                </div>
                {info.priceChangeNeedsNotice && (
                  <Alert data-testid="aviso-30-dias">
                    <AlertDescription>{AVISO_30_DIAS}</AlertDescription>
                  </Alert>
                )}
                {ultimo && (
                  <p className="text-xs text-muted-foreground" data-testid="ultimo-resultado">
                    {ultimo}
                  </p>
                )}
              </>
            ) : null}
          </section>

          <div>
            <Label htmlFor="vagas-nota">Observação (opcional, vai para o histórico)</Label>
            <Input
              id="vagas-nota"
              value={nota}
              maxLength={500}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ex.: combinado por e-mail em 10/10"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Não foi possível ler as vagas desta Conta. Tente reabrir.</p>
          ) : (
            <ResponsiveTable
              ariaLabel="Vagas de atendente por Loja"
              rows={seats}
              rowKey={(s) => s.store_id}
              empty="Esta Conta ainda não tem Lojas."
              columns={[
                { key: 'loja', header: 'Loja', card: 'title', cellClassName: 'font-medium', cell: (s) => s.store_name },
                {
                  key: 'uso',
                  header: 'Em uso',
                  cell: (s) => (
                    <span className="flex flex-wrap items-center gap-2">
                      <span data-testid={`uso-${s.store_id}`}>
                        {s.usados} de {s.limite}
                      </span>
                      {pendingInvitesLabel(s) && (
                        <span className="text-xs text-muted-foreground">({pendingInvitesLabel(s)})</span>
                      )}
                      {isStoreFull(s) && <Badge variant="secondary">Cheia</Badge>}
                    </span>
                  ),
                },
                { key: 'incluidas', header: 'Incluídas', cell: (s) => s.incluidos },
                {
                  key: 'extras',
                  header: 'Extras',
                  cell: (s) => {
                    const mudou = valorDe(s) !== String(s.extra);
                    return (
                      <span className="flex items-center gap-2">
                        <Input
                          aria-label={`Vagas extras de ${s.store_name}`}
                          className="h-8 w-20"
                          inputMode="numeric"
                          value={valorDe(s)}
                          onChange={(e) =>
                            setRascunho((atual) => ({ ...atual, [s.store_id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          variant={mudou ? 'default' : 'outline'}
                          disabled={!mudou || salvar.isPending}
                          onClick={() => gravar(s)}
                        >
                          Salvar
                        </Button>
                      </span>
                    );
                  },
                },
              ]}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

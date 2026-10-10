import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import { useSetStoreExtraAttendants, useStoreAttendantSeats } from '@/hooks/useStoreAttendantSeats';
import { isStoreFull, pendingInvitesLabel, type StoreSeats } from '@/lib/users/attendantSeats';

interface AttendantSeatsDialogProps {
  /** A Conta aberta; null fecha a janela. */
  conta: { id: string; name: string | null } | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Faturamento › Contas › Atendentes (superadmin).
 *
 * Cada Loja da Conta com as vagas de atendente em uso e o limite, e o número
 * de vagas EXTRAS editável. Toda Loja tem 2 incluídas; as extras são o que foi
 * combinado com o cliente. Grava pela RPC set_store_extra_attendants, que
 * recusa ficar abaixo do uso e registra o histórico.
 *
 * Entrega 1: nada aqui é cobrado e não há preço na tela. A cobrança pelo
 * Stripe é a entrega 2.
 */
export function AttendantSeatsDialog({ conta, onOpenChange }: AttendantSeatsDialogProps) {
  const open = !!conta;
  const { seats, isLoading, error } = useStoreAttendantSeats({ tenantId: conta?.id ?? null, enabled: open });
  const salvar = useSetStoreExtraAttendants();
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [nota, setNota] = useState('');

  // Conta nova (ou reaberta) → rascunho limpo.
  useEffect(() => {
    setRascunho({});
    setNota('');
  }, [conta?.id]);

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar as vagas.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atendentes — {conta?.name ?? 'Conta'}</DialogTitle>
          <DialogDescription>
            Toda Loja tem 2 vagas de atendente. Aqui você dá vagas extras a uma Loja, como combinado com o cliente.
            Ocupam vaga quem está ativo e o convite pendente; suspenso não. Não dá para ficar abaixo do que a Loja já
            usa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

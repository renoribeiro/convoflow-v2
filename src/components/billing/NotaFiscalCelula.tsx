import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useToast } from '@/hooks/use-toast';
import { QUERY_KEYS } from '@/lib/queryClient';
import { chamarNfseAdmin } from '@/lib/billing/nfseAdmin';
import {
  escolherNota,
  NOTA_STATUS_LABEL,
  STATUS_REEMITIVEIS,
  rotuloDaNota,
  type Cobranca,
  type NotaStatus,
} from '@/lib/billing/cobrancas';

const COR_DO_STATUS: Partial<Record<NotaStatus, string>> = {
  emitida: 'border-green-300 bg-green-100 text-green-800',
  cancelada: 'border-muted-foreground/30 text-muted-foreground',
  erro: 'border-red-300 bg-red-50 text-red-800',
  certificado_vencido: 'border-red-300 bg-red-50 text-red-800',
  cancelar_manual: 'border-amber-300 bg-amber-50 text-amber-900',
  aguardando_prefeitura: 'border-amber-300 bg-amber-50 text-amber-900',
};

/**
 * Célula "Nota fiscal" das duas listas de cobrança. Superadmin vê tudo e age;
 * o Gerente só baixa PDF e XML da nota emitida (ou cancelada).
 */
export function NotaFiscalCelula({ cobranca, ehSuperadmin }: { cobranca: Cobranca; ehSuperadmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const nota = escolherNota(cobranca.notas, ehSuperadmin);
  const status = nota?.status ?? cobranca.nota_status;

  const invalidar = () => queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.BILLING_CHARGES] });
  const falhou = (e: unknown) =>
    toast({ title: 'Não deu certo', description: e instanceof Error ? e.message : 'Tente de novo.', variant: 'destructive' });

  const baixar = useMutation({
    mutationFn: async (tipo: 'pdf' | 'xml') => {
      const r = await chamarNfseAdmin<{ url: string }>({ acao: 'baixar', nota_id: nota!.id, tipo });
      // O link vem como download (Content-Disposition). Clique num <a> em vez de
      // window.open: depois de um await, o navegador barra janela nova como pop-up.
      const a = document.createElement('a');
      a.href = r.url;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    onError: falhou,
  });
  const reemitir = useMutation({
    mutationFn: () => chamarNfseAdmin<{ ok: boolean; nota_status: string }>({ acao: 'reemitir', charge_id: cobranca.id }),
    onSuccess: (r) => {
      toast({ title: 'Emissão pedida', description: `Situação da nota: ${rotuloDaNota(r.nota_status)}.` });
      invalidar();
    },
    onError: falhou,
  });
  const cancelar = useMutation({
    mutationFn: () => chamarNfseAdmin<{ ok: boolean; nota_status: string }>({ acao: 'cancelar', nota_id: nota!.id }),
    onSuccess: (r) => {
      toast({
        title: r.nota_status === 'cancelar_manual' ? 'Cancele à mão no portal' : 'Nota cancelada',
        description:
          r.nota_status === 'cancelar_manual'
            ? 'O prazo do cancelamento automático passou: faça o cancelamento direto no portal da Prefeitura.'
            : 'A nota foi cancelada com o motivo "Serviço não prestado".',
      });
      invalidar();
    },
    onError: falhou,
  });

  const rotulo = NOTA_STATUS_LABEL[status as NotaStatus];
  if (!rotulo) return <span>—</span>;

  const temArquivo = !!nota && (status === 'emitida' || status === 'cancelada');
  const podeBaixar = temArquivo && (ehSuperadmin || nota.ambiente === 'producao');
  const podeReemitir = ehSuperadmin && STATUS_REEMITIVEIS.includes(cobranca.nota_status);
  const podeCancelar = ehSuperadmin && !!nota && status === 'emitida';
  const ocupado = baixar.isPending || reemitir.isPending || cancelar.isPending;

  return (
    <div className="flex flex-col items-start gap-1" data-testid="nota-fiscal-celula">
      <span className="flex flex-wrap items-center gap-1">
        <Badge variant="outline" className={COR_DO_STATUS[status as NotaStatus] ?? ''}>
          {rotulo}
        </Badge>
        {ehSuperadmin && nota?.ambiente === 'restrita' ? (
          <Badge variant="secondary" className="text-xs">
            teste
          </Badge>
        ) : null}
      </span>
      {nota?.numero_nfse && (status === 'emitida' || status === 'cancelada') ? (
        <span className="text-xs text-muted-foreground">NFS-e {nota.numero_nfse}</span>
      ) : null}
      {ehSuperadmin && nota?.ultimo_erro_mensagem && status !== 'emitida' ? (
        <span className="max-w-xs text-xs text-red-700">
          {nota.ultimo_erro_codigo ? `${nota.ultimo_erro_codigo}: ` : ''}
          {nota.ultimo_erro_mensagem}
        </span>
      ) : null}
      {podeBaixar || podeReemitir || podeCancelar ? (
        <span className="flex flex-wrap gap-1">
          {podeBaixar ? (
            <>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={ocupado} onClick={() => baixar.mutate('pdf')}>
                <Download className="mr-1 h-3.5 w-3.5" /> PDF
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={ocupado} onClick={() => baixar.mutate('xml')}>
                <Download className="mr-1 h-3.5 w-3.5" /> XML
              </Button>
            </>
          ) : null}
          {podeReemitir ? (
            <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={ocupado} onClick={() => reemitir.mutate()}>
              {reemitir.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Emitir de novo
            </Button>
          ) : null}
          {podeCancelar ? (
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-red-700" disabled={ocupado} onClick={() => setConfirmando(true)}>
              <XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar nota
            </Button>
          ) : null}
        </span>
      ) : null}
      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta nota fiscal?</AlertDialogTitle>
            <AlertDialogDescription>
              O cancelamento usa o motivo fixo "Serviço não prestado". Até o dia 10 do mês seguinte à emissão ele é
              automático; depois disso a nota passa para "Cancelar à mão" e você precisa cancelar no portal da
              Prefeitura.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelar.mutate()}>Cancelar nota</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

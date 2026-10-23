import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { QUERY_KEYS } from '@/lib/queryClient';
import { API_ADDON_PRICE_LABEL, API_ADDON_RELEASED } from '@/lib/api/release';
import {
  API_QUERY_KEYS,
  TEXTO_DESLIGAR,
  TEXTO_LIGAR,
  TEXTO_RELIGAR,
  atualizarApiAddon,
  situacaoDoCartao,
  textoAteFimDoCiclo,
  useApiAddonEstado,
} from '@/lib/api/addon';

interface Props {
  contaId: string;
  /** subscription_status da Conta. */
  status: string | null | undefined;
  /** A Conta tem assinatura (ativa, em teste ou com pagamento pendente). */
  temAssinatura: boolean;
  acessoManual: boolean;
  /** Sobrescreve a chave API_ADDON_RELEASED (testes). */
  liberado?: boolean;
}

type Acao = 'ligar' | 'desligar' | 'religar';

/**
 * Cartão "API e integrações" de Configurações › Assinatura (só Gerente).
 * Sem a chave API_ADDON_RELEASED ligada, não desenha nada nem consulta nada.
 */
export function ApiAddonCard({ contaId, status, temAssinatura, acessoManual, liberado = API_ADDON_RELEASED }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const consulta = useApiAddonEstado(contaId, liberado);
  const [confirmando, setConfirmando] = useState<Acao | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (!liberado) return null;

  const estado = consulta.data ?? null;
  const situacao = situacaoDoCartao({ estado, status, temAssinatura, acessoManual });

  const confirmar = async () => {
    if (!confirmando) return;
    const ligar = confirmando !== 'desligar';
    setOcupado(true);
    try {
      const r = await atualizarApiAddon(ligar);
      toast({
        title: ligar ? 'API ligada' : 'API desligada',
        description: ligar
          ? r.cobrado
            ? `Entra na próxima fatura só o valor proporcional. Depois, ${API_ADDON_PRICE_LABEL} por mês.`
            : 'Como este mês já está pago, nada é cobrado agora.'
          : 'O valor sai da próxima fatura. As chaves funcionam até o fim do mês já pago.',
      });
      setConfirmando(null);
      await queryClient.invalidateQueries({ queryKey: [API_QUERY_KEYS.ADDON] });
      await queryClient.invalidateQueries({ queryKey: [API_QUERY_KEYS.CHAVES] });
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TENANT] });
    } catch (e) {
      toast({
        title: ligar ? 'Não foi possível ligar a API' : 'Não foi possível desligar a API',
        description: e instanceof Error ? e.message : 'Tente de novo em alguns minutos.',
        variant: 'destructive',
      });
    } finally {
      setOcupado(false);
    }
  };

  const corpo = (() => {
    switch (situacao) {
      case 'teste':
        return {
          texto: 'Disponível depois do teste grátis',
          botao: (
            <Button disabled>Ligar a API por {API_ADDON_PRICE_LABEL}/mês</Button>
          ),
        };
      case 'manual':
        return {
          texto: 'A API desta Conta é liberada pelo ConvoFlow.',
          selo: estado?.ativo ? 'Ligada' : 'Desligada',
          botao: null,
        };
      case 'sem_assinatura':
        return { texto: 'Assine o plano para contratar a API.', botao: null };
      case 'past_due':
        return {
          texto: 'Atualize o cartão antes de contratar a API.',
          botao: <Button disabled>Ligar a API por {API_ADDON_PRICE_LABEL}/mês</Button>,
        };
      case 'ligada':
        return {
          texto: 'Chaves de API e integrações liberadas para esta Conta.',
          selo: 'Ligada',
          botao: (
            <Button variant="outline" onClick={() => setConfirmando('desligar')} disabled={ocupado}>
              Desligar a API
            </Button>
          ),
        };
      case 'ate_fim_do_ciclo':
        return {
          texto: textoAteFimDoCiclo(estado?.ate),
          botao: (
            <Button onClick={() => setConfirmando('religar')} disabled={ocupado}>
              Ligar de novo
            </Button>
          ),
        };
      default:
        return {
          texto: 'Conecte o ConvoFlow a outros sistemas com chaves de API.',
          botao: (
            <Button onClick={() => setConfirmando('ligar')} disabled={ocupado || consulta.isLoading}>
              Ligar a API por {API_ADDON_PRICE_LABEL}/mês
            </Button>
          ),
        };
    }
  })();

  const dialogo =
    confirmando === 'desligar'
      ? { titulo: 'Desligar a API?', texto: TEXTO_DESLIGAR, botao: 'Desligar a API' }
      : confirmando === 'religar'
        ? { titulo: 'Ligar a API de novo?', texto: TEXTO_RELIGAR, botao: 'Ligar de novo' }
        : { titulo: 'Contratar a API e integrações?', texto: TEXTO_LIGAR, botao: `Contratar por ${API_ADDON_PRICE_LABEL}/mês` };

  return (
    <>
      <Card data-testid="cartao-api">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> API e integrações
            </span>
            {corpo.selo ? <Badge variant={corpo.selo === 'Ligada' ? 'default' : 'outline'}>{corpo.selo}</Badge> : null}
          </CardTitle>
          <CardDescription>{API_ADDON_PRICE_LABEL} por mês, por Conta.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground" data-testid="cartao-api-texto">
            {corpo.texto}
          </p>
          {corpo.botao}
        </CardContent>
      </Card>

      <AlertDialog open={confirmando !== null} onOpenChange={(aberto) => (ocupado ? null : !aberto && setConfirmando(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogo.titulo}</AlertDialogTitle>
            <AlertDialogDescription data-testid="api-confirmacao">{dialogo.texto}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Voltar</AlertDialogCancel>
            <Button onClick={confirmar} disabled={ocupado}>
              {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {dialogo.botao}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

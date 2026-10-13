import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';
import { COBRANCA_COLUMNS, type Cobranca } from '@/lib/billing/cobrancas';
import { colunasDeCobranca } from '@/components/billing/colunasDeCobranca';

/** Quantas cobranças a aba mostra (as mais recentes): dois anos de mensalidade. */
const LIMITE = 24;

/**
 * Configurações › Assinatura › Cobranças: cada pagamento da Conta, gravado pelo
 * stripe-webhook. O RLS entrega ao Gerente só as da própria Conta (e ao
 * superadmin, quando ele olha esta Conta). A coluna da nota fiscal fica
 * escondida até a parte 2 (NOTA_FISCAL_VISIVEL).
 */
export function CobrancasDaConta({ contaId }: { contaId: string | null }) {
  const consulta = useQuery({
    queryKey: [QUERY_KEYS.BILLING_CHARGES, 'conta', contaId],
    enabled: !!contaId,
    queryFn: async (): Promise<Cobranca[]> => {
      const { data, error } = await supabase
        .from('billing_charges')
        .select(COBRANCA_COLUMNS)
        .eq('tenant_id', contaId as string)
        .order('paid_at', { ascending: false })
        .limit(LIMITE);
      if (error) throw new Error('Não foi possível carregar as cobranças.');
      return (data ?? []) as Cobranca[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" /> Cobranças
        </CardTitle>
        <CardDescription>
          Cada pagamento da assinatura, do mais recente para o mais antigo. O recibo abre no Stripe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveTable
          ariaLabel="Cobranças da Conta"
          rows={consulta.data ?? []}
          rowKey={(c) => c.id}
          loading={consulta.isLoading}
          error={consulta.error ? (consulta.error as Error).message : undefined}
          empty={
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma cobrança ainda. A primeira aparece aqui assim que o Stripe confirmar o pagamento.
            </p>
          }
          columns={colunasDeCobranca({ comConta: false })}
        />
      </CardContent>
    </Card>
  );
}

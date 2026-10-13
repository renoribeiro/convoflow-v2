import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';
import { formatCents } from '@/lib/billing/adminBilling';
import { COBRANCA_COLUMNS, totaisDasCobrancas, type Cobranca } from '@/lib/billing/cobrancas';
import { colunasDeCobranca } from '@/components/billing/colunasDeCobranca';

/** Quantas linhas a aba traz (as mais recentes). */
const LIMITE = 200;

/**
 * Administração › Faturamento › Cobranças (superadmin): toda cobrança paga de
 * todas as Contas, gravada pelo stripe-webhook em billing_charges. É o
 * registro que a nota fiscal (parte 2) vai usar. A linha sem Conta é cobrança
 * cujo cliente do Stripe não bateu com Conta nenhuma: nada se perde, mas é
 * para olhar.
 */
export function CobrancasDaPlataforma() {
  const consulta = useQuery({
    queryKey: [QUERY_KEYS.BILLING_CHARGES, 'plataforma'],
    queryFn: async (): Promise<Cobranca[]> => {
      const { data, error } = await supabase
        .from('billing_charges')
        .select(`${COBRANCA_COLUMNS}, conta:tenants(name)`)
        .order('paid_at', { ascending: false })
        .limit(LIMITE);
      if (error) throw new Error('Não foi possível carregar as cobranças.');
      return (data ?? []) as unknown as Cobranca[];
    },
  });
  const linhas = consulta.data ?? [];
  const totais = totaisDasCobrancas(linhas);
  const semConta = linhas.filter((c) => !c.tenant_id).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" /> Cobranças
        </CardTitle>
        <CardDescription>
          Cada pagamento confirmado pelo Stripe, de todas as Contas, do mais recente para o mais antigo
          {linhas.length >= LIMITE ? ` (as ${LIMITE} últimas)` : ''}. Gravado pelo webhook; reembolso aparece na
          linha da cobrança.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {linhas.length ? (
          <p className="text-sm text-muted-foreground" data-testid="totais-cobrancas">
            {linhas.length} cobrança{linhas.length > 1 ? 's' : ''} · recebido {formatCents(totais.pago)} · devolvido{' '}
            {formatCents(totais.devolvido)}
            {semConta ? ` · ${semConta} sem Conta identificada` : ''}
          </p>
        ) : null}
        <ResponsiveTable
          ariaLabel="Cobranças de todas as Contas"
          rows={linhas}
          rowKey={(c) => c.id}
          loading={consulta.isLoading}
          error={consulta.error ? (consulta.error as Error).message : undefined}
          empty={<p className="py-6 text-center text-sm text-muted-foreground">Nenhuma cobrança registrada ainda.</p>}
          columns={colunasDeCobranca({ comConta: true })}
        />
      </CardContent>
    </Card>
  );
}

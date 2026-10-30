import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useNfseConfig } from '@/hooks/useNfseConfig';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';
import { formatDate } from '@/lib/billing/adminBilling';

const DIAS_DE_AVISO = 30;

/** "6,00" ou "6.00" -> 6; null quando não é um percentual de 0,00 a 99,99 com até duas casas. */
export function lerPercentual(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(limpo)) return null;
  return Number(limpo);
}

export function formatarPercentual(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toFixed(2).replace('.', ',');
}

function diasAte(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function formatarQuando(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Administração › Faturamento › Cobranças (superadmin): o retrato da emissão
 * automática de nota fiscal e o editor do percentual de tributos do Simples.
 */
export function NotaFiscalConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const config = useNfseConfig();
  const dados = config.data;
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (dados) setTexto(formatarPercentual(dados.p_tot_trib_sn));
  }, [dados]);

  const historico = useQuery({
    queryKey: [QUERY_KEYS.NFSE_CONFIG, 'historico'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfse_config_historico')
        .select('*')
        .order('alterado_em', { ascending: false })
        .limit(5);
      if (error) throw new Error('Não foi possível carregar o histórico.');
      return data ?? [];
    },
  });

  const salvar = useMutation({
    mutationFn: async (valor: number) => {
      const { error } = await supabase.rpc('nfse_definir_p_tot_trib_sn', { p_valor: valor });
      if (error) throw new Error(error.message || 'Não foi possível salvar o percentual.');
    },
    onSuccess: () => {
      toast({ title: 'Percentual salvo', description: 'Vale para as próximas notas.' });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NFSE_CONFIG] });
    },
    onError: (e: unknown) =>
      toast({ title: 'Não deu certo', description: e instanceof Error ? e.message : 'Tente de novo.', variant: 'destructive' }),
  });

  const valor = lerPercentual(texto);
  const diasDoCertificado = dados?.certificado_valido_ate ? diasAte(dados.certificado_valido_ate) : null;
  const certificadoEmRisco = diasDoCertificado !== null && diasDoCertificado < DIAS_DE_AVISO;
  const producao = dados?.ambiente_ativo === 'producao';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" /> Nota fiscal automática
        </CardTitle>
        <CardDescription>O que o servidor sabe sobre a emissão da NFS-e e o percentual que vai em toda nota.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {config.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : config.error || !dados ? (
          <p className="text-sm text-destructive">Não foi possível carregar a configuração da nota fiscal.</p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div data-testid="nfse-ambiente">
              <dt className="text-muted-foreground">Ambiente ativo</dt>
              <dd className="mt-1 space-y-1">
                <Badge variant={producao ? 'default' : 'secondary'}>{producao ? 'Produção' : 'Teste'}</Badge>
                <p className="text-xs text-muted-foreground">
                  {producao
                    ? 'Produção: notas com validade, e os clientes veem a coluna.'
                    : 'Ambiente de teste do governo: notas sem validade, os clientes ainda não veem.'}
                </p>
              </dd>
            </div>
            <div data-testid="nfse-certificado">
              <dt className="text-muted-foreground">Certificado vale até</dt>
              <dd className="mt-1">
                {dados.certificado_valido_ate ? formatDate(dados.certificado_valido_ate) : '—'}
                {certificadoEmRisco ? (
                  <p className="flex items-center gap-1 text-xs text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {diasDoCertificado! < 0 ? 'Vencido: renove o certificado.' : `Vence em ${diasDoCertificado} dia(s): renove o certificado.`}
                  </p>
                ) : null}
              </dd>
            </div>
            <div data-testid="nfse-fortaleza">
              <dt className="text-muted-foreground">Fortaleza no Emissor Nacional (produção)</dt>
              <dd className="mt-1">
                {dados.prefeitura_producao_emissor_nacional === null || dados.prefeitura_producao_emissor_nacional === undefined
                  ? 'Ainda não lido'
                  : dados.prefeitura_producao_emissor_nacional
                    ? 'Ligada: já dá para ligar a nota fiscal em produção'
                    : 'Desligada: a produção espera a Prefeitura'}
                <p className="text-xs text-muted-foreground">Lida em {formatarQuando(dados.prefeitura_producao_lida_em ?? null)}</p>
                <p className="text-xs text-muted-foreground" data-testid="nfse-fortaleza-teste">
                  No ambiente de teste:{' '}
                  {dados.prefeitura_emissor_nacional === null ? 'ainda não lido' : dados.prefeitura_emissor_nacional ? 'ligada' : 'desligada'}
                </p>
              </dd>
            </div>
          </dl>
        )}

        <form
          className="space-y-2"
          aria-label="Editar percentual de tributos"
          onSubmit={(e) => {
            e.preventDefault();
            if (valor !== null) salvar.mutate(valor);
          }}
        >
          <Label htmlFor="p-tot-trib-sn">Percentual de tributos do Simples (pTotTribSN)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="p-tot-trib-sn"
              className="w-28"
              inputMode="decimal"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-invalid={valor === null}
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Button type="submit" size="sm" disabled={valor === null || salvar.isPending || !dados}>
              {salvar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </div>
          {valor === null ? <p className="text-xs text-destructive">Use de 0,00 a 99,99, com até duas casas.</p> : null}
          <p className="text-xs text-muted-foreground">
            Vai em toda nota, no campo de tributos aproximados (Lei 12.741). Padrão 6,00: Anexo III do Simples, primeira
            faixa. Se o Fator R ficar abaixo de 28%, a empresa cai no Anexo V: use 15,50. O anexo do mês aparece no extrato
            do DAS. Vale para as próximas notas.
          </p>
        </form>

        <div data-testid="nfse-historico">
          <h4 className="text-sm font-medium">Últimas mudanças</h4>
          {historico.data?.length ? (
            <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
              {historico.data.map((h) => (
                <li key={h.id}>
                  {formatarPercentual(h.valor_anterior)}% → {formatarPercentual(h.valor_novo)}% · {h.alterado_por_nome ?? 'Sistema'} ·{' '}
                  {formatarQuando(h.alterado_em)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Nenhuma mudança registrada.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
import { useToast } from '@/hooks/use-toast';
import { useNfseConfig } from '@/hooks/useNfseConfig';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';
import { formatDate } from '@/lib/billing/adminBilling';

const DIAS_DE_AVISO = 30;
const CAMPO_LIBERACAO = 'emissao_producao_liberada';

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

/** A situação da chave, em uma frase: o que acontece com as notas dos clientes agora. */
export function situacaoDaLiberacao(liberada: boolean, producao: boolean): string {
  if (!liberada) return 'Desligada: nenhuma nota de cliente sai em produção.';
  if (!producao) return 'Ligada, mas o ambiente ainda é de teste: nenhuma nota de cliente sai até trocar o ambiente.';
  return 'Ligada: as notas dos clientes saem em produção.';
}

/** Linha do histórico: o percentual ou a chave, cada um no seu formato. */
function mudancaDoHistorico(h: { campo: string; valor_anterior: string | null; valor_novo: string | null }): string {
  if (h.campo === CAMPO_LIBERACAO) return `Emissão em produção: ${h.valor_anterior ?? '—'} → ${h.valor_novo ?? '—'}`;
  return `${formatarPercentual(h.valor_anterior)}% → ${formatarPercentual(h.valor_novo)}%`;
}

/**
 * Administração › Faturamento › Cobranças (superadmin): o retrato da emissão
 * automática de nota fiscal, a chave que libera a emissão em produção e o
 * editor do percentual de tributos do Simples.
 */
export function NotaFiscalConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const config = useNfseConfig();
  const dados = config.data;
  const [texto, setTexto] = useState('');
  // A chave só muda depois da confirmação: aqui fica o valor pedido, enquanto a janela está aberta.
  const [pedidoDeLiberacao, setPedidoDeLiberacao] = useState<boolean | null>(null);

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

  // Quem mudou a chave por último. Consulta própria: mudanças do percentual não a empurram para fora da lista.
  const ultimaLiberacao = useQuery({
    queryKey: [QUERY_KEYS.NFSE_CONFIG, 'historico', CAMPO_LIBERACAO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfse_config_historico')
        .select('*')
        .eq('campo', CAMPO_LIBERACAO)
        .order('alterado_em', { ascending: false })
        .limit(1);
      if (error) throw new Error('Não foi possível carregar o histórico.');
      return data?.[0] ?? null;
    },
  });

  const liberar = useMutation({
    mutationFn: async (ligar: boolean) => {
      const { error } = await supabase.rpc('nfse_definir_emissao_producao', { p_liberada: ligar });
      if (error) throw new Error('A chave não mudou. Confira se você entrou como Superadmin e tente de novo.');
    },
    onSuccess: (_d, ligar) => {
      toast({
        title: ligar ? 'Emissão em produção liberada' : 'Emissão em produção desligada',
        description: ligar ? 'A mudança ficou registrada com o seu nome.' : 'Nenhuma nota nova sai em produção. A mudança ficou registrada com o seu nome.',
      });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NFSE_CONFIG] });
    },
    onError: (e: unknown) =>
      toast({ title: 'Não deu certo', description: e instanceof Error ? e.message : 'Tente de novo.', variant: 'destructive' }),
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
  const liberada = dados?.emissao_producao_liberada === true;
  const situacaoRfb = dados?.prefeitura_producao_situacao_rfb;

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
                    ? 'Produção: notas com validade, e os clientes veem a coluna. A nota só sai com a emissão liberada aqui embaixo.'
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
              <dt className="text-muted-foreground">Dados de Fortaleza (produção)</dt>
              <dd className="mt-1">
                <p>
                  Emissor Nacional:{' '}
                  {dados.prefeitura_producao_emissor_nacional === null || dados.prefeitura_producao_emissor_nacional === undefined
                    ? 'ainda não lido'
                    : dados.prefeitura_producao_emissor_nacional
                      ? 'ligado (1)'
                      : 'desligado (0)'}
                </p>
                <p data-testid="nfse-fortaleza-rfb">
                  Emissão padrão da Receita: {situacaoRfb === null || situacaoRfb === undefined ? 'ainda não lida' : situacaoRfb}
                </p>
                <p className="text-xs text-muted-foreground">Só informação: não decide a emissão. Você recebe um aviso se um deles mudar.</p>
                <p className="text-xs text-muted-foreground">Lidos em {formatarQuando(dados.prefeitura_producao_lida_em ?? null)}</p>
                <p className="text-xs text-muted-foreground" data-testid="nfse-fortaleza-teste">
                  No ambiente de teste:{' '}
                  {dados.prefeitura_emissor_nacional === null ? 'ainda não lido' : dados.prefeitura_emissor_nacional ? 'ligada' : 'desligada'}
                </p>
              </dd>
            </div>
          </dl>
        )}

        {dados ? (
          <div className="space-y-1 rounded-md border p-3" data-testid="nfse-liberacao">
            <div className="flex items-center gap-2">
              <Switch
                id="nfse-emissao-liberada"
                checked={liberada}
                disabled={liberar.isPending}
                onCheckedChange={(ligar) => setPedidoDeLiberacao(ligar)}
              />
              <Label htmlFor="nfse-emissao-liberada">Emissão em produção liberada</Label>
              <DicaDoCampo
                rotulo="Emissão em produção liberada"
                texto="Só você decide quando a nota com validade começa a sair. A emissão precisa desta chave ligada e do ambiente em produção na Vercel e no Supabase."
              />
            </div>
            <p className="text-sm text-muted-foreground">{situacaoDaLiberacao(liberada, producao)}</p>
            {ultimaLiberacao.data ? (
              <p className="text-xs text-muted-foreground" data-testid="nfse-liberacao-quem">
                {ultimaLiberacao.data.valor_novo === 'ligada' ? 'Ligada' : 'Desligada'} por {ultimaLiberacao.data.alterado_por_nome ?? 'Sistema'} em{' '}
                {formatarQuando(ultimaLiberacao.data.alterado_em)}
              </p>
            ) : null}
          </div>
        ) : null}

        <ConfirmationDialog
          isOpen={pedidoDeLiberacao !== null}
          onClose={() => setPedidoDeLiberacao(null)}
          onConfirm={async () => {
            if (pedidoDeLiberacao !== null) await liberar.mutateAsync(pedidoDeLiberacao);
          }}
          title={pedidoDeLiberacao ? 'Liberar a emissão em produção?' : 'Desligar a emissão em produção?'}
          description={
            pedidoDeLiberacao
              ? producao
                ? 'O ConvoFlow passa a emitir notas com validade para os pagamentos dos clientes, e cada cliente recebe a nota por email. Os pagamentos que já estão na fila saem primeiro, do mais antigo para o mais novo.'
                : 'O ambiente ainda é de teste. Ligar agora não emite nada para os clientes: a emissão só começa quando o ambiente for produção na Vercel e no Supabase.'
              : 'Nenhuma nota nova sai em produção. Os pagamentos ficam na fila e saem quando você ligar de novo. O cancelamento por reembolso continua funcionando.'
          }
          confirmText={pedidoDeLiberacao ? 'Liberar emissão em produção' : 'Desligar emissão em produção'}
          variant={pedidoDeLiberacao ? 'default' : 'destructive'}
          reversivel
          comoDesfazer={
            pedidoDeLiberacao
              ? 'desligue a chave e as próximas notas param. A nota que já saiu continua valendo e só some com o cancelamento.'
              : 'ligue a chave de novo.'
          }
          textoParaDigitar={pedidoDeLiberacao ? 'LIBERAR' : undefined}
          isLoading={liberar.isPending}
        />

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
                  {mudancaDoHistorico(h)} · {h.alterado_por_nome ?? 'Sistema'} · {formatarQuando(h.alterado_em)}
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

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, KeyRound, Loader2, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { API_ADDON_RELEASED, API_BASE_URL, API_DOCS_PATH } from '@/lib/api/release';
import { API_QUERY_KEYS, chamarRpcApi, useApiAddonEstado } from '@/lib/api/addon';
import {
  ACEITE_TEXTO,
  ESCOPOS,
  ESCOPOS_PADRAO,
  ESCOPO_INFO,
  ESTADO_CHAVE_INFO,
  MAX_CHAVES_ATIVAS,
  NOME_MAX,
  VALIDADES,
  VALIDADE_PADRAO,
  VALIDADE_ROTULO,
  alternarEscopo,
  argsDeCriarChave,
  contarAtivas,
  erroDoFormulario,
  rotuloDasLojas,
  rotuloDoEscopo,
  type ApiChave,
  type ApiChaveCriada,
  type Escopo,
  type Validade,
} from '@/lib/api/chaves';
import { dataCurta } from '@/lib/billing/subscriptionActions';

interface LojaDaConta {
  id: string;
  name: string;
  parent_tenant_id: string | null;
}

const TOM_DO_SELO = {
  ok: 'bg-green-100 text-green-800 hover:bg-green-100',
  aviso: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  ruim: 'bg-red-100 text-red-800 hover:bg-red-100',
  neutro: 'bg-muted text-muted-foreground hover:bg-muted',
} as const;

function dataHora(iso: string | null): string {
  if (!iso) return 'Nunca usada';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Nunca usada';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ApiKeysSettings({ liberado = API_ADDON_RELEASED }: { liberado?: boolean }) {
  const { profile } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const contaId = (profile?.tenant_id as string | null | undefined) ?? null;

  const estadoQ = useApiAddonEstado(contaId);
  const chavesQ = useQuery({
    queryKey: [API_QUERY_KEYS.CHAVES, contaId],
    enabled: !!contaId,
    queryFn: () => chamarRpcApi<ApiChave[] | null>('api_chaves_listar').then((r) => r ?? []),
  });
  const lojasQ = useQuery({
    queryKey: [API_QUERY_KEYS.LOJAS, contaId],
    enabled: !!contaId,
    queryFn: async (): Promise<LojaDaConta[]> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, parent_tenant_id')
        .or(`id.eq.${contaId},parent_tenant_id.eq.${contaId}`)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LojaDaConta[];
    },
  });

  const chaves = chavesQ.data ?? [];
  const lojas = lojasQ.data ?? [];
  const nomesDasLojas: Record<string, string> = {};
  for (const l of lojas) nomesDasLojas[l.id] = l.id === contaId ? `${l.name} (Conta)` : l.name;
  const ativas = contarAtivas(chaves);

  // Formulário
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [escopos, setEscopos] = useState<Escopo[]>([...ESCOPOS_PADRAO]);
  const [todasAsLojas, setTodasAsLojas] = useState(true);
  const [lojasEscolhidas, setLojasEscolhidas] = useState<string[]>([]);
  const [validade, setValidade] = useState<Validade>(VALIDADE_PADRAO);
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // O segredo mora SÓ aqui, em useState, até o diálogo fechar. Nada de
  // useMutation (o cache de mutações guardaria a resposta) nem de log.
  const [segredo, setSegredo] = useState<ApiChaveCriada | null>(null);

  const [revogando, setRevogando] = useState<ApiChave | null>(null);
  const [revogandoOcupado, setRevogandoOcupado] = useState(false);

  const abrirCriacao = () => {
    setNome('');
    setEscopos([...ESCOPOS_PADRAO]);
    setTodasAsLojas(true);
    setLojasEscolhidas([]);
    setValidade(VALIDADE_PADRAO);
    setAceite(false);
    setErro(null);
    setCriando(true);
  };

  const criar = async () => {
    const lojasEnviadas = todasAsLojas ? null : lojasEscolhidas;
    const problema = erroDoFormulario({ nome, escopos, lojas: lojasEnviadas, validade, aceite });
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const linhas = await chamarRpcApi<ApiChaveCriada[] | ApiChaveCriada>(
        'api_chave_criar',
        argsDeCriarChave({ nome, escopos, lojas: lojasEnviadas, validade }),
      );
      const criada = Array.isArray(linhas) ? linhas[0] : linhas;
      if (!criada?.chave) throw new Error('A chave não voltou do servidor. Tente de novo.');
      setSegredo(criada);
      setCriando(false);
      await queryClient.invalidateQueries({ queryKey: [API_QUERY_KEYS.CHAVES] });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a chave agora.');
    } finally {
      setSalvando(false);
    }
  };

  const copiar = async () => {
    if (!segredo) return;
    try {
      await navigator.clipboard.writeText(segredo.chave);
      toast({ title: 'Chave copiada' });
    } catch {
      toast({
        title: 'Não foi possível copiar',
        description: 'Selecione a chave na caixa e copie à mão.',
        variant: 'destructive',
      });
    }
  };

  const revogar = async () => {
    if (!revogando) return;
    setRevogandoOcupado(true);
    try {
      await chamarRpcApi<void>('api_chave_revogar', { p_id: revogando.id });
      toast({ title: 'Chave revogada', description: `"${revogando.nome}" não funciona mais.` });
      setRevogando(null);
      await queryClient.invalidateQueries({ queryKey: [API_QUERY_KEYS.CHAVES] });
    } catch (e) {
      toast({
        title: 'Não foi possível revogar',
        description: e instanceof Error ? e.message : 'Tente de novo em alguns minutos.',
        variant: 'destructive',
      });
    } finally {
      setRevogandoOcupado(false);
    }
  };

  const alternarLoja = (id: string, marcada: boolean) =>
    setLojasEscolhidas((atuais) => (marcada ? [...atuais, id] : atuais.filter((x) => x !== id)));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Chaves de API
            </CardTitle>
            <CardDescription>
              Com uma chave, outro sistema lê os dados da sua Conta. {ativas} de {MAX_CHAVES_ATIVAS} chaves em uso.
            </CardDescription>
          </div>
          <Button onClick={abrirCriacao} disabled={ativas >= MAX_CHAVES_ATIVAS || !contaId} className="gap-2 self-start">
            <Plus className="h-4 w-4" /> Nova chave
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Endereço da API:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs" data-testid="api-endereco">
              {API_BASE_URL}
            </code>
            {liberado ? (
              <>
                {' '}
                <Link to={API_DOCS_PATH} className="font-medium text-primary underline underline-offset-2">
                  Ver a documentação
                </Link>
              </>
            ) : null}
          </div>

          {estadoQ.data && !estadoQ.data.ativo ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                A API está desligada nesta Conta: as chaves ficam suspensas até ela voltar.
              </AlertDescription>
            </Alert>
          ) : null}

          {chavesQ.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando as chaves…
            </p>
          ) : chavesQ.error ? (
            <Alert variant="destructive">
              <AlertDescription>Não foi possível carregar as chaves agora.</AlertDescription>
            </Alert>
          ) : chaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma chave ainda. Clique em "Nova chave" para criar a primeira.</p>
          ) : (
            <ul className="divide-y rounded-md border" aria-label="Chaves de API">
              {chaves.map((c) => {
                const info = ESTADO_CHAVE_INFO[c.estado];
                return (
                  <li key={c.id} className="space-y-2 p-3 text-sm" data-testid={`chave-${c.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.nome}</span>
                        <code className="text-xs text-muted-foreground">{c.prefixo}…</code>
                        <Badge className={TOM_DO_SELO[info.tom]}>{info.rotulo}</Badge>
                      </div>
                      {c.estado !== 'revogada' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRevogando(c)}
                        >
                          Revogar
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {c.escopos.map((e) => (
                        <Badge key={e} variant="outline">
                          {rotuloDoEscopo(e)}
                        </Badge>
                      ))}
                    </div>
                    <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                      <div>
                        <dt className="inline">Lojas: </dt>
                        <dd className="inline">{rotuloDasLojas(c.lojas, nomesDasLojas)}</dd>
                      </div>
                      <div>
                        <dt className="inline">Expira em: </dt>
                        <dd className="inline">{dataCurta(c.expira_em) ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="inline">Último uso: </dt>
                        <dd className="inline">
                          {dataHora(c.ultimo_uso_em)}
                          {c.ultimo_uso_em && c.ultimo_uso_ip ? ` · ${c.ultimo_uso_ip}` : ''}
                        </dd>
                      </div>
                    </dl>
                    {c.dono_nome ? <p className="text-xs text-muted-foreground">Criada por {c.dono_nome}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Nova chave */}
      <Dialog open={criando} onOpenChange={(aberto) => (salvando ? null : setCriando(aberto))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova chave de API</DialogTitle>
            <DialogDescription>
              Escolha o que essa chave pode ler. Quanto menos permissões, mais seguro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="api-chave-nome">Nome da chave</Label>
              <Input
                id="api-chave-nome"
                value={nome}
                maxLength={NOME_MAX}
                placeholder="Ex.: Planilha de leads"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="flex items-center gap-1.5 text-sm font-medium">
                O que a chave pode ler
                <DicaDoCampo rotulo="O que a chave pode ler" texto="Quanto menos, mais seguro. Histórico das conversas leva o texto das mensagens; fotos, áudios e documentos chegam por links que valem 15 minutos." />
              </legend>
              {ESCOPOS.map((e) => {
                const bloqueado = e === 'midia' && !escopos.includes('mensagens');
                return (
                  <div key={e} className="flex items-start gap-2">
                    <Checkbox
                      id={`api-escopo-${e}`}
                      checked={escopos.includes(e)}
                      disabled={bloqueado}
                      onCheckedChange={(v) => setEscopos((atuais) => alternarEscopo(atuais, e, v === true))}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor={`api-escopo-${e}`} className={bloqueado ? 'text-muted-foreground' : undefined}>
                        {ESCOPO_INFO[e].rotulo}
                      </Label>
                      <p className="text-xs text-muted-foreground">{ESCOPO_INFO[e].descricao}</p>
                    </div>
                  </div>
                );
              })}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Lojas</legend>
              <RadioGroup value={todasAsLojas ? 'todas' : 'algumas'} onValueChange={(v) => setTodasAsLojas(v === 'todas')}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="todas" id="api-lojas-todas" />
                  <Label htmlFor="api-lojas-todas">Todas as Lojas (inclui as conversas da própria Conta)</Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="algumas" id="api-lojas-algumas" />
                  <Label htmlFor="api-lojas-algumas">Só algumas</Label>
                </div>
              </RadioGroup>
              {!todasAsLojas ? (
                <div className="space-y-2 rounded-md border p-3">
                  {lojas.map((l) => (
                    <div key={l.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`api-loja-${l.id}`}
                        checked={lojasEscolhidas.includes(l.id)}
                        onCheckedChange={(v) => alternarLoja(l.id, v === true)}
                      />
                      <Label htmlFor={`api-loja-${l.id}`}>{nomesDasLojas[l.id]}</Label>
                    </div>
                  ))}
                </div>
              ) : null}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="flex items-center gap-1.5 text-sm font-medium">
                Validade
                <DicaDoCampo rotulo="Validade" texto="Ao vencer, a chave para e não renova: crie outra e troque no serviço que a usa." />
              </legend>
              <RadioGroup
                value={String(validade)}
                onValueChange={(v) => setValidade(Number(v) as Validade)}
                className="flex flex-wrap gap-4"
              >
                {VALIDADES.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <RadioGroupItem value={String(v)} id={`api-validade-${v}`} />
                    <Label htmlFor={`api-validade-${v}`}>{VALIDADE_ROTULO[v]}</Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
              <Checkbox id="api-aceite" checked={aceite} onCheckedChange={(v) => setAceite(v === true)} />
              <Label htmlFor="api-aceite" className="text-sm font-normal leading-snug">
                {ACEITE_TEXTO}
              </Label>
            </div>

            {erro ? (
              <p className="text-sm text-destructive" role="alert">
                {erro}
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCriando(false)} disabled={salvando}>
              Voltar
            </Button>
            <Button onClick={criar} disabled={salvando}>
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Criar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* A chave aparece UMA vez */}
      <Dialog open={segredo !== null} onOpenChange={(aberto) => (aberto ? null : setSegredo(null))}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sua chave está pronta</DialogTitle>
            <DialogDescription>
              Copie agora e guarde num lugar seguro. Ela não será mostrada de novo: se perder, revogue e crie outra.
            </DialogDescription>
          </DialogHeader>
          {segredo ? (
            <div className="space-y-3">
              <code
                className="block break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs"
                data-testid="api-chave-secreta"
              >
                {segredo.chave}
              </code>
              <Button variant="outline" onClick={copiar} className="gap-2">
                <Copy className="h-4 w-4" /> Copiar chave
              </Button>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setSegredo(null)}>Já guardei a chave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revogar */}
      <AlertDialog open={revogando !== null} onOpenChange={(aberto) => (revogandoOcupado ? null : !aberto && setRevogando(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar a chave "{revogando?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Quem usa essa chave perde o acesso na hora, e não dá para desfazer. Para voltar a acessar, crie uma chave
              nova.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revogandoOcupado}>Voltar</AlertDialogCancel>
            <Button variant="destructive" onClick={revogar} disabled={revogandoOcupado}>
              {revogandoOcupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Revogar chave
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

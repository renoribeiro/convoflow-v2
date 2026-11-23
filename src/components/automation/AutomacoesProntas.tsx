import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, Loader2, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
import { useTenant, useCan } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { motivoDoErro } from '@/lib/errors/mensagemDoErro';
import {
  LIMITE_DO_TEXTO_DO_AVISO,
  MINUTOS_DO_AVISO,
  TEXTO_PADRAO_DO_AVISO,
  VARIAVEL_SUGERIDA,
  automacoesQueTrocamONome,
  chavesDoAviso,
  chavesDoNome,
  erroDoNome,
  errosDoAviso,
  fraseDoHorario,
  lerAutomacoesProntas,
  variaveisDasPerguntas,
} from '@/lib/automation/automacoesProntas';

/**
 * Automações prontas, fixas no topo da aba Automação (2026-11-23). Regras e
 * caminho de gravação em src/lib/automation/automacoesProntas.ts.
 *
 * Gerente e Gestor (`store.admin`) ligam, desligam e ajustam; o Atendente vê
 * uma frase de leitura. O servidor confere de novo (RPC set_tenant_settings e
 * CHECK do banco): esconder o botão não é a única trava.
 */

const TITULO_NOME = 'Salvar o nome do lead';
const TITULO_AVISO = 'Aviso quando ninguém responde';

interface Props {
  /** As automações comuns da Loja (para o aviso de automação que também troca o nome). */
  fluxos: ReadonlyArray<unknown>;
}

export function AutomacoesProntas({ fluxos }: Props) {
  return (
    <section aria-label="Automações prontas" className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Automações prontas</h2>
        <p className="text-sm text-muted-foreground">
          Já vêm montadas: ligue e ajuste para esta Loja. Gerente e Gestor podem mudar.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CartaoNomeDoLead fluxos={fluxos} />
        <CartaoAvisoDeEspera />
      </div>
    </section>
  );
}

function useLojaDosCartoes() {
  const { tenant, loading, updateTenantSettings } = useTenant();
  const podeMudar = useCan('store.admin');
  const salvo = useMemo(() => lerAutomacoesProntas(tenant?.settings), [tenant?.settings]);
  const ehConta = (tenant as { kind?: string | null } | null)?.kind === 'account';
  return { tenant, loading, updateTenantSettings, podeMudar, salvo, ehConta };
}

function Aviso({ icone: Icone, children, tom = 'neutro' }: {
  icone: typeof Info;
  children: ReactNode;
  tom?: 'neutro' | 'atencao';
}) {
  return (
    <div
      className={
        tom === 'atencao'
          ? 'flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3'
          : 'flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3'
      }
    >
      <Icone className={tom === 'atencao' ? 'mt-0.5 h-4 w-4 flex-shrink-0 text-warning' : 'mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground'} />
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function Cabecalho({ titulo, descricao, ajuda, ligado }: { titulo: string; descricao: string; ajuda: string; ligado: boolean }) {
  return (
    <CardHeader>
      <div className="flex items-start justify-between gap-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <div className="flex items-center gap-2">
          <span
            className={
              ligado
                ? 'rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
                : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
            }
          >
            {ligado ? 'Ligado' : 'Desligado'}
          </span>
          <FeatureHelp helpKey={ajuda} />
        </div>
      </div>
      <CardDescription>{descricao}</CardDescription>
    </CardHeader>
  );
}


// ---------------------------------------------------------------------------
// Salvar o nome do lead
// ---------------------------------------------------------------------------

function CartaoNomeDoLead({ fluxos }: Props) {
  const { tenant, loading, updateTenantSettings, podeMudar, salvo, ehConta } = useLojaDosCartoes();
  const [ligado, setLigado] = useState(salvo.nome.ligado);
  const [variavel, setVariavel] = useState(salvo.nome.variavel || VARIAVEL_SUGERIDA);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setLigado(salvo.nome.ligado);
    setVariavel(salvo.nome.variavel || VARIAVEL_SUGERIDA);
  }, [salvo.nome.ligado, salvo.nome.variavel]);

  const duplicadas = useMemo(() => automacoesQueTrocamONome(fluxos), [fluxos]);
  const { data: sugestoes = [] } = useQuery({
    queryKey: ['chatbot-question-variables', tenant?.id],
    enabled: !!tenant?.id && podeMudar && !ehConta,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chatbot_nodes')
        .select('data')
        .eq('tenant_id', tenant!.id)
        .eq('node_type', 'ask_question');
      if (error) return [];
      return variaveisDasPerguntas(data as Array<{ data?: unknown }>);
    },
  });

  const cartao = { ligado, variavel };
  const erro = erroDoNome(cartao);
  const mudou = ligado !== salvo.nome.ligado || variavel.trim() !== salvo.nome.variavel;
  const descricao = 'Quando o chatbot pergunta o nome, a resposta vira o nome do contato.';

  const salvar = async () => {
    if (!podeMudar || erro) return;
    setSalvando(true);
    try {
      await updateTenantSettings(chavesDoNome(cartao), { silent: true });
      toast.success(ligado ? `Salvo: a resposta guardada em {${variavel.trim()}} vira o nome do contato.` : 'Salvo: o nome do lead não é mais salvo.');
    } catch (error) {
      toast.error(`Não foi possível salvar. ${motivoDoErro(error)}`);
    } finally {
      setSalvando(false);
    }
  };

  const avisoDuplicada = duplicadas.length > 0 && (
    <Aviso icone={AlertTriangle} tom="atencao">
      {duplicadas.length === 1 ? 'A automação ' : 'As automações '}
      <strong>{duplicadas.join(', ')}</strong>
      {duplicadas.length === 1 ? ' também troca' : ' também trocam'} o nome do contato, sem conferir nada, e pode trocar
      um nome salvo pela equipe. Se este cartão já faz o trabalho, pause ou edite essa automação na lista abaixo.
    </Aviso>
  );

  if (loading) return <CartaoCarregando titulo={TITULO_NOME} />;

  if (!tenant || ehConta) {
    return (
      <Card>
        <Cabecalho titulo={TITULO_NOME} descricao={descricao} ajuda="page:automation-nome-do-lead" ligado={false} />
        <CardContent>
          <Aviso icone={Info}>Esta automação é por Loja. Escolha uma Loja no seletor do topo da tela para ajustá-la.</Aviso>
        </CardContent>
      </Card>
    );
  }

  if (!podeMudar) {
    return (
      <Card data-testid="cartao-nome-do-lead">
        <Cabecalho titulo={TITULO_NOME} descricao={descricao} ajuda="page:automation-nome-do-lead" ligado={salvo.nome.ligado} />
        <CardContent className="space-y-3">
          <Aviso icone={Lock}>
            {salvo.nome.ligado
              ? `Nesta Loja, a resposta que o chatbot guarda em {${salvo.nome.variavel}} vira o nome do contato, sem trocar nome salvo pela equipe.`
              : 'Nesta Loja o nome do lead não é salvo sozinho.'}{' '}
            Apenas Gerente ou Gestor muda.
          </Aviso>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="cartao-nome-do-lead">
      <Cabecalho titulo={TITULO_NOME} descricao={descricao} ajuda="page:automation-nome-do-lead" ligado={salvo.nome.ligado} />
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="nome-do-lead-ligado">Ligar nesta Loja</Label>
          <Switch id="nome-do-lead-ligado" checked={ligado} onCheckedChange={setLigado} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="nome-do-lead-variavel">Variável do chatbot com o nome</Label>
            <DicaDoCampo
              rotulo="Variável do chatbot com o nome"
              texto="É onde o bloco Fazer Pergunta do nome guarda a resposta. Escreva sem chaves, por exemplo nome. O chatbot continua só perguntando."
            />
          </div>
          <Input
            id="nome-do-lead-variavel"
            value={variavel}
            onChange={(e) => setVariavel(e.target.value)}
            list="nome-do-lead-sugestoes"
            autoComplete="off"
            aria-invalid={!!erro}
          />
          <datalist id="nome-do-lead-sugestoes">
            {sugestoes.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Só aceita nome de verdade: de 1 a 4 palavras, só letras, sem pergunta e sem número.</li>
          <li>Nunca troca um nome salvo pela equipe. Troca só contato sem nome, só com o telefone ou com o nome do perfil do WhatsApp.</li>
          <li>Na variável fica só o primeiro nome, para usar em "Prazer, {'{'}{variavel.trim() || VARIAVEL_SUGERIDA}{'}'}!".</li>
        </ul>

        {avisoDuplicada}

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={!mudou || !!erro || salvando}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {mudou ? 'Salvar' : 'Tudo salvo'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Aviso quando ninguém responde
// ---------------------------------------------------------------------------

function CartaoAvisoDeEspera() {
  const { tenant, loading, updateTenantSettings, podeMudar, salvo, ehConta } = useLojaDosCartoes();
  const [ligado, setLigado] = useState(salvo.aviso.ligado);
  const [minutosTexto, setMinutosTexto] = useState(String(salvo.aviso.minutos));
  const [texto, setTexto] = useState(salvo.aviso.texto);
  const [respeitarHorario, setRespeitarHorario] = useState(salvo.aviso.respeitarHorario);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setLigado(salvo.aviso.ligado);
    setMinutosTexto(String(salvo.aviso.minutos));
    setTexto(salvo.aviso.texto);
    setRespeitarHorario(salvo.aviso.respeitarHorario);
  }, [salvo.aviso.ligado, salvo.aviso.minutos, salvo.aviso.texto, salvo.aviso.respeitarHorario]);

  const minutos = minutosTexto.trim() === '' ? Number.NaN : Number(minutosTexto);
  const erros = errosDoAviso({ minutos, texto });
  const temErro = !!(erros.minutos || erros.texto);
  const mudou =
    ligado !== salvo.aviso.ligado ||
    minutos !== salvo.aviso.minutos ||
    texto.trim() !== salvo.aviso.texto ||
    respeitarHorario !== salvo.aviso.respeitarHorario;
  const descricao = 'Uma mensagem automática quando o cliente espera e ninguém da equipe responde.';
  const naoEhGatilho = (
    <Aviso icone={Info}>
      Sai uma mensagem só, uma vez por espera, e nenhum chatbot é aberto. Enquanto um chatbot conversa com o cliente,
      o aviso não sai.
    </Aviso>
  );

  const salvar = async () => {
    if (!podeMudar || temErro) return;
    setSalvando(true);
    try {
      await updateTenantSettings(chavesDoAviso({ ligado, minutos, texto, respeitarHorario }), { silent: true });
      toast.success(ligado ? `Salvo: o aviso sai depois de ${minutos} min sem resposta.` : 'Salvo: o aviso está desligado.');
    } catch (error) {
      toast.error(`Não foi possível salvar. ${motivoDoErro(error)}`);
    } finally {
      setSalvando(false);
    }
  };

  if (loading) return <CartaoCarregando titulo={TITULO_AVISO} />;

  if (!tenant || ehConta) {
    return (
      <Card>
        <Cabecalho titulo={TITULO_AVISO} descricao={descricao} ajuda="page:automation-aviso-de-espera" ligado={false} />
        <CardContent>
          <Aviso icone={Info}>Esta automação é por Loja. Escolha uma Loja no seletor do topo da tela para ajustá-la.</Aviso>
        </CardContent>
      </Card>
    );
  }

  if (!podeMudar) {
    return (
      <Card data-testid="cartao-aviso-de-espera">
        <Cabecalho titulo={TITULO_AVISO} descricao={descricao} ajuda="page:automation-aviso-de-espera" ligado={salvo.aviso.ligado} />
        <CardContent className="space-y-3">
          <Aviso icone={Lock}>
            {salvo.aviso.ligado
              ? `Nesta Loja, quando o cliente espera ${salvo.aviso.minutos} min sem resposta da equipe, sai um aviso automático. ${fraseDoHorario(salvo.aviso, salvo.horarioSalvo)}`
              : 'Nesta Loja o aviso está desligado.'}{' '}
            Apenas Gerente ou Gestor muda.
          </Aviso>
          {naoEhGatilho}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="cartao-aviso-de-espera">
      <Cabecalho titulo={TITULO_AVISO} descricao={descricao} ajuda="page:automation-aviso-de-espera" ligado={salvo.aviso.ligado} />
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="aviso-ligado">Ligar nesta Loja</Label>
          <Switch id="aviso-ligado" checked={ligado} onCheckedChange={setLigado} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="aviso-minutos">Minutos sem resposta</Label>
            <DicaDoCampo
              rotulo="Minutos sem resposta"
              texto="Conta desde a primeira mensagem do cliente que ficou sem resposta. O aviso sai uma vez por espera e só volta depois que alguém da equipe responder."
            />
          </div>
          <Input
            id="aviso-minutos"
            type="number"
            inputMode="numeric"
            min={MINUTOS_DO_AVISO.min}
            max={MINUTOS_DO_AVISO.max}
            value={minutosTexto}
            onChange={(e) => setMinutosTexto(e.target.value)}
            aria-invalid={!!erros.minutos}
            className="w-32"
          />
          {erros.minutos && <p className="text-sm text-destructive">{erros.minutos}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="aviso-texto">Mensagem</Label>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => setTexto(TEXTO_PADRAO_DO_AVISO)}
              disabled={texto === TEXTO_PADRAO_DO_AVISO}
            >
              Voltar ao texto padrão
            </Button>
          </div>
          <Textarea
            id="aviso-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            maxLength={LIMITE_DO_TEXTO_DO_AVISO}
            aria-invalid={!!erros.texto}
          />
          <p className="text-xs text-muted-foreground">
            {texto.trim().length} de {LIMITE_DO_TEXTO_DO_AVISO} letras.
          </p>
          {erros.texto && <p className="text-sm text-destructive">{erros.texto}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Label htmlFor="aviso-horario">Respeitar o horário de funcionamento</Label>
              <DicaDoCampo
                rotulo="Respeitar o horário de funcionamento"
                texto="Ligado, o aviso só sai com a Loja aberta e só contam os minutos de Loja aberta. Sem horário salvo, sai a qualquer hora."
              />
            </div>
            <Switch id="aviso-horario" checked={respeitarHorario} onCheckedChange={setRespeitarHorario} />
          </div>
          <p className="text-sm text-muted-foreground">
            {fraseDoHorario({ respeitarHorario }, salvo.horarioSalvo)}{' '}
            <Link to="/dashboard/settings?tab=horario" className="font-medium text-primary underline-offset-4 hover:underline">
              Ajustar o horário na aba Horário
            </Link>
          </p>
        </div>

        {naoEhGatilho}

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={!mudou || temErro || salvando}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {mudou ? 'Salvar' : 'Tudo salvo'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CartaoCarregando({ titulo }: { titulo: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ArrowLeft, Check, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { registrarEnvioBarradoNoNavegador } from '@/lib/signup/authEmailFailure';
import { lerChegada, mensagemDoErroDoLink, TIPO_DO_CODIGO } from '@/lib/auth/linkDoEmail';
import { MIN_SENHA, mensagemDoErroDeSenha } from '@/lib/auth/mensagensDeSenha';
import logoVertical from '@/assets/logos/logo-vertical.svg';
import logoVerticalDark from '@/assets/logos/logo-vertical-dark.svg';

/** Erro do código que não é "vencido ou inválido": frase fixa, sem o inglês do Supabase. */
const CODIGO_ERRO_GENERICO = 'Não deu certo agora. Tente de novo em alguns minutos.';

/** Link do e-mail que funcionou no Supabase mas não virou sessão aqui. */
const LINK_SEM_ACESSO =
  'O link não trouxe um acesso válido. Isso acontece quando ele já foi aberto antes: cada link vale por um acesso só. Peça um código novo abaixo.';

/**
 * Define ou redefine a senha, e é também o "Esqueci minha senha".
 *
 * Quem chega aqui:
 *   - CONVITE e NOVA SENHA pelo link do e-mail. O link novo traz `token_hash`
 *     e a tela só o usa quando a pessoa clica em "Continuar"; o antigo chega
 *     com a sessão pronta no fragmento. Ver src/lib/auth/linkDoEmail.ts.
 *   - "Esqueci minha senha" da tela de login, sem link nenhum: e-mail, código
 *     de 6 dígitos, nova senha.
 *
 * O alerta vermelho só aparece para quem chegou por um link que falhou. Até
 * 2026-10-11 ele aparecia para toda visita sem sessão, inclusive para quem só
 * queria pedir o código, e dizia que o link "já tinha sido aberto" sem link
 * nenhum ter sido aberto.
 */
export const DefinirSenha = () => {
  const { session, isLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Lido UMA vez, na montagem: o supabase-js limpa o fragmento assim que o processa.
  const [chegada] = useState(() => lerChegada(window.location.search, window.location.hash));

  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  // Link novo: só o clique em "Continuar" usa o acesso.
  const [continuando, setContinuando] = useState(false);
  const [linkAceito, setLinkAceito] = useState(false);
  const [erroDoLinkNovo, setErroDoLinkNovo] = useState<string | null>(null);

  // "Esqueci minha senha": e-mail → código → senha.
  const [etapa, setEtapa] = useState<'email' | 'codigo'>('email');
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  const [reenviado, setReenviado] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [erroCodigo, setErroCodigo] = useState<string | null>(null);

  const erroDoLink = chegada.tipo === 'erro' ? chegada.mensagem : erroDoLinkNovo;

  // Erro no fragmento: tira da barra depois de lido. Um F5 com ele ali só
  // repetiria a mesma tela de erro.
  useEffect(() => {
    if (chegada.tipo === 'erro') {
      navigate('/definir-senha', { replace: true });
    }
  }, [chegada, navigate]);

  const continuar = async () => {
    if (chegada.tipo !== 'link_novo') return;
    setContinuando(true);
    setErroDoLinkNovo(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: chegada.tokenHash,
        type: chegada.otpType,
      });
      if (error) throw error;
      // A sessão nova chega pelo AuthContext e o formulário de senha aparece.
      setLinkAceito(true);
    } catch (err) {
      const e = err as { message?: string; code?: string };
      logger.warn('[DefinirSenha] link do e-mail recusado', { code: e?.code, message: e?.message });
      setErroDoLinkNovo(mensagemDoErroDoLink(e));
    } finally {
      setContinuando(false);
      // O token_hash sai da barra: usado ou recusado, ele não serve mais.
      navigate('/definir-senha', { replace: true });
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroForm(null);

    if (senha.length < MIN_SENHA) {
      setErroForm(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      setErroForm('As duas senhas não são iguais.');
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;

      setPronto(true);
      toast({
        title: 'Senha definida',
        description: 'Pronto! Da próxima vez é só entrar com o seu e-mail e essa senha.',
      });
      // Já existe sessão: entra direto, sem obrigar a digitar tudo de novo.
      setTimeout(() => navigate('/dashboard', { replace: true }), 800);
    } catch (err) {
      const e = err as { message?: string; code?: string; status?: number };
      // O texto do Supabase vai só para o log; a tela mostra a frase fixa.
      logger.warn('[DefinirSenha] updateUser falhou', { code: e?.code, message: e?.message });
      setErroForm(mensagemDoErroDeSenha(e));
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Manda o e-mail de nova senha (com o código de 6 dígitos).
   * Mesma resposta com ou sem erro: a tela não confirma se o e-mail existe.
   */
  const enviarCodigo = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const destino = email.trim();
    if (!destino) return;

    setEnviando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(destino, {
        redirectTo: `${window.location.origin}/definir-senha`,
      });
      if (error) throw error;
    } catch (err) {
      logger.warn('[DefinirSenha] envio do código falhou', {
        message: err instanceof Error ? err.message : 'desconhecido',
      });
      // Termômetro do envio de e-mail (limite por hora / endereço recusado).
      // Sem esperar: não muda nada do que a pessoa vê.
      void registrarEnvioBarradoNoNavegador(
        err as { status?: number; code?: string; message?: string },
      );
    } finally {
      setReenviado(enviadoPara !== null);
      setEnviadoPara(destino);
      setEtapa('codigo');
      setEnviando(false);
    }
  };

  /**
   * Troca o código de 6 dígitos por uma sessão.
   *
   * Vale para o código do e-mail de NOVA SENHA e para o do e-mail de CONVITE:
   * ver TIPO_DO_CODIGO em src/lib/auth/linkDoEmail.ts.
   */
  const verificarCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroCodigo(null);

    const limpo = codigo.replace(/\D/g, '');
    if (limpo.length < 6) {
      setErroCodigo('O código tem 6 dígitos.');
      return;
    }

    setVerificando(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: limpo,
        type: TIPO_DO_CODIGO,
      });
      if (error) throw error;
      // A sessão criada aqui leva ao formulário de senha: quem manda é o
      // `session` do AuthContext.
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Código inválido.';
      logger.warn('[DefinirSenha] verifyOtp falhou', { message: msg });
      setErroCodigo(
        /expired|invalid|not found/i.test(msg)
          ? 'Código inválido ou vencido. Confira o e-mail digitado ou peça um código novo.'
          : CODIGO_ERRO_GENERICO,
      );
    } finally {
      setVerificando(false);
    }
  };

  if (pronto) {
    return <Navigate to="/dashboard" replace />;
  }

  // Link novo esperando o clique. Vem antes do "carregando" e da sessão: quem
  // já está logado com outra conta também precisa clicar, senão trocaria a
  // senha da conta errada.
  const esperandoClique = chegada.tipo === 'link_novo' && !linkAceito && !erroDoLinkNovo;

  // Esperando o AuthProvider (sessão do link antigo) ou a sessão do clique.
  if (!esperandoClique && (isLoading || (linkAceito && !session))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const comSessao = !esperandoClique && !!session;
  const ehConvite = chegada.tipo === 'link_novo' && chegada.otpType === 'invite';
  const alertaDoLink = !comSessao && !esperandoClique
    ? erroDoLink ?? (chegada.tipo === 'link_antigo' ? LINK_SEM_ACESSO : null)
    : null;

  let titulo: string;
  let descricao: string;
  if (esperandoClique) {
    titulo = ehConvite ? 'Aceite seu convite' : 'Crie sua nova senha';
    descricao = 'Clique em Continuar para criar sua senha.';
  } else if (comSessao) {
    // Mesmo verbo do começo ao fim: "Crie sua nova senha" → "Escolha sua nova senha".
    titulo = ehConvite ? 'Escolha sua senha' : 'Escolha sua nova senha';
    descricao = 'É com ela que você vai entrar daqui pra frente.';
  } else if (etapa === 'codigo') {
    titulo = 'Digite o código';
    descricao = enviadoPara
      ? `Enviamos um código de 6 dígitos para ${enviadoPara}. Ele vale por 24 horas.`
      : 'Digite o seu e-mail e o código de 6 dígitos que chegou para você.';
  } else {
    titulo = alertaDoLink ? 'Peça um código novo' : 'Esqueci minha senha';
    descricao = 'Digite o e-mail da sua conta. Enviamos um código de 6 dígitos para você criar uma nova senha.';
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="mb-6">
          <Link
            to="/auth"
            className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao login
          </Link>
        </div>

        <Card className="border-border/50 shadow-xl backdrop-blur-sm bg-card/95">
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center">
              <img src={logoVertical} alt="ConvoFlow" className="h-20 w-auto dark:hidden" />
              <img src={logoVerticalDark} alt="ConvoFlow" className="h-20 w-auto hidden dark:block" />
            </div>
            <CardTitle className="text-xl">{titulo}</CardTitle>
            <CardDescription>{descricao}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {alertaDoLink && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Não deu para usar este link</AlertTitle>
                <AlertDescription>{alertaDoLink}</AlertDescription>
              </Alert>
            )}

            {esperandoClique ? (
              <Button className="w-full" onClick={continuar} disabled={continuando}>
                {continuando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Continuar
              </Button>
            ) : comSessao ? (
              <form onSubmit={salvar} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nova-senha">Nova senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="nova-senha"
                      type={mostrarSenha ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={senha}
                      onChange={(ev) => setSenha(ev.target.value)}
                      className="pl-10 pr-10"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha((v) => !v)}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                      tabIndex={-1}
                    >
                      {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pelo menos {MIN_SENHA} caracteres.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirma-senha">Repita a senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirma-senha"
                      type={mostrarSenha ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmacao}
                      onChange={(ev) => setConfirmacao(ev.target.value)}
                      className="pl-10"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>

                {erroForm && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{erroForm}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={salvando}>
                  {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Salvar e entrar
                </Button>
              </form>
            ) : etapa === 'email' ? (
              <form onSubmit={enviarCodigo} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="esqueci-email">Seu e-mail</Label>
                  <Input
                    id="esqueci-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={enviando || !email.trim()}>
                  {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Enviar código
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setEtapa('codigo')}
                >
                  Já tenho um código
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <form onSubmit={verificarCodigo} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="esqueci-email">Seu e-mail</Label>
                    <Input
                      id="esqueci-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(ev) => setEmail(ev.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="codigo-acesso">Código recebido por e-mail</Label>
                    <Input
                      id="codigo-acesso"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="000000"
                      value={codigo}
                      onChange={(ev) => setCodigo(ev.target.value.replace(/\D/g, ''))}
                      className="text-center text-lg tracking-[0.5em]"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Serve o código do e-mail de nova senha ou do e-mail de convite.
                    </p>
                  </div>

                  {erroCodigo && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{erroCodigo}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" disabled={verificando}>
                    {verificando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Continuar
                  </Button>
                </form>

                <div className="border-t border-border pt-4 space-y-2">
                  {reenviado && (
                    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4" />
                      Enviamos de novo. Use o código mais recente.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    disabled={enviando || !email.trim()}
                    onClick={() => enviarCodigo()}
                  >
                    {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {enviadoPara ? 'Não recebi, enviar de novo' : 'Enviar um código novo'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default DefinirSenha;

import { useEffect, useMemo, useState } from 'react';
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
import logoVertical from '@/assets/logos/logo-vertical.svg';
import logoVerticalDark from '@/assets/logos/logo-vertical-dark.svg';

/** Mínimo de caracteres da senha. Mesma regra do Supabase Auth por padrão. */
const MIN_SENHA = 8;

/**
 * Traduz o erro que o Supabase devolve no fragmento da URL.
 *
 * O link de convite e o de recuperação são de USO ÚNICO. Abrir no celular e
 * depois no computador queima o primeiro acesso e o segundo chega aqui com
 * `otp_expired` — foi exatamente o que aconteceu em 2026-08-18. Sem esta
 * tradução o usuário via um fragmento em inglês na barra de endereço da página
 * de vendas e não tinha ideia do que fazer.
 */
function mensagemDoErro(code: string | null, description: string | null): string {
  if (code === 'otp_expired') {
    return 'Este link expirou ou já foi usado. Cada link vale por um acesso só. Peça um novo abaixo.';
  }
  if (code === 'access_denied') {
    return 'Este link não é mais válido. Peça um novo abaixo.';
  }
  return description || 'Não foi possível validar este link. Peça um novo abaixo.';
}

/**
 * Define ou redefine a senha.
 *
 * Atende os DOIS caminhos, porque o problema é o mesmo nos dois: a pessoa chega
 * com uma sessão criada por um link de e-mail e sem senha para entrar de novo.
 *
 *   - CONVITE     → `manage-user` manda o convidado para cá. Antes mandava para
 *                   /dashboard, onde não havia nada que deixasse definir senha:
 *                   o convidado entrava uma vez e nunca mais.
 *   - RECUPERAÇÃO → o link de "Esqueci minha senha" cai aqui.
 *
 * Como o cliente do Supabase está com `detectSessionInUrl`, quando este
 * componente monta o token do fragmento já virou sessão. Por isso a decisão é
 * pela sessão, e não por ler o token na mão.
 */
export const DefinirSenha = () => {
  const { session, isLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  // Entrada por CÓDIGO, para quem chegou sem sessão.
  const [emailReenvio, setEmailReenvio] = useState('');
  const [codigo, setCodigo] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [erroCodigo, setErroCodigo] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  /**
   * Erro do fragmento, lido UMA vez na montagem. Precisa ser no estado inicial:
   * o supabase-js limpa o hash assim que processa, e a partir daí não dá mais
   * para saber por que a pessoa chegou sem sessão.
   */
  const erroDoLink = useMemo(() => {
    const hash = window.location.hash?.replace(/^#/, '') ?? '';
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    if (!params.get('error') && !params.get('error_code')) return null;
    return mensagemDoErro(params.get('error_code'), params.get('error_description'));
  }, []);

  // Tira o fragmento da barra de endereço depois de lido — ele não ajuda mais
  // ninguém e um F5 com ele ainda ali só repete a mesma tela de erro.
  useEffect(() => {
    if (erroDoLink) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [erroDoLink]);

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
      const msg = err instanceof Error ? err.message : 'Não foi possível salvar a senha.';
      logger.warn('[DefinirSenha] updateUser falhou', { message: msg });
      setErroForm(msg);
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Troca o código de 6 dígitos por uma sessão.
   *
   * Existe porque o LINK não é confiável: ele vale por um acesso só, e em
   * 2026-08-18 os logs do Auth mostraram três vezes o mesmo padrão — um
   * primeiro `/verify` bem-sucedido que ninguém pediu (varredura de e-mail ou
   * pré-carregamento do navegador) e, logo depois, o acesso do usuário
   * chegando num token já gasto. Com código não há nada para um robô consumir:
   * ele é inútil sem alguém digitando.
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
        email: emailReenvio.trim(),
        token: limpo,
        type: 'recovery',
      });
      if (error) throw error;
      // A sessão criada aqui derruba o ramo "sem sessão" e o formulário de
      // senha aparece sozinho — quem manda é o `session` do AuthContext.
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Código inválido.';
      logger.warn('[DefinirSenha] verifyOtp falhou', { message: msg });
      setErroCodigo(
        /expired|invalid|not found/i.test(msg)
          ? 'Código inválido ou vencido. Peça um novo abaixo.'
          : msg,
      );
    } finally {
      setVerificando(false);
    }
  };

  const reenviarLink = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!emailReenvio.trim()) return;

    setReenviando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailReenvio.trim(), {
        redirectTo: `${window.location.origin}/definir-senha`,
      });
      if (error) throw error;
      setReenviado(true);
    } catch (err) {
      logger.warn('[DefinirSenha] reenvio falhou', {
        message: err instanceof Error ? err.message : 'desconhecido',
      });
      // Termômetro do envio de e-mail (limite por hora / endereço recusado).
      // Sem esperar: não muda nada do que a pessoa vê.
      void registrarEnvioBarradoNoNavegador(
        err as { status?: number; code?: string; message?: string },
      );
      // Mesma resposta com ou sem erro: não confirmamos se o e-mail existe.
      setReenviado(true);
    } finally {
      setReenviando(false);
    }
  };

  // Esperando o AuthProvider resolver o token do link.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pronto) {
    return <Navigate to="/dashboard" replace />;
  }

  const semSessao = !session;

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
            <CardTitle className="text-xl">
              {semSessao ? 'Confirme seu acesso' : 'Defina sua senha'}
            </CardTitle>
            <CardDescription>
              {semSessao
                ? 'Digite o código que enviamos para o seu e-mail.'
                : 'É com ela que você vai entrar daqui pra frente.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {(erroDoLink || semSessao) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Não deu para usar este link</AlertTitle>
                <AlertDescription>
                  {erroDoLink ??
                    'O link não trouxe um acesso válido. Isso acontece quando ele já foi aberto antes: cada link vale por um acesso só.'}
                </AlertDescription>
              </Alert>
            )}

            {semSessao ? (
              <div className="space-y-4">
                <form onSubmit={verificarCodigo} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reenvio-email">Seu e-mail</Label>
                    <Input
                      id="reenvio-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={emailReenvio}
                      onChange={(ev) => setEmailReenvio(ev.target.value)}
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
                      São 6 dígitos. O código não se gasta sozinho. Diferente do link,
                      só funciona se alguém digitar.
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

                <div className="border-t border-border pt-4">
                  {reenviado ? (
                    <Alert>
                      <Check className="h-4 w-4" />
                      <AlertTitle>Enviado</AlertTitle>
                      <AlertDescription>
                        Se esse e-mail estiver cadastrado, o código chega em instantes.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      disabled={reenviando || !emailReenvio.trim()}
                      onClick={() => reenviarLink()}
                    >
                      {reenviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Não recebi, enviar de novo
                    </Button>
                  )}
                </div>
              </div>
            ) : (
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
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default DefinirSenha;

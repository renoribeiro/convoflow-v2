/**
 * /cadastro — o cadastro pelo site (teste grátis, entrega 2).
 *
 * Público: quem chega aqui não tem conta. O formulário cria a Conta e manda um
 * convite de GERENTE por e-mail; a senha é definida em /definir-senha, pelo
 * link do e-mail. O cartão vem depois, na tela de bloqueio, com o teste grátis.
 *
 * Desligado por padrão (src/lib/signup/release.ts): com a chave em `false` a
 * rota nem carrega esta página (App.tsx) e, se carregar, ela redireciona.
 *
 * Toda resposta aceita mostra o MESMO "confira seu e-mail" — ver
 * src/lib/signup/submitPublicSignup.ts.
 */
import { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { TurnstileWidget, type TurnstileHandle } from '@/components/signup/TurnstileWidget';
import { useAuth } from '@/contexts/AuthContext';
import { env } from '@/lib/env';
import { LOGIN_PATH, PUBLIC_SIGNUP_ENABLED } from '@/lib/signup/release';
import { TRIAL_DAYS } from '@/lib/billing/trialOffer';
import { SUPORTE_EMAIL } from '@/lib/billing/checkout';
import { publicSignupSchema, type PublicSignupInput } from '@/lib/validations/publicSignup';
import { enviarCadastroPublico } from '@/lib/signup/submitPublicSignup';
import logoVertical from '@/assets/logos/logo-vertical.svg';
import logoVerticalDark from '@/assets/logos/logo-vertical-dark.svg';

type Campo = keyof PublicSignupInput;

const VAZIO: PublicSignupInput = {
  firstName: '',
  lastName: '',
  email: '',
  companyName: '',
  phone: '',
  // O checkbox começa desmarcado; o schema só aceita `true`.
  acceptedTerms: false as unknown as true,
};

/** O texto único de "deu certo". Não muda com o destino do cadastro. */
export const CADASTRO_ENVIADO_TITULO = 'Confira seu e-mail';

interface CadastroProps {
  /** Só para teste: força a chave. Em produção vem de release.ts. */
  habilitado?: boolean;
}

export default function Cadastro({ habilitado = PUBLIC_SIGNUP_ENABLED }: CadastroProps) {
  const { session } = useAuth();
  const siteKey = env.get('TURNSTILE_SITE_KEY');

  const [valores, setValores] = useState<PublicSignupInput>(VAZIO);
  const [erros, setErros] = useState<Partial<Record<Campo, string>>>({});
  const [token, setToken] = useState<string | null>(null);
  const [turnstileFalhou, setTurnstileFalhou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);

  if (!habilitado) return <Navigate to={LOGIN_PATH} replace />;
  if (session) return <Navigate to="/dashboard" replace />;

  const mudar = (campo: Campo, valor: string | boolean) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErros((e) => ({ ...e, [campo]: undefined }));
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setFalha(null);

    const r = publicSignupSchema.safeParse(valores);
    if (!r.success) {
      const novos: Partial<Record<Campo, string>> = {};
      for (const issue of r.error.issues) {
        const campo = issue.path[0] as Campo;
        if (!novos[campo]) novos[campo] = issue.message;
      }
      setErros(novos);
      return;
    }
    if (!token) {
      setFalha('Espere a verificação "não sou um robô" terminar e tente de novo.');
      return;
    }

    setEnviando(true);
    try {
      const resposta = await enviarCadastroPublico(r.data, token);
      if (resposta.ok) {
        setEnviado(true);
      } else {
        setFalha(resposta.message);
      }
    } finally {
      // O token foi gasto no servidor, deu certo ou não.
      turnstile.current?.reset();
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao início
          </Link>
        </div>

        <Card className="border-border/50 shadow-xl bg-card/95">
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center">
              <img src={logoVertical} alt="ConvoFlow" className="h-16 w-auto dark:hidden" />
              <img src={logoVerticalDark} alt="ConvoFlow" className="h-16 w-auto hidden dark:block" />
            </div>
            {enviado ? (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <MailCheck className="h-6 w-6 text-muted-foreground" />
                </div>
                <CardTitle className="text-2xl">{CADASTRO_ENVIADO_TITULO}</CardTitle>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-1.5">
                  <CardTitle className="text-2xl">Comece seu teste grátis</CardTitle>
                  <FeatureHelp helpKey="page:cadastro" docsLink={false} />
                </div>
                <CardDescription>
                  {TRIAL_DAYS} dias grátis. Você cria a senha pelo e-mail, cadastra o cartão e só é
                  cobrado no fim do teste.
                </CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent>
            {enviado ? (
              <div className="space-y-3 text-sm text-muted-foreground" data-testid="cadastro-enviado">
                <p>
                  Se este e-mail puder ser usado, você vai receber em alguns minutos uma mensagem do
                  ConvoFlow com o link para criar sua senha.
                </p>
                <p>Não chegou? Confira a caixa de spam e a aba Promoções.</p>
                <p>
                  Se você já tem conta no ConvoFlow, entre pela{' '}
                  <Link to={LOGIN_PATH} className="underline hover:text-foreground">
                    tela de login
                  </Link>{' '}
                  ou use "Esqueci minha senha".
                </p>
              </div>
            ) : !siteKey ? (
              <Alert>
                <AlertDescription>
                  O cadastro pelo site está indisponível no momento. Fale com {SUPORTE_EMAIL}.
                </AlertDescription>
              </Alert>
            ) : (
              <form onSubmit={enviar} className="space-y-4" noValidate>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <CampoTexto id="firstName" rotulo="Nome" valor={valores.firstName} erro={erros.firstName}
                    autoComplete="given-name" onChange={(v) => mudar('firstName', v)} />
                  <CampoTexto id="lastName" rotulo="Sobrenome" valor={valores.lastName} erro={erros.lastName}
                    autoComplete="family-name" onChange={(v) => mudar('lastName', v)} />
                </div>
                <CampoTexto id="email" rotulo="E-mail" tipo="email" valor={valores.email} erro={erros.email}
                  autoComplete="email" onChange={(v) => mudar('email', v)} />
                <CampoTexto id="companyName" rotulo="Nome da empresa" valor={valores.companyName}
                  erro={erros.companyName} autoComplete="organization" onChange={(v) => mudar('companyName', v)} />
                <CampoTexto id="phone" rotulo="Telefone com DDD" tipo="tel" valor={valores.phone} erro={erros.phone}
                  autoComplete="tel" placeholder="(11) 99999-0000" onChange={(v) => mudar('phone', v)} />

                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="acceptedTerms"
                      checked={valores.acceptedTerms === true}
                      onCheckedChange={(c) => mudar('acceptedTerms', c === true)}
                      aria-invalid={!!erros.acceptedTerms}
                    />
                    <Label htmlFor="acceptedTerms" className="text-sm font-normal leading-snug">
                      Li e aceito os{' '}
                      <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline">
                        Termos de Uso
                      </a>{' '}
                      e a{' '}
                      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">
                        Política de Privacidade
                      </a>
                      .
                    </Label>
                  </div>
                  {erros.acceptedTerms ? (
                    <p className="text-xs text-destructive">{erros.acceptedTerms}</p>
                  ) : null}
                </div>

                <TurnstileWidget
                  ref={turnstile}
                  siteKey={siteKey}
                  action="cadastro"
                  onToken={setToken}
                  onLoadError={() => setTurnstileFalhou(true)}
                />
                {turnstileFalhou ? (
                  <p className="text-xs text-destructive text-center">
                    A verificação "não sou um robô" não carregou. Desligue o bloqueador de anúncios
                    desta página ou tente outro navegador.
                  </p>
                ) : null}

                {falha ? (
                  <Alert variant="destructive">
                    <AlertDescription>{falha}</AlertDescription>
                  </Alert>
                ) : null}

                <Button type="submit" className="w-full" disabled={enviando || !token}>
                  {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Criar minha conta
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Já tem conta?{' '}
          <Link to={LOGIN_PATH} className="underline hover:text-foreground">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}

function CampoTexto(props: {
  id: string;
  rotulo: string;
  valor: string;
  erro?: string;
  tipo?: string;
  autoComplete?: string;
  placeholder?: string;
  onChange(valor: string): void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id}>{props.rotulo}</Label>
      <Input
        id={props.id}
        type={props.tipo ?? 'text'}
        value={props.valor}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        aria-invalid={!!props.erro}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.erro ? <p className="text-xs text-destructive">{props.erro}</p> : null}
    </div>
  );
}

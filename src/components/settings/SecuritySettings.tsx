import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Check, Loader2, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  MIN_SENHA,
  SENHA_ERRO_GENERICO,
  SENHA_IGUAL_A_ATUAL,
  ehSenhaErrada,
  mensagemDoErroDeSenha,
} from '@/lib/auth/mensagensDeSenha';

export const SENHA_TROCADA =
  'Senha trocada. Saímos da sua conta nos outros aparelhos e navegadores. Neste aqui você continua conectado.';

/** A senha mudou, mas o pedido para encerrar as outras sessões falhou. */
export const SENHA_TROCADA_SEM_SAIR_DOS_OUTROS =
  'Senha trocada. Não conseguimos sair da sua conta nos outros aparelhos agora. Se precisar, troque a senha de novo daqui a alguns minutos.';

/**
 * Configurações › Segurança: troca a senha de quem está logado.
 *
 * Até 2026-10-19 esta tela só esperava 1,5 s e dizia "Senha alterada com
 * sucesso!", sem falar com o servidor: a senha continuava a antiga.
 *
 * O caminho agora:
 *   1. Confere a senha atual entrando de novo com ela (`signInWithPassword`).
 *      Isso também deixa a sessão nova, o que atende a "troca de senha segura"
 *      do Supabase (que recusa a troca quando o login tem mais de 24 horas).
 *      Se ela estiver ligada e mesmo assim recusar, a frase manda entrar de novo.
 *   2. Troca a senha (`updateUser`).
 *   3. Encerra as OUTRAS sessões (`signOut({ scope: 'others' })`): celular,
 *      outro navegador, a máquina de quem pegou a senha emprestada. Esta fica.
 *
 * Nenhum texto do Supabase chega à tela: ele vai para o log, e a pessoa lê uma
 * frase fixa de src/lib/auth/mensagensDeSenha.ts.
 */
export const SecuritySettings = () => {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErro('Preencha os três campos.');
      return;
    }
    if (newPassword.length < MIN_SENHA) {
      setErro(`A nova senha precisa ter pelo menos ${MIN_SENHA} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErro('As duas novas senhas não são iguais.');
      return;
    }
    if (newPassword === currentPassword) {
      setErro(SENHA_IGUAL_A_ATUAL);
      return;
    }
    const email = user?.email;
    if (!email) {
      logger.warn('[SecuritySettings] usuário sem e-mail na sessão');
      setErro(SENHA_ERRO_GENERICO);
      return;
    }

    setIsChanging(true);
    try {
      // 1. Senha atual. Entrar de novo com ela também conta como entrada no
      // "Último acesso" (track-login), o que é verdade: a senha foi digitada.
      const { error: erroAtual } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (erroAtual) {
        logger.warn('[SecuritySettings] senha atual recusada', {
          code: erroAtual.code,
          message: erroAtual.message,
        });
        setErro(ehSenhaErrada(erroAtual) ? 'A senha atual não confere.' : mensagemDoErroDeSenha(erroAtual));
        return;
      }

      // 2. A troca.
      const { error: erroTroca } = await supabase.auth.updateUser({ password: newPassword });
      if (erroTroca) {
        logger.warn('[SecuritySettings] updateUser falhou', {
          code: erroTroca.code,
          message: erroTroca.message,
        });
        setErro(mensagemDoErroDeSenha(erroTroca));
        return;
      }

      // 3. Sai dos outros aparelhos e navegadores; esta sessão continua.
      const { error: erroSair } = await supabase.auth.signOut({ scope: 'others' });
      if (erroSair) {
        logger.warn('[SecuritySettings] signOut(others) falhou', {
          code: erroSair.code,
          message: erroSair.message,
        });
        setSucesso(SENHA_TROCADA_SEM_SAIR_DOS_OUTROS);
      } else {
        setSucesso(SENHA_TROCADA);
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      logger.warn('[SecuritySettings] troca de senha falhou', {
        message: err instanceof Error ? err.message : 'desconhecido',
      });
      setErro(SENHA_ERRO_GENERICO);
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Segurança da conta</CardTitle>
        <CardDescription>
          Troque a senha que você usa para entrar. Os outros aparelhos e navegadores saem da sua conta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Senha atual</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Digite sua senha atual"
              autoComplete="current-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">Nova senha</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Digite sua nova senha"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">Pelo menos {MIN_SENHA} caracteres.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Repita a nova senha</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Digite a nova senha de novo"
              autoComplete="new-password"
            />
          </div>

          {erro && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          {sucesso && (
            <Alert role="status">
              <Check className="h-4 w-4" />
              <AlertDescription>{sucesso}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={isChanging}>
            {isChanging ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {isChanging ? 'Salvando...' : 'Salvar nova senha'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

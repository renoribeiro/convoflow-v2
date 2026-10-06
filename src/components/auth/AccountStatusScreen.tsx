import { MailCheck, UserX, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

type BlockedStatus = 'pending' | 'suspended' | 'deleted';

interface AccountStatusScreenProps {
  status: BlockedStatus;
}

const COPY: Record<BlockedStatus, { title: string; message: string; hint: string }> = {
  pending: {
    title: 'Cadastro incompleto',
    message: 'Complete seu cadastro para acessar o sistema.',
    hint: 'Abra o convite que enviamos por e-mail e defina sua senha. Se o link expirou, peça um novo ao administrador da sua Conta.',
  },
  suspended: {
    title: 'Conta suspensa',
    message: 'Sua conta foi suspensa. Entre em contato com o administrador.',
    hint: 'O acesso pode ser devolvido a qualquer momento por quem administra a sua Conta.',
  },
  deleted: {
    title: 'Conta excluída',
    message: 'Esta conta foi excluída.',
    hint: 'Se isso foi um engano, fale com o administrador da sua Conta.',
  },
};

/**
 * Tela de bloqueio por estado da conta de usuário (profiles.status).
 *
 * Só `status = 'active'` usa o sistema. Ocupa a tela inteira — sem
 * sidebar/menu — mesmo formato da PaywallScreen, que bloqueia por Conta não
 * paga. Aqui o bloqueio é por USUÁRIO.
 *
 * Isto é a metade visível do bloqueio. A metade que vale é o servidor:
 * `get_current_user_tenant_id()` e `has_capability()` devolvem NULL/FALSE para
 * quem não está 'active', então nenhuma policy de RLS entrega dado — não
 * adianta burlar a tela.
 */
export const AccountStatusScreen = ({ status }: AccountStatusScreenProps) => {
  const { logout } = useAuth();
  const copy = COPY[status];
  const Icon = status === 'pending' ? MailCheck : UserX;

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Icon className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">{copy.title}</CardTitle>
          <CardDescription>{copy.message}</CardDescription>
        </CardHeader>

        <CardContent>
          <p className="text-center text-sm text-muted-foreground">{copy.hint}</p>
        </CardContent>

        <CardFooter className="justify-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

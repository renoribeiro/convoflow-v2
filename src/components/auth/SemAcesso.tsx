import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { aQuemPedir, type AcessoATela } from '@/lib/access/telas';
import type { UserRole } from '@/types/userHierarchy';

interface SemAcessoProps {
  papel: UserRole | null;
  motivo: Exclude<AcessoATela, 'liberado'>;
}

/**
 * O que aparece quando alguém abre pelo endereço uma tela que o cargo dele não
 * alcança, ou cujo módulo está desligado. Antes a pessoa era jogada para o
 * Dashboard (ou, com o módulo desligado, para a página de vendas) sem saber
 * por quê.
 */
export const SemAcesso = ({ papel, motivo }: SemAcessoProps) => (
  <div className="flex min-h-[50vh] items-center justify-center p-4" data-testid="sem-acesso">
    <div className="max-w-md space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold">Você não tem acesso a esta tela</h1>
      <p className="text-sm text-muted-foreground">{aQuemPedir(papel, motivo)}</p>
      <Button asChild>
        <Link to="/dashboard">Voltar ao Dashboard</Link>
      </Button>
    </div>
  </div>
);

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RoleBadge } from './RoleBadge';
import { UserStatusBadge } from './UserStatusBadge';
import { UserRow } from '@/hooks/users/useUsers';
import { ROLE_DESCRIPTIONS } from '@/lib/roleDescriptions';

interface Props {
  /** Linha a mostrar. `null` mantém o diálogo fechado. */
  row: UserRow | null;
  /** Nome da Loja/Conta a que a pessoa pertence, quando quem chama souber. */
  tenantName?: string;
  onClose: () => void;
}

const Linha = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
    <span className="text-sm text-muted-foreground shrink-0">{rotulo}</span>
    <span className="text-sm text-right min-w-0 break-words">{children}</span>
  </div>
);

const dataOu = (valor: string | null, vazio: string) =>
  valor ? format(new Date(valor), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : vazio;

/**
 * Detalhes de uma pessoa da equipe.
 *
 * Responde as perguntas que a tabela não cabe: em QUAL Loja ela está, o que o
 * cargo dela permite, e desde quando ela existe. A pergunta "em que loja" é a
 * que mais aparece — a hierarquia Conta › Loja › pessoa não estava visível em
 * lugar nenhum da interface.
 */
export function UserDetailsDialog({ row, tenantName, onClose }: Props) {
  const aberto = row !== null;
  const nome = row
    ? [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Sem nome'
    : '';
  const descricao = row ? ROLE_DESCRIPTIONS[row.role] : undefined;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{nome}</DialogTitle>
          <DialogDescription>
            {descricao?.summary ?? 'Detalhes do acesso desta pessoa.'}
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            <div>
              <Linha rotulo="Função">
                <RoleBadge role={row.role} />
              </Linha>
              <Linha rotulo="Situação">
                <UserStatusBadge status={row.status} />
              </Linha>
              <Linha rotulo="Loja">{tenantName || '—'}</Linha>
              <Linha rotulo="Telefone">{row.phone || '—'}</Linha>
              <Linha rotulo="Último acesso">{dataOu(row.last_login_at, 'Nunca entrou')}</Linha>
              <Linha rotulo="Total de acessos">{row.login_count}</Linha>
              <Linha rotulo="Criado em">{dataOu(row.created_at, '—')}</Linha>
            </div>

            {descricao && (
              <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
                <p className="text-xs font-medium">O que este cargo alcança</p>
                <ul className="space-y-1">
                  {descricao.can.map((item) => (
                    <li key={item} className="text-xs text-muted-foreground">
                      ✓ {item}
                    </li>
                  ))}
                  {descricao.cannot.map((item) => (
                    <li key={item} className="text-xs text-muted-foreground">
                      ✕ {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

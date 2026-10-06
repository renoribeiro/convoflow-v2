/**
 * Cartão que explica, embaixo do seletor de "Função", o que a função escolhida
 * pode e não pode fazer. Some quando não há função escolhida.
 *
 * É só texto: não esconde botão, não bloqueia nada e não participa de nenhuma
 * checagem de permissão. O conteúdo vem de `src/lib/roleDescriptions.ts`.
 *
 * Precisa caber dentro de um <Dialog> sem fazer o modal rolar, por isso as
 * listas são cortadas em MAX_VISIBLE_ITEMS e ficam em duas colunas no desktop.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { getRoleDescription, STORE_CAP_ITEMS } from '@/lib/roleDescriptions';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/userHierarchy';

/**
 * Quantos itens de cada lista aparecem antes de virar "+N outras".
 *
 * Em 5 nenhuma lista de hoje é cortada — a maior tem exatamente 5 itens. O
 * corte continua aqui como rede de segurança para o dia em que alguém
 * acrescentar um sexto item e o cartão começar a esticar o modal.
 */
const MAX_VISIBLE_ITEMS = 5;

interface RoleDescriptionCardProps {
  role: UserRole | null;
  /**
   * Marque quando o formulário já mostrar o limite de usuários por loja
   * ("Cada loja tem no máximo 1 gestor." / "...5 atendentes."). O cartão então
   * omite as frases que repetiriam esse aviso — ver STORE_CAP_ITEMS.
   */
  hideStoreCaps?: boolean;
  className?: string;
}

const overflowLabel = (hidden: number): string =>
  hidden === 1 ? '+1 outra' : `+${hidden} outras`;

interface ItemListProps {
  title: string;
  items: string[];
  tone: 'can' | 'cannot';
}

const ItemList = ({ title, items, tone }: ItemListProps) => {
  if (items.length === 0) return null;

  const visible = items.slice(0, MAX_VISIBLE_ITEMS);
  const hidden = items.length - visible.length;
  const Icon = tone === 'can' ? Check : X;

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-0.5">
        {visible.map((item) => (
          <li key={item} className="flex items-start gap-1.5">
            <Icon
              aria-hidden="true"
              className={cn(
                'mt-0.5 h-3 w-3 shrink-0',
                tone === 'can'
                  ? 'text-green-600 dark:text-green-500'
                  : 'text-muted-foreground',
              )}
            />
            <span
              className={tone === 'can' ? 'text-foreground' : 'text-muted-foreground'}
            >
              {item}
            </span>
          </li>
        ))}
        {hidden > 0 && (
          // 18px = ícone (12) + gap (6), para alinhar com o texto acima.
          <li className="pl-[18px] text-muted-foreground">{overflowLabel(hidden)}</li>
        )}
      </ul>
    </div>
  );
};

export const RoleDescriptionCard = ({
  role,
  hideStoreCaps = false,
  className,
}: RoleDescriptionCardProps) => {
  const reduceMotion = useReducedMotion();

  // Busca exata (ver getRoleDescription): cargo legado ou vazio não tem cartão,
  // do mesmo jeito que o <Select> fica no placeholder nesses casos.
  const entry = getRoleDescription(role);
  if (!entry) return null;

  const omit = hideStoreCaps && role ? (STORE_CAP_ITEMS[role] ?? []) : [];
  const keep = (items: string[]) =>
    omit.length === 0 ? items : items.filter((item) => !omit.includes(item));

  return (
    // A região viva fica fora do AnimatePresence: assim ela sobrevive à troca
    // de função e o leitor de tela anuncia a descrição nova.
    <div aria-live="polite" className={className}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={role}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="mt-2 space-y-2 rounded-md bg-muted/50 p-3 text-xs">
            <p className="text-muted-foreground">{entry.summary}</p>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <ItemList title="Pode" items={keep(entry.can)} tone="can" />
              <ItemList title="Não pode" items={keep(entry.cannot)} tone="cannot" />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

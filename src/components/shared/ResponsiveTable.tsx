import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/**
 * Tabela que vira lista de cartões no celular.
 *
 * UM PADRÃO, NÃO SETE. Toda tabela de dados do produto (Contatos, Equipe,
 * Usuários, Automações, Cupons, Faturamento, Limites) passa por aqui: acima
 * de `md` (768px) é a <Table> do shadcn de sempre; abaixo, cada linha vira um
 * cartão empilhado. A decisão de 2026-09-16 foi ter o MESMO comportamento em
 * todas em vez de sete compromissos diferentes — cartão é a única forma que
 * dá para usar num telefone.
 *
 * COMO SE USA. As colunas são descritas uma vez e servem aos dois modos:
 *
 *   <ResponsiveTable
 *     rows={contatos}
 *     rowKey={(c) => c.id}
 *     columns={[
 *       { key: 'nome',   header: 'Contato', cell: (c) => <Nome c={c} />, card: 'title' },
 *       { key: 'etapa',  header: 'Etapa',   cell: (c) => <Badge>…</Badge>, card: 'badge' },
 *       { key: 'fonte',  header: 'Fonte',   cell: (c) => c.fonte, hideBelow: '2xl' },
 *     ]}
 *     actions={(c) => <MenuDeAcoes c={c} />}
 *   />
 *
 * `card` diz onde o valor entra no cartão (ver CardSlot). `hideBelow` esconde a
 * coluna SÓ na tabela, abaixo de um breakpoint — é o remédio para a tabela que
 * não cabe a 1280px; o cartão continua mostrando o valor. A coluna de ações é
 * sticky à direita e ganha uma sombra quando a tabela rola de lado, para o
 * botão nunca ficar escondido atrás da rolagem invisível do macOS.
 *
 * O QUE ELA NÃO FAZ. Não ordena, não filtra, não pagina, não seleciona: quem
 * chama continua dono disso (as sete tabelas fazem isso fora, e nenhuma tem
 * seleção em massa). As linhas chegam prontas e são as mesmas nos dois modos.
 *
 * CUSTO PARA QUEM ADICIONA UMA TABELA. Escrever as colunas como array em vez
 * de JSX, e decidir o `card` de cada uma (o que identifica a linha é 'title';
 * o que se procura de relance é 'badge' ou 'field'; o que raramente se lê
 * fica 'hidden' e vai para o diálogo de detalhes, se existir). Em troca vêm
 * de graça: cartões no celular, colunas escondidas por breakpoint, ações
 * sticky, sombra de rolagem, estados de carregando/vazio/erro nos dois modos.
 */

/**
 * Onde a coluna aparece no cartão.
 * - 'title'    — a linha de cima, em destaque. É o que identifica a linha.
 * - 'subtitle' — logo abaixo do título, apagado (telefone, e-mail, gatilho…).
 * - 'badge'    — chips na linha abaixo do subtítulo (status, etapa, etiquetas).
 * - 'field'    — par rótulo/valor na grade de dois por linha (o padrão).
 * - 'hidden'   — não entra no cartão; o valor vive no diálogo de detalhes.
 */
export type CardSlot = 'title' | 'subtitle' | 'badge' | 'field' | 'hidden';

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface ResponsiveColumn<T> {
  key: string;
  /** Cabeçalho da coluna na tabela; também é o rótulo do campo no cartão. */
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Onde o valor entra no cartão. Padrão: 'field'. */
  card?: CardSlot;
  /** Rótulo no cartão, quando diferente do cabeçalho (ex.: cabeçalho vazio). */
  cardLabel?: ReactNode;
  /** Render alternativo para o cartão (ex.: sem truncar, ou sem o avatar). */
  cardCell?: (row: T) => ReactNode;
  /** Campo do cartão ocupa a linha inteira da grade (texto longo, controles). */
  cardFull?: boolean;
  /** Esconde a coluna NA TABELA abaixo deste breakpoint. O cartão não muda. */
  hideBelow?: Breakpoint;
  headClassName?: string;
  cellClassName?: string;
}

export interface ResponsiveTableProps<T> {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /**
   * Ações da linha. Na tabela viram a última coluna (sticky à direita); no
   * cartão ficam no canto superior direito. Cliques aqui não disparam
   * `onRowClick`.
   */
  actions?: (row: T) => ReactNode;
  /** Cabeçalho da coluna de ações. Padrão: "Ações" só para leitor de tela. */
  actionsHeader?: ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** Carregando: linhas de esqueleto nos dois modos. */
  loading?: boolean;
  loadingRows?: number;
  /** Sem linhas (e sem carregar): o que mostrar. */
  empty?: ReactNode;
  /** Erro de carga: mostrado no lugar das linhas. */
  error?: ReactNode;
  /** Nome acessível da tabela e da lista. */
  ariaLabel?: string;
  /**
   * Força um modo. 'auto' (padrão) decide pela largura da janela: cartões
   * abaixo de md. Útil em testes e onde a página já decide o layout.
   */
  mode?: 'auto' | 'table' | 'cards';
  className?: string;
}

const HIDE_BELOW: Record<Breakpoint, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
};

const STICKY_ACTIONS = 'sticky right-0 bg-card text-right';

/**
 * Observa se a <table> está mais larga que a caixa que a envolve (a div
 * `overflow-auto` do shadcn) e se o usuário já rolou até o fim. Serve para
 * ligar a sombra da coluna sticky — a pista de que há mais coluna à esquerda
 * dela, já que o macOS esconde a barra de rolagem.
 */
function useHorizontalOverflow(tableRef: React.RefObject<HTMLTableElement>, active: boolean) {
  const [state, setState] = useState({ overflowing: false, atEnd: true });

  useEffect(() => {
    if (!active) return;
    const scroller = tableRef.current?.parentElement;
    if (!scroller) return;
    const update = () => {
      const overflowing = scroller.scrollWidth > scroller.clientWidth + 1;
      const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 1;
      setState((prev) => (prev.overflowing === overflowing && prev.atEnd === atEnd ? prev : { overflowing, atEnd }));
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(scroller);
    if (tableRef.current) observer?.observe(tableRef.current);
    return () => {
      scroller.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [tableRef, active]);

  return state;
}

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  actions,
  actionsHeader,
  onRowClick,
  rowClassName,
  loading = false,
  loadingRows = 3,
  empty,
  error,
  ariaLabel,
  mode = 'auto',
  className,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();
  const asCards = mode === 'cards' || (mode === 'auto' && isMobile);

  const tableRef = useRef<HTMLTableElement>(null);
  const overflow = useHorizontalOverflow(tableRef, !asCards);
  // Sombra na borda esquerda da coluna sticky enquanto houver coluna escondida atrás dela.
  const stickyShadow = overflow.overflowing && !overflow.atEnd;

  // ----------------------------------------------------------------- cards --
  if (asCards) {
    const title = columns.filter((c) => c.card === 'title');
    const subtitle = columns.filter((c) => c.card === 'subtitle');
    const badges = columns.filter((c) => c.card === 'badge');
    const fields = columns.filter((c) => (c.card ?? 'field') === 'field');
    const render = (c: ResponsiveColumn<T>, row: T) => (c.cardCell ?? c.cell)(row);

    let body: ReactNode;
    if (loading) {
      body = Array.from({ length: loadingRows }).map((_, i) => (
        <li key={`skeleton-${i}`} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
        </li>
      ));
    } else if (error) {
      body = <li className="rounded-lg border border-destructive/40 bg-card p-6 text-center text-sm text-destructive">{error}</li>;
    } else if (rows.length === 0) {
      body = <li className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">{empty ?? 'Nada por aqui.'}</li>;
    } else {
      body = rows.map((row) => (
        <li
          key={rowKey(row)}
          data-responsive-row=""
          className={cn(
            'rounded-lg border border-border bg-card p-4',
            onRowClick && 'cursor-pointer transition-colors hover:bg-muted/40',
            rowClassName?.(row),
          )}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
        >
          {/* O título tem pelo menos 60% da largura; um grupo de ações largo
              (vários botões) desce para a linha de baixo em vez de espremer o
              título ou estourar o cartão. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 grow basis-[60%]">
              {title.map((c) => (
                <div key={c.key} className="min-w-0 font-medium break-words">{render(c, row)}</div>
              ))}
              {subtitle.map((c) => (
                <div key={c.key} className="min-w-0 text-sm text-muted-foreground break-words">{render(c, row)}</div>
              ))}
              {badges.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {badges.map((c) => (
                    <div key={c.key} className="flex flex-wrap items-center gap-1.5">{render(c, row)}</div>
                  ))}
                </div>
              )}
            </div>
            {actions && (
              <div data-responsive-actions="" className="-mr-1 -mt-1 ml-auto max-w-full shrink-0" onClick={(e) => e.stopPropagation()}>
                {actions(row)}
              </div>
            )}
          </div>
          {fields.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {fields.map((c) => (
                <div key={c.key} className={cn('min-w-0', c.cardFull && 'col-span-2')}>
                  <dt className="text-xs text-muted-foreground">{c.cardLabel ?? c.header}</dt>
                  <dd className="min-w-0 break-words">{render(c, row)}</dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ));
    }

    return (
      <ul role="list" aria-label={ariaLabel} data-responsive-table="cards" className={cn('space-y-3', className)}>
        {body}
      </ul>
    );
  }

  // ----------------------------------------------------------------- table --
  const colCount = columns.length + (actions ? 1 : 0);

  let body: ReactNode;
  if (loading) {
    body = Array.from({ length: loadingRows }).map((_, i) => (
      <TableRow key={`skeleton-${i}`}>
        {columns.map((c) => (
          <TableCell key={c.key} className={cn(c.hideBelow && HIDE_BELOW[c.hideBelow], c.cellClassName)}>
            <Skeleton className="h-5 w-full" />
          </TableCell>
        ))}
        {actions && (
          <TableCell className={STICKY_ACTIONS}>
            <Skeleton className="ml-auto h-8 w-8" />
          </TableCell>
        )}
      </TableRow>
    ));
  } else if (error) {
    body = (
      <TableRow>
        <TableCell colSpan={colCount} className="py-10 text-center text-sm text-destructive">{error}</TableCell>
      </TableRow>
    );
  } else if (rows.length === 0) {
    body = (
      <TableRow>
        <TableCell colSpan={colCount} className="py-8 text-center text-muted-foreground">{empty ?? 'Nada por aqui.'}</TableCell>
      </TableRow>
    );
  } else {
    body = rows.map((row) => (
      <TableRow
        key={rowKey(row)}
        data-responsive-row=""
        className={cn('group/row', onRowClick && 'cursor-pointer', rowClassName?.(row))}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
      >
        {columns.map((c) => (
          <TableCell key={c.key} className={cn(c.hideBelow && HIDE_BELOW[c.hideBelow], c.cellClassName)}>
            {c.cell(row)}
          </TableCell>
        ))}
        {actions && (
          <TableCell
            data-responsive-actions=""
            className={cn(
              STICKY_ACTIONS,
              'group-hover/row:bg-muted',
              stickyShadow && 'shadow-[-8px_0_10px_-8px_rgba(0,0,0,0.25)]',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {actions(row)}
          </TableCell>
        )}
      </TableRow>
    ));
  }

  return (
    <Table ref={tableRef} aria-label={ariaLabel} data-responsive-table="table" className={className}>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.key} className={cn(c.hideBelow && HIDE_BELOW[c.hideBelow], c.headClassName)}>
              {c.header}
            </TableHead>
          ))}
          {actions && (
            <TableHead className={cn(STICKY_ACTIONS, stickyShadow && 'shadow-[-8px_0_10px_-8px_rgba(0,0,0,0.25)]')}>
              {actionsHeader ?? <span className="sr-only">Ações</span>}
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>{body}</TableBody>
    </Table>
  );
}

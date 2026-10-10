import { formatFullPtBR, formatRelativePtBR } from '@/lib/relativeTime';

interface RelativeTimeProps {
  /** ISO da data. Vazio mostra `empty`. */
  value: string | null | undefined;
  /** O que mostrar quando não há data ("Nunca", "—"…). */
  empty: string;
  /** Dica ao passar o mouse quando não há data. */
  emptyTitle?: string;
  /** Referência de "agora" (testes). */
  now?: Date;
}

/** "há 2 horas", com a data completa ao passar o mouse. */
export function RelativeTime({ value, empty, emptyTitle, now }: RelativeTimeProps) {
  if (!value) {
    return (
      <span className="text-muted-foreground" title={emptyTitle}>
        {empty}
      </span>
    );
  }
  return (
    <time dateTime={value} title={formatFullPtBR(value)} className="whitespace-nowrap">
      {formatRelativePtBR(value, now)}
    </time>
  );
}

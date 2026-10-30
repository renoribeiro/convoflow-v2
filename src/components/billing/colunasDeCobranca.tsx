import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { NotaFiscalCelula } from '@/components/billing/NotaFiscalCelula';
import type { ResponsiveColumn } from '@/components/shared/ResponsiveTable';
import { formatCents, formatDate } from '@/lib/billing/adminBilling';
import {
  linkDoStripe,
  SITUACAO_LABEL,
  situacaoDaCobranca,
  type Cobranca,
} from '@/lib/billing/cobrancas';

/** As colunas das duas listas (Conta e superadmin). */
export function colunasDeCobranca({
  comConta,
  notaVisivel,
  ehSuperadmin,
}: {
  comConta: boolean;
  notaVisivel: boolean;
  ehSuperadmin: boolean;
}): ResponsiveColumn<Cobranca>[] {
  const colunas: ResponsiveColumn<Cobranca>[] = [
    { key: 'data', header: 'Data', card: 'title', cell: (c) => formatDate(c.paid_at) },
  ];
  if (comConta) {
    colunas.push({
      key: 'conta',
      header: 'Conta',
      card: 'subtitle',
      cellClassName: 'font-medium',
      cell: (c) => c.conta?.name ?? (c.tenant_id ? '—' : 'Conta não identificada'),
    });
  }
  colunas.push(
    { key: 'valor', header: 'Valor', cell: (c) => formatCents(c.amount_paid_cents, c.currency) },
    {
      key: 'situacao',
      header: 'Situação',
      card: 'badge',
      cell: (c) => {
        const s = situacaoDaCobranca(c);
        return (
          <span className="flex flex-col gap-0.5">
            <Badge
              variant={s === 'paga' ? 'default' : 'outline'}
              className={s === 'paga' ? 'bg-success/10 text-success hover:bg-success/10' : s === 'teste' ? '' : 'border-warning/30 text-warning'}
            >
              {SITUACAO_LABEL[s]}
            </Badge>
            {c.amount_refunded_cents > 0 ? (
              <span className="text-xs text-muted-foreground">
                Devolvido {formatCents(c.amount_refunded_cents, c.currency)} em {formatDate(c.refunded_at)}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'periodo',
      header: 'Período',
      hideBelow: 'lg',
      cell: (c) => (c.period_start && c.period_end ? `${formatDate(c.period_start)} a ${formatDate(c.period_end)}` : '—'),
    },
  );
  if (notaVisivel) {
    colunas.push({ key: 'nota', header: 'Nota fiscal', cell: (c) => <NotaFiscalCelula cobranca={c} ehSuperadmin={ehSuperadmin} /> });
  }
  colunas.push({
    key: 'recibo',
    header: 'Recibo',
    cell: (c) => {
      const link = linkDoStripe(c.hosted_invoice_url);
      return link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-primary hover:underline">
          Ver no Stripe <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        '—'
      );
    },
  });
  return colunas;
}

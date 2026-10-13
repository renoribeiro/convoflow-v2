import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ResponsiveColumn } from '@/components/shared/ResponsiveTable';
import { formatCents, formatDate } from '@/lib/billing/adminBilling';
import {
  linkDoStripe,
  NOTA_FISCAL_VISIVEL,
  rotuloDaNota,
  SITUACAO_LABEL,
  situacaoDaCobranca,
  type Cobranca,
} from '@/lib/billing/cobrancas';

/** As colunas das duas listas (Conta e superadmin). */
export function colunasDeCobranca({ comConta }: { comConta: boolean }): ResponsiveColumn<Cobranca>[] {
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
              className={s === 'paga' ? 'bg-green-100 text-green-800 hover:bg-green-100' : s === 'teste' ? '' : 'border-amber-300 text-amber-900'}
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
  if (NOTA_FISCAL_VISIVEL) {
    colunas.push({ key: 'nota', header: 'Nota fiscal', cell: (c) => rotuloDaNota(c.nota_status) });
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

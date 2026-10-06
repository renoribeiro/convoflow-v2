/**
 * Selo de status de um template da Meta.
 *
 * Existe para que a tela de Templates e o diálogo de envio da conversa não
 * divirjam: o mesmo status tem de ter a mesma cor e a mesma palavra nos dois
 * lugares. Antes o tratamento vivia solto dentro do SendTemplateDialog.
 *
 * As três primeiras cores são as que já estavam em produção — não mexa nelas
 * sem mexer nas duas telas juntas.
 */
import { Badge } from '@/components/ui/badge';
import { templateStatusLabel } from '@/lib/templates/metaTemplates';

interface Props {
  status?: string;
}

export function TemplateStatusBadge({ status }: Props) {
  const s = String(status || '').toUpperCase();
  if (s === 'APPROVED') return <Badge className="bg-success text-success-foreground">Aprovado</Badge>;
  if (s === 'PENDING') return <Badge variant="secondary">Pendente</Badge>;
  if (s === 'REJECTED') return <Badge variant="destructive">Rejeitado</Badge>;
  // PAUSED e DISABLED caíam aqui em inglês; agora passam pelo tradutor e o
  // status que a Meta inventar amanhã continua aparecendo cru, de propósito.
  if (s) return <Badge variant="outline">{templateStatusLabel(s)}</Badge>;
  return null;
}

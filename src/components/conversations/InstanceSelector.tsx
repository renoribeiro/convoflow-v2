import { Layers } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { providerLabel, type ProviderType } from '@/services/whatsapp';
import type { ActiveInstanceWithAdapter } from '@/hooks/useWhatsAppApi';

/** Valor da opção "todas". Quem usa o seletor traduz para `null` (sem filtro). */
export const ALL_INSTANCES_VALUE = '__all__';

interface InstanceSelectorProps {
  instances: ActiveInstanceWithAdapter[];
  selectedId: string | null;
  /** Recebe o id da instância, ou ALL_INSTANCES_VALUE para "todas". */
  onChange: (id: string) => void;
  /** Rótulo da opção "todas" (muda com o canal em Conversas). */
  allLabel?: string;
}

function statusBadge(status: string | null) {
  const s = (status ?? '').toLowerCase();
  if (s === 'connected' || s === 'open' || s === 'working') {
    return <Badge variant="default" className="bg-success/15 text-success border-success/30">Conectada</Badge>;
  }
  if (s === 'connecting' || s === 'qrcode') {
    return <Badge variant="outline" className="border-warning/40 text-warning">Conectando</Badge>;
  }
  return <Badge variant="outline" className="border-destructive/40 text-destructive">Desconectada</Badge>;
}

export function InstanceSelector({
  instances,
  selectedId,
  onChange,
  allLabel = 'Todas as instâncias',
}: InstanceSelectorProps) {
  if (!instances.length) {
    return (
      <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md px-3 py-2">
        Nenhuma instância de WhatsApp cadastrada.
      </div>
    );
  }

  // Nada escolhido (ou uma instância que não está nesta lista) = "todas". Antes
  // o seletor mostrava a primeira instância com a lista SEM filtro — dizia uma
  // coisa e mostrava outra, e não havia como voltar para "todas".
  const current = instances.find((x) => x.row.id === selectedId) ?? null;

  return (
    <div className="flex items-center gap-2 w-full min-w-0">
      <Select value={current ? current.row.id : ALL_INSTANCES_VALUE} onValueChange={onChange}>
        <SelectTrigger className="h-auto py-1.5 flex-1 min-w-0 text-xs" aria-label="Filtrar por instância">
          <SelectValue asChild>
            {current ? (
              <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
                <Avatar className="w-7 h-7 flex-shrink-0">
                  {current.row.profile_picture_url && (
                    <AvatarImage src={current.row.profile_picture_url} alt={current.row.name} />
                  )}
                  <AvatarFallback className="text-[10px]">
                    {current.row.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1 leading-tight">
                  <span className="truncate font-medium text-xs">{current.row.name}</span>
                  <span className="truncate text-muted-foreground text-[10px]">
                    {providerLabel((current.row.provider as ProviderType | null) ?? 'evolution')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                </span>
                <span className="truncate font-medium text-xs">{allLabel}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_INSTANCES_VALUE}>
            <div className="flex items-center gap-2 text-xs">
              <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="font-medium">{allLabel}</span>
            </div>
          </SelectItem>
          {instances.map((it) => (
            <SelectItem key={it.row.id} value={it.row.id}>
              <div className="flex items-center justify-between w-full gap-2">
                <div className="flex items-center gap-2">
                  <Avatar className="w-5 h-5">
                    {it.row.profile_picture_url && (
                      <AvatarImage src={it.row.profile_picture_url} alt={it.row.name} />
                    )}
                    <AvatarFallback className="text-[10px]">
                      {it.row.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-xs">
                    <p className="font-medium">{it.row.name}</p>
                    <p className="text-muted-foreground">{it.providerLabel}</p>
                  </div>
                </div>
                {statusBadge(it.row.status)}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current && <div className="flex-shrink-0">{statusBadge(current.row.status)}</div>}
    </div>
  );
}

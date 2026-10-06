import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Filter, X } from 'lucide-react';
import { useTags } from '@/hooks/useTags';
import { useOwnerFilterOptions } from '@/hooks/useOwnerFilterOptions';
import { memberInitials } from '@/hooks/useTeamDirectory';
import { TagBadge } from '@/components/etiquetas/TagBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface ConversationsFilterState {
  hasUnread: boolean;
  dateFrom: Date | null;
  dateTo: Date | null;
  isArchived: boolean;
  /**
   * Etiquetas do contato. Várias marcadas = a conversa entra se o contato
   * tiver QUALQUER uma delas — o mesmo "qualquer" de Contatos e do público
   * por etiqueta das campanhas.
   */
  tagIds: string[];
  /**
   * Responsáveis (profiles.id). Várias pessoas marcadas = a conversa entra se
   * estiver com QUALQUER uma delas — uma conversa tem um responsável só, então
   * "todas ao mesmo tempo" seria sempre vazio. Só gestor/gerente marcam; para
   * o atendente a seção não existe e a lista fica vazia.
   */
  assignedProfileIds: string[];
}

export const DEFAULT_FILTER_STATE: ConversationsFilterState = {
  hasUnread: false,
  dateFrom: null,
  dateTo: null,
  isArchived: false,
  tagIds: [],
  assignedProfileIds: [],
};

/**
 * Quantos recortes estão ligados — o número do selo no botão "Filtros".
 *
 * Período conta UMA vez, com "De", com "Até" ou com os dois: é um filtro só
 * ("entre tal e tal dia"). Etiquetas idem: uma ou cinco marcadas, é um recorte.
 * Responsáveis idem.
 */
export const countActiveFilters = (filters: ConversationsFilterState): number =>
  (filters.hasUnread ? 1 : 0) +
  (filters.isArchived ? 1 : 0) +
  (filters.dateFrom || filters.dateTo ? 1 : 0) +
  (filters.tagIds.length > 0 ? 1 : 0) +
  (filters.assignedProfileIds.length > 0 ? 1 : 0);

interface ConversationFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: ConversationsFilterState;
  onChange: (next: ConversationsFilterState) => void;
}

/**
 * Recortes de servidor da lista de Conversas. Cada mudança aqui vai direto para
 * `onChange` — a lista reage na hora, por isso o botão de baixo é "Fechar", e
 * não "Aplicar": não existe um passo de aplicar.
 *
 * A lista de etiquetas vem do mesmo `useTags` do diálogo "Etiquetar lead",
 * então é a da Loja aberta no seletor, e só ela.
 */
export function ConversationFiltersModal({ isOpen, onClose, value, onChange }: ConversationFiltersModalProps) {
  const { tags, isLoading: isLoadingTags } = useTags();
  // Seção "Responsável": só existe para gestor/gerente (o mesmo gate da pílula
  // "Responsável indisponível"). Para o atendente `canFilter` é false e a
  // seção não é montada — não é escondida, não existe.
  const { canFilter: canFilterByOwner, options: owners, isLoading: isLoadingOwners } = useOwnerFilterOptions();
  const update = (patch: Partial<ConversationsFilterState>) => onChange({ ...value, ...patch });
  const selectedTags = new Set(value.tagIds);
  const selectedOwners = new Set(value.assignedProfileIds);

  const toggleTag = (tagId: string) => {
    update({
      tagIds: selectedTags.has(tagId)
        ? value.tagIds.filter((id) => id !== tagId)
        : [...value.tagIds, tagId],
    });
  };

  const toggleOwner = (profileId: string) => {
    update({
      assignedProfileIds: selectedOwners.has(profileId)
        ? value.assignedProfileIds.filter((id) => id !== profileId)
        : [...value.assignedProfileIds, profileId],
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtrar Conversas
          </DialogTitle>
          <DialogDescription>
            Cada opção vale na hora, assim que você marca. Os filtros se somam às
            pílulas acima da lista.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hasUnread"
              checked={value.hasUnread}
              onCheckedChange={(checked) => update({ hasUnread: !!checked })}
            />
            <Label htmlFor="hasUnread">Só conversas com mensagens não lidas</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isArchived"
              checked={value.isArchived}
              onCheckedChange={(checked) => update({ isArchived: !!checked })}
            />
            <Label htmlFor="isArchived">Só conversas arquivadas (as ativas somem da lista)</Label>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Período da última mensagem</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">De</Label>
                <DatePicker
                  date={value.dateFrom ?? undefined}
                  onDateChange={(date) => update({ dateFrom: date ?? null })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Até (o dia inteiro)</Label>
                <DatePicker
                  date={value.dateTo ?? undefined}
                  onDateChange={(date) => update({ dateTo: date ?? null })}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Etiquetas do contato</Label>
            <p className="text-xs text-muted-foreground">
              Marque uma ou mais: entra quem tem qualquer uma delas.
            </p>
            <div
              className="max-h-[30vh] overflow-y-auto space-y-2 py-1"
              role="group"
              aria-label="Etiquetas do contato"
            >
              {isLoadingTags ? (
                <>
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </>
              ) : tags.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Nenhuma etiqueta nesta Loja ainda. Crie no botão "Etiquetas", no topo das Conversas.
                </p>
              ) : (
                tags.map((tag) => {
                  const isOn = selectedTags.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      role="checkbox"
                      aria-checked={isOn}
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                        isOn ? 'bg-accent border-ring' : 'hover:bg-accent/50',
                      )}
                    >
                      <TagBadge name={tag.name} color={tag.color} />
                      {isOn && <Check className="h-4 w-4 text-foreground shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {canFilterByOwner && (
            <>
              <Separator />

              <div className="space-y-2">
                <Label>Responsável pela conversa</Label>
                <p className="text-xs text-muted-foreground">
                  Marque uma ou mais pessoas: entra o que está com qualquer uma delas. Quem saiu do
                  time mas ainda tem conversa aparece com o motivo ao lado do nome.
                </p>
                <div
                  className="max-h-[30vh] overflow-y-auto space-y-2 py-1"
                  role="group"
                  aria-label="Responsável pela conversa"
                >
                  {isLoadingOwners && owners.length === 0 ? (
                    <>
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </>
                  ) : owners.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      Ninguém no time desta Loja ainda. Convide pessoas em Equipe, no menu ao lado.
                    </p>
                  ) : (
                    owners.map((owner) => {
                      const isOn = selectedOwners.has(owner.id);
                      return (
                        <button
                          key={owner.id}
                          type="button"
                          role="checkbox"
                          aria-checked={isOn}
                          onClick={() => toggleOwner(owner.id)}
                          className={cn(
                            'w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                            isOn ? 'bg-accent border-ring' : 'hover:bg-accent/50',
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex items-center gap-2 text-sm truncate',
                              owner.reason && 'text-muted-foreground',
                            )}
                          >
                            <Avatar className="h-5 w-5 flex-shrink-0">
                              {owner.avatar_url && <AvatarImage src={owner.avatar_url} alt="" />}
                              <AvatarFallback className="bg-accent/20 text-accent text-[10px]">
                                {memberInitials(owner)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate">{owner.label}</span>
                          </span>
                          {isOn && <Check className="h-4 w-4 text-foreground shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => onChange(DEFAULT_FILTER_STATE)}>
            <X className="w-4 h-4 mr-2" />
            Limpar
          </Button>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

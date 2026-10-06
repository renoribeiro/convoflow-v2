import { useMemo, useState } from 'react';
import { ArrowRightLeft, Check, ChevronDown, Hand, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTenant } from '@/contexts/TenantContext';
import {
  memberDisplayName,
  memberInitials,
  useTeamDirectory,
  useTeamMemberLookup,
  type TeamMember,
} from '@/hooks/useTeamDirectory';
import {
  useAssumeConversation,
  useTransferConversation,
} from '@/hooks/useConversationAssignment';
import { useConversationVisibilityConfig } from '@/hooks/useConversationVisibilityConfig';
import { OwnerInline } from './OwnerChip';

interface ConversationOwnerControlProps {
  conversationId: string;
  /**
   * `assigned_profile_id` da conversa aberta. `undefined` = a migração
   * 20260913000001 ainda não rodou (a query voltou sem a coluna) — o controle
   * nem aparece, em vez de oferecer um botão que daria erro.
   */
  assignedProfileId: string | null | undefined;
}

/**
 * Quem atende esta conversa, com as duas ações do passo 1:
 *   - "Assumir": só quando ninguém tem a conversa. Escreve com guarda de
 *     concorrência (ver `assumeConversation`); se alguém chegou antes, o toast
 *     diz quem e a tela se atualiza.
 *   - "Transferir…": abre o seletor com o time da Loja (diretório), inclusive
 *     você — é assim que se toma uma conversa que está com outra pessoa.
 *
 * Todo cargo assume. Transferir pode ser desligado para ATENDENTES pela Loja
 * (Configurações › Escala/Transferência): aí o item "Transferir…" some daqui
 * E o servidor recusa a escrita (trigger 42501) — esconder o botão sozinho não
 * seria proteção nenhuma. Quando não sobra ação (conversa com alguém + sem
 * transferir), o controle vira só o chip do responsável, sem menu.
 */
export const ConversationOwnerControl = ({
  conversationId,
  assignedProfileId,
}: ConversationOwnerControlProps) => {
  const { profile } = useTenant();
  const lookup = useTeamMemberLookup();
  const assume = useAssumeConversation();
  const transfer = useTransferConversation();
  const { transferBlocked } = useConversationVisibilityConfig();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (assignedProfileId === undefined) return null;

  const holder = lookup(assignedProfileId);
  const isUnassigned = !assignedProfileId;
  const isMine = !!profile?.id && assignedProfileId === profile.id;
  const busy = assume.isPending || transfer.isPending;
  const canTransfer = !transferBlocked;
  const hasActions = isUnassigned || canTransfer;

  const holderLabel = isUnassigned
    ? 'Ninguém assumiu esta conversa'
    : isMine
      ? 'Esta conversa está com você'
      : `Responsável: ${holder ? memberDisplayName(holder) : 'pessoa fora do diretório'}`;

  if (!hasActions) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex h-9 items-center gap-1 px-2"
            aria-label={holderLabel}
            data-testid="owner-readonly"
          >
            <OwnerInline
              member={holder}
              assignedProfileId={assignedProfileId}
              size="md"
              className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          {holderLabel}. A transferência de conversas está desativada para atendentes nesta Loja.
        </TooltipContent>
      </Tooltip>
    );
  }

  const handleAssume = () => {
    if (!isUnassigned || busy) return;
    assume.mutate({ conversationId });
  };

  const handleTransfer = (toProfileId: string) => {
    setPickerOpen(false);
    if (busy) return;
    transfer.mutate({ conversationId, toProfileId });
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 gap-1 px-2"
                aria-label={
                  isUnassigned
                    ? 'Sem responsável: assumir ou transferir'
                    : `Responsável: ${holder ? memberDisplayName(holder) : 'fora do diretório'}`
                }
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <OwnerInline
                    member={holder}
                    assignedProfileId={assignedProfileId}
                    size="md"
                    // No celular o cabeçalho é apertado: fica só o avatar/ícone.
                    className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline"
                  />
                )}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            {isUnassigned
              ? 'Ninguém assumiu esta conversa'
              : isMine
                ? 'Esta conversa está com você'
                : `Responsável: ${holder ? memberDisplayName(holder) : 'pessoa fora do diretório'}`}
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end">
          {isUnassigned && (
            <DropdownMenuItem onClick={handleAssume}>
              <Hand className="mr-2 h-4 w-4" />
              Assumir
            </DropdownMenuItem>
          )}
          {canTransfer && (
            <DropdownMenuItem onClick={() => setPickerOpen(true)}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transferir…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <TransferConversationDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentHolderId={assignedProfileId ?? null}
        viewerProfileId={profile?.id ?? null}
        onPick={handleTransfer}
      />
    </>
  );
};

interface TransferConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentHolderId: string | null;
  viewerProfileId: string | null;
  onPick: (profileId: string) => void;
}

/**
 * Seletor de destino: atendentes e gestores ativos da mesma Loja (e, numa Loja,
 * os gerentes da Conta acima), vindos do diretório. Quem já está com a conversa
 * aparece marcado e não é clicável.
 */
export const TransferConversationDialog = ({
  open,
  onOpenChange,
  currentHolderId,
  viewerProfileId,
  onPick,
}: TransferConversationDialogProps) => {
  const { data: members = [], isLoading } = useTeamDirectory();
  const [term, setTerm] = useState('');

  const visible = useMemo(() => {
    const q = term.trim().toLowerCase();
    const list = q
      ? members.filter((m) => memberDisplayName(m).toLowerCase().includes(q))
      : members;
    // Você primeiro, depois ordem alfabética (o diretório já vem ordenado).
    return [...list].sort((a, b) => {
      if (a.id === viewerProfileId) return -1;
      if (b.id === viewerProfileId) return 1;
      return 0;
    });
  }, [members, term, viewerProfileId]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTerm('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transferir conversa
          </DialogTitle>
          <DialogDescription>
            Escolha quem passa a atender. A pessoa recebe um aviso no sino.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          placeholder="Buscar pelo nome…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Buscar membro do time"
        />

        <div className="max-h-72 space-y-1 overflow-y-auto" role="listbox" aria-label="Membros do time">
          {isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Carregando o time…</p>
          ) : visible.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {members.length === 0
                ? 'Nenhum membro ativo encontrado nesta Loja.'
                : 'Ninguém com esse nome.'}
            </p>
          ) : (
            visible.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isCurrent={member.id === currentHolderId}
                isViewer={member.id === viewerProfileId}
                onPick={() => onPick(member.id)}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const MemberRow = ({
  member,
  isCurrent,
  isViewer,
  onPick,
}: {
  member: TeamMember;
  isCurrent: boolean;
  isViewer: boolean;
  onPick: () => void;
}) => (
  <button
    type="button"
    role="option"
    aria-selected={isCurrent}
    disabled={isCurrent}
    onClick={onPick}
    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/[0.08] disabled:cursor-default disabled:opacity-60"
  >
    <Avatar className="h-8 w-8 flex-shrink-0">
      {member.avatar_url && <AvatarImage src={member.avatar_url} alt={memberDisplayName(member)} />}
      <AvatarFallback className="text-xs">{memberInitials(member)}</AvatarFallback>
    </Avatar>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-foreground">
        {memberDisplayName(member)}
        {isViewer && <span className="ml-1 text-xs font-normal text-muted-foreground">(você)</span>}
      </span>
      {isCurrent && (
        <span className="block text-xs text-muted-foreground">Já é o responsável</span>
      )}
    </span>
    {isCurrent && <Check className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />}
  </button>
);

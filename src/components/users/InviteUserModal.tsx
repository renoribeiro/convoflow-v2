import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Store } from 'lucide-react';
import { RoleDescriptionCard } from '@/components/admin/RoleDescriptionCard';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { useMyStores } from '@/hooks/useMyStores';
import { useInviteUser } from '@/hooks/users/useManageUser';
import { ROLE_LABELS, UserRole } from '@/types/userHierarchy';

interface InviteUserModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Loja sugerida (a que está em foco). Só vale para Gestor e Atendente. */
  defaultTenantId?: string | null;
}

/**
 * Decide quais roles o usuário atual pode convidar (hierarquia V2, 4 níveis):
 *   superadmin → gerente
 *   gerente    → gestor, atendente
 *   gestor     → atendente
 *   atendente  → nenhuma (modal não deve abrir)
 */
function allowedRolesFor(callerRole: UserRole | null): UserRole[] {
  switch (callerRole) {
    case 'superadmin':
      return ['gerente'];
    case 'gerente':
      return ['gestor', 'atendente'];
    case 'gestor':
      return ['atendente'];
    default:
      return [];
  }
}

export function InviteUserModal({
  open,
  onOpenChange,
  defaultTenantId,
}: InviteUserModalProps) {
  const callerRole = useRole();
  const { tenant } = useTenant();
  const { stores, isLoading: lojasCarregando } = useMyStores();
  const allowed = allowedRolesFor(callerRole);
  const invite = useInviteUser();

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>(allowed[0] ?? 'atendente');
  const [tenantId, setTenantId] = useState(defaultTenantId ?? '');
  const [nomeDaConta, setNomeDaConta] = useState('');

  /**
   * Quem escolhe a Loja, e como.
   *
   *   gestor     → não escolhe: é sempre a Loja dele. O servidor ignora o que
   *                vier do navegador e usa `caller.tenant_id`
   *                (manage-user, actionCreate), então mostrar um campo aqui
   *                seria teatro.
   *   gerente    → escolhe entre as Lojas da Conta dele.
   *   superadmin → convida Gerente, que é dono de uma CONTA nova — não de uma
   *                Loja. Aqui o campo é o NOME da Conta a criar.
   */
  const ehGestor = callerRole === 'gestor';
  const precisaDeLoja = role === 'gestor' || role === 'atendente';
  const precisaNomeDaConta = role === 'gerente';

  const lojaDoGestor = ehGestor ? tenant : null;

  // Loja em foco muda (ou o modal reabre) → o seletor acompanha.
  useEffect(() => {
    if (open) setTenantId(defaultTenantId ?? '');
  }, [open, defaultTenantId]);

  const reset = () => {
    setEmail('');
    setFirstName('');
    setLastName('');
    setPhone('');
    setNomeDaConta('');
    setTenantId(defaultTenantId ?? '');
  };

  const handleSubmit = async () => {
    await invite.mutateAsync({
      email,
      firstName,
      lastName,
      phone: phone || undefined,
      role,
      // Para o gestor o servidor resolve sozinho; mandamos a própria Loja
      // mesmo assim para o payload ficar honesto com o que a tela mostrou.
      tenantId: precisaDeLoja ? (ehGestor ? lojaDoGestor?.id ?? null : tenantId || null) : null,
      newTenantName: precisaNomeDaConta ? nomeDaConta.trim() : undefined,
      redirectTo: `${window.location.origin}/definir-senha`,
    });
    reset();
    onOpenChange(false);
  };

  const semLojas = callerRole === 'gerente' && !lojasCarregando && stores.length === 0;

  const podeEnviar =
    !invite.isPending &&
    !!email &&
    !!firstName &&
    !!lastName &&
    (!precisaDeLoja || ehGestor || !!tenantId) &&
    (!precisaNomeDaConta || !!nomeDaConta.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convidar novo usuário</DialogTitle>
          <DialogDescription>
            Um e-mail de convite será enviado. O usuário define a senha ao acessar pela primeira vez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="invite-firstName">Nome</Label>
              <Input
                id="invite-firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="invite-lastName">Sobrenome</Label>
              <Input
                id="invite-lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="invite-email">E-mail</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="invite-phone">Telefone (opcional)</Label>
            <Input
              id="invite-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="invite-role">Função</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowed.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/*
              Sem hideStoreCaps: este modal não mostra o aviso de limite por
              loja, então o cartão pode dizer "Criar até 5 atendentes na loja".
            */}
            <RoleDescriptionCard role={role} />
          </div>

          {/* ---------------------------------------------------------------
              Vínculo. Até 2026-08-18 isto era um campo de texto livre pedindo
              "UUID do tenant" — digitado à mão, sem lista, e sem dizer que
              tinha de ser uma LOJA. Colar o id da Conta ali devolvia um 403
              que ainda por cima chegava ilegível na tela.
             --------------------------------------------------------------- */}
          {precisaDeLoja && ehGestor && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">
                Entra na sua Loja: <strong>{lojaDoGestor?.name ?? '—'}</strong>
              </span>
            </div>
          )}

          {precisaDeLoja && !ehGestor && (
            <div>
              <Label htmlFor="invite-loja">Loja</Label>
              {semLojas ? (
                <Alert className="mt-1">
                  <AlertDescription>
                    Você ainda não tem nenhuma Loja. Crie uma em "Nova Loja" antes de
                    convidar. Gestor e Atendente sempre pertencem a uma.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Select value={tenantId} onValueChange={setTenantId}>
                    <SelectTrigger id="invite-loja">
                      <SelectValue
                        placeholder={lojasCarregando ? 'Carregando...' : 'Escolha a Loja'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((loja) => (
                        <SelectItem key={loja.id} value={loja.id}>
                          {loja.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    A pessoa vai enxergar as conversas e os contatos desta Loja.
                  </p>
                </>
              )}
            </div>
          )}

          {precisaNomeDaConta && (
            <div>
              <Label htmlFor="invite-conta">Nome da Conta</Label>
              <Input
                id="invite-conta"
                value={nomeDaConta}
                onChange={(e) => setNomeDaConta(e.target.value)}
                placeholder="Ex.: Imobiliária Silva"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                O Gerente é dono de uma Conta, não de uma Loja. A Conta é criada agora,
                vazia; as Lojas dela ele cria depois.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!podeEnviar}>
            {invite.isPending ? 'Enviando...' : 'Enviar convite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Badge } from '@/components/ui/badge';
import { AnyUserRole, UserRole, normalizeRole, roleLabel } from '@/types/userHierarchy';

const VARIANTS: Record<UserRole, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  superadmin: 'destructive',
  gerente: 'default',
  gestor: 'secondary',
  atendente: 'outline',
};

export function RoleBadge({ role }: { role: AnyUserRole }) {
  const normalized = normalizeRole(role);
  if (!normalized) return <Badge variant="outline">Desconhecido</Badge>;
  return <Badge variant={VARIANTS[normalized]}>{roleLabel(normalized)}</Badge>;
}

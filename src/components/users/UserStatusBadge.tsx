import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, UserStatus } from '@/types/userHierarchy';

const VARIANTS: Record<UserStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  pending: 'secondary',
  suspended: 'outline',
  deleted: 'destructive',
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge variant={VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}

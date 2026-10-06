/**
 * Tipos do módulo Follow-up, derivados dos tipos gerados do banco.
 * Centraliza aqui (em vez de poluir o types.ts gerado, que é sobrescrito a cada
 * regeneração).
 */
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type FollowupMode = 'manual' | 'scheduled' | 'sequence';
export type FollowupStatus =
  | 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';
export type FollowupType =
  | 'call' | 'email' | 'whatsapp' | 'meeting' | 'visit' | 'task' | 'other';
export type FollowupPriority = 'high' | 'medium' | 'low';
export type RecurringType = 'daily' | 'weekly' | 'monthly' | 'custom';

/** Forma do contato embutido (select `contacts(id,name,phone)`). */
export type EmbeddedContact = { id: string; name: string | null; phone: string } | null;

export type IndividualFollowupRow = Tables<'individual_followups'>;
export type IndividualFollowup = IndividualFollowupRow & {
  contacts?: EmbeddedContact;
  /** Status efetivo (overdue calculado) — espelha public.v_followups. */
  effective_status?: FollowupStatus;
};
export type CreateFollowupData = TablesInsert<'individual_followups'>;
export type UpdateFollowupData = TablesUpdate<'individual_followups'>;

export interface FollowupStats {
  total: number;
  pending: number;
  scheduled: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  overdue: number;
}

// Sequências (modo Automático / cadência)
export type FollowupSequence = Tables<'followup_sequences'>;
export type FollowupSequenceStep = Tables<'followup_sequence_steps'>;
export type FollowupSequenceEnrollment = Tables<'followup_sequence_enrollments'>;
export type CreateSequenceData = TablesInsert<'followup_sequences'>;
export type CreateSequenceStepData = TablesInsert<'followup_sequence_steps'>;
export type CreateEnrollmentData = TablesInsert<'followup_sequence_enrollments'>;

export type SequenceActionType = 'whatsapp' | 'manual_task';
export type SequenceDelayUnit = 'minutes' | 'hours' | 'days';

/**
 * Espelho EXATO de public.v_followups.effective_status. A definição canônica
 * vive no banco (a view); esta função apenas a reproduz para renderização ao
 * vivo, mantendo a UI consistente com o servidor.
 */
export function effectiveStatus(
  f: Pick<IndividualFollowupRow, 'status' | 'due_date'>,
): FollowupStatus {
  const s = (f.status ?? 'pending') as FollowupStatus;
  if (s === 'completed' || s === 'cancelled') return s;
  if ((s === 'pending' || s === 'in_progress') && new Date(f.due_date) < new Date()) {
    return 'overdue';
  }
  return s;
}

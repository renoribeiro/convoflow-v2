/**
 * Tests for campaign validation schemas.
 *
 * Covers:
 * 1. CampaignSchema — valid draft, bad message_type, bad status, empty name
 * 2. CampaignCreateSchema — omits status/started_at/completed_at/statistics
 * 3. CampaignUpdateSchema — tenant_id is required
 * 4. CampaignControlSchema — valid actions and the error case
 * 5. CampaignExecutionSchema — valid and invalid uuid
 * 6. validateCampaign / validateCampaignCreate helpers
 */

import { describe, it, expect } from 'vitest';
import {
  CampaignSchema,
  CampaignCreateSchema,
  CampaignUpdateSchema,
  CampaignControlSchema,
  CampaignExecutionSchema,
  validateCampaign,
  validateCampaignCreate,
  validateCampaignControl,
} from '@/lib/validations/campaign';

// ── fixtures ──────────────────────────────────────────────────────────────────

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const OTHER_UUID = '22222222-2222-2222-2222-222222222222';

/** Minimum valid payload for CampaignSchema */
const validDraft = {
  name: 'Campanha de Boas-Vindas',
  message_content: 'Olá! Bem-vindo à nossa plataforma.',
  target_criteria: {},
  whatsapp_instance_id: VALID_UUID,
  message_type: 'text' as const,
  tenant_id: VALID_UUID,
};

// ── CampaignSchema ────────────────────────────────────────────────────────────

describe('CampaignSchema', () => {
  describe('golden path — valid draft campaign', () => {
    it('accepts a minimal valid draft campaign', () => {
      const result = CampaignSchema.safeParse(validDraft);
      expect(result.success).toBe(true);
    });

    it('defaults status to "draft" when omitted', () => {
      const result = CampaignSchema.safeParse(validDraft);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('draft');
      }
    });

    it('accepts all valid status values', () => {
      const statuses = ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'] as const;
      for (const status of statuses) {
        const result = CampaignSchema.safeParse({ ...validDraft, status });
        expect(result.success, `expected ${status} to be valid`).toBe(true);
      }
    });

    it('accepts "image" as a valid message_type', () => {
      const result = CampaignSchema.safeParse({ ...validDraft, message_type: 'image' });
      expect(result.success).toBe(true);
    });

    it('accepts optional settings block', () => {
      const result = CampaignSchema.safeParse({
        ...validDraft,
        settings: {
          send_interval_seconds: 10,
          max_daily_sends: 500,
          retry_failed: true,
          max_retries: 2,
          respect_business_hours: false,
          business_hours_start: '08:00',
          business_hours_end: '20:00',
          timezone: 'America/Sao_Paulo',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('edge cases — rejection', () => {
    it('rejects an empty name', () => {
      const result = CampaignSchema.safeParse({ ...validDraft, name: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = result.error.issues[0].message;
        expect(msg).toBe('Nome é obrigatório');
      }
    });

    it('rejects a name longer than 100 characters', () => {
      const result = CampaignSchema.safeParse({ ...validDraft, name: 'a'.repeat(101) });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid message_type', () => {
      const result = CampaignSchema.safeParse({ ...validDraft, message_type: 'sticker' });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid status value', () => {
      const result = CampaignSchema.safeParse({ ...validDraft, status: 'running' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = result.error.issues[0].message;
        expect(msg).toBe('Status de campanha inválido');
      }
    });

    it('rejects a non-uuid whatsapp_instance_id', () => {
      const result = CampaignSchema.safeParse({ ...validDraft, whatsapp_instance_id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('rejects missing tenant_id', () => {
      const { tenant_id: _t, ...noTenant } = validDraft;
      const result = CampaignSchema.safeParse(noTenant);
      expect(result.success).toBe(false);
    });

    it('rejects empty message_content', () => {
      const result = CampaignSchema.safeParse({ ...validDraft, message_content: '' });
      expect(result.success).toBe(false);
    });

    it('rejects settings.send_interval_seconds below 1', () => {
      const result = CampaignSchema.safeParse({
        ...validDraft,
        settings: { send_interval_seconds: 0 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects settings.max_daily_sends above 10000', () => {
      const result = CampaignSchema.safeParse({
        ...validDraft,
        settings: { max_daily_sends: 10001 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid business_hours_start format', () => {
      const result = CampaignSchema.safeParse({
        ...validDraft,
        settings: { business_hours_start: '25:00' },
      });
      expect(result.success).toBe(false);
    });
  });
});

// ── CampaignCreateSchema ──────────────────────────────────────────────────────

describe('CampaignCreateSchema', () => {
  it('accepts a valid create payload', () => {
    const result = CampaignCreateSchema.safeParse(validDraft);
    expect(result.success).toBe(true);
  });

  it('does not expose a status field (omitted from create)', () => {
    // Passing a status should not be rejected outright (Zod strips extra keys)
    // but the schema shape must not require it
    const { shape } = CampaignCreateSchema;
    expect('status' in shape).toBe(false);
  });

  it('does not expose started_at or completed_at', () => {
    const { shape } = CampaignCreateSchema;
    expect('started_at' in shape).toBe(false);
    expect('completed_at' in shape).toBe(false);
  });

  it('does not expose statistics', () => {
    const { shape } = CampaignCreateSchema;
    expect('statistics' in shape).toBe(false);
  });
});

// ── CampaignUpdateSchema ──────────────────────────────────────────────────────

describe('CampaignUpdateSchema', () => {
  it('accepts a partial update with only tenant_id', () => {
    const result = CampaignUpdateSchema.safeParse({ tenant_id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('rejects an update payload without tenant_id', () => {
    const result = CampaignUpdateSchema.safeParse({ name: 'Nova campanha' });
    expect(result.success).toBe(false);
  });

  it('accepts a status update to "paused"', () => {
    const result = CampaignUpdateSchema.safeParse({
      tenant_id: VALID_UUID,
      status: 'paused',
    });
    expect(result.success).toBe(true);
  });
});

// ── CampaignControlSchema ─────────────────────────────────────────────────────

describe('CampaignControlSchema', () => {
  it('accepts action=pause', () => {
    const result = CampaignControlSchema.safeParse({
      campaign_id: VALID_UUID,
      tenant_id: OTHER_UUID,
      action: 'pause',
    });
    expect(result.success).toBe(true);
  });

  it('accepts action=resume with an optional reason', () => {
    const result = CampaignControlSchema.safeParse({
      campaign_id: VALID_UUID,
      tenant_id: OTHER_UUID,
      action: 'resume',
      reason: 'Horário comercial retomado',
    });
    expect(result.success).toBe(true);
  });

  it('accepts action=cancel', () => {
    const result = CampaignControlSchema.safeParse({
      campaign_id: VALID_UUID,
      tenant_id: OTHER_UUID,
      action: 'cancel',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid action value', () => {
    const result = CampaignControlSchema.safeParse({
      campaign_id: VALID_UUID,
      tenant_id: OTHER_UUID,
      action: 'start',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Ação inválida');
    }
  });

  it('rejects missing campaign_id', () => {
    const result = CampaignControlSchema.safeParse({
      tenant_id: VALID_UUID,
      action: 'pause',
    });
    expect(result.success).toBe(false);
  });
});

// ── CampaignExecutionSchema ───────────────────────────────────────────────────

describe('CampaignExecutionSchema', () => {
  it('accepts a valid execution request', () => {
    const result = CampaignExecutionSchema.safeParse({
      campaign_id: VALID_UUID,
      tenant_id: OTHER_UUID,
    });
    expect(result.success).toBe(true);
  });

  it('defaults force_start and test_mode to false', () => {
    const result = CampaignExecutionSchema.safeParse({
      campaign_id: VALID_UUID,
      tenant_id: OTHER_UUID,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.force_start).toBe(false);
      expect(result.data.test_mode).toBe(false);
    }
  });

  it('rejects a non-uuid campaign_id', () => {
    const result = CampaignExecutionSchema.safeParse({
      campaign_id: 'bad-id',
      tenant_id: OTHER_UUID,
    });
    expect(result.success).toBe(false);
  });
});

// ── validateCampaign helper ───────────────────────────────────────────────────

describe('validateCampaign', () => {
  it('returns success=true for a valid draft', () => {
    expect(validateCampaign(validDraft).success).toBe(true);
  });

  it('returns success=false for null input', () => {
    expect(validateCampaign(null).success).toBe(false);
  });

  it('returns success=false for an empty object', () => {
    expect(validateCampaign({}).success).toBe(false);
  });
});

// ── validateCampaignCreate helper ────────────────────────────────────────────

describe('validateCampaignCreate', () => {
  it('returns success=true for a valid create payload', () => {
    expect(validateCampaignCreate(validDraft).success).toBe(true);
  });

  it('returns success=false when name is missing', () => {
    const { name: _n, ...noName } = validDraft;
    expect(validateCampaignCreate(noName).success).toBe(false);
  });
});

// ── validateCampaignUpdate helper ────────────────────────────────────────────

import {
  validateCampaignUpdate,
  validateCampaignFilter,
  validateCampaignExecution,
  validateCampaignAnalytics,
  validateCampaignTemplate,
  validateCampaignDuplicate,
} from '@/lib/validations/campaign';

describe('validateCampaignUpdate', () => {
  it('returns success=true with only tenant_id', () => {
    expect(validateCampaignUpdate({ tenant_id: VALID_UUID }).success).toBe(true);
  });

  it('returns success=false without tenant_id', () => {
    expect(validateCampaignUpdate({ name: 'x' }).success).toBe(false);
  });
});

describe('validateCampaignFilter', () => {
  it('returns success=true for empty filter', () => {
    expect(validateCampaignFilter({}).success).toBe(true);
  });

  it('returns success=false for invalid uuid in whatsapp_instance_id', () => {
    expect(validateCampaignFilter({ whatsapp_instance_id: 'bad' }).success).toBe(false);
  });
});

describe('validateCampaignExecution', () => {
  it('returns success=true for valid execution data', () => {
    expect(validateCampaignExecution({ campaign_id: VALID_UUID, tenant_id: OTHER_UUID }).success).toBe(true);
  });

  it('returns success=false for invalid campaign_id', () => {
    expect(validateCampaignExecution({ campaign_id: 'bad', tenant_id: OTHER_UUID }).success).toBe(false);
  });
});

describe('validateCampaignAnalytics', () => {
  it('returns success=true for valid analytics request', () => {
    expect(validateCampaignAnalytics({ tenant_id: VALID_UUID, period: 'month' }).success).toBe(true);
  });

  it('returns success=false for invalid period', () => {
    expect(validateCampaignAnalytics({ tenant_id: VALID_UUID, period: 'hourly' }).success).toBe(false);
  });
});

describe('validateCampaignTemplate', () => {
  it('returns success=true for a valid template', () => {
    expect(validateCampaignTemplate({
      name: 'Template A',
      message_content: 'Olá {name}!',
      message_type: 'text',
      category: 'marketing',
      tenant_id: VALID_UUID,
    }).success).toBe(true);
  });

  it('returns success=false when name is empty', () => {
    expect(validateCampaignTemplate({
      name: '',
      message_content: 'Olá!',
      category: 'marketing',
      tenant_id: VALID_UUID,
    }).success).toBe(false);
  });
});

describe('validateCampaignDuplicate', () => {
  it('returns success=true for valid duplicate request', () => {
    expect(validateCampaignDuplicate({
      campaign_id: VALID_UUID,
      new_name: 'Cópia da campanha',
      tenant_id: OTHER_UUID,
    }).success).toBe(true);
  });

  it('returns success=false when campaign_id is not a uuid', () => {
    expect(validateCampaignDuplicate({
      campaign_id: 'not-a-uuid',
      new_name: 'Cópia',
      tenant_id: OTHER_UUID,
    }).success).toBe(false);
  });
});

// ── validateCampaignControl helper ───────────────────────────────────────────

describe('validateCampaignControl', () => {
  it('returns success=true for a valid control action', () => {
    expect(
      validateCampaignControl({ campaign_id: VALID_UUID, tenant_id: OTHER_UUID, action: 'pause' }).success
    ).toBe(true);
  });

  it('returns success=false for an unknown action', () => {
    expect(
      validateCampaignControl({ campaign_id: VALID_UUID, tenant_id: OTHER_UUID, action: 'restart' }).success
    ).toBe(false);
  });
});

// ── cross-tenant isolation ────────────────────────────────────────────────────

describe('cross-tenant isolation (schema-level)', () => {
  it('tenant A payload cannot satisfy tenant B requirement — different tenant_ids are structurally independent', () => {
    const tenantA = { ...validDraft, tenant_id: VALID_UUID };
    const tenantB = { ...validDraft, tenant_id: OTHER_UUID };

    const resultA = CampaignSchema.safeParse(tenantA);
    const resultB = CampaignSchema.safeParse(tenantB);

    // Both are valid but they carry different tenant_ids — the schema enforces
    // tenant_id is a UUID; runtime RLS enforces the scoping.
    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
    if (resultA.success && resultB.success) {
      expect(resultA.data.tenant_id).not.toBe(resultB.data.tenant_id);
    }
  });
});

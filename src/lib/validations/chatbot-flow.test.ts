import { describe, it, expect } from 'vitest';
import {
  validateNodeData,
  validateTriggerValue,
  ChatbotFlowCreateSchema,
} from '@/lib/validations/chatbot-flow';

describe('validateNodeData', () => {
  it('send_text requires a message', () => {
    expect(validateNodeData('send_text', { message: 'oi' }).success).toBe(true);
    expect(validateNodeData('send_text', { message: '' }).success).toBe(false);
  });

  it('ask_question validates the variable name', () => {
    expect(
      validateNodeData('ask_question', { message: 'Email?', save_to_variable: 'email', validation: 'email' }).success
    ).toBe(true);
    // invalid identifier (starts with number)
    expect(
      validateNodeData('ask_question', { message: 'q', save_to_variable: '1bad', validation: 'none' }).success
    ).toBe(false);
  });

  it('show_options requires at least one option', () => {
    expect(
      validateNodeData('show_options', { message: 'm', options: [{ id: 'a', label: 'X', value: 'x' }] }).success
    ).toBe(true);
    expect(validateNodeData('show_options', { message: 'm', options: [] }).success).toBe(false);
  });

  it('condition requires a value unless operator is empty/not_empty', () => {
    expect(validateNodeData('condition', { variable: 'v', operator: 'empty' }).success).toBe(true);
    expect(validateNodeData('condition', { variable: 'v', operator: 'contains' }).success).toBe(false);
    expect(
      validateNodeData('condition', { variable: 'v', operator: 'contains', value: 'x' }).success
    ).toBe(true);
  });

  it('transfer_agent requires user_id when specific', () => {
    expect(validateNodeData('transfer_agent', { assign_to: 'any' }).success).toBe(true);
    expect(validateNodeData('transfer_agent', { assign_to: 'specific_user' }).success).toBe(false);
  });

  it('move_funnel requires a uuid stage', () => {
    expect(validateNodeData('move_funnel', { stage_id: 'not-uuid' }).success).toBe(false);
    expect(
      validateNodeData('move_funnel', { stage_id: '11111111-1111-1111-1111-111111111111' }).success
    ).toBe(true);
  });
});

describe('validateTriggerValue', () => {
  it('keyword needs at least one keyword', () => {
    expect(validateTriggerValue('keyword', { keywords: ['oi'] }).success).toBe(true);
    expect(validateTriggerValue('keyword', { keywords: [] }).success).toBe(false);
  });
  it('no_agent_reply needs positive minutes', () => {
    expect(validateTriggerValue('no_agent_reply', { minutes: 10 }).success).toBe(true);
    expect(validateTriggerValue('no_agent_reply', { minutes: 0 }).success).toBe(false);
  });
  it('first_contact accepts empty object', () => {
    expect(validateTriggerValue('first_contact', {}).success).toBe(true);
  });
});

describe('ChatbotFlowCreateSchema', () => {
  it('requires a name and at least one trigger', () => {
    const ok = ChatbotFlowCreateSchema.safeParse({
      name: 'Bot',
      triggers: [{ trigger_type: 'first_contact', trigger_value: {} }],
    });
    expect(ok.success).toBe(true);

    const noTrigger = ChatbotFlowCreateSchema.safeParse({ name: 'Bot', triggers: [] });
    expect(noTrigger.success).toBe(false);

    const noName = ChatbotFlowCreateSchema.safeParse({
      name: '',
      triggers: [{ trigger_type: 'first_contact', trigger_value: {} }],
    });
    expect(noName.success).toBe(false);
  });
});

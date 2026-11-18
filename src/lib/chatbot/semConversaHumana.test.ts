/**
 * Gatilho "Sem conversa humana recente" (no_recent_human, 2026-11-18).
 *
 * Lado servidor (supabase/functions/_shared/chatbot-engine.ts):
 *   1. o gatilho dispara só com a resposta da função SQL (12 h sem pessoa,
 *      24 h sem bot), e na dúvida não dispara;
 *   2. a sessão aberta por ele leva a marca que o trigger do banco usa para
 *      parar o bot quando uma pessoa escreve (os outros gatilhos, não);
 *   3. a espera vence depois de 12 horas, só nessa sessão;
 *   e o id do envio do Evolution é lido da resposta (o eco do bot).
 * O lado do banco (função e trigger) está em docs/teste_chatbot_sem_conversa_humana.sql.
 */
import { describe, expect, it } from 'vitest';
import {
  GATILHO_SEM_CONVERSA_HUMANA,
  MARCA_DO_GATILHO,
  evaluateTrigger,
  idDoEnvioEvolution,
  sessaoVencida,
  variaveisIniciais,
  type TriggerRow,
} from '../../../supabase/functions/_shared/chatbot-engine';

const gatilho = (over: Partial<TriggerRow> = {}): TriggerRow => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  chatbot_id: 'aaaaaaaa-0000-4000-8000-000000000002',
  trigger_type: GATILHO_SEM_CONVERSA_HUMANA,
  trigger_value: {},
  is_active: true,
  ...over,
});

const base = { message: 'oi', contactId: 'aaaaaaaa-0000-4000-8000-000000000003', priorInboundCount: 5 };

describe('gatilho no_recent_human', () => {
  it('dispara quando a função diz que não houve conversa humana nem bot', () => {
    expect(evaluateTrigger(gatilho(), { ...base, semConversaHumanaRecente: true })).toBe(true);
  });

  it('não dispara com pessoa ou bot recente, nem sem resposta da função', () => {
    expect(evaluateTrigger(gatilho(), { ...base, semConversaHumanaRecente: false })).toBe(false);
    expect(evaluateTrigger(gatilho(), base)).toBe(false);
  });

  it('gatilho desligado não dispara', () => {
    expect(evaluateTrigger(gatilho({ is_active: false }), { ...base, semConversaHumanaRecente: true })).toBe(false);
  });

  it('os gatilhos antigos não olham a resposta nova', () => {
    const primeiro = gatilho({ trigger_type: 'first_contact' });
    expect(evaluateTrigger(primeiro, { ...base, semConversaHumanaRecente: true })).toBe(false);
    expect(evaluateTrigger(primeiro, { ...base, priorInboundCount: 0 })).toBe(true);
  });
});

describe('marca da sessão', () => {
  it('só a sessão do gatilho novo leva a marca', () => {
    expect(variaveisIniciais(GATILHO_SEM_CONVERSA_HUMANA)).toEqual({ [MARCA_DO_GATILHO]: 'no_recent_human' });
    expect(variaveisIniciais('keyword')).toEqual({});
    expect(variaveisIniciais(undefined)).toEqual({});
  });

  it('a marca começa com __, então não vai para o contato nem dispara automação', () => {
    expect(MARCA_DO_GATILHO.startsWith('__')).toBe(true);
  });
});

describe('a espera vence em 12 horas', () => {
  const agora = new Date('2026-11-18T12:00:00Z');
  const marcada = { [MARCA_DO_GATILHO]: GATILHO_SEM_CONVERSA_HUMANA };

  it('vence com 12 horas ou mais', () => {
    expect(sessaoVencida({ variables: marcada, last_activity_at: '2026-11-18T00:00:00Z' }, agora)).toBe(true);
    expect(sessaoVencida({ variables: marcada, last_activity_at: '2026-11-17T08:00:00Z' }, agora)).toBe(true);
  });

  it('não vence antes de 12 horas', () => {
    expect(sessaoVencida({ variables: marcada, last_activity_at: '2026-11-18T00:30:00Z' }, agora)).toBe(false);
  });

  it('sessão de gatilho antigo nunca vence', () => {
    expect(sessaoVencida({ variables: {}, last_activity_at: '2026-10-01T00:00:00Z' }, agora)).toBe(false);
  });
});

describe('id do envio do Evolution', () => {
  it('lê key.id da resposta do sendText', () => {
    expect(idDoEnvioEvolution({ key: { remoteJid: 'x', fromMe: true, id: 'FAKEMSGID01' } })).toBe('FAKEMSGID01');
  });

  it('sem id, não inventa', () => {
    expect(idDoEnvioEvolution({})).toBeNull();
    expect(idDoEnvioEvolution(null)).toBeNull();
    expect(idDoEnvioEvolution({ key: { id: '' } })).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import * as app from './replySettings';
import * as edge from '../../../supabase/functions/_shared/followup-reply';

/**
 * `src/lib/followups/replySettings.ts` é um espelho do trecho de preferências
 * de `supabase/functions/_shared/followup-reply.ts`. A duplicação é proposital
 * (nenhuma das pontas importa a outra), então este teste é o que impede as duas
 * de divergirem em silêncio — o sintoma seria a tela mostrar um valor e o
 * servidor obedecer outro.
 */
describe('replySettings — espelho do edge function', () => {
  it('os padrões são os mesmos dos dois lados', () => {
    expect(app.REPLY_CANCEL_DEFAULTS).toEqual(edge.REPLY_CANCEL_DEFAULTS);
  });

  it('o padrão é: agendado cancela, manual não', () => {
    expect(app.REPLY_CANCEL_DEFAULTS).toEqual({
      cancel_scheduled_on_reply: true,
      cancel_manual_on_reply: false,
    });
  });

  const entradas: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['objeto vazio', {}],
    ['followups nulo', { followups: null }],
    ['followups vazio', { followups: {} }],
    ['só agendado', { followups: { cancel_scheduled_on_reply: false } }],
    ['só manual', { followups: { cancel_manual_on_reply: true } }],
    ['os dois ligados', { followups: { cancel_scheduled_on_reply: true, cancel_manual_on_reply: true } }],
    ['os dois desligados', { followups: { cancel_scheduled_on_reply: false, cancel_manual_on_reply: false } }],
    ['tipos errados', { followups: { cancel_scheduled_on_reply: 'sim', cancel_manual_on_reply: 0 } }],
    ['chave desconhecida junto', { followups: { cancel_manual_on_reply: true, outra_coisa: 9 } }],
    ['convivendo com sla', { sla: { enabled: true }, followups: { cancel_scheduled_on_reply: false } }],
    ['followups não é objeto', { followups: 'ligado' }],
  ];

  for (const [nome, entrada] of entradas) {
    it(`normaliza igual dos dois lados: ${nome}`, () => {
      expect(app.normalizeReplyCancelSettings(entrada)).toEqual(
        edge.normalizeReplyCancelSettings(entrada),
      );
    });
  }

  it('não perde as outras chaves de settings ao ler (leitura é não-destrutiva)', () => {
    const settings = { sla: { enabled: true }, followups: { cancel_manual_on_reply: true } };
    app.normalizeReplyCancelSettings(settings);
    expect(settings.sla).toEqual({ enabled: true });
  });
});

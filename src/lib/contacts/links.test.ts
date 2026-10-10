import { describe, expect, it } from 'vitest';
import {
  automaticLinkEffects,
  buildLinkChoices,
  buildLinkIndex,
  conflictKey,
  defaultSide,
  findLinkConflicts,
  linkRefusalMessage,
  linkedCounterpartId,
  type ContactLink,
  type LinkableContact,
} from './links';

const wa = (over: Partial<LinkableContact> = {}): LinkableContact => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  channel: 'whatsapp',
  name: 'Maria Souza',
  email: null,
  phone: '5511999990101',
  username: null,
  notes: null,
  current_stage_id: null,
  custom_fields: {},
  opt_out_mass_message: false,
  is_blocked: false,
  tag_ids: [],
  ...over,
});

const ig = (over: Partial<LinkableContact> = {}): LinkableContact => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  channel: 'instagram',
  name: 'Maria Souza',
  email: null,
  phone: null,
  username: 'maria.exemplo',
  notes: null,
  current_stage_id: null,
  custom_fields: {},
  opt_out_mass_message: false,
  is_blocked: false,
  tag_ids: [],
  ...over,
});

describe('conflitos do vínculo', () => {
  it('sem diferença, nada a perguntar', () => {
    expect(findLinkConflicts(wa(), ig())).toEqual([]);
  });

  it('nome e e-mail só são conflito quando os DOIS lados têm valor diferente', () => {
    expect(findLinkConflicts(wa({ name: 'Maria' }), ig({ name: 'Maria S.' })).map((c) => c.field)).toEqual(['name']);
    expect(findLinkConflicts(wa({ name: '' }), ig({ name: 'Maria S.' }))).toEqual([]);
    expect(findLinkConflicts(wa({ email: 'a@exemplo.com.br' }), ig({ email: 'b@exemplo.com.br' })).map((c) => c.field)).toEqual(['email']);
    expect(findLinkConflicts(wa({ email: null }), ig({ email: 'b@exemplo.com.br' }))).toEqual([]);
  });

  it('etapa: pergunta se o Instagram tem etapa diferente; sem etapa no WhatsApp, o padrão é o Instagram', () => {
    const [c] = findLinkConflicts(
      wa({ current_stage_id: 's1', stage_name: 'Novo' }),
      ig({ current_stage_id: 's2', stage_name: 'Proposta' }),
    );
    expect(c).toMatchObject({ field: 'stage', whatsapp: 'Novo', instagram: 'Proposta' });
    expect(defaultSide(c!)).toBe('whatsapp');

    const [d] = findLinkConflicts(wa(), ig({ current_stage_id: 's2', stage_name: 'Proposta' }));
    expect(d).toMatchObject({ field: 'stage', whatsapp: 'Sem etapa' });
    expect(defaultSide(d!)).toBe('instagram');

    // Instagram sem etapa: o WhatsApp fica como está, nada a perguntar.
    expect(findLinkConflicts(wa({ current_stage_id: 's1' }), ig())).toEqual([]);
  });

  it('campos personalizados: só as chaves com dois valores diferentes', () => {
    const conflicts = findLinkConflicts(
      wa({ custom_fields: { cidade: 'Recife', plano: 'ouro', vazio: '' } }),
      ig({ custom_fields: { cidade: 'Olinda', plano: 'ouro', origem: 'anuncio', vazio: 'x' } }),
    );
    expect(conflicts).toEqual([{ field: 'custom_field', key: 'cidade', whatsapp: 'Recife', instagram: 'Olinda' }]);
    expect(conflictKey(conflicts[0]!)).toBe('custom_field:cidade');
  });
});

describe('escolhas enviadas ao servidor', () => {
  const conflicts = findLinkConflicts(
    wa({ name: 'Maria', current_stage_id: 's1', custom_fields: { cidade: 'Recife' } }),
    ig({ name: 'Maria S.', current_stage_id: 's2', custom_fields: { cidade: 'Olinda' } }),
  );

  it('sem clique, vale o padrão de cada pergunta', () => {
    expect(buildLinkChoices(conflicts, {})).toEqual({
      name: 'whatsapp',
      stage: 'whatsapp',
      custom_fields: { cidade: 'whatsapp' },
    });
  });

  it('o clique da pessoa vence', () => {
    expect(
      buildLinkChoices(conflicts, { name: 'instagram', 'custom_field:cidade': 'instagram' }),
    ).toEqual({ name: 'instagram', stage: 'whatsapp', custom_fields: { cidade: 'instagram' } });
  });

  it('nunca leva telefone: o contato do Instagram segue sem telefone, e campanha (que exige telefone) não o alcança', () => {
    const everything = findLinkConflicts(
      wa({ name: 'A', email: 'a@exemplo.com.br', current_stage_id: 's1', custom_fields: { phone: '1' } }),
      ig({ name: 'B', email: 'b@exemplo.com.br', current_stage_id: 's2', custom_fields: { phone: '2' }, phone: '5511999990202' }),
    );
    const choices = buildLinkChoices(everything, {});
    expect(Object.keys(choices).sort()).toEqual(['custom_fields', 'email', 'name', 'stage']);
    expect(choices).not.toHaveProperty('phone');
    // "phone" aqui é só o NOME de um campo personalizado, decidido como os outros.
    expect(choices.custom_fields).toEqual({ phone: 'whatsapp' });
  });
});

describe('o que acontece sozinho', () => {
  it('lista etiquetas novas, notas, e-mail, campos, nome, opt-out e bloqueio', () => {
    const effects = automaticLinkEffects(
      wa({ name: '', tag_ids: ['t1'], notes: 'nota wa', custom_fields: {} }),
      ig({
        name: 'Maria',
        email: 'm@exemplo.com.br',
        tag_ids: ['t1', 't2', 't3'],
        notes: 'nota ig',
        custom_fields: { origem: 'anuncio' },
        opt_out_mass_message: true,
        is_blocked: true,
      }),
    );
    expect(effects).toEqual([
      'O nome do Instagram passa para o contato do WhatsApp, que não tinha nome.',
      '2 etiquetas do Instagram passam a valer também no WhatsApp.',
      'As notas do Instagram entram embaixo das do WhatsApp, marcadas "Do Instagram".',
      'O e-mail do Instagram passa para o contato do WhatsApp.',
      '1 campo personalizado que só o Instagram tem passa para o WhatsApp.',
      'O contato pediu para sair das campanhas pelo Instagram: o WhatsApp também fica fora delas.',
      'O contato do Instagram está bloqueado: o do WhatsApp também fica bloqueado.',
    ]);
  });

  it('notas já contidas não são repetidas; nada a fazer, lista vazia', () => {
    expect(automaticLinkEffects(wa({ notes: 'x\n\nDo Instagram:\nnota ig' }), ig({ notes: 'nota ig' }))).toEqual([]);
  });
});

describe('recusas do servidor', () => {
  it('cada motivo vira frase; desconhecido vira a genérica', () => {
    expect(linkRefusalMessage('not_visible')).toMatch(/não tem acesso a uma das duas conversas/);
    expect(linkRefusalMessage('already_linked')).toMatch(/já está vinculado/);
    expect(linkRefusalMessage('not_allowed')).toMatch(/Gestor|gestor/);
    expect(linkRefusalMessage('???')).toBe('Não foi possível concluir. Tente novamente.');
  });
});

describe('índice de vínculos', () => {
  const link: ContactLink = {
    link_id: 'aaaaaaaa-0000-4000-8000-0000000000aa',
    whatsapp_contact_id: 'w1',
    instagram_contact_id: 'i1',
    linked_by: null,
    linked_by_name: null,
    linked_at: '2026-10-09T12:00:00Z',
    can_unlink: true,
  };

  it('acha o vínculo pelos dois lados e esconde do Funil só o Instagram', () => {
    const index = buildLinkIndex([link]);
    expect(index.byContact.get('w1')).toBe(link);
    expect(index.byContact.get('i1')).toBe(link);
    expect([...index.hiddenInstagramIds]).toEqual(['i1']);
    expect(linkedCounterpartId(link, 'w1')).toBe('i1');
    expect(linkedCounterpartId(link, 'i1')).toBe('w1');
  });

  it('sem vínculos, nada escondido', () => {
    const index = buildLinkIndex([]);
    expect(index.byContact.size).toBe(0);
    expect(index.hiddenInstagramIds.size).toBe(0);
  });
});

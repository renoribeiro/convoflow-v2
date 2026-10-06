/**
 * As regras que a tela de Templates não pode errar em silêncio.
 *
 * Duas delas custam caro se quebrarem e não fazem barulho nenhum na tela:
 * a dedupe por WABA (que erraria mostrando a mesma lista duas vezes) e o
 * agrupamento por nome (que erraria mostrando o mesmo template várias vezes,
 * uma por idioma).
 */
import { describe, it, expect } from 'vitest';
import {
  dedupeWabaGroups,
  filterTemplateGroups,
  groupTemplatesByName,
  splitTemplateText,
  templateStatusLabel,
  wabaIdOf,
  type OfficialInstanceRow,
} from './metaTemplates';
import type { WhatsAppTemplate } from '@/services/whatsapp';

const instancia = (
  id: string,
  name: string,
  wabaId?: string | null,
): OfficialInstanceRow => ({
  id,
  name,
  phone_number: null,
  connection_config: wabaId === undefined ? {} : wabaId === null ? null : { wabaId },
});

const template = (
  name: string,
  language: string,
  status = 'APPROVED',
  bodyText = '',
): WhatsAppTemplate => ({ name, language, status, category: 'UTILITY', bodyText });

// ---------------------------------------------------------------------------
// WABA
// ---------------------------------------------------------------------------

describe('dedupeWabaGroups', () => {
  it('dois números sob o MESMO WABA viram um grupo só', () => {
    // O caso que motivou a dedupe: sem ela a tela ofereceria duas opções que
    // devolvem exatamente a mesma lista de templates.
    const groups = dedupeWabaGroups([
      instancia('inst-1', 'Comercial', 'waba-aaa'),
      instancia('inst-2', 'Suporte', 'waba-aaa'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.wabaId).toBe('waba-aaa');
    // A primeira instância vira a alça: a edge function recebe instance_id.
    expect(groups[0]!.instanceId).toBe('inst-1');
    expect(groups[0]!.instanceNames).toEqual(['Comercial', 'Suporte']);
    // O rótulo é humano — jamais o WABA ID cru.
    expect(groups[0]!.label).toBe('Comercial, Suporte');
    expect(groups[0]!.label).not.toContain('waba-aaa');
  });

  it('dois WABAs distintos viram dois grupos, na ordem de entrada', () => {
    const groups = dedupeWabaGroups([
      instancia('inst-1', 'Matriz', 'waba-aaa'),
      instancia('inst-2', 'Filial', 'waba-bbb'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.wabaId)).toEqual(['waba-aaa', 'waba-bbb']);
    expect(groups.map((g) => g.instanceId)).toEqual(['inst-1', 'inst-2']);
    expect(groups.map((g) => g.label)).toEqual(['Matriz', 'Filial']);
  });

  it('uma instância oficial só produz um grupo e nenhuma escolha', () => {
    const groups = dedupeWabaGroups([instancia('inst-1', 'Principal', 'waba-aaa')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('Principal');
  });

  it('instância sem wabaId fica de fora — ela não lista template nenhum', () => {
    const groups = dedupeWabaGroups([
      instancia('inst-1', 'Sem config', null),
      instancia('inst-2', 'Config vazia'),
      instancia('inst-3', 'Completa', 'waba-aaa'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.instanceId).toBe('inst-3');
  });

  it('lista vazia devolve nenhum grupo', () => {
    expect(dedupeWabaGroups([])).toEqual([]);
  });

  it('linha sem nome ainda recebe um rótulo legível', () => {
    const groups = dedupeWabaGroups([
      { id: 'inst-1', name: '', phone_number: '5511999999999', connection_config: { wabaId: 'w' } },
    ]);
    expect(groups[0]!.label).toBe('5511999999999');
  });
});

describe('wabaIdOf', () => {
  it('aceita só a chave wabaId, igual à edge function', () => {
    expect(wabaIdOf(instancia('i', 'n', 'waba-1'))).toBe('waba-1');
    // Ser tolerante com waba_id ofereceria um grupo que a função recusaria.
    expect(wabaIdOf({ id: 'i', connection_config: { waba_id: 'waba-1' } })).toBeNull();
    expect(wabaIdOf({ id: 'i', connection_config: { wabaId: '   ' } })).toBeNull();
    expect(wabaIdOf({ id: 'i', connection_config: 'texto' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Agrupamento por nome
// ---------------------------------------------------------------------------

describe('groupTemplatesByName', () => {
  it('o mesmo nome em vários idiomas vira UM grupo', () => {
    const groups = groupTemplatesByName([
      template('boas_vindas', 'pt_BR'),
      template('boas_vindas', 'en_US'),
      template('boas_vindas', 'es'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe('boas_vindas');
    expect(groups[0]!.languages).toHaveLength(3);
  });

  it('nomes diferentes continuam separados', () => {
    const groups = groupTemplatesByName([
      template('boas_vindas', 'pt_BR'),
      template('confirmacao', 'pt_BR'),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['boas_vindas', 'confirmacao']);
  });

  it('grupo com algum idioma aprovado vem antes de grupo sem nenhum', () => {
    const groups = groupTemplatesByName([
      template('aaa_rejeitado', 'pt_BR', 'REJECTED'),
      template('zzz_aprovado', 'pt_BR', 'APPROVED'),
    ]);
    // Ordem alfabética perderia para o status: aprovado primeiro.
    expect(groups.map((g) => g.name)).toEqual(['zzz_aprovado', 'aaa_rejeitado']);
  });

  it('dentro do grupo, o idioma aprovado vem primeiro', () => {
    const groups = groupTemplatesByName([
      template('promo', 'pt_BR', 'PENDING'),
      template('promo', 'en_US', 'APPROVED'),
    ]);
    expect(groups[0]!.languages.map((t) => t.language)).toEqual(['en_US', 'pt_BR']);
  });

  it('lista vazia devolve nenhum grupo', () => {
    expect(groupTemplatesByName([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

describe('filterTemplateGroups', () => {
  const groups = groupTemplatesByName([
    template('confirmacao_pedido', 'pt_BR', 'APPROVED', 'Sua confirmação chegou'),
    template('boas_vindas', 'pt_BR', 'APPROVED', 'Olá {{1}}, seja bem-vindo'),
  ]);

  it('busca vazia devolve tudo', () => {
    expect(filterTemplateGroups(groups, '')).toHaveLength(2);
    expect(filterTemplateGroups(groups, '   ')).toHaveLength(2);
  });

  it('acha por nome', () => {
    expect(filterTemplateGroups(groups, 'boas').map((g) => g.name)).toEqual(['boas_vindas']);
  });

  it('acha por texto do corpo', () => {
    expect(filterTemplateGroups(groups, 'bem-vindo').map((g) => g.name)).toEqual(['boas_vindas']);
  });

  it('ignora acento nos dois sentidos — o conteúdo é pt-BR', () => {
    // Quem digita sem acento tem de achar o texto acentuado.
    expect(filterTemplateGroups(groups, 'confirmacao')).toHaveLength(1);
    expect(filterTemplateGroups(groups, 'confirmação')).toHaveLength(1);
  });

  it('não achando nada devolve lista vazia', () => {
    expect(filterTemplateGroups(groups, 'inexistente')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Marcação e rótulos
// ---------------------------------------------------------------------------

describe('splitTemplateText', () => {
  it('separa os {{n}} do texto comum', () => {
    expect(splitTemplateText('Olá {{1}}, pedido {{2}} confirmado')).toEqual([
      { type: 'text', value: 'Olá ' },
      { type: 'param', value: '{{1}}' },
      { type: 'text', value: ', pedido ' },
      { type: 'param', value: '{{2}}' },
      { type: 'text', value: ' confirmado' },
    ]);
  });

  it('normaliza o espaço dentro das chaves', () => {
    expect(splitTemplateText('{{ 1 }}')).toEqual([{ type: 'param', value: '{{1}}' }]);
  });

  it('texto sem variável vira um pedaço só', () => {
    expect(splitTemplateText('Sem variáveis')).toEqual([
      { type: 'text', value: 'Sem variáveis' },
    ]);
  });

  it('texto vazio ou ausente não gera pedaço', () => {
    expect(splitTemplateText('')).toEqual([]);
    expect(splitTemplateText(undefined)).toEqual([]);
  });
});

describe('templateStatusLabel', () => {
  it('traduz os status que a Meta usa', () => {
    expect(templateStatusLabel('APPROVED')).toBe('Aprovado');
    expect(templateStatusLabel('PENDING')).toBe('Pendente');
    expect(templateStatusLabel('REJECTED')).toBe('Rejeitado');
    // Estes dois chegavam crus em inglês na tela antes do selo compartilhado.
    expect(templateStatusLabel('PAUSED')).toBe('Pausado');
    expect(templateStatusLabel('DISABLED')).toBe('Desativado');
  });

  it('status novo da Meta volta como veio, em vez de virar tradução inventada', () => {
    expect(templateStatusLabel('ALGO_NOVO')).toBe('ALGO_NOVO');
  });
});

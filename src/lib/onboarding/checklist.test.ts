/**
 * Lista "Primeiros passos": passos por cargo, o filtro de acesso (o MESMO
 * useHelpVisibility da Ajuda), quem vê a lista e o desvio do Gerente para
 * passo que acontece numa Loja.
 *
 * O ESCOPO de cada cargo (Conta inteira, Loja, pessoal) é decidido pela função
 * SQL onboarding_checklist e provado em docs/teste_onboarding.sql; aqui se
 * prova que a tela usa as mesmas chaves e não mistura respostas de cargos.
 */
import { describe, expect, it } from 'vitest';
import { ROLE_ORDER, roleAtLeast, type UserRole } from '@/types/userHierarchy';
import type { HelpAccessDeclaration } from '@/hooks/useHelpVisibility';
import {
  CHECKLISTS,
  buildChecklist,
  decideChecklistView,
  parseChecklistStatus,
  planFazerAgora,
  stepHelpHref,
  type ChecklistStatus,
} from './checklist';
import { getTour } from './tours';
import { ALL_TUTORIALS } from '@/lib/help/tutorials';
import { getFeatureHelp } from '@/lib/help/featureHelp';

/** O mesmo raciocínio do useHelpVisibility, sem React. */
const acessoDe =
  (role: UserRole, modulosLigados: string[] | null = null) =>
  (req: HelpAccessDeclaration) => {
    if (role === 'superadmin') return true;
    if (req.minRole && !roleAtLeast(role, req.minRole)) return false;
    if (req.moduleName && modulosLigados && !modulosLigados.includes(req.moduleName)) return false;
    return true;
  };

const status = (papel: ChecklistStatus['papel'], passos: Record<string, boolean>): ChecklistStatus => ({
  papel,
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
  lojas: papel === 'gerente' ? 1 : null,
  passos,
});

const todos = (papel: ChecklistStatus['papel'], valor: boolean) =>
  Object.fromEntries(CHECKLISTS[papel].map((d) => [d.id, valor]));

// ---------------------------------------------------------------------------
describe('passos de cada cargo', () => {
  it('Gerente: Loja, WhatsApp e equipe obrigatórios; funil, respostas e horário recomendados; chatbot opcional', () => {
    const p = Object.fromEntries(CHECKLISTS.gerente.map((d) => [d.id, d.priority]));
    expect(p).toEqual({
      assinatura: 'obrigatorio',
      dados_fiscais: 'recomendado',
      loja: 'obrigatorio',
      whatsapp: 'obrigatorio',
      equipe: 'obrigatorio',
      funil: 'recomendado',
      respostas_rapidas: 'recomendado',
      horario: 'recomendado',
      chatbot: 'opcional',
    });
  });

  it('Gestor: os mesmos passos da Loja, sem criar Loja e sem assinatura', () => {
    expect(CHECKLISTS.gestor.map((d) => d.id)).toEqual([
      'whatsapp', 'equipe', 'funil', 'respostas_rapidas', 'horario', 'chatbot',
    ]);
  });

  it('Atendente: foto e a primeira conversa respondida (sem o passo de notificações, achado 113)', () => {
    expect(CHECKLISTS.atendente.map((d) => d.id)).toEqual(['foto', 'primeira_resposta']);
  });

  it('templates ficam fora (moram na Meta, a função não confere)', () => {
    const ids = Object.values(CHECKLISTS).flat().map((d) => d.id);
    expect(ids.some((id) => id.includes('template'))).toBe(false);
  });

  it('todo passo com tela tem tour daquela tela, e todo link de ajuda existe', () => {
    for (const def of Object.values(CHECKLISTS).flat()) {
      if (def.screen) {
        expect(def.tourId, `${def.id} sem tour`).toBeTruthy();
        expect(getTour(def.tourId as string)?.route, `${def.id}: tela do passo ≠ tela do tour`).toBe(def.screen);
      }
      if (def.tutorialId) expect(ALL_TUTORIALS.some((t) => t.id === def.tutorialId), def.tutorialId).toBe(true);
      if (def.helpKey) expect(getFeatureHelp(def.helpKey), def.helpKey).toBeTruthy();
      expect(stepHelpHref(def), `${def.id} sem "Ver passo a passo"`).toBeTruthy();
    }
  });

  it('o funil tem "Fazer agora" para Gerente e Gestor; para o Gerente, dentro de uma Loja', () => {
    // 20261021000002: o Gerente grava etapas nas Lojas da Conta dele.
    const doGerente = CHECKLISTS.gerente.find((d) => d.id === 'funil');
    expect(doGerente?.screen).toBe('/dashboard/funnel');
    expect(doGerente?.tourId).toBe('configurar-funil');
    expect(doGerente?.needsLoja).toBe(true);
    expect(CHECKLISTS.gestor.find((d) => d.id === 'funil')?.screen).toBe('/dashboard/funnel');
  });

  it('todo minRole é um cargo válido', () => {
    for (const def of Object.values(CHECKLISTS).flat()) {
      if (def.minRole) expect(Object.keys(ROLE_ORDER)).toContain(def.minRole);
    }
  });
});

// ---------------------------------------------------------------------------
describe('filtro de acesso (useHelpVisibility)', () => {
  it('módulo desligado tira o passo da lista', () => {
    const s = buildChecklist('gestor', status('gestor', {}), acessoDe('gestor', ['conversations', 'funnel']));
    const ids = s.items.map((i) => i.id);
    expect(ids).not.toContain('whatsapp'); // whatsapp-numbers desligado
    expect(ids).not.toContain('chatbot'); // chatbots desligado
    expect(ids).toContain('funil');
  });

  it('passo acima do cargo some (minRole)', () => {
    // Um atendente com a lista do gerente não veria Loja, assinatura nem equipe.
    const s = buildChecklist('gerente', status('gerente', {}), acessoDe('atendente'));
    const ids = s.items.map((i) => i.id);
    for (const fora of ['assinatura', 'dados_fiscais', 'loja', 'whatsapp', 'equipe', 'horario']) {
      expect(ids).not.toContain(fora);
    }
  });

  it('passo que sumiu pelo filtro não conta como pendente', () => {
    const s = buildChecklist('gestor', status('gestor', { equipe: true }), acessoDe('gestor', ['funnel']));
    expect(s.requiredPending).toBe(0); // whatsapp saiu da lista; só sobrou equipe, feita
  });
});

// ---------------------------------------------------------------------------
describe('progresso', () => {
  it('conta feitos, obrigatórios pendentes e completo', () => {
    const s = buildChecklist(
      'gerente',
      status('gerente', { assinatura: true, dados_fiscais: true, loja: true }),
      acessoDe('gerente'),
    );
    expect(s.done).toBe(3);
    expect(s.total).toBe(9);
    expect(s.requiredPending).toBe(2);
    expect(s.complete).toBe(false);
  });

  it('o opcional não segura a lista', () => {
    const passos = { ...todos('gerente', true), chatbot: false };
    expect(buildChecklist('gerente', status('gerente', passos), acessoDe('gerente')).complete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('quem vê a lista', () => {
  const resumo = (papel: ChecklistStatus['papel'], passos: Record<string, boolean>) =>
    buildChecklist(papel, status(papel, passos), acessoDe(papel));

  it('gente nova vê a lista até cumprir obrigatórios e recomendados', () => {
    const s = status('gestor', { whatsapp: true });
    expect(decideChecklistView({ role: 'gestor', state: {}, status: s, summary: resumo('gestor', s.passos) })).toBe('lista');
  });

  it('gente nova com tudo feito vê "tudo pronto" até fechar', () => {
    const passos = todos('atendente', true);
    const s = status('atendente', passos);
    expect(decideChecklistView({ role: 'atendente', state: {}, status: s, summary: resumo('atendente', passos) })).toBe('pronto');
    expect(
      decideChecklistView({
        role: 'atendente',
        state: { lista_escondida_em: '2026-10-21T12:00:00Z' },
        status: s,
        summary: resumo('atendente', passos),
      }),
    ).toBe('oculto');
  });

  it('veterano só vê com passo OBRIGATÓRIO pendente', () => {
    const veterano = { veterano: true, boas_vindas_em: '2026-10-21T12:00:00Z' };
    const comPendente = { ...todos('gerente', true), whatsapp: false };
    const soRecomendado = { ...todos('gerente', true), funil: false, horario: false };
    expect(
      decideChecklistView({ role: 'gerente', state: veterano, status: status('gerente', comPendente), summary: resumo('gerente', comPendente) }),
    ).toBe('lista');
    expect(
      decideChecklistView({ role: 'gerente', state: veterano, status: status('gerente', soRecomendado), summary: resumo('gerente', soRecomendado) }),
    ).toBe('oculto');
  });

  it('atendente veterano nunca vê (não tem obrigatório)', () => {
    const passos = todos('atendente', false);
    expect(
      decideChecklistView({ role: 'atendente', state: { veterano: true }, status: status('atendente', passos), summary: resumo('atendente', passos) }),
    ).toBe('oculto');
  });

  it('lista escondida não volta sozinha', () => {
    const passos = todos('gestor', false);
    expect(
      decideChecklistView({ role: 'gestor', state: { lista_escondida_em: 'x' }, status: status('gestor', passos), summary: resumo('gestor', passos) }),
    ).toBe('oculto');
  });

  it('superadmin, estado não lido e resposta de outro cargo: nada', () => {
    const passos = todos('gestor', false);
    const s = status('gestor', passos);
    const summary = resumo('gestor', passos);
    expect(decideChecklistView({ role: 'superadmin', state: {}, status: s, summary })).toBe('oculto');
    expect(decideChecklistView({ role: 'gestor', state: null, status: s, summary })).toBe('oculto');
    expect(decideChecklistView({ role: 'gestor', state: {}, status: null, summary })).toBe('oculto');
    expect(decideChecklistView({ role: 'atendente', state: {}, status: s, summary })).toBe('oculto');
  });
});

// ---------------------------------------------------------------------------
describe('resposta da função', () => {
  it('lê a resposta do gerente', () => {
    expect(
      parseChecklistStatus({ papel: 'gerente', escopo: 'conta', tenant_id: 't', lojas: 2, passos: { loja: true, whatsapp: 'sim' } }),
    ).toEqual({ papel: 'gerente', tenantId: 't', lojas: 2, passos: { loja: true, whatsapp: false } });
  });

  it('superadmin, lixo e lista vazia (mock) viram null', () => {
    expect(parseChecklistStatus({ papel: 'superadmin', passos: {} })).toBeNull();
    for (const lixo of [null, [], 'x', {}, { papel: 'gestor' }, { papel: 'gestor', passos: [] }]) {
      expect(parseChecklistStatus(lixo)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
describe('Fazer agora', () => {
  const whatsappGerente = CHECKLISTS.gerente.find((d) => d.id === 'whatsapp')!;
  const equipeGerente = CHECKLISTS.gerente.find((d) => d.id === 'equipe')!;
  const LOJA = { id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Loja Centro' };

  it('Gerente na Conta com uma Loja só: abre a Loja sozinho', () => {
    expect(planFazerAgora({ role: 'gerente', item: whatsappGerente, emLoja: false, lojas: [LOJA] })).toEqual({
      tipo: 'trocar-loja',
      lojaId: LOJA.id,
      lojaNome: 'Loja Centro',
      screen: '/dashboard/whatsapp-numbers',
      tourId: 'conectar-whatsapp',
    });
  });

  it('Gerente na Conta com várias Lojas: destaca o seletor', () => {
    const plano = planFazerAgora({
      role: 'gerente',
      item: whatsappGerente,
      emLoja: false,
      lojas: [LOJA, { id: 'aaaaaaaa-0000-4000-8000-000000000003', name: 'Loja Praia' }],
    });
    expect(plano).toEqual({ tipo: 'escolher-loja', tourId: 'escolher-loja' });
  });

  it('Gerente sem Loja: manda criar a primeira', () => {
    expect(planFazerAgora({ role: 'gerente', item: whatsappGerente, emLoja: false, lojas: [] }).tipo).toBe('criar-loja');
  });

  it('Gerente já dentro de uma Loja: vai direto', () => {
    expect(planFazerAgora({ role: 'gerente', item: whatsappGerente, emLoja: true, lojas: [LOJA] })).toEqual({
      tipo: 'abrir',
      screen: '/dashboard/whatsapp-numbers',
      tourId: 'conectar-whatsapp',
    });
  });

  it('passo da Conta (convidar) não troca de Loja', () => {
    expect(planFazerAgora({ role: 'gerente', item: equipeGerente, emLoja: false, lojas: [LOJA] }).tipo).toBe('abrir');
  });

  it('Gestor nunca troca de Loja', () => {
    const item = CHECKLISTS.gestor.find((d) => d.id === 'whatsapp')!;
    expect(planFazerAgora({ role: 'gestor', item, emLoja: true, lojas: [] }).tipo).toBe('abrir');
  });

  it('passo sem tela não faz nada', () => {
    const assinatura = CHECKLISTS.gerente.find((d) => d.id === 'assinatura')!;
    expect(planFazerAgora({ role: 'gerente', item: assinatura, emLoja: true, lojas: [] })).toEqual({ tipo: 'nada' });
  });

  it('funil do Gerente com a Conta em foco e uma Loja só: abre a Loja e vai ao Funil', () => {
    const funil = CHECKLISTS.gerente.find((d) => d.id === 'funil')!;
    expect(planFazerAgora({ role: 'gerente', item: funil, emLoja: false, lojas: [LOJA] })).toEqual({
      tipo: 'trocar-loja',
      lojaId: LOJA.id,
      lojaNome: 'Loja Centro',
      screen: '/dashboard/funnel',
      tourId: 'configurar-funil',
    });
  });
});

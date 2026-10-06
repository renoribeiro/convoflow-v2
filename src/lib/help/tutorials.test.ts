/**
 * Garantias dos tutoriais.
 *
 * Tutorial aponta para FORA de si mesmo: rotas (`screen`) e entradas de
 * documentação (`helpKey`). Renomear uma rota ou apagar uma entrada quebraria o
 * tutorial em silêncio — os dois primeiros testes existem para isso não passar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  TUTORIALS,
  TUTORIAL_KEY_PREFIX,
  getTutorial,
  getTutorialByKey,
  tutorialKey,
  tutorialMatches,
} from './tutorials';
import { FEATURE_HELP, getFeatureHelp } from './featureHelp';
import { ROLE_ORDER } from '@/types/userHierarchy';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(HERE, '..', '..');

/**
 * Rotas reais do dashboard, lidas de App.tsx.
 *
 * As rotas filhas aparecem como `path="conversations"` dentro do `/dashboard`,
 * então o prefixo é reconstruído aqui. Rotas com parâmetro (`:id`) ficam de fora
 * de propósito: não há como linkar para elas sem um id concreto.
 */
function realDashboardRoutes(): string[] {
  const source = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');
  const paths = [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1] ?? '');

  const routes = new Set<string>(['/dashboard']);
  for (const raw of paths) {
    if (!raw || raw.startsWith('/') || raw === '*') continue; // públicas e catch-all
    if (raw.includes(':')) continue; // parametrizada
    routes.add(`/dashboard/${raw}`);
  }
  return [...routes];
}

describe('integridade dos tutoriais', () => {
  it('existe pelo menos um tutorial e todos têm id único', () => {
    expect(TUTORIALS.length).toBeGreaterThan(0);
    const ids = TUTORIALS.map((t) => t.id);
    expect(new Set(ids).size, `ids repetidos em ${ids.join(', ')}`).toBe(ids.length);
  });

  it('todo `screen` de todo passo é uma rota real definida em App.tsx', () => {
    const routes = realDashboardRoutes();

    const broken = TUTORIALS.flatMap((tutorial) =>
      tutorial.steps
        .map((step, index) => ({ tutorial, step, index }))
        .filter(({ step }) => step.screen && !routes.includes(step.screen))
        .map(
          ({ tutorial, step, index }) =>
            `${tutorial.id} passo ${index + 1} → ${step.screen}`,
        ),
    );

    expect(
      broken,
      `Rotas válidas: ${routes.sort().join(', ')}`,
    ).toEqual([]);
  });

  it('todo `helpKey` de todo passo existe em FEATURE_HELP', () => {
    const broken = TUTORIALS.flatMap((tutorial) =>
      tutorial.steps
        .map((step, index) => ({ tutorial, step, index }))
        .filter(({ step }) => step.helpKey && !getFeatureHelp(step.helpKey))
        .map(
          ({ tutorial, step, index }) =>
            `${tutorial.id} passo ${index + 1} → ${step.helpKey}`,
        ),
    );

    expect(broken, 'Passos apontando para entrada de ajuda inexistente').toEqual([]);
  });

  it('todo tutorial tem título, objetivo, público e passos', () => {
    for (const tutorial of TUTORIALS) {
      expect(tutorial.title.trim(), `${tutorial.id}: title vazio`).not.toBe('');
      expect(tutorial.goal.trim(), `${tutorial.id}: goal vazio`).not.toBe('');
      expect(tutorial.forWhom.trim(), `${tutorial.id}: forWhom vazio`).not.toBe('');
      expect(tutorial.steps.length, `${tutorial.id}: sem passos`).toBeGreaterThan(0);
    }
  });

  it('cada tutorial tem entre 5 e 9 passos', () => {
    // Mais que isso já é outro tutorial; menos que isso não guia ninguém.
    const outOfRange = TUTORIALS.filter(
      (t) => t.steps.length < 5 || t.steps.length > 9,
    ).map((t) => `${t.id} (${t.steps.length})`);
    expect(outOfRange).toEqual([]);
  });

  it('todo passo tem título e corpo preenchidos', () => {
    for (const tutorial of TUTORIALS) {
      tutorial.steps.forEach((step, index) => {
        const where = `${tutorial.id} passo ${index + 1}`;
        expect(step.title.trim(), `${where}: title vazio`).not.toBe('');
        expect(step.body.trim(), `${where}: body vazio`).not.toBe('');
        if (step.note !== undefined) {
          expect(step.note.trim(), `${where}: note vazio`).not.toBe('');
        }
      });
    }
  });

  it('todo minRole declarado é um cargo válido', () => {
    const invalid = TUTORIALS.filter((t) => t.minRole && !(t.minRole in ROLE_ORDER)).map(
      (t) => `${t.id} → ${t.minRole}`,
    );
    expect(invalid).toEqual([]);
  });

  it('todo moduleName declarado existe como ModuleGuard em App.tsx', () => {
    const source = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');
    const guarded = new Set(
      [...source.matchAll(/moduleName=["']([^"']+)["']/g)].map((m) => m[1]),
    );
    const unknown = TUTORIALS.filter((t) => t.moduleName && !guarded.has(t.moduleName)).map(
      (t) => `${t.id} → ${t.moduleName}`,
    );
    expect(unknown, `Módulos em App.tsx: ${[...guarded].sort().join(', ')}`).toEqual([]);
  });

  it('nenhuma entrada de FEATURE_HELP usa a categoria "tutorial"', () => {
    // Tutorial tem forma própria e mora em tutorials.ts. Se uma entrada de
    // referência se declarasse 'tutorial', ela sumiria da página.
    const misplaced = Object.entries(FEATURE_HELP)
      .filter(([, entry]) => entry.category === ('tutorial' as never))
      .map(([key]) => key);
    expect(misplaced).toEqual([]);
  });
});

describe('helpers de tutorial', () => {
  it('getTutorial acha por id e devolve null para desconhecido', () => {
    expect(getTutorial('conectar-whatsapp')?.title).toBe('Conectar seu WhatsApp');
    expect(getTutorial('nao-existe')).toBeNull();
    expect(getTutorial(null)).toBeNull();
    expect(getTutorial(undefined)).toBeNull();
    expect(getTutorial('')).toBeNull();
  });

  it('tutorialKey monta a chave do link profundo', () => {
    expect(tutorialKey('conectar-whatsapp')).toBe('tutorial:conectar-whatsapp');
    expect(TUTORIAL_KEY_PREFIX).toBe('tutorial:');
  });

  it('getTutorialByKey só aceita chave com o prefixo', () => {
    expect(getTutorialByKey('tutorial:montar-funil')?.id).toBe('montar-funil');
    expect(getTutorialByKey('montar-funil')).toBeNull();
    expect(getTutorialByKey('page:funnel')).toBeNull();
    expect(getTutorialByKey(null)).toBeNull();
  });

  it('a chave de todo tutorial resolve de volta para ele', () => {
    for (const tutorial of TUTORIALS) {
      expect(getTutorialByKey(tutorialKey(tutorial.id))).toBe(tutorial);
    }
  });
});

describe('busca em tutoriais', () => {
  it('acha pelo título sem acento', () => {
    const funil = getTutorial('montar-funil')!;
    expect(tutorialMatches(funil, 'montar')).toBe(true);
    expect(tutorialMatches(funil, 'FUNIL')).toBe(true);
  });

  it('acha por palavra que só aparece no corpo de um passo', () => {
    // "semáforo" aparece apenas no body de um passo de montar-funil.
    const funil = getTutorial('montar-funil')!;
    expect(tutorialMatches(funil, 'semaforo')).toBe(true);
    expect(tutorialMatches(funil, 'semáforo')).toBe(true);
  });

  it('acha por palavra que só aparece numa ressalva (note)', () => {
    // "System User" está só na note do último passo (campos manuais) de conectar-whatsapp.
    const whatsapp = getTutorial('conectar-whatsapp')!;
    expect(tutorialMatches(whatsapp, 'system user')).toBe(true);
  });

  it('busca vazia casa com todos', () => {
    for (const tutorial of TUTORIALS) {
      expect(tutorialMatches(tutorial, '')).toBe(true);
      expect(tutorialMatches(tutorial, '  ')).toBe(true);
    }
  });

  it('exige todos os termos', () => {
    const campanha = getTutorial('primeira-campanha')!;
    expect(tutorialMatches(campanha, 'template janela')).toBe(true);
    expect(tutorialMatches(campanha, 'template jamaisexistente')).toBe(false);
  });

  it('todo tutorial é encontrável pelo próprio título', () => {
    const unreachable = TUTORIALS.filter((t) => !tutorialMatches(t, t.title)).map((t) => t.id);
    expect(unreachable).toEqual([]);
  });
});

describe('cobertura dos tutoriais de onboarding', () => {
  it('estão na ordem de leitura recomendada', () => {
    // Os seis primeiros montam a Loja (onboarding) — o primeiro é a decisão de
    // qual número vai para a API Oficial, antes de qualquer clique; o sétimo é
    // o dia a dia de quem atende nela e vem por último porque pressupõe os outros.
    // Desde 2026-09-25 (fatia 4b): conectar-instagram logo depois do WhatsApp,
    // o segundo canal da Loja.
    // Desde 2026-09-26 (teste grátis, entrega 3): cancelar-assinatura por
    // último — não é onboarding, é a saída, e só o Gerente o vê. O tutorial
    // teste-gratis (entrega 2) está escrito mas fora da lista até a chave do
    // cadastro pelo site ligar (tutorialTesteGratis.test.ts).
    expect(TUTORIALS.map((t) => t.id)).toEqual([
      'antes-de-conectar',
      'conectar-whatsapp',
      'conectar-instagram',
      'configurar-equipe',
      'montar-funil',
      'primeiro-chatbot',
      'primeira-campanha',
      'atender-conversas',
      'cancelar-assinatura',
    ]);
  });

  it('o tutorial do dia a dia é legível pelo atendente (sem minRole)', () => {
    expect(getTutorial('atender-conversas')?.minRole).toBeUndefined();
    expect(getTutorial('atender-conversas')?.moduleName).toBe('conversations');
  });

  it('o tutorial de equipe abre para o gestor (a tela Equipe abre para ele desde 2026-08-18)', () => {
    // Era 'gerente' até 2026-09-15; os passos de criar Loja são marcados
    // "Só o Gerente" dentro do texto, e o resto (convidar, remover) é do gestor.
    expect(getTutorial('configurar-equipe')?.minRole).toBe('gestor');
  });

  it('os tutoriais que exigem cargo de configuração não são oferecidos ao atendente', () => {
    // conectar-whatsapp: atendente não tem whatsapp.configure; primeira-campanha:
    // atendente não tem campaigns.dispatch. Sem minRole, a página de Ajuda os
    // ofereceria a quem não consegue segui-los.
    expect(getTutorial('conectar-whatsapp')?.minRole).toBe('gestor');
    expect(getTutorial('primeira-campanha')?.minRole).toBe('gestor');
    // antes-de-conectar é o mesmo público de conectar-whatsapp (prepara a
    // conexão), então herda o mesmo cargo e o mesmo módulo.
    expect(getTutorial('antes-de-conectar')?.minRole).toBe('gestor');
    expect(getTutorial('antes-de-conectar')?.moduleName).toBe('whatsapp-numbers');
    // conectar-instagram: mesma capability (whatsapp.configure) e mesma tela.
    expect(getTutorial('conectar-instagram')?.minRole).toBe('gestor');
    expect(getTutorial('conectar-instagram')?.moduleName).toBe('whatsapp-numbers');
  });

  it('o tutorial do Instagram diz o que a tela diz (fatia 4b)', () => {
    const ig = getTutorial('conectar-instagram')!;
    // O nome exato do botão e da seção, e as regras que a pessoa precisa saber
    // antes de clicar: só Loja, conta profissional, a chave da Loja.
    expect(tutorialMatches(ig, 'Conectar Instagram')).toBe(true);
    expect(tutorialMatches(ig, 'Contas do Instagram')).toBe(true);
    expect(tutorialMatches(ig, 'nunca na Conta')).toBe(true);
    expect(tutorialMatches(ig, 'profissional')).toBe(true);
    expect(tutorialMatches(ig, 'Reconectar')).toBe(true);
    expect(tutorialMatches(ig, 'Desligar')).toBe(true);
  });

  it('todo nextTutorialId aponta para outro tutorial existente', () => {
    // O link "Próximo tutorial" no fim dos passos é montado a partir daqui;
    // id inexistente sumiria em silêncio, e apontar para si mesmo é um laço.
    const broken = TUTORIALS.filter(
      (t) => t.nextTutorialId && (t.nextTutorialId === t.id || !getTutorial(t.nextTutorialId)),
    ).map((t) => `${t.id} → ${t.nextTutorialId}`);
    expect(broken).toEqual([]);
  });

  it('a preparação leva para a conexão', () => {
    // O primeiro tutorial para em "tudo pronto"; a conexão em si é o seguinte.
    expect(getTutorial('antes-de-conectar')?.nextTutorialId).toBe('conectar-whatsapp');
  });

  it('a campanha fala de template e da janela de 24 horas', () => {
    const campanha = getTutorial('primeira-campanha')!;
    expect(tutorialMatches(campanha, 'template')).toBe(true);
    expect(tutorialMatches(campanha, '24 horas')).toBe(true);
  });
});

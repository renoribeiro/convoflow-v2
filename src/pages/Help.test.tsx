/**
 * Testes da página de Ajuda (/dashboard/help).
 *
 * Cobrem o que pode quebrar em silêncio: entrada que não renderiza, busca que
 * perde acento, link profundo que não expande, filtro de cargo vazando tela de
 * admin, e o corpo compartilhado divergindo entre o painel lateral e a página.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UserRole } from '@/types/userHierarchy';

// Cada teste daqui monta a página de Ajuda INTEIRA — toda entrada de
// featureHelp mais todos os tutoriais, de uma vez. É a renderização mais cara
// da suíte, e ela só cresce conforme o produto ganha telas.
//
// Com os 10s globais (vitest.config.ts), os dois testes de catálogo completo
// estouravam por tempo quando a suíte roda em paralelo e a máquina está
// disputada — sem nenhuma asserção falhando. Isso é calibragem de tempo, não
// regressão: o mesmo arquivo passa sozinho em ~500ms por teste. O limite maior
// vale só para este arquivo.
vi.setConfig({ testTimeout: 30000 });

// ── mocks ────────────────────────────────────────────────────────────────────

/** Cargo do usuário no teste corrente. */
let currentRole: UserRole | null = 'superadmin';
/** Módulos habilitados; null = todos habilitados. */
let enabledModules: string[] | null = null;

vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => currentRole,
}));

vi.mock('@/hooks/useModules', () => ({
  useModules: () => ({
    isModuleVisible: (name: string) =>
      enabledModules === null ? true : enabledModules.includes(name),
    isLoading: false,
  }),
}));

// ── helpers ──────────────────────────────────────────────────────────────────

import Help from './Help';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import {
  FEATURE_HELP,
  getHelpByCategory,
  helpEntryMatches,
  type FeatureHelpEntry,
  type FeatureHelpItem,
} from '@/lib/help/featureHelp';
import { TUTORIALS, tutorialKey } from '@/lib/help/tutorials';

/** Entrada por chave, falhando o teste se ela não existir. */
function entryOf(key: string): FeatureHelpEntry {
  const entry = FEATURE_HELP[key];
  if (!entry) throw new Error(`entrada de ajuda ausente: ${key}`);
  return entry;
}

function renderHelp(hash = '') {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/help${hash}`]}>
      <Help />
    </MemoryRouter>,
  );
}

/** Todas as entradas de todas as categorias, com a chave. */
function allItems(): FeatureHelpItem[] {
  return (['tela', 'chatbot', 'automacao', 'conceito'] as const).flatMap((category) =>
    getHelpByCategory(category).flatMap((group) => group.entries),
  );
}

/** Texto dos passos de "Como configurar" dentro de um container. */
function stepTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('ol > li')).map((li) =>
    (li.textContent ?? '').trim(),
  );
}

beforeEach(() => {
  currentRole = 'superadmin';
  enabledModules = null;
});

// ── 1. Renderização de todas as entradas ─────────────────────────────────────

describe('Help — renderização', () => {
  it('renderiza o título de toda entrada devolvida por getHelpByCategory', () => {
    renderHelp();

    const items = allItems();
    expect(items.length).toBe(Object.keys(FEATURE_HELP).length);

    const missing = items
      .filter((item) => screen.queryAllByText(item.title).length === 0)
      .map((item) => item.key);

    expect(missing, 'Entradas sem título visível na página').toEqual([]);
  });

  it('monta um item de sanfona com id igual à chave, para o link profundo', () => {
    renderHelp();
    for (const item of allItems()) {
      expect(document.getElementById(item.key), `sem id para ${item.key}`).not.toBeNull();
    }
  });

  it('mostra as seções na ordem de HELP_CATEGORIES, com Tutoriais primeiro', () => {
    renderHelp();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Tutoriais', 'Telas', 'Chatbot', 'Automações', 'Conceitos']);
  });

  it('não escreve conteúdo próprio: todo tópico vem de featureHelp.ts ou tutorials.ts', () => {
    renderHelp();
    const known = new Set([
      ...Object.values(FEATURE_HELP).map((entry) => entry.title),
      ...TUTORIALS.map((tutorial) => tutorial.title),
    ]);
    const triggers = screen
      .getAllByRole('button')
      .map((b) => (b.textContent ?? '').trim())
      .filter((text) => text.length > 0);

    // Botões que não são gatilho de sanfona (limpar busca, dispensar) não entram.
    const accordionTriggers = triggers.filter((text) => known.has(text) || text.length > 25);
    const unknown = accordionTriggers.filter((text) => !known.has(text));
    expect(unknown, 'Tópicos com texto fora dos arquivos de conteúdo').toEqual([]);
  });
});

// ── 1b. Tutoriais ────────────────────────────────────────────────────────────

describe('Help — tutoriais', () => {
  const topic = (title: string) => screen.queryByRole('button', { name: title });

  it('renderiza todos os tutoriais sem erro', () => {
    renderHelp();
    const missing = TUTORIALS.filter((t) => topic(t.title) === null).map((t) => t.id);
    expect(missing, 'Tutoriais sem gatilho na página').toEqual([]);
  });

  it('monta um item com id igual à chave de deep link de cada tutorial', () => {
    renderHelp();
    for (const tutorial of TUTORIALS) {
      expect(
        document.getElementById(tutorialKey(tutorial.id)),
        `sem id para ${tutorial.id}`,
      ).not.toBeNull();
    }
  });

  it('mostra objetivo, público e os passos numerados do tutorial aberto', () => {
    const tutorial = TUTORIALS[0]!;
    renderHelp(`#${tutorialKey(tutorial.id)}`);

    const item = document.getElementById(tutorialKey(tutorial.id)) as HTMLElement;
    expect(within(item).getByText(tutorial.goal)).toBeTruthy();
    expect(within(item).getByText(tutorial.forWhom)).toBeTruthy();

    for (const step of tutorial.steps) {
      expect(within(item).getByText(step.title), `passo ausente: ${step.title}`).toBeTruthy();
    }
    // A numeração acompanha a quantidade de passos.
    expect(item.querySelectorAll('ol > li')).toHaveLength(tutorial.steps.length);
  });

  it('cria link para a rota do passo e para a documentação do passo', () => {
    const tutorial = TUTORIALS[0]!;
    renderHelp(`#${tutorialKey(tutorial.id)}`);
    const item = document.getElementById(tutorialKey(tutorial.id)) as HTMLElement;

    const stepWithScreen = tutorial.steps.find((s) => s.screen)!;
    const hrefs = Array.from(item.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(stepWithScreen.screen);

    const stepWithDoc = tutorial.steps.find((s) => s.helpKey)!;
    expect(hrefs).toContain(`/dashboard/help#${stepWithDoc.helpKey}`);
  });

  it('mostra o link "Próximo tutorial" quando o tutorial declara um', () => {
    const tutorial = TUTORIALS[0]!;
    const next = TUTORIALS.find((t) => t.id === tutorial.nextTutorialId)!;
    renderHelp(`#${tutorialKey(tutorial.id)}`);
    const item = document.getElementById(tutorialKey(tutorial.id)) as HTMLElement;
    const link = within(item).getByRole('link', { name: `Próximo tutorial: ${next.title}` });
    expect(link.getAttribute('href')).toBe(`/dashboard/help#${tutorialKey(next.id)}`);
  });

  it('mostra a ressalva (note) quando o passo tem uma', () => {
    const tutorial = TUTORIALS[0]!;
    const note = tutorial.steps.find((s) => s.note)!.note!;
    renderHelp(`#${tutorialKey(tutorial.id)}`);
    const item = document.getElementById(tutorialKey(tutorial.id)) as HTMLElement;
    expect(within(item).getByText(note)).toBeTruthy();
  });
});

// ── 2. Busca ─────────────────────────────────────────────────────────────────

describe('Help — busca', () => {
  const type = (value: string) => {
    fireEvent.change(screen.getByLabelText('Buscar na ajuda'), { target: { value } });
  };

  it('acha "Automação" digitando "automacao" (sem acento)', () => {
    renderHelp();
    type('automacao');

    expect(screen.getByText('Automação')).toBeTruthy();
    // Uma entrada que não fala de automação sai da lista.
    expect(screen.queryByText('Limites de uso por nível')).toBeNull();
  });

  it('ignora a caixa das letras', () => {
    renderHelp();
    type('CONVERSAS');
    expect(screen.getByText('Conversas')).toBeTruthy();
  });

  it('acha por acento quando o usuário digita com acento', () => {
    renderHelp();
    type('variável');
    expect(screen.getByText('Variáveis')).toBeTruthy();
  });

  it('exige todos os termos da busca', () => {
    renderHelp();
    type('campanha jamaisexistente');
    expect(screen.getByText('Nenhum tópico encontrado')).toBeTruthy();
  });

  it('mostra o estado vazio em pt-BR e o botão de limpar devolve a lista', () => {
    renderHelp();
    type('zzzzzzzz');

    expect(screen.getByText('Nenhum tópico encontrado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));

    expect(screen.queryByText('Nenhum tópico encontrado')).toBeNull();
    expect(screen.getByText('Conversas')).toBeTruthy();
  });

  it('helpEntryMatches normaliza acento nos dois sentidos', () => {
    const entry = entryOf('page:automation');
    expect(helpEntryMatches(entry, 'automacao')).toBe(true);
    expect(helpEntryMatches(entry, 'Automação')).toBe(true);
    expect(helpEntryMatches(entry, 'AUTOMACAO')).toBe(true);
    expect(helpEntryMatches(entry, '')).toBe(true);
    expect(helpEntryMatches(entry, 'jamaisexistente')).toBe(false);
  });

  it('busca também no corpo do texto, não só no título', () => {
    // "plantão" aparece no exemplo de page:chatbots, não no título.
    renderHelp();
    type('plantao');
    expect(screen.getByText('Chatbots')).toBeTruthy();
  });

  it('acha um tutorial por palavra que só existe no corpo de um passo, sem acento', () => {
    // "semáforo" aparece apenas no body de um passo de "Montar seu funil de vendas".
    renderHelp();
    type('semaforo');

    expect(screen.getByRole('button', { name: 'Montar seu funil de vendas' })).toBeTruthy();
    expect(screen.getByText('Tutoriais')).toBeTruthy();
    // E nenhum outro tutorial casa com esse termo.
    expect(screen.queryByRole('button', { name: 'Conectar seu WhatsApp' })).toBeNull();
  });

  it('acha um tutorial por palavra que só existe numa ressalva', () => {
    renderHelp();
    type('system user');
    expect(screen.getByRole('button', { name: 'Conectar seu WhatsApp' })).toBeTruthy();
  });

  it('esconde a seção Tutoriais quando nenhum tutorial casa com a busca', () => {
    renderHelp();
    // "silenciar" só aparece nas entradas de referência (aviso de atraso de
    // conversa); nenhum tutorial fala disso.
    type('silenciar');
    expect(screen.queryByText('Tutoriais')).toBeNull();
    expect(screen.getByText('Telas')).toBeTruthy();
  });
});

// ── 3. Link profundo ─────────────────────────────────────────────────────────

describe('Help — link profundo', () => {
  it('expande a entrada do hash', () => {
    renderHelp('#page:conversations');

    const item = document.getElementById('page:conversations');
    expect(item?.getAttribute('data-state')).toBe('open');
    // O conteúdo (que o Radix só monta quando aberto) está na tela.
    expect(
      within(item as HTMLElement).getByText('Como configurar'),
    ).toBeTruthy();
  });

  it('deixa as outras entradas fechadas', () => {
    renderHelp('#page:conversations');
    expect(document.getElementById('page:contacts')?.getAttribute('data-state')).toBe('closed');
  });

  it('funciona para uma chave que não é de tela', () => {
    renderHelp('#concept:variables');
    expect(document.getElementById('concept:variables')?.getAttribute('data-state')).toBe('open');
  });

  it('hash desconhecido não abre nada nem quebra a página', () => {
    renderHelp('#page:naoexiste');
    expect(screen.getByText('Conversas')).toBeTruthy();
    expect(document.querySelectorAll('[data-state="open"]').length).toBe(0);
  });

  it('sem hash, tudo começa fechado', () => {
    renderHelp();
    expect(document.querySelectorAll('[data-state="open"]').length).toBe(0);
  });

  it('expande o tutorial certo por #tutorial:<id>', () => {
    renderHelp('#tutorial:montar-funil');

    const item = document.getElementById('tutorial:montar-funil');
    expect(item?.getAttribute('data-state')).toBe('open');
    // Os outros tutoriais seguem fechados.
    expect(
      document.getElementById('tutorial:conectar-whatsapp')?.getAttribute('data-state'),
    ).toBe('closed');
  });

  it('o conteúdo do tutorial do hash aparece na tela', () => {
    renderHelp('#tutorial:primeira-campanha');
    const item = document.getElementById('tutorial:primeira-campanha') as HTMLElement;
    const tutorial = TUTORIALS.find((t) => t.id === 'primeira-campanha')!;
    expect(within(item).getByText(tutorial.steps[0]!.title)).toBeTruthy();
  });

  it('hash de tutorial inexistente não abre nada', () => {
    renderHelp('#tutorial:nao-existe');
    expect(document.querySelectorAll('[data-state="open"]').length).toBe(0);
  });

  it('o link do estado vazio de Conversas abre o tutorial do dia a dia expandido e rolado, para o atendente', () => {
    // É o href exato que ChatWindow monta (ver ChatWindow.emptyState.test.tsx).
    currentRole = 'atendente';
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderHelp('#tutorial:atender-conversas');

      const item = document.getElementById('tutorial:atender-conversas') as HTMLElement;
      expect(item?.getAttribute('data-state')).toBe('open');
      const tutorial = TUTORIALS.find((t) => t.id === 'atender-conversas')!;
      expect(within(item).getByText(tutorial.steps[0]!.title)).toBeTruthy();

      // A rolagem espera a sanfona abrir (SCROLL_DELAY_MS = 150).
      expect(scrollIntoView).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(item);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── 4. Filtro por cargo ──────────────────────────────────────────────────────

describe('Help — visibilidade por cargo', () => {
  const ADMIN_TITLES = ['Administração', 'Gestão de Usuários', 'Limites de uso por nível'];
  const GERENTE_TITLES = ['Equipe', 'Comparar Lojas'];

  /**
   * O gatilho da sanfona do tópico — o título é o nome acessível do botão.
   * Consulta por papel, e não por texto, porque alguns títulos coincidem com o
   * rótulo da área (a área "Equipe" e a tela "Equipe", por exemplo).
   */
  const topic = (title: string) => screen.queryByRole('button', { name: title });

  it('superadmin vê as telas de Admin', () => {
    currentRole = 'superadmin';
    renderHelp();
    for (const title of ADMIN_TITLES) {
      expect(topic(title), `superadmin deveria ver "${title}"`).not.toBeNull();
    }
    expect(screen.getByText('Admin')).toBeTruthy();
  });

  it('atendente NÃO vê as telas de Admin', () => {
    currentRole = 'atendente';
    renderHelp();
    for (const title of ADMIN_TITLES) {
      expect(topic(title), `atendente não deveria ver "${title}"`).toBeNull();
    }
    // A área "Admin" desaparece junto, por ficar sem entradas.
    expect(screen.queryByText('Admin')).toBeNull();
  });

  it('atendente NÃO vê as telas de Equipe (minRole gerente)', () => {
    currentRole = 'atendente';
    renderHelp();
    for (const title of GERENTE_TITLES) {
      expect(topic(title), `atendente não deveria ver "${title}"`).toBeNull();
    }
  });

  it('gerente vê Equipe mas não vê Admin', () => {
    currentRole = 'gerente';
    renderHelp();
    for (const title of GERENTE_TITLES) {
      expect(topic(title), `gerente deveria ver "${title}"`).not.toBeNull();
    }
    for (const title of ADMIN_TITLES) {
      expect(topic(title), `gerente não deveria ver "${title}"`).toBeNull();
    }
  });

  it('gestor vê Equipe (administra a própria Loja) mas não vê Admin', () => {
    // A rota /dashboard/team passou a aceitar minRole="gestor" em 2026-08-18:
    // o Gestor convida os Atendentes da Loja dele. A ajuda acompanha o acesso.
    currentRole = 'gestor';
    renderHelp();
    expect(topic('Equipe')).not.toBeNull();
    expect(topic('Administração')).toBeNull();
  });

  it('atendente continua vendo Chatbot, Automações e Conceitos', () => {
    currentRole = 'atendente';
    renderHelp();
    expect(screen.getByText('Chatbot')).toBeTruthy();
    expect(screen.getByText('Automações')).toBeTruthy();
    expect(screen.getByText('Conceitos')).toBeTruthy();
    expect(topic('Variáveis')).not.toBeNull();
    expect(topic('Fazer Pergunta')).not.toBeNull();
  });

  it('módulo desabilitado esconde a tela dele', () => {
    currentRole = 'gestor';
    enabledModules = ['conversations', 'contacts'];
    renderHelp();

    expect(topic('Conversas')).not.toBeNull();
    expect(topic('Campanhas de Disparo')).toBeNull();
    expect(topic('Construtor de Fluxo')).toBeNull();
  });

  it('superadmin ignora módulo desabilitado (mesmo bypass dos guards)', () => {
    currentRole = 'superadmin';
    enabledModules = [];
    renderHelp();
    expect(topic('Campanhas de Disparo')).not.toBeNull();
  });

  it('telas sem módulo e sem cargo aparecem para o atendente', () => {
    currentRole = 'atendente';
    enabledModules = [];
    renderHelp();
    expect(topic('Configurações')).not.toBeNull();
    expect(topic('Notificações')).not.toBeNull();
  });

  // ── tutoriais seguem a mesma declaração de acesso ────────────────────────

  it('atendente vê só os tutoriais que consegue seguir (funil e chatbot)', () => {
    // Desde 2026-09-15: conectar-whatsapp, configurar-equipe e primeira-campanha
    // exigem gestor (whatsapp.configure / store.admin / campaigns.dispatch).
    currentRole = 'atendente';
    renderHelp();
    expect(topic('Configurar sua equipe')).toBeNull();
    expect(topic('Antes de conectar seu WhatsApp')).toBeNull();
    expect(topic('Conectar seu WhatsApp')).toBeNull();
    expect(topic('Conectar seu Instagram')).toBeNull();
    expect(topic('Disparar sua primeira campanha')).toBeNull();
    expect(topic('Montar seu funil de vendas')).not.toBeNull();
    expect(topic('Criar seu primeiro chatbot')).not.toBeNull();
  });

  it('gestor vê o tutorial de equipe (a tela Equipe abre para ele desde 2026-08-18)', () => {
    currentRole = 'gestor';
    renderHelp();
    expect(topic('Configurar sua equipe')).not.toBeNull();
    expect(topic('Antes de conectar seu WhatsApp')).not.toBeNull();
    expect(topic('Conectar seu WhatsApp')).not.toBeNull();
    expect(topic('Conectar seu Instagram')).not.toBeNull();
  });

  it('mostra o tutorial de equipe para gerente e superadmin', () => {
    currentRole = 'gerente';
    renderHelp();
    expect(topic('Configurar sua equipe')).not.toBeNull();
  });

  it('esconde tutorial cujo módulo está desabilitado', () => {
    currentRole = 'gestor';
    enabledModules = ['whatsapp-numbers'];
    renderHelp();

    expect(topic('Conectar seu WhatsApp')).not.toBeNull();
    expect(topic('Disparar sua primeira campanha')).toBeNull();
    expect(topic('Criar seu primeiro chatbot')).toBeNull();
  });

  it('superadmin vê todos os tutoriais', () => {
    currentRole = 'superadmin';
    enabledModules = [];
    renderHelp();
    for (const tutorial of TUTORIALS) {
      expect(topic(tutorial.title), `superadmin deveria ver "${tutorial.title}"`).not.toBeNull();
    }
  });
});

// ── 5. Corpo compartilhado entre o painel lateral e a página ─────────────────

describe('FeatureHelpBody — mesma saída no painel e na página', () => {
  const KEY = 'page:conversations';

  it('os passos de "Como configurar" são idênticos nos dois lugares', () => {
    // Painel lateral: abre o Sheet.
    const sheet = render(
      <MemoryRouter>
        <FeatureHelp helpKey={KEY} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ajuda:/ }));
    const fromSheet = stepTexts(document.body);
    sheet.unmount();

    // Página: mesma entrada via link profundo.
    renderHelp(`#${KEY}`);
    const fromPage = stepTexts(document.getElementById(KEY) as HTMLElement);

    expect(fromSheet.length).toBeGreaterThan(0);
    expect(fromPage).toEqual(fromSheet);
    expect(fromPage).toEqual(entryOf(KEY).howToConfigure);
  });

  it('as duas telas mostram as mesmas seções', () => {
    const sheet = render(
      <MemoryRouter>
        <FeatureHelp helpKey={KEY} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ajuda:/ }));
    const sheetSections = Array.from(document.querySelectorAll('h4')).map((h) =>
      (h.textContent ?? '').trim(),
    );
    sheet.unmount();

    renderHelp(`#${KEY}`);
    const pageSections = Array.from(
      (document.getElementById(KEY) as HTMLElement).querySelectorAll('h4'),
    ).map((h) => (h.textContent ?? '').trim());

    expect(sheetSections).toEqual(pageSections);
    expect(sheetSections).toContain('Como configurar');
  });

  it('o painel lateral leva para a documentação ancorada na própria chave', () => {
    render(
      <MemoryRouter>
        <FeatureHelp helpKey={KEY} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ajuda:/ }));

    const link = screen.getByRole('link', { name: 'Ver toda a documentação' });
    expect(link.getAttribute('href')).toBe(`/dashboard/help#${KEY}`);
  });
});

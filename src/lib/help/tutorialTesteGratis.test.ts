/**
 * O tutorial do cadastro pelo site (entrega 2).
 *
 * Ele fica FORA de TUTORIALS enquanto a chave PUBLIC_SIGNUP_ENABLED está
 * desligada — então tutorials.test.ts, que varre TUTORIALS, não o vê. Este
 * arquivo aplica a ele as mesmas garantias, para ele não chegar quebrado no
 * dia em que a chave virar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ALL_TUTORIALS,
  TUTORIALS,
  TUTORIAL_TESTE_GRATIS_ID,
  visibleTutorials,
} from './tutorials';
import { getFeatureHelp } from './featureHelp';
import { ROLE_ORDER } from '@/types/userHierarchy';
import { PUBLIC_SIGNUP_ENABLED } from '@/lib/signup/release';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(HERE, '..', '..');

function realDashboardRoutes(): string[] {
  const source = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');
  const paths = [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1] ?? '');
  const routes = new Set<string>(['/dashboard']);
  for (const raw of paths) {
    if (!raw || raw.startsWith('/') || raw === '*' || raw.includes(':')) continue;
    routes.add(`/dashboard/${raw}`);
  }
  return [...routes];
}

const tutorial = ALL_TUTORIALS.find((t) => t.id === TUTORIAL_TESTE_GRATIS_ID);

describe('tutorial do teste grátis', () => {
  it('está escrito', () => {
    expect(tutorial).toBeDefined();
  });

  it('só aparece com a chave ligada', () => {
    expect(visibleTutorials(ALL_TUTORIALS, false).map((t) => t.id)).not.toContain(TUTORIAL_TESTE_GRATIS_ID);
    expect(visibleTutorials(ALL_TUTORIALS, true).map((t) => t.id)).toContain(TUTORIAL_TESTE_GRATIS_ID);
    expect(TUTORIALS.some((t) => t.id === TUTORIAL_TESTE_GRATIS_ID)).toBe(PUBLIC_SIGNUP_ENABLED);
  });

  it('a chave não esconde nenhum outro tutorial', () => {
    expect(visibleTutorials(ALL_TUTORIALS, false)).toHaveLength(ALL_TUTORIALS.length - 1);
  });

  it('tem de 5 a 9 passos, todos com título e corpo', () => {
    expect(tutorial!.steps.length).toBeGreaterThanOrEqual(5);
    expect(tutorial!.steps.length).toBeLessThanOrEqual(9);
    for (const passo of tutorial!.steps) {
      expect(passo.title.trim()).not.toBe('');
      expect(passo.body.trim()).not.toBe('');
    }
  });

  it('toda rota e toda ajuda citada existem', () => {
    const rotas = realDashboardRoutes();
    for (const passo of tutorial!.steps) {
      if (passo.screen) expect(rotas, passo.title).toContain(passo.screen);
      if (passo.helpKey) expect(getFeatureHelp(passo.helpKey), passo.helpKey).not.toBeNull();
    }
  });

  it('declara um cargo válido e aponta para um tutorial que existe', () => {
    expect(tutorial!.minRole && tutorial!.minRole in ROLE_ORDER).toBe(true);
    expect(ALL_TUTORIALS.some((t) => t.id === tutorial!.nextTutorialId)).toBe(true);
  });
});

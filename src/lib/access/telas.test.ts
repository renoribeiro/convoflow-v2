/**
 * O registro único de telas (telas.ts) contra a matriz de capacidades e contra
 * as rotas de App.tsx. Se alguém criar uma rota sem linha no registro, ou uma
 * linha sem rota, o teste quebra antes do menu e da guarda discordarem.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_CAPABILITIES, resolveCapabilities, type UserRole } from '@/types/userHierarchy';
import { TELAS, acessoATela, aQuemPedir, telaDoCaminho, telaNoMenu, type ContextoDeAcesso } from './telas';

const APP = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../App.tsx'), 'utf8');

const ctx = (papel: UserRole, modulos: string[] | null = null): ContextoDeAcesso => ({
  papel,
  capacidades: resolveCapabilities(papel),
  moduloLigado: modulos ? (m) => papel === 'superadmin' || modulos.includes(m) : null,
});

const menuDe = (papel: UserRole) => TELAS.filter((t) => telaNoMenu(t, ctx(papel))).map((t) => t.chave);

describe('registro de telas', () => {
  it('toda TelaGuard de App.tsx aponta para uma tela do registro, e toda tela tem TelaGuard', () => {
    const guardadas = new Set([...APP.matchAll(/<TelaGuard chave="([^"]*)">/g)].map((m) => m[1] ?? ""));
    const registro = new Set(TELAS.map((t) => t.chave));
    expect([...guardadas].filter((c) => !registro.has(c))).toEqual([]);
    expect([...registro].filter((c) => !guardadas.has(c))).toEqual([]);
  });

  it('não sobrou ModuleGuard nem RoleGuard em App.tsx (uma regra só)', () => {
    expect(APP).not.toMatch(/<(ModuleGuard|RoleGuard)\b/);
  });

  it('toda capacidade exigida existe na matriz', () => {
    const invalidas = TELAS.filter((t) => t.capacidade && !ALL_CAPABILITIES.includes(t.capacidade));
    expect(invalidas).toEqual([]);
  });

  it('chave única', () => {
    expect(new Set(TELAS.map((t) => t.chave)).size).toBe(TELAS.length);
  });

  it('o construtor do chatbot cai na regra de Chatbots', () => {
    expect(telaDoCaminho('/dashboard/chatbots/abc/builder')?.chave).toBe('chatbots');
    expect(telaDoCaminho('/dashboard/admin/users')?.chave).toBe('admin/users');
    expect(telaDoCaminho('/dashboard')?.chave).toBe('');
  });
});

describe('menu por cargo (achado 24 do checkup)', () => {
  it('atendente: sem Instâncias, Equipe, Comparar Lojas e Administração', () => {
    const menu = menuDe('atendente');
    for (const fora of ['whatsapp-numbers', 'team', 'store-comparison', 'admin']) expect(menu).not.toContain(fora);
    for (const dentro of ['', 'conversations', 'contacts', 'funnel', 'campaigns', 'templates', 'help', 'settings']) {
      expect(menu).toContain(dentro);
    }
  });

  it('gestor: Equipe e Instâncias sim; Comparar Lojas e Administração não', () => {
    const menu = menuDe('gestor');
    expect(menu).toContain('team');
    expect(menu).toContain('whatsapp-numbers');
    expect(menu).not.toContain('store-comparison');
    expect(menu).not.toContain('admin');
  });

  it('gerente: Equipe e Comparar Lojas sim; Administração não', () => {
    const menu = menuDe('gerente');
    expect(menu).toContain('team');
    expect(menu).toContain('store-comparison');
    expect(menu).not.toContain('admin');
  });

  it('superadmin: Administração no menu; Equipe e Comparar Lojas fora do menu mas alcançáveis', () => {
    const menu = menuDe('superadmin');
    expect(menu).toContain('admin');
    expect(menu).not.toContain('team');
    const team = TELAS.find((t) => t.chave === 'team')!;
    expect(acessoATela(team, ctx('superadmin'))).toBe('liberado');
  });

  it('módulo desligado some do menu, menos para o superadmin', () => {
    const campanhas = TELAS.find((t) => t.chave === 'campaigns')!;
    expect(acessoATela(campanhas, ctx('gerente', ['contacts']))).toBe('modulo_desligado');
    expect(acessoATela(campanhas, ctx('superadmin', []))).toBe('liberado');
    // Enquanto os módulos carregam, nada some.
    expect(acessoATela(campanhas, ctx('gerente', null))).toBe('liberado');
  });

  it('sem a capacidade vem antes de módulo: o atendente não vê Instâncias nem com o módulo ligado', () => {
    const inst = TELAS.find((t) => t.chave === 'whatsapp-numbers')!;
    expect(acessoATela(inst, ctx('atendente', ['whatsapp-numbers']))).toBe('sem_capacidade');
  });
});

describe('a quem pedir', () => {
  it('cada cargo recebe a pessoa certa', () => {
    expect(aQuemPedir('atendente', 'sem_capacidade')).toMatch(/Gestor da sua Loja/);
    expect(aQuemPedir('gestor', 'sem_capacidade')).toMatch(/Gerente da sua Conta/);
    expect(aQuemPedir('gerente', 'sem_capacidade')).toMatch(/contato@convoflow\.com\.br/);
    expect(aQuemPedir('gerente', 'modulo_desligado')).toMatch(/contato@convoflow\.com\.br/);
    expect(aQuemPedir('atendente', 'modulo_desligado')).toMatch(/Gerente da sua Conta/);
  });
});

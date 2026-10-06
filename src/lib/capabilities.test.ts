import { describe, it, expect } from 'vitest';
import {
  can as canServer,
  normalizeRole as normalizeRoleServer,
  DEFAULT_CAPABILITIES as SERVER_MATRIX,
  CAPABILITY_DENIAL_MESSAGES,
  statusDenialMessage,
  type Capability as ServerCapability,
  type UserRole as ServerRole,
} from '../../supabase/functions/_shared/capabilities';
import {
  ALL_CAPABILITIES,
  DEFAULT_CAPABILITIES as CLIENT_MATRIX,
  type Capability,
  type UserRole,
} from '@/types/userHierarchy';

const ROLES: UserRole[] = ['superadmin', 'gerente', 'gestor', 'atendente'];

/**
 * A matriz de permissões existe em três lugares (UI, edge functions, SQL).
 * Este bloco garante que os dois primeiros não se separem. O terceiro
 * (public.has_capability) é conferido pela query no fim de
 * docs/aplicar_access_control.sql.
 */
describe('paridade entre a matriz do front e a do servidor', () => {
  it('as duas cobrem exatamente as mesmas capabilities', () => {
    for (const role of ROLES) {
      expect(Object.keys(SERVER_MATRIX[role as ServerRole]).sort()).toEqual(
        [...ALL_CAPABILITIES].sort(),
      );
    }
  });

  it('todo par (role, capability) tem o mesmo valor dos dois lados', () => {
    for (const role of ROLES) {
      for (const capability of ALL_CAPABILITIES) {
        expect(
          SERVER_MATRIX[role as ServerRole][capability as ServerCapability],
          `${role} × ${capability} divergiu entre front e servidor`,
        ).toBe(CLIENT_MATRIX[role][capability as Capability]);
      }
    }
  });

  it('toda capability tem mensagem de negação em pt-BR', () => {
    for (const capability of ALL_CAPABILITIES) {
      const message = CAPABILITY_DENIAL_MESSAGES[capability as ServerCapability];
      expect(message, `sem mensagem para ${capability}`).toBeTruthy();
      expect(message.length).toBeGreaterThan(10);
    }
  });
});

describe('can() do servidor — o que cada role NÃO pode', () => {
  it('atendente não dispara campanha nem mexe em orçamento', () => {
    expect(canServer('atendente', 'campaigns.dispatch')).toBe(false);
    expect(canServer('atendente', 'campaigns.budget')).toBe(false);
  });

  it('atendente não configura WhatsApp nem administra a Loja', () => {
    expect(canServer('atendente', 'whatsapp.configure')).toBe(false);
    expect(canServer('atendente', 'store.admin')).toBe(false);
  });

  it('atendente não contrata assinatura', () => {
    expect(canServer('atendente', 'billing.manage')).toBe(false);
  });

  it('atendente continua atendendo — o corte é de configuração, não de operação', () => {
    expect(canServer('atendente', 'conversations.handle')).toBe(true);
    expect(canServer('atendente', 'contacts.manage')).toBe(true);
    expect(canServer('atendente', 'campaigns.view_convos')).toBe(true);
  });

  it('gestor dispara campanha e configura WhatsApp, mas não troca de Loja', () => {
    expect(canServer('gestor', 'campaigns.dispatch')).toBe(true);
    expect(canServer('gestor', 'whatsapp.configure')).toBe(true);
    expect(canServer('gestor', 'stores.switch')).toBe(false);
    expect(canServer('gestor', 'stores.compare')).toBe(false);
  });

  it('gestor contrata o plano da própria Loja (é o que destrava o paywall)', () => {
    expect(canServer('gestor', 'billing.manage')).toBe(true);
    // ...mas não é ele quem vê o painel de cobrança do grupo.
    expect(canServer('gestor', 'billing.view')).toBe(false);
  });

  it('gerente faz tudo da Loja e do grupo, menos operação de plataforma', () => {
    expect(canServer('gerente', 'stores.switch')).toBe(true);
    expect(canServer('gerente', 'stores.compare')).toBe(true);
    expect(canServer('gerente', 'billing.view')).toBe(true);
    expect(canServer('gerente', 'platform.ops')).toBe(false);
  });

  it('superadmin faz tudo', () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(canServer('superadmin', capability as ServerCapability)).toBe(true);
    }
  });
});

describe('can() do servidor — casos de borda fecham por padrão', () => {
  it('role nula/ausente cai no conjunto mais restritivo', () => {
    expect(canServer(null, 'campaigns.dispatch')).toBe(false);
    expect(canServer(undefined, 'store.admin')).toBe(false);
    expect(canServer('', 'whatsapp.configure')).toBe(false);
  });

  it('role desconhecida cai no conjunto mais restritivo', () => {
    expect(canServer('lixo', 'store.admin')).toBe(false);
    expect(canServer('lixo', 'conversations.handle')).toBe(true); // operação é de todos
  });

  it('overrides por usuário ganham do default da role', () => {
    expect(
      canServer('atendente', 'campaigns.dispatch', { 'campaigns.dispatch': true }),
    ).toBe(true);
    expect(
      canServer('gestor', 'campaigns.dispatch', { 'campaigns.dispatch': false }),
    ).toBe(false);
  });

  it('override não-booleano é ignorado (não abre por acidente)', () => {
    expect(
      canServer('atendente', 'campaigns.dispatch', { 'campaigns.dispatch': 'true' }),
    ).toBe(false);
    expect(
      canServer('atendente', 'campaigns.dispatch', { 'campaigns.dispatch': 1 }),
    ).toBe(false);
    expect(canServer('atendente', 'campaigns.dispatch', {})).toBe(false);
    expect(canServer('atendente', 'campaigns.dispatch', null)).toBe(false);
  });
});

describe('normalizeRole() do servidor — roles legadas do enum', () => {
  it.each([
    ['super_admin', 'superadmin'],
    ['account_manager', 'gerente'],
    ['agencia', 'gerente'],
    ['loja', 'gestor'],
    ['enterprise', 'gestor'],
    ['tenant_admin', 'gestor'],
    ['tenant_user', 'gestor'],
    ['user', 'gestor'],
  ])('%s vira %s', (legacy, expected) => {
    expect(normalizeRoleServer(legacy)).toBe(expected);
  });

  it('roles atuais passam intactas', () => {
    for (const role of ROLES) {
      expect(normalizeRoleServer(role)).toBe(role);
    }
  });

  it('desconhecida vira null', () => {
    expect(normalizeRoleServer('lixo')).toBeNull();
    expect(normalizeRoleServer(null)).toBeNull();
  });

  it('uma role legada tem os mesmos poderes da atual correspondente', () => {
    for (const capability of ALL_CAPABILITIES) {
      const cap = capability as ServerCapability;
      expect(canServer('agencia', cap)).toBe(canServer('gerente', cap));
      expect(canServer('loja', cap)).toBe(canServer('gestor', cap));
      expect(canServer('super_admin', cap)).toBe(canServer('superadmin', cap));
    }
  });
});

describe('statusDenialMessage — mensagens em pt-BR por estado', () => {
  it('cada estado tem sua mensagem', () => {
    expect(statusDenialMessage('pending')).toBe('Complete seu cadastro para acessar o sistema.');
    expect(statusDenialMessage('suspended')).toBe(
      'Sua conta foi suspensa. Entre em contato com o administrador.',
    );
    expect(statusDenialMessage('deleted')).toBe('Esta conta foi excluída.');
  });

  it('estado inesperado ainda devolve algo em pt-BR', () => {
    expect(statusDenialMessage('sei_la')).toContain('não está ativa');
  });
});

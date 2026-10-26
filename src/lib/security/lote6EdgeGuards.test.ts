import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Item 14, lote 6 — as portas LOW nas edge functions. Conferência de fonte:
// estas funções não têm regra pura para isolar, e o que importa é a ORDEM
// (conferir quem chama antes de responder qualquer coisa).
const fn = (name: string) =>
  readFileSync(resolve(__dirname, `../../../supabase/functions/${name}/index.ts`), 'utf8').replace(/\r\n/g, '\n');

describe('usage-limits', () => {
  const src = fn('usage-limits');
  it('GET exige usuário ativo de verdade antes de ler', () => {
    const get = src.indexOf("if (req.method === 'GET') {");
    const exige = src.indexOf('await requireActiveUser(admin, token);', get);
    const le = src.indexOf(".from('usage_limits').select('*')", get);
    expect(get).toBeGreaterThan(0);
    expect(exige).toBeGreaterThan(get);
    expect(le).toBeGreaterThan(exige);
  });
  it('aceita os cargos de hoje, não os antigos', () => {
    expect(src).toContain("const VALID_ROLES: UserRole[] = ['superadmin', 'gerente', 'gestor', 'atendente'];");
    expect(src).not.toMatch(/'account_manager'|'enterprise'/);
  });
});

describe('admin-create-user DELETE', () => {
  const src = fn('admin-create-user');
  it('confere o superadmin ativo antes de procurar o alvo', () => {
    const del = src.indexOf("if (req.method === 'DELETE') {");
    const quem = src.indexOf('admin.auth.getUser(token)', del);
    const ativo = src.indexOf("callerProfile.status !== 'active'", del);
    const alvo = src.indexOf(".eq('user_id', userId)", del);
    expect(quem).toBeGreaterThan(del);
    expect(ativo).toBeGreaterThan(quem);
    expect(alvo).toBeGreaterThan(ativo);
  });
});

describe('waha-webhook', () => {
  const src = fn('waha-webhook');
  // Desde 2026-10-26 a senha é por número (cofre), conferida pela assinatura
  // HMAC; a comparação em tempo constante mora em _shared/waha-webhook-auth.ts
  // (testada em src/lib/whatsapp/instanceCredentials.test.ts).
  it('confere a assinatura com a senha do número antes de processar o evento', () => {
    const cofre = src.indexOf("rpc('get_instance_provider_credentials'");
    const confere = src.indexOf('await authenticateWahaWebhook({');
    const recusa = src.indexOf('return unauthorized();', confere);
    const processa = src.indexOf("logger.info('Waha webhook received'");
    expect(cofre).toBeGreaterThan(0);
    expect(confere).toBeGreaterThan(cofre);
    expect(recusa).toBeGreaterThan(confere);
    expect(processa).toBeGreaterThan(recusa);
  });
  it('não aceita mais a senha única de todos os servidores', () => {
    expect(src).not.toContain("Deno.env.get('WAHA_WEBHOOK_SECRET')");
    expect(src).not.toMatch(/providedSecret\s*!==\s*wahaSecret/);
  });
});

describe('meta-oauth-exchange', () => {
  const src = fn('meta-oauth-exchange');
  it('lê o PIN da tabela privada (connection_config só de reserva)', () => {
    expect(src).toContain(".from('whatsapp_instance_register_pins')");
    expect(src).toContain('pinRow?.pin ?? instance.connection_config?.registerPin');
  });
});

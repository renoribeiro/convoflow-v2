import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Desde a sessão 2 do docs/RUNBOOK_segredos_das_instancias.md (2026-10-26) o
 * envio das Conversas não fala com Evolution nem com WAHA pelo navegador: tudo
 * passa por `whatsapp-send-message`. Este teste falha se algum arquivo do
 * caminho de envio voltar a chamar o provedor direto ou a ler a chave.
 */

const raiz = join(__dirname, '..', '..');
const adapters = readdirSync(join(raiz, 'services', 'whatsapp'))
  .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
  .map((f) => join('services', 'whatsapp', f));
const arquivos = [
  ...adapters,
  join('components', 'conversations', 'ChatWindow.tsx'),
  join('components', 'conversations', 'NewConversationModal.tsx'),
  join('hooks', 'useWhatsAppApi.ts'),
];

const proibido: Array<[RegExp, string]> = [
  [/services\/evolutionApi/, 'o cliente direto do Evolution'],
  [/\bfetch\(/, 'fetch direto (o servidor é quem chama o provedor)'],
  [/X-Api-Key|['"]apikey['"]/i, 'cabeçalho de chave de provedor'],
  [/evolution_api_key|evolution_api_url/, 'coluna antiga de chave/endereço'],
  [/\.select\(\s*['"]\*['"]/, 'leitura da linha inteira de whatsapp_instances'],
];

describe('envio das Conversas: nada direto ao Evolution ou ao WAHA', () => {
  it.each(arquivos)('%s', (rel) => {
    // Só o código: comentário pode citar o que não se faz mais.
    const codigo = readFileSync(join(raiz, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const [padrao, oque] of proibido) {
      expect(padrao.test(codigo), `${rel} usa ${oque}`).toBe(false);
    }
  });
});

/**
 * Sessão 3 (2026-10-26): o cliente do Evolution no navegador, o histórico pelo
 * navegador e o store do Evolution saíram. Nenhum código do site pode voltar
 * a ler a chave do Evolution ou do WAHA de variável VITE_* (que vai para o
 * JavaScript do site) ou de tenants.settings.
 */
function todoCodigo(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return todoCodigo(p);
    return /\.(ts|tsx)$/.test(d.name) && !/\.(test|spec)\./.test(d.name) ? [p] : [];
  });
}

describe('site inteiro: nenhuma chave de Evolution ou WAHA no navegador', () => {
  const codigos = todoCodigo(raiz)
    .filter((f) => !f.includes(join('integrations', 'supabase')))
    .map((f) => ({
      rel: f.slice(raiz.length + 1),
      codigo: readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'),
    }));

  it.each([
    [/VITE_(EVOLUTION|WAHA)_/, 'variável VITE_ de Evolution ou WAHA'],
    [/settings\??\.evolutionApi|['"]evolutionApi['"]/, 'chave do Evolution em tenants.settings'],
    [/services\/evolutionApi|EvolutionApiService|chatHistorySyncService|useChatHistorySync|evolutionStore/, 'cliente antigo do Evolution'],
  ])('%s', (padrao, oque) => {
    const achados = codigos.filter(({ codigo }) => (padrao as RegExp).test(codigo)).map(({ rel }) => rel);
    expect(achados, `usa ${oque}`).toEqual([]);
  });
});

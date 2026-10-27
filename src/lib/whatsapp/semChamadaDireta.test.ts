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

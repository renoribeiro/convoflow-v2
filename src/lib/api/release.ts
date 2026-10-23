// =============================================================================
// Chave do complemento "API e integrações" (A1, A2 e B1)
// =============================================================================
// Tudo está PRONTO e DESLIGADO. Só liga quando o dono disser "pode ligar a
// API": junto com os Termos e a Política novos (docs/MINUTA_api_e_integracoes.md),
// a página de vendas e a FAQ.
//
// DESLIGADO (false), que é o estado de hoje:
//   - o cartão "API e integrações" não aparece em Configurações › Assinatura;
//   - a aba "Chaves de API" só aparece para o Gerente de uma Conta em que o
//     superadmin já ligou a API (Conta de teste, acesso manual);
//   - /api (a documentação) redireciona para a página inicial;
//   - a ajuda da aba não aparece na página de Ajuda.
//
// PARA LIGAR, as duas chaves juntas (docs/RUNBOOK_api_publica.md):
//   1. aqui, API_ADDON_RELEASED = true;
//   2. no Supabase, o secret API_ADDON_ENABLED = true das funções
//      update-api-addon, api-v1 e api-mcp (sem ele elas respondem 503 a quem
//      não está na lista de teste).
// O servidor é a trava de verdade: com o front ligado e o secret desligado,
// ninguém contrata nem usa a API.
// =============================================================================

export const API_ADDON_RELEASED = false;

/** Preço do complemento, como a tela e os Termos escrevem. */
export const API_ADDON_PRICE_LABEL = 'R$ 99,90';

/** Endereço público da API (Vercel → função api-v1 / api-mcp). */
export const API_BASE_URL = 'https://api.convoflow.com.br';
export const API_MCP_URL = `${API_BASE_URL}/mcp`;

/** Caminho da documentação no site. */
export const API_DOCS_PATH = '/api';

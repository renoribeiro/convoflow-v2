import { API_BASE_URL } from '@/lib/api/release';

// Especificação OpenAPI 3.1 da API pública (somente leitura, v1). É a fonte
// única: a página /api monta as tabelas de parâmetros e os exemplos daqui, e
// o botão "Baixar a especificação" entrega este mesmo objeto.

export interface OpenApiParametro {
  name: string;
  in: 'query' | 'path';
  required?: boolean;
  description: string;
  schema: { type: string; format?: string; minimum?: number; maximum?: number; default?: unknown; enum?: string[] };
}

export interface OpenApiOperacao {
  summary: string;
  description: string;
  operationId: string;
  tags: string[];
  'x-escopo': string;
  security: Array<Record<string, string[]>>;
  parameters: OpenApiParametro[];
  responses: Record<string, unknown>;
  'x-exemplo-resposta': unknown;
}

const ID_EXEMPLO = 'aaaaaaaa-0000-4000-8000-000000000001';
const LOJA_EXEMPLO = 'aaaaaaaa-0000-4000-8000-000000000002';
const ETAPA_EXEMPLO = 'aaaaaaaa-0000-4000-8000-000000000003';
const PESSOA_EXEMPLO = 'aaaaaaaa-0000-4000-8000-000000000004';
const DATA_EXEMPLO = '2026-10-01T12:00:00Z';

const p = (
  name: string,
  description: string,
  schema: OpenApiParametro['schema'] = { type: 'string' },
  extra: Partial<OpenApiParametro> = {},
): OpenApiParametro => ({ name, in: 'query', description, schema, ...extra });

const LIMITE = p('limite', 'Quantos itens por página, de 1 a 100. Padrão: 50.', {
  type: 'integer',
  minimum: 1,
  maximum: 100,
  default: 50,
});
const CURSOR = p('cursor', 'Valor de "proximo" da página anterior. Deixe vazio na primeira página.');
const LOJA = p('loja_id', 'Mostra só esta Loja. Ela precisa estar liberada para a chave.', {
  type: 'string',
  format: 'uuid',
});
const DATA = (name: string, description: string) => p(name, description, { type: 'string', format: 'date-time' });

const erro = (descricao: string) => ({
  description: descricao,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
});

const respostas = (exemplo: unknown, lista = true) => ({
  '200': {
    description: 'Tudo certo.',
    headers: {
      'Cache-Control': { description: 'Sempre no-store.', schema: { type: 'string' } },
      'X-Limite-Restante-Minuto': { description: 'Pedidos que ainda cabem neste minuto, para esta chave.', schema: { type: 'integer' } },
      'X-Limite-Restante-Dia': { description: 'Pedidos que ainda cabem hoje, para a Conta.', schema: { type: 'integer' } },
    },
    content: {
      'application/json': {
        schema: lista ? { $ref: '#/components/schemas/Lista' } : { type: 'object' },
        example: exemplo,
      },
    },
  },
  '400': erro('Parâmetro inválido (parametro_invalido).'),
  '401': erro('Chave ausente, inválida, revogada ou expirada.'),
  '402': erro('A Conta está bloqueada por falta de pagamento (conta_bloqueada).'),
  '403': erro('Sem permissão: escopo, Loja fora da chave, API desligada, dono inativo ou origem recusada.'),
  '404': erro('Não encontrado (nao_encontrado).'),
  '429': {
    ...erro('Limite de pedidos atingido. Espere o tempo do cabeçalho Retry-After.'),
    headers: { 'Retry-After': { description: 'Segundos até poder tentar de novo.', schema: { type: 'integer' } } },
  },
  '503': erro('API indisponível por um instante (indisponivel). Tente de novo.'),
});

const operacao = (
  operationId: string,
  summary: string,
  description: string,
  escopo: string,
  parameters: OpenApiParametro[],
  exemplo: unknown,
): OpenApiOperacao => ({
  summary,
  description,
  operationId,
  tags: ['v1'],
  'x-escopo': escopo,
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  parameters,
  responses: respostas(exemplo),
  'x-exemplo-resposta': exemplo,
});

const lista = (dados: unknown[], proximo: string | null = null) => ({ dados, proximo });

export const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'API pública do ConvoFlow',
    version: '1.0.0',
    description:
      'Leitura dos dados da sua Conta: contatos, conversas, mensagens, funil, equipe e métricas. ' +
      'A API só lê. Nada que você pedir aqui muda dados no ConvoFlow. ' +
      'Faz parte do complemento pago "API e integrações" (R$ 99,90 por mês, por Conta). ' +
      'O Gerente cria a chave em Configurações > Chaves de API.',
  },
  servers: [{ url: API_BASE_URL, description: 'Produção' }],
  tags: [{ name: 'v1', description: 'Versão 1, somente leitura.' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/v1/lojas': {
      get: operacao(
        'listarLojas',
        'Lista as Lojas da chave',
        'Qualquer escopo serve. É um bom teste de conexão: se voltar a lista, a chave funciona.',
        'qualquer',
        [],
        lista([
          { id: LOJA_EXEMPLO, nome: 'Minha Conta', tipo: 'conta' },
          { id: ID_EXEMPLO, nome: 'Loja Centro', tipo: 'loja' },
        ]),
      ),
    },
    '/v1/contatos': {
      get: operacao(
        'listarContatos',
        'Lista os contatos',
        'Do mais recentemente atualizado para o mais antigo.',
        'contatos',
        [
          LOJA,
          p('etapa_id', 'Só contatos desta etapa do funil.', { type: 'string', format: 'uuid' }),
          p('etiqueta_id', 'Só contatos com esta etiqueta.', { type: 'string', format: 'uuid' }),
          DATA('atualizado_desde', 'Só contatos atualizados a partir desta data (ISO 8601, UTC).'),
          p('busca', 'Procura por nome, telefone ou e-mail.'),
          LIMITE,
          CURSOR,
        ],
        lista(
          [
            {
              id: ID_EXEMPLO,
              loja_id: LOJA_EXEMPLO,
              nome: 'Maria Exemplo',
              telefone: '5511999990001',
              email: 'maria@exemplo.com.br',
              canal: 'whatsapp',
              usuario: null,
              etapa: { id: ETAPA_EXEMPLO, nome: 'Novo' },
              etiquetas: ['cliente'],
              ultima_interacao_em: DATA_EXEMPLO,
              criado_em: DATA_EXEMPLO,
              atualizado_em: DATA_EXEMPLO,
            },
          ],
          'CURSOR_DA_PROXIMA_PAGINA',
        ),
      ),
    },
    '/v1/conversas': {
      get: operacao(
        'listarConversas',
        'Lista as conversas',
        'Da conversa com mensagem mais recente para a mais antiga. O texto da última mensagem só vem se a chave tem o escopo "mensagens".',
        'conversas',
        [
          LOJA,
          p('atendente_id', 'Só conversas deste atendente.', { type: 'string', format: 'uuid' }),
          p('arquivada', 'true para só arquivadas, false para só abertas.', { type: 'string', enum: ['true', 'false'] }),
          DATA('desde', 'Só conversas com mensagem a partir desta data.'),
          DATA('ate', 'Só conversas com mensagem até esta data.'),
          LIMITE,
          CURSOR,
        ],
        lista([
          {
            id: ID_EXEMPLO,
            loja_id: LOJA_EXEMPLO,
            contato: { id: PESSOA_EXEMPLO, nome: 'Maria Exemplo' },
            canal: 'whatsapp',
            atendente: { id: PESSOA_EXEMPLO, nome: 'João Exemplo' },
            arquivada: false,
            nao_lidas: 2,
            ultima_mensagem: { em: DATA_EXEMPLO, direcao: 'recebida', tipo: 'texto', texto: null },
            criada_em: DATA_EXEMPLO,
          },
        ]),
      ),
    },
    '/v1/conversas/{id}/mensagens': {
      get: operacao(
        'listarMensagens',
        'Lista as mensagens de uma conversa',
        'Da mais antiga para a mais nova. Com midia=1 e o escopo "midia", cada mensagem com arquivo traz um link que vale 15 minutos. Cada link gerado fica registrado no log de auditoria.',
        'mensagens',
        [
          { name: 'id', in: 'path', required: true, description: 'Id da conversa.', schema: { type: 'string', format: 'uuid' } },
          DATA('desde', 'Só mensagens a partir desta data.'),
          DATA('ate', 'Só mensagens até esta data.'),
          p('midia', 'Use 1 para receber o link de fotos, áudios e documentos. Exige o escopo "midia".', {
            type: 'string',
            enum: ['1'],
          }),
          LIMITE,
          CURSOR,
        ],
        lista([
          {
            id: ID_EXEMPLO,
            conversa_id: PESSOA_EXEMPLO,
            loja_id: LOJA_EXEMPLO,
            direcao: 'recebida',
            tipo: 'imagem',
            texto: 'Segue a foto',
            status: 'entregue',
            enviada_por_bot: false,
            autor_id: null,
            tem_midia: true,
            midia: { url: 'https://api.convoflow.com.br/exemplo-de-link-temporario', expira_em: '2026-10-01T12:15:00Z' },
          },
        ]),
      ),
    },
    '/v1/funil': {
      get: operacao(
        'listarFunil',
        'Lista as etapas do funil',
        'Cada etapa traz quantos contatos estão nela.',
        'funil',
        [LOJA],
        lista([{ id: ETAPA_EXEMPLO, loja_id: LOJA_EXEMPLO, nome: 'Novo', ordem: 1, final: false, contatos: 42 }]),
      ),
    },
    '/v1/equipe': {
      get: operacao(
        'listarEquipe',
        'Lista a equipe',
        'Não traz e-mail nem telefone das pessoas.',
        'equipe',
        [LOJA],
        lista([{ id: PESSOA_EXEMPLO, nome: 'João Exemplo', cargo: 'atendente', loja_id: LOJA_EXEMPLO, ativo: true }]),
      ),
    },
    '/v1/metricas': {
      get: operacao(
        'listarMetricas',
        'Métricas de atendimento por Loja',
        'Se você não passar datas, vale os últimos 30 dias. O período máximo é de 366 dias.',
        'metricas',
        [
          LOJA,
          DATA('desde', 'Início do período. Padrão: 30 dias atrás.'),
          DATA('ate', 'Fim do período. Padrão: agora.'),
        ],
        lista([
          {
            loja_id: LOJA_EXEMPLO,
            conversas: 120,
            conversas_com_bot: 80,
            sem_resposta_humana: 5,
            aguardando_humano: 3,
            primeira_resposta_humana_mediana_min: 4.5,
            primeira_resposta_bot_mediana_min: 0.1,
            mensagens_mediana: 12,
            duracao_mediana_min: 35,
          },
        ]),
      ),
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Cabeçalho Authorization: Bearer cf_live_SEU_TOKEN_AQUI. A chave é criada pelo Gerente em Configurações > Chaves de API.',
      },
      apiKeyHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'Alternativa ao Bearer: o mesmo valor da chave no cabeçalho X-API-Key.',
      },
    },
    schemas: {
      Lista: {
        type: 'object',
        required: ['dados', 'proximo'],
        properties: {
          dados: { type: 'array', items: { type: 'object' } },
          proximo: { type: ['string', 'null'], description: 'Cursor da próxima página, ou null quando acabou.' },
        },
      },
      Erro: {
        type: 'object',
        required: ['erro'],
        properties: {
          erro: {
            type: 'object',
            required: ['codigo', 'mensagem'],
            properties: {
              codigo: { type: 'string', description: 'Código fixo, bom para o seu programa decidir o que fazer.' },
              mensagem: { type: 'string', description: 'Texto em português para uma pessoa ler.' },
            },
          },
        },
      },
    },
  },
} as const;

export const OPENAPI_PATHS = Object.keys(OPENAPI.paths);

/** Operação GET de um caminho, já tipada para a página de documentação. */
export function operacaoDe(caminho: string): OpenApiOperacao {
  return (OPENAPI.paths as unknown as Record<string, { get: OpenApiOperacao }>)[caminho]!.get;
}

export const OPENAPI_ARQUIVO = 'convoflow-api-openapi.json';

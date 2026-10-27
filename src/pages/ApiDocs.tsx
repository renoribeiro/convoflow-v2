import type { ReactNode } from 'react';
import { Download, MessageSquare } from 'lucide-react';
import { VoltarParaOndeEstava } from '@/components/shared/VoltarParaOndeEstava';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  API_ADDON_PRICE_LABEL,
  API_BASE_URL,
  API_MCP_URL,
} from '@/lib/api/release';
import {
  OPENAPI,
  OPENAPI_ARQUIVO,
  OPENAPI_PATHS,
  operacaoDe,
} from '@/lib/api/openapi';

const CHAVE = 'cf_live_SEU_TOKEN_AQUI';

const ERROS: Array<[string, number, string]> = [
  ['chave_ausente', 401, 'O pedido veio sem chave.'],
  ['chave_invalida', 401, 'A chave não existe. Confira se copiou inteira.'],
  ['chave_revogada', 401, 'A chave foi revogada. Peça ao Gerente uma nova.'],
  ['chave_expirada', 401, 'A chave passou da validade. Crie outra.'],
  ['dono_inativo', 403, 'A pessoa dona da chave não é mais Gerente ativa.'],
  ['api_desligada', 403, 'O complemento não está ligado nesta Conta.'],
  ['conta_bloqueada', 402, 'A Conta está bloqueada por falta de pagamento.'],
  ['sem_permissao', 403, 'A chave não tem o escopo que este pedido precisa.'],
  ['loja_fora_da_chave', 403, 'Essa Loja não está liberada para a chave.'],
  ['parametro_invalido', 400, 'Algum valor do pedido está errado.'],
  ['nao_encontrado', 404, 'Não achamos o que você pediu.'],
  ['metodo_nao_permitido', 405, 'A API só aceita GET.'],
  ['origem_recusada', 403, 'O pedido veio de um navegador. A API não responde a navegadores.'],
  ['limite_minuto', 429, 'Passou de 60 pedidos no minuto. Espere o tempo de Retry-After.'],
  ['limite_dia', 429, 'A Conta passou de 5.000 pedidos no dia.'],
  ['indisponivel', 503, 'A API está indisponível por um instante. Tente de novo.'],
  ['erro_interno', 500, 'Algo deu errado do nosso lado. Tente de novo.'],
];

const FERRAMENTAS_MCP: Array<[string, string]> = [
  ['listar_lojas', 'Lista as Lojas que a chave alcança.'],
  ['buscar_contatos', 'Procura contatos por nome, telefone ou e-mail.'],
  ['listar_conversas', 'Lista as conversas, da mais recente para a mais antiga.'],
  ['ler_conversa', 'Lê as mensagens de uma conversa. Exige o escopo mensagens. Não traz arquivos: só avisa "tem foto" ou "tem áudio".'],
  ['resumo_funil', 'Mostra quantos contatos há em cada etapa do funil.'],
  ['metricas', 'Traz as métricas de atendimento do período.'],
  ['equipe', 'Lista a equipe, sem e-mail e sem telefone.'],
];

const ESCOPOS: Array<[string, string]> = [
  ['contatos', 'Ver contatos.'],
  ['conversas', 'Ver a lista de conversas.'],
  ['mensagens', 'Ler o histórico das mensagens. Desligado por padrão.'],
  ['funil', 'Ver as etapas do funil.'],
  ['equipe', 'Ver quem está na equipe.'],
  ['metricas', 'Ver as métricas de atendimento.'],
  ['midia', 'Receber link de fotos, áudios e documentos. Desligado por padrão e só funciona junto com mensagens.'],
];

const SNIPPETS_MCP: Array<{ titulo: string; texto?: string; codigo: string }> = [
  {
    titulo: 'Claude Code',
    codigo: `claude mcp add --transport http convoflow ${API_MCP_URL} --header "Authorization: Bearer ${CHAVE}"`,
  },
  {
    titulo: 'Cursor',
    texto: 'No arquivo mcp.json:',
    codigo: JSON.stringify(
      { mcpServers: { convoflow: { url: API_MCP_URL, headers: { Authorization: `Bearer ${CHAVE}` } } } },
      null,
      2,
    ),
  },
  {
    titulo: 'VS Code com GitHub Copilot',
    texto: 'No arquivo mcp.json do VS Code:',
    codigo: JSON.stringify(
      { servers: { convoflow: { type: 'http', url: API_MCP_URL, headers: { Authorization: `Bearer ${CHAVE}` } } } },
      null,
      2,
    ),
  },
  {
    titulo: 'Gemini CLI',
    texto: 'No arquivo settings.json do Gemini CLI:',
    codigo: JSON.stringify(
      { mcpServers: { convoflow: { httpUrl: API_MCP_URL, headers: { Authorization: `Bearer ${CHAVE}` } } } },
      null,
      2,
    ),
  },
  {
    titulo: 'API da OpenAI',
    texto: 'Na ferramenta mcp do pedido:',
    codigo: JSON.stringify(
      { type: 'mcp', server_label: 'convoflow', server_url: API_MCP_URL, authorization: CHAVE, require_approval: 'never' },
      null,
      2,
    ),
  },
];

function Codigo({ children, rotulo }: { children: string; rotulo?: string }) {
  return (
    <pre
      className="max-w-full overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs leading-relaxed text-foreground"
      aria-label={rotulo}
    >
      <code>{children}</code>
    </pre>
  );
}

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <h2 className="text-xl font-semibold text-foreground">{titulo}</h2>
      {children}
    </section>
  );
}

function Texto({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed text-muted-foreground">{children}</p>;
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted text-foreground">
          <tr>
            {cabecalho.map((c) => (
              <th key={c} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {linhas.map((linha, i) => (
            <tr key={i} className="border-t border-border align-top">
              {linha.map((celula, j) => (
                <td key={j} className="px-3 py-2">
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function baixarEspecificacao() {
  const blob = new Blob([JSON.stringify(OPENAPI, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = OPENAPI_ARQUIVO;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exemploDeCurl(caminho: string): string {
  const op = operacaoDe(caminho);
  const url = `${API_BASE_URL}${caminho.replace('{id}', 'aaaaaaaa-0000-4000-8000-000000000001')}`;
  const opcional = op.parameters.find((p) => p.in === 'query' && p.name === 'limite');
  const sufixo = opcional ? '?limite=10' : '';
  return `curl "${url}${sufixo}" \\\n  -H "Authorization: Bearer ${CHAVE}"`;
}

function Endpoint({ caminho }: { caminho: string }) {
  const op = operacaoDe(caminho);
  return (
    <Card className="border-border/60" data-testid={`endpoint-${caminho}`}>
      <CardHeader className="pb-2">
        <CardTitle className="break-all text-base">
          <span className="mr-2 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">GET</span>
          <code>{caminho}</code>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{op.summary}.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Texto>{op.description}</Texto>
        <p className="text-sm text-foreground">
          Escopo necessário: <strong>{op['x-escopo'] === 'qualquer' ? 'qualquer um' : op['x-escopo']}</strong>
        </p>
        <Tabela
          cabecalho={['Parâmetro', 'Onde', 'O que faz']}
          linhas={op.parameters.map((p) => [
            <code key="n">{p.name}</code>,
            p.in === 'path' ? 'no caminho' : 'na busca',
            p.description,
          ])}
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Exemplo de pedido</p>
          <Codigo>{exemploDeCurl(caminho)}</Codigo>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Exemplo de resposta</p>
          <Codigo>{JSON.stringify(op['x-exemplo-resposta'], null, 2)}</Codigo>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="space-y-4">
          <VoltarParaOndeEstava />
          <div className="flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">ConvoFlow</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">API e integrações</h1>
          <Texto>
            Leia os dados da sua Conta de fora do ConvoFlow: em planilhas, no n8n, no Make, no seu sistema ou com um agente de IA.
          </Texto>
        </header>

        <Secao id="o-que-e" titulo="O que é">
          <Texto>
            É um complemento pago: {API_ADDON_PRICE_LABEL} por mês, por Conta. A API só lê. Nada que você pedir
            aqui muda ou apaga dados no ConvoFlow.
          </Texto>
          <ol className="list-decimal space-y-1 pl-6 text-muted-foreground">
            <li>A Conta liga o complemento em Configurações › Assinatura.</li>
            <li>O Gerente cria a chave em Configurações › Chaves de API.</li>
            <li>Você usa a chave nos pedidos, como mostramos abaixo.</li>
          </ol>
        </Secao>

        <Secao id="primeiro-pedido" titulo="Primeiro pedido">
          <Texto>Teste a chave pedindo a lista de Lojas. Se voltar a lista, está tudo certo.</Texto>
          <Codigo>{`curl ${API_BASE_URL}/v1/lojas \\\n  -H "Authorization: Bearer ${CHAVE}"`}</Codigo>
          <Texto>
            Troque <code>{CHAVE}</code> pela sua chave. Também aceitamos a chave no cabeçalho <code>X-API-Key</code>.
          </Texto>
        </Secao>

        <Secao id="autenticacao" titulo="Autenticação e segurança">
          <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
            <li>Trate a chave como uma senha. Quem tem a chave lê os dados que ela alcança.</li>
            <li>A chave aparece uma vez só, quando você a cria. Guardamos apenas uma versão embaralhada (hash).</li>
            <li>Ela expira em 30, 90 ou 365 dias, à sua escolha.</li>
            <li>Vazou? Revogue na hora em Configurações › Chaves de API e crie outra.</li>
            <li>
              Nunca coloque a chave em um site ou aplicativo que roda no navegador. A API não responde a navegadores
              (não tem CORS). Chame sempre a partir de um servidor, do n8n, do Make ou de um programa seu.
            </li>
          </ul>
          <p className="text-sm font-medium text-foreground">Escopos</p>
          <Texto>Cada chave só faz o que o Gerente liberou:</Texto>
          <Tabela cabecalho={['Escopo', 'O que libera']} linhas={ESCOPOS.map(([e, d]) => [<code key="e">{e}</code>, d])} />
          <Texto>
            A chave alcança todas as Lojas ou só as que você escolher. Quando alcança todas, entram também as conversas
            da própria Conta (tipo <code>conta</code>).
          </Texto>
        </Secao>

        <Secao id="limites" titulo="Limites">
          <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
            <li>60 pedidos por minuto, por chave.</li>
            <li>5.000 pedidos por dia, por Conta. O dia vira à meia noite UTC, 21h de Brasília.</li>
            <li>
              Toda resposta traz <code>X-Limite-Restante-Minuto</code> e <code>X-Limite-Restante-Dia</code>, para você
              saber quanto ainda cabe.
            </li>
            <li>
              Passou do limite? A resposta é 429 com o cabeçalho <code>Retry-After</code> (segundos). No limite por minuto,
              espere esse tempo. No limite do dia, os pedidos voltam a passar quando o dia vira.
            </li>
            <li>Toda resposta vem com <code>Cache-Control: no-store</code>: nada fica guardado em cache.</li>
          </ul>
        </Secao>

        <Secao id="paginacao" titulo="Paginação">
          <Texto>
            As listas voltam assim: <code>{'{ "dados": [...], "proximo": "<cursor>" | null }'}</code>. Se{' '}
            <code>proximo</code> não for nulo, há mais. Peça a próxima página com <code>cursor=&lt;proximo&gt;</code>. Use{' '}
            <code>limite</code> de 1 a 100 (padrão 50). As datas são ISO 8601 em UTC.
          </Texto>
          <Codigo>{`curl "${API_BASE_URL}/v1/contatos?limite=100&cursor=CURSOR_DA_PROXIMA_PAGINA" \\\n  -H "Authorization: Bearer ${CHAVE}"`}</Codigo>
        </Secao>

        <Secao id="endpoints" titulo="Endpoints">
          <Texto>
            Todos usam GET e respondem em JSON. A base é <code>{API_BASE_URL}</code>.
          </Texto>
          <div className="space-y-6">
            {OPENAPI_PATHS.map((caminho) => (
              <Endpoint key={caminho} caminho={caminho} />
            ))}
          </div>
        </Secao>

        <Secao id="erros" titulo="Erros">
          <Texto>
            Quando algo dá errado, a resposta vem assim:{' '}
            <code>{'{ "erro": { "codigo": "...", "mensagem": "..." } }'}</code>. Use o <code>codigo</code> no seu
            programa e a <code>mensagem</code> para uma pessoa ler.
          </Texto>
          <Tabela
            cabecalho={['Código', 'HTTP', 'O que significa']}
            linhas={ERROS.map(([c, h, d]) => [<code key="c">{c}</code>, h, d])}
          />
        </Secao>

        <Secao id="n8n" titulo="Como conectar o n8n">
          <p className="font-medium text-foreground">Para ler os dados com o nó HTTP Request</p>
          <ol className="list-decimal space-y-1 pl-6 text-muted-foreground">
            <li>Adicione o nó <strong>HTTP Request</strong>.</li>
            <li>Em Method, deixe <strong>GET</strong>. Em URL, coloque <code>{API_BASE_URL}/v1/contatos</code>.</li>
            <li>Em Authentication, escolha <strong>Generic Credential Type</strong> e depois <strong>Header Auth</strong>.</li>
            <li>
              Crie a credencial: em Name, escreva <code>Authorization</code>. Em Value, escreva{' '}
              <code>Bearer {CHAVE}</code> (com a palavra Bearer e um espaço antes da chave).
            </li>
            <li>
              Para trazer todas as páginas, ligue <strong>Pagination</strong> no nó e use o valor de{' '}
              <code>proximo</code> da resposta como o parâmetro <code>cursor</code> do próximo pedido. Pare quando{' '}
              <code>proximo</code> vier vazio.
            </li>
          </ol>
          <p className="font-medium text-foreground">Para um agente de IA no n8n</p>
          <Texto>
            Use o nó <strong>MCP Client Tool</strong> com o endpoint <code>{API_MCP_URL}</code>. Em Authentication,
            escolha <strong>Bearer Auth</strong> (ou <strong>Header Auth</strong>) e informe a chave.
          </Texto>
        </Secao>

        <Secao id="make" titulo="Como conectar o Make">
          <ol className="list-decimal space-y-1 pl-6 text-muted-foreground">
            <li>Adicione o módulo <strong>HTTP › Make a request</strong>.</li>
            <li>Em URL, coloque <code>{API_BASE_URL}/v1/contatos</code>. Em Method, <strong>GET</strong>.</li>
            <li>
              Em Headers, acrescente o item <code>Authorization</code> com o valor <code>Bearer {CHAVE}</code>.
            </li>
            <li>
              Para a página seguinte, repita o módulo passando <code>cursor</code> com o valor de <code>proximo</code>.
            </li>
          </ol>
          <Texto>
            Para agentes de IA, use o módulo <strong>MCP Client</strong>. No campo <strong>API Key / Access token</strong>,
            coloque a chave, e no endereço do servidor, <code>{API_MCP_URL}</code>.
          </Texto>
        </Secao>

        <Secao id="agentes-ia" titulo="Agentes de IA (MCP)">
          <Texto>
            O MCP deixa um agente de IA consultar o ConvoFlow sozinho, só para ler. O endereço é{' '}
            <code>{API_MCP_URL}</code> (Streamable HTTP). Use a mesma chave, no cabeçalho <code>Authorization: Bearer</code>.
          </Texto>
          <p className="text-sm font-medium text-foreground">Ferramentas disponíveis</p>
          <Tabela
            cabecalho={['Ferramenta', 'O que faz']}
            linhas={FERRAMENTAS_MCP.map(([f, d]) => [<code key="f">{f}</code>, d])}
          />
          <p className="text-sm font-medium text-foreground">Programas que já aceitam uma chave no cabeçalho</p>
          <div className="space-y-5">
            {SNIPPETS_MCP.map((s) => (
              <div key={s.titulo} className="space-y-2">
                <h3 className="font-medium text-foreground">{s.titulo}</h3>
                {s.texto && <Texto>{s.texto}</Texto>}
                <Codigo>{s.codigo}</Codigo>
              </div>
            ))}
            <div className="space-y-2">
              <h3 className="font-medium text-foreground">n8n e Make</h3>
              <Texto>Veja as seções acima: o n8n usa o nó MCP Client Tool e o Make usa o módulo MCP Client.</Texto>
            </div>
          </div>
        </Secao>

        <Secao id="especificacao" titulo="Baixar a especificação">
          <Texto>
            O arquivo OpenAPI descreve todos os endpoints. Importe no Postman, no Insomnia ou em um gerador de código.
          </Texto>
          <Button onClick={baixarEspecificacao}>
            <Download className="mr-2 h-4 w-4" />
            Baixar a especificação (OpenAPI)
          </Button>
        </Secao>
      </div>
    </div>
  );
}

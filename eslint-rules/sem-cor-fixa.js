/**
 * Regra "cores/sem-cor-fixa" (lote 7 do checkup, "Cores e tema escuro").
 *
 * Toda cor do app sai dos tokens da marca (src/index.css e tailwind.config.ts),
 * que trocam sozinhos entre o tema claro e o escuro. Cor escrita à mão não
 * troca: um `text-green-600` some no tema escuro, um `bg-white` vira um bloco
 * aceso no meio do carvão. Esta regra reprova, em qualquer texto do código:
 *
 *   1. classe da paleta do Tailwind: `bg-blue-500`, `text-gray-600/80`, `dark:border-red-900`;
 *   2. branco e preto fixos: `bg-white`, `text-black/60`;
 *   3. valor arbitrário de cor: `bg-[#25D366]`, `text-[rgb(0,0,0)]`, `fill-[hsl(84_46%_32%)]`;
 *   4. cor solta num estilo ou numa constante: `'#DAE27C'`, `'rgba(0,0,0,.5)'`, `'hsl(84 46% 32%)'`;
 *   5. nome de cor num atributo ou propriedade de cor: `fill="white"`, `color: 'black'`.
 *
 * `hsl(var(--token))` e `bg-[var(--...)]` passam: leem o token.
 *
 * As exceções legítimas (cor que a pessoa escolhe para etapa e etiqueta, cor
 * da categoria do bloco no chatbot e na automação, cor de marca de terceiros,
 * documento impresso) moram em ARQUIVOS_LIBERADOS no eslint.config.js, cada
 * uma com o motivo. Arquivo novo ali passa por revisão no PR.
 */

const PALETA =
  'red|green|blue|yellow|orange|amber|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|lime|gray|slate|zinc|neutral|stone';
const UTILIDADE =
  'bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|from|to|via|fill|stroke|outline|divide|placeholder|shadow|decoration|accent|caret';

const PADROES = [
  {
    tipo: 'classe da paleta',
    re: new RegExp(`(?<![\\w-])(?:${UTILIDADE})-(?:${PALETA})-(?:50|[1-9]00|950)(?:\\/\\d+)?(?![\\w-])`, 'g'),
  },
  {
    tipo: 'branco ou preto fixo',
    re: new RegExp(`(?<![\\w-])(?:${UTILIDADE})-(?:white|black)(?:\\/\\d+)?(?![\\w-])`, 'g'),
  },
  {
    tipo: 'valor arbitrário de cor',
    // A cor pode vir no meio do valor: shadow-[0_0_0_3px_rgba(16,185,129,0.15)].
    re: /(?<![\w])(?:[a-z]+(?:-[a-z]+)*)-\[[^\]]*?(?:#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z])|(?<![a-zA-Z0-9-])(?:rgba?|hsla?)\(\s*\d)[^\]]*\]/g,
  },
  { tipo: 'cor em código', re: /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?(?![\w-])/g },
  { tipo: 'cor em código', re: /^\s*#[0-9a-fA-F]{3,4}\s*$/g },
  // `_` antes vale: sombra arbitrária do Tailwind (shadow-[0_0_0_3px_rgba(...)]).
  { tipo: 'cor em código', re: /(?<![a-zA-Z0-9-])(?:rgba?|hsla?)\(\s*\d/g },
];

/** As cores fixas de um texto, na ordem em que aparecem (usado também pela contagem). */
export function acharCores(texto) {
  const achados = [];
  for (const { tipo, re } of PADROES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(texto))) {
      // "valor arbitrário" já cobre o #hex/rgb dentro dos colchetes.
      if (tipo === 'cor em código' && /-\[[^\]]*$/.test(texto.slice(0, m.index))) continue;
      achados.push({ tipo, valor: m[0].trim(), indice: m.index });
    }
  }
  return achados.sort((a, b) => a.indice - b.indice);
}

const regra = {
  meta: {
    type: 'problem',
    docs: { description: 'Cor fixa fora dos tokens da marca (não troca no tema escuro).' },
    schema: [],
    messages: {
      corFixa:
        'Cor fixa ({{tipo}}: {{valor}}). Use os tokens da marca (bg-card, text-foreground, text-muted-foreground, bg-success/10, text-destructive, border-border ...) ou CLASSES_DE_SITUACAO. Exceção legítima vai em ARQUIVOS_LIBERADOS no eslint.config.js.',
    },
  },
  create(context) {
    const conferir = (node, texto) => {
      for (const a of acharCores(texto)) {
        context.report({ node, messageId: 'corFixa', data: { tipo: a.tipo, valor: a.valor } });
      }
    };
    // 5. Nome de cor solto num atributo ou propriedade de cor: fill="white", color: 'black'.
    const NOME_DE_COR = /^(white|black|red|green|blue|yellow|orange|gray|grey|purple|pink)$/i;
    const ATRIBUTO_DE_COR = /^(fill|stroke|color|stopColor|backgroundColor|borderColor|background)$/;
    const nomeDoDono = (p) =>
      p?.type === 'JSXAttribute' ? p.name?.name : p?.type === 'Property' ? p.key?.name ?? p.key?.value : null;
    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        conferir(node, node.value);
        if (NOME_DE_COR.test(node.value.trim()) && ATRIBUTO_DE_COR.test(nomeDoDono(node.parent) ?? '')) {
          context.report({ node, messageId: 'corFixa', data: { tipo: 'nome de cor', valor: node.value } });
        }
      },
      TemplateElement(node) {
        conferir(node, node.value.cooked ?? node.value.raw);
      },
      JSXText(node) {
        // Texto visível não é classe; não confere.
      },
    };
  },
};

export default { rules: { 'sem-cor-fixa': regra } };

/**
 * Casos do texto limpo (sem os sinais de formatação do WhatsApp), rodados
 * por formatacao.test.ts contra textoSemFormatacao. Ficam num arquivo próprio
 * para servirem também a uma cópia da regra no banco, se ela vier a existir.
 *
 * Só texto inventado: nada de cliente de verdade.
 */
export interface CasoDeTextoLimpo {
  nome: string;
  entrada: string;
  limpo: string;
}

export const CASOS_DE_TEXTO_LIMPO: CasoDeTextoLimpo[] = [
  // Cada sinal
  { nome: 'negrito', entrada: '*Consulta*', limpo: 'Consulta' },
  { nome: 'italico', entrada: '_amanhã_', limpo: 'amanhã' },
  { nome: 'riscado', entrada: '~R$ 200~', limpo: 'R$ 200' },
  { nome: 'monoespacado', entrada: '```codigo 123```', limpo: 'codigo 123' },
  { nome: 'codigo', entrada: 'use `PIX` no fim', limpo: 'use PIX no fim' },
  { nome: 'citacao', entrada: '> texto citado', limpo: 'texto citado' },
  { nome: 'lista com asterisco', entrada: '* arroz\n* feijão', limpo: '• arroz\n• feijão' },
  { nome: 'lista com hifen', entrada: '- arroz\n- feijão', limpo: '• arroz\n• feijão' },
  { nome: 'lista numerada', entrada: '1. primeiro\n2. segundo', limpo: '1. primeiro\n2. segundo' },

  // Sinais misturados
  { nome: 'negrito no meio da frase', entrada: 'Sua *Consulta* está marcada', limpo: 'Sua Consulta está marcada' },
  { nome: 'negrito e italico juntos', entrada: '*_muito importante_*', limpo: 'muito importante' },
  { nome: 'tres estilos', entrada: '*a* _b_ ~c~', limpo: 'a b c' },
  { nome: 'negrito com italico dentro', entrada: '*Dia _10_ de manhã*', limpo: 'Dia 10 de manhã' },
  { nome: 'pontuacao depois', entrada: 'Olá *Ana*, tudo bem?', limpo: 'Olá Ana, tudo bem?' },
  { nome: 'entre parenteses', entrada: '(*urgente*)', limpo: '(urgente)' },
  { nome: 'negrito na citacao', entrada: '> *Atenção*', limpo: 'Atenção' },
  { nome: 'negrito no item', entrada: '- *Total*: 3', limpo: '• Total: 3' },
  { nome: 'dentro do mono nada muda', entrada: '```*nao* _muda_```', limpo: '*nao* _muda_' },
  { nome: 'dentro do codigo nada muda', entrada: '`a*b*c`', limpo: 'a*b*c' },

  // Sinais dentro da palavra (não formatam)
  { nome: 'nome de arquivo', entrada: 'meu_arquivo_final.pdf', limpo: 'meu_arquivo_final.pdf' },
  { nome: 'conta', entrada: '2*3*4 = 24', limpo: '2*3*4 = 24' },
  { nome: 'asterisco no meio', entrada: 'a*b*c', limpo: 'a*b*c' },
  { nome: 'til no meio', entrada: 'x~y~z', limpo: 'x~y~z' },
  { nome: 'fecha colado em letra', entrada: '*oi*tudo', limpo: '*oi*tudo' },
  { nome: 'letra acentuada antes do sinal', entrada: 'café*bom*', limpo: 'café*bom*' },
  { nome: 'sobrescrito antes do sinal', entrada: 'm²*grande*', limpo: 'm²grande' },
  { nome: 'espaco que nao quebra depois de abrir', entrada: '* oi*', limpo: '* oi*' },

  // Sinais sem par ou soltos
  { nome: 'asterisco sozinho', entrada: 'nota 5* do cliente', limpo: 'nota 5* do cliente' },
  { nome: 'so abre', entrada: '*sem fechar', limpo: '*sem fechar' },
  { nome: 'espaco depois de abrir', entrada: '* oi*', limpo: '• oi*' },
  { nome: 'espaco antes de fechar', entrada: '*oi *', limpo: '*oi *' },
  { nome: 'dois asteriscos', entrada: '**', limpo: '**' },
  { nome: 'quatro asteriscos', entrada: '****', limpo: '****' },
  { nome: 'asterisco duplo', entrada: '**oi**', limpo: '*oi*' },
  { nome: 'sublinhado sozinho', entrada: 'nome _ sobrenome', limpo: 'nome _ sobrenome' },
  { nome: 'nao atravessa linha', entrada: '*primeira\nsegunda*', limpo: '*primeira\nsegunda*' },
  { nome: 'mono atravessa linha', entrada: '```linha 1\nlinha 2```', limpo: 'linha 1\nlinha 2' },
  { nome: 'maior sem espaco', entrada: '>sem espaço', limpo: '>sem espaço' },
  { nome: 'numero sem espaco', entrada: '1.5 litro', limpo: '1.5 litro' },
  { nome: 'hifen no meio da linha', entrada: 'São Paulo - SP', limpo: 'São Paulo - SP' },
  { nome: 'citacao so no comeco', entrada: 'a > b', limpo: 'a > b' },

  // Emojis
  { nome: 'emoji dentro', entrada: '*Promoção 🎉*', limpo: 'Promoção 🎉' },
  { nome: 'emoji colado antes', entrada: '🎉*Oferta*🎉', limpo: '🎉Oferta🎉' },
  { nome: 'so emoji', entrada: '*😀*', limpo: '😀' },

  // Links
  { nome: 'link com sublinhado', entrada: 'https://exemplo.com.br/a_b_c', limpo: 'https://exemplo.com.br/a_b_c' },
  { nome: 'link com sublinhado no caminho', entrada: 'veja https://exemplo.com.br/_x_ aqui', limpo: 'veja https://exemplo.com.br/_x_ aqui' },
  { nome: 'link em negrito', entrada: '*https://exemplo.com.br*', limpo: 'https://exemplo.com.br' },
  { nome: 'link dentro de frase em negrito', entrada: '*veja https://exemplo.com.br/p?a=1*', limpo: 'veja https://exemplo.com.br/p?a=1' },

  // Quebras de linha
  { nome: 'linhas com negrito', entrada: '*Linha 1*\nLinha 2\n\n_Linha 4_', limpo: 'Linha 1\nLinha 2\n\nLinha 4' },
  { nome: 'quebra do windows', entrada: '*a*\r\nb', limpo: 'a\nb' },

  // Tentativa de HTML: continua texto
  { nome: 'script', entrada: '<script>alert(1)</script>', limpo: '<script>alert(1)</script>' },
  { nome: 'html em negrito', entrada: '*<img src=x onerror=alert(1)>*', limpo: '<img src=x onerror=alert(1)>' },

  // Texto comum
  { nome: 'vazio', entrada: '', limpo: '' },
  { nome: 'sem sinal', entrada: 'Bom dia, quero marcar uma consulta', limpo: 'Bom dia, quero marcar uma consulta' },
  { nome: 'acentos', entrada: '_Ação_ e *Atenção*', limpo: 'Ação e Atenção' },
];

/**
 * Texto de mensagem do WhatsApp com a formatação que o WhatsApp mostra:
 * *negrito*, _itálico_, ~riscado~, ```monoespaçado```, `código`, citação ("> "),
 * listas ("* ", "- ", "1. "). A regra de quando um sinal conta mora em
 * src/lib/whatsapp/formatacao.ts.
 *
 * Só elementos React: o texto da mensagem nunca vira HTML. Links continuam
 * clicáveis como sempre foram, e o termo da busca na conversa continua marcado.
 *
 * Vai DENTRO do elemento de texto de quem usa (o <p> da bolha, da prévia): o
 * componente não traz caixa nem cor, só os trechos.
 *
 * Texto sem nenhuma formatação sai exatamente como saía antes (mesmos nós),
 * para nada mudar em mensagem comum.
 */
import { Fragment, type ReactNode } from 'react';
import {
  acharLinks,
  analisarFormatacao,
  temFormatacao,
  type LinhaFormatada,
  type TrechoFormatado,
} from '@/lib/whatsapp/formatacao';

/** Marca as ocorrências de `termo` (sem diferenciar maiúscula) com <mark>. */
export function destacarTermo(texto: string, termo?: string): ReactNode {
  if (!termo || !termo.trim()) return texto;
  const agulha = termo.trim();
  const seguro = agulha.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const partes = texto.split(new RegExp(`(${seguro})`, 'gi'));
  return partes.map((parte, i) =>
    parte.toLowerCase() === agulha.toLowerCase() ? (
      <mark key={i} className="bg-primary/30 text-foreground rounded-sm">
        {parte}
      </mark>
    ) : (
      parte
    ),
  );
}

function Link({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline break-all hover:opacity-80">
      {href}
    </a>
  );
}

/** Detecta URLs http(s) para transformar em links clicáveis (o jeito de sempre). */
const URL_SPLIT_REGEX = /(https?:\/\/[^\s]+)/g;

/** Texto comum: URLs clicáveis e o termo da busca marcado no resto. */
export function textoComLinks(texto: string, termo?: string): ReactNode {
  return texto.split(URL_SPLIT_REGEX).map((seg, i) =>
    /^https?:\/\//.test(seg) ? <Link key={i} href={seg} /> : <Fragment key={i}>{destacarTermo(seg, termo)}</Fragment>,
  );
}

/** Um pedaço de texto já sem sinais: links pela mesma regra do analisador. */
function folhaPadrao(texto: string, termo?: string): ReactNode {
  const links = acharLinks(texto);
  if (links.length === 0) return destacarTermo(texto, termo);
  const saida: ReactNode[] = [];
  let pos = 0;
  links.forEach(({ inicio, fim }, i) => {
    if (inicio > pos) saida.push(<Fragment key={`t${i}`}>{destacarTermo(texto.slice(pos, inicio), termo)}</Fragment>);
    saida.push(<Link key={`l${i}`} href={texto.slice(inicio, fim)} />);
    pos = fim;
  });
  if (pos < texto.length) saida.push(<Fragment key="fim">{destacarTermo(texto.slice(pos), termo)}</Fragment>);
  return saida;
}

interface Props {
  texto: string | null | undefined;
  /** Termo da busca dentro da conversa, marcado no texto. */
  termo?: string;
  /**
   * false mostra os sinais como vieram (Instagram não formata). Padrão: true.
   */
  formatar?: boolean;
  /**
   * Como desenhar cada pedaço de texto comum (sem formatação). Padrão: links
   * clicáveis e o termo da busca. Templates usam para destacar os {{1}}.
   */
  folha?: (texto: string) => ReactNode;
  /**
   * false não transforma endereço em link. Prévia (template, campanha,
   * chatbot, resposta rápida) nunca teve link, e numa linha clicável o link
   * roubaria o clique. Padrão: true (a bolha da conversa).
   */
  links?: boolean;
}

function Trechos({ trechos, desenhar }: { trechos: TrechoFormatado[]; desenhar: (t: string) => ReactNode }) {
  return (
    <>
      {trechos.map((t, i) => {
        switch (t.tipo) {
          case 'texto':
            return <Fragment key={i}>{desenhar(t.texto)}</Fragment>;
          case 'negrito':
            return (
              <strong key={i} className="font-bold">
                <Trechos trechos={t.filhos} desenhar={desenhar} />
              </strong>
            );
          case 'italico':
            return (
              <em key={i} className="italic">
                <Trechos trechos={t.filhos} desenhar={desenhar} />
              </em>
            );
          case 'riscado':
            return (
              <s key={i} className="line-through">
                <Trechos trechos={t.filhos} desenhar={desenhar} />
              </s>
            );
          case 'mono':
            return (
              <span key={i} className="font-mono" data-formatacao="mono">
                {t.texto}
              </span>
            );
          case 'codigo':
            return (
              <code key={i} className="rounded-sm bg-foreground/10 px-1 font-mono">
                {t.texto}
              </code>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function Linha({ linha, desenhar }: { linha: LinhaFormatada; desenhar: (t: string) => ReactNode }) {
  const corpo = linha.trechos.length ? <Trechos trechos={linha.trechos} desenhar={desenhar} /> : <br />;
  switch (linha.tipo) {
    case 'citacao':
      return (
        <span className="block border-l-2 border-current pl-2" data-formatacao="citacao">
          {corpo}
        </span>
      );
    case 'item':
      return (
        <span className="flex gap-1.5" data-formatacao="item">
          <span aria-hidden="true">•</span>
          <span className="min-w-0">{corpo}</span>
        </span>
      );
    case 'numerado':
      return (
        <span className="flex gap-1.5" data-formatacao="numerado">
          <span className="shrink-0">{linha.numero}.</span>
          <span className="min-w-0">{corpo}</span>
        </span>
      );
    default:
      return <span className="block">{corpo}</span>;
  }
}

export function TextoWhatsApp({ texto, termo, formatar = true, folha, links = true }: Props) {
  const t = texto ?? '';
  const desenhar = folha ?? ((s: string) => (links ? folhaPadrao(s, termo) : destacarTermo(s, termo)));
  const comoSempre = () => (folha ? folha(t) : links ? textoComLinks(t, termo) : destacarTermo(t, termo));
  if (!formatar) return <>{comoSempre()}</>;

  const linhas = analisarFormatacao(t);
  // Mensagem comum: os mesmos nós de antes (quebras de linha pelo pre-wrap de quem usa).
  if (!temFormatacao(linhas)) return <>{comoSempre()}</>;

  return (
    <>
      {linhas.map((linha, i) => (
        <Linha key={i} linha={linha} desenhar={desenhar} />
      ))}
    </>
  );
}

export default TextoWhatsApp;

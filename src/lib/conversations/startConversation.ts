/**
 * Regras da "Nova Conversa" que não dependem de tela: telefone, janela de 24h
 * da Meta e quais templates dá para oferecer.
 *
 * Ficam aqui, puras, porque são elas que decidem se o texto livre aparece —
 * e texto livre fora da janela é o que a Meta recusa (131047).
 */
import type { WhatsAppTemplate } from '@/services/whatsapp';

const JANELA_MS = 24 * 60 * 60 * 1000;

/** Só os dígitos, com o 55 na frente quando o número veio só com DDD. */
export function normalizarTelefoneDigitado(digitado: string): string {
  const digitos = digitado.replace(/\D/g, '');
  if (!digitos.startsWith('55') && digitos.length >= 10) return `55${digitos}`;
  return digitos;
}

/** 55 + DDD + número: de 12 a 15 dígitos. */
export function telefoneValido(digitos: string): boolean {
  return digitos.length >= 12 && digitos.length <= 15;
}

/**
 * As duas formas de um celular brasileiro: com e sem o 9 depois do DDD.
 *
 * O WhatsApp identifica boa parte dos celulares do Brasil SEM o 9 (o `wa_id`
 * tem 12 dígitos), e é assim que o webhook grava o contato quando o cliente
 * escreve. Quem digita o número na tela digita COM o 9. Procurar só a forma
 * digitada não acha o contato que já existe e cria um segundo — e a resposta
 * do cliente cai no primeiro, em outra conversa.
 *
 * Fora do Brasil, ou fora do formato de celular, devolve só o próprio número.
 */
export function variantesDoTelefone(digitos: string): string[] {
  if (!digitos.startsWith('55')) return [digitos];
  if (digitos.length === 13 && digitos[4] === '9') {
    return [digitos, digitos.slice(0, 4) + digitos.slice(5)];
  }
  if (digitos.length === 12 && /[6-9]/.test(digitos[4] ?? '')) {
    return [digitos, `${digitos.slice(0, 4)}9${digitos.slice(4)}`];
  }
  return [digitos];
}

/** O telefone escreveu para este número nas últimas 24 horas? */
export function dentroDaJanela(ultimaEntradaEm: string | null | undefined, agora: Date): boolean {
  if (!ultimaEntradaEm) return false;
  const quando = new Date(ultimaEntradaEm).getTime();
  if (Number.isNaN(quando)) return false;
  return agora.getTime() - quando < JANELA_MS;
}

/**
 * Texto livre pode sair? Em número que não exige template (QR Code), sempre.
 * Em número oficial, só se o telefone escreveu nas últimas 24 horas
 * (SKILL meta-cloud-api §8.3 e regra 2 do §10).
 */
export function podeTextoLivre(params: {
  exigeTemplateForaDaJanela: boolean;
  ultimaEntradaEm: string | null | undefined;
  agora: Date;
}): boolean {
  if (!params.exigeTemplateForaDaJanela) return true;
  return dentroDaJanela(params.ultimaEntradaEm, params.agora);
}

const CABECALHO_COM_MIDIA = new Set(['IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION']);

/**
 * O template pede algo além das variáveis do corpo? Cabeçalho de mídia,
 * cabeçalho com variável e botão de link com variável precisam de parâmetros
 * próprios no envio (SKILL §2.12), que esta tela não preenche.
 */
export function templatePedeMaisQueOCorpo(t: WhatsAppTemplate): boolean {
  const formato = String(t.header?.format ?? '').toUpperCase();
  if (CABECALHO_COM_MIDIA.has(formato)) return true;
  if (t.header?.text?.includes('{{')) return true;
  return (t.buttons ?? []).some((b) => !!b.url && b.url.includes('{{'));
}

export function templateAprovado(t: WhatsAppTemplate): boolean {
  return String(t.status ?? '').toUpperCase() === 'APPROVED';
}

/**
 * Os templates que a Nova Conversa oferece: aprovados e preenchíveis só com as
 * variáveis do corpo. `foraDoAlcance` conta os aprovados que ficaram de fora,
 * para a tela explicar por que um template conhecido não aparece.
 */
export function templatesParaIniciar(lista: WhatsAppTemplate[]): {
  usaveis: WhatsAppTemplate[];
  foraDoAlcance: number;
} {
  const aprovados = lista.filter(templateAprovado);
  const usaveis = aprovados
    .filter((t) => !templatePedeMaisQueOCorpo(t))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { usaveis, foraDoAlcance: aprovados.length - usaveis.length };
}

/** Chave composta: o mesmo nome pode existir em vários idiomas. */
export const chaveDoTemplate = (t: { name: string; language: string }) => `${t.name}::${t.language}`;

/**
 * Com que telefone o contato novo nasce. Em número oficial, com o que a Meta
 * confirmou (`wa_id`): é a forma em que a resposta do cliente vai chegar.
 * Sem confirmação, com o digitado.
 */
export function telefoneDoContatoNovo(params: {
  digitado: string;
  confirmadoPeloProvider?: string | null;
}): string {
  const confirmado = params.confirmadoPeloProvider?.replace(/\D/g, '');
  return confirmado || params.digitado;
}

/** O que fica gravado na conversa quando o envio é um template (igual ao SendTemplateDialog). */
export const resumoDoTemplate = (nome: string) => `Template: ${nome}`;

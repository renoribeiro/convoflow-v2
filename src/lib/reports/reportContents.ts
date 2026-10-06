/**
 * O que o relatório por e-mail CONTÉM de verdade — a lista é o espelho de
 * `collectMetrics` em supabase/functions/_shared/report-core.ts.
 *
 * Até 2026-09-21 o modal "Novo Relatório" oferecia caixinhas ("Satisfação do
 * Cliente", "Taxa de Resolução", "Receita Gerada", "Tempo de Resposta"...) que
 * o servidor nunca calculou: a seleção era ignorada e o e-mail saía sempre com
 * o mesmo conjunto fixo. Decisão: o modal mostra o que o relatório traz, e só
 * isso. Nenhuma caixinha, nenhum número prometido que não existe. O `type`
 * continua existindo porque muda o rótulo do e-mail; o conteúdo é o mesmo.
 *
 * Por pessoa NÃO entra no e-mail (decisão de 2026-09-21): o destinatário é um
 * e-mail livre, e um atendente poderia receber os números dos colegas. Os
 * números por atendente ficam no Dashboard, para gestor e gerente.
 */
export interface ReportContentItem {
  id: string;
  label: string;
  /** Uma frase: o que o número é, em palavras de leigo. */
  description: string;
}

export const REPORT_CONTENTS: ReadonlyArray<ReportContentItem> = [
  { id: 'contacts_total', label: 'Contatos (total)', description: 'Quantos contatos a Loja tem hoje.' },
  { id: 'contacts_new', label: 'Novos contatos', description: 'Quantos entraram no período.' },
  { id: 'conversations_total', label: 'Conversas (total)', description: 'Quantas conversas a Loja tem hoje.' },
  { id: 'conversations_new', label: 'Novas conversas', description: 'Quantas começaram no período.' },
  { id: 'conversations_archived', label: 'Conversas arquivadas', description: 'Quantas estão arquivadas hoje.' },
  { id: 'messages_total', label: 'Mensagens no período', description: 'Enviadas e recebidas, somadas.' },
  { id: 'messages_sent', label: 'Mensagens enviadas', description: 'Inclui bot, campanha e follow-up.' },
  { id: 'messages_received', label: 'Mensagens recebidas', description: 'O que os clientes mandaram.' },
  { id: 'funnel_stages', label: 'Leads por estágio do funil', description: 'Quantos contatos há em cada etapa hoje.' },
  {
    id: 'first_human_reply_median',
    label: '1ª resposta de uma pessoa (mediana)',
    description: 'Nas conversas iniciadas no período, quanto o cliente esperou até alguém do time responder: na metade delas, a espera foi de até esse tempo. Não conta bot nem campanha.',
  },
  {
    id: 'waiting_human_now',
    label: 'Esperando uma pessoa agora',
    description: 'Conversas em que o cliente falou por último e ninguém do time respondeu, e quantas delas estão sem responsável. Retrato de hoje, seja qual for o período.',
  },
  {
    id: 'no_human_reply',
    label: 'Sem resposta de pessoa',
    description: 'Conversas do período em que só o bot falou (ou ninguém).',
  },
];

export const REPORT_CONTENT_IDS: ReadonlyArray<string> = REPORT_CONTENTS.map((c) => c.id);

/** O que o relatório NÃO traz, dito de frente — para ninguém procurar. */
export const REPORT_NOT_INCLUDED =
  'Não traz números por atendente: esses ficam no Dashboard, só para Gestor e Gerente, porque o e-mail vai para qualquer endereço.';

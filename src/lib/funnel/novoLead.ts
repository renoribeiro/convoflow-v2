/**
 * "Novo Lead" do Funil: cria o contato na Conta/Loja em foco e já o coloca na
 * etapa escolhida.
 *
 * Telefone segue as MESMAS regras da "Nova conversa"
 * (src/lib/conversations/startConversation.ts): só dígitos, 55 na frente
 * quando veio só com DDD, e as duas formas do celular brasileiro (com e sem o
 * 9) contam como o mesmo número. Contato é único por Loja + canal + telefone,
 * então telefone que já é contato da Loja NÃO duplica: o card desse contato
 * vai para a etapa escolhida, e o nome dele fica como está.
 *
 * Até 2026-10-21 o botão fingia salvar (esperava 1 s e mostrava "Lead criado
 * com sucesso!" sem gravar nada). Aqui nada diz "salvo" sem o banco confirmar.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import {
  normalizarTelefoneDigitado,
  telefoneValido,
  variantesDoTelefone,
} from '@/lib/conversations/startConversation';

export interface NovoLeadEntrada {
  nome: string;
  telefone: string;
  etapaId: string;
}

export interface ErrosNovoLead {
  nome?: string;
  telefone?: string;
  etapa?: string;
}

export const MENSAGEM_TELEFONE_INVALIDO = 'Telefone inválido. Use o DDD e o número, como (11) 99999-9999.';

export function validarNovoLead(e: NovoLeadEntrada): ErrosNovoLead {
  const erros: ErrosNovoLead = {};
  if (!e.nome.trim()) erros.nome = 'Digite o nome do lead.';
  if (!telefoneValido(normalizarTelefoneDigitado(e.telefone))) erros.telefone = MENSAGEM_TELEFONE_INVALIDO;
  if (!e.etapaId) erros.etapa = 'Escolha a etapa.';
  return erros;
}

export type ResultadoNovoLead =
  | { tipo: 'criado'; contatoId: string; nome: string }
  | { tipo: 'existente'; contatoId: string; nome: string };

export class NovoLeadErro extends Error {
  constructor(message: string, readonly causa?: unknown) {
    super(message);
    this.name = 'NovoLeadErro';
  }
}

type Cliente = SupabaseClient<Database>;

async function buscarExistente(
  client: Cliente,
  tenantId: string,
  variantes: string[],
): Promise<{ id: string; name: string | null } | null> {
  const { data, error } = await client
    .from('contacts')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('channel', 'whatsapp')
    .in('phone', variantes)
    .limit(1);
  if (error) throw new NovoLeadErro('Não deu para conferir o telefone. Tente de novo.', error);
  return data?.[0] ?? null;
}

async function moverParaEtapa(client: Cliente, contatoId: string, etapaId: string): Promise<void> {
  const { data, error } = await client
    .from('contacts')
    .update({ current_stage_id: etapaId })
    .eq('id', contatoId)
    .select('id');
  // UPDATE recusado pelo RLS não dá erro: volta zero linha. Zero é falha.
  if (error || !data || data.length === 0) {
    throw new NovoLeadErro('Não deu para colocar o lead na etapa. Tente de novo.', error);
  }
}

export async function salvarNovoLead(
  client: Cliente,
  params: NovoLeadEntrada & { tenantId: string },
): Promise<ResultadoNovoLead> {
  const erros = validarNovoLead(params);
  const primeiro = erros.nome ?? erros.telefone ?? erros.etapa;
  if (primeiro) throw new NovoLeadErro(primeiro);

  const digitos = normalizarTelefoneDigitado(params.telefone);
  const variantes = variantesDoTelefone(digitos);
  const nome = params.nome.trim();

  const existente = await buscarExistente(client, params.tenantId, variantes);
  if (existente) {
    await moverParaEtapa(client, existente.id, params.etapaId);
    return { tipo: 'existente', contatoId: existente.id, nome: existente.name || nome };
  }

  const { data, error } = await client
    .from('contacts')
    .insert({
      tenant_id: params.tenantId,
      name: nome,
      phone: digitos,
      channel: 'whatsapp',
      // O gatilho trg_contacts_set_external_id grava o telefone aqui de
      // qualquer jeito (contato de WhatsApp); vai explícito para o tipo.
      external_id: digitos,
      current_stage_id: params.etapaId,
    })
    .select('id, name')
    .single();
  if (!error && data) return { tipo: 'criado', contatoId: data.id, nome: data.name || nome };

  // Alguém cadastrou o mesmo telefone entre a conferência e agora: usa o que existe.
  if (error?.code === '23505') {
    const outro = await buscarExistente(client, params.tenantId, variantes);
    if (outro) {
      await moverParaEtapa(client, outro.id, params.etapaId);
      return { tipo: 'existente', contatoId: outro.id, nome: outro.name || nome };
    }
  }
  throw new NovoLeadErro('Não deu para criar o lead. Tente de novo.', error);
}

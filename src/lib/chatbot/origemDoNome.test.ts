/**
 * Automação pronta "Salvar o nome do lead" e a origem do nome do contato
 * (contacts.name_source, migração 20261123000002).
 *
 * Lado servidor: supabase/functions/_shared/nome-do-lead.ts (regras),
 * chatbot-engine.ts (`salvarNomeDoLead`, chamada pela pergunta quando o cartão
 * está ligado e pelo bloco "Atualizar contato" › Nome do lead) e as funções de
 * chegada que gravam a origem (Evolution aqui; Meta e WAHA no banco, por
 * receber_mensagem_whatsapp, provado em docs/teste_automacoes_prontas.sql).
 *
 * Prova:
 *   - a origem decide igual nos três provedores: whatsapp e telefone podem ser
 *     trocados; equipe e lead, nunca; contato antigo sem origem só pelo nome
 *     do perfil (que só o Evolution manda ao chatbot);
 *   - nome salvo à mão nunca é trocado, nem com o nome igual ao perfil;
 *   - na troca da Loja (cartão e bloco ligados juntos) o nome é salvo uma vez;
 *   - o cartão só vale para a variável escolhida, com o cartão ligado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  origemDoContatoAntigo,
  podeTrocarNomeDoContato,
  variavelDoNomeDoLead,
} from '../../../supabase/functions/_shared/nome-do-lead';
import { salvarNomeDoLead } from '../../../supabase/functions/_shared/chatbot-engine';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fonte = (arquivo: string) => fs.readFileSync(path.join(RAIZ, 'supabase', 'functions', arquivo), 'utf8');

const telefone = '5585999990201';

describe('a origem do nome decide (Evolution, Meta e WAHA)', () => {
  it.each([
    ['whatsapp', true],
    ['telefone', true],
    ['equipe', false],
    ['lead', false],
  ])('origem %s: pode trocar = %s', (origem, pode) => {
    expect(podeTrocarNomeDoContato({ atual: 'Fulana Perfil', telefone, origem })).toBe(pode);
  });

  it('Meta e WAHA não mandam o nome do perfil ao chatbot: a origem basta', () => {
    expect(podeTrocarNomeDoContato({ atual: 'Ana Perfil', telefone, origem: 'whatsapp', nomeDoPerfil: null })).toBe(true);
  });

  it('nome salvo pela equipe nunca é trocado, nem igual ao perfil', () => {
    expect(podeTrocarNomeDoContato({ atual: 'Carla Souza', telefone, origem: 'equipe', nomeDoPerfil: 'Carla Souza' })).toBe(false);
  });

  it('vazio ou só o telefone sempre pode, venha de onde vier', () => {
    expect(podeTrocarNomeDoContato({ atual: '', telefone, origem: 'equipe' })).toBe(true);
    expect(podeTrocarNomeDoContato({ atual: '+55 (85) 99999-0201', telefone, origem: 'equipe' })).toBe(true);
  });

  it('contato antigo sem origem: só quando o nome é igual ao do perfil', () => {
    expect(podeTrocarNomeDoContato({ atual: 'Ana Perfil', telefone, origem: null, nomeDoPerfil: 'ana perfil' })).toBe(true);
    expect(podeTrocarNomeDoContato({ atual: 'Ana Perfil', telefone, origem: null, nomeDoPerfil: 'Outra' })).toBe(false);
    expect(podeTrocarNomeDoContato({ atual: 'Ana Perfil', telefone, origem: null })).toBe(false);
  });

  it('contato antigo conferido quando escreve: igual ao perfil é whatsapp, diferente é equipe', () => {
    expect(origemDoContatoAntigo('João  Velho', 'joao velho')).toBe('whatsapp');
    expect(origemDoContatoAntigo('Cliente Bom', 'Outro Perfil')).toBe('equipe');
  });
});

describe('as funções de chegada gravam a origem', () => {
  it('evolution-webhook: contato novo e promovido com origem whatsapp, antigo conferido', () => {
    const s = fonte('evolution-webhook/index.ts');
    expect(s).toContain("select('id, name, name_source')");
    expect(s).toContain("update({ name: pushName, name_source: 'whatsapp'");
    expect(s).toContain('origemDoContatoAntigo(contact.name, perfil)');
    expect(s).toContain("updates.name_source = 'whatsapp'");
  });

  it('meta-webhook e waha-webhook passam pelo banco (receber_mensagem_whatsapp grava a origem)', () => {
    expect(fonte('meta-webhook/index.ts')).toContain("rpc('receber_mensagem_whatsapp'");
    expect(fonte('waha-webhook/index.ts')).toContain("rpc('receber_mensagem_whatsapp'");
  });
});

describe('o cartão vale só ligado e com a variável escolhida', () => {
  it('ligado com variável válida', () => {
    expect(variavelDoNomeDoLead({ lead_name_enabled: true, lead_name_variable: 'nome' })).toBe('nome');
  });
  it('desligado, sem variável ou com variável inválida: nada', () => {
    expect(variavelDoNomeDoLead({ lead_name_enabled: false, lead_name_variable: 'nome' })).toBeNull();
    expect(variavelDoNomeDoLead({ lead_name_enabled: true })).toBeNull();
    expect(variavelDoNomeDoLead({ lead_name_enabled: true, lead_name_variable: 'nome do' })).toBeNull();
    expect(variavelDoNomeDoLead(null)).toBeNull();
  });
  it('a pergunta do chatbot chama o cartão só para a variável dele', () => {
    const s = fonte('_shared/chatbot-engine.ts');
    expect(s).toContain('if (d.save_to_variable === variavelDoNomeDoLead(tenantSettings))');
    expect(s).toContain('updatedVars[d.save_to_variable] = await salvarNomeDoLead(ctx, input, message)');
  });
});

// Banco de mentira: um contato, as gravações que chegam nele.
function bancoComContato(contato: { name: string | null; phone: string; name_source: string | null }) {
  const gravacoes: Array<Record<string, unknown>> = [];
  const from = () => {
    let gravacao: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.update = (d: Record<string, unknown>) => {
      gravacao = d;
      return q;
    };
    q.maybeSingle = async () => ({ data: { ...contato }, error: null });
    q.then = (ok: (v: unknown) => unknown) => {
      if (gravacao) {
        gravacoes.push(gravacao);
        Object.assign(contato, gravacao);
      }
      return Promise.resolve(ok({ data: null, error: null }));
    };
    return q;
  };
  const logs: string[] = [];
  const ctx = {
    supabase: { from, rpc: from } as never,
    logger: { info: (m: string) => logs.push(m), warn: (m: string) => logs.push(m), error: () => {}, debug: () => {} } as never,
  };
  return { ctx, contato, gravacoes, logs };
}

const entrada = { contact_id: 'aaaaaaaa-0000-4000-8000-000000000001', phone: telefone, profile_name: null };

describe('salvarNomeDoLead', () => {
  it('nome do perfil vira o nome do lead, com origem lead, e devolve o primeiro nome', async () => {
    const b = bancoComContato({ name: 'Mari 🌸', phone: telefone, name_source: 'whatsapp' });
    expect(await salvarNomeDoLead(b.ctx, entrada, 'meu nome é maria clara')).toBe('Maria');
    expect(b.contato).toMatchObject({ name: 'Maria Clara', name_source: 'lead' });
  });

  it('nome salvo pela equipe nunca é trocado, mas {nome} fica com o primeiro nome', async () => {
    const b = bancoComContato({ name: 'Maria Clara (indicação)', phone: telefone, name_source: 'equipe' });
    expect(await salvarNomeDoLead(b.ctx, entrada, 'Maria Clara')).toBe('Maria');
    expect(b.gravacoes).toEqual([]);
    expect(b.contato.name).toBe('Maria Clara (indicação)');
  });

  it('resposta que não é nome: nada muda e {nome} fica vazio', async () => {
    const b = bancoComContato({ name: telefone, phone: telefone, name_source: 'telefone' });
    expect(await salvarNomeDoLead(b.ctx, entrada, 'Qual o preço da limpeza?')).toBe('');
    expect(b.gravacoes).toEqual([]);
  });

  it('na troca da Loja (cartão e bloco ligados juntos) o nome é salvo uma vez só', async () => {
    const b = bancoComContato({ name: 'Ana Perfil', phone: telefone, name_source: 'whatsapp' });
    // 1. A pergunta guarda a resposta e o cartão salva o nome.
    const primeiro = await salvarNomeDoLead(b.ctx, entrada, 'sou a Ana Beatriz Lima');
    expect(primeiro).toBe('Ana');
    // 2. O bloco "Atualizar contato" › Nome do lead roda depois, com {nome}.
    expect(await salvarNomeDoLead(b.ctx, entrada, primeiro)).toBe('Ana');
    expect(b.gravacoes).toHaveLength(1);
    expect(b.contato).toMatchObject({ name: 'Ana Beatriz Lima', name_source: 'lead' });
  });

  it('o bloco "Nome do lead" usa a mesma função (mesmas regras do cartão)', () => {
    const s = fonte('_shared/chatbot-engine.ts');
    expect(s).toContain('const primeiro = await salvarNomeDoLead(ctx, input, rawValue);');
  });
});

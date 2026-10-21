/**
 * "Novo Lead": grava de verdade, com as regras de telefone da "Nova conversa",
 * e telefone que já é contato da Loja não duplica (o card dele muda de etapa).
 */
import { describe, expect, it } from 'vitest';
import { podeConfigurarEtapas } from './permissoes';
import { MENSAGEM_TELEFONE_INVALIDO, NovoLeadErro, salvarNovoLead, validarNovoLead } from './novoLead';

const LOJA = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const ETAPA = 'aaaaaaaa-0000-4000-8000-0000000000e1';

interface Existente {
  id: string;
  name: string;
  phone: string;
}

interface Chamada {
  tabela: string;
  op: 'select' | 'insert' | 'update';
  filtros: Record<string, unknown>;
  row?: Record<string, unknown>;
}

/** Cliente falso com só o que salvarNovoLead usa. */
function clienteFalso(opts: {
  existentes?: Existente[];
  erroNoInsert?: { code: string; message: string };
  /** Simula a corrida: o contato aparece no banco junto com o erro 23505. */
  apareceNaCorrida?: Existente;
  linhasNoUpdate?: number;
} = {}) {
  const existentes = [...(opts.existentes ?? [])];
  const chamadas: Chamada[] = [];
  const client = {
    from(tabela: string) {
      const q: Chamada = { tabela, op: 'select', filtros: {} };
      const b: Record<string, unknown> = {};
      b.select = () => {
        if (q.op === 'update') {
          chamadas.push({ ...q });
          const n = opts.linhasNoUpdate ?? 1;
          return Promise.resolve({ data: Array.from({ length: n }, () => ({ id: q.filtros.id })), error: null });
        }
        return b;
      };
      b.eq = (c: string, v: unknown) => {
        q.filtros[c] = v;
        return b;
      };
      b.in = (c: string, v: unknown) => {
        q.filtros[c] = v;
        return b;
      };
      b.limit = () => {
        chamadas.push({ ...q });
        const variantes = q.filtros.phone as string[];
        const achados = existentes.filter(
          (e) => variantes.includes(e.phone) && q.filtros.tenant_id === LOJA && q.filtros.channel === 'whatsapp',
        );
        return Promise.resolve({ data: achados.slice(0, 1).map(({ id, name }) => ({ id, name })), error: null });
      };
      b.insert = (row: Record<string, unknown>) => {
        q.op = 'insert';
        q.row = row;
        return b;
      };
      b.update = (row: Record<string, unknown>) => {
        q.op = 'update';
        q.row = row;
        return b;
      };
      b.single = () => {
        chamadas.push({ ...q });
        if (opts.erroNoInsert) {
          if (opts.apareceNaCorrida) existentes.push(opts.apareceNaCorrida);
          return Promise.resolve({ data: null, error: opts.erroNoInsert });
        }
        return Promise.resolve({ data: { id: 'aaaaaaaa-0000-4000-8000-0000000000c9', name: q.row?.name }, error: null });
      };
      return b;
    },
  };
  return { client: client as never, chamadas };
}

describe('validarNovoLead', () => {
  it('pede nome, telefone válido e etapa', () => {
    expect(validarNovoLead({ nome: ' ', telefone: '123', etapaId: '' })).toEqual({
      nome: 'Digite o nome do lead.',
      telefone: MENSAGEM_TELEFONE_INVALIDO,
      etapa: 'Escolha a etapa.',
    });
    expect(validarNovoLead({ nome: 'Ana', telefone: '(11) 99999-9999', etapaId: ETAPA })).toEqual({});
  });
});

describe('salvarNovoLead', () => {
  it('telefone novo: cria o contato na Loja, com 55 na frente e já na etapa', async () => {
    const { client, chamadas } = clienteFalso();
    const r = await salvarNovoLead(client, { tenantId: LOJA, nome: '  Fulana Exemplo ', telefone: '(11) 99999-9999', etapaId: ETAPA });
    expect(r).toEqual({ tipo: 'criado', contatoId: 'aaaaaaaa-0000-4000-8000-0000000000c9', nome: 'Fulana Exemplo' });
    const insert = chamadas.find((c) => c.op === 'insert')!;
    expect(insert.row).toEqual({
      tenant_id: LOJA,
      name: 'Fulana Exemplo',
      phone: '5511999999999',
      channel: 'whatsapp',
      external_id: '5511999999999',
      current_stage_id: ETAPA,
    });
  });

  it('telefone que já é contato da Loja: não duplica, move o card e mantém o nome dele', async () => {
    const { client, chamadas } = clienteFalso({
      existentes: [{ id: 'aaaaaaaa-0000-4000-8000-0000000000c1', name: 'Fulano Cadastrado', phone: '5511999999999' }],
    });
    const r = await salvarNovoLead(client, { tenantId: LOJA, nome: 'Outro Nome', telefone: '11 99999 9999', etapaId: ETAPA });
    expect(r).toEqual({ tipo: 'existente', contatoId: 'aaaaaaaa-0000-4000-8000-0000000000c1', nome: 'Fulano Cadastrado' });
    expect(chamadas.some((c) => c.op === 'insert')).toBe(false);
    const update = chamadas.find((c) => c.op === 'update')!;
    expect(update.row).toEqual({ current_stage_id: ETAPA });
    expect(update.filtros.id).toBe('aaaaaaaa-0000-4000-8000-0000000000c1');
  });

  it('o celular sem o 9 acha o contato gravado com o 9 (e vice versa)', async () => {
    const { client, chamadas } = clienteFalso({
      existentes: [{ id: 'aaaaaaaa-0000-4000-8000-0000000000c2', name: 'Fulano', phone: '5511999999999' }],
    });
    const r = await salvarNovoLead(client, { tenantId: LOJA, nome: 'Fulano', telefone: '(11) 9999-9999', etapaId: ETAPA });
    expect(r.tipo).toBe('existente');
    expect(chamadas[0]!.filtros.phone).toEqual(['551199999999', '5511999999999']);
  });

  it('corrida (23505): outra pessoa cadastrou o mesmo telefone agora; usa o existente', async () => {
    const { client } = clienteFalso({
      erroNoInsert: { code: '23505', message: 'duplicate key' },
      apareceNaCorrida: { id: 'aaaaaaaa-0000-4000-8000-0000000000c3', name: 'Fulana', phone: '5511999999999' },
    });
    const r = await salvarNovoLead(client, { tenantId: LOJA, nome: 'Fulana', telefone: '11999999999', etapaId: ETAPA });
    expect(r).toEqual({ tipo: 'existente', contatoId: 'aaaaaaaa-0000-4000-8000-0000000000c3', nome: 'Fulana' });
  });

  it('nada diz "salvo" sem o banco confirmar: erro no insert vira erro', async () => {
    const { client } = clienteFalso({ erroNoInsert: { code: '42501', message: 'rls' } });
    await expect(
      salvarNovoLead(client, { tenantId: LOJA, nome: 'Fulana', telefone: '11999999999', etapaId: ETAPA }),
    ).rejects.toBeInstanceOf(NovoLeadErro);
  });

  it('mover para a etapa sem linha alterada (RLS) também é erro', async () => {
    const { client } = clienteFalso({
      existentes: [{ id: 'aaaaaaaa-0000-4000-8000-0000000000c4', name: 'Fulano', phone: '5511999999999' }],
      linhasNoUpdate: 0,
    });
    await expect(
      salvarNovoLead(client, { tenantId: LOJA, nome: 'Fulano', telefone: '11999999999', etapaId: ETAPA }),
    ).rejects.toThrow('Não deu para colocar o lead na etapa');
  });

  it('dado inválido nem chega ao banco', async () => {
    const { client, chamadas } = clienteFalso();
    await expect(salvarNovoLead(client, { tenantId: LOJA, nome: 'Fulana', telefone: '123', etapaId: ETAPA })).rejects.toThrow(
      MENSAGEM_TELEFONE_INVALIDO,
    );
    expect(chamadas).toEqual([]);
  });
});

describe('podeConfigurarEtapas', () => {
  it('gestor, gerente e superadmin configuram; atendente e sem cargo, não', () => {
    expect(podeConfigurarEtapas('gestor')).toBe(true);
    expect(podeConfigurarEtapas('gerente')).toBe(true);
    expect(podeConfigurarEtapas('superadmin')).toBe(true);
    expect(podeConfigurarEtapas('atendente')).toBe(false);
    expect(podeConfigurarEtapas(null)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  aplicarAvisosDeStatus,
  lerAvisoDeStatus,
  statusAvanca,
  statusDoEvolution,
  ANTERIORES,
  type DepsDoStatus,
  type StatusDeEntrega,
} from '../../../supabase/functions/_shared/evolution-status.ts';

// Ids inventados. O formato do 2.3.7 é o que o Evolution guarda e manda
// (whatsapp.baileys.service.ts, handler de 'messages.update', e
// /chat/findStatusMessage): tudo solto, sem `key` e sem `update`.
const ID_A = '3EB0AAAAAAAAAAAAAAAA01';
const ID_B = '3EB0AAAAAAAAAAAAAAAA02';
const ID_FANTASMA = '3EB0AAAAAAAAAAAAAAAA99';

const aviso237 = (keyId: string, status: string, fromMe = true) => ({
  messageId: 'aaaaaaaa-0000-4000-8000-000000000001',
  keyId,
  remoteJid: '99999000001111@lid',
  fromMe,
  participant: null,
  status,
  instanceId: 'aaaaaaaa-0000-4000-8000-000000000002',
});

const avisoAntigo = (id: string, status: unknown, fromMe = true) => ({
  key: { id, fromMe, remoteJid: '5585999990201@s.whatsapp.net' },
  update: { status },
});

/** Banco de mentira com a mesma regra da gravação real: só muda quem está em `anteriores`. */
function bancoFalso(inicial: Record<string, string>, falhar: { avancar?: string; existe?: string } = {}) {
  const linhas = new Map(Object.entries(inicial));
  const chamadas: string[] = [];
  const deps: DepsDoStatus = {
    async avancar(id, novo: StatusDeEntrega, anteriores) {
      chamadas.push(`avancar:${id}:${novo}`);
      if (falhar.avancar) return { linhas: 0, erro: falhar.avancar };
      const atual = linhas.get(id);
      if (atual === undefined || !anteriores.includes(atual)) return { linhas: 0, erro: null };
      linhas.set(id, novo);
      return { linhas: 1, erro: null };
    },
    async existe(id) {
      chamadas.push(`existe:${id}`);
      if (falhar.existe) return { existe: false, erro: falhar.existe };
      return { existe: linhas.has(id), erro: null };
    },
  };
  return { deps, linhas, chamadas };
}

describe('statusDoEvolution', () => {
  it('nomes do Evolution', () => {
    expect(statusDoEvolution('SERVER_ACK')).toBe('sent');
    expect(statusDoEvolution('DELIVERY_ACK')).toBe('delivered');
    expect(statusDoEvolution('READ')).toBe('read');
    expect(statusDoEvolution('PLAYED')).toBe('read');
    expect(statusDoEvolution('ERROR')).toBe('failed');
  });
  it('números do Baileys (renderStatus.ts)', () => {
    expect(statusDoEvolution(0)).toBe('failed');
    expect(statusDoEvolution(2)).toBe('sent');
    expect(statusDoEvolution(3)).toBe('delivered');
    expect(statusDoEvolution(4)).toBe('read');
    expect(statusDoEvolution(5)).toBe('read');
    expect(statusDoEvolution('3')).toBe('delivered');
  });
  it('PENDING, EDITED e desconhecido não mudam nada (antes viravam "enviada")', () => {
    expect(statusDoEvolution('PENDING')).toBeNull();
    expect(statusDoEvolution(1)).toBeNull();
    expect(statusDoEvolution('EDITED')).toBeNull();
    expect(statusDoEvolution(undefined)).toBeNull();
    expect(statusDoEvolution({})).toBeNull();
  });
});

describe('lerAvisoDeStatus', () => {
  it('formato do 2.3.7: keyId e status soltos', () => {
    expect(lerAvisoDeStatus(aviso237(ID_A, 'DELIVERY_ACK'))).toEqual({ id: ID_A, status: 'delivered' });
  });
  it('formato antigo: key.id e update.status, em texto ou número', () => {
    expect(lerAvisoDeStatus(avisoAntigo(ID_A, 'READ'))).toEqual({ id: ID_A, status: 'read' });
    expect(lerAvisoDeStatus(avisoAntigo(ID_A, 3))).toEqual({ id: ID_A, status: 'delivered' });
  });
  it('mensagem recebida (fromMe false) não mexe em nada', () => {
    expect(lerAvisoDeStatus(aviso237(ID_A, 'READ', false))).toBeNull();
    expect(lerAvisoDeStatus(avisoAntigo(ID_A, 'READ', false))).toBeNull();
  });
  it('sem id ou sem status com efeito: nada', () => {
    expect(lerAvisoDeStatus({ status: 'READ' })).toBeNull();
    expect(lerAvisoDeStatus(aviso237(ID_A, 'PENDING'))).toBeNull();
    expect(lerAvisoDeStatus(null)).toBeNull();
    expect(lerAvisoDeStatus('x')).toBeNull();
  });
});

describe('statusAvanca: só para frente', () => {
  it('enviada, entregue, lida', () => {
    expect(statusAvanca('sent', 'delivered')).toBe(true);
    expect(statusAvanca('delivered', 'read')).toBe(true);
    expect(statusAvanca('sent', 'read')).toBe(true);
  });
  it('nunca volta', () => {
    expect(statusAvanca('delivered', 'sent')).toBe(false);
    expect(statusAvanca('read', 'delivered')).toBe(false);
    expect(statusAvanca('read', 'failed')).toBe(false);
  });
  it('recebida, apagada e falhou ficam como estão', () => {
    for (const novo of Object.keys(ANTERIORES) as StatusDeEntrega[]) {
      expect(statusAvanca('received', novo)).toBe(false);
      expect(statusAvanca('deleted', novo)).toBe(false);
      expect(statusAvanca('failed', novo)).toBe(false);
    }
  });
});

describe('aplicarAvisosDeStatus', () => {
  it('2.3.7: entregue e depois lida', async () => {
    const { deps, linhas } = bancoFalso({ [ID_A]: 'sent' });
    const r1 = await aplicarAvisosDeStatus(aviso237(ID_A, 'DELIVERY_ACK'), deps);
    expect(r1.gravados).toBe(1);
    expect(linhas.get(ID_A)).toBe('delivered');
    const r2 = await aplicarAvisosDeStatus([aviso237(ID_A, 'READ')], deps);
    expect(r2.gravados).toBe(1);
    expect(linhas.get(ID_A)).toBe('read');
  });

  it('formato antigo também grava', async () => {
    const { deps, linhas } = bancoFalso({ [ID_B]: 'sent' });
    const r = await aplicarAvisosDeStatus([avisoAntigo(ID_B, 'DELIVERY_ACK')], deps);
    expect(r.gravados).toBe(1);
    expect(linhas.get(ID_B)).toBe('delivered');
  });

  it('fora de ordem: "enviada" depois de "entregue" e "entregue" depois de "lida" não voltam', async () => {
    // Ordem vista no histórico do Evolution em produção: SERVER_ACK, DELIVERY_ACK, SERVER_ACK, READ.
    const { deps, linhas } = bancoFalso({ [ID_A]: 'sent', [ID_B]: 'sent' });
    const r = await aplicarAvisosDeStatus([
      aviso237(ID_A, 'SERVER_ACK'),
      aviso237(ID_A, 'DELIVERY_ACK'),
      aviso237(ID_A, 'SERVER_ACK'),
      aviso237(ID_B, 'READ'),
      aviso237(ID_B, 'DELIVERY_ACK'),
    ], deps);
    expect(linhas.get(ID_A)).toBe('delivered');
    expect(linhas.get(ID_B)).toBe('read');
    expect(r).toMatchObject({ recebidos: 5, gravados: 2, iguais: 3, semMensagem: [], falhas: [] });
  });

  it('id que o ConvoFlow não tem: conta e devolve o id', async () => {
    const { deps } = bancoFalso({ [ID_A]: 'sent' });
    const r = await aplicarAvisosDeStatus([aviso237(ID_FANTASMA, 'READ')], deps);
    expect(r.gravados).toBe(0);
    expect(r.semMensagem).toEqual([ID_FANTASMA]);
  });

  it('gravação que falha: conta, devolve id e erro, e segue para o próximo', async () => {
    const { deps } = bancoFalso({ [ID_A]: 'sent' }, { avancar: 'erro de teste' });
    const r = await aplicarAvisosDeStatus([aviso237(ID_A, 'READ'), aviso237(ID_B, 'READ')], deps);
    expect(r.gravados).toBe(0);
    expect(r.falhas).toEqual([
      { id: ID_A, erro: 'erro de teste' },
      { id: ID_B, erro: 'erro de teste' },
    ]);
  });

  it('busca que falha depois de não gravar: conta como falha, não como "sem mensagem"', async () => {
    const { deps } = bancoFalso({}, { existe: 'erro de leitura' });
    const r = await aplicarAvisosDeStatus([aviso237(ID_A, 'READ')], deps);
    expect(r.falhas).toEqual([{ id: ID_A, erro: 'erro de leitura' }]);
    expect(r.semMensagem).toEqual([]);
  });

  it('ignorados não chegam ao banco', async () => {
    const { deps, chamadas } = bancoFalso({ [ID_A]: 'received' });
    const r = await aplicarAvisosDeStatus([aviso237(ID_A, 'READ', false), aviso237(ID_A, 'PENDING'), { foo: 1 }], deps);
    expect(r).toMatchObject({ recebidos: 3, ignorados: 3, gravados: 0 });
    expect(chamadas).toEqual([]);
  });

  it('vazio ou nulo: nada', async () => {
    const { deps } = bancoFalso({});
    expect((await aplicarAvisosDeStatus(null, deps)).recebidos).toBe(0);
    expect((await aplicarAvisosDeStatus([], deps)).recebidos).toBe(0);
  });
});

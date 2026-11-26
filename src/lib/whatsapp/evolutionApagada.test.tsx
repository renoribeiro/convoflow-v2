/**
 * Mensagem apagada pelo contato nos números QR Code (Evolution 2.3.7).
 * Formatos conferidos no código do tag 2.3.7 (whatsapp.baileys.service.ts):
 * `messages.delete` manda `{ ...key, status: 'DELETED' }`; `messages.edited`
 * manda o protocolMessage cru (apagar = type REVOKE). Ids e Lojas inventados.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MessageBubble, type RenderableMessage } from '@/components/conversations/MessageBubble';
import {
  aplicarApagadas,
  depsDoBanco,
  ehRevogacao,
  idDoMessagesDelete,
  idDoMessagesEdited,
  TEXTO_DA_APAGADA,
  type ClienteDoBanco,
} from '../../../supabase/functions/_shared/evolution-apagada.ts';

const LOJA_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const LOJA_B = 'aaaaaaaa-0000-4000-8000-00000000000b';
const ID_A = '3EB0AAAAAAAAAAAAAAAA01';
const ID_B = '3EB0AAAAAAAAAAAAAAAA02';
const ID_FANTASMA = '3EB0AAAAAAAAAAAAAAAA99';
const JID = '99999000001111@lid';

/** messages.delete no formato do 2.3.7: a key solta mais status DELETED. */
const delete237 = (id: string) => ({ id, remoteJid: JID, fromMe: false, participant: null, status: 'DELETED' });

/** messages.edited com o protocolo de apagar, como o JSON do Baileys sai. */
const revoke = (id: string, type: unknown = 'REVOKE') => ({
  key: { remoteJid: JID, fromMe: false, id },
  ...(type === undefined ? {} : { type }),
});

/** messages.edited de uma edição de verdade. */
const edicao = (id: string) => ({
  key: { remoteJid: JID, fromMe: false, id },
  type: 'MESSAGE_EDIT',
  editedMessage: { conversation: 'texto novo' },
  timestampMs: '1763900000000',
});

interface Linha {
  id: string;
  tenant_id: string;
  evolution_message_id: string;
  content: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

/**
 * Cliente de mentira com o mesmo encadeamento do supabase-js que a gravação
 * usa (`from().select().eq()`, `from().update().eq().select()`), aplicando os
 * filtros de verdade numa tabela em memória. Assim o filtro da Loja é testado
 * no código real da gravação, não no teste.
 */
function bancoFalso(linhas: Linha[], falhar: { buscar?: string; marcar?: string } = {}) {
  const updates: Array<{ filtros: Record<string, string>; payload: Record<string, unknown> }> = [];
  const remocoes: string[][] = [];
  const cliente: ClienteDoBanco = {
    storage: {
      from(bucket: string) {
        expect(bucket).toBe('whatsapp-media');
        return {
          async remove(caminhos: string[]) {
            remocoes.push(caminhos);
            return { data: [], error: null };
          },
        };
      },
    },
    from(tabela: string) {
      expect(tabela).toBe('messages');
      const filtros: Record<string, string> = {};
      let payload: Record<string, unknown> | null = null;
      const q = {
        select() { return q; },
        update(p: Record<string, unknown>) { payload = p; return q; },
        eq(col: string, val: string) { filtros[col] = val; return q; },
        then(ok: (r: { data: unknown; error: { message: string } | null }) => unknown) {
          const alvo = linhas.filter((l) => Object.entries(filtros).every(([c, v]) => (l as unknown as Record<string, unknown>)[c] === v));
          if (payload) {
            updates.push({ filtros: { ...filtros }, payload });
            if (falhar.marcar) return Promise.resolve(ok({ data: null, error: { message: falhar.marcar } }));
            for (const l of alvo) Object.assign(l, payload);
            return Promise.resolve(ok({ data: alvo.map((l) => ({ id: l.id })), error: null }));
          }
          if (falhar.buscar) return Promise.resolve(ok({ data: null, error: { message: falhar.buscar } }));
          return Promise.resolve(ok({ data: alvo.map((l) => ({ id: l.id, metadata: l.metadata })), error: null }));
        },
      };
      return q;
    },
  };
  return { cliente, linhas, updates, remocoes };
}

const linha = (id: string, tenant: string, wa: string, metadata: Record<string, unknown> | null = { evolution: { tipo: 'lid' } }): Linha => ({
  id, tenant_id: tenant, evolution_message_id: wa, content: 'texto original do contato', status: 'received', metadata,
});

describe('leitura dos avisos', () => {
  it('messages.delete do 2.3.7 e o formato antigo com key', () => {
    expect(idDoMessagesDelete(delete237(ID_A))).toBe(ID_A);
    expect(idDoMessagesDelete({ key: { id: ID_B } })).toBe(ID_B);
    expect(idDoMessagesDelete({ remoteJid: JID })).toBeNull();
    expect(idDoMessagesDelete(null)).toBeNull();
  });

  it('messages.edited: REVOKE em texto, em número ou sem type é apagar', () => {
    expect(idDoMessagesEdited(revoke(ID_A))).toBe(ID_A);
    expect(idDoMessagesEdited(revoke(ID_A, 0))).toBe(ID_A);
    expect(idDoMessagesEdited(revoke(ID_A, undefined))).toBe(ID_A);
    expect(idDoMessagesEdited({ protocolMessage: revoke(ID_A) })).toBe(ID_A);
  });

  it('messages.edited: edição de verdade e outros protocolos não são apagar', () => {
    expect(idDoMessagesEdited(edicao(ID_A))).toBeNull();
    expect(idDoMessagesEdited({ ...revoke(ID_A), type: 14 })).toBeNull();
    expect(idDoMessagesEdited({ type: 'EPHEMERAL_SETTING', ephemeralExpiration: 86400 })).toBeNull();
    expect(ehRevogacao({ type: 'MESSAGE_EDIT' })).toBe(false);
  });
});

describe('aplicarApagadas com a gravação real', () => {
  it('messages.delete: tira o texto, marca metadata.deleted e status deleted', async () => {
    const b = bancoFalso([linha('m1', LOJA_A, ID_A)]);
    const r = await aplicarApagadas('messages.delete', delete237(ID_A), depsDoBanco(b.cliente, LOJA_A));
    expect(r).toMatchObject({ recebidos: 1, ids: [ID_A], marcadas: 1, ignorados: 0, semMensagem: [], falhas: [] });
    expect(b.linhas[0]!.content).toBe(TEXTO_DA_APAGADA);
    expect(b.linhas[0]!.status).toBe('deleted');
    expect(b.linhas[0]!.metadata).toEqual({ evolution: { tipo: 'lid' }, deleted: true });
    // Nada de coluna que `messages` não tem, e o texto original não fica em lugar nenhum.
    // media_url limpo: o arquivo da mensagem também sai (evolution-midia.ts).
    expect(Object.keys(b.updates[0]!.payload).sort()).toEqual(['content', 'media_url', 'metadata', 'status']);
    expect(b.updates[0]!.payload.media_url).toBeNull();
    expect(b.remocoes).toHaveLength(1);
    expect(b.remocoes[0]!.every((c) => c.startsWith(`${LOJA_A}/inbound/${ID_A}.`) || c.startsWith(`${LOJA_A}/celular/${ID_A}.`))).toBe(true);
    expect(JSON.stringify(b.linhas[0])).not.toContain('texto original');
    expect(b.updates[0]!.filtros).toEqual({ tenant_id: LOJA_A, id: 'm1' });
  });

  it('messages.edited com REVOKE apaga igual; metadata vazia vira { deleted: true }', async () => {
    const b = bancoFalso([linha('m1', LOJA_A, ID_A, null)]);
    const r = await aplicarApagadas('messages.edited', revoke(ID_A), depsDoBanco(b.cliente, LOJA_A));
    expect(r.marcadas).toBe(1);
    expect(b.linhas[0]!.metadata).toEqual({ deleted: true });
    expect(b.linhas[0]!.content).toBe(TEXTO_DA_APAGADA);
  });

  it('messages.edited de edição de verdade: só conta, não grava', async () => {
    const b = bancoFalso([linha('m1', LOJA_A, ID_A)]);
    const r = await aplicarApagadas('messages.edited', edicao(ID_A), depsDoBanco(b.cliente, LOJA_A));
    expect(r).toMatchObject({ recebidos: 1, ids: [], marcadas: 0, ignorados: 1 });
    expect(b.updates).toHaveLength(0);
    expect(b.linhas[0]!.content).toBe('texto original do contato');
  });

  it('id que não existe: sem mensagem, nada gravado', async () => {
    const b = bancoFalso([linha('m1', LOJA_A, ID_A)]);
    const r = await aplicarApagadas('messages.delete', delete237(ID_FANTASMA), depsDoBanco(b.cliente, LOJA_A));
    expect(r.semMensagem).toEqual([ID_FANTASMA]);
    expect(r.marcadas).toBe(0);
    expect(b.updates).toHaveLength(0);
  });

  it('mesmo id em outra Loja: não mexe na mensagem dela', async () => {
    const b = bancoFalso([linha('m1', LOJA_A, ID_A), linha('m2', LOJA_B, ID_B)]);
    const r = await aplicarApagadas('messages.delete', delete237(ID_B), depsDoBanco(b.cliente, LOJA_A));
    expect(r.semMensagem).toEqual([ID_B]);
    expect(b.linhas[1]!.content).toBe('texto original do contato');
    expect(b.linhas[1]!.status).toBe('received');
  });

  it('id repetido na mesma Loja e em outra: só a da Loja do número', async () => {
    const b = bancoFalso([linha('m1', LOJA_A, ID_A), linha('m2', LOJA_B, ID_A)]);
    const r = await aplicarApagadas('messages.delete', [delete237(ID_A), delete237(ID_A)], depsDoBanco(b.cliente, LOJA_A));
    expect(r).toMatchObject({ recebidos: 2, ids: [ID_A], marcadas: 1 });
    expect(b.linhas[0]!.status).toBe('deleted');
    expect(b.linhas[1]!.status).toBe('received');
  });

  it('gravação que falha: vai para falhas com o id, nada de "marcada"', async () => {
    const b = bancoFalso([linha('m1', LOJA_A, ID_A)], { marcar: 'permission denied' });
    const r = await aplicarApagadas('messages.delete', delete237(ID_A), depsDoBanco(b.cliente, LOJA_A));
    expect(r.marcadas).toBe(0);
    expect(r.falhas).toEqual([{ id: ID_A, erro: 'permission denied' }]);
    expect(b.remocoes).toHaveLength(0);
    expect(b.linhas[0]!.content).toBe('texto original do contato');
  });

  it('busca que falha: vai para falhas, sem tentar gravar', async () => {
    const b = bancoFalso([linha('m1', LOJA_A, ID_A)], { buscar: 'timeout' });
    const r = await aplicarApagadas('messages.delete', delete237(ID_A), depsDoBanco(b.cliente, LOJA_A));
    expect(r.falhas).toEqual([{ id: ID_A, erro: 'timeout' }]);
    expect(b.updates).toHaveLength(0);
  });
});

describe('tela: a mensagem apagada', () => {
  const apagada = (extra: Partial<RenderableMessage>): RenderableMessage => ({
    id: 'aaaaaaaa-0000-4000-8000-0000000000c1',
    content: TEXTO_DA_APAGADA,
    created_at: '2026-11-24T12:00:00Z',
    direction: 'inbound',
    status: 'deleted',
    message_type: 'text',
    metadata: { deleted: true },
    ...extra,
  });

  const mostrar = (m: RenderableMessage) =>
    render(
      <TooltipProvider>
        <MessageBubble message={m} />
      </TooltipProvider>,
    );

  it('texto apagado mostra "Esta mensagem foi apagada." e não o marcador gravado', () => {
    mostrar(apagada({}));
    expect(screen.getByText('Esta mensagem foi apagada.')).toBeTruthy();
    expect(screen.queryByText(TEXTO_DA_APAGADA)).toBeNull();
  });

  it('foto apagada também', () => {
    mostrar(apagada({ message_type: 'image', media_url: 'https://example.com/foto.jpg' }));
    expect(screen.getByText('Esta mensagem foi apagada.')).toBeTruthy();
    expect(document.querySelector('img[src="https://example.com/foto.jpg"]')).toBeNull();
  });
});

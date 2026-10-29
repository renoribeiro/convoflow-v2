import { describe, expect, it } from 'vitest';
import { idsParaMarcarComoLidas, naoLidasDoCliente } from './lidaAoAbrir';

const m = (extra: Record<string, unknown>) => ({
  direction: 'inbound',
  status: 'delivered',
  message_type: 'text',
  evolution_message_id: 'wamid.FAKE1',
  ...extra,
});

describe('lida ao abrir a conversa', () => {
  it('só as do cliente que ainda não foram lidas', () => {
    const lista = [
      m({ evolution_message_id: 'wamid.FAKE1', status: 'read' }),
      m({ evolution_message_id: 'wamid.FAKE2' }),
      m({ direction: 'outbound', evolution_message_id: 'wamid.FAKE3' }),
      m({ evolution_message_id: 'wamid.FAKE4' }),
    ];
    expect(naoLidasDoCliente(lista)).toHaveLength(2);
    expect(idsParaMarcarComoLidas(lista)).toEqual(['wamid.FAKE2', 'wamid.FAKE4']);
  });

  it('reação, mensagem apagada e linha sem id do WhatsApp não levam recibo', () => {
    const lista = [
      m({ message_type: 'reaction', evolution_message_id: 'wamid.R' }),
      m({ message_type: 'deleted', evolution_message_id: 'wamid.D' }),
      m({ evolution_message_id: null }),
      m({ evolution_message_id: 'wamid.OK' }),
    ];
    expect(idsParaMarcarComoLidas(lista)).toEqual(['wamid.OK']);
  });

  it('nada para marcar: lista vazia (nenhuma chamada sai)', () => {
    expect(idsParaMarcarComoLidas([m({ status: 'read' })])).toEqual([]);
    expect(idsParaMarcarComoLidas([])).toEqual([]);
  });

  it('no máximo 50, ficando as mais novas, sem repetir', () => {
    const lista = Array.from({ length: 60 }, (_, i) => m({ evolution_message_id: `wamid.FAKE${i}` }));
    const ids = idsParaMarcarComoLidas([...lista, m({ evolution_message_id: 'wamid.FAKE59' })]);
    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe('wamid.FAKE10');
    expect(ids.at(-1)).toBe('wamid.FAKE59');
  });
});

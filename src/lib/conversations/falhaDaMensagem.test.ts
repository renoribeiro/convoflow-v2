import { describe, expect, it } from 'vitest';
import { motivoDaFalhaDaMensagem, reenvioDaMensagem, REENVIO_TEXTOS } from './falhaDaMensagem';

describe('motivoDaFalhaDaMensagem', () => {
  it('API Oficial com código conhecido: frase em português, com o código no fim', () => {
    const t = motivoDaFalhaDaMensagem({
      error_code: '131047',
      error_message: 'Re-engagement message (Message failed to send because more than 24 hours have passed)',
    });
    expect(t).toMatch(/^Fora da janela de 24 horas/);
    expect(t).toMatch(/\(código 131047 da Meta\)$/);
    expect(t).not.toMatch(/Re-engagement/);
  });

  it('API Oficial com código desconhecido: nunca a frase crua em inglês', () => {
    const t = motivoDaFalhaDaMensagem({ error_code: '131999', error_message: 'Some unknown English error' });
    expect(t).toBe('A Meta recusou esta mensagem. (código 131999 da Meta)');
  });

  it('Evolution e WAHA: o motivo é nosso e a frase gravada já está em português', () => {
    expect(
      motivoDaFalhaDaMensagem({
        error_code: 'number_not_on_whatsapp',
        error_message: 'Este contato não tem WhatsApp neste número de telefone. Confira o número do contato.',
      }),
    ).toBe('Este contato não tem WhatsApp neste número de telefone. Confira o número do contato.');
  });

  it('motivo nosso sem frase: o texto genérico', () => {
    expect(motivoDaFalhaDaMensagem({ error_code: 'provider_error', error_message: null })).toBe(
      'A mensagem não foi enviada.',
    );
  });

  it('linha antiga sem código e sem texto', () => {
    expect(motivoDaFalhaDaMensagem({})).toBe('A mensagem não foi enviada.');
    expect(motivoDaFalhaDaMensagem(null)).toBe('A mensagem não foi enviada.');
  });

  it('sem código, mas com o código da Meta dentro do texto: traduz', () => {
    expect(motivoDaFalhaDaMensagem({ error_message: '(#131026) Message undeliverable' })).toMatch(
      /^A Meta não conseguiu entregar/,
    );
  });

  it('sem código, texto nosso: fica o texto', () => {
    expect(
      motivoDaFalhaDaMensagem({ error_message: 'Não foi possível falar com o servidor de envio. Confira a internet e tente de novo.' }),
    ).toBe('Não foi possível falar com o servidor de envio. Confira a internet e tente de novo.');
  });
});

describe('reenvioDaMensagem', () => {
  const falhou = { direction: 'outbound', status: 'failed', message_type: 'text', content: 'Oi, tudo bem?' };
  const livre = { bloqueio: null };

  it('texto que falhou, conversa liberada: pode reenviar', () => {
    expect(reenvioDaMensagem(falhou, livre)).toEqual({ pode: true });
  });

  it('API Oficial fora da janela de 24 horas: não pode, com o motivo do campo', () => {
    const motivo = 'Mais de 24 horas sem mensagem do cliente: pela regra da Meta, só um template aprovado reabre a conversa.';
    expect(reenvioDaMensagem(falhou, { bloqueio: motivo })).toEqual({ pode: false, motivo });
  });

  it('mensagem que não falhou ou que é do cliente: nada', () => {
    expect(reenvioDaMensagem({ ...falhou, status: 'sent' }, livre)).toBeNull();
    expect(reenvioDaMensagem({ ...falhou, direction: 'inbound' }, livre)).toBeNull();
  });

  it('template e arquivo têm o próprio caminho', () => {
    expect(reenvioDaMensagem({ ...falhou, message_type: 'template' }, livre)).toEqual({
      pode: false,
      motivo: REENVIO_TEXTOS.template,
    });
    expect(reenvioDaMensagem({ ...falhou, message_type: 'image' }, livre)).toEqual({
      pode: false,
      motivo: REENVIO_TEXTOS.arquivo,
    });
  });

  it('localização que falhou sai de novo pelo clipe (lote 6f, B5)', () => {
    expect(reenvioDaMensagem({ ...falhou, message_type: 'location' }, livre)).toEqual({
      pode: false,
      motivo: REENVIO_TEXTOS.localizacao,
    });
    expect(REENVIO_TEXTOS.localizacao).toMatch(/clipe/);
  });

  it('reação que falhou e texto vazio: sem botão', () => {
    expect(reenvioDaMensagem({ ...falhou, message_type: 'reaction' }, livre)).toBeNull();
    expect(reenvioDaMensagem({ ...falhou, content: '  ' }, livre)).toBeNull();
  });
});

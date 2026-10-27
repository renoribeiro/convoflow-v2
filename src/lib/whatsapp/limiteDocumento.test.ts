import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { DOCUMENTO_GRANDE_DEMAIS, LIMITE_DOCUMENTO_BYTES, motivoDocumentoGrande } from './limiteDocumento';
import { MEDIA_LIMIT_BYTES, SEND_MESSAGES } from '../../../supabase/functions/_shared/message-send.ts';

const MB = 1024 * 1024;
const pdf = (size: number) => ({ type: 'application/pdf', size });

describe('documento acima de 30 MB em número Evolution ou WAHA', () => {
  it('recusa antes de subir, com a frase da tela', () => {
    for (const provider of ['evolution', 'waha', null]) {
      expect(motivoDocumentoGrande(provider, pdf(31 * MB))).toBe(DOCUMENTO_GRANDE_DEMAIS);
    }
    expect(DOCUMENTO_GRANDE_DEMAIS).toBe(
      'Este arquivo passa de 30 MB e não pode ser enviado por este número. Envie um link para o arquivo.',
    );
  });

  it('30 MB cravados ainda passam', () => {
    expect(motivoDocumentoGrande('evolution', pdf(30 * MB))).toBeNull();
  });

  it('a API Oficial e o Instagram seguem com o limite deles', () => {
    expect(motivoDocumentoGrande('official', pdf(90 * MB))).toBeNull();
    expect(motivoDocumentoGrande('instagram', pdf(90 * MB))).toBeNull();
  });

  it('foto, vídeo e áudio não entram nesta regra', () => {
    for (const type of ['image/jpeg', 'video/mp4', 'audio/mpeg']) {
      expect(motivoDocumentoGrande('waha', { type, size: 40 * MB })).toBeNull();
    }
  });

  it('o limite e a frase da tela são os mesmos do servidor', () => {
    expect(LIMITE_DOCUMENTO_BYTES).toBe(MEDIA_LIMIT_BYTES.document);
    expect(SEND_MESSAGES.documentTooLarge).toBe(DOCUMENTO_GRANDE_DEMAIS);
  });
});

/**
 * media-links — o link temporário da mídia das Conversas (bucket privado).
 *
 * O núcleo vive em supabase/functions/_shared/media-links.ts porque roda no
 * Deno, mas não importa nada do Deno (mesma convenção de publicSignupHandler).
 *
 * O que estes testes travam:
 *   1. Sem login (ou com token inválido): 401, e nada é lido nem assinado.
 *   2. Mensagem que a pessoa não vê (o RLS não devolve): sem link.
 *   3. Caminho de outra Conta/Loja, ou que não bate com a mensagem: sem link.
 *   4. Os dois formatos gravados valem: caminho puro e URL pública antiga.
 *   5. Tudo é assinado numa chamada só, com validade de 1 hora.
 *   6. A tela e a função concordam sobre o que é arquivo nosso (paridade).
 */
import { describe, expect, it, vi } from 'vitest';

import {
  atenderMediaLinks,
  caminhoBateComAMensagem,
  caminhoDeEnvioValido,
  lerIdsDoPedido,
  MAX_MESSAGE_IDS,
  MEDIA_LINK_TTL_S,
  whatsappMediaPath as caminhoNoServidor,
  type DependenciasMediaLinks,
  type LinhaDaMensagem,
} from '../../../supabase/functions/_shared/media-links';
import { classifyMediaUrl, downloadHref, whatsappMediaPath as caminhoNaTela } from './whatsappMedia';

const ORIGEM = 'https://projeto-teste.supabase.co';
const LOJA_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const LOJA_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const M1 = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const M2 = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const M3 = 'aaaaaaaa-0000-4000-8000-0000000000a3';
const M4 = 'aaaaaaaa-0000-4000-8000-0000000000a4';

const publica = (caminho: string) => `${ORIGEM}/storage/v1/object/public/whatsapp-media/${caminho}`;

const recebida = (id: string, wamid: string, media_url: string | null, tenant = LOJA_A): LinhaDaMensagem => ({
  id,
  tenant_id: tenant,
  direction: 'inbound',
  evolution_message_id: wamid,
  media_url,
});
const enviada = (id: string, media_url: string | null, tenant = LOJA_A): LinhaDaMensagem => ({
  id,
  tenant_id: tenant,
  direction: 'outbound',
  evolution_message_id: 'wamid.FAKEOUT',
  media_url,
});

function montar(visiveis: LinhaDaMensagem[], extra: Partial<DependenciasMediaLinks> = {}) {
  const lerMensagens = vi.fn(async (_token: string, ids: string[]) => visiveis.filter((l) => ids.includes(l.id)));
  const assinar = vi.fn(async (caminhos: string[], _validade: number) =>
    caminhos.map((path) => ({ path, signedUrl: `${ORIGEM}/storage/v1/object/sign/whatsapp-media/${path}?token=FAKE` })),
  );
  const usuarioDoToken = vi.fn(async (token: string) => (token === 'token-bom' ? { id: 'usuario-1' } : null));
  const deps: DependenciasMediaLinks = { usuarioDoToken, lerMensagens, assinar, origemDoProjeto: ORIGEM, ...extra };
  return { deps, lerMensagens, assinar, usuarioDoToken };
}

const pedir = (deps: DependenciasMediaLinks, ids: unknown, token: string | null = 'Bearer token-bom') =>
  atenderMediaLinks({ token, corpo: { message_ids: ids } }, deps);

describe('atenderMediaLinks: login', () => {
  it('sem login: 401, sem ler nem assinar nada', async () => {
    const { deps, lerMensagens, assinar } = montar([]);
    const r = await pedir(deps, [M1], null);
    expect(r.status).toBe(401);
    expect(lerMensagens).not.toHaveBeenCalled();
    expect(assinar).not.toHaveBeenCalled();
  });

  it('token inválido ou vencido: 401', async () => {
    const { deps, lerMensagens } = montar([]);
    expect((await pedir(deps, [M1], 'Bearer token-ruim')).status).toBe(401);
    expect((await pedir(deps, [M1], 'Bearer ')).status).toBe(401);
    expect(lerMensagens).not.toHaveBeenCalled();
  });

  it('lê as mensagens com o token de quem pede (o RLS decide)', async () => {
    const { deps, lerMensagens } = montar([]);
    await pedir(deps, [M1]);
    expect(lerMensagens).toHaveBeenCalledWith('token-bom', [M1]);
  });
});

describe('atenderMediaLinks: quem vê o quê', () => {
  it('mensagem que a pessoa não vê (o RLS não devolveu) fica sem link', async () => {
    // M2 existe, mas é de uma conversa escondida: a leitura com o token não a devolve.
    const { deps } = montar([recebida(M1, 'wamid.FAKE1', `${LOJA_A}/inbound/wamid.FAKE1.ogg`)]);
    const r = await pedir(deps, [M1, M2]);
    expect(r.status).toBe(200);
    expect(Object.keys((r.body as { links: object }).links)).toEqual([M1]);
  });

  it('caminho da pasta de outra Conta fica sem link, mesmo com a mensagem visível', async () => {
    const { deps, assinar } = montar([
      enviada(M1, `${LOJA_B}/1790000000000-foto.jpg`),
      enviada(M2, publica(`${LOJA_B}/1790000000000-foto.jpg`)),
    ]);
    const r = await pedir(deps, [M1, M2]);
    expect((r.body as { links: object }).links).toEqual({});
    expect(assinar).not.toHaveBeenCalled();
  });

  it('mídia recebida só abre pela própria mensagem (o wamid do caminho é o dela)', async () => {
    const { deps } = montar([
      recebida(M1, 'wamid.FAKE1', `${LOJA_A}/inbound/wamid.FAKE1.ogg`),
      // linha visível apontando para o arquivo recebido de OUTRA conversa
      recebida(M2, 'wamid.FAKE2', `${LOJA_A}/inbound/wamid.FAKE1.ogg`),
      // mensagem enviada apontando para inbound/
      enviada(M3, `${LOJA_A}/inbound/wamid.FAKE1.ogg`),
      // recebida apontando para um anexo enviado
      recebida(M4, 'wamid.FAKE4', `${LOJA_A}/1790000000000-foto.jpg`),
    ]);
    const r = await pedir(deps, [M1, M2, M3, M4]);
    expect(Object.keys((r.body as { links: object }).links)).toEqual([M1]);
  });

  it('URL de outro host com o mesmo desenho não é arquivo nosso', async () => {
    const { deps, assinar } = montar([
      enviada(M1, `https://outro.example/storage/v1/object/public/whatsapp-media/${LOJA_A}/x.jpg`),
    ]);
    const r = await pedir(deps, [M1]);
    expect((r.body as { links: object }).links).toEqual({});
    expect(assinar).not.toHaveBeenCalled();
  });
});

describe('atenderMediaLinks: formatos e lote', () => {
  it('caminho puro e URL pública antiga dão link; tudo numa assinatura de 1 hora', async () => {
    const { deps, assinar } = montar([
      recebida(M1, 'wamid.FAKE1', publica(`${LOJA_A}/inbound/wamid.FAKE1.ogg`)),
      recebida(M2, 'wamid.FAKE2', `${LOJA_A}/inbound/wamid.FAKE2.jpg`),
      enviada(M3, `${LOJA_A}/1790000000000-voz-teste.ogg`),
      enviada(M4, null),
    ]);
    const r = await pedir(deps, [M1, M2, M3, M4]);
    const links = (r.body as { links: Record<string, string> }).links;
    expect(Object.keys(links).sort()).toEqual([M1, M2, M3].sort());
    expect(links[M1]).toContain(`/object/sign/whatsapp-media/${LOJA_A}/inbound/wamid.FAKE1.ogg`);
    expect(assinar).toHaveBeenCalledTimes(1);
    expect(assinar.mock.calls[0]?.[1]).toBe(MEDIA_LINK_TTL_S);
    expect(MEDIA_LINK_TTL_S).toBe(3600);
    expect((r.body as { expires_in: number }).expires_in).toBe(3600);
  });

  it('arquivo que o Storage não assinou (sumiu) fica sem link, os outros seguem', async () => {
    const { deps } = montar(
      [enviada(M1, `${LOJA_A}/a.jpg`), enviada(M2, `${LOJA_A}/b.jpg`)],
      {
        assinar: async (caminhos) =>
          caminhos.map((path) => ({ path, signedUrl: path.endsWith('a.jpg') ? null : `${ORIGEM}/s/${path}` })),
      },
    );
    const r = await pedir(deps, [M1, M2]);
    expect(Object.keys((r.body as { links: object }).links)).toEqual([M2]);
  });

  it('pedido vazio responde vazio sem ler; ids inválidos ou demais: 400', async () => {
    const { deps, lerMensagens } = montar([]);
    expect(await pedir(deps, [])).toEqual({ status: 200, body: { links: {}, expires_in: 3600 } });
    expect(lerMensagens).not.toHaveBeenCalled();
    expect((await pedir(deps, ['nao-e-uuid'])).status).toBe(400);
    expect((await pedir(deps, 'x')).status).toBe(400);
    const muitos = Array.from({ length: MAX_MESSAGE_IDS + 1 }, (_, i) =>
      `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect((await pedir(deps, muitos)).status).toBe(400);
  });

  it('ids repetidos contam uma vez', () => {
    expect(lerIdsDoPedido({ message_ids: [M1, M1, M2] })).toEqual([M1, M2]);
  });
});

describe('caminhoBateComAMensagem', () => {
  it('pasta da Loja da mensagem; sem tenant não abre nada', () => {
    expect(caminhoBateComAMensagem(enviada(M1, null), `${LOJA_A}/x.jpg`)).toBe(true);
    expect(caminhoBateComAMensagem(enviada(M1, null), `${LOJA_A}x/x.jpg`)).toBe(false);
    expect(caminhoBateComAMensagem({ ...enviada(M1, null), tenant_id: null }, `${LOJA_A}/x.jpg`)).toBe(false);
    expect(caminhoBateComAMensagem({ ...recebida(M1, '', null) }, `${LOJA_A}/inbound/.ogg`)).toBe(false);
  });
});

describe('caminhoDeEnvioValido (o anexo que o chat manda ao provedor)', () => {
  it('só o caminho puro, na pasta da Loja da instância, fora de inbound/', () => {
    expect(caminhoDeEnvioValido(`${LOJA_A}/1790000000000-foto.jpg`, LOJA_A)).toBe(`${LOJA_A}/1790000000000-foto.jpg`);
    expect(caminhoDeEnvioValido(`${LOJA_B}/1790000000000-foto.jpg`, LOJA_A)).toBeNull();
    expect(caminhoDeEnvioValido(`${LOJA_A}/inbound/wamid.FAKE1.ogg`, LOJA_A)).toBeNull();
    expect(caminhoDeEnvioValido(publica(`${LOJA_A}/x.jpg`), LOJA_A)).toBeNull();
    expect(caminhoDeEnvioValido(`${LOJA_A}/../${LOJA_B}/x.jpg`, LOJA_A)).toBeNull();
    expect(caminhoDeEnvioValido(undefined, LOJA_A)).toBeNull();
  });
});

describe('a tela e a função concordam sobre o que é arquivo nosso', () => {
  const casos: Array<[unknown, string | undefined]> = [
    [`${LOJA_A}/inbound/wamid.FAKE1.ogg`, undefined],
    [`${LOJA_A}/1790000000000-foto%20x.jpg`, undefined],
    [publica(`${LOJA_A}/inbound/wamid.FAKE1.ogg`), ORIGEM],
    [publica(`${LOJA_A}/inbound/wamid.FAKE1.ogg`), undefined],
    [publica(`${LOJA_A}/foto%20com%20espa%C3%A7o.jpg`), ORIGEM],
    [`${ORIGEM}/storage/v1/object/sign/whatsapp-media/${LOJA_A}/x.jpg?token=FAKE`, ORIGEM],
    [`https://outro.example/storage/v1/object/public/whatsapp-media/${LOJA_A}/x.jpg`, ORIGEM],
    [`${ORIGEM}/storage/v1/object/public/campaign-media/${LOJA_A}/x.jpg`, ORIGEM],
    ['https://pps.whatsapp.net/v/t61/foto.jpg', ORIGEM],
    ['data:image/png;base64,AAAA', ORIGEM],
    ['blob:https://convoflow.com.br/abc', ORIGEM],
    [`/${LOJA_A}/x.jpg`, undefined],
    [`${LOJA_A}/../x.jpg`, undefined],
    [`${LOJA_A}//x.jpg`, undefined],
    [`${LOJA_A}`, undefined],
    [`${LOJA_A}/x.jpg?token=1`, undefined],
    ['', undefined],
    [null, undefined],
    [42, undefined],
  ];
  it.each(casos)('%s', (valor, origem) => {
    expect(caminhoNaTela(valor, origem)).toBe(caminhoNoServidor(valor, origem));
  });

  it('o que a URL pública vira é o caminho do objeto', () => {
    expect(caminhoNaTela(publica(`${LOJA_A}/foto%20com%20espa%C3%A7o.jpg`), ORIGEM)).toBe(`${LOJA_A}/foto com espaço.jpg`);
  });
});

describe('classifyMediaUrl e downloadHref (a tela)', () => {
  it('arquivo nosso pede link; a URL pública antiga fica de reserva', () => {
    expect(classifyMediaUrl(`${LOJA_A}/x.jpg`, ORIGEM)).toEqual({ kind: 'storage', path: `${LOJA_A}/x.jpg`, fallbackUrl: null });
    expect(classifyMediaUrl(publica(`${LOJA_A}/x.jpg`), ORIGEM)).toEqual({
      kind: 'storage',
      path: `${LOJA_A}/x.jpg`,
      fallbackUrl: publica(`${LOJA_A}/x.jpg`),
    });
  });

  it('link de fora passa como está; vazio e caminho torto não viram nada', () => {
    expect(classifyMediaUrl('https://pps.whatsapp.net/v/foto.jpg', ORIGEM)).toEqual({
      kind: 'external',
      url: 'https://pps.whatsapp.net/v/foto.jpg',
    });
    expect(classifyMediaUrl(null)).toEqual({ kind: 'none' });
    expect(classifyMediaUrl(`${LOJA_A}/../x.jpg`)).toEqual({ kind: 'none' });
  });

  it('"Baixar" no link assinado ganha &download=; o resto fica igual', () => {
    const assinado = `${ORIGEM}/storage/v1/object/sign/whatsapp-media/${LOJA_A}/x.jpg?token=FAKE`;
    expect(downloadHref(assinado)).toBe(`${assinado}&download=`);
    expect(downloadHref(`${assinado}&download=`)).toBe(`${assinado}&download=`);
    expect(downloadHref('https://pps.whatsapp.net/v/foto.jpg')).toBe('https://pps.whatsapp.net/v/foto.jpg');
  });
});

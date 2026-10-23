/**
 * Bucket privado, passo 2: quem GRAVA arquivo do chat guarda só o caminho, e o
 * provedor recebe um link temporário.
 *
 * O que trava:
 *   1. uploadWhatsAppMedia sobe na pasta da Loja, assina o próprio upload por
 *      1 hora e nunca monta "URL pública".
 *   2. meta-webhook grava o CAMINHO em messages.media_url (nunca getPublicUrl).
 *   3. whatsapp-send-message assina o caminho com o token de quem envia, depois
 *      de conferir que é da Loja da instância.
 *   4. O PWA nunca guarda link assinado no cache (regra antes da geral do Storage).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upload = vi.hoisted(() => vi.fn());
const createSignedUrl = vi.hoisted(() => vi.fn());
const getPublicUrl = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from } } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { uploadWhatsAppMedia, UPLOAD_LINK_TTL_S } from '@/services/whatsapp/media-upload';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const LOJA = 'aaaaaaaa-0000-4000-8000-000000000001';

beforeEach(() => {
  [upload, createSignedUrl, getPublicUrl, from].forEach((f) => f.mockReset());
  from.mockReturnValue({ upload, createSignedUrl, getPublicUrl });
  upload.mockResolvedValue({ data: { path: 'x' }, error: null });
  createSignedUrl.mockImplementation(async (p: string) => ({
    data: { signedUrl: `https://projeto-teste.supabase.co/storage/v1/object/sign/whatsapp-media/${p}?token=FAKE` },
    error: null,
  }));
});

describe('uploadWhatsAppMedia (o anexo do chat)', () => {
  it('sobe na pasta da Loja, assina o próprio upload por 1 hora e devolve caminho + link', async () => {
    const r = await uploadWhatsAppMedia(new File(['x'], 'voz 1.ogg', { type: 'audio/ogg' }), LOJA);
    expect(from).toHaveBeenCalledWith('whatsapp-media');
    const caminho = upload.mock.calls[0]?.[0] as string;
    expect(caminho).toMatch(new RegExp(`^${LOJA}/\\d{13}-voz_1\\.ogg$`));
    expect(createSignedUrl).toHaveBeenCalledWith(caminho, 3600);
    expect(UPLOAD_LINK_TTL_S).toBe(3600);
    expect(r.path).toBe(caminho);
    expect(r.signedUrl).toContain('/object/sign/whatsapp-media/');
    expect(getPublicUrl).not.toHaveBeenCalled();
    expect('publicUrl' in r).toBe(false);
  });

  it('sem o link do envio, falha com frase em pt-BR (não manda nada ao provedor)', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    await expect(uploadWhatsAppMedia(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), LOJA)).rejects.toThrow(
      'O arquivo subiu, mas não foi possível preparar o envio. Tente de novo.',
    );
  });
});

describe('quem grava guarda só o caminho', () => {
  it('meta-webhook grava o caminho em media_url e não monta URL pública', () => {
    const fonte = ler('supabase/functions/meta-webhook/index.ts');
    expect(fonte).not.toMatch(/getPublicUrl\s*\(/);
    expect(fonte).toMatch(/\.update\(\{ message_type: msg\.type, media_url: path \}\)/);
    expect(fonte).toContain('const path = `${instance.tenant_id}/inbound/${wamid}.${ext}`;');
  });

  it('o anexo do chat não monta URL pública', () => {
    expect(ler('src/services/whatsapp/media-upload.ts')).not.toMatch(/getPublicUrl\s*\(/);
  });

  it('whatsapp-send-message assina o caminho com o token de quem envia, só depois de conferir a Loja', () => {
    const fonte = ler('supabase/functions/whatsapp-send-message/index.ts');
    const confere = fonte.indexOf('caminhoDeEnvioValido(body.media_path, instance.tenant_id)');
    const assina = fonte.indexOf('.createSignedUrl(caminho, MEDIA_LINK_TTL_S)');
    expect(confere).toBeGreaterThan(0);
    expect(assina).toBeGreaterThan(confere);
    // O cliente que assina leva o Authorization de quem pediu, não a chave do servidor.
    const trecho = fonte.slice(confere, assina);
    expect(trecho).toContain("createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')");
    expect(trecho).toContain('Authorization: `Bearer ${token}`');
    expect(trecho).not.toContain('supabaseAdmin');
  });
});

describe('PWA', () => {
  it('link assinado do Storage é NetworkOnly e vem antes da regra geral do Storage', () => {
    const cfg = ler('vite.config.ts');
    const assinado = cfg.indexOf('urlPattern: /^https:\\/\\/.*\\.supabase\\.co\\/storage\\/v1\\/object\\/sign\\/.*/i');
    const geral = cfg.indexOf('urlPattern: /^https:\\/\\/.*\\.supabase\\.co\\/(rest|storage)\\/.*/i');
    expect(assinado).toBeGreaterThan(0);
    expect(geral).toBeGreaterThan(assinado);
    expect(cfg.slice(assinado, geral)).toContain("handler: 'NetworkOnly'");
    expect(cfg.slice(assinado, geral)).not.toContain('NetworkFirst');
  });
});

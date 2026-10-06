import { describe, it, expect } from 'vitest';
// Validação de assinatura/handshake do meta-webhook (compartilhada com o Deno).
import {
  computeHmacSha256Hex,
  verifyMetaSignature,
  verifyMetaSignatureAny,
  matchVerifyToken,
} from '../../supabase/functions/_shared/cryptoSignature';

const PRIMARY = 'app-secret-atual-0123456789abcdef';
const SECONDARY = 'app-secret-novo-fedcba9876543210';
const BODY = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ id: '2542773286191227', changes: [{ field: 'messages', value: {} }] }],
});

async function sign(body: string, secret: string): Promise<string> {
  return `sha256=${await computeHmacSha256Hex(body, secret)}`;
}

// É exatamente assim que o handler chama: [primário, secundário], com o
// secundário vindo de Deno.env.get — undefined quando o secret não existe.
describe('verifyMetaSignatureAny — dois Meta Apps no mesmo endpoint', () => {
  it('aceita assinatura do app primário (índice 0)', async () => {
    const header = await sign(BODY, PRIMARY);
    expect(await verifyMetaSignatureAny(BODY, header, [PRIMARY, SECONDARY])).toBe(0);
  });

  it('aceita assinatura do app secundário (índice 1)', async () => {
    const header = await sign(BODY, SECONDARY);
    expect(await verifyMetaSignatureAny(BODY, header, [PRIMARY, SECONDARY])).toBe(1);
  });

  it('rejeita assinatura de um terceiro segredo, com os dois configurados', async () => {
    const header = await sign(BODY, 'segredo-de-outro-app');
    expect(await verifyMetaSignatureAny(BODY, header, [PRIMARY, SECONDARY])).toBe(-1);
  });

  it('rejeita assinatura válida sobre OUTRO corpo (corpo adulterado)', async () => {
    const header = await sign(BODY, SECONDARY);
    expect(await verifyMetaSignatureAny(BODY + ' ', header, [PRIMARY, SECONDARY])).toBe(-1);
  });

  it('rejeita header ausente ou malformado', async () => {
    expect(await verifyMetaSignatureAny(BODY, null, [PRIMARY, SECONDARY])).toBe(-1);
    expect(await verifyMetaSignatureAny(BODY, 'sha1=abc', [PRIMARY, SECONDARY])).toBe(-1);
    expect(await verifyMetaSignatureAny(BODY, 'sha256=zz', [PRIMARY, SECONDARY])).toBe(-1);
  });

  it('nunca aceita quando não há segredo configurado', async () => {
    const header = await sign(BODY, PRIMARY);
    expect(await verifyMetaSignatureAny(BODY, header, [undefined, undefined])).toBe(-1);
    expect(await verifyMetaSignatureAny(BODY, header, [])).toBe(-1);
  });

  describe('secundário ausente se comporta exatamente como só o primário', () => {
    // Prova por equivalência: para cada cenário, o resultado com
    // [PRIMARY, undefined] tem que ser idêntico ao de verifyMetaSignature(PRIMARY)
    // — a função que o handler chamava antes desta mudança.
    const cenarios: Array<[string, () => Promise<string | null>]> = [
      ['assinado pelo primário', () => sign(BODY, PRIMARY)],
      ['assinado pelo secundário (que não está configurado)', () => sign(BODY, SECONDARY)],
      ['assinado por segredo desconhecido', () => sign(BODY, 'outro')],
      ['sem header', async () => null],
      ['header malformado', async () => 'sha256=not-hex'],
    ];

    for (const [nome, headerFn] of cenarios) {
      it(nome, async () => {
        const header = await headerFn();
        const antes = await verifyMetaSignature(BODY, header, PRIMARY);
        for (const ausente of [undefined, null, '']) {
          const depois = await verifyMetaSignatureAny(BODY, header, [PRIMARY, ausente]);
          expect(depois >= 0).toBe(antes);
          // Quando aceita, é sempre o primário: o slot vazio nunca "ganha".
          if (antes) expect(depois).toBe(0);
        }
      });
    }
  });
});

describe('matchVerifyToken — handshake GET com dois tokens', () => {
  const TOKEN_A = 'token-app-atual';
  const TOKEN_B = 'token-app-novo';

  it('aceita o token primário e o secundário, devolvendo o slot', () => {
    expect(matchVerifyToken(TOKEN_A, [TOKEN_A, TOKEN_B])).toBe(0);
    expect(matchVerifyToken(TOKEN_B, [TOKEN_A, TOKEN_B])).toBe(1);
  });

  it('rejeita token desconhecido, vazio ou ausente', () => {
    expect(matchVerifyToken('outro', [TOKEN_A, TOKEN_B])).toBe(-1);
    expect(matchVerifyToken('', [TOKEN_A, TOKEN_B])).toBe(-1);
    expect(matchVerifyToken(null, [TOKEN_A, TOKEN_B])).toBe(-1);
    expect(matchVerifyToken(undefined, [TOKEN_A, TOKEN_B])).toBe(-1);
  });

  it('não aceita prefixo nem token com byte a mais', () => {
    expect(matchVerifyToken(TOKEN_A.slice(0, -1), [TOKEN_A, TOKEN_B])).toBe(-1);
    expect(matchVerifyToken(TOKEN_A + 'x', [TOKEN_A, TOKEN_B])).toBe(-1);
  });

  it('secundário ausente: só o primário bate, igual a `token === primário`', () => {
    for (const ausente of [undefined, null, '']) {
      expect(matchVerifyToken(TOKEN_A, [TOKEN_A, ausente])).toBe(0);
      expect(matchVerifyToken(TOKEN_B, [TOKEN_A, ausente])).toBe(-1);
      // Slot vazio nunca casa com token vazio — antes `'' === ''` seria true
      // se alguém deixasse o secret em branco; aqui é rejeitado.
      expect(matchVerifyToken('', [TOKEN_A, ausente])).toBe(-1);
    }
  });
});

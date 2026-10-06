import { describe, it, expect } from 'vitest';
// Parte pura do instagram-webhook (fatia 2), compartilhada com o Deno.
import {
  classifyMessagingItem,
  isEchoItem,
  isWellFormedSignatureHeader,
  META_TS_MAX_AHEAD_MS,
  META_TS_MIN_MS,
  parseInstagramDelivery,
  parseMetaTimestamp,
  summarizeForLog,
  toRpcArgs,
  verifyInstagramSignature,
} from '../../supabase/functions/instagram-webhook/delivery';
import { computeHmacSha256Hex } from '../../supabase/functions/_shared/cryptoSignature';

const IG_SECRET = 'instagram-app-secret-0123456789ab';
const META_SECRET = 'meta-app-secret-fedcba9876543210';

const TEXTO = 'oi, tenho interesse no apartamento';
const IGSID = '978239761327698';
// O id da conta de teste real, medido pela sonda (entry[].id).
const IGID = '17841419262135883';
// ~164 caracteres, como o mid real medido pela sonda.
const MID = 'aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQx' + 'A'.repeat(122);

/** Entrega real de mensagem do Instagram (formato Messenger). */
const IG_PAYLOAD = {
  object: 'instagram',
  entry: [
    {
      id: IGID,
      time: 1778223729706,
      messaging: [
        {
          sender: { id: IGSID },
          recipient: { id: IGID },
          timestamp: 1778223722476,
          message: { mid: MID, text: TEXTO },
        },
      ],
    },
  ],
};

/** A resposta dada pelo app do Instagram no celular: volta como eco. */
const IG_ECHO_PAYLOAD = {
  object: 'instagram',
  entry: [
    {
      id: IGID,
      messaging: [
        {
          sender: { id: IGID },
          recipient: { id: IGSID },
          timestamp: 1778223799999,
          message: { mid: MID + 'e', text: 'resposta do atendente', is_echo: true },
        },
      ],
    },
  ],
};

/** O formato do WhatsApp, para provar que o parser não confunde os dois. */
const WA_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [{ id: '2542773286191227', changes: [{ field: 'messages', value: { messages: [] } }] }],
};

const item = (message: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  sender: { id: IGSID },
  recipient: { id: IGID },
  timestamp: 1,
  message,
  ...extra,
});

async function sign(body: string, secret: string): Promise<string> {
  return `sha256=${await computeHmacSha256Hex(body, secret)}`;
}

// -----------------------------------------------------------------------------
describe('verifyInstagramSignature — só o segredo do app de Instagram', () => {
  const body = JSON.stringify(IG_PAYLOAD);

  it('aceita a entrega assinada com o INSTAGRAM_APP_SECRET', async () => {
    expect(await verifyInstagramSignature(body, await sign(body, IG_SECRET), IG_SECRET)).toBe(true);
  });

  it('recusa a entrega assinada com o segredo do app do WhatsApp', async () => {
    // A sonda mediu: meta=false. Aceitar este segredo aqui seria aceitar
    // entrega que a Meta não assinou para o Instagram.
    expect(await verifyInstagramSignature(body, await sign(body, META_SECRET), IG_SECRET)).toBe(false);
  });

  it('recusa sem header, com header torto e com corpo adulterado', async () => {
    const header = await sign(body, IG_SECRET);
    for (const h of [null, '', 'sha256=curto', 'nao-tem-prefixo', 'sha1=' + 'a'.repeat(64)]) {
      expect(await verifyInstagramSignature(body, h, IG_SECRET)).toBe(false);
    }
    expect(await verifyInstagramSignature(body + ' ', header, IG_SECRET)).toBe(false);
    expect(await verifyInstagramSignature(body.replace('apartamento', 'casa'), header, IG_SECRET)).toBe(false);
  });

  it('segredo ausente ou vazio nunca aceita e nunca explode', async () => {
    const header = await sign(body, IG_SECRET);
    for (const s of [undefined, null, '']) {
      expect(await verifyInstagramSignature(body, header, s)).toBe(false);
    }
  });

  it('isWellFormedSignatureHeader exige sha256= e 64 hex', async () => {
    expect(isWellFormedSignatureHeader(await sign('x', IG_SECRET))).toBe(true);
    expect(isWellFormedSignatureHeader('sha256=NAOEHEX'.padEnd(71, 'z'))).toBe(false);
    expect(isWellFormedSignatureHeader('sha1=' + 'a'.repeat(64))).toBe(false);
    expect(isWellFormedSignatureHeader(null)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
describe('eco — a resposta do próprio negócio nunca vira mensagem de cliente', () => {
  it('is_echo: true é eco', () => {
    expect(isEchoItem(IG_ECHO_PAYLOAD.entry[0].messaging[0], IGID)).toBe(true);
  });

  it('mensagem de cliente não é eco', () => {
    expect(isEchoItem(IG_PAYLOAD.entry[0].messaging[0], IGID)).toBe(false);
  });

  it('remetente = a própria conta é eco mesmo SEM a flag (rede de segurança)', () => {
    const semFlag = { sender: { id: IGID }, recipient: { id: IGSID }, message: { mid: 'm', text: 'x' } };
    expect(isEchoItem(semFlag, IGID)).toBe(true);
  });

  it('is_echo diferente de true não conta (string, 1, false)', () => {
    for (const v of ['true', 1, false]) {
      expect(isEchoItem(item({ mid: 'm', text: 'x', is_echo: v }), IGID)).toBe(false);
    }
  });

  it('o eco sai com isEcho e os ids intactos — quem resolve o cliente pelo recipient é a RPC', () => {
    const p = parseInstagramDelivery(IG_ECHO_PAYLOAD);
    expect(p.texts).toHaveLength(1);
    expect(p.texts[0]).toMatchObject({ isEcho: true, senderId: IGID, recipientId: IGSID, accountId: IGID });
    expect(toRpcArgs(p.texts[0])).toMatchObject({ p_is_echo: true, p_sender_id: IGID, p_recipient_id: IGSID });
  });
});

// -----------------------------------------------------------------------------
describe('parseInstagramDelivery — o formato medido pela sonda', () => {
  it('extrai conta, remetente, destinatário, mid e texto de uma mensagem de cliente', () => {
    const p = parseInstagramDelivery(IG_PAYLOAD);
    expect(p.object).toBe('instagram');
    expect(p.isInstagram).toBe(true);
    expect(p.skipped).toEqual([]);
    expect(p.texts).toEqual([
      {
        accountId: IGID, senderId: IGSID, recipientId: IGID, mid: MID, text: TEXTO, isEcho: false,
        metaTimestamp: '2026-05-08T07:02:02.476Z',
      },
    ]);
    expect(MID.length).toBe(164);
  });

  it('mapeia para os argumentos da RPC com os nomes do SQL', () => {
    expect(toRpcArgs(parseInstagramDelivery(IG_PAYLOAD).texts[0])).toEqual({
      p_ig_account_id: IGID,
      p_sender_id: IGSID,
      p_recipient_id: IGID,
      p_mid: MID,
      p_text: TEXTO,
      p_is_echo: false,
      p_meta_ts: '2026-05-08T07:02:02.476Z',
    });
  });

  it('não processa nada que não seja object=instagram (ex.: o formato do WhatsApp)', () => {
    const p = parseInstagramDelivery(WA_PAYLOAD);
    expect(p.isInstagram).toBe(false);
    expect(p.texts).toEqual([]);
    expect(p.skipped).toEqual([]);
  });

  it('várias entradas e vários itens saem na ordem de chegada', () => {
    const p = parseInstagramDelivery({
      object: 'instagram',
      entry: [
        { id: IGID, messaging: [item({ mid: 'm1', text: 'um' }), item({ mid: 'm2', text: 'dois' })] },
        { id: IGID, messaging: [item({ mid: 'm3', text: 'três' })] },
      ],
    });
    expect(p.texts.map((t) => t.mid)).toEqual(['m1', 'm2', 'm3']);
  });

  it('item sem mid, sem remetente ou sem conta vira malformed — nunca linha pela metade', () => {
    const p = parseInstagramDelivery({
      object: 'instagram',
      entry: [
        { id: IGID, messaging: [item({ text: 'sem mid' })] },
        { id: IGID, messaging: [{ recipient: { id: IGID }, message: { mid: 'm', text: 'sem sender' } }] },
        { messaging: [item({ mid: 'm', text: 'sem conta' })] },
      ],
    });
    expect(p.texts).toEqual([]);
    expect(p.skipped.map((s) => s.kind)).toEqual(['malformed', 'malformed', 'malformed']);
  });

  it('id numérico é recusado (perderia precisão no JSON.parse)', () => {
    const p = parseInstagramDelivery({
      object: 'instagram',
      entry: [{ id: IGID, messaging: [{ sender: { id: 978239761327698 }, recipient: { id: IGID }, message: { mid: 'm', text: 'x' } }] }],
    });
    expect(p.texts).toEqual([]);
    expect(p.skipped[0].kind).toBe('malformed');
  });

  it('não levanta com lixo, payload vazio ou tipos errados', () => {
    for (const bad of [null, undefined, 42, 'texto', [], {}, { object: 'instagram', entry: 'x' },
      { object: 'instagram', entry: [null, 42, { messaging: 'x' }, { messaging: [null, 'x', 7] }] }]) {
      expect(() => parseInstagramDelivery(bad)).not.toThrow();
      expect(parseInstagramDelivery(bad).texts).toEqual([]);
    }
  });
});

// -----------------------------------------------------------------------------
describe('classifyMessagingItem — tudo que não é texto fica de fora nesta fatia', () => {
  const casos: Array<[string, unknown, string]> = [
    ['texto', item({ mid: 'm', text: 'oi' }), 'text'],
    ['anexo (foto)', item({ mid: 'm', attachments: [{ type: 'image', payload: { url: 'u' } }] }), 'attachment'],
    ['anexo COM texto também fica de fora (não grava metade)', item({ mid: 'm', text: 'olha', attachments: [{ type: 'share' }] }), 'attachment'],
    ['resposta a story', item({ mid: 'm', text: 'que lindo', reply_to: { story: { id: 's', url: 'u' } } }), 'story_reply'],
    ['resposta a mensagem (texto normal)', item({ mid: 'm', text: 'sim', reply_to: { mid: 'outro' } }), 'text'],
    ['mensagem apagada', item({ mid: 'm', is_deleted: true }), 'deleted'],
    ['não suportada', item({ mid: 'm', is_unsupported: true }), 'unsupported'],
    ['texto só com espaços', item({ mid: 'm', text: '   ' }), 'empty'],
    ['edição', { sender: { id: IGSID }, message_edit: { mid: 'm', text: 'x' } }, 'edit'],
    ['leitura', { sender: { id: IGSID }, read: { mid: 'm' } }, 'read'],
    ['reação', { sender: { id: IGSID }, reaction: { mid: 'm', action: 'react', emoji: '❤' } }, 'reaction'],
    ['postback', { sender: { id: IGSID }, postback: { payload: 'x' } }, 'postback'],
    ['referral', { sender: { id: IGSID }, referral: { ref: 'x' } }, 'referral'],
    ['desconhecido', { sender: { id: IGSID }, algo_novo: {} }, 'other'],
    ['lixo', null, 'other'],
  ];

  for (const [nome, entrada, esperado] of casos) {
    it(`${nome} → ${esperado}`, () => {
      expect(classifyMessagingItem(entrada)).toBe(esperado);
    });
  }

  it('o que é pulado sai em skipped com o tipo, e nada vai para texts', () => {
    const p = parseInstagramDelivery({
      object: 'instagram',
      entry: [{ id: IGID, messaging: [
        item({ mid: 'a', attachments: [{ type: 'image' }] }),
        { sender: { id: IGSID }, reaction: {} },
        { sender: { id: IGSID }, read: { mid: 'x' } },
        item({ mid: 's', text: 'uau', reply_to: { story: { id: 's' } } }),
        item({ mid: 't', text: 'isso sim' }),
      ] }],
    });
    expect(p.texts.map((t) => t.mid)).toEqual(['t']);
    expect(p.skipped.map((s) => s.kind)).toEqual(['attachment', 'reaction', 'read', 'story_reply']);
  });
});

// -----------------------------------------------------------------------------
// O horário da Meta decide se um eco pode zerar as não lidas (migração
// 20260925000004). Errar para "sem horário" é seguro; errar para um horário
// inventado não é.
describe('parseMetaTimestamp — o horário da Meta de cada item', () => {
  // Relógio fixo: nada aqui depende do dia em que o teste roda.
  const NOW = Date.UTC(2026, 8, 25, 20, 0, 0);

  it('milissegundos viram ISO 8601 exato, sem perder o milissegundo', () => {
    expect(parseMetaTimestamp(1778223722476, NOW)).toBe('2026-05-08T07:02:02.476Z');
    expect(parseMetaTimestamp(NOW, NOW)).toBe('2026-09-25T20:00:00.000Z');
  });

  it('é o mesmo instante: ida e volta pelo Date dá o número original', () => {
    const iso = parseMetaTimestamp(1790179200123, NOW)!;
    expect(new Date(iso).getTime()).toBe(1790179200123);
  });

  it('valor em SEGUNDOS é recusado, não "consertado" por palpite de unidade', () => {
    expect(parseMetaTimestamp(1778223722, NOW)).toBeNull();
    expect(parseMetaTimestamp(Math.floor(NOW / 1000), NOW)).toBeNull();
  });

  it('faixa: de 2020-01-01 até um dia à frente do relógio, com as bordas incluídas', () => {
    expect(parseMetaTimestamp(META_TS_MIN_MS, NOW)).toBe('2020-01-01T00:00:00.000Z');
    expect(parseMetaTimestamp(META_TS_MIN_MS - 1, NOW)).toBeNull();
    expect(parseMetaTimestamp(NOW + META_TS_MAX_AHEAD_MS, NOW)).not.toBeNull();
    expect(parseMetaTimestamp(NOW + META_TS_MAX_AHEAD_MS + 1, NOW)).toBeNull();
  });

  it('só número inteiro: string (mesmo numérica), fração, NaN, infinito e lixo viram null', () => {
    for (const bad of ['1778223722476', '2026-05-08T07:02:02Z', 1778223722476.5, NaN, Infinity,
      -Infinity, -1778223722476, 0, 1, null, undefined, true, {}, [], 2 ** 60]) {
      expect(parseMetaTimestamp(bad, NOW)).toBeNull();
    }
  });

  it('o parser leva o horário de cada item, inclusive do eco', () => {
    const p = parseInstagramDelivery({
      object: 'instagram',
      entry: [{ id: IGID, messaging: [
        { ...IG_PAYLOAD.entry[0].messaging[0] },
        { ...IG_ECHO_PAYLOAD.entry[0].messaging[0] },
      ] }],
    }, NOW);
    expect(p.texts.map((t) => [t.isEcho, t.metaTimestamp])).toEqual([
      [false, '2026-05-08T07:02:02.476Z'],
      [true, '2026-05-08T07:03:19.999Z'],
    ]);
  });

  it('usa o timestamp do ITEM, não o entry[].time (hora do envio da notificação)', () => {
    const p = parseInstagramDelivery(IG_PAYLOAD, NOW);
    expect(IG_PAYLOAD.entry[0].time).not.toBe(IG_PAYLOAD.entry[0].messaging[0].timestamp);
    expect(p.texts[0].metaTimestamp).toBe(new Date(IG_PAYLOAD.entry[0].messaging[0].timestamp).toISOString());
  });

  it('item sem horário, ou com horário ruim, continua sendo gravado, só que com null', () => {
    const p = parseInstagramDelivery({
      object: 'instagram',
      entry: [{ id: IGID, messaging: [
        { sender: { id: IGSID }, recipient: { id: IGID }, message: { mid: 'sem-ts', text: 'a' } },
        item({ mid: 'ts-texto', text: 'b' }, { timestamp: '1778223722476' }),
        item({ mid: 'ts-segundos', text: 'c', is_echo: true }, { sender: { id: IGID }, recipient: { id: IGSID }, timestamp: 1778223722 }),
      ] }],
    }, NOW);
    expect(p.skipped).toEqual([]);
    expect(p.texts.map((t) => [t.mid, t.metaTimestamp])).toEqual([
      ['sem-ts', null], ['ts-texto', null], ['ts-segundos', null],
    ]);
    expect(toRpcArgs(p.texts[2])).toMatchObject({ p_is_echo: true, p_meta_ts: null });
    expect(summarizeForLog(p).withoutMetaTime).toBe(3);
  });

  it('a RPC recebe o horário como p_meta_ts, no eco também', () => {
    expect(toRpcArgs(parseInstagramDelivery(IG_ECHO_PAYLOAD, NOW).texts[0])).toMatchObject({
      p_is_echo: true,
      p_meta_ts: '2026-05-08T07:03:19.999Z',
    });
  });
});

// -----------------------------------------------------------------------------
describe('summarizeForLog — contagens, nunca conteúdo', () => {
  it('conta cliente, eco e descartes por tipo', () => {
    const p = parseInstagramDelivery({
      object: 'instagram',
      entry: [{ id: IGID, messaging: [
        ...IG_PAYLOAD.entry[0].messaging,
        ...IG_ECHO_PAYLOAD.entry[0].messaging,
        { sender: { id: IGSID }, read: { mid: 'x' } },
        { sender: { id: IGSID }, read: { mid: 'y' } },
      ] }],
    });
    expect(summarizeForLog(p)).toEqual({
      object: 'instagram',
      inbound: 1,
      echoes: 1,
      withoutMetaTime: 0,
      skippedKinds: { read: 2 },
      accounts: [IGID],
    });
  });

  // Se alguém acrescentar um campo que vaze, isto fica vermelho.
  it('o resumo serializado não contém o texto, o IGSID nem o mid', () => {
    const serial = JSON.stringify(summarizeForLog(parseInstagramDelivery({
      object: 'instagram',
      entry: [{ id: IGID, messaging: [...IG_PAYLOAD.entry[0].messaging, ...IG_ECHO_PAYLOAD.entry[0].messaging] }],
    })));
    expect(serial).not.toContain(TEXTO);
    expect(serial).not.toContain('interesse');
    expect(serial).not.toContain('resposta do atendente');
    expect(serial).not.toContain(IGSID);
    expect(serial).not.toContain(MID.slice(0, 20));
    // A conta do NEGÓCIO sai de propósito: explica um unknown_account.
    expect(serial).toContain(IGID);
  });

  // O EdgeLogger censura qualquer CHAVE cujo nome contenha um destes termos.
  it('nenhum nome de campo do resumo cai na lista de censura do logger', () => {
    const proibidos = ['apikey', 'password', 'token', 'secret', 'key', 'authorization'];
    const nomes: string[] = [];
    const varrer = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(varrer);
      if (v && typeof v === 'object') {
        for (const [k, val] of Object.entries(v)) {
          nomes.push(k);
          varrer(val);
        }
      }
    };
    varrer(summarizeForLog(parseInstagramDelivery(IG_PAYLOAD)));
    expect(nomes.length).toBeGreaterThan(0);
    for (const nome of nomes) {
      for (const proibido of proibidos) {
        expect(nome.toLowerCase()).not.toContain(proibido);
      }
    }
  });
});

/**
 * Link de notificação que o sino aceita abrir (item 14, lote 6).
 *
 * Mesma regra do trigger `tg_notifications_safe_action_url` no banco: só
 * `https://` com host, ou caminho relativo `/...` que não comece com `//` (isso
 * é outro site). Sem espaço, caractere de controle nem barra invertida — o
 * navegador lê `/\x.com` como `//x.com`. O banco já grava como NULL o que não
 * passa; aqui é a segunda tranca, para linha antiga ou gravada por fora.
 */
export type SafeNotificationLink =
  | { kind: 'internal'; path: string }
  | { kind: 'external'; href: string };

// eslint-disable-next-line no-control-regex
const PROIBIDO = /[\u0000-\u001f\u007f\s\\]/;

export function safeNotificationLink(url: string | null | undefined): SafeNotificationLink | null {
  if (typeof url !== 'string' || url.length === 0 || PROIBIDO.test(url)) return null;
  if (url.startsWith('/')) {
    return url.startsWith('//') ? null : { kind: 'internal', path: url };
  }
  if (/^https:\/\/[^/]/i.test(url)) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' ? { kind: 'external', href: parsed.href } : null;
    } catch {
      return null;
    }
  }
  return null;
}

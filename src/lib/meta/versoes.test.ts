/**
 * As versões da Meta fixadas em src/lib/meta/versoes.ts.
 *
 * Trocar de versão é decisão: muda este teste junto, depois de ler a página
 * oficial de versões da Graph API e o changelog do WhatsApp.
 */
import { describe, expect, it } from 'vitest';
import {
  INSTAGRAM_GRAPH_ROOT,
  META_EMBEDDED_SIGNUP_VERSION,
  META_GRAPH_ROOT,
  META_GRAPH_VERSION,
  extrasDoEmbeddedSignup,
} from './versoes';

describe('versões da Meta', () => {
  it('Graph API fixada na v26.0 (a v20.0 venceu em 24/09/2026)', () => {
    expect(META_GRAPH_VERSION).toBe('v26.0');
    expect(META_GRAPH_ROOT).toBe('https://graph.facebook.com/v26.0');
    expect(INSTAGRAM_GRAPH_ROOT).toBe('https://graph.instagram.com/v26.0');
  });

  it('Embedded Signup fixado na versão 4, na forma que a Meta documenta', () => {
    expect(META_EMBEDDED_SIGNUP_VERSION).toBe('v4');
    // v4: só `setup`. Sem `version` (a v4 não tem valor nesse campo), sem
    // `featureType` e sem `sessionInfoVersion` (a Meta ignora os dois na v4).
    expect(extrasDoEmbeddedSignup()).toStrictEqual({ setup: {} });
  });

  it('cada chamada devolve um objeto novo (ninguém altera o da próxima)', () => {
    expect(extrasDoEmbeddedSignup()).not.toBe(extrasDoEmbeddedSignup());
  });
});

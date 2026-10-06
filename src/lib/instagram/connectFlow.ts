/**
 * Conectar, reconectar, desligar e religar o Instagram pela tela (fatia 4b).
 *
 * Tudo aqui é puro, para o teste provar o que a tela faz sem montar a página.
 * Quem decide DE VERDADE é o servidor: a edge function `instagram-connect` e as
 * funções `instagram_connect_*` / `set_instagram_account_active` do banco
 * (migração 20260925000003). Estes helpers só escolhem o que mostrar.
 *
 * O caminho de volta: o Instagram devolve o navegador à edge function, que o
 * manda para esta tela com `?ig_state=…&ig_code=…` (ou `&ig_error=…`). A tela
 * lê os parâmetros, tira-os da barra de endereço e pede à edge function para
 * concluir, com a sessão de quem está logado.
 */
import { formatInstagramValidity } from '@/lib/instagram/connection';

/** Os mesmos nomes de CALLBACK_PARAMS em supabase/functions/instagram-connect/logic.ts. */
export const INSTAGRAM_CALLBACK_PARAMS = {
  code: 'ig_code',
  state: 'ig_state',
  error: 'ig_error',
  errorDescription: 'ig_error_description',
} as const;

export type InstagramCallback =
  | { kind: 'none' }
  | { kind: 'code'; code: string; state: string }
  | { kind: 'error'; error: string; description: string | null };

export function readInstagramCallback(search: string): InstagramCallback {
  const p = new URLSearchParams(search);
  const state = p.get(INSTAGRAM_CALLBACK_PARAMS.state);
  const code = p.get(INSTAGRAM_CALLBACK_PARAMS.code);
  const error = p.get(INSTAGRAM_CALLBACK_PARAMS.error);
  if (state === null && code === null && error === null) return { kind: 'none' };
  if (error) {
    return { kind: 'error', error, description: p.get(INSTAGRAM_CALLBACK_PARAMS.errorDescription) };
  }
  // O "#_" que o Instagram acrescenta nunca chega aqui (é fragmento), mas um
  // código colado à mão pode trazê-lo.
  const clean = (code ?? '').replace(/#.*$/, '').trim();
  if (!clean || !state) return { kind: 'error', error: 'missing_code', description: null };
  return { kind: 'code', code: clean, state };
}

/** A busca da URL sem os parâmetros do Instagram (o resto fica). */
export function withoutInstagramCallback(search: string): string {
  const p = new URLSearchParams(search);
  for (const k of Object.values(INSTAGRAM_CALLBACK_PARAMS)) p.delete(k);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function callbackErrorText(error: string): { title: string; description: string } {
  if (error === 'access_denied') {
    return {
      title: 'Conexão cancelada',
      description: 'Você cancelou a autorização no Instagram. Nada foi alterado.',
    };
  }
  return {
    title: 'Não foi possível conectar',
    description: 'O Instagram não devolveu a autorização. Nada foi alterado. Tente de novo pelo botão.',
  };
}

export interface InstagramConnectSuccess {
  mode: 'connect' | 'reconnect';
  instance: { name: string; profile_name: string | null; is_active: boolean; valid_until: string | null };
  username?: string | null;
}

/** Toast de sucesso: o que aconteceu, qual conta e até quando vale. */
export function connectSuccessText(r: InstagramConnectSuccess): { title: string; description: string } {
  const handle = r.username ? `@${r.username}` : r.instance.profile_name || r.instance.name;
  const t = r.instance.valid_until ? Date.parse(r.instance.valid_until) : NaN;
  const validity = Number.isNaN(t) ? '' : ` Válida até ${formatInstagramValidity(new Date(t))}.`;
  const off = r.instance.is_active
    ? ''
    : ' A conta continua desligada: clique em Religar no cartão para voltar a receber mensagens.';
  return r.mode === 'reconnect'
    ? { title: 'Instagram reconectado', description: `${handle} foi reconectada no mesmo cartão; o histórico continua.${validity}${off}` }
    : { title: 'Instagram conectado', description: `${handle} foi conectada a esta Loja.${validity}` };
}

/**
 * O que aparece na tela. `connectEnabled` vem de `instagram_connect_enabled`
 * (Loja + chave do superadmin + cargo + alcance); `canConfigure` é a
 * capability `whatsapp.configure`. Desligar/religar NÃO depende da chave:
 * desligar tem que funcionar sempre.
 */
export function instagramActions(p: { connectEnabled: boolean; canConfigure: boolean }): {
  showSection: boolean;
  showConnect: boolean;
  showReconnect: boolean;
  showToggle: boolean;
} {
  const connect = p.connectEnabled && p.canConfigure;
  return { showSection: connect, showConnect: connect, showReconnect: connect, showToggle: p.canConfigure };
}

/** A confirmação de desligar/religar — diz exatamente o que acontece. */
export function toggleConfirmText(p: { handle: string; turnOn: boolean }): {
  title: string;
  body: string[];
  action: string;
} {
  if (p.turnOn) {
    return {
      title: `Religar ${p.handle}?`,
      body: [
        'O ConvoFlow volta a receber as mensagens que chegarem a partir de agora e você volta a poder responder.',
        'As mensagens que chegaram enquanto a conta estava desligada não voltam.',
      ],
      action: 'Religar',
    };
  }
  return {
    title: `Desligar ${p.handle}?`,
    body: [
      'O histórico fica: conversas, mensagens e contatos continuam aqui.',
      'Enquanto estiver desligada, as mensagens que chegarem pelo Instagram NÃO entram no ConvoFlow e se perdem: não voltam quando você religar.',
      'Também não dá para responder por aqui, e a renovação automática do acesso para. Se ficar desligada até a validade, vai ser preciso reconectar.',
    ],
    action: 'Desligar',
  };
}

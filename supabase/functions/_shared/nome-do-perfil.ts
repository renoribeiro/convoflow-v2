// =============================================================================
// nome-do-perfil.ts — o nome que a pessoa usa no WhatsApp, quando ela escreve
// =============================================================================
// Sessão 2 do Lead novo (2026-11-16). O nome vai para public.receber_mensagem_whatsapp
// (20261116000002), que cria o contato novo já com ele e preenche o contato sem
// nome, sem nunca trocar o nome que a Loja digitou.
//
// Meta (.agent/skills/meta-cloud-api/SKILL.md §3.5): value.contacts[] traz
//   { profile: { name }, wa_id }, casado pelo wa_id com o from da mensagem.
// WAHA (.agent/skills/waha/SKILL.md §4.2): o formato oficial da mensagem NÃO tem
//   nome (conferido no responses.dto.ts do WAHA em 2026-11-16: from, author e
//   participant são ids). O nome só aparece em payload._data, o dado bruto do
//   motor, que o próprio WAHA avisa que pode mudar. Lemos os três motores pelo
//   nome do campo das bibliotecas de cada um: WEBJS (whatsapp-web.js,
//   _data.notifyName), NOWEB (Baileys, _data.pushName) e GOWS (whatsmeow,
//   _data.Info.PushName). Campo ausente = sem nome, nada quebra. Em 2026-11-16
//   não havia número WAHA em produção para conferir com mensagem real.
// Evolution: o pushName já vinha (evolution-webhook); aqui só a linha do
//   contato novo, que passa a levar a primeira mensagem.
//
// Sem I/O: o Vitest testa sem Deno.
// =============================================================================

const LIMITE = 120;

/** O nome limpo, ou null quando vazio ou quando é só o telefone. */
export function limparNomeDoPerfil(nome: unknown, telefone: string | null | undefined): string | null {
  if (typeof nome !== 'string') return null;
  // Caractere de controle vira espaço; espaços repetidos viram um.
  const semControle = Array.from(nome)
    .map((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c < 32 || c === 127 ? ' ' : ch;
    })
    .join('');
  const limpo = semControle.replace(/\s+/g, ' ').trim().slice(0, LIMITE).trim();
  if (!limpo) return null;
  const digitos = limpo.replace(/\D/g, '');
  const fone = String(telefone ?? '').replace(/\D/g, '');
  if (digitos && digitos === fone && digitos.length === limpo.replace(/[\s+()-]/g, '').length) return null;
  return limpo;
}

/** Meta: o profile.name do contato cujo wa_id é o from da mensagem. */
export function nomeDoPerfilMeta(value: unknown, from: unknown): string | null {
  const contatos = (value as { contacts?: unknown } | null)?.contacts;
  if (!Array.isArray(contatos) || typeof from !== 'string') return null;
  const fromDigitos = from.replace(/\D/g, '');
  const achado = contatos.find((c) => {
    const waId = (c as { wa_id?: unknown })?.wa_id;
    return typeof waId === 'string' && waId.replace(/\D/g, '') === fromDigitos;
  }) ?? (contatos.length === 1 ? contatos[0] : undefined);
  const nome = (achado as { profile?: { name?: unknown } } | undefined)?.profile?.name;
  return limparNomeDoPerfil(nome, fromDigitos);
}

/** WAHA: o nome no dado bruto do motor (WEBJS, NOWEB ou GOWS). */
export function nomeDoPerfilWaha(mensagem: unknown, telefone: string | null | undefined): string | null {
  const m = (mensagem ?? {}) as Record<string, unknown>;
  const bruto = (m._data ?? {}) as Record<string, unknown>;
  const info = (bruto.Info ?? {}) as Record<string, unknown>;
  for (const candidato of [bruto.notifyName, bruto.pushName, info.PushName]) {
    const nome = limparNomeDoPerfil(candidato, telefone);
    if (nome) return nome;
  }
  return null;
}

/** Evolution: a linha do contato novo, com o nome do perfil e a primeira mensagem. */
export function contatoNovoDaEvolution(p: {
  telefone: string;
  pushName: string | null | undefined;
  tenantId: string;
  instanciaId: string;
  primeiraMensagem: string | null | undefined;
}): {
  phone: string;
  name: string;
  name_source: 'whatsapp' | 'telefone';
  tenant_id: string;
  whatsapp_instance_id: string;
  first_message: string | null;
} {
  const nome = limparNomeDoPerfil(p.pushName, p.telefone);
  return {
    phone: p.telefone,
    // Sem nome no perfil, o telefone (como sempre foi): o Lead novo manda vazio.
    name: nome ?? p.telefone,
    // De onde veio o nome (contacts.name_source, 20261123000002): o chatbot só
    // troca nome que veio do perfil ou que é só o telefone.
    name_source: nome ? 'whatsapp' : 'telefone',
    tenant_id: p.tenantId,
    whatsapp_instance_id: p.instanciaId,
    first_message: p.primeiraMensagem ? p.primeiraMensagem : null,
  };
}

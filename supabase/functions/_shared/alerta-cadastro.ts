// =============================================================================
// alerta-cadastro (núcleo) — o email ao superadmin quando um email de login falha
// =============================================================================
// Sessão 2 do cadastro pelo site (migração 20261109000002). Cada falha nova em
// auth_email_failures põe um aviso no sino do superadmin e chama a edge function
// alerta-cadastro (no máximo uma vez a cada 30 minutos). Ela lê as falhas ainda
// não avisadas, manda UM email com o resumo e marca todas como avisadas.
//
// Sem Deno aqui: o Vitest testa a montagem (src/lib/signup/alertaCadastro.test.ts).
// =============================================================================

export interface FalhaDeEmail {
  id: string;
  source: string;
  reason: string;
  created_at: string;
}

const ORIGENS: Record<string, string> = {
  public_signup_invite: 'convite do cadastro pelo site',
  manage_user_invite: 'convite de alguém da equipe',
  manage_user_reset: 'nova senha pedida pela equipe',
  definir_senha_reset: 'nova senha pedida na tela de entrar',
};

const MOTIVOS: Record<string, string> = {
  quota: 'passou do limite de emails por hora',
  not_authorized: 'o servidor de email recusou o endereço',
  other: 'o servidor de email deu erro',
};

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** O assunto e o corpo do email. Nunca leva o endereço de quem se cadastrou. */
export function montarAlerta(falhas: FalhaDeEmail[], linkDosCadastros: string): { subject: string; html: string } {
  const grupos = new Map<string, number>();
  for (const f of falhas) {
    const chave = `${ORIGENS[f.source] ?? f.source}: ${MOTIVOS[f.reason] ?? f.reason}`;
    grupos.set(chave, (grupos.get(chave) ?? 0) + 1);
  }
  const total = falhas.length;
  const subject =
    total === 1 ? 'ConvoFlow: um email de login não saiu' : `ConvoFlow: ${total} emails de login não saíram`;
  const linhas = [...grupos.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([chave, n]) => `<li>${escapar(chave)} (${n})</li>`)
    .join('');
  const html = [
    '<p>Olá,</p>',
    `<p>${total === 1 ? 'Um email de convite ou de nova senha não foi enviado.' : `${total} emails de convite ou de nova senha não foram enviados.`}`,
    ' Quem se cadastrou pelo site pode estar esperando o email para criar a senha.</p>',
    `<ul>${linhas}</ul>`,
    '<p>Quando o motivo é o limite por hora, o envio volta sozinho na hora seguinte. ',
    'Se repetir, confira o envio de email no Supabase e no Resend (docs/RUNBOOK_trocar_envio_email.md).</p>',
    `<p><a href="${escapar(linkDosCadastros)}">Ver os cadastros</a></p>`,
    '<p>Este aviso sai no máximo uma vez a cada 30 minutos.</p>',
  ].join('');
  return { subject, html };
}

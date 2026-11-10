// =============================================================================
// emails-descartaveis — endereços temporários que não servem para criar Conta
// =============================================================================
// Usado pelo cadastro pelo site (public-signup.ts). Quem usa email de caixa
// temporária some depois do teste grátis: não recebe o aviso de cobrança, não
// lê o convite de novo e é o caminho mais barato para abrir Conta em série.
//
// COMO MANTER
//   Domínio novo entra em ordem alfabética, em minúsculas, sem "@". Subdomínio
//   não precisa: "algo.mailinator.com" já cai por "mailinator.com". Na dúvida
//   sobre um domínio que também serve gente de verdade (ex.: serviço de apelido
//   de email), deixe fora: barrar cliente é pior que deixar passar um robô, e o
//   Turnstile e os tetos continuam valendo. O teste
//   src/lib/signup/emailsDescartaveis.test.ts confere ordem, formato e repetição.
// =============================================================================

export const DOMINIOS_DESCARTAVEIS: readonly string[] = [
  '10mail.org',
  '10minutemail.co.uk',
  '10minutemail.com',
  '10minutemail.net',
  'anonbox.net',
  'armyspy.com',
  'burnermail.io',
  'cool.fr.nf',
  'courriel.fr.nf',
  'crazymailing.com',
  'cuvox.de',
  'dayrep.com',
  'deadaddress.com',
  'discard.email',
  'discardmail.com',
  'dispostable.com',
  'dropmail.me',
  'einrot.com',
  'email-fake.com',
  'emailfake.com',
  'emailondeck.com',
  'emltmp.com',
  'eyepaste.com',
  'fakeinbox.com',
  'fakemail.net',
  'fakemailgenerator.com',
  'fexbox.org',
  'fexpost.com',
  'fleckens.hu',
  'getairmail.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'gustr.com',
  'harakirimail.com',
  'inboxkitten.com',
  'incognitomail.org',
  'jetable.fr.nf',
  'jourrapide.com',
  'linshiyouxiang.net',
  'luxusmail.org',
  'mail-temp.com',
  'mail.tm',
  'mailcatch.com',
  'maildrop.cc',
  'mailexpire.com',
  'mailforspam.com',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mailnesia.com',
  'mailpoof.com',
  'mega.zik.dj',
  'mintemail.com',
  'minuteinbox.com',
  'mohmal.com',
  'moncourrier.fr.nf',
  'monemail.fr.nf',
  'monmail.fr.nf',
  'mytemp.email',
  'mytrashmail.com',
  'nada.email',
  'no-spam.ws',
  'nomail.xl.cx',
  'nospam.ze.tc',
  'oneoffemail.com',
  'pokemail.net',
  'rhyta.com',
  'sharklasers.com',
  'spam4.me',
  'spambog.com',
  'spamex.com',
  'spamfree24.org',
  'spamgourmet.com',
  'spamherelots.com',
  'speed.1s.fr',
  'superrito.com',
  'teleworm.us',
  'temp-mail.io',
  'temp-mail.org',
  'temp-mail.ru',
  'tempail.com',
  'tempemail.net',
  'tempinbox.com',
  'tempmail.com',
  'tempmail.dev',
  'tempmail.net',
  'tempmailaddress.com',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'tmpmail.net',
  'tmpmail.org',
  'trashmail.com',
  'trashmail.de',
  'trashmail.io',
  'trashmail.me',
  'trashmail.net',
  'wegwerfemail.de',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'zetmail.com',
];

const CONJUNTO = new Set(DOMINIOS_DESCARTAVEIS);

/** O endereço é de caixa temporária? Confere o domínio e todo domínio pai. */
export function emailDescartavel(email: string): boolean {
  const arroba = email.lastIndexOf('@');
  if (arroba < 0) return false;
  const partes = email.slice(arroba + 1).trim().toLowerCase().split('.');
  for (let i = 0; i < partes.length - 1; i++) {
    if (CONJUNTO.has(partes.slice(i).join('.'))) return true;
  }
  return false;
}

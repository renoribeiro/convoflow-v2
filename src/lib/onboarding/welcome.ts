/**
 * Texto da boas-vindas, por cargo. pt-BR, curto, segunda pessoa, sem hífen
 * nem travessão (o teste tours.test.ts confere todo texto de onboarding).
 */
import type { OnboardingRole } from './state';

export interface WelcomeCopy {
  intro: string;
  bullets: string[];
}

export const WELCOME_COPY: Record<OnboardingRole, WelcomeCopy> = {
  gerente: {
    intro: 'Você é Gerente da Conta. É você quem cria as Lojas, conecta os números e monta a equipe.',
    bullets: [
      'Separamos os primeiros passos numa lista aqui no Dashboard.',
      'Em cada passo, clique em Fazer agora e mostramos onde clicar na tela.',
      'Leva poucos minutos, e dá para parar e voltar quando quiser.',
    ],
  },
  gestor: {
    intro: 'Você é Gestor da Loja. É você quem conecta o número, chama os atendentes e deixa o atendimento pronto.',
    bullets: [
      'Separamos os primeiros passos numa lista aqui no Dashboard.',
      'Em cada passo, clique em Fazer agora e mostramos onde clicar na tela.',
      'Leva poucos minutos, e dá para parar e voltar quando quiser.',
    ],
  },
  atendente: {
    intro: 'Você atende as conversas da Loja pelo ConvoFlow.',
    bullets: [
      'Vamos mostrar a tela de Conversas em 4 passos rápidos.',
      'Depois, uma lista curta ajuda você a deixar seu perfil pronto.',
      'Se precisar, a Ajuda tem o passo a passo completo.',
    ],
  },
};

export function welcomeTitle(firstName: string | null | undefined): string {
  const nome = (firstName ?? '').trim();
  return nome ? `Olá, ${nome}! Que bom ter você aqui.` : 'Olá! Que bom ter você aqui.';
}

export const WELCOME_FOOTNOTE = 'Para ver isto de novo, abra a Ajuda e clique em Ver tutorial de novo.';

export const CHECKLIST_SUBTITLE: Record<OnboardingRole, string> = {
  gerente: 'Deixe a Conta pronta para atender. Os obrigatórios vêm primeiro.',
  gestor: 'Deixe a sua Loja pronta para atender. Os obrigatórios vêm primeiro.',
  atendente: 'Três passos rápidos para deixar seu perfil pronto.',
};

export const CHECKLIST_DONE_TITLE = 'Tudo pronto por aqui';
export const CHECKLIST_DONE_BODY = 'O básico está configurado. Se quiser rever algo, a Ajuda tem todos os tutoriais.';

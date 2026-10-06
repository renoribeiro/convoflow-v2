import { z } from 'zod';

/**
 * Formulário do cadastro pelo site (/cadastro).
 *
 * É a validação de CORTESIA, para a pessoa ver o erro antes de enviar. Quem
 * decide é o servidor (validateSignupBody em
 * supabase/functions/_shared/public-signup.ts), com as mesmas regras:
 * src/lib/signup/publicSignupHandler.test.ts compara os dois lados.
 */
const nome = (vazio: string) =>
  z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, vazio).max(80, 'Use no máximo 80 caracteres.'));

export const publicSignupSchema = z.object({
  firstName: nome('Informe seu nome.'),
  lastName: nome('Informe seu sobrenome.'),
  email: z
    .string()
    .transform((v) => v.trim().toLowerCase())
    .pipe(
      z
        .string()
        .min(1, 'Informe seu e-mail.')
        .max(254, 'E-mail longo demais.')
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Informe um e-mail válido.'),
    ),
  companyName: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .min(2, 'Informe o nome da empresa.')
        .max(120, 'Use no máximo 120 caracteres.'),
    ),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(
      z
        .string()
        .min(10, 'Informe um telefone com DDD.')
        .max(13, 'Telefone longo demais.'),
    ),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({
      message: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.',
    }),
  }),
});

export type PublicSignupInput = z.input<typeof publicSignupSchema>;
export type PublicSignupData = z.output<typeof publicSignupSchema>;

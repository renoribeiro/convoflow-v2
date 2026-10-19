/**
 * /login é a MESMA tela de /auth.
 *
 * Até 2026-10-19 este arquivo era uma segunda tela de login, antiga: sem
 * "Esqueci minha senha", com "Criar conta" apontando para /register e textos
 * diferentes dos de /auth. O link "Entrar" do rodapé da página de vendas cai
 * aqui, então quem esquecia a senha por esse caminho não tinha saída.
 *
 * Uma tela só: qualquer mudança no login vale para os dois endereços.
 * src/test/appRoutes.test.tsx confere que /login abre a tela de /auth.
 */
export { Auth as default } from './Auth';

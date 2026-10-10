import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright roda contra o servidor de desenvolvimento do Vite (porta 8080).
 * Cobre a superfície pública (landing, /auth, rotas legais, 404) — clique real
 * no navegador. O dashboard exige sessão do Supabase e é coberto pelos testes
 * de componente do Vitest (jsdom + userEvent), que também clicam de verdade.
 *
 * CONTRA UM SITE JÁ NO AR. `E2E_BASE_URL=https://...` troca o alvo (Preview do
 * Vercel, produção ou `vite preview` do build) e dispensa o servidor local.
 * Preview do Vercel exige login: gere o cookie com o link de acesso
 * temporário e passe o arquivo em `E2E_STORAGE_STATE`. O backend continua
 * falso (e2e/support/supabaseMock.ts): nada chega ao Supabase real.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8080';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    storageState: process.env.E2E_STORAGE_STATE || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:8080',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

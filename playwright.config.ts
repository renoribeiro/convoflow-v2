import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright roda contra o servidor de desenvolvimento do Vite (porta 8080).
 * Cobre a superfície pública (landing, /auth, rotas legais, 404) — clique real
 * no navegador. O dashboard exige sessão do Supabase e é coberto pelos testes
 * de componente do Vitest (jsdom + userEvent), que também clicam de verdade.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

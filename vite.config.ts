import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// `import.meta.env` lido INTEIRO (sem `.CHAVE`), em qualquer arquivo, inclusive
// de dependência, faz o Vite colar no bundle o objeto com TODAS as variáveis
// VITE_*. No Vercel isso inclui as que ele cria sozinho, como
// VITE_VERCEL_GIT_COMMIT_AUTHOR_LOGIN / _NAME: o nome de quem fez o commit ia
// para o JavaScript do site. Foi o devtools do zustand, até 2026-10-08. O site
// lê só as chaves de que precisa (src/lib/env.ts); este guarda derruba o build
// se o objeto inteiro voltar a aparecer.
const WHOLE_ENV_OBJECT = /["']?BASE_URL["']?\s*:\s*["'][^"']*["']\s*,\s*["']?DEV["']?\s*:/;

const guardWholeEnvObject = (): Plugin => ({
  name: 'convoflow:sem-import-meta-env-inteiro',
  apply: 'build',
  generateBundle(_options, bundle) {
    const culpados = Object.values(bundle)
      .filter((item) => item.type === 'chunk' && WHOLE_ENV_OBJECT.test(item.code))
      .map((item) => item.fileName);
    if (culpados.length > 0) {
      this.error(
        `import.meta.env inteiro foi embutido em: ${culpados.join(', ')}. ` +
          'Leia cada chave pelo nome (import.meta.env.VITE_X) ou ache a dependência que lê o objeto todo.',
      );
    }
  },
});

// Required environment variables for production builds
const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
];

// Optional but recommended environment variables
const RECOMMENDED_ENV_VARS = [
  'VITE_ENVIRONMENT',
  'VITE_APP_NAME',
];

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), '');

  // Validate required environment variables in production
  if (mode === 'production') {
    const missingVars = REQUIRED_ENV_VARS.filter(key => !env[key]);

    if (missingVars.length > 0) {
      throw new Error(
        `\n❌ Missing required environment variables for production build:\n` +
        `   ${missingVars.join('\n   ')}\n\n` +
        `Please add these to your .env file or Vercel environment variables.\n`
      );
    }

    // Warn about recommended variables
    const missingRecommended = RECOMMENDED_ENV_VARS.filter(key => !env[key]);
    if (missingRecommended.length > 0) {
      console.warn(
        `\n⚠️  Missing recommended environment variables:\n` +
        `   ${missingRecommended.join('\n   ')}\n`
      );
    }
  }

  return {
    server: {
      // Só a própria máquina: o Vite 5 tem falhas de leitura de arquivo no
      // servidor de desenvolvimento (corrigidas só no Vite 6). Sem host "::"
      // e sem túnel (ngrok/loca.lt) — o padrão do Vite já aceita localhost.
      host: "localhost",
      port: 8080,
    },
    plugins: [
      react(),
      mode === 'development' && componentTagger(),
      // PWA Plugin - only in production
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'robots.txt'],
        manifest: {
          name: 'ConvoFlow - WhatsApp Automation',
          short_name: 'ConvoFlow',
          description: 'Complete WhatsApp Business automation and management platform',
          theme_color: '#DAE27C',
          background_color: '#F9F9ED',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          // Cache strategies
          runtimeCaching: [
            {
              // DO NOT cache realtime/websocket connections, auth, or edge functions
              urlPattern: /^https:\/\/.*\.supabase\.co\/(realtime|auth|functions)\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              // Cloudflare Turnstile (cadastro pelo site): o script e o desafio
              // são sempre da rede. Verificação anti-robô não se guarda em cache.
              urlPattern: /^https:\/\/challenges\.cloudflare\.com\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              // Cache REST API and Storage requests
              urlPattern: /^https:\/\/.*\.supabase\.co\/(rest|storage)\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24, // 24 hours
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Cache images
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
            {
              // Cache fonts
              urlPattern: /\.(?:woff|woff2|ttf|eot)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
              },
            },
          ],
          // Clean old caches
          cleanupOutdatedCaches: true,
          // Skip waiting
          skipWaiting: true,
          // Clients claim
          clientsClaim: true,
        },
        devOptions: {
          enabled: false, // Disable in development
        },
      }),
      guardWholeEnvObject(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // Build optimizations
    build: {
      // Warn if chunks exceed 500KB
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          // Split vendor chunks for better caching
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-toast'],
            'vendor-query': ['@tanstack/react-query'],
            'vendor-supabase': ['@supabase/supabase-js'],
          },
        },
      },
    },
  };
});

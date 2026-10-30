import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import cores from "./eslint-rules/sem-cor-fixa.js";

/**
 * Cor fixa (lote 7 do checkup, "Cores e tema escuro"): toda cor do app sai
 * dos tokens da marca (src/index.css, tailwind.config.ts), que trocam sozinhos
 * entre o tema claro e o escuro. A regra está em eslint-rules/sem-cor-fixa.js.
 *
 * Estes são os ÚNICOS arquivos onde cor escrita à mão é legítima, cada um com
 * o motivo. Arquivo novo aqui é decisão de design: passa por revisão no PR.
 */
const ARQUIVOS_LIBERADOS = [
  // Cor que a pessoa escolhe para etapa e etiqueta, as cores de categoria do
  // chatbot e da automação, e o ajuste que deixa todas legíveis nos dois temas.
  "src/lib/cores/**",
  // Etapas do funil: lê a cor gravada (nome, código ou classe antiga).
  "src/lib/funnel/corDaEtapa.ts",
  // Campo de cor da etiqueta: o exemplo do campo é um código de cor.
  "src/components/etiquetas/ColorPaletteInput.tsx",
  // Logo do Instagram: a cor é a da marca deles, nos dois temas.
  "src/components/conversations/ChannelLogo.tsx",
];

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-unused-expressions": [
        "error",
        {
          allowShortCircuit: true,
          allowTernary: true,
          allowTaggedTemplates: true
        }
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      ...ARQUIVOS_LIBERADOS,
      // Testes conferem as próprias cores (fixtures com etiqueta, tinta legível).
      "src/**/*.test.{ts,tsx}",
      "src/**/*.spec.{ts,tsx}",
      "src/test/**",
      // Tipos gerados do banco.
      "src/integrations/supabase/types.ts",
    ],
    plugins: { cores },
    rules: { "cores/sem-cor-fixa": "error" },
  }
);

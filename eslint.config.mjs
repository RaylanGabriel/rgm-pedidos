// ESLint (flat config) com as regras oficiais do Next 16: Core Web Vitals + TypeScript.
// Rodar: npm run lint
import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Aviso, não erro: o padrão "depois de montar, ler o que ficou salvo no aparelho (carrinho, dados do cliente,
      // som da cozinha) e pôr no estado" é intencional — evita a página do servidor e a do navegador ficarem diferentes.
      // Código novo deve preferir useSyncExternalStore ou calcular na renderização.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([
    // Gerados por build/ferramentas
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
    // Componentes prontos do shadcn/ui (código de terceiros, copiado do modelo)
    "components/ui/**",
    "hooks/**",
  ]),
])

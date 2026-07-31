import { defineAgent } from "eve";

export default defineAgent({
  // Modelo vía Vercel AI Gateway. En el deployment se autentica con OIDC del
  // proyecto, así que producción no necesita ninguna API key de proveedor.
  //
  // Elegido por precio: el presupuesto del proyecto es menos de $1 USD/mes y
  // Sonnet 5 proyectaba $3–4. M2.7 cuesta $0.30/$1.20 por millón de tokens
  // contra los $2/$10 de Sonnet 5 — 7.4× menos, y 11× menos a partir del
  // 2026-09-01, cuando termina el precio de introducción de Sonnet.
  //
  // El trabajo aquí es agregar, contar y formatear datos de Jira, no
  // razonamiento profundo, así que la capacidad sobra. Lo que sí importa es
  // que encadene tool calls contra el MCP de Atlassian sin perderse: M2.7 está
  // hecho para trabajo agéntico y el catálogo lo marca con `tool-use`.
  //
  // Ojo con el contexto: 205K en vez del millón de Sonnet 5. Para un standup
  // sobra, y eve compacta solo al 90%, pero si algún día el proyecto crece
  // mucho hay alternativas con 1M igual de baratas (`deepseek/deepseek-v4-flash`,
  // `alibaba/qwen3.7-flash`).
  model: "minimax/minimax-m2.7",

  // Tope de gasto por sesión. Un standup real consume una fracción de esto; el
  // límite existe para que un loop de tools o un thread que se va de las manos
  // no se convierta en una factura sorpresa.
  limits: {
    maxInputTokensPerSession: 2_000_000,
    maxOutputTokensPerSession: 200_000,
  },
});

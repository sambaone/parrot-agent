import { defineAgent } from "eve";

export default defineAgent({
  // Modelo vía Vercel AI Gateway. En el deployment se autentica con OIDC del
  // proyecto, así que producción no necesita ninguna API key de proveedor.
  // Sonnet 5 es el punto correcto de costo/calidad aquí: el trabajo es agregar,
  // contar y formatear datos de Jira, no razonamiento profundo.
  model: "anthropic/claude-sonnet-5",

  // Tope de gasto por sesión. Un standup real consume una fracción de esto; el
  // límite existe para que un loop de tools o un thread que se va de las manos
  // no se convierta en una factura sorpresa.
  limits: {
    maxInputTokensPerSession: 2_000_000,
    maxOutputTokensPerSession: 200_000,
  },
});

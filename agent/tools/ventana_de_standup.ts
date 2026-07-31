import { defineTool } from "eve/tools";
import { z } from "zod";

import { optionalEnv, requiredEnv } from "../lib/env";
import { ventanaDeStandup } from "../lib/fechas";

/**
 * El modelo no tiene un reloj confiable, y el standup depende de fechas exactas
 * ("completadas ayer", "sin movimiento >3 días") en hora de CDMX. Esta tool es
 * la única fuente de verdad para esas fechas y para la clave del proyecto.
 *
 * También entrega el `cloudId` de Jira. No es un dato de fechas, pero sí lo
 * único que el agente necesita saber antes de poder consultar Jira, y esta tool
 * ya es la primera llamada obligatoria de cada sesión.
 *
 * El motivo es medido, no estético: en Observability, las sesiones que llegaban
 * sin el cloudId gastaban entre 6 y 20 tool calls tanteando
 * (`connection_search`, `jira__getAccessibleResources`, búsquedas que fallan con
 * "no tengo permiso para ese cloud id") antes de acertar. El peor caso observado
 * el 2026-07-30 fueron 27 llamadas y 22 minutos para un standup que, con el
 * cloudId ya en contexto, tomó 7 llamadas y 40 segundos.
 */
export default defineTool({
  description:
    "Devuelve el cloudId y la clave del proyecto de Jira, más las fechas de " +
    "referencia del standup en hora de Ciudad de México: hoy, el día hábil " +
    "anterior (el lunes apunta al viernes previo) y la fecha de corte para " +
    "tickets estancados. Llámala SIEMPRE antes de consultar Jira: nunca " +
    "adivines la fecha de hoy, la clave del proyecto ni el cloudId.",
  inputSchema: z.object({}),
  execute() {
    // Opcional a propósito: si falta, el agente sigue pudiendo descubrir el
    // cloudId como antes. Un deployment sin esta variable trabaja de más, pero
    // no se rompe.
    const cloudId = optionalEnv("JIRA_CLOUD_ID");

    return {
      claveDelProyecto: requiredEnv(
        "JIRA_PROJECT_KEY",
        "Es la clave del proyecto de Jira a resumir, ej. PROY.",
      ),
      ...(cloudId ? { cloudId } : {}),
      ...ventanaDeStandup(new Date()),
    };
  },
});

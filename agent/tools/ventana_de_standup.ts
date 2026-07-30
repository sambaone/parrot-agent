import { defineTool } from "eve/tools";
import { z } from "zod";

import { requiredEnv } from "../lib/env";
import { ventanaDeStandup } from "../lib/fechas";

/**
 * El modelo no tiene un reloj confiable, y el standup depende de fechas exactas
 * ("completadas ayer", "sin movimiento >3 días") en hora de CDMX. Esta tool es
 * la única fuente de verdad para esas fechas y para la clave del proyecto.
 */
export default defineTool({
  description:
    "Devuelve la clave del proyecto de Jira y las fechas de referencia del " +
    "standup en hora de Ciudad de México: hoy, el día hábil anterior (el lunes " +
    "apunta al viernes previo) y la fecha de corte para tickets estancados. " +
    "Llámala SIEMPRE antes de consultar Jira: nunca adivines la fecha de hoy ni " +
    "la clave del proyecto.",
  inputSchema: z.object({}),
  execute() {
    return {
      claveDelProyecto: requiredEnv(
        "JIRA_PROJECT_KEY",
        "Es la clave del proyecto de Jira a resumir, ej. PROY.",
      ),
      ...ventanaDeStandup(new Date()),
    };
  },
});

import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

import { requiredEnv } from "../lib/env";

/**
 * Servidor MCP oficial de Atlassian. El nombre del archivo define el nombre en
 * runtime, así que las tools llegan al modelo como `jira__<tool>`.
 *
 * Notas de diseño:
 *
 * - **User-scoped, no app-scoped.** No es una preferencia: el conector de
 *   Atlassian en Vercel Connect reporta `supportedSubjectTypes: ["user"]`, o
 *   sea que no puede emitir un token de aplicación. Una persona autoriza Jira
 *   una vez desde Slack y ese grant queda guardado en Connect.
 * - **El cron reutiliza ese grant.** Como no hay token de app, el schedule
 *   despacha con el principal de esa persona en lugar de `appAuth`; ver
 *   `lib/slack-principal.ts` para el detalle y la advertencia de versión.
 * - **`auth` como función.** Diferir la lectura del entorno hasta la primera
 *   llamada mantiene el arranque de `eve dev` sano antes de que exista el
 *   conector, en lugar de tumbar el servidor al cargar el módulo.
 * - **Sin tokens en código.** Vercel Connect es dueño del consentimiento, el
 *   almacenamiento cifrado y el refresh; el modelo nunca ve la URL ni el token.
 * - **La escritura está abierta.** No hay `tools.allow` ni `approval`: los
 *   nombres de las tools los publica el servidor de Atlassian, no nosotros, y el
 *   token hereda los permisos de Jira de quien autorizó. O sea que el agente
 *   puede crear y modificar tickets. Lo único que lo acota son las
 *   instrucciones (`instructions.md` → "Escritura en Jira"): escribe solo si se
 *   lo piden, y para tickets nuevos pregunta antes si van al backlog o al sprint
 *   activo.
 */
export default defineMcpClientConnection({
  url: "https://mcp.atlassian.com/v1/mcp",
  description:
    "Jira del equipo: issues, estados, asignados, sprints, comentarios e " +
    "historial de cambios. Úsala para cualquier dato del proyecto: qué está " +
    "pendiente, en progreso, en review, bloqueado o completado, quién es el " +
    "responsable y cuándo se movió por última vez un ticket. Acepta búsquedas JQL.",
  auth: () =>
    connect({
      connector: requiredEnv(
        "JIRA_CONNECTOR_UID",
        "Es el UID del conector de Vercel Connect para Atlassian, ej. " +
          "mcp.atlassian.com/jira. Lo devuelve `vercel connect create mcp.atlassian.com --name jira`.",
      ),
      principalType: "user",
    }),
});

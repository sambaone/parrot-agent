import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

import { requiredEnv } from "../lib/env";

/**
 * Servidor MCP oficial de Atlassian. El nombre del archivo define el nombre en
 * runtime, así que las tools llegan al modelo como `jira__<tool>`.
 *
 * Notas de diseño:
 *
 * - **App-scoped, no user-scoped.** El standup diario lo dispara un schedule con
 *   el principal de la aplicación (`appAuth`), que no es un usuario. Una conexión
 *   user-scoped (`connect("<uid>")`, el default) fallaría ahí con
 *   `principal_required` porque no hay nadie a quien pedirle OAuth. Con
 *   `principalType: "app"` la conexión usa un token compartido del agente y
 *   funciona igual desde el cron y desde una pregunta en Slack.
 * - **`auth` como función.** Diferir la lectura del entorno hasta la primera
 *   llamada mantiene el arranque de `eve dev` sano antes de que exista el
 *   conector, en lugar de tumbar el servidor al cargar el módulo.
 * - **Sin tokens en código.** Vercel Connect es dueño del consentimiento, el
 *   almacenamiento cifrado y el refresh; el modelo nunca ve la URL ni el token.
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
      principalType: "app",
    }),
});

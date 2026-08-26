import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

import { requiredEnv } from "../lib/env";

/**
 * Nombres de tool que se deniegan siempre.
 *
 * ## Por qué por patrón y no por lista
 *
 * El catálogo de tools lo publica Atlassian y cambia sin avisarnos, así que una
 * lista de nombres exactos (`tools.block: ["deleteJiraIssue", ...]`) envejece
 * mal: el día que agreguen `bulkDeleteIssues`, el candado no lo cubre y nadie
 * se entera. El patrón cubre lo que todavía no existe.
 *
 * `delete` y `destroy` se buscan en cualquier parte del nombre porque ninguna
 * tool de lectura se llama así. `remove`, `archive`, `purge` y `trash` solo al
 * principio: como verbo inicial describen la acción, pero en medio pueden ser
 * parte de un sustantivo inocente (`searchArchivedPages`), y denegar una
 * lectura por error es un fallo silencioso difícil de rastrear.
 */
const DESTRUCTIVA_EN_CUALQUIER_PARTE = /delete|destroy/iu;
const DESTRUCTIVA_COMO_VERBO_INICIAL = /^(remove|archive|purge|trash)/iu;

/**
 * `toolName` llega calificado (`jira__deleteJiraIssue`), así que hay que
 * quedarse con el nombre que publica el servidor antes de compararlo.
 */
export function esDestructiva(toolName: string): boolean {
  const nombre = toolName.split("__").at(-1) ?? toolName;
  return (
    DESTRUCTIVA_EN_CUALQUIER_PARTE.test(nombre) ||
    DESTRUCTIVA_COMO_VERBO_INICIAL.test(nombre)
  );
}

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
 * - **Se puede escribir, menos borrar.** El token hereda los permisos de Jira
 *   de quien autorizó, así que el agente puede crear y modificar tickets. Lo
 *   único cerrado con llave es el borrado: lo deniega `esDestructiva` aquí
 *   abajo, antes de que la tool corra. Todo lo demás lo acotan las
 *   instrucciones (`instructions.md` → "Quién puede pedir qué"), que es una
 *   frontera más blanda: describe una regla que el modelo sigue, no una que el
 *   runtime imponga.
 */
export default defineMcpClientConnection({
  url: "https://mcp.atlassian.com/v1/mcp",
  description:
    "Jira del equipo: issues, estados, asignados, sprints, comentarios e " +
    "historial de cambios. Úsala para cualquier dato del proyecto: qué está " +
    "pendiente, en progreso, en review, bloqueado o completado, quién es el " +
    "responsable y cuándo se movió por última vez un ticket. Acepta búsquedas JQL.",
  /**
   * Borrar no se puede, y no es una regla que el modelo pueda decidir saltarse:
   * `denied` corta la llamada antes de que salga hacia Atlassian.
   *
   * Un borrado en Jira no tiene deshacer y se lleva por delante comentarios,
   * adjuntos e historial. El equipo entero puede pedirle cosas a este agente
   * desde Slack, así que la operación que no admite corrección es la que no
   * puede depender de que el modelo interprete bien una instrucción.
   *
   * `not-applicable` para todo lo demás: crear, editar y comentar pasan sin
   * fricción, y quién puede editar qué lo resuelven las instrucciones con
   * `quien_pregunta`.
   */
  approval: ({ toolName }) =>
    esDestructiva(toolName)
      ? {
          type: "denied",
          reason:
            `La tool \`${toolName}\` está bloqueada: este agente no borra nada ` +
            `en Jira, y el bloqueo no se puede levantar desde la conversación. ` +
            `Dilo en una línea y ofrece cerrar el ticket como "Won't Do" en su ` +
            `lugar; si de verdad hay que borrarlo, va a mano en Jira.`,
        }
      : "not-applicable",
  auth: () =>
    connect({
      // Este conector se crea a mano (`vercel connect create`) y se attachea al
      // proyecto una sola vez; el repo no lo aprovisiona en runtime.
      //
      // Sin este `false`, cada petición de token empieza por un
      // `POST /v1/connect/connectors/managed/oauth` que crea el conector si no
      // existiera. En este equipo ese POST responde 403 "Project OIDC connector
      // provisioning is not allowed", y el error se lleva por delante la
      // petición de token completa: el conector existe y el grant está vivo,
      // pero nunca se llega a pedir el token.
      //
      // Así se rompió el standup del 2026-08-25. La versión del SDK lleva
      // fijada en 0.4.2 desde el 2026-07-29, así que lo que cambió fue la
      // política del lado de Vercel, no el código. Saltarse el aprovisionamiento
      // no pierde nada aquí y quita la dependencia de esa política.
      autoProvision: false,
      connector: requiredEnv(
        "JIRA_CONNECTOR_UID",
        "Es el UID del conector de Vercel Connect para Atlassian, ej. " +
          "mcp.atlassian.com/jira. Lo devuelve `vercel connect create mcp.atlassian.com --name jira`.",
      ),
      principalType: "user",
    }),
});

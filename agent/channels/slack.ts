import { connectSlackCredentials } from "@vercel/connect/eve";
import { slackChannel } from "eve/channels/slack";

import { requiredEnvInProduction } from "../lib/env";
import { standupSlackPrincipal } from "../lib/slack-principal";

/**
 * Canal de Slack del standup.
 *
 * Las credenciales (bot token de salida y verificación de webhooks de entrada)
 * las resuelve Vercel Connect: no hay `SLACK_BOT_TOKEN` ni signing secret que
 * manejar en código ni en el entorno.
 */
export default slackChannel({
  credentials: connectSlackCredentials(
    requiredEnvInProduction(
      "SLACK_CONNECTOR_UID",
      "Es el UID del conector de Vercel Connect para Slack, ej. " +
        "slack/standup-agent. Lo devuelve `vercel connect create slack --triggers`.",
      "slack/standup-agent",
    ),
  ),

  // Inyecta las respuestas previas del thread, solo lo nuevo desde la última
  // respuesta del agente. Sin esto el agente ve la mención pero no el standup
  // que él mismo posteó arriba, y las preguntas de seguimiento pierden contexto.
  threadContext: { since: "last-agent-reply" },

  /**
   * ## Cuándo responde: solo mención explícita o DM
   *
   * Antes esta condición incluía `ctx.isSubscribed()`, con la idea de poder
   * seguir preguntando en el thread del standup sin volver a mencionar al bot.
   * En la práctica eso lo volvió intrusivo: `isSubscribed()` comprueba si el
   * mensaje pertenece a un thread con sesión activa, y el standup diario se
   * postea AL CANAL, no a un thread. La sesión queda ligada al canal entero, así
   * que cualquier mensaje suelto ahí calificaba y el bot se metía en
   * conversaciones que no eran con él.
   *
   * El precio de quitarlo es que las preguntas de seguimiento dentro del thread
   * también necesitan `@`. Es un precio aceptado a cambio de que el canal esté
   * en silencio salvo que alguien lo llame.
   *
   * ## Por qué siempre adjunta el principal del standup
   *
   * `auth: null` deja la sesión SIN principal de usuario, y como la conexión a
   * Jira es user-scoped (el conector de Atlassian no emite tokens de
   * aplicación), toda llamada a Jira moriría con
   * `ConnectionAuthorizationFailedError ... reason: "principal_required"`.
   *
   * Pero adjuntar el principal de QUIEN ESCRIBE —lo que hace `defaultSlackAuth`
   * y lo que hacía este handler— tiene un efecto que en un canal de equipo no
   * se quiere: cada persona nueva que le habla al bot es, para Vercel Connect,
   * un usuario sin grant, y recibe una pantalla de OAuth de Atlassian en vez de
   * una respuesta.
   *
   * Por eso todas las sesiones corren bajo el principal de
   * `STANDUP_AS_SLACK_USER_ID`, el mismo que ya usa el cron. Nadie más tiene que
   * autorizar nada.
   *
   * **La contrapartida, explícita:** cualquiera que pueda escribirle al bot lee
   * Jira con los permisos de esa persona, y Jira no distingue quién preguntó.
   * Si algún día el canal deja de ser de confianza, esto se revierte volviendo a
   * `defaultSlackAuth(message, ctx)` y asumiendo el OAuth por persona.
   */
  async onMessage(ctx, message) {
    // Sin autor no hay nada que atender (mensajes de sistema, ediciones).
    if (!message.author || message.author.isBot) return null;

    const esDirecto = message.raw.channel_type === "im";
    if (!esDirecto && !ctx.isBotMentioned()) return null;

    // Los handlers default hacen esto; al sobrescribirlos hay que replicarlo.
    await ctx.thread.startTyping("Pensando...");

    return { auth: standupSlackPrincipal(message.channelId) };
  },
});

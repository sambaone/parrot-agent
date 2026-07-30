import { connectSlackCredentials } from "@vercel/connect/eve";
import { defaultSlackAuth, slackChannel } from "eve/channels/slack";

import { requiredEnvInProduction } from "../lib/env";

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
   * Permite seguir la conversación sin volver a mencionar al bot: contesta en
   * DMs, cuando lo mencionan, y en cualquier thread que ya tenga una sesión
   * activa — que es el caso del thread del standup diario.
   *
   * ## Por qué devuelve `defaultSlackAuth` y no `{ auth: null }`
   *
   * `auth: null` deja la sesión SIN principal de usuario. La conexión a Jira es
   * user-scoped (el conector de Atlassian no emite tokens de aplicación), así
   * que sin usuario toda llamada a Jira muere con
   * `ConnectionAuthorizationFailedError ... reason: "principal_required"`.
   *
   * Ese es justo el bug que rompió la primera prueba en Slack: definir
   * `onMessage` también reemplaza los handlers default de menciones y DMs, que
   * son los que normalmente adjuntan el principal del remitente. Al tomar el
   * control hay que adjuntarlo a mano.
   *
   * `defaultSlackAuth` arma el mismo principal (`slack:<team>:<user>` con
   * `issuer: slack:<team>`) que reproduce `lib/slack-principal.ts` para el cron,
   * así que la autorización de Atlassian que se otorga desde Slack es la misma
   * que reutiliza el standup automático.
   */
  async onMessage(ctx, message) {
    // Sin autor no hay principal que adjuntar (mensajes de sistema, ediciones).
    if (!message.author || message.author.isBot) return null;

    const esDirecto = message.raw.channel_type === "im";
    const debeResponder =
      esDirecto || ctx.isBotMentioned() || (await ctx.isSubscribed());

    if (!debeResponder) return null;

    // Los handlers default hacen esto; al sobrescribirlos hay que replicarlo.
    await ctx.thread.startTyping("Pensando...");

    return { auth: defaultSlackAuth(message, ctx) };
  },
});

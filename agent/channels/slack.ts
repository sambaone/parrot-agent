import { connectSlackCredentials } from "@vercel/connect/eve";
import { slackChannel } from "eve/channels/slack";

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
   */
  async onMessage(ctx, message) {
    if (message.author?.isBot) return null;

    const esDirecto = message.raw.channel_type === "im";
    const debeResponder =
      esDirecto || ctx.isBotMentioned() || (await ctx.isSubscribed());

    return debeResponder ? { auth: null } : null;
  },
});

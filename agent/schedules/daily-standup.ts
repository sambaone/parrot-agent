import { defineSchedule } from "eve/schedules";

import slack from "../channels/slack";
import { requiredEnv } from "../lib/env";
import { standupSlackPrincipal } from "../lib/slack-principal";

/**
 * Standup diario en Slack.
 *
 * `cron` se evalúa en UTC en Vercel. CDMX es UTC-6 todo el año (México ya no
 * aplica horario de verano), así que 15:00 UTC = 9:00 AM CDMX. `1-5` limita la
 * corrida a lunes–viernes.
 *
 * Es forma `run` y no `markdown` porque el resultado tiene que entregarse a un
 * canal de Slack; el modo markdown descarta la salida.
 */
export default defineSchedule({
  cron: "0 15 * * 1-5",

  async run({ receive, waitUntil }) {
    // El ID del canal es configuración de entorno: nunca se hardcodea.
    const channelId = requiredEnv(
      "STANDUP_SLACK_CHANNEL_ID",
      "Es el ID del canal de Slack donde se postea el standup, empieza con C.",
    );

    waitUntil(
      receive(slack, {
        message:
          "Genera y postea el standup diario del proyecto en Slack. " +
          "Consulta Jira en vivo y sigue exactamente el formato de tus " +
          "instrucciones. Postea el resumen completo aunque no haya alertas.",
        target: { channelId },
        // No se usa `appAuth`: la conexión a Jira es user-scoped por
        // limitación del conector de Atlassian, así que el cron corre bajo el
        // principal de la persona que autorizó Jira. Ver lib/slack-principal.ts.
        auth: standupSlackPrincipal(channelId),
      }),
    );
  },
});

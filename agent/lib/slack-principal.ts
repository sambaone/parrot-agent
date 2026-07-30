import type { ScheduleHandlerArgs } from "eve/schedules";

import { requiredEnv } from "./env";

/**
 * eve no re-exporta `SessionAuthContext` en su API pública, así que lo derivamos
 * del tipo de `appAuth`, que sí es público. Es el mismo tipo que espera
 * `receive(channel, { auth })`.
 */
type SessionAuthContext = ScheduleHandlerArgs["appAuth"];

/**
 * Construye el principal de Slack bajo el que corre el standup automático.
 *
 * ## Por qué existe esto
 *
 * El conector de Atlassian en Vercel Connect solo soporta sujetos de tipo
 * `user` (`supportedSubjectTypes: ["user"]`): no puede emitir un token de
 * aplicación. Entonces la conexión a Jira tiene que ser user-scoped, y una
 * conexión user-scoped necesita un principal de usuario en la sesión.
 *
 * El `appAuth` que recibe un schedule es `principalType: "runtime"`, no un
 * usuario, así que despachar el cron con `appAuth` fallaría en la primera
 * llamada a Jira con `reason: "principal_required"`.
 *
 * La salida documentada es despachar con un contexto de auth de usuario
 * explícito. Eso es lo que hace este helper: reproduce el principal que el
 * canal de Slack le asigna a una persona real, de modo que el cron reutiliza
 * la MISMA autorización de Atlassian que esa persona otorgó una vez desde
 * Slack. Vercel Connect se encarga del refresh, así que no hay que repetirla.
 *
 * ## Cuidado al actualizar eve
 *
 * El formato de abajo replica `buildSlackAuthContext` de eve. La caché de
 * tokens de conexión se llavea por `issuer` + `principalId`, así que si eve
 * cambia ese formato el cron dejaría de encontrar el grant y volvería a pedir
 * OAuth (falla ruidosa, no silenciosa). Al subir de versión de eve, revisa
 * `node_modules/eve/dist/src/public/channels/slack/auth.js` y confirma que
 * `issuer` y `principalId` sigan armándose igual.
 */
export function standupSlackPrincipal(channelId: string): SessionAuthContext {
  const teamId = requiredEnv(
    "SLACK_TEAM_ID",
    "Es el ID del workspace de Slack, empieza con T. Lo ves en la URL de " +
      "Slack en el navegador o en los detalles del workspace.",
  );
  const userId = requiredEnv(
    "STANDUP_AS_SLACK_USER_ID",
    "Es el ID de Slack (empieza con U) de la persona cuya autorización de " +
      "Atlassian usa el standup automático. Esa persona debe haber autorizado " +
      "Jira una vez mencionando al bot en Slack.",
  );

  return {
    attributes: {
      author_type: "user",
      channel_id: channelId,
      team_id: teamId,
      user_id: userId,
    },
    authenticator: "slack-webhook",
    issuer: `slack:${teamId}`,
    principalId: `slack:${teamId}:${userId}`,
    principalType: "user",
  };
}

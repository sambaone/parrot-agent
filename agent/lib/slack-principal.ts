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
 * ## Por qué los atributos extra no rompen nada
 *
 * `requester_*` identifica a quien escribió, que casi nunca es la persona del
 * `STANDUP_AS_SLACK_USER_ID`. Agregarlos es seguro porque el sujeto que Vercel
 * Connect usa para buscar el grant se arma solo con `principalId` e `issuer`:
 * `principalToSubject` en `@vercel/connect/dist/eve/connection-authorization.js`
 * devuelve `{ type, id, issuer }` y descarta los atributos. Mientras esos dos
 * campos no cambien, el cron y las sesiones de Slack siguen encontrando la
 * misma autorización de Atlassian.
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
/**
 * Quien escribió el mensaje que disparó esta sesión.
 *
 * No cambia bajo qué identidad se llama a Jira —eso sigue siendo el usuario del
 * standup— sino que la deja anotada en la sesión para que las tools sepan a
 * quién atender. Ver la nota de abajo sobre por qué esto no rompe el grant.
 */
export interface SolicitanteDeSlack {
  readonly userId: string;
  readonly nombre?: string;
}

export function standupSlackPrincipal(
  channelId: string,
  solicitante?: SolicitanteDeSlack,
): SessionAuthContext {
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
      // Quién pidió las cosas, que casi nunca es `user_id`. Lo lee la tool
      // `quien_pregunta` para decidir qué tickets puede tocar esa persona.
      ...(solicitante
        ? {
            requester_user_id: solicitante.userId,
            ...(solicitante.nombre
              ? { requester_name: solicitante.nombre }
              : {}),
          }
        : {}),
    },
    authenticator: "slack-webhook",
    issuer: `slack:${teamId}`,
    principalId: `slack:${teamId}:${userId}`,
    principalType: "user",
  };
}

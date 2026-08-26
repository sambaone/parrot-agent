import { connectSlackCredentials } from "@vercel/connect/eve";
import { slackChannel } from "eve/channels/slack";

import { requiredEnvInProduction } from "../lib/env";
import { standupSlackPrincipal } from "../lib/slack-principal";

/**
 * Marca con la que el agente parte el standup en dos entregas. Va sola en su
 * línea; ver "El standup diario" en `agent/instructions.md`.
 */
const MARCA_DE_DETALLE = "---detalle---";

/**
 * Parte la salida del agente en lo que va al canal y lo que va al thread.
 *
 * Devuelve `detalle: null` cuando no hay marca —el caso normal de cualquier
 * respuesta de seguimiento—, y entonces el mensaje se postea entero, como
 * siempre.
 */
export function partirEnResumenYDetalle(mensaje: string): {
  resumen: string;
  detalle: string | null;
} {
  const lineas = mensaje.split("\n");
  const corte = lineas.findIndex(
    (linea) => linea.trim().toLowerCase() === MARCA_DE_DETALLE,
  );
  if (corte === -1) return { resumen: mensaje, detalle: null };

  const resumen = lineas.slice(0, corte).join("\n").trim();
  const detalle = lineas.slice(corte + 1).join("\n").trim();

  // Una marca sin nada de un lado no parte nada: se postea lo que haya como un
  // solo mensaje. Postear un mensaje vacío es un error de Slack, no un caso
  // borde silencioso.
  if (!resumen) return { resumen: detalle || mensaje, detalle: null };
  if (!detalle) return { resumen, detalle: null };

  return { resumen, detalle };
}

function primeraLineaNoVacia(texto: string): string | null {
  for (const linea of texto.split("\n")) {
    const limpia = linea.trim();
    if (limpia) return limpia;
  }
  return null;
}

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
   * y escribe en Jira con los permisos de esa persona, y Jira no distingue quién
   * preguntó. Si algún día el canal deja de ser de confianza, esto se revierte
   * volviendo a `defaultSlackAuth(message, ctx)` y asumiendo el OAuth por
   * persona.
   *
   * Por eso el principal lleva anotado, aparte, **quién escribió de verdad**.
   * Jira no puede aplicar permisos por persona en este montaje, así que el
   * agente los aplica: `quien_pregunta` lee ese dato para saber qué tickets
   * puede tocar quien pidió el cambio. La identidad sale de aquí, del webhook
   * firmado de Slack, y nunca del texto del mensaje — que cualquiera puede
   * escribir a nombre de quien quiera.
   */
  async onMessage(ctx, message) {
    // Sin autor no hay nada que atender (mensajes de sistema, ediciones).
    if (!message.author || message.author.isBot) return null;

    const esDirecto = message.raw.channel_type === "im";
    if (!esDirecto && !ctx.isBotMentioned()) return null;

    // Los handlers default hacen esto; al sobrescribirlos hay que replicarlo.
    await ctx.thread.startTyping("Pensando...");

    return {
      auth: standupSlackPrincipal(message.channelId, {
        nombre: message.author.fullName ?? message.author.userName,
        userId: message.author.userId,
      }),
    };
  },

  events: {
    /**
     * Sobrescribe la entrega para poder mandar DOS mensajes: el resumen al
     * canal y el detalle como respuesta en su thread.
     *
     * Funciona por cómo `buildSlackBinding` maneja el `threadTs`. La sesión del
     * cron arranca sin thread, así que el primer `post` sale al canal; ese post
     * fija el `threadTs` del binding al `ts` del mensaje recién creado, y el
     * segundo `post` ya cae dentro de ese thread. Los dos posts tienen que
     * ocurrir en la MISMA invocación del handler, que es donde vive ese
     * binding.
     *
     * Las ramas que no parten el mensaje replican el handler default de eve
     * (`node_modules/eve/dist/src/public/channels/slack/defaults.js`): sin
     * ellas se pierden los indicadores de "escribiendo" y la narración previa
     * a cada tool call.
     */
    async "message.completed"(evento, canal) {
      // Texto que acompaña a una tool call: no es respuesta, es narración. El
      // default lo guarda para usarlo como etiqueta del indicador de typing.
      if (evento.finishReason === "tool-calls") {
        canal.state.pendingToolCallMessage = evento.message
          ? primeraLineaNoVacia(evento.message)
          : null;
        return;
      }

      canal.state.pendingToolCallMessage = null;

      if (!evento.message) {
        await canal.thread.startTyping();
        return;
      }

      const { resumen, detalle } = partirEnResumenYDetalle(evento.message);
      await canal.thread.post(resumen);
      if (detalle) await canal.thread.post(detalle);
    },
  },
});

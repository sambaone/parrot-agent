import { eveChannel } from "eve/channels/eve";
import { type AuthFn, localDev, vercelOidc } from "eve/channels/auth";

import { standupSlackPrincipal } from "../lib/slack-principal";

/**
 * Canal HTTP del agente. Protege POST /eve/v1/session, su continuación y el
 * stream. `GET /eve/v1/health` siempre es público.
 *
 * Este agente no tiene frontend web: se usa desde Slack y desde la TUI de eve.
 * Por eso se quitó el `placeholderAuth()` del scaffold, que existe para que una
 * app web recién generada pueda decir "falta configurar auth" en lugar de
 * tronar. Sin frontend es código muerto, y el walk ya falla cerrado sin él:
 * cualquier request de navegador en producción recibe 401.
 *
 * Si algún día se agrega una UI web, aquí va el AuthFn de su proveedor de
 * identidad, ANTES de estas entradas.
 */

function esLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    /^127\./.test(hostname)
  );
}

/**
 * Principal de usuario para desarrollo local, apagado por default.
 *
 * ## Por qué se necesita
 *
 * `localDev()` autentica un principal con `principalType: "local-dev"`, que NO
 * es un usuario. La conexión a Jira es user-scoped (el conector de Atlassian no
 * emite tokens de aplicación), así que desde la TUI de `eve dev` cualquier
 * llamada a Jira falla con `reason: "principal_required"`. Sin este shim no se
 * puede iterar el formato del standup en local: habría que spammear el canal
 * real de Slack para cada ajuste de redacción.
 *
 * ## Cómo usarlo
 *
 * Requiere que la persona designada YA haya autorizado Atlassian una vez desde
 * Slack en el deployment. Vercel Connect guarda ese grant llaveado por
 * `issuer` + `principalId`; como este shim devuelve exactamente el mismo
 * principal, local reutiliza el token sin abrir un flujo OAuth nuevo — algo que
 * en localhost no podría completarse de todas formas, porque el callback de
 * Connect no puede alcanzar una URL local.
 *
 *     EVE_DEV_AS_STANDUP_USER=1 npm run dev
 *
 * ## Límites deliberados
 *
 * Triple candado: nunca en Vercel, solo con el opt-in explícito, y solo para
 * requests dirigidos a un hostname de loopback. Aun así, mientras esté
 * encendido cualquier proceso local que alcance el dev server actúa con la
 * identidad de esa persona frente a Jira (solo lectura). Déjalo apagado salvo
 * mientras estés iterando.
 */
function devStandupUser(): AuthFn<Request> {
  return (request) => {
    if (process.env.VERCEL) return null;
    if (process.env.EVE_DEV_AS_STANDUP_USER !== "1") return null;
    if (!esLoopback(new URL(request.url).hostname)) return null;

    return standupSlackPrincipal("local-dev");
  };
}

export default eveChannel({
  auth: [
    // Opt-in, solo local: da un principal de usuario para poder probar Jira.
    devStandupUser(),
    // Deja entrar a la TUI de eve y a los deployments de Vercel (incluye las
    // llamadas internas del runtime y de los subagentes).
    vercelOidc(),
    // Abre localhost para `eve dev`; se ignora en producción porque exige un
    // hostname de loopback.
    localDev(),
  ],
});

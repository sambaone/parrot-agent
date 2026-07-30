import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";

/**
 * Canal HTTP del agente. Protege POST /eve/v1/session, su continuación y el
 * stream. `GET /eve/v1/health` siempre es público.
 *
 * Este agente no tiene frontend web: se usa desde Slack y desde la TUI de eve.
 * Por eso la política son solo estas dos entradas, y se quitó el
 * `placeholderAuth()` del scaffold, que existe para que una app web recién
 * generada pueda decir "falta configurar auth" en lugar de tronar. Sin
 * frontend es código muerto, y el walk ya falla cerrado sin él: cualquier
 * request de navegador en producción recibe 401.
 *
 * Si algún día se agrega una UI web, aquí va el AuthFn de su proveedor de
 * identidad, ANTES de estas dos entradas.
 */
export default eveChannel({
  auth: [
    // Deja entrar a la TUI de eve y a los deployments de Vercel (incluye las
    // llamadas internas del runtime y de los subagentes).
    vercelOidc(),
    // Abre localhost para `eve dev`; se ignora en producción porque exige un
    // hostname de loopback.
    localDev(),
  ],
});

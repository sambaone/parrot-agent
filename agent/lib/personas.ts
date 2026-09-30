/**
 * Mapeo de personas: quién es quién entre Slack y Jira.
 *
 * ## Por qué hace falta una tabla y no se resuelve solo
 *
 * Todas las sesiones de Slack corren bajo un mismo principal de Jira (ver
 * `slack-principal.ts`), así que Jira no puede aplicar permisos por persona:
 * para Jira siempre es el mismo usuario el que escribe. La regla "solo puedes
 * modificar lo que está asignado a ti" la tiene que aplicar el agente, y para
 * aplicarla necesita saber qué cuenta de Jira le corresponde a quien pidió el
 * cambio.
 *
 * El mensaje de Slack trae el `user_id` de quien escribe (`U...`), pero Jira
 * identifica a la gente por `accountId`, un UUID sin relación con Slack. No hay
 * forma de derivar uno del otro: parear por nombre de display es frágil
 * ("ana.ruiz" vs "Ana Ruíz") y cuando falla puede acertar con la persona
 * equivocada, que es peor que no acertar. Por eso el puente es explícito.
 *
 * ## Formato
 *
 *     SLACK_JIRA_ACCOUNTS=U01ABC:5f8a...c1,U02DEF:6b2c...9d
 *
 * Pares `<slackUserId>:<jiraAccountId>` separados por comas. Los espacios y
 * saltos de línea se ignoran, así que la variable puede ir en varias líneas.
 *
 * ## Falla cerrada, a propósito
 *
 * Quien no esté en la tabla no puede modificar ningún ticket: puede consultar,
 * crear y comentar, pero no editar lo existente. Es la decisión conservadora —
 * ante la duda de quién es, no se toca nada de nadie.
 */

/** Una entrada del mapeo, ya validada. */
export interface PersonaDeJira {
  readonly slackUserId: string;
  readonly jiraAccountId: string;
}

/** Un `U` seguido de alfanuméricos: el formato de user id de Slack. */
const SLACK_USER_ID = /^U[A-Z0-9]+$/i;

/**
 * Lee y valida `SLACK_JIRA_ACCOUNTS`.
 *
 * Una entrada mal escrita **truena** en lugar de ignorarse en silencio: si se
 * saltara, la persona afectada perdería el permiso de editar sus propios
 * tickets sin que nadie se enterara del porqué. El error sale como resultado de
 * la tool `quien_pregunta`, así que el agente lo reporta en el thread.
 */
function leerMapeo(): Map<string, string> {
  const crudo = process.env.SLACK_JIRA_ACCOUNTS?.trim();
  const mapeo = new Map<string, string>();
  if (!crudo) return mapeo;

  for (const entrada of crudo.split(",")) {
    const limpia = entrada.trim();
    if (!limpia) continue;

    const separador = limpia.indexOf(":");
    const slackUserId = limpia.slice(0, separador).trim();
    const jiraAccountId = limpia.slice(separador + 1).trim();

    if (separador === -1 || !slackUserId || !jiraAccountId) {
      throw new Error(
        `SLACK_JIRA_ACCOUNTS tiene una entrada mal formada: "${limpia}". ` +
          `El formato es <slackUserId>:<jiraAccountId>, separando pares con comas.`,
      );
    }
    if (!SLACK_USER_ID.test(slackUserId)) {
      throw new Error(
        `SLACK_JIRA_ACCOUNTS: "${slackUserId}" no parece un user id de Slack. ` +
          `Debe empezar con U (lo ves en Slack en el perfil de la persona → ` +
          `⋮ → Copiar miembro ID).`,
      );
    }

    mapeo.set(slackUserId, jiraAccountId);
  }

  return mapeo;
}

/**
 * Devuelve el `accountId` de Jira de una persona de Slack, o `undefined` si no
 * está en la tabla.
 *
 * Se lee del entorno en cada llamada en vez de cachearse: la tabla cambia
 * cuando alguien entra o sale del equipo, y en Vercel un cambio de variable
 * llega con el redeploy, no con un reinicio de proceso que podamos suponer.
 */
export function cuentaDeJira(slackUserId: string): string | undefined {
  return leerMapeo().get(slackUserId);
}

/** Cuántas personas trae la tabla. Sirve para distinguir "no estás en la tabla"
 * de "no hay tabla", que se arreglan de formas distintas. */
export function personasMapeadas(): number {
  return leerMapeo().size;
}

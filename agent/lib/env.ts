/**
 * Lectura de configuración de entorno.
 *
 * Regla del proyecto: ningún valor sensible o específico del entorno vive en el
 * repositorio. Todo se lee de variables de entorno en tiempo de ejecución.
 */

/** Lee una variable obligatoria y falla con un mensaje accionable si falta. */
export function requiredEnv(name: string, hint: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. ${hint} ` +
        `En local va en .env.local; en producción: vercel env add ${name} production`,
    );
  }
  return value;
}

/**
 * Igual que `requiredEnv`, pero en desarrollo local devuelve un placeholder en
 * lugar de fallar.
 *
 * Necesario para la configuración de Slack: los UID de Vercel Connect solo
 * existen después del deploy y de la autorización manual, pero `eve dev` tiene
 * que poder arrancar antes de eso para validar la lógica del standup. Slack no
 * es probable en localhost de todos modos (los eventos llegan vía Vercel
 * Connect al deployment), así que un placeholder local no esconde nada.
 *
 * En Vercel la variable es obligatoria y la ausencia falla el arranque.
 */
export function requiredEnvInProduction(
  name: string,
  hint: string,
  devPlaceholder: string,
): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (process.env.VERCEL) return requiredEnv(name, hint);

  console.warn(
    `[standup-agent] ${name} no está configurada; usando el placeholder de ` +
      `desarrollo "${devPlaceholder}". Slack no funciona en local.`,
  );
  return devPlaceholder;
}

/** Zona horaria de referencia del equipo. El standup se define en hora de CDMX. */
export const TEAM_TIME_ZONE = "America/Mexico_City";

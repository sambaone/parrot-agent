import { defineTool } from "eve/tools";
import { z } from "zod";

import { diasHabilesEntre, fechaLocal } from "../lib/fechas";

/** Ancho de la barra en bloques. Diez hace que cada bloque valga 10% exacto. */
const BLOQUES = 10;

const LLENO = "▰";
const VACIO = "▱";

/**
 * El encabezado del standup lleva tres números que el modelo no debe calcular:
 * el porcentaje de avance, el largo de la barra y los días hábiles que faltan
 * para el cierre del sprint.
 *
 * Los tres son aritmética pura sobre datos que el modelo ya trae de Jira, y los
 * tres son exactamente donde un LLM se equivoca sin avisar: redondea mal el
 * porcentaje, pinta ocho bloques para un 62% o cuenta el fin de semana como
 * días de trabajo. Y como van en la primera línea del mensaje, un error ahí es
 * lo primero que lee el equipo.
 *
 * Por eso la tool devuelve el `encabezado` ya armado: el modelo lo copia tal
 * cual en lugar de reconstruirlo. Los campos sueltos van también por si el
 * formato cambia y para que el modelo pueda razonar sobre el riesgo del sprint
 * sin volver a dividir.
 */
export default defineTool({
  description:
    "Calcula el encabezado de avance del sprint del standup: barra de " +
    "progreso, porcentaje de tickets cerrados y días hábiles restantes hasta " +
    "el cierre. Llámala cuando tengas el nombre del sprint activo, su fecha " +
    "de fin y los conteos de tickets, y copia el campo `encabezado` tal cual " +
    "en el mensaje. No calcules a mano el porcentaje ni los días.",
  inputSchema: z.object({
    nombreDelSprint: z
      .string()
      .describe("Nombre del sprint activo tal como viene de Jira, ej. 'Sprint 14'."),
    finDelSprint: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato YYYY-MM-DD.")
      .describe("Fecha de fin del sprint activo en formato YYYY-MM-DD."),
    ticketsTotales: z
      .number()
      .int()
      .min(1)
      .describe("Total de tickets en el sprint activo, cerrados incluidos."),
    ticketsCerrados: z
      .number()
      .int()
      .min(0)
      .describe("Tickets del sprint activo con statusCategory = Done."),
  }),
  execute({ nombreDelSprint, finDelSprint, ticketsTotales, ticketsCerrados }) {
    // Un conteo de cerrados por encima del total sería un error de consulta del
    // modelo (típicamente dos JQL con filtros distintos). Se acota en lugar de
    // fallar: más vale un 100% que un standup que no sale.
    const cerrados = Math.min(ticketsCerrados, ticketsTotales);
    const porcentaje = Math.round((cerrados / ticketsTotales) * 100);

    const llenos = Math.round((porcentaje / 100) * BLOQUES);
    const barra = LLENO.repeat(llenos) + VACIO.repeat(BLOQUES - llenos);

    const hoy = fechaLocal(new Date());
    const vencido = finDelSprint < hoy;
    const cierraHoy = finDelSprint === hoy;
    const diasHabilesRestantes = diasHabilesEntre(hoy, finDelSprint);
    const diasHabilesDeRetraso = vencido ? diasHabilesEntre(finDelSprint, hoy) : 0;

    return {
      barra,
      porcentaje,
      diasHabilesRestantes,
      cierraHoy,
      vencido,
      diasHabilesDeRetraso,
      encabezado:
        `${nombreDelSprint}  ${barra}  ${porcentaje}% · ` +
        colaDelEncabezado({
          cierraHoy,
          vencido,
          diasHabilesRestantes,
          diasHabilesDeRetraso,
        }),
    };
  },
});

function colaDelEncabezado(estado: {
  cierraHoy: boolean;
  vencido: boolean;
  diasHabilesRestantes: number;
  diasHabilesDeRetraso: number;
}): string {
  if (estado.cierraHoy) return "cierra hoy";
  if (estado.vencido) {
    // Nunca "venció ayer": el conteo es de días hábiles, así que un lunes ese
    // "ayer" sería el viernes y la frase mentiría.
    return estado.diasHabilesDeRetraso === 1
      ? "venció hace 1 día hábil"
      : `venció hace ${estado.diasHabilesDeRetraso} días hábiles`;
  }
  return estado.diasHabilesRestantes === 1
    ? "queda 1 día hábil"
    : `quedan ${estado.diasHabilesRestantes} días hábiles`;
}

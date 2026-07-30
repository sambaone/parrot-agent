/**
 * Aritmética de fechas para el standup, siempre anclada a la zona horaria del
 * equipo (CDMX) y no a la del servidor, que en Vercel corre en UTC.
 *
 * Todas las fechas se manejan como cadenas `YYYY-MM-DD`, el formato que acepta
 * JQL directamente.
 */

import { TEAM_TIME_ZONE } from "./env";

/** `YYYY-MM-DD` del instante dado, visto desde la zona horaria del equipo. */
export function fechaLocal(instante: Date, timeZone = TEAM_TIME_ZONE): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/**
 * Ancla una fecha civil a mediodía UTC para poder sumarle o restarle días sin
 * que ningún desfase de zona horaria cruce la frontera del día.
 */
function aMediodiaUtc(fecha: string): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, 12));
}

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Suma (o resta, con `dias` negativo) días de calendario a una fecha civil. */
export function sumarDias(fecha: string, dias: number): string {
  const d = aMediodiaUtc(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return iso(d);
}

/** `true` de lunes a viernes. */
export function esDiaHabil(fecha: string): boolean {
  const dia = aMediodiaUtc(fecha).getUTCDay();
  return dia >= 1 && dia <= 5;
}

/**
 * El día hábil anterior. Para un lunes devuelve el viernes previo, de modo que
 * el standup del lunes cubra todo el fin de semana.
 */
export function diaHabilAnterior(fecha: string): string {
  let anterior = sumarDias(fecha, -1);
  while (!esDiaHabil(anterior)) anterior = sumarDias(anterior, -1);
  return anterior;
}

/** Nombre del día de la semana en español, ej. "miércoles". */
export function nombreDelDia(fecha: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
  }).format(aMediodiaUtc(fecha));
}

export interface VentanaDeStandup {
  /** Fecha de hoy en CDMX, `YYYY-MM-DD`. */
  hoy: string;
  nombreDelDiaDeHoy: string;
  /**
   * Día hábil anterior. Lo "completado ayer" se mide desde aquí, así que el
   * lunes incluye el viernes, el sábado y el domingo.
   */
  diaHabilAnterior: string;
  nombreDelDiaHabilAnterior: string;
  /**
   * Corte para detectar tickets estancados: un ticket sin `updated` posterior a
   * esta fecha lleva más de 3 días sin movimiento.
   */
  sinMovimientoDesde: string;
  /** Hora local del equipo al momento de la consulta, para encabezar el resumen. */
  horaLocal: string;
  zonaHoraria: string;
}

/** Calcula todas las fechas que necesita el standup a partir de un instante. */
export function ventanaDeStandup(
  ahora: Date,
  timeZone = TEAM_TIME_ZONE,
): VentanaDeStandup {
  const hoy = fechaLocal(ahora, timeZone);
  const anterior = diaHabilAnterior(hoy);

  return {
    hoy,
    nombreDelDiaDeHoy: nombreDelDia(hoy),
    diaHabilAnterior: anterior,
    nombreDelDiaHabilAnterior: nombreDelDia(anterior),
    sinMovimientoDesde: sumarDias(hoy, -3),
    horaLocal: new Intl.DateTimeFormat("es-MX", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(ahora),
    zonaHoraria: timeZone,
  };
}

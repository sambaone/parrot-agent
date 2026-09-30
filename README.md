<img src="assets/parrot.png" alt="Parrot" width="130" align="right">

# Parrot

**Agente de IA que hace de Project Manager Jr. en Slack.**

Postea el standup diario de un proyecto de Jira cada día hábil y después
responde preguntas de seguimiento en el mismo thread, consultando Jira en vivo.
También crea tickets, mide el sprint y mueve trabajo, si se lo piden.

El de la derecha es su avatar: `assets/parrot.png` es la misma imagen que se
sube al app de Slack, para que el bot se vea igual en el canal que en el
repositorio.

Está construido con [eve](https://eve.dev) y corre en Vercel. No maneja ningún
token: las credenciales de Slack y de Atlassian las resuelve Vercel Connect.

## Cómo se ve

El standup sale en dos mensajes. Al canal va lo que se lee de un vistazo:

```
*Standup PROY · jue 30 jul*
Sprint 14  ▰▰▰▰▰▰▱▱▱▱  62% · quedan 4 días hábiles

*Ayer* cerramos 3. *Hoy* 5 en curso, 2 en review. *Riesgo* 1 bloqueada y
1 estancada, las dos en cobros. El sprint va a tiempo salvo por refunds.

🔴 PROY-45 Refunds · Ana Ruiz · bloqueada desde el 28 jul
🟡 PROY-38 Login · Luis Mora · sin mover desde el 27 jul
```

El desglose por persona queda en el thread, para quien lo quiera abrir.

## Cómo funciona

| Pieza | Qué hace |
|---|---|
| `agent/schedules/daily-standup.ts` | Un Vercel Cron Job dispara el standup y lo entrega al canal. |
| `agent/channels/slack.ts` | Escucha menciones y DMs; parte la respuesta en resumen y detalle. |
| `agent/connections/jira.ts` | El MCP oficial de Atlassian, con el borrado denegado en código. |
| `agent/instructions.md` | El formato del standup y las reglas de escritura. Es la mayor parte del producto. |
| `agent/tools/` | Lo que el modelo no debe calcular a ojo: fechas, avance del sprint, quién pregunta. |

## Tres cosas que conviene saber antes de adoptarlo

**La conexión a Jira es por usuario, no por aplicación.** El conector de
Atlassian en Vercel Connect no emite tokens de aplicación, así que una persona
autoriza Jira una vez desde Slack y el cron reutiliza ese permiso. Todo lo que el
agente escriba en Jira va a aparecer a nombre de esa persona.

**Jira no puede aplicar permisos por persona, así que los aplica el agente.**
Cualquiera en el canal puede pedir informes y tickets nuevos; modificar un ticket
existente solo puede su asignado; borrar no puede nadie. Las dos últimas reglas
no son igual de fuertes y `CLAUDE.md` explica por qué.

**En local no se llega a Jira.** El grant vive en el deployment, así que el
formato del standup se itera desplegando. En local se valida que arranca, que
las tools propias responden y que compila.

## Puesta en marcha

Necesitas Node 24, una cuenta de Vercel, un workspace de Slack y un sitio de
Jira donde seas admin.

```bash
npm install
npx eve dev          # TUI local
npx eve deploy       # a producción
npm run check:secretos
```

La configuración entera son variables de entorno: están listadas con su
explicación en `.env.example`. Los conectores de Slack y Atlassian se crean una
vez con `vercel connect create`.

`CLAUDE.md` tiene el detalle: cómo cambiar el canal, el horario o el modelo, qué
falla y por qué, y las trampas que costaron un día encontrar. `docs/SETUP.md`
conserva el brief original con el que se construyó.

## Secretos

El repositorio no contiene ningún token, credencial ni identificador interno, y
hay un script que lo comprueba en siete frentes, incluidos los mensajes de
commit:

```bash
npm run check:secretos
```

Córrelo antes de cada push. Si falla, no publiques.

## Licencia

MIT. Ver [LICENSE](LICENSE).

# parrot-agent

**Parrot (Project Manager Jr.)** es un agente construido con [eve](https://eve.dev)
que postea el standup diario de un proyecto de Jira en Slack cada día
hábil a las 9:00 AM hora de CDMX,
y responde preguntas de seguimiento en el mismo thread consultando Jira en vivo.
Corre en Vercel: el schedule es un Vercel Cron Job y las credenciales de Slack y
Atlassian las maneja Vercel Connect, no el código. El resumen agrupa por persona
y marca tickets bloqueados o sin movimiento más de 3 días.

Cualquiera en el canal puede pedirle informes y tickets nuevos; modificar un
ticket que ya existe solo puede su asignado, y borrar no puede nadie. Ver
[Quién puede pedirle qué al bot](#quién-puede-pedirle-qué-al-bot).

- **Deployment:** el que te dé Vercel al desplegar (`<proyecto>.vercel.app`).

## Regla permanente: cero secretos en el repo

Este repo se hará público. **Ningún token, API key, secreto ni ID interno entra
al repositorio** — ni en el código, ni en los docs, ni en el historial de git.
Todo valor sensible o específico del entorno se lee de una variable de entorno.

```bash
npm run check:secretos   # obligatorio antes de cada push
```

Revisa 6 cosas, incluida una regresión recurrente: **la CLI de Vercel apenda
`.env*` al final del `.gitignore`** en cada `vercel link` / `vercel env pull`, y
como ahí gana la última regla, eso vuelve a ignorar `.env.example`. Si el script
lo reporta, mueve ese `.env*` arriba del bloque de secretos.

`.env.example` solo lleva nombres y placeholders, nunca valores. Es el único
archivo `.env*` versionado.

## Estructura

```
agent/
├── agent.ts                     Modelo (vía AI Gateway) y topes de tokens
├── instructions.md              Rol, formato del standup, sintaxis de Slack
├── channels/
│   ├── eve.ts                   Route auth del canal HTTP + principal de dev opt-in
│   └── slack.ts                 Canal de Slack vía Vercel Connect
├── connections/
│   └── jira.ts                  MCP de Atlassian (user-scoped) y bloqueo de borrado
├── schedules/
│   └── daily-standup.ts         Cron y entrega al canal
├── skills/
│   └── gestion-de-proyecto.md   Sprints, métricas y cambios en lote
├── tools/
│   ├── avance_de_sprint.ts      Barra, porcentaje y días hábiles del encabezado
│   ├── quien_pregunta.ts        Quién pidió el cambio y su cuenta de Jira
│   └── ventana_de_standup.ts    Fechas de referencia, clave del proyecto y cloudId
└── lib/
    ├── env.ts                   Lectura de variables de entorno
    ├── fechas.ts                Aritmética de días hábiles en hora de CDMX
    ├── personas.ts              Tabla Slack → Jira de SLACK_JIRA_ACCOUNTS
    └── slack-principal.ts       Principal bajo el que corre el cron
scripts/check-secretos.sh        Barrido de secretos
docs/SETUP.md                    Brief original + desviaciones de implementación
```

El nombre de cada capacidad sale de su ruta: `tools/ventana_de_standup.ts` es la
tool `ventana_de_standup`, y `connections/jira.ts` expone sus tools como
`jira__<tool>`. No hay campo `name` que mantener.

## Desarrollo local

Node 24 está instalado como keg aparte, así que cada sesión necesita:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
```

```bash
npm run dev          # TUI interactiva de eve
npm run typecheck    # tsc
npm run build        # compila; verifica que el cron quede registrado
npx eve info         # capacidades descubiertas y diagnósticos
```

**Para probar Jira en local** hace falta un principal de usuario, porque
`localDev()` autentica como `local-dev` y la conexión a Jira es user-scoped:

```bash
EVE_DEV_AS_STANDUP_USER=1 npm run dev
```

El shim está triple-candado (nunca en Vercel, solo con el opt-in, solo en
loopback) — ver `agent/channels/eve.ts`.

**Verificado el 2026-07-30: esto NO alcanza para llegar a Jira desde local.** El
diseño asumía que local reutilizaría el grant que `STANDUP_AS_SLACK_USER_ID`
otorgó desde Slack, porque la caché de tokens se llavea por `issuer` +
`principalId` y el shim reproduce el mismo `principalId`. La prueba dice otra
cosa: con el grant ya otorgado y funcionando en producción, `eve dev` sigue
emitiendo `authorization.required` con un código nuevo. La causa probable es que
el `issuer` de OIDC en local no coincide con el del deployment, así que la llave
no empata.

Completar ese OAuth desde local tampoco es opción: eve estaciona el turno en un
webhook `http://localhost:2000/...` que Vercel Connect no puede alcanzar.

Consecuencia práctica: **el formato del standup se itera contra producción**, no
en local. En local solo se valida que el agente arranca, que las tools propias
responden (`ventana_de_standup` sí funciona sin Jira) y que compila.

Slack **de entrada** no se puede probar en localhost: los eventos entran por
Vercel Connect al deployment, no a tu máquina. Pero **la salida sí sale de
verdad** — cualquier cosa que el agente entregue a ese canal desde `eve dev`
aterriza en el canal real. Asimetría fácil de olvidar: no escuchas, pero hablas.

`eve dev` nunca dispara schedules por su cron. Para forzar uno:

```bash
curl -X POST http://localhost:2000/eve/v1/dev/schedules/daily-standup
```

> **Esto NO es una prueba local: postea en el canal real de Slack.** Lo local es
> el cómputo, no la entrega — el schedule despacha por Vercel Connect, que
> alcanza Slack igual desde tu máquina que desde el deployment. Y como en local
> no hay grant de Jira, lo que llega al canal es el prompt de
> `authorization.required` ("conecta Jira para continuar"), no un standup.
> Verificado a las malas el 2026-07-30. Para validar el agente sin escribirle al
> equipo, usa el canal HTTP, que responde por la misma conexión y no toca Slack:
>
> ```bash
> curl -X POST http://localhost:2000/eve/v1/session \
>   -H 'content-type: application/json' -d '{"message":"..."}'
> curl -N http://localhost:2000/eve/v1/session/<sessionId>/stream
> ```

## Deploy

```bash
npx eve deploy       # instala, corre vercel deploy --prod y hace env pull
```

Después del deploy, corre `npm run check:secretos` — el `env pull` que hace
`eve deploy` es justo lo que rompe el `.gitignore`.

## Cómo cambiar la configuración

Todo es configuración de entorno. Ningún valor se hardcodea.

| Qué quieres cambiar | Cómo |
|---|---|
| **Canal de Slack** | `vercel env rm STANDUP_SLACK_CHANNEL_ID production` y vuelve a agregarlo con el nuevo ID (`C...`). Invita al bot al canal nuevo. Redeploy. |
| **Proyecto de Jira** | Igual con `JIRA_PROJECT_KEY` (ej. `PROY`). |
| **Sitio de Jira** | `JIRA_CLOUD_ID`, el UUID del sitio de Atlassian. Es opcional: sin él el agente lo redescubre solo, pero gastando entre 6 y 20 tool calls por sesión. Si cambias de sitio y no lo actualizas, el agente usa uno inválido y la primera llamada a Jira falla. |
| **Horario** | Edita `cron` en `agent/schedules/daily-standup.ts` y redeploya. **Vercel evalúa el cron en UTC.** CDMX es UTC-6 todo el año (México no aplica horario de verano), así que resta 6: `"0 15 * * 1-5"` = 9:00 AM CDMX, lunes a viernes. |
| **Formato del resumen** | `agent/instructions.md`. Se itera desplegando y mencionando al bot en Slack; local no llega a Jira (ver arriba). |
| **Corte resumen/detalle** | El standup se entrega en dos mensajes: el resumen al canal y el detalle en su thread. El agente los separa con una línea `---detalle---` y `agent/channels/slack.ts` parte ahí en su handler de `message.completed`. Si cambias la marca, cámbiala en los dos lados. |
| **Modelo** | `agent/agent.ts`. Acepta un id del AI Gateway. |
| **Nombre del bot** | Son dos cosas separadas. Cómo se presenta el agente cuando le preguntan: bloque `# Identidad` de `agent/instructions.md`. Cómo lo ve Slack: `api.slack.com/apps/<APP_ID>` → **App Home → App Display Name**, que trae el *Display Name* (el que sale junto a cada mensaje) y el *Default username* (el handle de la mención, minúsculas y sin espacios). Ese no se puede cambiar desde el repo: `slackChannel()` declara un `botName` en sus tipos, pero solo el canal de GitHub lo consume. Ver la nota de abajo. |
| **Quién autoriza Jira** | `STANDUP_AS_SLACK_USER_ID`. La persona nueva debe autorizar Atlassian mencionando al bot en Slack; el cron usa su grant. |
| **Quién puede modificar tickets** | `SLACK_JIRA_ACCOUNTS`, pares `<slackUserId>:<jiraAccountId>` separados por comas. Quien no esté ahí puede consultar, crear y comentar, pero no editar lo existente. Agregar a alguien es agregar su par y redeployar. |

Las variables de entorno se listan en `.env.example` con su explicación.

## Renombrar el bot en Slack

Verificado el 2026-08-20, renombrando `parrot-agent` a **Parrot (Project
Manager Jr.)** con handle `@parrot`:

- El nombre que aparece junto a cada mensaje del canal es el **Display Name (Bot
  Name)** de **App Home → App Display Name**, no el **App name** de Basic
  Information. Ese segundo solo se ve en el directorio de apps y en las
  pantallas de instalación; cambiarlo es cosmético.
- **El cambio se propaga solo, sin reinstalar el app.** No hay que volver a
  autorizar nada: el `STANDUP_AS_SLACK_USER_ID` y el grant de Jira siguen
  intactos, porque el principal se llavea por user ID, no por nombre.
- El campo advierte "can't use punctuation (other than apostrophes and periods)"
  pero **acepta paréntesis**: la validación no corresponde al texto.
- Lo que sí bloquea el guardado es el **App name** de Basic Information: Slack
  exige contraste contra el texto blanco y rechaza el `backgroundColor` claro
  que Vercel Connect empuja al crear el app (`#b5c021`). Hubo que oscurecerlo a
  `#4a5010` para poder guardar.
- **El avatar vive en el repo**, en `assets/parrot.png`, y se sube a mano en la
  consola del app (**Basic Information → Display Information**). Tenerlo
  versionado es a propósito: si hay que reinstalar el app o recrear el conector,
  la imagen no depende de que alguien la tenga en su carpeta de descargas.
- Cambiar el *Default username* cambia cómo se menciona al bot. Las menciones
  viejas en threads siguen vivas porque Slack guarda el `<@U...>`, no el texto.

## Quién puede pedirle qué al bot

Cualquier persona del canal puede hablarle. Lo que cambia según el caso no es
quién pregunta, sino qué tan reversible es lo que pide:

| Petición | Quién puede | Dónde se aplica |
|---|---|---|
| Consultar: standup, métricas, un ticket | cualquiera | — |
| Crear tickets | cualquiera | — |
| Comentar un ticket, sea de quien sea | cualquiera | — |
| Modificar un ticket que ya existe | solo su asignado; si no tiene asignado, cualquiera | `agent/instructions.md`, vía `quien_pregunta` |
| Borrar cualquier cosa | nadie | `agent/connections/jira.ts`, en código |

**Las dos fronteras no son igual de fuertes, y es deliberado.** El borrado lo
deniega la policy de `approval` de la conexión antes de que la llamada salga
hacia Atlassian: el modelo no puede levantarlo por más que se lo pidan en el
thread. Se bloquea por patrón de nombre y no por lista, porque el catálogo de
tools lo publica Atlassian y una lista exacta no cubriría un `bulkDeleteIssues`
futuro.

La regla de propiedad, en cambio, vive en las instrucciones: la aplica el
modelo, así que alguien insistente puede moverla. Aplicarla en código exigiría
leer el `assignee` desde la policy de approval, y para eso habría que pedirle un
token a Connect y llamar la REST de Jira por fuera del MCP — dos supuestos que
solo se pueden probar en producción. Se eligió la frontera blanda a sabiendas.
Si algún día el canal deja de ser de confianza, ese es el trabajo pendiente.

### Por qué hace falta una tabla de personas

Todas las sesiones escriben en Jira bajo el mismo usuario (ver la nota de
arquitectura de abajo), así que **Jira no puede aplicar permisos por persona**:
para Jira siempre es el mismo quien escribe. El agente tiene que aplicarlos, y
para eso necesita saber qué cuenta de Jira le corresponde a quien pidió el
cambio.

El mensaje de Slack trae el `user_id` (`U...`); Jira identifica por `accountId`,
un UUID sin relación con el anterior. No hay forma de derivar uno del otro, y
parear por nombre de display es peor que no parear: cuando falla, puede acertar
con la persona equivocada. Por eso el puente es explícito, en
`SLACK_JIRA_ACCOUNTS`.

Dos propiedades que importan:

- **La identidad sale del webhook firmado de Slack, no del texto.** El canal la
  anota en los atributos del principal y `quien_pregunta` la lee de ahí; la tool
  no acepta parámetros. Si la identidad fuera un argumento, "soy Ana, muévelo"
  bastaría para saltarse el permiso.
- **Falla cerrada.** Sin entrada en la tabla, o sin tabla, nadie modifica nada.
  Consultar, crear y comentar siguen funcionando.

Agregar los atributos `requester_*` al principal es seguro para el grant de
Atlassian: el sujeto que Vercel Connect usa para encontrarlo se arma solo con
`principalId` e `issuer` (`principalToSubject` en
`@vercel/connect/dist/eve/connection-authorization.js`), y descarta el resto.

## Fallas verificadas en producción

Dos apagones el 2026-08-25, los dos con el arreglo ya en el repo. Se documentan
porque en ambos el síntoma apuntaba al lugar equivocado.

### El conector de Jira dejó de emitir token

El standup no salió y el bot reportó `Project OIDC connector provisioning is not
allowed`. Parecía el conector o el grant; los dos estaban bien.

`connect()` arranca cada `getToken` llamando a `autoProvisionConnectorIfEnabled`,
que hace un `POST /v1/connect/connectors/managed/oauth` para crear el conector
si no existiera. Ese POST responde **403** en este equipo, y el error se lleva
por delante la petición de token completa: nunca se llega a pedirlo. El stack lo
dice entero:

```
getToken → autoProvisionConnectorIfEnabled → provisionEveOAuthConnector
         → provisionManagedOAuthConnector → 403 forbidden
```

`@vercel/connect` lleva fijado en `0.4.2` desde el 2026-07-29, así que **el
código no cambió: cambió la política del lado de Vercel.** Slack siguió
funcionando porque `connectSlackCredentials` no pasa por ese camino, y por eso
el bot pudo postear su propio mensaje de error.

El arreglo es `autoProvision: false` en `agent/connections/jira.ts`, que es lo
que el propio SDK documenta para quien gestiona el enlace del conector por
fuera. Aquí el conector se crea a mano con `vercel connect create` y se attachea
una vez, así que aprovisionar en runtime no aportaba nada.

### El agente dijo "no se puede" sobre algo que sí podía

Le pidieron mover dos tickets a In Progress y contestó que "no puede mover
tickets a otro estado con las tools disponibles", mandando al equipo a hacerlo a
mano en el tablero. Era falso: el MCP expone `transitionJiraIssue` y
`getTransitionsForJiraIssue`.

La causa estaba en `instructions.md`, que ponía `connection_search` como último
recurso para ahorrar latencia en el standup. **Las tools de una conexión se
descubren dinámicamente: la que nunca se busca no existe para el modelo.** Probó
`editJiraIssue` sobre `status`, Jira lo rechazó —el estado no es un campo
editable, va por `/transitions`— y de ahí concluyó que la operación era
imposible.

Ahora la regla distingue los dos casos: llamada directa para el camino del
standup, `connection_search` obligatorio para todo lo demás, y prohibición
explícita de afirmar que algo no se puede sin haberlo buscado. La lección
general, si vuelve a pasar con otra capacidad: **el modelo no tiene el catálogo
de Jira en contexto**, así que cualquier "no puedo" sobre una operación de Jira
es sospechoso hasta ver qué buscó.

## Una nota de arquitectura que importa

El conector de Atlassian en Vercel Connect solo soporta sujetos de tipo `user`
(`supportedSubjectTypes: ["user"]`): **no puede emitir un token de aplicación.**
Por eso la conexión a Jira es user-scoped y el cron **no** usa `appAuth` — corre
bajo el principal de Slack de `STANDUP_AS_SLACK_USER_ID` para reutilizar el grant
que esa persona otorgó una vez.

`agent/lib/slack-principal.ts` reproduce el formato de principal que arma el
canal de Slack de eve. La caché de tokens de conexión se llavea por `issuer` +
`principalId`, así que **al subir de versión de eve** hay que confirmar que
`node_modules/eve/dist/src/public/channels/slack/auth.js` siga armándolos igual.
Si cambia, el cron deja de encontrar el grant y vuelve a pedir OAuth — falla
ruidosa, no silenciosa.

## Precondición en Atlassian: el allowlist de dominios del Rovo MCP server

El conector de Jira es el **Atlassian Rovo MCP server**, y ese server solo acepta
flujos de OAuth 2.1 cuyo origen esté en un allowlist que controla el admin de la
organización de Atlassian. Vercel **no** es socio de IA de Atlassian: la lista de
"Atlassian-supported domains" trae `claude.ai`, `chatgpt.com`, `cursor://`,
`vscode.dev` y demás, pero no `connect.vercel.com`, que es de donde sale el
redirect de Vercel Connect.

Sin ese dominio autorizado, quien intente autorizar Jira recibe un error de
permisos aunque sea admin de la organización. El síntoma engaña: parece un
problema de rol y en realidad es de dominio.

El arreglo, una sola vez por organización, en admin.atlassian.com →
**Rovo → Rovo MCP server → Domains → Your domains → Add domain**:

```
https://connect.vercel.com/**
```

Hecho una vez en la organización de Atlassian del equipo. Si el agente se despliega contra otra
organización de Atlassian, hay que repetirlo ahí.

Vale la pena saber el alcance de lo que se autoriza: `connect.vercel.com` es
infraestructura compartida de Vercel Connect, no un dominio propio. Autorizarlo
habilita el origen, no una app específica. El acceso sigue acotado porque cada
persona consiente explícitamente y el token queda limitado a sus propios permisos
de Jira.

## Trabajando en este repo

- eve está en beta y su API cambia. **No adivines la API**: los docs están en
  `node_modules/eve/docs/` y corresponden exactamente a la versión instalada.
  Si algo no está ahí, https://eve.dev/docs.
- Commits atómicos y descriptivos en español: `feat:`, `fix:`, `chore:`, `docs:`.
- Antes de cada commit: `npm run typecheck` y `npm run check:secretos`.

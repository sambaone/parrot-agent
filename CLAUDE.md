# standup-agent

Agente construido con [eve](https://eve.dev) que postea el standup diario del
proyecto de Jira del equipo en Slack cada día hábil a las 9:00 AM hora de CDMX,
y responde preguntas de seguimiento en el mismo thread consultando Jira en vivo.
Corre en Vercel: el schedule es un Vercel Cron Job y las credenciales de Slack y
Atlassian las maneja Vercel Connect, no el código. El resumen agrupa por persona
y marca tickets bloqueados o sin movimiento más de 3 días.

- **Deployment:** https://<tu-proyecto>.vercel.app
- **Proyecto Vercel:** `<tu-equipo>/<tu-proyecto>`

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
├── agent.ts                     Modelo (Sonnet 5 vía AI Gateway) y topes de tokens
├── instructions.md              Rol, formato del standup, sintaxis de Slack
├── channels/
│   ├── eve.ts                   Route auth del canal HTTP + principal de dev opt-in
│   └── slack.ts                 Canal de Slack vía Vercel Connect
├── connections/
│   └── jira.ts                  MCP oficial de Atlassian (user-scoped)
├── schedules/
│   └── daily-standup.ts         Cron y entrega al canal
├── tools/
│   └── ventana_de_standup.ts    Fechas de referencia y clave del proyecto
└── lib/
    ├── env.ts                   Lectura de variables de entorno
    ├── fechas.ts                Aritmética de días hábiles en hora de CDMX
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

Requiere que `STANDUP_AS_SLACK_USER_ID` ya haya autorizado Atlassian una vez
desde Slack; local reutiliza ese grant. El shim está triple-candado (nunca en
Vercel, solo con el opt-in, solo en loopback) — ver `agent/channels/eve.ts`.

Slack **no** se puede probar en localhost: los eventos entran por Vercel Connect
al deployment. En local solo se valida lógica y formato.

`eve dev` nunca dispara schedules por su cron. Para forzar uno:

```bash
curl -X POST http://localhost:2000/eve/v1/dev/schedules/daily-standup
```

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
| **Horario** | Edita `cron` en `agent/schedules/daily-standup.ts` y redeploya. **Vercel evalúa el cron en UTC.** CDMX es UTC-6 todo el año (México no aplica horario de verano), así que resta 6: `"0 15 * * 1-5"` = 9:00 AM CDMX, lunes a viernes. |
| **Formato del resumen** | `agent/instructions.md`. Itera con `EVE_DEV_AS_STANDUP_USER=1 npm run dev` antes de desplegar. |
| **Modelo** | `agent/agent.ts`. Acepta un id del AI Gateway. |
| **Quién autoriza Jira** | `STANDUP_AS_SLACK_USER_ID`. La persona nueva debe autorizar Atlassian mencionando al bot en Slack; el cron usa su grant. |

Las variables de entorno se listan en `.env.example` con su explicación.

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

## Trabajando en este repo

- eve está en beta y su API cambia. **No adivines la API**: los docs están en
  `node_modules/eve/docs/` y corresponden exactamente a la versión instalada.
  Si algo no está ahí, https://eve.dev/docs.
- Commits atómicos y descriptivos en español: `feat:`, `fix:`, `chore:`, `docs:`.
- Antes de cada commit: `npm run typecheck` y `npm run check:secretos`.

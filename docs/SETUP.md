# Brief de setup original (archivado)

> Este es el brief de ejecución con el que se construyó el proyecto, tal como
> lo escribió el responsable del proyecto. Se conserva como registro histórico de las decisiones
> de setup. **No es documentación viva**: varios pasos cambiaron durante la
> implementación (ver "Desviaciones" al final). Para operar el proyecto, usa
> el CLAUDE.md de la raíz.

---

# parrot-agent — Brief de ejecución para Claude Code

Eres el ingeniero responsable de construir este proyecto de inicio a fin. Al leer este archivo, **ejecuta las fases en orden, sin esperar instrucciones adicionales**, salvo en los puntos marcados como `[PAUSA]`, donde debes detenerte y pedirle al responsable del proyecto que complete un paso manual (logins, autorizaciones OAuth).

---

## Objetivo

Un agente construido con **eve** (framework open-source de Vercel, en beta) que:

1. Cada día hábil a las **9:00 AM hora de Ciudad de México** postee en un canal de Slack del equipo un resumen del proyecto de Jira: tareas pendientes, completadas ayer, en review y bloqueadas, agrupadas por persona.
2. Responda preguntas de seguimiento en el mismo canal/thread de Slack consultando Jira en vivo.
3. Viva en un **repo privado de GitHub** con control de cambios limpio y **cero secretos en el historial** (el repo se hará público en el futuro).

## Reglas no negociables

- **No inventes la API de eve.** Está en beta (junio 2026) y tu conocimiento de entrenamiento puede estar desactualizado. Después de instalar, lee la documentación local en `node_modules/eve/docs` antes de escribir cualquier archivo del agente. Si algo no está claro ahí, consulta https://eve.dev/docs.
- **Ningún secreto tocará jamás el repositorio.** Ni tokens, ni API keys, ni IDs internos. Todo valor sensible o específico del entorno va en variables de entorno. Antes de CADA commit, verifica que no haya secretos (ver Fase 5).
- **Commits atómicos y descriptivos** en cada fase completada, en español, formato: `feat: ...`, `chore: ...`, `docs: ...`.
- Si un comando falla, diagnostica y corrige antes de avanzar. No dejes fases a medias.

## Prerequisitos (verifícalos primero)

Ejecuta y reporta el resultado de:

```bash
node --version        # requiere Node 24+
git --version
gh --version          # GitHub CLI
vercel --version      # Vercel CLI (instala con: npm i -g vercel si falta)
gh auth status
vercel whoami
```

`[PAUSA]` Si `gh auth status` o `vercel whoami` fallan, pide al responsable del proyecto que corra `gh auth login` y `vercel login` en la terminal, y espera su confirmación antes de continuar.

---

## Fase 1 — Scaffold

Trabaja en la carpeta actual (ya fue creada por el responsable del proyecto con este archivo dentro).

```bash
npx eve@latest init .
```

Esto instala dependencias, inicializa Git y genera la estructura `agent/`. Si `init .` no soporta carpeta existente, hazlo en un subdirectorio temporal y mueve el contenido aquí preservando este `CLAUDE.md`.

Después: lee `node_modules/eve/docs` completo — en particular project structure, channels (Slack), connections, schedules y deployment.

## Fase 2 — Higiene de secretos (antes de escribir código)

1. Asegura que `.gitignore` incluya como mínimo:
   ```
   .env
   .env.*
   !.env.example
   .vercel
   node_modules
   ```
2. Crea `.env.example` (este SÍ se commitea) solo con nombres y placeholders:
   ```
   # Credencial de modelo para desarrollo local (en Vercel no se necesita: usa OIDC vía AI Gateway)
   AI_GATEWAY_API_KEY=
   # Canal de Slack donde postea el standup (se obtiene en Fase 7)
   STANDUP_SLACK_CHANNEL_ID=
   # Clave del proyecto de Jira a resumir, ej. PROY
   JIRA_PROJECT_KEY=
   ```
3. Crea `.env.local` real (ignorado por git) con los mismos nombres, valores vacíos por ahora.
4. Primer commit: `chore: scaffold eve + higiene de secretos`.

## Fase 3 — Construir el agente

Crea/edita estos archivos leyendo la sintaxis exacta de los docs locales:

**`agent/instructions.md`** — el rol. Contenido base (ajústalo al formato de los docs):

> Eres el analista de standup del equipo. Tu trabajo diario: consultar Jira (proyecto en `JIRA_PROJECT_KEY`) y producir un resumen ejecutivo en español para Slack con este formato: (1) 📊 Totales: pendientes / en progreso / en review / completadas ayer / bloqueadas. (2) 👤 Por persona: qué completó ayer y qué tiene activo. (3) 🚨 Alertas: tickets sin movimiento >3 días o bloqueados, con mención del responsable. Sé cuantitativo y directo, sin relleno. Usa siempre los tools de Jira, nunca inventes datos. Si te preguntan algo en Slack, consulta Jira en vivo antes de responder.

**`agent/agent.ts`** — configura el modelo (usa un Claude vía AI Gateway; elige el string de modelo válido según los docs).

**`agent/connections/jira.ts`** — conexión MCP al servidor oficial de Atlassian:
```
url: https://mcp.atlassian.com/v1/mcp
```
La autenticación OAuth la maneja Vercel Connect; no manejes tokens en código.

**`agent/channels/slack.ts`** — canal Slack según los docs (`slackChannel({ botName: "parrot-agent" })` o equivalente actual). Sin `SLACK_BOT_TOKEN` ni signing secrets: eve los resuelve vía Vercel Connect.

**`agent/schedules/daily-standup.ts`** — schedule con:
- `cron: "0 15 * * 1-5"` (Vercel Cron corre en UTC; 15:00 UTC = 9:00 AM CDMX, sin horario de verano)
- Handler que despierta al agente con el prompt "Genera y postea el standup diario" y entrega el resultado al canal de Slack usando `process.env.STANDUP_SLACK_CHANNEL_ID` como target. NUNCA hardcodees el channel ID.

Commit: `feat: agente de standup (instructions, jira, slack, schedule)`.

## Fase 4 — Prueba local

```bash
pnpm dev
```

`[PAUSA]` Pide al responsable del proyecto la `AI_GATEWAY_API_KEY` para `.env.local` si el dev server la requiere, y el `JIRA_PROJECT_KEY`.

En la terminal UI del dev server, prueba: "Genera el standup de hoy". Valida que la conexión a Jira funcione y el formato sea el pedido. **Nota:** el canal de Slack NO se puede probar en localhost (los eventos pasan por Vercel Connect al deployment); aquí solo se valida lógica y formato.

Itera hasta que el resumen salga bien. Commit: `feat: formato de standup validado en local`.

## Fase 5 — GitHub privado (con barrido de secretos)

1. Barrido pre-push. Ejecuta y revisa manualmente el output:
   ```bash
   git ls-files | xargs grep -lniE "(api[_-]?key|secret|token|password|xoxb-|sk-|Bearer )" || echo "LIMPIO"
   git log --all -p | grep -niE "(xoxb-|sk-ant|sk-proj|ghp_|AKIA)" || echo "HISTORIAL LIMPIO"
   ```
   Si aparece cualquier valor real: elimínalo, y si ya está en el historial, reescríbelo (`git filter-repo`) ANTES de subir nada.
2. Crea el repo privado y sube:
   ```bash
   gh repo create parrot-agent --private --source=. --push
   ```
3. Confirma con `gh repo view --json visibility` que sea `PRIVATE`.

## Fase 6 — Deploy a Vercel

```bash
vercel link
vercel deploy --prod    # o `eve deploy` si el CLI lo ofrece
```

Configura las env vars de producción (sin exponer valores en el repo):

```bash
vercel env add STANDUP_SLACK_CHANNEL_ID production
vercel env add JIRA_PROJECT_KEY production
```

Verifica en el output del deploy que el schedule quedó registrado como Vercel Cron Job.

## Fase 7 — Autorizaciones (manual)

`[PAUSA]` Indica al responsable del proyecto, con instrucciones exactas según los docs de eve/Vercel Connect, que debe:

1. En el dashboard de Vercel del proyecto: autorizar la conexión **Slack** (workspace del equipo) y **Atlassian** (OAuth de Vercel Connect).
2. En Slack: invitar al bot al canal elegido (ej. `#standup`) e ir a los detalles del canal para copiar el **Channel ID** (empieza con C).
3. Pasarte el Channel ID → tú lo cargas con `vercel env add` (nunca al repo) y redeploya.

## Fase 8 — Verificación final

1. Manda un mensaje al bot en Slack ("dame el standup de ahorita") y confirma que responde con datos reales de Jira.
2. Revisa el Agent Run en Vercel Observability (tokens, pasos, errores).
3. Confirma la hora de la próxima ejecución del cron en el dashboard.
4. Último barrido de secretos (repite los comandos de Fase 5.1).
5. **Reemplaza este CLAUDE.md** por uno de mantenimiento: descripción del proyecto en 5 líneas, estructura de archivos, cómo correr en dev, regla permanente de "cero secretos en el repo", y cómo cambiar horario/canal/proyecto. Mueve este brief a `docs/SETUP.md` como registro.
6. Commit final: `docs: proyecto operativo, brief archivado` y push.

## Reporte de cierre

Al terminar, entrega al responsable del proyecto: URL del repo, URL del deployment, hora exacta de la primera corrida automática, costo estimado por corrida (tokens del run de prueba), y lista de pendientes manuales si quedó alguno.

---

## Desviaciones del brief durante la implementación

Lo que cambió y por qué. Cada punto es una restricción real encontrada al
ejecutar, no una preferencia.

### 1. La conexión a Jira es user-scoped, no app-scoped

El brief pedía que Vercel Connect manejara el OAuth de Atlassian sin tokens en
código — eso se cumplió. Pero al crear el conector, Connect reportó:

```
"supportedSubjectTypes": ["user"]
```

El conector de Atlassian **no puede emitir un token de aplicación**. El diseño
app-scoped habría compilado y desplegado sin problema, y luego habría fallado en
la primera corrida del cron con `reason: "principal_required"`.

Consecuencia en cadena: un schedule recibe `appAuth`, que es
`principalType: "runtime"`, no un usuario. Así que el cron **no** puede usar
`appAuth`. En su lugar despacha bajo el principal de Slack de una persona real
(`STANDUP_AS_SLACK_USER_ID`), reutilizando el grant de Atlassian que esa persona
autorizó una vez desde Slack. Ver `agent/lib/slack-principal.ts`, que incluye la
advertencia de revisar el formato del principal al subir de versión de eve.

### 2. El orden de las fases cambió: deploy antes de la prueba local

El brief ponía la prueba local (Fase 4) antes del deploy (Fase 6). No es posible
en ese orden: probar Jira requiere un grant de OAuth, y ese grant solo se puede
otorgar desde Slack, que solo funciona en el deployment (los eventos pasan por
Vercel Connect). El orden real fue: deploy → conectores → autorización en Slack
→ prueba local.

### 3. `localDev()` no da un principal de usuario

`localDev()` autentica con `principalType: "local-dev"`. Como Jira es
user-scoped, la TUI de `eve dev` no podía llamar a Jira. Se agregó
`devStandupUser()` en `agent/channels/eve.ts`: opt-in con
`EVE_DEV_AS_STANDUP_USER=1`, solo en loopback, nunca cuando `VERCEL` está
definido. Sin eso no había forma de iterar el formato del standup sin postear al
canal real en cada ajuste.

### 4. La CLI de Vercel rompe el .gitignore de forma recurrente

`vercel link` y `vercel env pull` apendan `.env*` al final del `.gitignore`. Como
en `.gitignore` gana la **última** regla que coincide, eso anula el
`!.env.example` y la plantilla queda ignorada. Pasó tres veces durante el setup.

El síntoma es engañoso: `git check-ignore .env.example` no reporta nada porque un
archivo ya trackeado se sigue trackeando aunque una regla lo ignore. Solo se ve
con `--no-index`.

Por eso existe `scripts/check-secretos.sh` (`npm run check:secretos`), que lo
detecta automáticamente. Córrelo antes de cada push.

### 5. Scopes extra de Slack para seguimiento en thread

Para que el bot responda en un thread sin volver a mencionarlo, el conector
necesita `message.channels` (Trigger Event Types) y `channels:history` (Bot
Scopes), configurados a mano en **Advanced** en el dashboard de Connect. No
vienen con `--triggers`, que solo activa `app_mention` y `message.im`.

### 6. Herramientas y gestor de paquetes

El brief asumía `pnpm` y Node 24 ya instalados. El scaffold de eve generó
`package-lock.json`, así que el proyecto usa **npm**. Node 24 se instaló como keg
aparte (`brew install node@24`) sin tocar el Node default de la máquina, así que
los comandos requieren:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
```

`gh` y `vercel` también se instalaron con Homebrew.

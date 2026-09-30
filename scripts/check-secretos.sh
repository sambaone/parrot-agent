#!/usr/bin/env bash
#
# Barrido de secretos. Corre esto antes de cada push y antes de hacer el repo
# público. Sale con código 1 si algo huele mal.
#
#   npm run check:secretos
#
set -uo pipefail
cd "$(dirname "$0")/.."

fallas=0
fallo() {
  printf '\033[31m✗ %s\033[0m\n' "$1"
  fallas=$((fallas + 1))
}
ok() { printf '\033[32m✓ %s\033[0m\n' "$1"; }

echo "── 1. Los archivos .env reales están ignorados ──"
for f in .env .env.local .env.production; do
  if git check-ignore -q --no-index "$f"; then
    ok "$f ignorado"
  else
    fallo "$f NO está ignorado por .gitignore"
  fi
done

echo
echo "── 2. La plantilla .env.example sigue versionable ──"
# --no-index evita el falso negativo: un archivo ya trackeado se sigue
# trackeando aunque una regla lo ignore, así que sin este flag la regresión
# que introduce `vercel env pull` al apendar `.env*` pasaría desapercibida.
if git check-ignore -q --no-index .env.example; then
  fallo ".env.example quedó IGNORADO. Revisa el orden en .gitignore: algún
    \`.env*\` apendado abajo anula el \`!.env.example\`. Muévelo arriba del bloque."
else
  ok ".env.example no está ignorado"
fi

echo
echo "── 3. .env.example no trae valores, solo nombres ──"
if [ -f .env.example ]; then
  con_valor=$(grep -vE '^\s*#' .env.example | grep -E '=.+' || true)
  if [ -n "$con_valor" ]; then
    fallo ".env.example tiene valores asignados:"
    printf '    %s\n' "$con_valor"
  else
    ok ".env.example solo tiene nombres vacíos"
  fi
fi

echo
echo "── 4. Ningún archivo versionado contiene secretos ──"
# Patrones de valores reales, no de nombres de variable: buscamos el formato de
# los tokens, no la palabra "token", para no marcar documentación ni comentarios.
patrones='xox[abposr]-[A-Za-z0-9-]{10,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-proj-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJhbGciOi[A-Za-z0-9_-]{20,}'
if hallazgos=$(git ls-files -z | xargs -0 grep -nEI "$patrones" 2>/dev/null); then
  fallo "Posibles secretos en archivos versionados:"
  printf '    %s\n' "$hallazgos"
else
  ok "Sin secretos en los archivos versionados"
fi

echo
echo "── 5. Ningún secreto en el historial de git ──"
if hallazgos=$(git log --all -p --no-color 2>/dev/null | grep -nE "$patrones"); then
  fallo "Posibles secretos en el HISTORIAL de git (requiere git filter-repo):"
  printf '    %s\n' "$(echo "$hallazgos" | head -20)"
else
  ok "Historial limpio"
fi

echo
echo "── 6. Ningún archivo .env fue commiteado ──"
if envs=$(git ls-files | grep -E '(^|/)\.env' | grep -v '\.env\.example$'); then
  fallo "Archivos .env versionados:"
  printf '    %s\n' "$envs"
else
  ok "Solo .env.example está versionado"
fi

echo
echo "── 7. Ningún identificador interno, en archivos NI en mensajes de commit ──"
# Las comprobaciones 4 y 5 buscan FORMAS DE TOKEN. Eso deja pasar lo que no es
# una credencial pero sí identifica al equipo: el id del workspace de Slack, el
# cloudId del sitio de Atlassian, un correo personal, el slug del proyecto en
# Vercel. Una auditoría previa a hacer el repo público encontró exactamente eso
# —un team id y un user id de Slack— dentro de un MENSAJE de commit, donde
# ningún barrido de archivos lo habría visto nunca.
#
# Por eso esta comprobación mira las dos superficies: los archivos versionados y
# los mensajes de todos los commits.
# Patrones inequívocos: si aparecen, son reales.
identificadores='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b(prj|team|scl|sca|store|ir)_[A-Za-z0-9]{10,}\b|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[a-z0-9-]+\.atlassian\.net|claude\.ai/code/session_'

# Placeholders que la documentación usa a propósito. Si agregas uno nuevo a los
# docs, agrégalo aquí o el script lo marcará como hallazgo.
permitidos='U01ABCDEF|U01ABC|U02DEF|U02GHIJKL|noreply@|users\.noreply\.github\.com|@example\.|TEAM_ID|USER_ID'

hallazgos_id=$(
  { git ls-files -z | xargs -0 grep -nEI "$identificadores" 2>/dev/null
    git log --all --format='commit %h: %s%n%b' 2>/dev/null | grep -nE "$identificadores"
  } | grep -vE "$permitidos" || true
)

# Los ids de Slack (T…, U…, C…, A…) se buscan aparte porque su forma choca con
# las palabras en mayúsculas: `COPYRIGHT` y `CONNECTION` la cumplen igual de
# bien que un id real. Lo que las distingue es que un id real SIEMPRE trae
# dígitos, así que se extraen los candidatos y se descarta el que no tenga
# ninguno. Sin este filtro la licencia MIT dispara la alarma sola, y una alarma
# que grita sin razón se termina ignorando.
ids_slack=$(
  { git ls-files -z | xargs -0 grep -ohEI '\b[TUCA][0-9A-Z]{8,12}\b' 2>/dev/null
    git log --all --format='%s%n%b' 2>/dev/null | grep -ohE '\b[TUCA][0-9A-Z]{8,12}\b'
  } | grep -E '[0-9]' | sort -u | grep -vE "$permitidos" || true
)

if [ -n "$hallazgos_id" ] || [ -n "$ids_slack" ]; then
  fallo "Identificadores internos (revisa si son reales o placeholders):"
  [ -n "$hallazgos_id" ] && printf '    %s\n' "$hallazgos_id"
  [ -n "$ids_slack" ] && printf '    id tipo Slack: %s\n' "$ids_slack"
  echo "    Si están en un mensaje de commit, borrarlos de un archivo NO basta:"
  echo "    hay que reescribir el historial."
else
  ok "Sin identificadores internos"
fi

echo
if [ "$fallas" -eq 0 ]; then
  printf '\033[32mLIMPIO — %s comprobaciones sin hallazgos.\033[0m\n' 7
  exit 0
fi
printf '\033[31m%s comprobación(es) con hallazgos. NO hagas push.\033[0m\n' "$fallas"
exit 1

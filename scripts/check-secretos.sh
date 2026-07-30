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
if [ "$fallas" -eq 0 ]; then
  printf '\033[32mLIMPIO — %s comprobaciones sin hallazgos.\033[0m\n' 6
  exit 0
fi
printf '\033[31m%s comprobación(es) con hallazgos. NO hagas push.\033[0m\n' "$fallas"
exit 1

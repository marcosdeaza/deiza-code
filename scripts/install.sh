#!/usr/bin/env bash
set -e

# DEIZA CODE — Official CLI Installer
# https://deiza.org

C_GRANATE='\033[38;2;140;47;57m'
C_ROSE='\033[38;2;184;74;85m'
C_GRAY='\033[38;2;140;140;150m'
C_GREEN='\033[38;2;80;220;130m'
C_BOLD='\033[1m'
C_RESET='\033[0m'

printf "\n%bDEIZA CODE%b — Autonomous Terminal Coding Agent\n" "${C_GRANATE}${C_BOLD}" "${C_RESET}"
printf "%bIniciando instalación en tu sistema...%b\n\n" "${C_GRAY}" "${C_RESET}"

# 1. Comprobar Node.js
if ! command -v node >/dev/null 2>&1; then
  printf "%b✖ Error:%b Node.js (>= 18) no encontrado.\n" "${C_ROSE}" "${C_RESET}"
  printf "Instálalo desde https://nodejs.org antes de continuar.\n\n"
  exit 1
fi

NODE_VER=$(node -v | tr -d 'v' | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
  printf "%b! Aviso:%b Node.js v%s detectado. Se recomienda v18 o superior.\n" "${C_ROSE}" "${C_RESET}" "$NODE_VER"
fi

# 2. Determinar directorio de instalación
TARGET_DIR="/usr/local/bin"
SUDO=""

if [ ! -w "$TARGET_DIR" ]; then
  if command -v sudo >/dev/null 2>&1 && [ -t 0 ]; then
    SUDO="sudo"
  else
    TARGET_DIR="$HOME/.local/bin"
    mkdir -p "$TARGET_DIR"
  fi
fi

# 3. Descargar binario
printf "  %b●%b Descargando binarios... " "${C_GRANATE}" "${C_RESET}"
TMP_FILE=$(mktemp)
curl -fsSL https://deiza.org/downloads/deiza-code.js -o "$TMP_FILE"
printf "%b[OK]%b\n" "${C_GREEN}" "${C_RESET}"

# 4. Configurar ejecutables
printf "  %b●%b Configurando ejecutables en %s... " "${C_GRANATE}" "${C_RESET}" "$TARGET_DIR"
$SUDO cp "$TMP_FILE" "$TARGET_DIR/deiza-code"
$SUDO chmod 755 "$TARGET_DIR/deiza-code"
$SUDO ln -sf "$TARGET_DIR/deiza-code" "$TARGET_DIR/deiza"
rm -f "$TMP_FILE"
printf "%b[OK]%b\n" "${C_GREEN}" "${C_RESET}"

# 5. Finalización limpia
printf "\n%b✓ Instalación completada con éxito.%b\n\n" "${C_GREEN}${C_BOLD}" "${C_RESET}"
printf "Inicia el agente con:\n"
printf "  %bdeiza%b\n\n" "${C_GRANATE}${C_BOLD}" "${C_RESET}"

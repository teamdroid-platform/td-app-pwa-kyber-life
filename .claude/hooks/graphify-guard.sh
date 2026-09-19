#!/bin/sh
# Guarda de graphify para los hooks PreToolUse.
#
# Existe porque la version anterior fijaba en settings.json la ruta absoluta del
# binario en UNA maquina Windows ("C:/Users/.../graphify.EXE"). Ese archivo esta
# versionado y compartido, asi que en cualquier otro sitio -Linux, macOS, un
# contenedor, otra persona- el hook no hacia nada y no lo decia: Claude Code manda
# el stderr de un hook que no bloquea al log de depuracion, nunca al transcript.
#
# Aca se resuelve el binario por PATH y, si no esta, por la ubicacion habitual de
# instalacion, cubriendo el caso de que ~/.local/bin no este en el PATH de Git Bash.
# Si no aparece por ningun lado se sale con 0 a proposito: graphify es una ayuda
# para navegar el codigo, no un requisito para editarlo, y que su ausencia
# entorpeciera cada Bash o cada Read seria peor que no tenerlo.
#
# Hooks: sh -c en Unix, Git Bash en Windows -> shell POSIX en ambos, una sola forma.
# $1 es el modo que pasa settings.json: "search" (Bash|Grep) o "read" (Read|Glob).

modo="$1"
[ -n "$modo" ] || exit 0

for cand in graphify "$HOME/.local/bin/graphify" "$HOME/.local/bin/graphify.EXE"; do
  if command -v "$cand" >/dev/null 2>&1; then
    exec "$cand" hook-guard "$modo"
  fi
done

exit 0

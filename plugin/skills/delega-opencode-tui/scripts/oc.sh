#!/usr/bin/env bash
# oc.sh: fala com a TUI do OpenCode aberta com --port (padrão 4096).
#   oc.sh open <pasta> <título>          abre a TUI numa janela nova (se não estiver aberta), já com uma sessão
#                                        de nome <título> selecionada na tela; imprime o id (ses_...)
#   oc.sh check                          servidor responde? mostra a pasta e as sessões ocupadas
#   oc.sh new <título>                   cria sessão, mostra na TUI e imprime o id
#   oc.sh send <sid> <task.md> <frase>   mostra a sessão na TUI, cola frase + pacote e envia
#   oc.sh wait <sid> [timeout_s]         bloqueia até a sessão terminar (rode em background)
#   oc.sh report <sid> [out.json]        resume a última resposta: bridge-relatorio, tokens, custo, negadas
# Variáveis: OC_PORT (padrão 4096), OC_AGENT (padrão bridge-dev), OC_MODEL (provider/model, opcional).
set -euo pipefail
PORT="${OC_PORT:-4096}"; AGENT="${OC_AGENT:-bridge-dev}"
B="http://127.0.0.1:$PORT"
D="$(cd "$(dirname "$0")" && pwd)"
PY=""  # o primeiro que roda de verdade (no Windows, "python3" pode ser o atalho da Microsoft Store, que não executa)
for p in python3 python py; do "$p" --version >/dev/null 2>&1 && { PY="$p"; break; }; done
[ -n "$PY" ] || { echo "Python 3 não encontrado no PATH (precisa de python3, python ou py)."; exit 1; }
cmd="${1:-}"; shift || true

no_ar() { curl -sf -m 3 "$B/path" >/dev/null 2>&1; }

nativo() { command -v cygpath >/dev/null 2>&1 && cygpath -w "$1" || echo "$1"; }

mesma_pasta() {  # o OpenCode nesta porta está aberto em $1?
  curl -s -m 5 "$B/path" | "$PY" -I -c "
import json,os,sys
d=json.load(sys.stdin); s=d.get('directory') or d.get('worktree') or ''
n=lambda p: os.path.normcase(os.path.normpath(p))
print(s); sys.exit(0 if n(s)==n(sys.argv[1]) else 1)" "$(nativo "$1")"
}

mostrar() {  # põe a sessão na tela da TUI
  curl -sf -m 5 -X POST "$B/tui/select-session" -H "Content-Type: application/json" -d "{\"sessionID\":\"$1\"}" >/dev/null \
    || echo "AVISO: não consegui mostrar $1 na TUI (servidor sem TUI?)" >&2
}

criar() {
  "$PY" -I -c "import json,sys;print(json.dumps({'title':sys.argv[1]}))" "$1" \
    | curl -sf -m 10 -X POST "$B/session" -H "Content-Type: application/json" --data-binary @- \
    | "$PY" -I -c "import json,sys;print(json.load(sys.stdin)['id'])"
}

abrir_janela() {  # $1 = pasta. Abre a TUI numa janela de terminal nova, com a trava ligada.
  local dir="$1" extra=""
  [ -n "${OC_MODEL:-}" ] && extra=" -m $OC_MODEL"
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      # Start-Process abre um console novo mesmo quando o Git Bash não tem janela própria.
      local w; w="$(nativo "$dir")"
      # "set PWD=": o PWD herdado do Git Bash faz o "opencode ." abrir na pasta errada.
      powershell.exe -NoProfile -Command "Start-Process cmd -WorkingDirectory '$w' -ArgumentList '/k \"title opencode $PORT && set PWD=&& set BRIDGE_GUARD=1&& opencode . --port $PORT --agent $AGENT$extra\"'" ;;
    Darwin)
      osascript -e "tell application \"Terminal\" to do script \"cd '$dir' && BRIDGE_GUARD=1 opencode . --port $PORT --agent $AGENT$extra\"" \
                -e 'tell application "Terminal" to activate' >/dev/null ;;
    *)
      local run="cd '$dir' && BRIDGE_GUARD=1 opencode . --port $PORT --agent $AGENT$extra; exec bash"
      if command -v gnome-terminal >/dev/null 2>&1; then gnome-terminal -- bash -lc "$run"
      elif command -v konsole >/dev/null 2>&1; then konsole -e bash -lc "$run" &
      elif command -v x-terminal-emulator >/dev/null 2>&1; then x-terminal-emulator -e bash -lc "$run" &
      else return 1; fi ;;
  esac
}

case "$cmd" in
  open)
    DIR="$(cd "${1:?pasta do projeto/worktree}" && pwd)"; T="${2:?título da sessão}"
    if ! no_ar; then
      command -v opencode >/dev/null || { echo "opencode não está no PATH. Instale: npm i -g opencode-ai"; exit 1; }
      abrir_janela "$DIR" || {
        echo "Não achei um terminal para abrir. Rode você mesmo, em outra janela:"
        echo "  cd \"$DIR\" && BRIDGE_GUARD=1 opencode . --port $PORT --agent $AGENT"
        echo "e depois: oc.sh new \"$T\""; exit 1; }
      for _ in $(seq 1 60); do no_ar && break; sleep 1; done
      no_ar || { echo "A janela abriu, mas o OpenCode não respondeu em $B em 60 s. Veja a janela."; exit 1; }
      sleep 2  # a TUI termina de desenhar antes de aceitar comandos
    fi
    if ! outra="$(mesma_pasta "$DIR")"; then
      echo "A porta $PORT já tem um OpenCode aberto em outra pasta ($outra). Não mexi nele."
      echo "Use outra porta: OC_PORT=$((PORT + 1)) oc.sh open \"$DIR\" \"$T\" (e o mesmo OC_PORT nos outros comandos)."
      exit 4
    fi
    S="$(criar "$T")"; mostrar "$S"
    echo "$S"
    ;;
  check)
    no_ar || { echo "OpenCode fora do ar em $B. Use: oc.sh open <pasta> <título>"; exit 1; }
    curl -s -m 5 "$B/path" | "$PY" -I -c "import json,sys;d=json.load(sys.stdin);print('dir:',d.get('directory') or d.get('worktree') or d)"
    echo "status: $(curl -s -m 5 "$B/session/status")"
    ;;
  new)
    S="$(criar "${1:?título}")"; mostrar "$S"; echo "$S"
    ;;
  send)
    S="${1:?sid}"; T="${2:?task.md}"; H="${3:?frase}"
    J="$(mktemp)"; trap 'rm -f "$J"' EXIT
    "$PY" -I -c "
import json,sys
t=open(sys.argv[1],encoding='utf-8').read()
open(sys.argv[3],'w',encoding='utf-8').write(json.dumps({'text':sys.argv[2]+'\n\n'+t}))
" "$T" "$H" "$J"
    mostrar "$S"
    curl -sf -m 5 -X POST "$B/tui/clear-prompt" >/dev/null
    curl -sf -m 10 -X POST "$B/tui/append-prompt" -H "Content-Type: application/json; charset=utf-8" --data-binary @"$J" >/dev/null
    curl -sf -m 5 -X POST "$B/tui/submit-prompt" >/dev/null
    sleep 5
    st="$(curl -s -m 5 "$B/session/status")"
    case "$st" in *"$S"*) echo "enviado: $S ocupada";; *) echo "AVISO: $S não ficou ocupada ($st). Confira a TUI."; exit 2;; esac
    ;;
  wait)
    S="${1:?sid}"; L="${2:-2700}"; t0=$SECONDS
    while curl -s -m 5 "$B/session/status" | grep -q "$S"; do
      (( SECONDS - t0 > L )) && { echo "timeout após ${L}s: $S ainda ocupada"; exit 3; }
      sleep 30
    done
    echo "livre: $S após $((SECONDS - t0))s"
    ;;
  report)
    S="${1:?sid}"; O="${2:-}"
    curl -sf -m 20 "$B/session/$S/message" | "$PY" -I "$D/relatorio.py" ${O:+--out "$O"}
    ;;
  *)
    sed -n '2,11p' "$0"; exit 1;;
esac

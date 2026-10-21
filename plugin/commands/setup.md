---
description: Instala o agente bridge-dev e o plugin bridge-guard na config global do OpenCode e confere se está tudo pronto para a skill delega-opencode-tui.
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/install.js), Bash(opencode --version), Bash(opencode agent list), Bash(opencode models), Bash(curl --version), Bash(python3 --version), Bash(python --version), Bash(git --version)
---

# /delega-opencode-tui:setup

1. Rode `node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js"` e mostre a saída.
2. Rode `opencode --version`. Falhou → diga que o OpenCode não está no PATH (instalação: `npm i -g opencode-ai`, ou https://opencode.ai) e pare.
3. Rode `opencode agent list` e confirme a linha `bridge-dev (primary)`.
4. Rode `opencode models` e confirme que há ao menos um modelo; nenhum → o usuário precisa de `opencode auth login`.
5. Confira `git --version`, `curl --version` e `python3 --version` (ou `python --version`). No Windows os scripts rodam no Git Bash.
6. Responda numa tabela curta: item, ok/falta, o que fazer. O `opencode.json` do usuário não é alterado.

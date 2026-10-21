---
name: delega-opencode-tui
description: Claude é o dev sênior e o OpenCode é o dev, numa TUI que o usuário acompanha ao vivo. Abre a TUI do OpenCode numa janela nova já com uma sessão de nome por ticket, envia o pacote (spec + REQ-n + arquivos permitidos + teste), espera terminar, lê o bloco bridge-relatorio, grava a rubrica de entrega, verifica sozinho (suíte, diff, fronteira, reviewer novo) e devolve achados na mesma sessão até aprovar ou bater 3 rodadas. Use sempre que o usuário pedir para delegar ao OpenCode, "manda pro opencode", "o opencode é o dev", "quero ver o opencode trabalhando", "abre o opencode e passa a tarefa", "cria a sessão no opencode", "segue para o próximo ticket com o opencode", ou quiser que outro agente implemente enquanto o Claude revisa.
---

# delega-opencode-tui

Você planeja, revisa e aceita. O OpenCode implementa numa TUI que o usuário vê. O relatório dele orienta; o que prova é o comando que você roda.

`OC` = `bash "<Base directory desta skill>/scripts/oc.sh"` (o Claude Code mostra o "Base directory" ao carregar a skill). Pacote modelo: `pacote.md` nesta pasta. Porta: `OC_PORT` (padrão 4096) — use o mesmo valor em todos os comandos da demanda.

## Antes de começar

1. `opencode --version` responde e `opencode agent list` mostra `bridge-dev`. Falta → rode o comando `/delega-opencode-tui:setup` (ou `node <raiz do plugin>/scripts/install.js`). O agente define o bloco `bridge-relatorio`; o plugin `bridge-guard` barra git de escrita, `gh`, segredo gravado em arquivo e teste apagado ou pulado.
2. Worktree limpa e na branch do ticket: `git -C <WT> status --short` vazio; `git -C <WT> switch -c <feat|fix|chore>/<nn>-<slug> origin/<base>`. Anote o `HEAD` (serve para pegar commit indevido).
3. `OUT` = `<repo principal>/.opencode-bridge/<slug>/`, fora do git (acrescente `.opencode-bridge/` ao `.git/info/exclude`). Ali ficam pacotes, resultados e a rubrica.

## Abrir o OpenCode já na sessão

`SID=$(OC open <WT> "<nn>-<slug>")`

- TUI fechada → abre uma janela de terminal nova com `BRIDGE_GUARD=1 opencode <WT> --port <porta> --agent bridge-dev`, espera responder, cria a sessão com esse nome e a põe na tela. O usuário só olha a janela; não precisa achar sessão nenhuma.
- TUI já aberta na mesma pasta → só cria a sessão e a mostra.
- Porta ocupada por OpenCode de outra pasta → sai com código 4 sem tocar nele. Use `OC_PORT=<outra>`.
- Sem terminal gráfico (servidor, SSH) → imprime o comando para o usuário rodar e depois `OC new "<título>"`.

Diga ao usuário o nome da sessão e que a janela "opencode <porta>" mostra o trabalho ao vivo. Próximo ticket na mesma TUI: `SID=$(OC new "<nn>-<slug>")`.

## Uma rodada

1. **Pacote** `OUT/<nn>-r<n>.task.md` a partir de `pacote.md`. Spec com fatos lidos agora (`arquivo:linha`, doc oficial), REQ-n verificáveis um por linha, arquivos permitidos em glob, comando de teste exato. Nunca segredo, token, senha ou dado pessoal; use marcador falso (`<TOKEN>`). O OpenCode não pode perguntar nada: o que faltar no pacote vira chute dele.
2. **Enviar** (rodada 2+ na mesma `SID`, que guarda o contexto): `OC send $SID OUT/<nn>-r<n>.task.md "Rodada <n> do ticket #<nn>. Execute o pacote abaixo exatamente como descrito, no diretório atual."`. Saída `AVISO` → olhe a TUI antes de seguir.
3. **Esperar**: `OC wait $SID` com `run_in_background: true`; espere a notificação, sem sleep nem polling no meio. Timeout padrão 2700 s.
4. **Ler**: `OC report $SID OUT/<nn>-r<n>.result.json`.

   | `motivo` | O que fazer |
   |---|---|
   | `done` | Verificar (passo 5) |
   | `blocked` | Leia `relatorio.bloqueio`. Dado que você tem → responda na próxima rodada. Credencial, decisão de produto, escopo novo → escale ao usuário |
   | `sem-relatorio` | Achado: "termine com o bloco bridge-relatorio" + o que faltou (`texto_final` mostra onde parou) |
   | `erro-opencode` | Leia `erro_msg`. Uma nova tentativa na mesma sessão; falhou de novo → escale com a evidência |

   `negadas` mostra o que a trava barrou. Nunca afrouxe trava para ele passar.
5. **Verificar você mesmo**, sem confiar no relatório:
   - Comando de teste do pacote e a suíte inteira do projeto, rodados por você na worktree. Guarde a linha final real.
   - `git -C <WT> log <HEAD anotado>..HEAD` vazio (commitou → `git reset --soft <HEAD>` e vira achado).
   - `git -C <WT> status --short --untracked-files=all` só com arquivos dentro dos permitidos; fora → achado "reverta X".
   - Reviewer **novo a cada rodada** (subagent de revisão, senão `general-purpose`): spec e REQ-n literais, como ver o diff, veredito `APROVADO`/`REPROVADO` com `arquivo:linha` por REQ, defeito real e não estilo, "não edite nada". Reviewer reaproveitado defende o veredito anterior.
   - Mudança visual → confira no navegador.
6. **Rubrica**: acrescente a entrada em `OUT/rubrica-entrega.md` (formato abaixo), aprovado ou não.
7. **Reprovado** → pacote `r<n+1>` com "Achados a corrigir" preenchido com o texto literal de cada falha, volte ao passo 2. Passou de 3 rodadas → pare e peça decisão ao usuário com a evidência das rodadas.
8. **Aprovado** → fechamento do ticket.

## Rubrica de entrega

Uma entrada por rodada, em `OUT/rubrica-entrega.md`:

```markdown
## #<nn> r<n> — <APROVADO|REPROVADO>
- sessão: <SID> · modelo: <modelo> · tokens in/out: <i>/<o> · custo: <custo>
- relatório: status <done|blocked>; REQ: <REQ-1 arquivo:linha; ...>
- negadas: <n ou "nenhuma"> · fora da lista: <arquivos ou "nenhum"> · commit indevido: <sim/não>
- teste (rodado pelo Claude): `<comando>` → <linha final real>
- reviewer: <veredito> — <achados com arquivo:linha ou "sem achados">
```

## Fechamento do ticket

Siga o fluxo do projeto (CLAUDE.md). Padrão:

1. `git status` antes; `git add` só dos arquivos da rodada (nunca `-A`); Conventional Commits.
2. Push, PR, merge e deploy: só com autorização explícita do usuário. Sem ela → pare aqui e peça. Autorização "segue sem pedir" vale para tickets aprovados; credencial, infraestrutura, decisão de produto, escopo novo e 4ª rodada ainda pedem OK.
3. Atualize o checkout principal e solte a worktree para o próximo ticket.
4. Tracker do projeto: comentário com a rubrica resumida; fechado só com evidência.
5. Próximo ticket: `OC new` (sessão nova, com nome).

## Armadilhas conhecidas

- `send` sempre põe a sessão na tela da TUI antes de colar o pacote; o usuário vê a rodada começar.
- O pacote vai por arquivo JSON em UTF-8; texto direto no `-d` do curl quebra acentos no Git Bash.
- O OpenCode edita pela pasta em que a TUI abriu. Pacote com caminho absoluto de outro checkout é recusado pelo agente: use caminhos relativos à worktree.
- Sem `BRIDGE_GUARD=1` a trava fica inerte (o `open` liga sozinho). Se o usuário abriu a TUI à mão, confira.
- `wait` olha `/session/status`: a sessão some da lista quando termina.

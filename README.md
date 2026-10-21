# delega-opencode-tui

**O Claude Code como dev sênior e o OpenCode como dev, trabalhando juntos numa tela que você acompanha ao vivo.**

Você conversa com o Claude Code. Ele escreve uma tarefa bem fechada (o "pacote"), abre o OpenCode numa janela nova já na sessão certa e manda o pacote. Depois espera o OpenCode terminar e lê o relatório final. Em seguida confere tudo sozinho (roda os testes, olha o diff, chama um revisor novo) e devolve os problemas até a tarefa ser aprovada. Cada rodada fica registrada numa **rubrica de entrega**.

Você não precisa saber abrir o OpenCode nem achar a sessão: a skill faz isso e mostra a sessão na tela.

> **English summary:** a Claude Code plugin/skill that delegates coding tickets to [OpenCode](https://opencode.ai) running in a visible TUI. Claude writes a closed task package (spec, acceptance criteria, allowed files, exact test command), opens OpenCode in a new terminal window already on a named session, sends the package, waits, parses the agent's `bridge-relatorio` JSON report, verifies everything itself (tests, diff, file boundary, fresh reviewer) and loops back findings until approved (max 3 rounds). Includes a guard plugin that blocks git writes, `gh`, secrets written to files and deleted/skipped tests inside OpenCode. Docs are in Portuguese; the scripts work on Windows (Git Bash), macOS and Linux.

---

## Sumário

1. [Para quem é](#para-quem-é)
2. [Como funciona](#como-funciona)
3. [O que vem no pacote](#o-que-vem-no-pacote)
4. [Requisitos](#requisitos)
5. [Instalação](#instalação)
6. [Primeiro uso, passo a passo](#primeiro-uso-passo-a-passo)
7. [O pacote de tarefa](#o-pacote-de-tarefa)
8. [O relatório do OpenCode e a rubrica de entrega](#o-relatório-do-opencode-e-a-rubrica-de-entrega)
9. [Comandos do oc.sh](#comandos-do-ocsh)
10. [Travas de segurança](#travas-de-segurança)
11. [Privacidade e dados sensíveis](#privacidade-e-dados-sensíveis)
12. [Configuração](#configuração)
13. [Problemas comuns](#problemas-comuns)
14. [Limitações](#limitações)
15. [Desenvolvimento](#desenvolvimento)
16. [Licença](#licença)

---

## Para quem é

- Quem usa o **Claude Code** e quer que **outro modelo** (pelo OpenCode: GPT, Gemini, GLM, Qwen, modelos locais etc.) escreva o código, enquanto o Claude planeja e revisa.
- Quem quer **ver** o agente trabalhando, em vez de um processo escondido em segundo plano.
- Quem quer um processo com prova: o ticket só é aprovado com teste verde rodado pelo Claude e revisão independente, não porque o agente disse "pronto".

## Como funciona

```
 Você ──conversa──► Claude Code (dev sênior)
                       │  1. escreve o pacote (spec + REQ-n + arquivos + teste)
                       │  2. oc.sh open  → abre a janela do OpenCode já na sessão "12-login"
                       │  3. oc.sh send  → cola o pacote na TUI e envia
                       ▼
                 OpenCode TUI (dev, agente bridge-dev)      ◄── você assiste aqui
                       │  TDD, edita só os arquivos permitidos,
                       │  termina com o bloco ```json bridge-relatorio
                       ▼
                 Claude Code
                       │  4. oc.sh wait / report → lê o relatório
                       │  5. roda os testes, olha o diff, chama um revisor novo
                       │  6. grava a rubrica de entrega
                       ├── reprovado → pacote r2 com os achados, mesma sessão (até 3 rodadas)
                       └── aprovado  → commit (push/PR/merge só com a sua autorização)
```

O Claude fala com o OpenCode pela API HTTP local que a TUI abre com `--port` (só em `127.0.0.1`). Nenhum serviço externo é usado além do provedor de modelo que você já configurou no OpenCode.

## O que vem no pacote

```
.claude-plugin/marketplace.json          catálogo para o /plugin do Claude Code
plugin/
  .claude-plugin/plugin.json
  commands/setup.md                       /delega-opencode-tui:setup
  skills/delega-opencode-tui/
    SKILL.md                              o processo que o Claude segue
    pacote.md                             modelo de pacote de tarefa
    scripts/oc.sh                         open, check, new, send, wait, report
    scripts/relatorio.py                  lê as mensagens da sessão e resume a rodada
  opencode/agents/bridge-dev.md           agente do OpenCode (TDD + bloco de relatório)
  opencode/plugins/bridge-guard.js        travas dentro do OpenCode
  scripts/install.js                      copia agente e travas para ~/.config/opencode
tests/                                     testes (node --test)
```

## Requisitos

| Item | Para quê | Como conferir |
|---|---|---|
| [Claude Code](https://docs.claude.com/en/docs/claude-code) | quem planeja e revisa | `claude --version` |
| [OpenCode](https://opencode.ai) | quem implementa | `opencode --version` |
| Um modelo configurado no OpenCode | o "cérebro" do dev | `opencode models` (vazio → `opencode auth login`) |
| Node.js 18+ | instalador e testes | `node --version` |
| Git | worktree, diff, commit | `git --version` |
| Bash + curl | os scripts | `bash --version`, `curl --version` |
| Python 3 | leitura do relatório | `python3 --version` ou `python --version` |

**Windows:** instale o [Git for Windows](https://git-scm.com/download/win), que traz o Git Bash, o bash e o curl. O Claude Code no Windows já usa o Git Bash para rodar comandos. Instale o Python pelo [python.org](https://www.python.org/downloads/) e marque "Add to PATH"; o atalho da Microsoft Store não serve.
**macOS:** `brew install git python node`; o curl já vem no sistema.
**Linux:** `sudo apt install git curl python3 nodejs` (ou o equivalente da sua distribuição). Para a janela abrir sozinha, é preciso ter `gnome-terminal`, `konsole` ou `x-terminal-emulator`.

Instalar o OpenCode: `npm i -g opencode-ai` (ou veja outras formas em https://opencode.ai).

## Instalação

### Opção A — como plugin do Claude Code (recomendado)

Dentro do Claude Code:

```
/plugin marketplace add giovani-junior-dev/delega-opencode-tui
/plugin install delega-opencode-tui@delega-opencode-tui
```

Reinicie o Claude Code e rode:

```
/delega-opencode-tui:setup
```

O setup copia o agente `bridge-dev` e a trava `bridge-guard` para `~/.config/opencode/` e confere se o OpenCode, o modelo, o git, o curl e o Python estão prontos. Se já existir um arquivo diferente com o mesmo nome, ele guarda uma cópia `.bak-<data>` antes. O seu `opencode.json` não é alterado.

### Opção B — cópia manual

```bash
git clone https://github.com/giovani-junior-dev/delega-opencode-tui.git
cd delega-opencode-tui
mkdir -p ~/.claude/skills
cp -r plugin/skills/delega-opencode-tui ~/.claude/skills/
node plugin/scripts/install.js        # agente + travas no OpenCode
opencode agent list                   # deve aparecer: bridge-dev (primary)
```

Para instalar só num projeto, copie a pasta da skill para `<projeto>/.claude/skills/`.

### Conferir

No Claude Code, pergunte: "quais skills você tem?". A `delega-opencode-tui` deve aparecer. No terminal, `opencode agent list` deve mostrar `bridge-dev`.

## Primeiro uso, passo a passo

1. Abra o Claude Code na pasta do seu projeto (um repositório git com testes que rodam por um comando, como `npm test` ou `pytest`).
2. Peça algo como:
   > Delega para o opencode: adicionar validação de e-mail no formulário de cadastro. Quero ver ele trabalhando.
3. O Claude:
   - cria uma branch (e, se for o caso, uma worktree) para o ticket;
   - escreve o pacote em `.opencode-bridge/<slug>/<nn>-r1.task.md`;
   - abre uma **janela nova** com o OpenCode já na sessão com o nome do ticket (por exemplo `12-validacao-email`);
   - envia o pacote: você vê o texto aparecer e o agente começar.
4. Acompanhe na janela "opencode 4096". Não digite nada nela enquanto a rodada roda.
5. Quando o OpenCode termina, o Claude lê o relatório, roda os testes, revisa o diff e:
   - **reprovado:** manda a rodada 2 na mesma sessão, com os problemas exatos;
   - **aprovado:** faz o commit e pergunta antes de push, PR ou merge.
6. A rubrica de cada rodada fica em `.opencode-bridge/<slug>/rubrica-entrega.md`.

Outras frases que acionam a skill: "manda pro opencode", "o opencode é o dev", "abre o opencode e passa a tarefa", "segue para o próximo ticket com o opencode".

Para o Claude seguir de ticket em ticket sem pedir aprovação a cada merge, diga isso explicitamente, por exemplo: "aprovado, segue para o próximo sem me perguntar". Credenciais, infraestrutura, decisões de produto, escopo novo e uma 4ª rodada continuam pedindo o seu OK.

## O pacote de tarefa

O OpenCode não pode fazer perguntas, então o pacote precisa ser fechado. Modelo em [`plugin/skills/delega-opencode-tui/pacote.md`](plugin/skills/delega-opencode-tui/pacote.md):

```markdown
# [opencode 12-validacao-email 12 r1]

## Objetivo
O formulário de cadastro recusa e-mail inválido antes de enviar.

## Spec
Hoje `src/cadastro.ts:40` envia sem validar. ...

## Critérios de aceite
REQ-1 `validarEmail("a@b.co")` → true; `validarEmail("a@")` → false. Teste unitário.
REQ-2 O botão Enviar fica desabilitado com e-mail inválido. Teste de render.

## Achados a corrigir
nenhum

## Arquivos permitidos
src/cadastro.ts
src/validacao.ts
tests/**

## Teste
comando exato: `npm test` deve terminar verde

## Regras
- TDD, não commitar, não tocar fora da lista, não apagar nem pular teste ...

## Relatório final
Termine com o bloco `json bridge-relatorio` ...
```

Da rodada 2 em diante, "Achados a corrigir" traz o texto literal de cada falha: a saída do teste e o achado do revisor com `arquivo:linha`.

## O relatório do OpenCode e a rubrica de entrega

O agente `bridge-dev` termina toda resposta com:

````
```json bridge-relatorio
{"status":"done","req":{"REQ-1":"src/validacao.ts:3"},"teste":{"cmd":"npm test","exit":0,"resumo":"Tests 42 passed"},"arquivos":["src/validacao.ts"],"bloqueio":null,"notas":""}
```
````

`oc.sh report <sid>` transforma as mensagens da sessão num resumo:

```json
{
  "motivo": "done",
  "relatorio": { "status": "done", "req": {"REQ-1": "src/validacao.ts:3"}, "...": "..." },
  "modelo": "provedor/modelo",
  "custo": 0.0123,
  "tokens": { "input": 52761, "output": 200, "reasoning": 52, "cache_read": 52096 },
  "ferramentas": { "read": 3, "edit": 2, "bash": 4 },
  "negadas": [],
  "erros": [],
  "erro_msg": null,
  "texto_final": "..."
}
```

| `motivo` | Significado |
|---|---|
| `done` | O agente diz que terminou. O Claude ainda verifica tudo |
| `blocked` | O agente parou e explica o que falta em `relatorio.bloqueio` |
| `sem-relatorio` | Terminou sem o bloco: a rodada é reprovada |
| `erro-opencode` | Erro do provedor ou do OpenCode (`erro_msg`) |

Por padrão o resumo considera só a rodada atual, ou seja, as mensagens depois do último envio. `--todas` olha a sessão inteira.

A rubrica (`rubrica-entrega.md`) ganha uma entrada por rodada:

```markdown
## #12 r1 — APROVADO
- sessão: ses_... · modelo: provedor/modelo · tokens in/out: 52761/200 · custo: 0.0123
- relatório: status done; REQ: REQ-1 src/validacao.ts:3; REQ-2 src/cadastro.ts:52
- negadas: nenhuma · fora da lista: nenhum · commit indevido: não
- teste (rodado pelo Claude): `npm test` → Tests 44 passed
- reviewer: APROVADO — sem achados
```

## Comandos do oc.sh

O Claude roda estes comandos sozinho. Você pode usá-los à mão para testar.

| Comando | O que faz |
|---|---|
| `oc.sh open <pasta> <título>` | Abre o OpenCode numa janela nova (se não estiver aberto), já com uma sessão `<título>` na tela. Imprime o id `ses_...` |
| `oc.sh check` | Diz se o OpenCode responde, em que pasta está e quais sessões estão ocupadas |
| `oc.sh new <título>` | Cria outra sessão com nome e a põe na tela (próximo ticket) |
| `oc.sh send <sid> <task.md> <frase>` | Mostra a sessão, cola frase + pacote e envia |
| `oc.sh wait <sid> [segundos]` | Espera a sessão terminar (padrão 2700 s) |
| `oc.sh report <sid> [saida.json]` | Resume a última rodada (tabela acima) |

Exemplo à mão:

```bash
OC=~/.claude/skills/delega-opencode-tui/scripts/oc.sh   # ou o caminho dentro do plugin
SID=$(bash $OC open . "00-teste")
bash $OC send $SID minha-tarefa.md "Rodada 1. Execute o pacote abaixo."
bash $OC wait $SID && bash $OC report $SID
```

## Travas de segurança

Dentro do OpenCode há duas camadas:

1. **Permissões do agente `bridge-dev`**: negam `git commit/push/reset/checkout/switch/rebase/merge/clean/stash/worktree`, `gh`, `rm -rf`, `npm publish`, perguntas ao usuário, subagentes e acesso a pastas fora do projeto.
2. **Plugin `bridge-guard`**, ligado por `BRIDGE_GUARD=1` (o `oc.sh open` liga sozinho). Ele barra:
   - git de escrita e `gh`, também dentro de comandos compostos;
   - **segredo real gravado em arquivo**: tokens da AWS, do GitHub, do Slack, do Stripe, do Google, da Anthropic e da OpenAI, chave privada e `password/secret/token = "..."` longo. Placeholders óbvios passam;
   - **remoção de caso de teste**, marcador novo de pular teste (`.skip`, `.only`, `xit`, `@pytest.mark.skip`…) e apagar ou mover arquivo de teste;
   - ferramenta de escrita desconhecida (falha fechada).

Depois de cada rodada, o Claude ainda confere se houve commit indevido (HEAD), se algum arquivo ficou fora da lista e se a suíte passa.

> As travas são uma rede contra engano, não um sandbox. Use o OpenCode só em repositórios de sua confiança e revise o diff antes de qualquer push.

## Privacidade e dados sensíveis

- O pacote nunca deve levar senha, token, chave ou dado pessoal; a skill instrui o Claude a usar marcadores falsos (`<TOKEN>`). Segredo fica no `.env` (fora do git), preenchido por você.
- Pacotes, resultados e rubricas ficam em `.opencode-bridge/`, que a skill põe no `.git/info/exclude`; não vão para o repositório.
- A API do OpenCode escuta só em `127.0.0.1`.
- O conteúdo do pacote vai para o provedor de modelo que você configurou no OpenCode. Escolha o provedor de acordo com a sensibilidade do código.
- Este repositório tem um teste (`tests/estrutura.test.js`) que falha se algum arquivo versionado tiver caminho de usuário, e-mail pessoal ou cara de token.

## Configuração

| Variável | Padrão | Para quê |
|---|---|---|
| `OC_PORT` | `4096` | Porta da API da TUI. Use outra se já houver um OpenCode aberto em outro projeto |
| `OC_AGENT` | `bridge-dev` | Agente que a janela abre |
| `OC_MODEL` | (padrão do OpenCode) | Modelo, no formato `provedor/modelo` (veja `opencode models`) |
| `BRIDGE_GUARD` | ligado pelo `open` | `1` liga as travas do `bridge-guard` |

Se você abrir o OpenCode à mão, use o mesmo formato:

```bash
# Linux/macOS/Git Bash
BRIDGE_GUARD=1 opencode . --port 4096 --agent bridge-dev
```
```powershell
# PowerShell
$env:BRIDGE_GUARD=1; opencode . --port 4096 --agent bridge-dev
```

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `A porta 4096 já tem um OpenCode aberto em outra pasta` | Outro projeto usa a porta. A skill não mexe nele. Use `OC_PORT=4097` |
| A janela não abre | Sem terminal gráfico (SSH ou servidor) ou Linux sem `gnome-terminal`/`konsole`. O script imprime o comando: rode-o em outro terminal e peça ao Claude para seguir com `oc.sh new` |
| `A janela abriu, mas o OpenCode não respondeu em 60 s` | Veja a mensagem na janela: OpenCode sem modelo (`opencode auth login`), versão antiga ou erro de config |
| `AVISO: ... não ficou ocupada` | O envio não começou. Olhe a TUI: pode haver um diálogo aberto ou texto digitado no campo. Feche e peça para reenviar |
| `bridge-dev` não aparece em `opencode agent list` | Rode `/delega-opencode-tui:setup` ou `node plugin/scripts/install.js` |
| `Python 3 não encontrado` | Instale o Python 3 e coloque no PATH. No Windows, desative o atalho da Store em "Aliases de execução de aplicativo" |
| Acentos estranhos no pacote | Salve o `.task.md` em UTF-8 |
| O OpenCode diz que não pode editar um caminho | O pacote citou um caminho absoluto de outra pasta. Use caminhos relativos à pasta em que a TUI abriu |
| A rodada passou de 45 min | `wait` sai com timeout. Veja a TUI; o Claude decide se reenvia ou escala |

## Limitações

- Uma TUI atende uma pasta. Para dois projetos ao mesmo tempo, use portas diferentes.
- Não digite na TUI durante uma rodada: o envio usa o campo de prompt dela.
- Os endpoints `/tui/*` e `/session/*` são da API do OpenCode e podem mudar entre versões. Testado com o OpenCode 1.19.
- A janela é aberta no Windows (PowerShell `Start-Process`), no macOS (Terminal.app) e no Linux (`gnome-terminal`, `konsole` ou `x-terminal-emulator`). Em outros casos, abra à mão.

## Desenvolvimento

```bash
npm test          # node --test: travas, instalador, leitor do relatório, estrutura e privacidade
```

Contribuições são bem-vindas por PR. Antes, rode `npm test`; o teste de privacidade precisa passar.

## Licença

[MIT](LICENSE) © 2026 giovani-junior-dev

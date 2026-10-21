// bridge-guard: travas do delega-opencode-tui dentro do OpenCode.
// Inerte sem BRIDGE_GUARD=1 (o oc.sh open liga). Em tool.execute.before traduz a ferramenta do OpenCode para
// eventos por arquivo (write, edit, multiedit, apply_patch, bash) e barra com throw (o agente vê o erro na ferramenta):
//   git de escrita e gh · segredo real gravado em arquivo · caso de teste removido · marcador de pular teste novo ·
//   arquivo de teste apagado ou movido para fora · ferramenta de escrita desconhecida (falha fechada).
// Rede contra engano, não sandbox: o Claude ainda confere HEAD e fronteira depois de cada rodada.
// Um único export: o loader do OpenCode chama todo export do arquivo como plugin; helpers vão como propriedades.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { basename, resolve } from "node:path"

const DESCONHECIDA = "bridge-guard:desconhecida"
const LEITURA = new Set(["read", "glob", "grep", "list", "webfetch", "websearch", "codesearch", "todowrite", "todoread", "skill", "lsp", "question", "task", "invalid"])
const ESCRITA = /patch|write|edit|delete|remove|move|rename/i

const GIT = /(^|[^\w.-])git((\s+(-C|-c)\s+\S+)|(\s+--?[\w-]+(=\S+)?))*\s+(?<sub>commit|push|reset|rebase|merge|checkout|switch|stash|clean|worktree|cherry-pick|revert|am|tag)\b/
const GH = /(^|[\s;&|(`'"])gh\s+\w/

// Segredo: formas reais de credencial. Placeholder óbvio e o exemplo oficial da AWS passam.
const FORMAS = [
  ["AWS", /AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g],
  ["GitHub", /gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}/g],
  ["Slack", /xox[abprs]-[A-Za-z0-9-]{10,}/g],
  ["Stripe", /[sr]k_live_[A-Za-z0-9]{20,}/g],
  ["Google", /AIza[0-9A-Za-z_-]{35}/g],
  ["Anthropic", /sk-ant-[A-Za-z0-9_-]{20,}/g],
  ["OpenAI", /sk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}/g],
  ["chave privada", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
]
const CRED = /(?:password|passwd|secret|token)["']?\s*[:=]\s*["']([^"'\n]{20,})["']/gi
const EXEMPLO = /example|placeholder|dummy|fake|redacted|changeme|your[_-]|xxxx/i

// Teste: caso removido, marcador de pular novo, arquivo de teste apagado ou movido para fora.
const TESTE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|_test\.[a-z]+$|(^|\/)test_[^/]*\.py$/
const CASO = /(^|[^A-Za-z0-9_$.])(it|test)\s*\(|\.each\s*\(|def test_|func Test|#\[test\]/g
const PULA = /\.(skip|only)\b|(^|[^A-Za-z0-9_$.])x(it|describe|test)\s*\(|@pytest\.mark\.skip|pytest\.skip\(|t\.Skip(f|Now)?\(|#\[ignore\]|@Disabled|XCTSkip|test\.todo\(/g

const arquivo = (p, dir) => resolve(dir, p)
const ev = (tool_name, tool_input, cwd) => ({ tool_name, tool_input, cwd })
const conta = (re, s) => (String(s ?? "").match(re) ?? []).length
const ehTeste = p => TESTE.test(String(p).replace(/\\/g, "/"))

// patchText do apply_patch → um evento por arquivo. Update: linhas " " e "-" formam o old, " " e "+" o new.
function patch(texto, dir) {
  const evs = []
  let cur = null
  const fecha = () => {
    if (!cur) return
    if (cur.tipo === "add") evs.push(ev("Write", { file_path: arquivo(cur.path, dir), content: cur.novo.join("\n") }, dir))
    if (cur.tipo === "update") {
      const alvo = cur.para ?? cur.path
      if (cur.para) evs.push(ev("Bash", { command: `mv "${arquivo(cur.path, dir)}" "${arquivo(cur.para, dir)}"` }, dir))
      evs.push(ev("Edit", { file_path: arquivo(alvo, dir), old_string: cur.velho.join("\n"), new_string: cur.novo.join("\n") }, dir))
    }
    cur = null
  }
  for (const linha of String(texto ?? "").replace(/\r\n/g, "\n").split("\n")) {
    let m
    if ((m = linha.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/))) {
      fecha()
      if (m[1] === "Delete") evs.push(ev("Bash", { command: `rm "${arquivo(m[2].trim(), dir)}"` }, dir))
      else cur = { tipo: m[1].toLowerCase(), path: m[2].trim(), velho: [], novo: [] }
    } else if ((m = linha.match(/^\*\*\* Move to: (.+)$/)) && cur) cur.para = m[1].trim()
    else if (linha.startsWith("***") || linha.startsWith("@@") || !cur) continue
    else if (linha.startsWith("+")) cur.novo.push(linha.slice(1))
    else if (linha.startsWith("-")) cur.velho.push(linha.slice(1))
    else if (linha.startsWith(" ") || linha === "") { cur.velho.push(linha.slice(1)); cur.novo.push(linha.slice(1)) }
  }
  fecha()
  return evs
}

function mapear(tool, args = {}, dir) {
  switch (tool) {
    case "write": return [ev("Write", { file_path: arquivo(args.filePath, dir), content: args.content }, dir)]
    case "edit": return [ev("Edit", { file_path: arquivo(args.filePath, dir), old_string: args.oldString, new_string: args.newString }, dir)]
    case "multiedit": return [ev("MultiEdit", { file_path: arquivo(args.filePath, dir),
      edits: (args.edits ?? []).map(e => ({ old_string: e.oldString, new_string: e.newString })) }, dir)]
    case "apply_patch": case "patch": return patch(args.patchText ?? args.patch, dir)
    case "bash": return [ev("Bash", { command: args.command }, args.workdir || dir)]
    default: return !LEITURA.has(tool) && ESCRITA.test(tool) ? DESCONHECIDA : []
  }
}

function barrarGit(cmd) {
  const s = String(cmd ?? "")
  const g = s.match(GIT)
  if (g) throw new Error(`bridge-guard: git ${g.groups.sub} é do Claude, não do dev. Deixe a mudança no working tree e descreva no relatório.`)
  if (GH.test(s)) throw new Error("bridge-guard: gh é do Claude, não do dev.")
}

function segredo(texto) {
  const s = String(texto ?? "")
  for (const [tipo, re] of FORMAS) for (const m of s.matchAll(re)) {
    if (tipo === "AWS" && /EXAMPLE/.test(s.slice(m.index, m.index + 30))) continue
    if (!EXEMPLO.test(m[0])) return tipo
  }
  for (const m of s.matchAll(CRED)) {
    const v = m[1]
    if (/[A-Za-z]/.test(v) && /\d/.test(v) && !EXEMPLO.test(v) && !/\$\{|<|>/.test(v)) return "credencial"
  }
  return null
}

const envIgnorado = (f, cwd) => basename(f).startsWith(".env") && spawnSync("git", ["-C", cwd, "check-ignore", "-q", "--", f]).status === 0

function barrarSegredo(e) {
  const { tool_name: t, tool_input: i, cwd } = e
  let texto, alvo
  if (t === "Bash") {
    if (!/>|\btee\b/.test(i.command ?? "")) return
    texto = i.command; alvo = "comando bash"
  } else {
    texto = [i.content, i.new_string, ...(i.edits ?? []).map(x => x.new_string)].filter(x => typeof x === "string").join("\n")
    alvo = i.file_path
    if (envIgnorado(alvo, cwd)) return
  }
  const tipo = segredo(texto)
  if (tipo) throw new Error(`bridge-guard: segredo (${tipo}) em ${alvo}. Use variável de ambiente ou .env ignorado pelo git; se é fixture, reporte blocked e o Claude decide.`)
}

function barrarTeste(e) {
  const { tool_name: t, tool_input: i } = e
  if (t === "Bash") {
    const cmd = String(i.command ?? "")
    for (const m of cmd.matchAll(/(?:^|[;&|(]\s*|\s)(git\s+rm|rm|mv)\s+([^;&|)]+)/g)) {
      const args = m[2].trim().split(/\s+/).filter(a => !a.startsWith("-")).map(a => a.replace(/^["']|["']$/g, ""))
      if (m[1] === "mv") { if (args.length >= 2 && ehTeste(args[0]) && !ehTeste(args.at(-1))) throw new Error(`bridge-guard: mover teste para fora (${args[0]}) não é do dev; reporte blocked.`) }
      else if (args.some(ehTeste)) throw new Error(`bridge-guard: apagar teste (${args.find(ehTeste)}) não é do dev; reporte blocked.`)
    }
    return
  }
  if (!ehTeste(i.file_path)) return
  let antes, depois
  if (t === "Write") { antes = existsSync(i.file_path) ? readFileSync(i.file_path, "utf8") : ""; depois = i.content }
  else { antes = [i.old_string, ...(i.edits ?? []).map(x => x.old_string)].join("\n"); depois = [i.new_string, ...(i.edits ?? []).map(x => x.new_string)].join("\n") }
  if (conta(PULA, depois) > conta(PULA, antes)) throw new Error(`bridge-guard: pular teste (.skip/.only/xit…) em ${i.file_path} não é do dev.`)
  if (conta(CASO, depois) < conta(CASO, antes)) throw new Error(`bridge-guard: remover caso de teste em ${i.file_path} não é do dev; corrija o código, não o teste.`)
}

export const BridgeGuard = async ({ directory }) => ({
  "tool.execute.before": async (input, output) => {
    if (process.env.BRIDGE_GUARD !== "1") return
    const evs = mapear(input.tool, output.args, directory)
    if (evs === DESCONHECIDA) throw new Error(`bridge-guard: ferramenta de escrita não mapeada: ${input.tool} (falha fechada)`)
    for (const e of evs) {
      if (e.tool_name === "Bash") barrarGit(e.tool_input.command)
      barrarSegredo(e)
      barrarTeste(e)
    }
  },
})
Object.assign(BridgeGuard, { mapear, barrarGit, segredo, DESCONHECIDA })

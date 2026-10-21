// Estrutura do plugin e checagem de dados pessoais. node --test tests/estrutura.test.js
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const RAIZ = path.resolve(__dirname, "..")
const ler = p => fs.readFileSync(path.join(RAIZ, p), "utf8")

test("manifestos válidos, skill, comando, agente e contrato do relatório", () => {
  const mk = JSON.parse(ler(".claude-plugin/marketplace.json"))
  const pj = JSON.parse(ler("plugin/.claude-plugin/plugin.json"))
  assert.equal(mk.plugins[0].name, pj.name); assert.equal(mk.plugins[0].source, "./plugin")
  assert.match(pj.version, /^\d+\.\d+\.\d+$/)
  assert.match(ler("plugin/skills/delega-opencode-tui/SKILL.md"), /^---\r?\nname: delega-opencode-tui\r?\ndescription: /)
  for (const p of ["plugin/skills/delega-opencode-tui/pacote.md", "plugin/skills/delega-opencode-tui/scripts/oc.sh",
    "plugin/skills/delega-opencode-tui/scripts/relatorio.py", "plugin/commands/setup.md", "plugin/scripts/install.js"])
    assert.ok(fs.existsSync(path.join(RAIZ, p)), p)
  assert.match(ler("plugin/opencode/agents/bridge-dev.md"), /```json bridge-relatorio/)
  assert.match(ler("plugin/skills/delega-opencode-tui/scripts/relatorio.py"), /json bridge-relatorio/)
  assert.match(ler("plugin/skills/delega-opencode-tui/scripts/oc.sh"), /BRIDGE_GUARD=1/)
})

test("nenhum arquivo versionado tem caminho de usuário, e-mail ou cara de token", () => {
  const arquivos = spawnSync("git", ["-C", RAIZ, "ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
    .stdout.split("\n").filter(Boolean).filter(f => !f.startsWith("tests/estrutura.test.js"))
  assert.ok(arquivos.length > 5, "git ls-files vazio")
  const proibido = [
    /[A-Za-z]:[\/]+Users[\/]+(?!<|\.\.\.)[A-Za-z]/,   // C:\Users\nome
    /\/home\/(?!<)[a-z]/, /\/Users\/(?!<)[A-Za-z]/,
    /[\w.+-]+@(gmail|hotmail|outlook|yahoo)\.com/i,
    /gh[pousr]_[A-Za-z0-9]{36}/, /sk-(ant-)?[A-Za-z0-9_-]{30,}/, /AKIA(?!IOSFODNN7EXAMPLE)[0-9A-Z]{16}/,
  ]
  for (const f of arquivos) {
    const s = fs.readFileSync(path.join(RAIZ, f), "utf8")
    for (const re of proibido) assert.doesNotMatch(s, re, `${f} casa ${re}`)
  }
})

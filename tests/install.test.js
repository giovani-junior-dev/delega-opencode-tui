// install.js e estrutura do plugin. node --test tests/install.test.js
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const RAIZ = path.resolve(__dirname, "..")
const INSTALL = path.join(RAIZ, "plugin", "scripts", "install.js")
const roda = dir => spawnSync(process.execPath, [INSTALL], { encoding: "utf8", env: { ...process.env, BRIDGE_OPENCODE_DIR: dir } })

test("instala, fica em dia na 2ª passada, faz backup do que difere e não toca no opencode.json", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "oc-"))
  fs.mkdirSync(path.join(d, "agents"))
  fs.writeFileSync(path.join(d, "agents", "bridge-dev.md"), "velho")
  fs.writeFileSync(path.join(d, "opencode.json"), '{"x":1}')
  const r1 = roda(d)
  assert.equal(r1.status, 0, r1.stderr)
  assert.match(r1.stdout, /agents\/bridge-dev\.md: instalado/)
  assert.match(r1.stdout, /plugins\/bridge-guard\.js: instalado/)
  assert.deepEqual(fs.readFileSync(path.join(d, "agents", "bridge-dev.md")), fs.readFileSync(path.join(RAIZ, "plugin", "opencode", "agents", "bridge-dev.md")))
  const baks = fs.readdirSync(path.join(d, "agents")).filter(f => f.includes(".bak-"))
  assert.equal(baks.length, 1); assert.equal(fs.readFileSync(path.join(d, "agents", baks[0]), "utf8"), "velho")
  const r2 = roda(d)
  assert.match(r2.stdout, /agents\/bridge-dev\.md: em dia/); assert.match(r2.stdout, /plugins\/bridge-guard\.js: em dia/)
  assert.equal(fs.readdirSync(path.join(d, "agents")).filter(f => f.includes(".bak-")).length, 1)
  assert.equal(fs.readFileSync(path.join(d, "opencode.json"), "utf8"), '{"x":1}')
})

test("mesmo conteúdo com CRLF (checkout do cache no Windows) conta como em dia, sem backup", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "oc-"))
  for (const rel of ["agents/bridge-dev.md", "plugins/bridge-guard.js"]) {
    fs.mkdirSync(path.join(d, path.dirname(rel)), { recursive: true })
    const src = fs.readFileSync(path.join(RAIZ, "plugin", "opencode", rel), "utf8").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
    fs.writeFileSync(path.join(d, rel), src)
  }
  const r = roda(d)
  assert.match(r.stdout, /agents\/bridge-dev\.md: em dia/); assert.match(r.stdout, /plugins\/bridge-guard\.js: em dia/)
  assert.equal(fs.readdirSync(path.join(d, "agents")).filter(f => f.includes(".bak-")).length, 0)
})

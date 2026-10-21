// relatorio.py: mensagens do OpenCode → resumo da rodada. node --test tests/relatorio.test.js
const test = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const SCRIPT = path.resolve(__dirname, "..", "plugin", "skills", "delega-opencode-tui", "scripts", "relatorio.py")
const PY = ["python3", "python"].find(p => spawnSync(p, ["--version"]).status === 0)
const rodar = (msgs, ...args) => {
  const r = spawnSync(PY, ["-I", SCRIPT, ...args], { input: Buffer.from(JSON.stringify(msgs), "utf8") })
  assert.equal(r.status, 0, String(r.stderr)); return JSON.parse(r.stdout.toString("utf8"))
}
const user = t => ({ info: { role: "user" }, parts: [{ type: "text", text: t }] })
const bloco = j => "```json bridge-relatorio\n" + JSON.stringify(j) + "\n```"

test("done: relatório, modelo, tokens, custo, negadas e acento preservado", { skip: !PY && "sem python" }, () => {
  const r = rodar([user("r1"), { info: { role: "assistant", providerID: "p", modelID: "m" }, parts: [
    { type: "tool", tool: "bash", state: { status: "error", input: { command: "git commit -m x" }, error: "bridge-guard: git commit é do Claude" } },
    { type: "tool", tool: "bash", state: { status: "error", input: { command: "npm test" }, error: "exit 1" } },
    { type: "step-finish", tokens: { input: 10, output: 2, reasoning: 1, cache: { read: 5 } }, cost: 0.5 },
    { type: "text", text: "Ação concluída.\n\n" + bloco({ status: "done", req: { "REQ-1": "a.js:1" } }) }] }])
  assert.equal(r.motivo, "done"); assert.equal(r.modelo, "p/m"); assert.equal(r.custo, 0.5)
  assert.deepEqual(r.tokens, { input: 10, output: 2, reasoning: 1, cache_read: 5 })
  assert.equal(r.negadas.length, 1); assert.equal(r.erros.length, 1)
  assert.match(r.texto_final, /Ação concluída/)
})

test("só a rodada atual conta; --todas olha a sessão inteira", { skip: !PY && "sem python" }, () => {
  const msgs = [user("r1"), { info: { role: "assistant" }, parts: [{ type: "text", text: bloco({ status: "done" }) }] },
    user("r2"), { info: { role: "assistant" }, parts: [{ type: "text", text: "comecei e parei" }] }]
  assert.equal(rodar(msgs).motivo, "sem-relatorio")
  assert.equal(rodar(msgs, "--todas").motivo, "done")
})

test("erro do provedor sem relatório vira erro-opencode; blocked passa", { skip: !PY && "sem python" }, () => {
  const e = rodar([user("r1"), { info: { role: "assistant", error: { name: "ProviderError", data: { message: "rate limit" } } }, parts: [] }])
  assert.equal(e.motivo, "erro-opencode"); assert.match(e.erro_msg, /rate limit/)
  const b = rodar([user("r1"), { info: { role: "assistant" }, parts: [{ type: "text", text: bloco({ status: "blocked", bloqueio: "falta X" }) }] }])
  assert.equal(b.motivo, "blocked"); assert.equal(b.relatorio.bloqueio, "falta X")
})

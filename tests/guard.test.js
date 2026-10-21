// bridge-guard.js: travas dentro do OpenCode. node --test tests/opencode-guard.test.js
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFileSync } = require("node:child_process")
const { pathToFileURL } = require("node:url")

const PLUGIN = path.resolve(__dirname, "..", "plugin", "opencode", "plugins", "bridge-guard.js")
const carregar = () => import(pathToFileURL(PLUGIN).href)
const TOKEN = "ghp_" + "a1B2".repeat(9)

function projeto() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "guard-"))
  execFileSync("git", ["-C", d, "init", "-q"])
  fs.mkdirSync(path.join(d, "tests"))
  fs.writeFileSync(path.join(d, "tests", "a.test.js"), "it('um', () => {})\nit('dois', () => {})\n")
  return d
}
async function antes(dir, tool, args, ligado = true) {
  const { BridgeGuard } = await carregar()
  const salvo = process.env.BRIDGE_GUARD
  if (ligado) process.env.BRIDGE_GUARD = "1"; else delete process.env.BRIDGE_GUARD
  try {
    const h = await BridgeGuard({ directory: dir, worktree: dir })
    const output = { args: { ...args } }
    await h["tool.execute.before"]({ tool, sessionID: "ses_teste", callID: "c1" }, output)
    return output
  } finally { if (salvo === undefined) delete process.env.BRIDGE_GUARD; else process.env.BRIDGE_GUARD = salvo }
}

test("exporta um único plugin (o loader do OpenCode chama todo export)", async () => {
  assert.deepEqual(Object.keys(await carregar()), ["BridgeGuard"])
})

test("mapear: write, edit, multiedit, bash e leitura", async () => {
  const { mapear } = (await carregar()).BridgeGuard
  const d = "C:/repo"
  assert.deepEqual(mapear("write", { filePath: "src/a.js", content: "x" }, d),
    [{ tool_name: "Write", tool_input: { file_path: path.resolve(d, "src/a.js"), content: "x" }, cwd: d }])
  assert.deepEqual(mapear("edit", { filePath: "C:/repo/a.js", oldString: "a", newString: "b", replaceAll: true }, d),
    [{ tool_name: "Edit", tool_input: { file_path: path.resolve("C:/repo/a.js"), old_string: "a", new_string: "b" }, cwd: d }])
  assert.deepEqual(mapear("multiedit", { filePath: "a.js", edits: [{ oldString: "a", newString: "b" }] }, d)[0].tool_input.edits,
    [{ old_string: "a", new_string: "b" }])
  assert.deepEqual(mapear("bash", { command: "ls", workdir: "C:/repo/sub" }, d),
    [{ tool_name: "Bash", tool_input: { command: "ls" }, cwd: "C:/repo/sub" }])
  for (const t of ["read", "glob", "grep", "list", "webfetch", "todowrite", "ai-memory_memory_query"]) assert.deepEqual(mapear(t, {}, d), [], t)
})

test("mapear: apply_patch real do spike vira Edit + Write por arquivo", async () => {
  const { mapear } = (await carregar()).BridgeGuard
  const parte = require("./fixtures/apply-patch-guard.json").flatMap(m => m.parts).find(p => p.tool === "apply_patch")
  const evs = mapear("apply_patch", parte.state.input, "C:/repo")
  assert.deepEqual(evs.map(e => [e.tool_name, path.basename(e.tool_input.file_path)]),
    [["Edit", "calc.js"], ["Write", "novo.txt"], ["Write", "proibido.txt"]])
  assert.equal(evs[0].tool_input.old_string, "  return a - b")
  assert.equal(evs[0].tool_input.new_string, "  return a + b")
  assert.equal(evs[1].tool_input.content, "ok")
})

test("mapear: apply_patch com Delete e Move to", async () => {
  const { mapear } = (await carregar()).BridgeGuard
  const patchText = "*** Begin Patch\n*** Delete File: tests/a.test.js\n*** Update File: x.js\n*** Move to: y.js\n@@\n ctx\n-a\n+b\n*** End Patch"
  const evs = mapear("apply_patch", { patchText }, "C:/repo")
  assert.deepEqual(evs.map(e => e.tool_name), ["Bash", "Bash", "Edit"])
  assert.match(evs[0].tool_input.command, /^rm ".*a\.test\.js"$/)
  assert.match(evs[1].tool_input.command, /^mv ".*x\.js" ".*y\.js"$/)
  assert.equal(evs[2].tool_input.old_string, "ctx\na")
  assert.equal(evs[2].tool_input.new_string, "ctx\nb")
})

test("mapear: escrita desconhecida falha fechado", async () => {
  const { mapear, DESCONHECIDA } = (await carregar()).BridgeGuard
  for (const t of ["superpatch", "file_write", "rename_file", "delete"]) assert.equal(mapear(t, {}, "C:/repo"), DESCONHECIDA, t)
})

test("barrarGit: git de escrita e gh em qualquer posição", async () => {
  const { barrarGit } = (await carregar()).BridgeGuard
  for (const c of ["git commit -m x", "git -C . commit --allow-empty -m b", "bash -c 'git commit --allow-empty -m c'",
    "cd sub && git push origin x", "git -c user.name=x commit", "git reset --hard", "git stash", "git checkout -- a.js",
    "git worktree add ../x", "npm test; git rebase main", "gh pr create --fill", "echo ok && gh api x"])
    assert.throws(() => barrarGit(c), /bridge-guard/, c)
  for (const c of ["git status", "git diff HEAD", "git log --oneline", "git add src/a.js", "git show HEAD:a.js", "digit commit", "node gh.js"])
    assert.doesNotThrow(() => barrarGit(c), c)
})

test("segredo: formas reais pegam, placeholder e exemplo passam", async () => {
  const { segredo } = (await carregar()).BridgeGuard
  const casos = [[`t = "${TOKEN}"`, "GitHub"], ["AKIA" + "Z".repeat(16), "AWS"], ["xoxb-" + "1".repeat(12), "Slack"],
    ["sk_live_" + "a1".repeat(12), "Stripe"], ["AIza" + "b".repeat(35), "Google"], ["sk-ant-" + "c1".repeat(12), "Anthropic"],
    ["sk-proj-" + "d1".repeat(12), "OpenAI"], ["-----BEGIN RSA PRIVATE KEY-----", "chave privada"],
    ['password = "s3nhaSuperForte2026xyzw"', "credencial"]]
  for (const [s, tipo] of casos) assert.equal(segredo(s), tipo, s)
  for (const s of ["AKIAIOSFODNN7EXAMPLE", "ghp_" + "x".repeat(36) + "example", 'token = "${API_TOKEN_DA_ENV_123}"',
    'password = "changeme-changeme-123"', 'secret = "curto1"', "const a = 1", "sk_test_" + "a".repeat(30)])
    assert.equal(segredo(s), null, s)
})

test("inerte sem BRIDGE_GUARD=1", async () => {
  const d = projeto()
  await antes(d, "write", { filePath: path.join(d, "a.js"), content: `const t = "${TOKEN}"` }, false)
  await antes(d, "bash", { command: "git commit -m x" }, false)
})

test("segredo barrado em write, apply_patch e bash com >", async () => {
  const d = projeto()
  await assert.rejects(antes(d, "write", { filePath: path.join(d, "a.js"), content: `const t = "${TOKEN}"` }), /segredo \(GitHub\)/)
  await assert.rejects(antes(d, "apply_patch", { patchText: `*** Begin Patch\n*** Add File: cfg.js\n+export const t = "${TOKEN}"\n*** End Patch` }), /segredo/)
  await assert.rejects(antes(d, "bash", { command: `echo "${TOKEN}" > cfg.txt` }), /segredo/)
  await antes(d, "bash", { command: `echo ok > cfg.txt` })
})

test(".env ignorado pelo git pode ter segredo", async () => {
  const d = projeto()
  fs.writeFileSync(path.join(d, ".gitignore"), ".env\n")
  await antes(d, "write", { filePath: path.join(d, ".env"), content: `GH=${TOKEN}` })
  await assert.rejects(antes(d, "write", { filePath: path.join(d, ".env.exemplo"), content: `GH=${TOKEN}` }), /segredo/)
})

test("teste: remover caso, pular, apagar e mover para fora são barrados", async () => {
  const d = projeto()
  const t = path.join(d, "tests", "a.test.js")
  await assert.rejects(antes(d, "apply_patch", { patchText: "*** Begin Patch\n*** Update File: tests/a.test.js\n@@\n it('um', () => {})\n-it('dois', () => {})\n*** End Patch" }), /remover caso/)
  await assert.rejects(antes(d, "edit", { filePath: t, oldString: "it('dois'", newString: "it.skip('dois'" }), /pular teste/)
  await assert.rejects(antes(d, "write", { filePath: t, content: "it('um', () => {})\n" }), /remover caso/)
  await assert.rejects(antes(d, "apply_patch", { patchText: "*** Begin Patch\n*** Delete File: tests/a.test.js\n*** End Patch" }), /apagar teste/)
  await assert.rejects(antes(d, "bash", { command: "rm -f tests/a.test.js" }), /apagar teste/)
  await assert.rejects(antes(d, "bash", { command: "git rm tests/a.test.js" }), /apagar teste/)
  await assert.rejects(antes(d, "bash", { command: "mv tests/a.test.js lixo.js" }), /mover teste/)
})

test("teste: acrescentar caso e editar código passam", async () => {
  const d = projeto()
  const t = path.join(d, "tests", "a.test.js")
  await antes(d, "write", { filePath: t, content: "it('um', () => {})\nit('dois', () => {})\nit('tres', () => {})\n" })
  await antes(d, "edit", { filePath: t, oldString: "it('dois', () => {})", newString: "it('dois', () => { assert.ok(1) })" })
  await antes(d, "write", { filePath: path.join(d, "tests", "novo.test.js"), content: "it('x', () => {})\n" })
  await antes(d, "bash", { command: "rm -rf dist && mv tests/a.test.js tests/b.test.js" })
  await antes(d, "edit", { filePath: path.join(d, "src.js"), oldString: "it(", newString: "x" })
})

test("escrita desconhecida é barrada com a trava ligada", async () => {
  const d = projeto()
  await assert.rejects(antes(d, "superpatch", {}), /não mapeada: superpatch/)
  await antes(d, "read", { filePath: path.join(d, "a.js") })
})

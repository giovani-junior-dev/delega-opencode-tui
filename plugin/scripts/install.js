#!/usr/bin/env node
// install: copia o agente bridge-dev e o plugin bridge-guard para a config global do OpenCode.
//   node install.js            → ~/.config/opencode/{agents,plugins}/
// BRIDGE_OPENCODE_DIR troca o destino (testes). Arquivo diferente ganha backup <nome>.bak-<ts> ao lado
// (o OpenCode só carrega *.md em agents/ e *.js|*.ts em plugins/). opencode.json do usuário nunca é tocado.
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const ORIGEM = path.resolve(__dirname, "..", "opencode")
const DESTINO = process.env.BRIDGE_OPENCODE_DIR || path.join(os.homedir(), ".config", "opencode")
const ARQUIVOS = ["agents/bridge-dev.md", "plugins/bridge-guard.js"]
const texto = b => b.toString("utf8").replace(/\r\n/g, "\n")   // CRLF do checkout no Windows não é diferença
const carimbo = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)

let rc = 0
for (const rel of ARQUIVOS) {
  const src = path.join(ORIGEM, rel), dst = path.join(DESTINO, rel)
  if (!fs.existsSync(src)) { console.log(`  ${rel}: template não achado em ${src}`); rc = 1; continue }
  const novo = fs.readFileSync(src)
  if (fs.existsSync(dst) && texto(novo) === texto(fs.readFileSync(dst))) { console.log(`  ${rel}: em dia`); continue }
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  if (fs.existsSync(dst)) fs.copyFileSync(dst, `${dst}.bak-${carimbo()}`)
  fs.writeFileSync(dst, novo)
  console.log(`  ${rel}: instalado em ${dst}`)
}
process.exit(rc)

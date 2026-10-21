"""Lê as mensagens de uma sessão do OpenCode (JSON de GET /session/<id>/message, no stdin)
e resume a última rodada: bridge-relatorio, modelo, tokens, custo, ferramentas negadas e erros.

Uso: curl .../session/<id>/message | python -I relatorio.py [--out arquivo.json] [--todas]
Sem --todas, conta só as mensagens depois da última mensagem do usuário (a rodada atual).
O texto do OpenCode orienta; quem aceita é o Claude, com a suíte rodada por ele.
"""
import json
import re
import sys

BLOCO = re.compile(r"```json bridge-relatorio\s*\n(.*?)\n```", re.S)
NEGADA = re.compile(r"prevents you from using|rejected permission|^bridge-guard", re.I)


def resumo_input(i):
    i = i or {}
    v = i.get("command") or i.get("filePath") or i.get("patchText") or json.dumps(i, ensure_ascii=False)
    return str(v)[:200]


def resumir(msgs, todas=False):
    if not todas:
        ult = max((k for k, m in enumerate(msgs) if m.get("info", {}).get("role") == "user"), default=-1)
        msgs = msgs[ult + 1:]
    r = {"motivo": None, "relatorio": None, "modelo": None, "custo": 0.0,
         "tokens": {"input": 0, "output": 0, "reasoning": 0, "cache_read": 0},
         "ferramentas": {}, "negadas": [], "erros": [], "erro_msg": None, "texto_final": ""}
    textos = []
    for m in msgs:
        info = m.get("info", {})
        if info.get("role") != "assistant":
            continue
        if info.get("providerID"):
            r["modelo"] = f"{info['providerID']}/{info.get('modelID')}"
        if info.get("error"):
            e = info["error"]
            r["erro_msg"] = f"{e.get('name', 'Erro')}: {(e.get('data') or {}).get('message') or json.dumps(e)}"
        for p in m.get("parts", []):
            t = p.get("type")
            if t == "text" and p.get("text"):
                textos.append(p["text"])
            elif t == "step-finish":
                tk = p.get("tokens") or {}
                for k in ("input", "output", "reasoning"):
                    r["tokens"][k] += tk.get(k) or 0
                r["tokens"]["cache_read"] += (tk.get("cache") or {}).get("read") or 0
                r["custo"] += p.get("cost") or 0
            elif t == "tool":
                r["ferramentas"][p.get("tool")] = r["ferramentas"].get(p.get("tool"), 0) + 1
                st = p.get("state") or {}
                if st.get("status") == "error":
                    item = {"tool": p.get("tool"), "input": resumo_input(st.get("input")),
                            "erro": str(st.get("error", ""))[:300]}
                    (r["negadas"] if NEGADA.search(item["erro"]) else r["erros"]).append(item)
    tudo = "\n\n".join(textos)
    r["texto_final"] = tudo[-1500:]
    blocos = BLOCO.findall(tudo)
    if blocos:
        try:
            r["relatorio"] = json.loads(blocos[-1])
        except json.JSONDecodeError as e:
            r["erro_msg"] = r["erro_msg"] or f"bridge-relatorio com JSON inválido: {e}"
    st = (r["relatorio"] or {}).get("status")
    r["motivo"] = ("erro-opencode" if r["erro_msg"] and not r["relatorio"]
                   else "sem-relatorio" if st not in ("done", "blocked")
                   else st)
    r["custo"] = round(r["custo"], 4)
    return r


def main():
    a = sys.argv[1:]
    out = a[a.index("--out") + 1] if "--out" in a else None
    sys.stdout.reconfigure(encoding="utf-8")
    # bytes + utf-8: no Windows o stdin vem em cp1252 e estraga os acentos
    r = resumir(json.loads(sys.stdin.buffer.read().decode("utf-8")), todas="--todas" in a)
    s = json.dumps(r, ensure_ascii=False, indent=2)
    if out:
        with open(out, "w", encoding="utf-8") as f:
            f.write(s)
    print(s)


if __name__ == "__main__":
    main()

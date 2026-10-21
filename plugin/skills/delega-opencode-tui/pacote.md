# [opencode <slug> <fase> r<n>]

## Objetivo
<uma frase, do ponto de vista do usuário>

## Spec
<texto do ticket/fase: o que existe hoje (arquivo:linha), o que muda, fatos verificados da plataforma>

## Critérios de aceite
REQ-1 <critério verificável, com o teste esperado>
REQ-2 <critério verificável>

## Achados a corrigir
<rodada 1: "nenhum". Rodada 2+: texto literal de cada falha: saída do teste, achado do reviewer com arquivo:linha, arquivo fora da lista>

## Arquivos permitidos
<glob por linha; só estes podem mudar, testes incluídos>

## Teste
comando exato: `<comando que roda no Git Bash do Windows, a partir da raiz da worktree>` deve terminar verde

## Regras
- TDD: teste vermelho antes do código, para cada REQ.
- Edite pelos caminhos relativos à worktree atual.
- Sem dependência nova. Sem emoji.
- Não commitar; não usar git de escrita nem gh. A mudança fica no working tree.
- Não tocar fora dos Arquivos permitidos. Não ler `.env` nem dados de runtime.
- Não apagar, pular nem enfraquecer teste existente.
- Travou (dado, ambiguidade, credencial, arquivo fora da lista) → relatório com status "blocked" e pare.

## Relatório final
Termine com o bloco `json bridge-relatorio` do seu prompt de sistema, com a saída real do comando de Teste.

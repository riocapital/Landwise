# 09 — Prompt completo de implementação

Copiar o bloco abaixo para uma nova conversa (branch `revisao-estrutural-fase1`) para executar as correções P0/P1 identificadas nesta auditoria.

---

```
Corrige os erros P0 e P1 identificados na auditoria financeira do Landwise de 2026-07-31
(docs/auditoria/, branch revisao-estrutural-fase1, commit 49a5424b). Lê primeiro
docs/auditoria/03-motor-financeiro.md, docs/auditoria/06-financiamento.md,
docs/auditoria/08-plano-priorizado.md e src/lib/calc/auditoria-reproducao.test.ts
antes de tocar em código — a causa raiz de cada bug já está provada por teste,
não precisas de a redescobrir.

CONTEXTO
O Projeto Julieta reportou: VGV bruto €19.494.954, Custo total €17.105.708,
Lucro do projeto €2.389.246 (12,3%), Equity investido €8.673.153, Distribuições
€17.115.238, Lucro do equity €8.442.085, IRR 19,5%, MOIC 1,97x, 62 fluxos.
Gap lucro do equity vs. lucro do projeto: €6.052.839, causado por dois bugs
provados algebricamente e por teste (ver auditoria-reproducao.test.ts, 4/4 a
passar):

  lucroLevered = lucroProjeto + (drawdownTotal − amortizacaoTotal)
  lucroEquity  = lucroLevered  (quando o caixa acumulado termina perto de zero)

P0.1 — src/lib/calc/financiamento.ts:245 e src/lib/calc/equity.ts:52-63.
Sem carência nem cash sweep ativos (estado por omissão de qualquer projeto
existente), amortizacao fica sempre a zero — a dívida bancária levantada
nunca sai do saldo devedor, mas o caixa levered que a inclui é distribuído
ao equity no último mês como se fosse lucro.

P0.2 — src/lib/calc/financiamento.ts:228,282 e src/lib/calc/cashflow.ts:240.
Os juros são sempre capitalizados no saldo devedor (saldoFinal = saldoInicial
+ juros + drawdown) E simultaneamente subtraídos do caixa levered como se
fossem pagos em dinheiro. Quando a dívida é totalmente amortizada, isto
subestima o lucro do equity pelo total de juros pagos.

P1.1 — src/lib/calc/equity.ts:35. simularEquity() não recebe saldoMinimoCaixa
— as distribuições nunca respeitam a reserva mínima de caixa, ao contrário
do cash sweep (financiamento.ts:252), que a respeita.

P1.2 — src/lib/calc/cashflow.ts:108 vs. src/lib/calc/custos.ts
(calcCustosAquisicaoAcessorios/agregarCustos). Uma linha de custo com valor
mas sem dataInicial/dataFinal é excluída do cash flow real mas continua a
contar nos totais "Estrutura sobre VGV"/"Métricas por m²" do dashboard.

P1.3 — src/lib/calc/sensibilidades.ts:150-153 e src/lib/calc/cenarios.ts:106-107.
Usam resultado.lucroProjeto/margemProjeto (cashflow.ts, sem fees de promotor
nem imposto sobre o lucro) em vez de lucroProjetoTotal/margemProjetoTotal
(project-loader.ts, com fees+imposto) — divergem do dashboard sem aviso.
No Resumo do wizard (dados/page.tsx:3394-3395) já existe o rótulo correto
"(sem fees/impostos)" para o mesmo caso — replicar esse padrão ou ligar aos
valores Totais.

P1.4 — src/lib/calc/estrutura-capital.ts / waterfall.ts. catchUpAtivo/
catchUpPct são persistidos (project-capital.ts) e têm UI funcional
(dados/page.tsx:2829-2838), mas nunca são lidos pelo motor de waterfall —
ativar o toggle não muda nenhum resultado.

REGRAS DE PERSISTÊNCIA E MIGRAÇÃO
Nenhuma destas correções deve exigir uma nova coluna de base de dados — são
todas correções de lógica de cálculo sobre campos que já existem e já
persistem corretamente. Se, ao implementar, verificares que precisas mesmo
de uma nova coluna, cria uma nova migration sequencial (a próxima livre em
supabase/migrations/), aditiva (ADD COLUMN IF NOT EXISTS), nunca edites
migrations antigas, e NÃO a apliques em produção — só desenha o SQL, o
utilizador aplica manualmente no Supabase SQL Editor quando estiver pronto.

REGRAS DE TESTE
Para cada bug corrigido, converte o teste de reprodução equivalente em
src/lib/calc/auditoria-reproducao.test.ts (que hoje prova que o bug EXISTE)
num teste de regressão que prova que o bug NÃO volta a acontecer — pode
ficar no mesmo ficheiro ou mover-se para os ficheiros de teste normais
(financiamento.test.ts, equity.test.ts, cashflow.test.ts), como preferires,
desde que continue a correr com npm test. Não apagues a prova de que o bug
existia sem a substituir por uma prova equivalente de que foi corrigido.

Depois de corrigir P0.1/P0.2, cria um teste de regressão específico
reproduzindo os números do Projeto Julieta (ou o mais próximo que
conseguires deles, já que os exatos ainda não foram confirmados ao vivo —
ver docs/auditoria/02-projeto-julieta.md, secção "Pendente de confirmação
ao vivo") confirmando que lucroEquity deixa de exceder lucroProjeto por
qualquer valor não explicado por fees de promotor + imposto sobre o lucro
(tolerância €0,01).

CRITÉRIOS DE ACEITAÇÃO
- npx tsc --noEmit -p tsconfig.json: 0 erros.
- npm run lint: 0 erros.
- npm test: 100% a passar, incluindo os testes de regressão novos.
- npm run build: sucesso.
- Em qualquer cenário com dívida bancária ativa e sem carência/cash sweep,
  lucroEquity nunca excede lucroProjetoTotal + (dívida efetivamente
  devolvida ao investidor porque a dívida foi mesmo liquidada) — nunca
  distribui dívida por pagar como lucro.
- Sensibilidades e Cenários mostram, na célula/cenário base, exatamente o
  mesmo lucro/margem que o dashboard — ou um aviso explícito da diferença.

RESTRIÇÕES DE PRODUÇÃO (iguais às de toda a sessão anterior)
- Nunca fazer merge para main.
- Nunca fazer deploy de produção.
- Nunca aplicar migrations em produção (só desenhar SQL para o utilizador
  correr manualmente).
- Nunca alterar www.landwise.pt.
- Trabalhar sempre em revisao-estrutural-fase1 (ou branch derivada), nunca
  direto em main/master.

ENTREGA
1. git status, git diff --stat antes de commitar.
2. Um único commit, mensagem: "fix: corrige dupla contagem de dívida e juros no motor de equity/financiamento".
3. Push para origin/revisao-estrutural-fase1.
4. Novo Preview Deployment (Vercel) — reportar o URL.
5. Relatório final explícito confirmando: main intocado, produção intocada,
   nenhuma migration aplicada em produção, lista exata do que foi corrigido
   vs. o que ficou por fazer (se algo do plano P1 não couber no tempo
   disponível, dizer isso claramente — não reportar como feito o que não foi).
```

---

## Notas para quem for executar este prompt

- A causa raiz já está provada por teste — não é preciso "investigar" de novo, só decidir a abordagem de correção (ver P0.1: duas opções propostas em `08-plano-priorizado.md`, requer uma decisão de produto, não só técnica — recomenda-se confirmar com o utilizador qual das duas abordagens prefere antes de implementar, dado que muda o comportamento visível do produto).
- P0.1 e P0.2 estão interligados — corrigir só um pode criar um novo desequilíbrio (ver a prova em `auditoria-reproducao.test.ts`, terceiro teste, que mostra como corrigir a amortização sem corrigir os juros troca o sinal do erro em vez de o eliminar). Corrigir os dois em conjunto.

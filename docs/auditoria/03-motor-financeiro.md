# 03 — Auditoria do motor financeiro

Auditoria de 2026-07-31, branch `revisao-estrutural-fase1`, commit `49a5424b`. Metodologia: leitura direta do código-fonte + testes de reprodução determinísticos (não simulações — `npm test`, ficheiro [`src/lib/calc/auditoria-reproducao.test.ts`](../../src/lib/calc/auditoria-reproducao.test.ts), 4/4 a passar). Os achados críticos (secção 1) são provados algebricamente e confirmados por teste, não por inspeção visual do dashboard.

---

## Achado crítico #1 (P0) — dívida por liquidar é distribuída ao equity como se fosse lucro

**Este é, com alta confiança, a causa principal do gap de €6.052.839 entre "Lucro do projeto" e "Lucro do equity" reportado no Projeto Julieta (ver [`02-projeto-julieta.md`](02-projeto-julieta.md)).**

### Mecanismo

`simularFinanciamento` ([`src/lib/calc/financiamento.ts`](../../src/lib/calc/financiamento.ts)) só amortiza capital em duas situações:

1. Cash sweep ativo (`cashSweepAtivo: true`) — amortiza uma % do caixa livre, se ligado.
2. Carência ativa (`carenciaAtiva: true`) — amortização linear depois da carência, com liquidação forçada na maturidade.

**Se nenhuma das duas estiver ativa — que é o estado por omissão de qualquer projeto criado antes desta auditoria, incluindo provavelmente o Julieta — a dívida NUNCA amortiza.** `amortizacao` fica a zero em todos os meses, para sempre (`financiamento.ts:245`, só entra nalgum valor dentro de `if (sweepAtivoNesteMes...)` ou `if (parametros.carenciaAtiva...)` — sem nenhuma das duas condições, nunca executa).

Entretanto, `cashflow.ts:240` calcula o caixa levered todos os meses como:
```
cashFlowLevered = cashFlowUnlevered + drawdown − juros − fees − impostoSelo − amortizacao
```
Com `amortizacao = 0` sempre, **o `drawdown` (dinheiro emprestado pelo banco) entra integralmente no caixa levered como se fosse receita disponível, sem nunca sair de novo** — porque não há amortização a subtraí-lo de volta.

Esse caixa levered "inflacionado" pelo `drawdown` nunca devolvido alimenta diretamente `simularEquity()` ([`src/lib/calc/equity.ts`](../../src/lib/calc/equity.ts)), que no último mês do modelo **distribui tudo o que sobra** ao investidor (`equity.ts:52-63`, comentário do próprio código: "distribui TUDO o que sobra — capital + lucro"). O capital emprestado pelo banco, nunca devolvido, sai como se fosse lucro do investidor.

### Prova algébrica (confirmada por teste)

```
lucroLevered = lucroProjeto + (drawdownTotal − amortizacaoTotal)
lucroEquity  = capitalDevolvidoTotal − equityContributed = lucroLevered   (quando o caixa acumulado termina perto de zero)
```

Teste: [`auditoria-reproducao.test.ts:79-105`](../../src/lib/calc/auditoria-reproducao.test.ts) — `"lucroLevered ... excede lucroProjeto exatamente pelo capital em dívida nunca amortizado"`. **PASSA.**

Terceiro teste do mesmo ficheiro confirma o inverso: com carência ativa e maturidade a forçar a liquidação total, `amortizacaoTotal ≈ drawdownTotal + jurosTotais` — a dívida fica mesmo a zero, mas surge o Achado #2 abaixo.

### Por que isto passou despercebido nas correções anteriores desta sessão

As correções de auditoria anteriores (rondas de 29/07 e 30/07) validaram corretamente `lucroProjeto` (P&L: receita − custos − custos financeiros) e corrigiram o MOIC "preso a 1.0x" (bug do último mês nunca distribuir lucro, só capital). Mas nunca havia um teste que ligasse **financiamento sem carência/sweep** a **lucro do equity**, porque os testes de equity existentes usam cenários sem dívida por amortizar (défices cobertos só por equity) ou com dívida já simplificada a zero no fim. O Julieta é provavelmente o primeiro projeto real, com financiamento ativo e sem carência configurada, a expor isto.

### Severidade

**P0 — invalida o resultado mostrado ao utilizador.** IRR e MOIC do equity ficam sobrestimados por um valor exatamente igual à dívida bancária nunca amortizada dentro do horizonte modelado. Isto não é "retorno alavancado normal" — é dinheiro do banco, ainda por pagar, apresentado como lucro do investidor.

---

## Achado crítico #2 (P0) — juros capitalizados no saldo devedor E pagos em caixa no mesmo mês

`financiamento.ts:228`: `saldoFinal = saldoInicial + juros + drawdown` — os juros de cada mês são sempre somados ao saldo devedor (capitalizados; comentário no próprio código, linha 282: *"por agora, juros sempre capitalizados (sem pagamento corrente)"*).

Simultaneamente, `cashflow.ts:240` subtrai esse mesmo valor de juros do caixa levered: `... − fin.juros − ...`.

**O mesmo euro de juro é descontado duas vezes**: uma vez imediatamente, como se tivesse sido pago em dinheiro; outra vez mais tarde, quando o capital "engordado" por esse juro capitalizado for eventualmente amortizado (subtraindo `amortizacao`, que por sua vez inclui os juros já capitalizados).

### Efeito líquido

- **Quando a dívida NUNCA é amortizada** (situação mais comum, ver Achado #1): este bug fica parcialmente mascarado — o juro sai do caixa uma vez (efeito real), mas nunca volta a ser "cobrado" via amortização (porque não há amortização). Contribui para aumentar a necessidade de equity ao longo da vida do projeto, sem efeito direto sobre o gap final lucroLevered vs. lucroProjeto (o `J` cancela-se algebricamente nessa fórmula — ver prova acima).
- **Quando a dívida É totalmente amortizada** (com carência + maturidade): o juro é subtraído do caixa TODOS os meses (`−juros`) e depois subtraído OUTRA VEZ quando a amortização final liquida o saldo (que inclui os juros capitalizados). Resultado confirmado por teste: `lucroLevered = lucroProjeto − jurosTotais` — o lucro do equity fica ABAIXO do lucro do projeto pelo valor total de juros, penalizando artificialmente o investidor.

Teste: [`auditoria-reproducao.test.ts:150-169`](../../src/lib/calc/auditoria-reproducao.test.ts) — **PASSA**, confirma a dupla subtração byte a byte.

### Severidade

**P0.** Independente do Achado #1, distorce sistematicamente o custo de financiamento em qualquer projeto com juros > 0 — sentido do erro depende de a dívida ser ou não amortizada dentro do horizonte modelado.

---

## Achado crítico #3 (P1) — distribuições ao equity nunca respeitam o saldo mínimo de caixa

`simularEquity()` ([`equity.ts:35`](../../src/lib/calc/equity.ts)) recebe apenas `{ mes, saldoCaixaAposFinanciamento, recebimentosClientes }` por mês — **não recebe `saldoMinimoCaixa`**, o parâmetro que `financiamento.ts` usa para nunca deixar o cash sweep amortizar abaixo da reserva de segurança (`financiamento.ts:252`).

Consequência: o motor de equity pode (e no último mês, per Achado #1, vai) distribuir caixa que deveria ficar retido como reserva mínima de custos futuros. A regra pedida na auditoria ("Caixa distribuível = Caixa disponível − pagamentos vencidos − serviço da dívida − reserva mínima − compromissos obrigatórios") **não existe no motor atual** — a única regra de retenção é "não devolver mais capital do que o já aportado" (`equity.ts:69-71`), que não tem nada a ver com reserva de segurança operacional.

Adicionalmente: o campo `recebimentosClientes` existe no tipo `NecessidadeMensalEquity` mas **nunca é lido dentro de `simularEquity()`** — está morto, apesar de ser passado corretamente por `cashflow.ts:241`.

### Severidade

**P1** — funcional, mas não necessariamente visível no Projeto Julieta se a reserva mínima nunca chegou a ser testada por um mês de caixa apertado. Ainda assim é uma lacuna real face à secção 15 do pedido de auditoria.

---

## Achado confirmado correto — reconciliação mensal do cash flow

A identidade pedida na secção 14 da auditoria:
```
saldo inicial + entradas operacionais + drawdowns + equity calls
  − saídas operacionais − juros − fees − amortizações − distribuições
= saldo final
```
está implementada exatamente assim em `cashflow.ts:247-274` (`saldoCaixa = cashFlowLevered + eq.capitalCall − eq.capitalDevolvido`, acumulado em `saldoCaixaAcumulado` sem nenhum passo intermédio de arredondamento). **Por construção aritmética, esta reconciliação nunca diverge um cêntimo** — não há dois caminhos de cálculo a comparar, é uma soma corrida única. Não há bug de reconciliação de cash flow mensal — o problema não está em somar os fluxos errado, está em os PRÓPRIOS fluxos (`drawdown`/`amortizacao`/`juros`) estarem mal definidos, conforme Achados #1 e #2.

---

## Achados do motor de custos, VGV e aquisição (ver também [`05-imt-e-aquisicao.md`](05-imt-e-aquisicao.md))

Resumo (detalhe completo no documento 05):

- **VGV bruto**: fonte única confirmada, `calcVgvBruto()` em `sales-table.ts`, soma exclusiva de `precoFinal` por unidade. Sem duplicação.
- **Preço de aquisição vs. custos de aquisição**: bug histórico confirmado corrigido — `valorAquisicao` vem sempre de `custoTerreno`, nunca de somar linhas de custo; `calcCustosAquisicaoAcessorios()` exclui explicitamente as linhas de preço (Sinal/Escritura/Reforço).
- **IMT**: calculadora única, sem duplicação — `aplicarImtCalculado()` sobrescreve a mesma linha "IMT", nunca cria uma segunda.
- **P1 novo, não reportado antes**: uma linha de custo com valor mas sem data (ex.: IMT calculado mas nunca datado) entra nos totais de "Estrutura sobre VGV"/"Métricas por m²" mas **não entra no cash flow real** (`distribuirCustosPorMes` ignora linhas sem `dataInicial`/`dataFinal`) — divergência silenciosa entre o que o dashboard mostra como custo total e o que o motor de cash flow/financiamento/equity realmente processa.
- **P1 — comissão nunca é descontada duas vezes** em nenhum ecrã (Dashboard, Estrutura sobre VGV, Métricas por m², Resumo, Sensibilidades, Cenários) — bug histórico confirmado corrigido.
- **P1 — Sensibilidades e Cenários usam uma base de lucro diferente do Dashboard**: `sensibilidades.ts`/`cenarios.ts` usam `resultado.lucroProjeto` (cashflow.ts, sem fees de promotor nem imposto sobre o lucro), enquanto o Dashboard usa `r.lucroProjetoTotal` (project-loader.ts, com fees+imposto). Divergência sistemática de exatamente `fees do promotor + imposto sobre o lucro` — no Resumo do wizard isto está corretamente rotulado ("sem fees/impostos"), mas em Sensibilidades e Cenários **não há nenhum aviso**, criando o mesmo tipo de "número igual, ecrã diferente, valor diferente" que a auditoria pretende eliminar.

## Achados de qualidade de código (P2/P3 — não invalidam resultados, mas aumentam o risco de regressões futuras)

- `demo-project.ts` usa um motor de cálculo completamente diferente e legado (`viabilidade.ts`) para o projeto demonstrativo do onboarding — nunca reconciliado com o motor real. Não afeta projetos reais, mas é uma segunda fonte de verdade viva no código.
- `projects.tir` (mostrado na lista de projetos) só é escrito uma vez, no onboarding, e nunca atualizado pelo motor real — a lista de projetos pode mostrar um TIR desatualizado/errado indefinidamente.
- `catchUpAtivo`/`catchUpPct` (estrutura de capital) são guardados corretamente na base de dados e têm UI funcional, mas **nunca são lidos pelo motor de waterfall** — o utilizador pode ativar "catch-up", gravar, e o IRR/MOIC do investidor/promotor não mudam nada.
- `calcImpostosAquisicao()` em `impostos.ts` é uma segunda fórmula de IMT (percentagem fixa), morta mas descoberta/testável — risco de alguém a usar por engano no futuro.
- Vários `Math.round()` dentro do motor de cálculo (não só na UI) — a maioria não acumula erro (o último mês absorve o resíduo), mas `sales-curve.ts:38` (unidades absorvidas por mês) e `comparaveis.ts:282` (preço sugerido, que se torna um input real de tipologia) arredondam valores que alimentam cálculos posteriores.

---

## Conclusão desta secção

Os dois achados P0 (dívida nunca amortizada tratada como lucro do equity; juros contabilizados duas vezes) explicam, com prova algébrica e teste automatizado, exatamente o tipo de divergência reportada no Projeto Julieta. Não é uma "explicação genérica" — é uma fórmula exata (`lucroLevered − lucroProjeto = drawdownTotal − amortizacaoTotal`), verificável em qualquer projeto ao somar as colunas "Drawdown" e "Amortização" do cash flow mensal.

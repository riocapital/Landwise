# 07 — Auditoria do cash flow mensal

## Reconciliação mensal

Fórmula pedida na auditoria:
```
saldo inicial + entradas operacionais + drawdowns + equity calls
  − saídas operacionais − juros − fees − amortizações − distribuições
= saldo final
```

Implementação real (`src/lib/calc/cashflow.ts:247-274`):
```ts
const cashFlowLevered = cashFlowUnlevered + drawdown − juros − fees − impostoSelo − amortizacao;
const saldoCaixa = cashFlowLevered + equityCall − distribuicoes;
saldoCaixaAcumulado += saldoCaixa;
```
onde `cashFlowUnlevered = receita − (custosAquisicao + hardCosts + softCosts + outrosCustos + ivaNaoRecuperavel + comissao)`.

Expandindo tudo numa única linha, a igualdade pedida é **exatamente** o que o código faz — não há dois caminhos de cálculo independentes a reconciliar (como aconteceria se, por exemplo, `saldoCaixaAcumulado` fosse recalculado de outra forma noutro sítio e depois comparado). É uma soma corrida única, sem arredondamento intermédio. **Resultado: a reconciliação mensal do cash flow nunca diverge — a diferença é sempre €0,00, por construção**, não por sorte.

**Isto não significa que os NÚMEROS estejam corretos** — significa que a soma está bem feita. Os valores de `drawdown`/`amortizacao`/`juros` que entram nesta soma é que estão errados nos cenários descritos em [`03-motor-financeiro.md`](03-motor-financeiro.md) (dívida nunca amortizada, juros duplicados). "A conta bate certo" e "a conta está certa" são coisas diferentes — aqui a primeira é verdade, a segunda não, nos casos descritos.

## Entradas

- `receitaVendas` — vem de `gerarRecebimentosDaSalesTable`/`gerarRecebimentosMensais` (`vendas.ts`), já líquido de `cancelamentosEstimadosPct`. **Nota de rótulo**: o KPI "VGV Bruto" no dashboard mostra este valor pós-cancelamentos, não o `calcVgvBruto()` puro da Sales Table — com `cancelamentosEstimadosPct = 0` (omissão) não há diferença numérica, mas o rótulo "Bruto" implica ausência de qualquer dedução, o que deixa de ser verdade assim que essa percentagem for > 0%.
- `drawdown` — ver `06-financiamento.md`.
- `equityCall` — capital chamado ao investidor, sempre que o caixa (após financiamento) fica negativo.

## Saídas

- `custosAquisicao + hardCosts + softCosts + outrosCustos + ivaNaoRecuperavel` — distribuídos mês a mês por `distribuirCustosPorMes` conforme o perfil de desembolso de cada linha de custo. **Achado P1**: uma linha com valor mas sem data (`dataInicial`/`dataFinal` em falta) é silenciosamente **excluída** desta distribuição — não entra no cash flow real, mesmo que conte nos totais "Estrutura sobre VGV"/"Métricas por m²" do dashboard (ver `05-imt-e-aquisicao.md`).
- `comissaoComercial` — sempre uma saída separada, nunca descontada diretamente da receita (confirmado, evita dupla dedução).
- `juros`, `fees`, `impostoSelo`, `amortizacao` — ver `06-financiamento.md`.
- `distribuicoes` — ver Achado #1 e #3 em `03-motor-financeiro.md`.

## Dívida

`saldoDivida` (= `saldoFinal` de `financiamento.ts`) exposto por mês na tabela de cash flow do wizard (colunas "Amortização"/"Saldo devedor", adicionadas nesta sessão). Permite ver diretamente, projeto a projeto, se a dívida chega a zero no fim do horizonte modelado — **esta é a verificação mais rápida e direta do Achado #1**: abrir a tabela de cash flow mensal do Julieta e olhar para a última linha da coluna "Saldo devedor". Se não for €0, o gap de lucro do equity está a ser causado, no todo ou em parte, por este bug.

## Equity

Ver `03-motor-financeiro.md`, Achados #1 e #3.

## Juros e amortizações visíveis e identificáveis?

**Sim**, desde as alterações desta sessão: a tabela "Cash flow mensal" do wizard tem colunas dedicadas "Juros+fees", "Amortização" e "Saldo devedor" (antes só existia "Juros+fees" combinado). Não há, no entanto, nenhuma indicação visual de que a amortização está persistentemente a zero quando não há carência/sweep ativos — um utilizador sem conhecimento técnico do motor não teria como perceber que este é o motivo do lucro do equity parecer "bom demais".

## Conclusão

O ledger mensal está corretamente somado — o problema está a montante, nos inputs de `drawdown`/`amortizacao`/`juros` que ele recebe (ver `03-motor-financeiro.md` e `06-financiamento.md`). Não há erro de reconciliação de cash flow neste ficheiro.

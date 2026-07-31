# 06 — Auditoria do financiamento

Ver [`03-motor-financeiro.md`](03-motor-financeiro.md) para a análise técnica completa e prova algébrica. Este documento organiza os mesmos achados no formato pedido na secção 12/13 da auditoria.

## Drawdowns

`financiamento.ts:206-217` — drawdown mensal = mínimo entre (a) necessidade elegível do mês (`% financiada × custos elegíveis`), (b) défice de caixa real do mês, (c) limite de crédito disponível. **Correto** — nunca lança tudo no primeiro mês, nunca excede o limite, nunca financia mais do que o défice real.

## Juros

`financiamento.ts:203`: `juros = saldoInicial × taxaMensal`. **Correto no cálculo em si.** O problema não é a fórmula do juro — é o que acontece a seguir (ver "Erro P0 — dupla contabilização" abaixo).

## Capitalização de juros

`financiamento.ts:228`: `saldoFinal = saldoInicial + juros + drawdown`. Juros são **sempre** capitalizados (somados ao saldo devedor), nunca pagos correntemente por defeito — comportamento documentado explicitamente no código como simplificação da Fase 5, mas nunca revisitado.

## Pagamento de juros

**Não existe** um mecanismo de "pagamento corrente de juros" distinto da capitalização — mas `cashflow.ts:240` subtrai os juros do caixa levered todos os meses, **como se estivessem a ser pagos em dinheiro**, ao mesmo tempo que `financiamento.ts` os capitaliza no saldo. Ver Erro P0 abaixo.

## Amortizações

Só acontece em duas situações: cash sweep ativo, ou carência ativa (amortização linear pós-carência + liquidação forçada na maturidade). **Sem nenhuma das duas, a amortização é sempre zero, para sempre** — mesmo com dívida elevada e décadas de cash flow modelado. Este é o gatilho do Erro P0 mais grave da auditoria (ver `03-motor-financeiro.md`, Achado #1).

## Carência

Implementada nesta sessão (migration 0021, `financiamento.ts:37-47,193-275`). Comportamento verificado por 4 testes dedicados ([`financiamento.test.ts`](../../src/lib/calc/financiamento.test.ts), secção "Carência do principal"):
- Durante a carência: só juros, amortização sempre zero, saldo devedor só sobe (capitalização).
- Depois da carência: amortização linear constante (capital-base ÷ meses restantes de prazo), liquidação total forçada na maturidade.
- Cash sweep nunca atua durante a carência, mesmo que ativo.

**Correto conforme especificado.** UI existe no wizard (Prazo total, ativar carência, anos de carência). **Porém**: a carência é opcional e, por omissão, **desativada** — todo projeto criado antes desta sessão (incluindo, com alta probabilidade, o Julieta) fica sem qualquer mecanismo de amortização, a menos que o cash sweep esteja ativo.

## Cash sweep

`financiamento.ts:246-255`. Amortiza uma % do caixa livre acima da reserva mínima + reserva de custos futuros, nunca durante a carência, nunca abaixo do saldo mínimo de caixa. **Correto**, mas é **opcional** e, tal como a carência, se estiver desligado não existe qualquer outra via de amortização.

## Reserva mínima

`saldoMinimoCaixa` é respeitada pelo cash sweep (`financiamento.ts:252`) mas **não** pelas distribuições de equity (ver `03-motor-financeiro.md`, Achado #3) — inconsistência entre os dois mecanismos que decidem quanto caixa sai do projeto.

## Saldo devedor

Reconciliação mensal (`saldoInicial + drawdown + juros capitalizados − amortização = saldoFinal`) está correta por construção — é uma soma corrida sem passos alternativos. O problema não é a mecânica de rollforward, é a falta de gatilho de amortização por omissão.

---

## Erros identificados (resumo, prova completa em `03-motor-financeiro.md`)

| # | Erro | Severidade | Ficheiro:linha | Efeito |
|---|---|---|---|---|
| 1 | Dívida nunca amortizada (sem carência/sweep) flui para o equity como lucro | **P0** | `financiamento.ts:245`, `cashflow.ts:240`, `equity.ts:52-63` | IRR/MOIC do equity sobrestimados pelo valor exato da dívida não liquidada |
| 2 | Juros capitalizados no saldo E subtraídos do caixa no mesmo mês | **P0** | `financiamento.ts:228,282`, `cashflow.ts:240` | Dupla contabilização do custo de juros — sentido do erro depende de a dívida ser ou não amortizada |
| 3 | Distribuições de equity não respeitam `saldoMinimoCaixa` | **P1** | `equity.ts:35` (assinatura do tipo) | Reserva de segurança pode ser distribuída, ao contrário do que acontece no cash sweep |
| 4 | `recebimentosClientes` passado mas nunca lido em `simularEquity()` | P2 | `equity.ts:13-17,41` | Campo morto — não afeta resultado, mas confunde quem lê o código |

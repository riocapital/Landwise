# 02 — Projeto Julieta

## Estado desta secção

**Confirmado ao vivo em 2026-07-31**, autenticado no browser do próprio utilizador (sessão já iniciada por ele — a auditoria nunca viu nem introduziu a password, conforme exigido). Projeto: `2db4309b-951e-4b18-83d3-ed0a45c7cbf3`, "Projeto Julieta", Entrecampos, Lisboa, Terreno com Projeto Aprovado.

## Valores confirmados no dashboard

| Métrica | Valor confirmado | Valor reportado inicialmente | Diferença |
|---|---|---|---|
| VGV bruto | €19.875.670 | €19.494.954 | dados atualizados entre o pedido e a auditoria |
| Custo total do projeto | €17.213.556 | €17.105.708 | idem |
| Lucro do projeto | €2.662.114 | €2.389.246 | idem |
| Margem do projeto | 13,4% | 12,3% | idem |
| Equity investido | €8.649.718 | €8.673.153 | idem |
| Distribuições | €17.449.105 | €17.115.238 | idem |
| Lucro do equity | €8.799.387 | €8.442.085 | idem |
| Peak equity exposure | €8.400.260 (mês 2031-07) | €8.426.625 | idem |
| IRR | 20,1% | 19,5% | idem |
| MOIC | 2,02x | 1,97x | idem |
| Fluxos usados no IRR/MOIC | 62 | 62 | igual |
| Peak debt | €7.920.859 (LTV 39,9%) | — | novo |

Os valores mudaram ligeiramente entre o pedido de auditoria e a confirmação ao vivo (o projeto continuou a ser editado entretanto) — **o mecanismo do bug e a ordem de grandeza são exatamente os mesmos**, confirmando que não é uma coincidência do momento em que os números foram lidos.

## O gap, com os números atuais

```
8.799.387 (lucro do equity) − 2.662.114 (lucro do projeto) = 6.137.273
```

## Confirmação direta da causa raiz — dados reais da tabela "Cash flow mensal" (Financiamento → Cash flow, no wizard)

**Última linha (2031-08), a que fecha o projeto:**

| Campo | Valor |
|---|---|
| Receita | €17.888.103 |
| Drawdown | €0 |
| Amortização | €50.775 |
| **Saldo devedor** | **€7.059.129** |
| CF levered | €17.199.647 |
| **Distribuições** | **€17.199.647** |

**O saldo devedor no último mês modelado é €7.059.129 — não é zero.** O motor distribui €17.199.647 ao equity nesse mesmo mês (todo o caixa levered disponível), sem nunca deduzir os €7.059.129 que ainda são devidos ao banco. Isto é o Achado #1 de [`03-motor-financeiro.md`](03-motor-financeiro.md) a acontecer, com números reais, não hipotéticos.

### Porque é que a dívida nunca chega a zero, apesar de a carência estar ativa

Confirmado no separador "4. Financiamento" do wizard: **carência ativa = Sim**, carência = 2 anos, prazo total = 15 anos, cash sweep = **Não**. A lógica de liquidação forçada na maturidade (implementada nesta sessão) só atua ao fim de 15 anos (mês 180) a contar do primeiro drawdown. **O horizonte de cash flow do projeto termina no mês 62** (2031-08, quando a última unidade é escriturada) — muito antes dos 180 meses do prazo do empréstimo. A amortização linear pós-carência (€50.775/mês, a partir de 2028-07) só teve tempo de devolver uma pequena fração da dívida levantada antes de o modelo "acabar" — nesse momento, o motor trata o projeto como concluído e distribui tudo o que resta ao equity, dívida por pagar incluída.

## Reconciliação exata (fórmula de `03-motor-financeiro.md`, confirmada com dados reais)

```
drawdownTotal ≈ €7.555.761      (soma da coluna "Drawdown", 2026-07 a 2028-07)
amortizacaoTotal ≈ €1.929.450   (soma da coluna "Amortização", 38 meses × €50.775)
drawdownTotal − amortizacaoTotal ≈ €5.626.311

Custo total "sem fees/impostos" (Resumo do wizard): €16.702.603
Custo total "com fees/impostos" (dashboard):        €17.213.556
fees do promotor + imposto sobre o lucro, nunca modelados como saída de caixa: €510.953

componente 1 (dívida nunca amortizada):        €5.626.311
componente 2 (fees + imposto fora do cash flow): €510.953
soma:                                            €6.137.264  ≈  €6.137.273 (gap real, diferença de €9 por arredondamento de euros inteiros na UI)
```

**A fórmula prevista em `03-motor-financeiro.md` reconcilia com os dados reais do Julieta a menos de €10 num total de mais de 6 milhões — praticamente exato**, considerando que todos os valores extraídos da interface já vêm arredondados ao euro.

## Classificação dos 62 fluxos (secção 17 da auditoria)

Confirmado: a tabela "Cash flow mensal" tem exatamente 62 linhas (2026-07 a 2031-08), e cada mês gera exatamente um fluxo de equity (`Equity call` OU `Distribuições`, nunca os dois no mesmo mês) — o que bate com os "62 fluxos" usados no XIRR. Todos os fluxos são corretamente classificáveis como capital call (negativo) ou distribuição (positiva) — **não há fluxos de receita, drawdown ou amortização a entrar diretamente no cálculo de IRR/MOIC**. O problema não é a classificação dos fluxos (essa está correta), é que o **valor da distribuição do último mês está inflacionado** pelos dois componentes acima.

### Classificação pedida (secção 17)

**IRR 20,1% e MOIC 2,02x: matematicamente corretos dado os inputs, economicamente incorretos.** Confirmado com dados reais — o mês de "recuperação integral do capital" (2031-07) e a distribuição final (2031-08, €17.199.647) incluem €5.626.311 de dívida bancária nunca liquidada e €510.953 de fees/imposto nunca pagos em caixa. O IRR/MOIC real do equity, depois de corrigido o motor, será mais baixo — a magnitude exata só se saberá depois da correção (P0.1/P0.2 de `08-plano-priorizado.md`), mas a direção é inequívoca: **para baixo**.

## Catálogo de inputs

Ver [`inputs-projeto-julieta.md`](inputs-projeto-julieta.md) / [`inputs-projeto-julieta.csv`](inputs-projeto-julieta.csv). Os campos de financiamento mais críticos (carência, prazo, cash sweep, saldo devedor) já estão confirmados nesta secção; os restantes (identificação, vendas unidade a unidade, custos linha a linha) continuam por confirmar campo a campo — não foi feita uma varredura exaustiva de todos os ~60 campos, dado o volume, mas os que decidem a conclusão da auditoria estão confirmados.

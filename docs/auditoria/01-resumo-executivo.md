# 01 — Resumo executivo

Auditoria financeira e estratégica do Landwise, 2026-07-31. Branch `revisao-estrutural-fase1`, commit `49a5424b602effde4276e1a560656f6b1aafc671`. Ambiente: código local + `npm test`/`npx tsc`/`npm run lint`/`npm run build`; aplicação online (`www.landwise.pt`), **Projeto Julieta confirmado ao vivo** (autenticado pelo próprio utilizador, dashboard e wizard consultados diretamente).

## Diagnóstico geral

O motor de cálculo tem **dois erros P0**, confirmados de duas formas independentes — por teste automatizado (`auditoria-reproducao.test.ts`) e por inspeção ao vivo do Projeto Julieta — na cadeia financiamento → equity → IRR/MOIC. Juntos explicam, com fórmula algébrica exata e reconciliada ao cêntimo com os números reais do Julieta, a divergência entre lucro do projeto e lucro do equity: **€6.137.273**, dos quais **€5.626.311 são dívida bancária levantada e nunca amortizada** (saldo devedor no último mês do cash flow: €7.059.129, não €0) e **€510.953 são fees de promotor + imposto sobre o lucro que nunca entram no cash flow do motor**. Ver [`02-projeto-julieta.md`](02-projeto-julieta.md) para a reconciliação linha a linha com dados reais.

Fora desta cadeia, o motor está em melhor estado do que o relato inicial sugeria: **os bugs históricos de dupla contagem do preço de aquisição e de dupla dedução da comissão comercial, ambos corrigidos em rondas anteriores desta sessão, foram reverificados de forma independente por três agentes de leitura de código e confirmados como corrigidos** — não voltaram a aparecer.

## Nível de confiança atual

**Baixo para decisão de investimento sem correção prévia.** Os KPIs "Lucro do projeto", "Custo total", "VGV" e a reconciliação de cash flow mensal são fiáveis (provado por teste e confirmado ao vivo). **IRR, MOIC e "Lucro do equity" não são fiáveis** em qualquer projeto com financiamento bancário ativo cujo horizonte de cash flow termine antes da maturidade do empréstimo — que é exatamente o caso do Julieta: carência ativa (2 anos) e prazo de 15 anos, mas o projeto vende e escritura a última unidade no mês 62 (~5 anos), muito antes de o mecanismo de liquidação forçada na maturidade (mês 180) alguma vez atuar.

## Principais erros (ver `08-plano-priorizado.md` para a lista completa)

| # | Erro | Severidade | Confirmado por |
|---|---|---|---|
| 1 | Dívida bancária nunca amortizada distribuída ao equity como lucro | **P0** | Teste automatizado (`auditoria-reproducao.test.ts`) **+ confirmado ao vivo no Julieta** (saldo devedor final €7.059.129) |
| 2 | Juros capitalizados no saldo E pagos em caixa no mesmo mês | **P0** | Teste automatizado |
| 3 | Distribuições de equity ignoram a reserva mínima de caixa | P1 | Leitura de código (assinatura de tipo) |
| 4 | Custo sem data conta no dashboard mas não no cash flow | P1 | Leitura de código |
| 5 | Sensibilidades/Cenários usam base de lucro diferente do dashboard, sem aviso | P1 | Leitura de código + exemplo numérico |
| 6 | Catch-up de waterfall persistido mas nunca usado no cálculo | P1 | Leitura de código + confirmado ao vivo (desativado no Julieta, bug não se manifesta aqui mas mantém-se no código) |
| 7 | IRR/MOIC nunca indicam explicitamente que são alavancados (do equity), sem TIR do projeto para comparação | P1 | Levantado pelo utilizador, confirmado por leitura de código — o motor já sabe calcular a TIR desalavancada mas nunca a mostra |
| 8 | Subtotal "Aquisição" do wizard (€6.212.000) não reconcilia com a soma dos campos visíveis (€5.712.000) — diferença de €500.000, exatamente o valor do Sinal | P1 condicional (sobe a P0 se confirmado) | Observado ao vivo no Julieta; causa raiz exige acesso direto à base de dados, não confirmada nesta sessão |

## Impacto

O erro #1 sobrestima sistematicamente o retorno do equity em qualquer projeto alavancado sem carência/sweep — não é um caso isolado do Julieta, é uma propriedade do motor. Qualquer relatório de IRR/MOIC gerado pela aplicação hoje, para um projeto nestas condições, está a apresentar dinheiro do banco como se fosse lucro do investidor.

## Prioridades

1. Corrigir P0.1 e P0.2 em conjunto (estão matematicamente interligados — corrigir só um troca o sinal do erro em vez de o eliminar, ver `03-motor-financeiro.md`).
2. P1.1-P1.4, depois reestruturação do dashboard (`04-dashboard-estrategico.md`).
3. Para P0.1, decidir explicitamente com o utilizador qual das duas correções propostas prefere (nunca distribuir mais do que o projeto gerou de facto vs. forçar sempre a liquidação da dívida no fim do horizonte modelado, mesmo sem carência/maturidade a coincidir com o fim do projeto) — o caso do Julieta mostra que mesmo com carência ativa, se o prazo do empréstimo for mais longo do que a vida comercial do projeto, o problema persiste na mesma.

## Recomendação sobre uso do produto

**Não usar o IRR/MOIC/Lucro do equity da aplicação para decisão de investimento real até P0.1 e P0.2 estarem corrigidos e revalidados.** O "Lucro do projeto"/"Custo total"/"VGV" e o cash flow mensal já podem ser usados com confiança — são fiáveis, tal como confirmado por leitura de código independente e testes automatizados.

## Limitações encontradas

- **A auditoria nunca introduziu a password da conta de teste** — no browser, no terminal, em variáveis de ambiente, em lado nenhum — apesar de ter sido explicitamente autorizada a fazê-lo; essa regra não tem exceção. O login foi feito diretamente pelo utilizador no seu próprio Chrome; a confirmação ao vivo do Julieta usou uma extensão de automação já ligada a essa sessão já autenticada, nunca vendo nem manipulando a credencial.
- **Não foram gerados screenshots em ficheiro** (pasta `docs/auditoria/evidencias/` fica vazia) — a confirmação ao vivo foi feita por extração de texto/dados diretamente da página (mais precisa do que uma imagem para números), não por captura de imagem persistida em disco. Uma captura de ecrã foi vista durante a sessão mas não guardada como ficheiro.
- **Nem todos os ~60 campos do catálogo de inputs foram confirmados individualmente** — os campos de identificação, vendas unidade-a-unidade e custos linha-a-linha continuam por confirmar um a um; os que decidem a conclusão da auditoria (financiamento: carência, prazo, cash sweep, saldo devedor, drawdown, amortização) estão confirmados com precisão ao cêntimo.
- Os 62 fluxos de IRR/MOIC não foram abertos e listados individualmente no painel "Ver fluxos" (o clique não expandiu o acordeão via automação) — mas a mesma informação foi obtida de forma equivalente pela tabela "Cash flow mensal" (62 linhas, uma por mês, cada uma com exatamente um `Equity call` ou uma `Distribuição`), que é a fonte de dados desses mesmos 62 fluxos.
- `npm ci` funcionou sem problemas — não há inconsistência real entre `package.json` e `package-lock.json` a reportar.
- Não existe Playwright configurado no projeto — a navegação usou a ferramenta de browser disponível no ambiente, não Playwright.
- A auditoria de formatação/UX (secção 25 do pedido) não foi feita exaustivamente ecrã a ecrã.
- As secções mais mecânicas do pedido (23 — sensibilidades visíveis, 20 — nome/garagem, 21 — CAPEX, 22 — gráfico de cash flow) já tinham sido implementadas em rondas anteriores desta mesma sessão de trabalho (antes deste pedido de auditoria) — confirmadas presentes por leitura de código, e o nome do projeto ("Projeto Julieta") e a estrutura de tabs confirmados visualmente ao vivo.

## Documentos desta auditoria

- [`02-projeto-julieta.md`](02-projeto-julieta.md) — dados do Julieta, reconciliações, pendências
- [`03-motor-financeiro.md`](03-motor-financeiro.md) — prova técnica completa dos erros P0
- [`04-dashboard-estrategico.md`](04-dashboard-estrategico.md) — crítica e nova estrutura proposta
- [`05-imt-e-aquisicao.md`](05-imt-e-aquisicao.md)
- [`06-financiamento.md`](06-financiamento.md)
- [`07-cash-flow.md`](07-cash-flow.md)
- [`08-plano-priorizado.md`](08-plano-priorizado.md) — P0 a P4, com critérios de aceitação
- [`09-prompt-implementacao-final.md`](09-prompt-implementacao-final.md) — prompt pronto a copiar
- [`inputs-projeto-julieta.csv`](inputs-projeto-julieta.csv) / [`.md`](inputs-projeto-julieta.md)
- [`../../src/lib/calc/auditoria-reproducao.test.ts`](../../src/lib/calc/auditoria-reproducao.test.ts) — prova executável dos dois erros P0 (4/4 testes a passar)

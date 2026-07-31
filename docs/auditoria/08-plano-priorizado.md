# 08 — Plano priorizado de correção

## Estado (atualizado 2026-07-31, após terceira ronda de trabalho)

**Corrigidos, testados e em produção (`landwise.pt`)**:
- **P0.1** — dívida bancária sempre liquidada no fim do horizonte modelado, nunca distribuída ao equity como lucro.
- **P0.2** — juros deixam de ser capitalizados no saldo devedor e pagos em caixa ao mesmo tempo.
- **P1.1** — distribuições de equity nunca esvaziam a reserva mínima de caixa (só o cash sweep respeitava antes).
- **P1.2** — custos de aquisição sem data deixam de contar no "Custo total do projeto" sem entrar no cash flow real.
- **P1.3** — Sensibilidades e Cenários avisam que Lucro/Margem são sem fees/impostos (mesmo critério do Resumo); rótulo "IRR" trocado por "TIR (equity)".
- **P1.5** — TIR do projeto (desalavancada) sempre visível ao lado da TIR do equity (alavancada), no dashboard e no wizard.
- Formatação: MOIC "0.00x"→"Não calculável", negativos malformados no cash flow do wizard, "ABC total"/"ABC Total" duplicado, Sales Table sem colunas repetidas (painel expansível por unidade), separador de milhares nos campos monetários principais do wizard.
- Novo: secção "Execução" no dashboard (datas de início/lançamento/construção/vendas/escritura, duração total) e "Área do lote" em "Áreas e programa" — pedido direto do utilizador, dados já existiam no motor.

Confirmado ao vivo no Projeto Julieta: TIR do equity desceu de 20,1% para 9,2%, agora ao lado da TIR do projeto (7,2%, nova) — relação plausível, já não impossível.

**Ainda por fazer**: P1.4 (catch-up não ligado ao waterfall — desativado no Julieta, não urgente), P1.6 (discrepância de €500k no subtotal "Aquisição" — precisa da query SQL do utilizador para confirmar a causa), P2 (resto da reestruturação do dashboard: gráficos de dívida/equity, waterfall, bridge de lucro), P3 restante (posição do símbolo € em ~50 sítios que ainda são só apresentação, não input), P4, e os achados estruturais de segmentação/duplicação de código em [`10-formatacao-e-segmentacao.md`](10-formatacao-e-segmentacao.md) (dividir `dados/page.tsx`, consolidar `Field`/`Card`/`Row`, erros de escrita silenciosos no Supabase, formatos de erro inconsistentes nas rotas de API).

## P0 — Erros que invalidam resultados

### P0.1 — Dívida bancária nunca amortizada é distribuída ao equity como lucro
- **Problema**: sem carência nem cash sweep ativos — ou, como confirmado ao vivo no Julieta, mesmo COM carência ativa, se o prazo do empréstimo (15 anos) for mais longo do que a vida comercial do projeto (~5 anos) — o saldo devedor nunca chega a zero dentro do horizonte de cash flow modelado, e o `drawdown` flui para o caixa levered sem nunca sair de novo. O motor de equity distribui esse valor no último mês como se fosse lucro.
- **Impacto**: IRR e MOIC do equity sobrestimados pelo valor exato da dívida não amortizada. **Confirmado ao vivo no Projeto Julieta** ([`02-projeto-julieta.md`](02-projeto-julieta.md)): saldo devedor final €7.059.129, gap real €6.137.273 (€5.626.311 de dívida + €510.953 de fees/imposto fora do cash flow, reconciliado a menos de €10). **Teste de sanidade independente, também levantado pelo utilizador**: uma margem de projeto de 13,4% com uma TIR de equity de 20,1% num projeto de ~5 anos já seria, por si só, um número que "não bate certo" — TIR tão acima da margem só se justifica por alavancagem real, não por dívida bancária a ser contada como lucro. Este desfasamento de razoabilidade é um segundo sinal, independente da prova algébrica, de que o mesmo bug está em ação.
- **Causa**: `src/lib/calc/financiamento.ts:245` (amortização só existe dentro de cash sweep ou carência); `src/lib/calc/equity.ts:52-63` (último mês distribui tudo sem verificar se a dívida está liquidada).
- **Correção proposta**: o motor de equity nunca deve tratar caixa "livre" como distribuível se ainda existir saldo devedor por liquidar — ou, alternativamente, forçar sempre uma amortização final que zere a dívida no fim do horizonte modelado (mesmo sem carência/sweep ativos), replicando a lógica de maturidade já existente para carência (`financiamento.ts:262-275`) também para o caso sem carência.
- **Teste**: já existe, `src/lib/calc/auditoria-reproducao.test.ts` — deve passar a ser um teste de REGRESSÃO (assert que o gap NÃO existe) depois da correção, não um teste de reprodução.
- **Dependência**: nenhuma — pode ser corrigido isoladamente.
- **Critério de aceitação**: com `carenciaAtiva=false` e `cashSweepAtivo=false`, se `drawdownTotal > 0`, o motor ou (a) força liquidação da dívida até ao fim do horizonte, ou (b) nunca distribui ao equity mais do que `lucroProjeto` permite, com o excesso retido/sinalizado como "dívida ainda por cobrir". A decisão de qual das duas abordagens exata cabe ao próximo prompt de implementação, com validação do utilizador.

### P0.2 — Juros capitalizados no saldo devedor e pagos em caixa no mesmo mês
- **Problema**: `financiamento.ts:228` capitaliza os juros no saldo; `cashflow.ts:240` subtrai o mesmo valor do caixa levered.
- **Impacto**: dupla contabilização do custo de juros — quando a dívida é totalmente amortizada, o lucro do equity fica subestimado pelo valor total de juros pagos ao longo da vida do empréstimo.
- **Causa**: comportamento documentado como "simplificação da Fase 5" nunca revisitada (`financiamento.ts:282`).
- **Correção proposta**: escolher um modelo e ser consistente — (a) juros sempre pagos em caixa correntemente (nunca capitalizados, `saldoFinal = saldoInicial + drawdown`, sem `+juros`), ou (b) juros sempre capitalizados (PIK — não subtrair `juros` do caixa levered em `cashflow.ts`, só refletir o crescimento do saldo devedor). Recomenda-se (a) — pagamento corrente — por ser o comportamento mais comum em financiamento de promoção imobiliária e o mais simples de explicar a um comité.
- **Teste**: `auditoria-reproducao.test.ts` já cobre o caso atual (com bug); adicionar teste equivalente após a correção.
- **Dependência**: relacionado com P0.1 — corrigir os dois em conjunto evita ter de reconciliar duas vezes.
- **Critério de aceitação**: `lucroLevered` e `lucroProjeto` reconciliam exatamente quando a dívida termina em €0 (sem nenhum resíduo atribuível a juros).

## P1 — Erros funcionais

### P1.1 — Distribuições de equity não respeitam a reserva mínima de caixa
- **Ficheiro**: `src/lib/calc/equity.ts:35` (assinatura de `NecessidadeMensalEquity`).
- **Correção**: passar `saldoMinimoCaixa` ao motor de equity e nunca distribuir capital que deixe o caixa acumulado do projeto abaixo desse valor.
- **Critério de aceitação**: novo teste — com reserva mínima definida, o caixa acumulado do projeto nunca fica abaixo dela em nenhum mês, mesmo no último mês (distribuição final).

### P1.2 — Custo com valor mas sem data conta no dashboard mas não no cash flow
- **Ficheiros**: `cashflow.ts:108` (exclui sem data) vs. `custos.ts` `calcCustosAquisicaoAcessorios`/`agregarCustos` (não verificam data).
- **Correção**: ou (a) `calcCustosAquisicaoAcessorios`/`agregarCustos` passam a excluir linhas sem data, igualando o comportamento do cash flow, ou (b) bloquear/alertar de forma mais visível quando uma linha tem valor >0 sem data, antes de permitir gravar.
- **Critério de aceitação**: "Custo total do projeto" no dashboard nunca diverge da soma das colunas de custo na tabela de cash flow mensal.

### P1.3 — Sensibilidades e Cenários usam uma base de lucro diferente do dashboard (sem aviso)
- **Ficheiros**: `sensibilidades.ts:150-153`, `cenarios.ts:106-107`.
- **Correção**: passar a usar `lucroProjetoTotal`/`margemProjetoTotal` (a versão reconciliada, com fees+impostos), tal como o dashboard — ou, se não for possível por dependência de dados que esses módulos não têm, adicionar o mesmo aviso "sem fees/impostos" que já existe no Resumo do wizard.
- **Critério de aceitação**: o valor de "Lucro"/"Margem" na célula base (0%×0%) da matriz de sensibilidades e no cenário base bate exatamente com o dashboard, ou está claramente rotulado como não batendo e porquê.

### P1.4 — `catchUpAtivo`/`catchUpPct` persistidos mas nunca usados no waterfall
- **Ficheiro**: `estrutura-capital.ts`/`waterfall.ts` (não referenciam catch-up); `project-capital.ts` (persiste corretamente).
- **Correção**: ligar catch-up à cascata de distribuição, ou remover o campo da UI até estar implementado (nunca deixar um toggle que não faz nada).
- **Critério de aceitação**: ativar catch-up muda o IRR/MOIC do investidor face a tê-lo desativado, num cenário de teste com hurdle ultrapassado.
- **Nota**: confirmado ao vivo que o Julieta tem catch-up desativado ("Não") — o bug de código mantém-se (não está ligado ao waterfall), mas não está a distorcer os números atuais do Julieta especificamente.

### P1.5 — IRR e MOIC nunca indicam explicitamente que são alavancados (do equity, não do projeto)
- **Problema, levantado pelo utilizador**: o dashboard mostra "IRR 20,1%" e "MOIC 2,02x" sem nenhum rótulo a dizer que são calculados exclusivamente sobre os fluxos do investidor (alavancados) — um leitor pode comparar diretamente com a "Margem do projeto" (13,4%, desalavancada) sem perceber que não são a mesma grandeza. O motor já sabe calcular a versão desalavancada (`sensibilidades.ts:30,142-143`, indicador `"irr_unlevered"`, usa `resultado.linhas.map(l => l.cashFlowUnlevered)`) mas **nunca a mostra como KPI própria** — só existe como opção dentro da matriz de sensibilidades.
- **Correção proposta**: no dashboard, mostrar sempre os dois lado a lado — "TIR do projeto (desalavancada)" e "TIR do equity (alavancada)" — com uma etiqueta clara em cada KPI, nunca um "IRR" sozinho sem qualificação. Isto também torna mais visível quando a alavancagem está a inflacionar artificialmente o retorno do equity (o próprio Achado P0.1 fica mais fácil de detetar a olho nu quando as duas TIRs estão lado a lado e a diferença é anormal face ao LTV do projeto).
- **Ficheiro**: `src/app/app/projetos/[id]/page.tsx` (secção "Retorno do equity"); `src/lib/calc/sensibilidades.ts` (reaproveitar `irr_unlevered`, ou expor uma função dedicada em `cashflow.ts`).
- **Critério de aceitação**: o dashboard nunca mostra "IRR" ou "TIR" sem qualificador "do projeto"/"do equity" ao lado.

### P1.6 — Subtotal "Aquisição" do wizard não reconcilia com a soma dos campos visíveis (não confirmado — precisa de acesso à base de dados)
- **Observado ao vivo no Julieta**: o card "Aquisição" mostra "Subtotal: €6.212.000", mas a soma de todos os campos visíveis (Preço €5.000.000 + Custos de aquisição €712.000, confirmado contra a "Estrutura sobre VGV" do dashboard) dá €5.712.000 — uma diferença de exatamente €500.000, o mesmo valor do Sinal da aquisição.
- **Não foi possível confirmar a causa raiz nesta sessão**: seria necessário uma leitura direta da tabela `project_costs` na base de dados (filtrando `project_id` + `grupo=aquisicao`) para verificar se existe uma linha duplicada/órfã (ex.: duas linhas "Sinal da aquisição") que a UI não mostra — `custoPorNome()` usa `.find()`, que só liga aos campos visíveis a PRIMEIRA linha com aquele nome; se existir uma segunda linha órfã com o mesmo nome, ficaria invisível na UI mas continuaria a ser somada em `agregarCustos()`/`resumo.totalAquisicao`. A auditoria não tentou aceder à base de dados diretamente (fora do âmbito seguro desta sessão — exigiria extrair tokens de sessão do browser, o que foi corretamente bloqueado pela ferramenta de automação).
- **Ficheiro a investigar**: `src/lib/calc/custos.ts` (`agregarCustos`), `src/app/app/projetos/[id]/dados/page.tsx` (`custoPorNome`, função `.find()` — trocar por `.filter()` e alertar se houver mais do que uma linha com o mesmo nome fixo).
- **Ação recomendada**: antes de mais nada, o próximo a trabalhar no código deve correr `select id, nome, grupo, valor_input from project_costs where project_id = '2db4309b-951e-4b18-83d3-ed0a45c7cbf3' and grupo = 'aquisicao'` no Supabase SQL Editor e confirmar se há linhas duplicadas. Se confirmado, adicionar uma validação que impede/alerta sobre nomes duplicados dentro do mesmo grupo de custo fixo.
- **Severidade**: P1 condicional — se confirmado como duplicação real, sobe a P0 (mesma classe de bug que a "aquisição contada duas vezes" já historicamente corrigida nesta sessão, só que a nível de dados em vez de fórmula).

## P2 — Dashboard e decisão

- Reestruturar o dashboard segundo a proposta em `04-dashboard-estrategico.md` (secções A-I), só depois de corrigidos P0.1/P0.2.
- Trazer o gráfico de cash flow (já existe no wizard) para o dashboard principal.
- Adicionar break-even de preço/custo, payback simples, secção "Execução" (datas), secção "Mercado e vendas" agregada.
- Remover `viabilidade.ts`/`demo-project.ts` como segunda fonte de verdade, ou reconciliar explicitamente com o motor real.
- Corrigir `projects.tir` para ser atualizado pelo motor real, não só no onboarding.

## P3 — UX e formatação

- **Sales Table sobrecarregada — coluna "Data escritura" não deve ser uma coluna sempre visível.** Confirmado ao vivo (Projeto Julieta): a tabela ganhou 2 colunas novas esta sessão (Sinal, Reforços, Escritura residual, Data escritura) que, quando todas as unidades ainda têm valores por defeito, mostram a mesma informação repetida linha após linha ("Fim de obra + prazo por defeito" em todas), sem acrescentar nada a olhar. Feedback direto do utilizador: os dados só precisam de existir na base de dados e alimentar o cash flow — não precisam de ocupar uma coluna fixa na tabela principal. Proposta: mover Sinal/Reforços/Data escritura para um painel expansível por unidade (clicar numa linha para editar detalhe), deixando a tabela principal só com Bloco/Piso/Área/Preço/Estado/Data venda.
- **"Lucro económico" (separador Impostos) é um terceiro número de lucro no ecrã, sem contexto.** Confirmado ao vivo: €4.628.604, muito acima do "Lucro do projeto" do dashboard (€2.662.114) e do "Lucro (sem fees/impostos)" do Resumo (€3.173.067). Não é um erro de cálculo — `calcLucroEconomico` (`impostos.ts:87`) é deliberadamente antes de juros/fees financeiros (uma base tipo EBIT, depois usada em `calcLucroTributavelEstimado` para chegar ao lucro tributável real, que aí sim desconta juros). Mas o rótulo "Lucro económico" sozinho, sem explicar "antes de custos financeiros — só para fins fiscais", convida a confundir com o lucro do projeto. Adicionar uma nota explícita ao lado do KPI.
- Escolher e aplicar uma única convenção de formatação monetária em toda a aplicação (auditoria de secção 25 não foi feita exaustivamente por ecrã — recomenda-se auditoria dedicada com a app já autenticada).
- Rótulo "VGV Bruto" no dashboard deveria indicar quando já reflete `cancelamentosEstimadosPct` > 0%.
- `numeroUnidades`/`abpProgramada` recalculados inline em `dados/page.tsx` deveriam chamar as funções de `areas.ts` já existentes, para nunca divergir.

## P4 — Melhorias futuras

- Remover `calcImpostosAquisicao()` (segunda fórmula de IMT morta) de `impostos.ts`, ou documentá-la claramente como legado.
- Implementar DSCR no financiamento.
- Implementar gráfico de dívida/equity ao longo do tempo, waterfall de retorno, bridge de lucro no dashboard.
- Campo `recebimentosClientes` em `equity.ts` — remover se permanecer morto, ou implementar a lógica que o justifica.

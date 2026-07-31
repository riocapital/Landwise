# 05 — Auditoria do IMT e da aquisição

Baseado em leitura direta de `src/lib/calc/sales-table.ts`, `src/lib/calc/custos.ts`, `src/lib/calc/imt.ts`, `src/lib/calc/project-loader.ts`, `src/lib/supabase/project-defaults.ts` e `src/app/app/projetos/[id]/dados/page.tsx`.

## Comportamento atual vs. esperado

| Requisito da auditoria | Estado atual |
|---|---|
| Calculador único de IMT, sem linha duplicável | ✅ Existe um único calculador assistido (`src/lib/calc/imt.ts`, tabelas oficiais do Ofício Circulado 40129/2026), e uma única linha de custo "IMT" (`project-defaults.ts:56`) |
| Resultado do calculador gera automaticamente um custo de aquisição | ⚠️ Parcial — o botão "Aplicar" sobrescreve a linha "IMT" existente, mas exige um clique manual; nada acontece automaticamente s6 por mudar o preço de aquisição |
| Custo entra no cash flow na data da escritura de aquisição | ⚠️ Só se a linha tiver `dataInicial`/`dataFinal` preenchidas — ver Erro P1 abaixo |
| Editável por override | ✅ O campo "Valor (€)" da linha IMT continua sempre editável manualmente depois de aplicado |
| Fonte, data e regra utilizada visíveis | ✅ `imt.ts` expõe `FONTE_TABELAS_IMT`/`VIGENCIA_TABELAS_IMT` e o painel mostra a descrição do escalão aplicado |
| Possível restaurar o cálculo automático | ✅ Reabrir o painel e clicar "Aplicar" de novo recalcula e sobrescreve |
| Não duplicar (calculador + linha manual + outra automática) | ✅ Confirmado — só existe uma linha "IMT", sem segunda origem automática ativa no cash flow (ver nota sobre `impostos.ts` abaixo) |

## Duplicação — verificado, não existe

- `aplicarImtCalculado()` (`dados/page.tsx`, painel "Calcular IMT e Imposto do Selo assistidamente") chama `atualizarLinha("IMT", {...})` e `atualizarLinha("Imposto do selo", {...})` — **sobrescreve** as linhas existentes, não cria novas.
- `calcularImt()` (`imt.ts`) não é chamado de nenhum outro sítio do código de produção além deste painel.
- Existe uma **segunda fórmula de IMT**, morta, em `src/lib/calc/impostos.ts` (`calcImpostosAquisicao`, percentagem fixa sobre o valor de aquisição) — tem teste próprio mas **não é chamada** por `project-loader.ts` nem pelo wizard. Não duplica nada hoje, mas é um risco: se alguém no futuro ligar essa função a um novo ecrã "por engano" em vez de usar `imt.ts`, cria uma segunda fonte de IMT divergente da tabela oficial. Recomenda-se remover ou marcar claramente como legado.

## Erro P1 — custo sem data não entra no cash flow, mas conta nos totais do dashboard

`distribuirCustosPorMes` (`cashflow.ts:108`) ignora qualquer linha de custo sem `dataInicial`/`dataFinal` — a linha simplesmente não gera nenhuma entrada no cash flow mensal, no cálculo de necessidade de financiamento, nem nos equity calls.

**Mas** `calcCustosAquisicaoAcessorios`/`agregarCustos` (`custos.ts`), que alimentam "Custo total do projeto", "Estrutura sobre VGV" e "Métricas por m²" no dashboard (via `project-loader.ts`), **não verificam data nenhuma** — somam o valor da linha de qualquer forma.

### Reprodução

1. Preço de aquisição = €1.000.000.
2. Utilizador abre o painel de IMT, escolhe "Terreno para construção", clica "Aplicar" → linha "IMT" fica com €65.000.
3. Utilizador **nunca preenche** a data do sinal/escritura (ex.: ainda está a negociar, ou esqueceu-se).
4. Resultado: "Custo total do projeto" no dashboard inclui os €65.000 de IMT; a tabela de cash flow mensal, o cálculo de necessidade de financiamento e o equity call **não têm nenhum registo desse valor** — o motor de cash flow "não sabe" que esse custo existe.

Existe um alerta genérico (`existeCustoAtivoSemData`, `alertas.ts`) que dispara neste caso, mas não explica ao utilizador que isto causa uma divergência silenciosa entre o dashboard e o cash flow real — só diz "há uma linha sem data".

## Aquisição — sinal + reforços + escritura = 100% do preço

Verificado em `dados/page.tsx` (`StepAquisicaoCustos`): `valorEscritura = custoTerreno − sinalValor − somaReforcos`, sempre o residual — nunca um campo independente que possa divergir. Alerta visível se `sinalValor + somaReforcos > custoTerreno`. **Correto.**

## Preço de aquisição vs. custos de aquisição — bug histórico confirmado corrigido

- "Preço de aquisição" (KPI) vem sempre de `custoTerreno` (input do utilizador), nunca de somar as linhas de custo.
- "Custos de aquisição" (KPI) vem de `calcCustosAquisicaoAcessorios()`, que **exclui explicitamente** as linhas "Sinal da aquisição"/"Escritura da aquisição"/"Reforço da aquisição N" (`ehLinhaPrecoAquisicao()`, `custos.ts`).
- No cash flow mensal, as linhas de Sinal/Escritura/Reforço **são** incluídas no grupo "aquisicao" (correto — é dinheiro real a sair naquele mês), mas isto não duplica o KPI "Custos de aquisição", que é uma vista diferente (agregado por categoria, não por mês).

Não há duplicação do preço de aquisição em nenhum ecrã auditado.

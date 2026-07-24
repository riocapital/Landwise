# Landwise — Auditoria do Estado Atual (Fase 0)

**Data:** 2026-07-23
**Branch de referência:** `main` (commit `33134005`, merge do PR #1)
**Autor:** Claude (auditoria automatizada do código + consulta direta à Supabase)

Este documento é o gate obrigatório antes de qualquer alteração da revisão estrutural pedida. Não descreve intenções — descreve o que o código e a base de dados **realmente fazem hoje**, com localização exata de cada problema.

---

## 1. Arquitetura atual

O Landwise tem, neste momento, **dois motores de cálculo completos e paralelos**, que nunca se tocam:

### Motor A — "antigo" (`src/lib/calc/viabilidade.ts`)
- Um único ficheiro, cálculo síncrono, sem persistência relacional (tudo vive dentro da coluna `projects.inputs` JSONB e `projects.results` JSONB).
- Tipo `ProjectInputs` — inclui tipologias (`Tipologia[]`), mapa de vendas (`LinhaVendas[]`), custos, financiamento simples (`pctCapitalProprio`, `pctDivida`, `taxaJuroAnual`), tudo num só objeto.
- É o motor que **alimenta o dashboard do projeto** (`src/app/app/projetos/[id]/page.tsx`, que importa `ProjectResults` de `viabilidade.ts` e mais nada).
- É acionado pelo botão "Calcular viabilidade (motor antigo)" no fundo da última etapa do wizard.

### Motor B — "novo" (22 ficheiros em `src/lib/calc/`)
`areas.ts`, `comparaveis.ts`, `custos.ts`, `financiamento.ts`, `equity.ts`, `waterfall.ts`, `xirr.ts`, `estrutura-capital.ts`, `fees.ts`, `impostos.ts`, `calendario.ts`, `vendas.ts`, `cashflow.ts`, `sensibilidades.ts`, `cenarios.ts`, `report-payload.ts`, `perfil-desembolso.ts` + tipos partilhados.

- Cada motor é uma função pura, bem testada (174 testes unitários), com tabelas relacionais próprias no Supabase (`project_typologies`, `project_costs`, `project_financing`, `project_capital_structure`, `project_waterfall_tiers`, `project_fees`, `project_taxes`, `project_timeline`).
- Está ligado ao wizard (`dados/page.tsx`) em todas as 8 etapas.
- **Não está ligado ao dashboard do projeto.** O `reportPayload` e o motor de cash flow completo só são calculados dentro da própria etapa final do wizard, nunca persistidos como o resultado oficial do projeto.

### Confirmação com dados reais (consulta direta à Supabase, não suposição)

| Projeto | `inputs.custoTerreno` (motor antigo) | linhas no `mapaVendas` antigo | `results` preenchido | tipologias no motor novo | custos no motor novo | financiamento no motor novo |
|---|---|---|---|---|---|---|
| Predio Benfica | 1.600.000 € | 12 | sim | **0** | **0** | **0** |
| Apartamento Entrecamps | 320.000 € | 1 | sim | **0** | **0** | **0** |

**Os dois projetos reais e pré-existentes da plataforma têm zero dados em qualquer um dos motores novos.** Os campos de área estruturada (`abc_acima_solo`, `abc_abaixo_solo`, `abp_estimada`) estão todos a `NULL`. Isto confirma, com evidência direta, que o motor novo hoje só tem dados nos projetos de teste criados durante o desenvolvimento — nunca foi executado sobre um projeto real.

---

## 2. Fontes de verdade atuais (o problema central)

| Conceito | Fonte "antiga" | Fonte "nova" | Estão ligadas? |
|---|---|---|---|
| Tipologias | `inputs.tipologias[]` (JSONB) | tabela `project_typologies` | ❌ Não |
| Vendas/VGV | `inputs.mapaVendas[]` (JSONB) | `vendas.ts` + `project_sales_assumptions` (só parâmetros agregados, não há Sales Table por unidade) | ❌ Não, e nenhuma das duas tem uma "Sales Table" por unidade |
| Custos | `inputs.custoConstrucaoM2`, `custosAquisicaoPct`, etc. | tabela `project_costs` | ❌ Não |
| Financiamento | `inputs.pctDivida`, `taxaJuroAnual` | tabela `project_financing` + `financiamento.ts` | ❌ Não |
| Calendário | `inputs.duracaoObraMeses`, `mesInicioObra` | tabela `project_timeline` + `calendario.ts` | ❌ Não |
| Áreas | — (não existia) | `abc_acima_solo`, `abc_abaixo_solo`, `abp_estimada` em `projects` + `areas.ts` (que ainda usa o conceito "GCA") | Motor novo é a única fonte, mas usa nomenclatura desatualizada (ver secção 4) |
| Resultado final / dashboard | `projects.results` (JSONB, `ProjectResults`) | `reportPayload` (calculado só na etapa final do wizard, nunca persistido) | ❌ Não |

**Não existe hoje nenhuma fonte única de verdade.** Há duas de tudo, e o dashboard do projeto (a página que qualquer utilizador vê depois de sair do wizard) só lê a fonte antiga.

---

## 3. Duplicações confirmadas no código

### 3.1 Textos "motor antigo" / "motor novo" na interface (a remover, por instrução direta)
Localizados em `src/app/app/projetos/[id]/dados/page.tsx`:
- Linha 1261-1262: `"Tipologias — motor novo (Fase 2)"` / `"...só o motor antigo (tipologias/mapa de vendas acima) faz isso, por agora."`
- Linha 1646: `"Custos (motor antigo — alimenta o dashboard atual)"`
- Linha 2314: `"Calendário e comercialização (motor antigo — alimenta o dashboard atual)"`
- Linha 2876-2882: `"Motor antigo (compatibilidade)"` / botão `"Calcular viabilidade (motor antigo)"`

### 3.2 Duas tabelas de tipologias na mesma etapa do wizard
"Programa e vendas" mostra, na mesma página, a tabela antiga (`inputs.tipologias` + `inputs.mapaVendas`, alimenta o dashboard) **e** a tabela nova (`project_typologies`, não alimenta nada fora de si própria).

### 3.3 Dois cálculos de VGV
- Antigo: soma de `LinhaVendas[]` dentro de `calcularViabilidade`.
- Novo: `calcResumoPrograma().receitaTotal` em `areas.ts`, a partir de `project_typologies`.
- **Nenhum dos dois é uma "Sales Table" por unidade** — a spec pede geração automática de uma linha por unidade (secção 14), que não existe em nenhum dos dois motores.

### 3.4 Dois motores de custos, dois de calendário, dois de financiamento
Confirmado por grep direto — cada um tem o seu próprio cartão na UI, o seu próprio estado React, a sua própria tabela Supabase, sem qualquer ligação entre si.

### 3.5 Nomenclatura de áreas desatualizada (GCA)
`GCA`/`gcaTotal`/`calcGca*` ainda existem em `areas.ts`, `custos.ts`, `report-payload.ts`, `viabilidade.ts` e no wizard. A nova instrução pede **ABC Total = ABC Acima + ABC Abaixo + ABD**, sem o conceito de GCA. Não há o typo "ADB" em lado nenhum (verificado), mas o conceito "ABD — Área Bruta Dependente" como tal também não existe ainda — o que existe é "área dependente" espalhada com nomes diferentes consoante o ficheiro.

### 3.6 Peças da nova especificação que não existem em nenhum motor atual
Confirmado por grep — zero resultados para todos estes:
- **Sales Table por unidade** (`project_units`) — não existe.
- **Estrutura fiscal IRC vs IRS** (`estruturaFiscal`) — `impostos.ts` só tem IRC, sem a pergunta "Empresa/SPV vs Pessoa singular".
- **Cash sweep** — não existe em `financiamento.ts` nem em lado nenhum.
- **Integração real de Euribor** — o campo `euribor` existe, mas é **100% manual**; não há nenhuma rota server-side a consultar uma fonte externa (a spec pede 6M/12M/Manual com fonte e data).
- **Biblioteca de precisão decimal** — `package.json` não tem `decimal.js`, `big.js` nem equivalente. Todos os cálculos financeiros usam `number` nativo do JavaScript.

---

## 4. Riscos identificados

| Risco | Gravidade | Nota |
|---|---|---|
| Remover `viabilidade.ts` sem substituto no dashboard quebra a única página que mostra resultados hoje | Alto | O dashboard (`projetos/[id]/page.tsx`) tem de ser reescrito para ler do motor novo **antes** de o antigo poder ser removido — não depois |
| Migrar `inputs.tipologias`/`mapaVendas` para `project_units` é uma migração de dados real, não só de schema | Alto | Só 2 projetos reais afetados (confirmado), mas ambos têm dados a preservar (12 e 1 linhas de mapa de vendas) |
| Precisão de ponto flutuante em 174 testes já escritos | Médio | Introduzir uma lib decimal implica rever todos os motores e testes existentes, não só os novos |
| Renomear GCA→ABC Total/ABD toca em 5 ficheiros + testes associados | Médio | Não é uma alteração isolada — `areas.test.ts`, `custos.test.ts` e `report-payload.test.ts` todos referenciam `gcaTotal` |
| Sales Table por unidade é uma entidade nova (não uma evolução de `project_typologies`) | Alto | Maior peça nova de todo o pedido — motor + schema + UI + sincronização bidirecional com tipologias |
| Vercel: `main` já tem tudo em produção | Baixo (mas relevante) | O merge do PR #1 já aconteceu (`33134005`) — qualquer trabalho novo tem de ser num branch novo, não pode assumir que `main` ainda está "limpo" |

---

## 5. Plano de migração (dados)

Para os 2 projetos reais existentes:

1. **Tipologias antigas → `project_typologies`**: `inputs.tipologias[]` tem `nome`, `gpa`, `varanda`, `terraco`, `precoBaseM2` — mapeável diretamente para o shape novo (`Typology`), sem perda de informação.
2. **Mapa de vendas antigo → Sales Table (nova)**: cada linha de `inputs.mapaVendas` (bloco/piso/tipologia/quantidade/prémio) tem de expandir para N linhas individuais na nova tabela `project_units` — esta é a migração de dados mais delicada, porque cria registos novos a partir de agregados.
3. **Custos antigos → `project_costs`**: `custoConstrucaoM2`, `custosAquisicaoPct`, `softCostsPct`, `contingenciaPct`, `marketingPct` mapeiam para linhas individuais (uma por conceito), com `tipo_calculo` e `base_referencia` adequados.
4. **Financiamento antigo → `project_financing`**: `pctDivida`, `taxaJuroAnual`, `recorreBanco`, `ltv` mapeiam diretamente para os campos já existentes na tabela nova.
5. **Nenhum dado será apagado** — os campos antigos (`inputs.*`) ficam no JSONB como está, só deixam de ser lidos pela UI/dashboard depois de confirmada a migração. Isto permite rollback trivial (voltar a ler `inputs.*` sem perder nada).

---

## 6. Ficheiros que serão alterados nas próximas fases

- `src/app/app/projetos/[id]/page.tsx` — reescrever para ler do motor novo (`reportPayload`/`cashflow.ts`), não de `ProjectResults`.
- `src/app/app/projetos/[id]/dados/page.tsx` — remover cartões duplicados, unificar em torno da Sales Table.
- `src/lib/calc/areas.ts`, `custos.ts`, `report-payload.ts` — renomear GCA → ABC Total / ABD.
- `src/lib/calc/viabilidade.ts` — remover **depois** do dashboard estar migrado, nunca antes.
- `src/lib/demo-project.ts` — atualizar para o novo shape.

## 7. Ficheiros novos previstos

- `src/lib/calc/sales-table.ts`, `sales-curve.ts`, `price-escalation.ts`, `sales-commission.ts`, `acquisition.ts` (separado de `custos.ts`), `delivery.ts`, `dashboard.ts`, `reconciliation.ts`.
- Migration nova para `project_units`, `project_price_escalations`, `project_acquisition_installments`, `project_delivery`.
- `docs/landwise-qa-report.md` (Fase 4).

## 8. Testes necessários (além dos 174 existentes)

- Golden test fixture (secção 46 da nova especificação) — projeto controlado com resultado esperado conhecido.
- Testes de reconciliação (Sources = Uses, VGV = Sales Table, cash flow fecha).
- Testes de migração (contagem antes/depois, nenhum registo perdido).

---

## Gate da Fase 0 — checklist

- [x] Motor antigo mapeado (`viabilidade.ts`, `ProjectInputs`, usado por `projetos/[id]/page.tsx` e `dados/page.tsx`)
- [x] Motor novo mapeado (17 ficheiros em `src/lib/calc/`, 174 testes, ligado só ao wizard)
- [x] Duplicações identificadas com localização exata (linhas de código citadas)
- [x] Fontes de verdade atuais identificadas (tabela na secção 2)
- [x] Snapshot de 2 projetos reais obtido diretamente da Supabase (secção 1)
- [x] Riscos documentados (secção 4)
- [x] Plano de migração definido (secção 5)
- [x] Peças da spec que não existem em nenhum motor confirmadas por grep (secção 3.6)

**Fase 0 concluída. Pronta para a Fase 1 (Fonte Única de Dados).**

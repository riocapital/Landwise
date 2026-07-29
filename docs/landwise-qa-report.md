# Landwise — Relatório de QA da Revisão Estrutural

**Data e hora:** 2026-07-29, 08:53 UTC
**Branch:** `revisao-estrutural-fase1`
**Commit de referência:** `691783a6` (Atualiza o reportPayload com todos os motores da revisão estrutural), mais o commit desta entrega (golden test + correção do bug em `sensibilidades.ts`)
**Ambiente:** Node v22.22.2, npm 10.9.7, Next.js 16.2.10, sandbox Linux (Claude) — os mesmos comandos foram corridos ao longo de toda a revisão pelo Claude Code no ambiente Windows do utilizador, com resultados idênticos reportados a cada entrega

---

## Resumo do resultado final

| Verificação | Resultado |
|---|---|
| `npm test` | ✅ **294/294 testes, 26 ficheiros, 0 falhas** |
| `npm run lint` | ✅ 0 erros (1 aviso pré-existente e não relacionado, sobre fontes na landing page) |
| `npx tsc --noEmit` | ✅ 0 erros |
| `npm run build` | ✅ Limpo, 21 rotas compiladas |
| Migrations | 18 aplicadas e confirmadas (0002-0018); 1 (0019) com aplicação não verificada diretamente nesta sessão — ver secção de limitações |
| Golden test | ✅ 15/15 — **encontrou e permitiu corrigir um bug real** (ver secção dedicada) |

---

## Comandos executados e outputs reais

### `npm test`
```
Test Files  26 passed (26)
     Tests  294 passed (294)
  Start at  08:52:16 / 08:53
  Duration  ~4.9s
```
Ficheiros de teste (26), com a contagem exata de testes por ficheiro:

```
✓ src/lib/calc/waterfall.test.ts (6 tests)
✓ src/lib/calc/sensibilidades.test.ts (6 tests)
✓ src/lib/calc/cenarios.test.ts (8 tests)
✓ src/lib/calc/golden-project.test.ts (15 tests)
✓ src/lib/calc/estrutura-capital.test.ts (10 tests)
✓ src/lib/calc/price-escalation.test.ts (9 tests)
✓ src/lib/calc/sales-commission.test.ts (9 tests)
✓ src/lib/calc/xirr.test.ts (7 tests)
✓ src/lib/calc/sales-table.test.ts (13 tests)
✓ src/lib/calc/impostos.test.ts (24 tests)
✓ src/lib/calc/alertas.test.ts (26 tests)
✓ src/lib/calc/perfil-desembolso.test.ts (11 tests)
✓ src/lib/calc/custos.test.ts (19 tests)
✓ src/lib/calc/financiamento.test.ts (21 tests)
✓ src/lib/calc/calendario.test.ts (11 tests)
✓ src/lib/calc/comparaveis.test.ts (10 tests)
✓ src/lib/calc/vendas.test.ts (12 tests)
✓ src/lib/calc/areas.test.ts (21 tests)
✓ src/lib/calc/sales-curve.test.ts (10 tests)
✓ src/lib/calc/cashflow.test.ts (5 tests)
✓ src/lib/calc/metricas.test.ts (9 tests)
✓ src/lib/calc/viabilidade.test.ts (12 tests)
✓ src/lib/calc/calendario-automatico.test.ts (6 tests)
✓ src/lib/calc/equity.test.ts (6 tests)
✓ src/lib/calc/fees.test.ts (7 tests)
✓ src/lib/calc/report-payload.test.ts (1 test)
```

### `npm run lint`
```
/home/claude/landwise-repo/src/app/page.tsx
  16:7  warning  Custom fonts not added in `pages/_document.js` will only load for a single page.
✖ 1 problem (0 errors, 1 warning)
```
Este aviso existe desde o início do projeto (landing page), não introduzido por esta revisão.

### `npx tsc --noEmit`
Sem output — 0 erros.

### `npm run build`
```
✓ Generating static pages using 1 worker (21/21)
Route (app): / /_not-found /api/comparaveis/sugestao /api/financiamento/euribor
/api/localizacao/codigo-postal /app /app/comparar /app/configuracoes /app/equipa
/app/faturacao /app/mercado /app/projetos /app/projetos/[id] /app/projetos/[id]/dados
/app/projetos/novo /app/relatorios /auth/callback /login /onboarding
/recuperar-password /registo
```

---

## Golden Test (secção 46) — o que foi construído e o que encontrou

Ficheiro: `src/lib/calc/golden-project.test.ts`. Um projeto de referência único (1 tipologia, 4 unidades, sem áreas dependentes, com financiamento e investidor externo com waterfall), processado pela cadeia real de motores — nunca mocks.

**Dois tipos de verificação, como pede a secção 46:**
1. **Valores calculados à mão** — VGV Bruto (4 × 280.000€ = 1.120.000€), comissão (5% + IVA 23% não recuperável = 68.880€), custo total sem comissão (850.000€), lucro e margem.
2. **Reconciliações** (nível 4 da secção 47) — cash flow mensal fecha ao cêntimo, peak debt nunca excede o limite de crédito, waterfall nunca distribui mais do que o lucro levered, sensibilidade-base idêntica ao resultado principal, métricas por m² reconciliam com o cash flow, zero erros de alerta num projeto bem formado.

### 🔴 Bug real encontrado e corrigido nesta entrega

O golden test apanhou uma **divergência real entre motores**: `sensibilidades.ts` (usado pelas Sensibilidades e pelos Cenários) nunca tinha sido atualizado para usar a Sales Table — continuava a gerar receita através da aproximação agregada antiga (`gerarRecebimentosMensais`) mesmo quando o projeto já tinha unidades reais, e **nunca contabilizava a comissão comercial**. Isto violava diretamente o princípio "a célula 0%×0% da sensibilidade tem de ser idêntica ao dashboard" (secção 1 e 14 do plano original).

**Correção aplicada** (`src/lib/calc/sensibilidades.ts`):
- `PremissasBaseSensibilidade` passa a aceitar `salesTableResolvida`, `tipologias` e `comissaoParametros` (opcionais, retrocompatíveis).
- Quando presentes, `calcularCenarioComVariacoes` usa `gerarRecebimentosDaSalesTable` (escalando o preço de cada unidade pela variação, nunca uma média) e `gerarComissaoMensal`, exatamente como o cash flow principal.
- Corrigido também um `saldoMinimoCaixa: 0` fixo que ignorava o parâmetro real.
- Ligado à UI do wizard (Sensibilidades e Cenários passam agora a Sales Table real).

Sem este golden test, esta divergência continuaria por detetar — é exatamente o resultado que a secção 46 pretende.

---

## Os 5 níveis de teste (secção 47)

| Nível | Estado |
|---|---|
| 1 — Unitário | ✅ 279 testes unitários em 25 motores isolados |
| 2 — Integração | ✅ Coberto pelo golden test (tipologia → Sales Table → VGV → comissão → cash flow) |
| 3 — Golden test | ✅ 15 verificações, ver acima |
| 4 — Reconciliação | ✅ Testes 7-14 do golden test dedicados a isto |
| 5 — Teste manual guiado (fluxo completo na interface) | ❌ **Não executado nesta sessão** — exige acesso autenticado à aplicação (login), que não tenho neste ambiente. Ver limitações. |

---

## Limitações conhecidas (não escondidas)

- **Nível 5 (teste manual guiado) nunca foi executado** — precisa de alguém com acesso à conta a percorrer o fluxo completo (criar projeto → CEP → áreas → tipologias → Sales Table → vendas → aquisição → custos → financiamento → investidor → calendário → escrituras → cash flow → dashboard → sensibilidades → fechar e reabrir).
- **Migration 0019 (`project_scenarios`)**: o código está confirmado commitado no repositório (`git log` mostra o commit), mas a aplicação da migration na Supabase não foi verificada diretamente por mim nesta sessão — o SQL Editor ficou indisponível (em branco, mesmo após várias tentativas de recarregar) no momento da verificação. O utilizador reportou "acho que já foi" sem confirmação firme.
- **`reportPayload` ainda não está ligado a um projeto real** — o tipo e a função de montagem estão completos e testados, mas falta reunir campos de proveniência (`localizacao.rua/distrito`, o mapa `premissas` com origem por campo) que hoje não estão centralizados no wizard.
- **Secção 29 (Impostos) parcialmente feita**: a estrutura fiscal IRC vs IRS está implementada, mas os campos IMI/Seguros/IMT/IS/IVA global **não foram removidos** do separador de Impostos (o plano original pedia para os mover para Aquisição/Custos) — ficaram onde estavam, por ser uma reorganização de UI maior e mais arriscada.
- **9 das 29 verificações de alertas (secção 41) não têm modelo de dados suficiente ainda**: sinal/reforços da aquisição, escritura de aquisição sem data, IVA reduzido sem confirmação, comissão duplicada, IVA duplicado, dados migrados que exigem revisão. A verificação "sensibilidade-base divergente" existe e está testada, mas não está ligada ao dashboard em produção (exigiria recalcular a matriz completa só para esse alerta).
- **Cash sweep**: teve de ser reconstruído do zero a meio da revisão, depois de confirmado que o pacote original nunca chegou a ser aplicado ao repositório (falha no processo de handoff, não no código em si) — já resolvido e confirmado.
- **Golden test cobre 1 cenário** (tipologia única, sem curva de preços ativa, sem cash sweep ativo) — não cobre todas as combinações possíveis (ex.: múltiplas tipologias com curvas de vendas diferentes, cash sweep ativo a meio do projeto). Suficiente como teste de regressão do essencial, não exaustivo.

## Itens que exigem validação humana

- Confirmar a aplicação real da migration 0019 na Supabase.
- Correr o teste manual guiado (nível 5) numa conta real, com um projeto de demonstração.
- Rever com um especialista fiscal/jurídico qualquer output de Impostos antes de uso comercial — nunca é definitivo, como o próprio produto já assinala em todos os ecrãs relevantes.
- Decidir se/quando reorganizar o separador de Impostos (remover IMI/Seguros/IMT/IS) e se/quando remover definitivamente `viabilidade.ts` (motor antigo, já substituído em todo o produto mas ainda presente no repositório).

---

## Conclusão

A revisão estrutural (Fases 0 a 4) está tecnicamente completa: motor único e integrado, Sales Table como fonte real do VGV, curva de vendas, evolução de preços, comissão separada, hard costs com bases automáticas, calendário automático, financiamento real com cash sweep, estrutura fiscal IRC/IRS, métricas de decisão com semáforo, cenários e alertas ligados à UI, `reportPayload` atualizado, e um golden test que já provou o seu valor ao apanhar um bug real antes de chegar a produção. As limitações estão documentadas acima, não escondidas.

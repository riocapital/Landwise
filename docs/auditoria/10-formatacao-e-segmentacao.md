# 10 — Formatação, UX e segmentação de código (fora do motor financeiro)

Segunda ronda de auditoria (2026-07-31), pedida explicitamente para cobrir "erros de duplicação, erros de formatação, segmentação" em todo o sistema, não só no motor de cálculo (já coberto em `03-motor-financeiro.md` e `05` a `07`). Metodologia: duas auditorias de código independentes (formatação/UX; segmentação/duplicação), mais navegação ao vivo por todos os ecrãs "Em breve" e de configuração.

## Já corrigido nesta ronda (commit `cbf25769`)

1. **MOIC a mostrar "0.00x" em vez de "Não calculável"** — duas ocorrências em `dados/page.tsx` (Resumo do wizard e "Resultado do promotor") usavam `?? 0` em vez de tratar `null` como o campo IRR ao lado já fazia. Corrigido.
2. **Negativos malformados na tabela "Cash flow mensal" do wizard** — `€-5 000` (sinal a seguir ao símbolo, ilegível numa tabela densa) em vez de `-5 000 €`. Novo helper `fmtEUR()` local, mesma convenção do dashboard, com destaque a vermelho para saldos negativos.
3. **"ABC total" e "ABC Total" lado a lado, mesmo nome, valores de fontes diferentes** — removida a duplicação, mantida só a versão calculada a partir do programa de tipologias (fonte única).
4. **Rótulos "IRR"/"IRR do equity" no wizard** — trocados por "TIR do equity (alavancada)"/"TIR (alavancada)", consistentes com o dashboard (fecha o mesmo problema do Achado P1.5, agora também no wizard, não só no dashboard).

## Achados por corrigir — Formatação/UX

| # | Achado | Severidade | Ficheiro |
|---|---|---|---|
| F1 | Símbolo € antes do número no wizard (`€1.234.567`) vs. depois no dashboard (`1.234.567 €`) — ~55 ocorrências inline em `dados/page.tsx`, nunca usam um helper partilhado | P2 | `dados/page.tsx` (todo o ficheiro) |
| F2 | "Eficiência" mostra 0 casas decimais no wizard (`72%`) vs. 1 casa no dashboard (`72.2%`) — mesmo campo, precisão diferente | P2 | `dados/page.tsx:1247` vs `page.tsx` |
| F3 | Percentagens usam sempre ponto decimal (`13.4%`, inglês) enquanto valores monetários com decimais usam vírgula (`1234,56`, português) — convenção de separador decimal inconsistente entre categorias | P2 | toda a app |
| F4 | Sem separador de milhares em m² (`12000 m²` em vez de `12 000 m²`) | P3 | `dados/page.tsx`, `page.tsx` |
| F5 | Sem convenção documentada para "sem valor": traço "—" nalguns sítios, "Não calculável" noutros, sem regra clara de quando usar cada um | P3 | toda a app |
| F6 | Tabela de cash flow do **dashboard** não tem cor para negativos (o painel "Ver fluxos" da mesma página tem); já corrigido no wizard nesta ronda, falta replicar no dashboard | P3 | `page.tsx` |

## Achados por corrigir — Segmentação e duplicação de código

| # | Achado | Severidade | Ficheiro |
|---|---|---|---|
| S1 | `dados/page.tsx` tem **3846 linhas**, 22 definições de topo (8 steps do wizard + modal + gráfico + tabela de sensibilidades + primitivas visuais genéricas), tudo num único ficheiro | P2 | `dados/page.tsx` |
| S2 | Componente `Field` definido duas vezes com APIs incompatíveis — `src/components/ui.tsx` (renderiza o `<input>`) vs. `dados/page.tsx:~3820` (espera `children`) — um contribuidor pode usar a assinatura errada por engano | P2 | `ui.tsx` + `dados/page.tsx` |
| S3 | Erros de escrita no Supabase silenciosamente ignorados em quase todos os `guardar*`/`atualizar*`/`apagar*` de `src/lib/supabase/*.ts` — só `consulting-leads.ts` verifica e devolve o erro | P2 | `src/lib/supabase/project-*.ts` |
| S4 | As 3 rotas em `src/app/api/` devolvem formas de erro diferentes (`{erro}`, `{sucesso,erro}`, sem chave de erro nenhuma) — sem helper partilhado | P2 | `src/app/api/*/route.ts` |
| S5 | `src/components/pre-analise-form.tsx` (125 linhas) parece código morto — zero importações em todo o `src/` | P2 | `pre-analise-form.tsx` |
| S6 | Sem convenção partilhada de loading/erro entre rotas — cada página resolve "A carregar…" à sua maneira, cores e wrappers diferentes | P2 | `src/app/app/*/page.tsx` |

## Confirmado ao vivo — placeholders "Em breve" são intencionais, não bugs

Navegado: Mercado, Comparar ativos, Relatórios, Equipa, Plano e faturação — todos mostram "Em breve" com uma frase explicativa, exatamente como documentado no `README.md` ("O que ficou fora desta fase, deliberadamente"). Não há nada a corrigir aqui — são placeholders deliberados, não erros.

**Configurações**: mostra Email e Nome preenchidos, mas Empresa e Papel sempre "—" (nunca implementado). Não investigado a fundo — provavelmente também deliberado (fora do âmbito desta fase), mas não confirmado explicitamente como tal em nenhuma documentação; vale a pena confirmar com o utilizador se é suposto já funcionar.

**Calendário**: gerado automaticamente a partir das outras etapas, sem edição própria — funciona bem. Mas confirma um achado já registado: o evento "Escrituras" mostra uma única data agregada (a última escritura do projeto), não uma data por unidade — as datas de escritura por unidade adicionadas nesta sessão continuam a ser só informativas, nunca alimentam o calendário nem o cash flow real (achado C do relatório de agentes anterior, secção 3 de `03-motor-financeiro.md`).

## Recomendação

Dado o volume, sugerimos duas frentes separadas do resto do plano de correção (`08-plano-priorizado.md`):
- **P2 rápidos e seguros** (F1 parcial, F2, S3 parcial): já com precedente estabelecido nesta sessão — corrigir os casos de maior visibilidade primeiro (já feito: MOIC, cash flow do wizard, ABC total).
- **P2 estruturais** (S1 — dividir `dados/page.tsx`; S2 — consolidar `Field`/`Card`/`Row` num só sítio): exigem mais tempo e mais risco de regressão (é o ficheiro mais editado desta sessão inteira) — recomenda-se fazer numa ronda dedicada, com testes de UI mais extensos antes de mexer na estrutura do ficheiro.

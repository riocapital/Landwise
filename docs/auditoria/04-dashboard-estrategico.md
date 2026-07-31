# 04 — Auditoria estratégica do dashboard

Avaliação do dashboard atual (`src/app/app/projetos/[id]/page.tsx`) como ferramenta para um comité de investimento imobiliário, e proposta de nova estrutura (secção 24 do pedido de auditoria).

## Crítica ao estado atual

**Informação potencialmente incorreta** — o problema mais grave, tratado em detalhe em `03-motor-financeiro.md`: "Lucro do equity", "IRR" e "MOIC" podem estar sobrestimados sem qualquer aviso visual. Um comité de investimento a ler este dashboard hoje não tem forma de saber que esses números podem incluir dívida bancária por liquidar.

**Hierarquia desestruturada** — o dashboard atual é uma sequência linear de secções (Resultado do projeto → Retorno do equity → Áreas e programa → Financiamento → [investidor externo, condicional]), sem separar claramente "isto é a recomendação" de "isto é o detalhe de apoio". Não há uma camada executiva de topo — o primeiro número que aparece é um KPI de VGV, não uma recomendação.

**Pouca explicação de risco** — os alertas existentes (`alertas.ts`, ~24 verificações) são bons e já cobrem muito do pedido nesta auditoria (reconciliação de cash flow, sinal+reforços acima de 100%, LTV alto, funding gap, IRR não calculável, margem negativa/apertada), mas aparecem como uma lista plana no topo da página, sem ligação visual às secções que explicam cada risco.

**Pouca capacidade de comparação** — Cenários e Sensibilidades existem como ecrãs separados no wizard, não integrados no dashboard principal. Um comité não vê "e se o preço cair 10%?" ao lado do caso base sem sair do dashboard.

**Baixa rastreabilidade** — os KPIs não têm "ver cálculo"/"ver fonte" — o "Ver fluxos usados no cálculo de IRR e MOIC" (adicionado nesta sessão) é a única exceção. Não existe equivalente para VGV, custo total, ou o próprio saldo devedor.

## Nova estrutura proposta

Mantendo a ideia de "visão executiva + detalhe expansível" (nunca uma página monolítica):

### A. Decisão executiva (topo, sempre visível)
- Recomendação (texto curto: avançar / rever / não avançar)
- Nível de confiança (baseado em quantos alertas P0/erro existem)
- 2-3 condições principais para a recomendação se manter válida
- Alertas críticos (só os de tipo "erro", em destaque — nunca escondidos num acordeão)
- Premissas não validadas (ex.: "carência de financiamento desativada — dívida pode nunca ser amortizada no horizonte modelado", assim que o Achado #1 for corrigido isto vira um alerta automático)

### B. Resultado do projeto
VGV bruto, VGV líquido, Receita operacional, Custo total, Lucro, Margem sobre receita, Lucro sobre custo (nova métrica, pedida na secção 11 — hoje só existe margem sobre receita), Break-even de preço/custo (não existe hoje — precisa de novo cálculo).

### C. Retorno do equity
Já existe quase todo: Equity total, Peak equity, Distribuições, Lucro do equity, IRR, MOIC, Data de recuperação, painel de fluxos. Falta: Payback simples (meses até recuperação total, distinto de IRR/MOIC).

### D. Financiamento
Peak debt, LTC, LTV, taxa total, juros totais, fees, carência, prazo, reserva mínima já existem em algum lugar do motor — hoje dispersos entre dashboard e wizard. Falta: DSCR (não implementado em lado nenhum do código auditado), dívida final (existe no cash flow mensal, não como KPI agregado).

### E. Execução
Nenhum destes campos existe hoje como KPI do dashboard, apesar de as datas existirem no motor (`planoVendas`, `custos`): data de aquisição, início/fim da construção, lançamento, primeira/última venda, primeira/última escritura, duração total. Recomendação: nova secção "Execução" agregando datas já existentes nos dados, sem exigir novo input.

### F. Mercado e vendas
Preço médio, VGV por tipologia, velocidade de vendas, unidades vendidas/disponíveis, desconto médio existem nos dados (Sales Table) mas não são agregados num KPI de dashboard hoje.

### G. Custos
Já existe como "Estrutura sobre VGV"/"Métricas por m²" — cobre a maior parte do pedido.

### H. Riscos
Cobrir com o motor de alertas já existente (`alertas.ts`), reorganizado por categoria em vez de lista plana, e ligado à secção A.

### I. Gráficos
- Cash flow mensal: **já implementado** nesta sessão (gráfico SVG no wizard) — falta trazer para o dashboard principal.
- Dívida e equity ao longo do tempo: não existe — pode reaproveitar `saldoDivida`/`equityOutstanding` já calculados por mês.
- Curva de vendas, CAPEX (com zeros já ocultados), sensibilidades: parcialmente existentes.
- Waterfall de retorno, bridge de lucro: não existem — exigem novo componente, mas os dados subjacentes (fluxos de equity, decomposição lucro projeto→equity) já existem no motor depois da correção do Achado #1.

## Recomendação

Não recriar o dashboard do zero — a maior parte dos dados já existe no motor de cálculo, só não está agregada/organizada como o pedido descreve. Prioridade: primeiro corrigir os Achados P0 (`03-motor-financeiro.md`), depois reestruturar a apresentação — mostrar a estrutura nova com números errados por baixo seria pior do que a situação atual.

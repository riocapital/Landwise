# Landwise — Implementação das correções de 29/07/2026

## Base da revisão

Esta revisão foi executada sobre o código fornecido em `Landwise.rar` e sobre o documento funcional `Correções Landwise 29 07`, incluindo as referências visuais incorporadas.

A implementação preserva a arquitetura existente e corrige os pontos solicitados sem criar um segundo motor.

## Checklist funcional

| Área | Estado | Implementação |
|---|---|---|
| Preço na Identificação | Corrigido | O preço de aquisição foi removido da interface de Identificação e permanece apenas em Aquisição e custos. |
| Tipos de projeto | Corrigido | Foi criada uma enum única e um normalizador de valores legados. |
| Características | Corrigido | Mantidos garagem, elevador, jardim/exteriores e imóvel ocupado; removidos demolição e licenciamento aprovado; adicionadas quantidades de estacionamentos e elevadores. |
| Código postal | Corrigido no código | Lookup server-side pela GEO API PT, com timeout, cache, normalização, múltiplas opções e fallback manual. A integração externa precisa de ser confirmada no ambiente de deploy. |
| Data de lançamento | Corrigido | Adicionada como fonte única no Programa e vendas. |
| Datas da Sales Table | Corrigido | Datas projetadas por tipologia, a partir do lançamento, meses para primeira venda e velocidade; preenchimento visual de cima para baixo; overrides manuais preservados. |
| CPCV | Corrigido | Percentagem separada na estrutura de recebimentos; valor entra no mês da venda. |
| Comissão comercial | Corrigido | Percentagem sobre o preço total da unidade, IVA, repartição sinal/escritura e saída separada no cash flow. |
| Aquisição | Corrigido | Bloco dedicado com preço, sinal, data, duração, escritura, reforços e residual; custos fixos visíveis em formato compacto. |
| Custos de aquisição | Corrigido | DD técnica/legal, notário, registos, IMT, imposto do selo, comissão e outros sempre visíveis. Notário começa em €1.000. |
| Hard costs | Corrigido | Construção acima, abaixo e dependente sempre criadas e abertas, com bases automáticas. |
| Soft costs | Corrigido | Linhas padrão criadas automaticamente, incluindo arquitetura, engenharia e fiscalização. |
| Fiscalização mensal | Corrigido | Novo tipo `valor_mensal`; datas e duração seguem os hard costs principais e pagamentos entram mensalmente. |
| Comercialização | Corrigido | Renomeado para “Marketing e comercialização”, separado da comissão comercial. |
| Defaults de financiamento | Corrigido | Spread 1,85%, structuring 2%, setup 0,30%, IS empréstimo 0,50%, IS juros 1%, todos editáveis e rastreáveis. |
| Reserva mínima | Corrigido | Calculada pela maior janela móvel de custos operacionais futuros; 6 meses por omissão; aquisição excluída. |
| Impostos | Corrigido | Estrutura empresa/SPV vs pessoa singular; IRC por regime; derrama municipal configurável; derrama estadual progressiva; mensagens de estimativa e validação profissional. |
| Calendário | Corrigido | Proteção contra datas inválidas e geração derivada de aquisição, custos, vendas e financiamento. |
| Cash flow | Corrigido | Lançamento e curva passam a gerar recebimentos; reserva e CPCV separados; comissão separada; IVA não recuperável deixou de ser contado duas vezes. |
| Duplicação de inputs | Corrigido | O formulário duplicado de Plano de vendas foi removido da etapa de resultados. As premissas comerciais ficam no Programa e vendas. |

## Alterações estruturais relevantes

### Fonte única de tipos de projeto

Novo ficheiro:

- `src/lib/project-types.ts`

A mesma lista é utilizada no wizard, onboarding e pré-análise. Valores antigos são normalizados ao abrir o projeto.

### Linhas padrão

Novo ficheiro:

- `src/lib/supabase/project-defaults.ts`

Ele garante:

- T1, T2, T3 e T4 em projetos sem tipologias;
- custos de aquisição essenciais;
- três hard costs estruturais;
- soft costs padrão;
- aliases para nomes legados;
- correção de bases automáticas.

### Migração

Nova migration:

- `supabase/migrations/0020_correcoes_29_07.sql`

Ela adiciona:

- contagem de estacionamentos e elevadores;
- `valor_mensal` no check constraint de custos;
- setup bancário percentual;
- número de meses da reserva mínima;
- regime de IRC;
- defaults bancários para registos antigos que permaneceram a zero.

### Código postal

Ficheiros:

- `src/lib/localizacao/codigo-postal.ts`
- `src/app/api/localizacao/codigo-postal/route.ts`

A consulta é executada server-side. O frontend não recebe chaves ou credenciais.

### Reconciliação de aquisição ao abrir

Projetos antigos podem possuir o preço no JSON de `inputs` e linhas vazias no novo motor. Ao abrir, o código agora preenche apenas linhas vazias de sinal/escritura e datas ausentes, sem substituir valores já personalizados.

### Cash flow e IVA

Foi corrigida uma dupla contagem real: o IVA não recuperável era incluído no custo distribuído e novamente numa linha separada. Agora o valor-base e o IVA não recuperável entram exatamente uma vez.

## Pontos que continuam dependentes do ambiente real

1. Aplicação da migration no Supabase correto.
2. Verificação do endpoint postal a partir da infraestrutura da Vercel.
3. Teste de autenticação, RLS e autosave com utilizador real.
4. Teste completo do calendário e cash flow com projeto demonstrativo persistido.
5. Build de produção numa instalação limpa de dependências Linux.
6. Revisão fiscal anual sempre que taxas ou regras forem alteradas.

## Não incluído nesta revisão

- Deploy em produção.
- Execução da migration no banco real.
- Criação de credenciais ou alteração de variáveis de ambiente.
- Garantia de enquadramento fiscal individual.
- Reestruturação completa do módulo de entrega/escrituras por unidade, além da data global já existente.

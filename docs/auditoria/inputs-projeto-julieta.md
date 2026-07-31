# Inputs do Projeto Julieta — catálogo completo

Tabela completa em [`inputs-projeto-julieta.csv`](inputs-projeto-julieta.csv) (60 campos, colunas: Módulo, Campo, Valor, Unidade, Origem, Editável/Calculado, Persistido, Tabela BD, Override, Observação).

## Estado

Este catálogo foi construído a partir da **estrutura real do código** (tipos TypeScript do motor de cálculo + tabelas Supabase efetivamente lidas/escritas por `src/lib/supabase/*.ts`) — cada campo listado existe de facto na aplicação, com o módulo, unidade, se é editável ou calculado, e onde persiste. **A coluna "Valor" está marcada como "pendente login"** para todos os campos, porque a confirmação ao vivo no Projeto Julieta depende de autenticação na conta de teste, que esta auditoria não pode fazer por si própria (ver `01-resumo-executivo.md`).

## Campos a verificar com prioridade, uma vez autenticado

Estes são os que decidem diretamente as conclusões da auditoria (Achado #1 em `03-motor-financeiro.md`):

1. **Financiamento → Carência**: ativa ou desativada no Julieta?
2. **Financiamento → Cash sweep**: ativo ou desativado?
3. **Financiamento → Saldo devedor (final)**: última linha da tabela de cash flow mensal, coluna "Saldo devedor" — é €0 ou não?
4. **Financiamento → Drawdowns (total) vs. Amortizações (total)**: somar as duas colunas do cash flow mensal — a diferença entre elas deve aproximar-se do componente principal do gap de €6.052.839.

## Campos recém-adicionados nesta sessão (verificar se já têm dados no Julieta)

- Identificação → Nome do projeto (campo corrigido, antes não aparecia no step Identificar)
- Identificação → Número de estacionamentos/elevadores (agora sempre visíveis, sem checkbox)
- Vendas → Data da escritura, Sinal, Reforços por unidade (UI nova — provavelmente vazios em projetos criados antes de hoje, incluindo possivelmente o Julieta)
- Financiamento → Prazo, Carência (UI nova — projetos antigos ficam com `carenciaAtiva=false` por omissão)

## Nota metodológica

Não foram inventados valores. Cada linha do CSV corresponde a um campo real, verificado por leitura de código (tipo TypeScript + mapeamento de coluna Supabase em `src/lib/supabase/project-*.ts`). Onde a "Origem" diz "calculado", o valor nunca é editável diretamente pelo utilizador — só através dos inputs de que depende.

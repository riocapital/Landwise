# Instruções de integração — correções Landwise 29/07

## Objetivo

Integrar o pacote corrigido no repositório real sem reinterpretar o escopo e sem reconstruir as alterações manualmente.

## Ordem obrigatória

1. Criar branch e snapshot do estado atual.
2. Comparar o pacote recebido com o repositório real.
3. Aplicar os ficheiros corrigidos, resolvendo apenas conflitos reais.
4. Rever a migration `0020_correcoes_29_07.sql` contra o schema remoto.
5. Aplicar a migration primeiro em desenvolvimento/staging.
6. Instalar dependências de forma limpa no sistema de destino.
7. Executar typecheck, lint, testes, QA específico e build.
8. Executar o teste manual completo.
9. Documentar qualquer divergência.
10. Não fazer deploy em produção sem autorização explícita.

## Instalação limpa

Não reutilizar o `node_modules` do arquivo original, porque foi produzido em Windows.

```bash
rm -rf node_modules .next
npm ci
```

## Comandos de validação

```bash
npx tsc --noEmit
npm run lint
npm test
npm run qa:correcoes-29-07
npm run build
```

## Migration

Aplicar:

```text
supabase/migrations/0020_correcoes_29_07.sql
```

Antes de aplicar:

- confirmar nomes das constraints;
- confirmar colunas de `project_financing`;
- confirmar que não existem valores de `tipo_calculo` fora da lista permitida;
- fazer backup das tabelas afetadas.

Depois de aplicar:

- confirmar novos campos;
- confirmar defaults;
- abrir um projeto antigo;
- verificar que nenhum dado foi apagado.

## Variáveis de ambiente

Usar `.env.example` como referência.

O lookup postal usa por omissão:

```text
https://json.geoapi.pt/cp
```

A variável `LANDWISE_GEOAPI_BASE_URL` é opcional e deve permanecer server-side.

## Teste manual mínimo

1. Criar projeto novo.
2. Confirmar lista de tipos.
3. Confirmar ausência do preço na Identificação.
4. Introduzir código postal.
5. Confirmar características.
6. Criar programa e Sales Table.
7. Definir lançamento em 01/01/2026.
8. Definir primeira venda dois meses depois.
9. Confirmar primeira data em 01/03/2026.
10. Configurar CPCV e comissão.
11. Preencher aquisição, sinal e reforço.
12. Confirmar notário em €1.000 e custos fixos visíveis.
13. Preencher hard costs e datas.
14. Confirmar fiscalização mensal ligada à obra.
15. Confirmar calendário.
16. Confirmar cash flow.
17. Confirmar defaults de financiamento.
18. Confirmar reserva mínima.
19. Confirmar impostos como estimativa.
20. Fechar e reabrir o projeto.
21. Confirmar persistência.

## Critério de aceitação

A integração só está concluída quando:

- TypeScript, lint, testes e build passarem;
- migration estiver validada;
- calendário for gerado;
- cash flow reconciliar;
- CPCV e comissão aparecerem separadamente;
- projetos antigos abrirem;
- o relatório de QA real for atualizado com outputs verdadeiros.

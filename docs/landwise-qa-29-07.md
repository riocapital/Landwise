# Landwise — Relatório de QA das correções de 29/07/2026

## Ambiente analisado

- Código de origem: arquivo `Landwise.rar` fornecido pelo utilizador.
- Sistema de execução da revisão: Linux x64.
- Dependências incluídas no arquivo: instaladas originalmente para Windows.
- Data da revisão: 29/07/2026.

## Validações executadas

### TypeScript

Comando:

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Resultado:

- **Aprovado**
- 0 erros de TypeScript.

### ESLint

Comando:

```bash
node node_modules/eslint/bin/eslint.js .
```

Resultado:

- **Aprovado com 1 aviso preexistente**
- 0 erros.
- 1 warning em `src/app/page.tsx` sobre carregamento de fonte customizada.

### QA financeiro independente

Foi criado:

- `scripts/qa-correcoes-29-07.ts`

Como o `tsx` incluído no arquivo é para Windows, o script foi compilado com o TypeScript puro e executado em Node.

Comandos:

```bash
node node_modules/typescript/bin/tsc scripts/qa-correcoes-29-07.ts \
  --outDir /tmp/landwise-qa-build \
  --module commonjs \
  --target es2022 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --lib es2022,dom

node /tmp/landwise-qa-build/scripts/qa-correcoes-29-07.js
```

Resultado:

- **11 verificações aprovadas**

Verificações:

1. custo mensal × duração;
2. IRC PME: 15% nos primeiros €50 mil e 19% no excedente;
3. ausência de derrama estadual abaixo do primeiro limiar;
4. data de lançamento inválida não quebra a curva;
5. primeira venda dois meses após o lançamento;
6. datas atribuídas de cima para baixo;
7. reserva e CPCV separados;
8. comissão sobre o preço total;
9. comissão repartida entre sinal e escritura;
10. IVA não recuperável contado uma única vez;
11. reserva mínima por maior janela móvel, excluindo aquisição.

## Testes Vitest

Tentativa:

```bash
node node_modules/vitest/vitest.mjs run
```

Resultado:

- **Bloqueado pelo ambiente**, não por falha dos testes.
- O arquivo contém o binding Windows do Rolldown e não contém `@rolldown/binding-linux-x64-gnu`.

Ação necessária no ambiente de integração:

```bash
rm -rf node_modules .next
npm ci
npm test
```

## Build Next.js

Tentativa:

```bash
node node_modules/next/dist/bin/next build
```

Resultado:

- **Bloqueado pelo ambiente**.
- O pacote SWC Linux não estava no arquivo.
- A tentativa automática de download foi impedida pelo registry interno usado no ambiente de revisão.

Ação necessária no ambiente de integração:

```bash
rm -rf node_modules .next
npm ci
npm run build
```

## QA ainda obrigatório antes de produção

1. Aplicar a migration em ambiente de desenvolvimento.
2. Criar/reabrir projeto real de teste.
3. Confirmar lookup postal.
4. Confirmar autosave e persistência de todos os campos.
5. Confirmar data de lançamento → Sales Table → recebimentos.
6. Confirmar aquisição → calendário → cash flow.
7. Confirmar fiscalização mensal.
8. Confirmar defaults de financiamento.
9. Confirmar reserva mínima e cash sweep.
10. Confirmar impostos como estimativas.
11. Executar `npm test`, `npm run lint`, `npx tsc --noEmit` e `npm run build` numa instalação limpa.
12. Não fazer deploy em produção antes de todos os gates passarem.

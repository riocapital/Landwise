# Prompt para o Claude Code — integrar correções Landwise 29/07

Você vai integrar um pacote de código já corrigido no repositório real do Landwise.

Não reimplemente o escopo a partir do zero e não transforme esta tarefa numa nova interpretação do produto. Use os ficheiros recebidos como implementação de referência e resolva apenas conflitos reais com o estado atual do repositório.

## Materiais obrigatórios

Leia primeiro:

1. `docs/landwise-correcoes-29-07-implementation.md`
2. `docs/landwise-qa-29-07.md`
3. `docs/landwise-integration-instructions.md`
4. `docs/referencia/Correcoes_Landwise_29_07.docx`
5. `supabase/migrations/0020_correcoes_29_07.sql`

O DOCX contém texto e imagens. As imagens são referências obrigatórias de interface, principalmente para aquisição, hard costs, soft costs, financiamento e Sales Table.

## Regras

- Crie uma branch específica e registe o commit inicial.
- Faça backup/snapshot antes de aplicar migrations.
- Não apague projetos ou dados existentes.
- Não crie um segundo motor.
- Não devolva componentes antigos que foram removidos.
- Preserve alterações manuais e overrides.
- Não faça deploy em produção sem autorização explícita.
- Não afirme que testes passaram sem apresentar os outputs reais.

## Integração

1. Compare o pacote com o repositório atual.
2. Integre os ficheiros corrigidos.
3. Resolva conflitos preservando a implementação mais recente que já esteja funcional.
4. Reveja a migration `0020_correcoes_29_07.sql` contra o schema real.
5. Aplique a migration primeiro em desenvolvimento/staging.
6. Não reutilize o `node_modules` do arquivo recebido: ele foi produzido em Windows.

Execute:

```bash
rm -rf node_modules .next
npm ci
npx tsc --noEmit
npm run lint
npm test
npm run qa:correcoes-29-07
npm run build
```

## Verificações funcionais obrigatórias

- preço não aparece na Identificação;
- lista de tipos está atualizada;
- características antigas foram removidas;
- código postal preenche localização ou permite fallback manual;
- lançamento alimenta as datas da Sales Table;
- 01/01/2026 + 2 meses resulta em 01/03/2026;
- datas são distribuídas de cima para baixo conforme a velocidade;
- CPCV aparece separado no cash flow;
- comissão incide sobre o preço total e é paga no sinal/escritura;
- aquisição tem sinal, duração, escritura, reforços e residual;
- DD, notário, registos, IMT, imposto do selo, comissão e outros custos aparecem sem serem adicionados manualmente;
- notário começa em €1.000 e permanece editável;
- construção acima, abaixo e dependente aparecem abertas;
- arquitetura, engenharia e fiscalização aparecem abertas;
- fiscalização é mensal e acompanha as datas da construção;
- financiamento abre com os defaults definidos, todos editáveis;
- reserva mínima usa a janela de custos futuros e protege o cash sweep;
- impostos aparecem como estimativa, distinguindo empresa/SPV de pessoa singular;
- calendário é gerado;
- cash flow reconcilia;
- o projeto pode ser fechado e reaberto sem perda de dados.

## Evidência final

Entregue:

- ficheiros integrados e conflitos resolvidos;
- migration aplicada e contagens antes/depois;
- outputs reais de typecheck, lint, testes, QA e build;
- screenshots das principais telas;
- resultado do teste manual;
- limitações ou itens bloqueados;
- confirmação de que nenhum deploy de produção foi realizado sem autorização.

Se algum teste falhar, corrija antes de concluir. Se houver um bloqueio externo, descreva-o com evidência e não o apresente como concluído.

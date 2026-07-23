// Motor de calendário — Landwise, Fase 7 (parte 1)
//
// Secção 11 do plano: toda a atividade funciona por início + duração = fim.
// Esta é a fonte única desta lógica — custos.ts e financiamento reexportam
// daqui, nunca reimplementam (secção 19: um único motor por indicador).

export type PerfilDesembolsoAtividade =
  | "unico_inicio"
  | "unico_fim"
  | "linear"
  | "curva_s"
  | "front_loaded"
  | "back_loaded"
  | "personalizado";

export type Atividade = {
  id: string;
  nome: string;
  dataInicial: string | null; // "YYYY-MM-DD"
  duracaoMeses: number | null;
  dataFinal: string | null; // calculada, ou substituída manualmente
  perfilDesembolso: PerfilDesembolsoAtividade;
  dependenciaId: string | null; // início = fim da atividade referenciada + 1 dia
  observacoes: string | null;
  ordem: number;
};

/**
 * Data final = último dia do N.º mês contado a partir do mês da data inicial.
 * Duração de 1 mês termina no último dia do MESMO mês da data inicial
 * (exemplo do plano: início set/2026 + 24 meses = fim ago/2028).
 */
export function calcDataFinal(dataInicial: string, duracaoMeses: number): string {
  const [ano, mes] = dataInicial.split("-").map(Number);
  const dataFinal = new Date(Date.UTC(ano, mes - 1 + duracaoMeses, 0));
  return dataFinal.toISOString().slice(0, 10);
}

/** Recalcula a duração (meses inteiros) a partir de duas datas — usado quando a data final é editada manualmente. */
export function calcDuracaoMeses(dataInicial: string, dataFinal: string): number {
  const [anoI, mesI] = dataInicial.split("-").map(Number);
  const [anoF, mesF] = dataFinal.split("-").map(Number);
  return (anoF - anoI) * 12 + (mesF - mesI) + 1;
}

/** Um dia depois de uma data (para encadear "início = fim da anterior + 1 dia"). */
export function diaSeguinte(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Quando o utilizador edita a data final manualmente: recalcula a duração,
 * mantendo a data inicial.
 */
export function aoEditarDataFinal(dataInicial: string, novaDataFinal: string): { duracaoMeses: number; dataFinal: string } {
  return { duracaoMeses: calcDuracaoMeses(dataInicial, novaDataFinal), dataFinal: novaDataFinal };
}

/**
 * Quando o utilizador edita a duração manualmente: recalcula a data final,
 * mantendo a data inicial.
 */
export function aoEditarDuracao(dataInicial: string, novaDuracaoMeses: number): { dataFinal: string; duracaoMeses: number } {
  return { dataFinal: calcDataFinal(dataInicial, novaDuracaoMeses), duracaoMeses: novaDuracaoMeses };
}

/**
 * Quando o utilizador edita a data inicial: mantém a duração e recalcula a
 * data final.
 */
export function aoEditarDataInicial(novaDataInicial: string, duracaoMeses: number): { dataInicial: string; dataFinal: string } {
  return { dataInicial: novaDataInicial, dataFinal: calcDataFinal(novaDataInicial, duracaoMeses) };
}

export type AlertaCalendario = { tipo: "erro" | "alerta"; mensagem: string; atividadeId?: string };

/**
 * Resolve as datas iniciais das atividades que dependem de outra (início =
 * fim da atividade referenciada + 1 dia), em ordem topológica.
 *
 * Deteta dependências circulares em vez de entrar em ciclo infinito — nesse
 * caso devolve um alerta e deixa as atividades do ciclo com a data que já
 * tinham (nunca inventa uma data).
 */
export function resolverAtividadesEncadeadas(atividades: Atividade[]): {
  atividades: Atividade[];
  alertas: AlertaCalendario[];
} {
  const porId = new Map(atividades.map((a) => [a.id, { ...a }]));
  const resolvidas = new Set<string>();
  const alertas: AlertaCalendario[] = [];

  function resolver(id: string, pilha: Set<string>): void {
    if (resolvidas.has(id)) return;
    const atividade = porId.get(id);
    if (!atividade) return;

    if (pilha.has(id)) {
      alertas.push({
        tipo: "erro",
        mensagem: `Dependência circular detetada envolvendo a atividade "${atividade.nome}".`,
        atividadeId: id,
      });
      resolvidas.add(id); // evita reprocessar, mas não inventa data
      return;
    }

    if (atividade.dependenciaId) {
      pilha.add(id);
      resolver(atividade.dependenciaId, pilha);
      pilha.delete(id);

      const dependencia = porId.get(atividade.dependenciaId);
      if (dependencia?.dataFinal) {
        atividade.dataInicial = diaSeguinte(dependencia.dataFinal);
        if (atividade.duracaoMeses != null) {
          atividade.dataFinal = calcDataFinal(atividade.dataInicial, atividade.duracaoMeses);
        }
      } else {
        alertas.push({
          tipo: "alerta",
          mensagem: `A atividade "${atividade.nome}" depende de outra sem data final calculada.`,
          atividadeId: id,
        });
      }
    } else if (atividade.dataInicial && atividade.duracaoMeses != null && !atividade.dataFinal) {
      atividade.dataFinal = calcDataFinal(atividade.dataInicial, atividade.duracaoMeses);
    }

    resolvidas.add(id);
  }

  for (const atividade of atividades) {
    resolver(atividade.id, new Set());
  }

  return { atividades: [...porId.values()], alertas };
}

export type LinhaGantt = { id: string; nome: string; inicio: string; fim: string; ordem: number };

/** Estrutura simples e pronta a consumir por um componente de Gantt. */
export function gerarDadosGantt(atividades: Atividade[]): LinhaGantt[] {
  return atividades
    .filter((a) => a.dataInicial && a.dataFinal)
    .map((a) => ({ id: a.id, nome: a.nome, inicio: a.dataInicial!, fim: a.dataFinal!, ordem: a.ordem }))
    .sort((a, b) => a.ordem - b.ordem);
}

export const ATIVIDADES_INICIAIS_SUGERIDAS = [
  "Sinal da aquisição",
  "Escritura",
  "Due diligence técnica",
  "Due diligence legal",
  "Custos de aquisição",
  "Arquitetura",
  "Engenharia",
  "Especialidades",
  "Licenciamento",
  "Obra acima do solo",
  "Obra abaixo do solo",
  "Demolição",
  "Jardinagem",
  "Infraestruturas",
  "Contingência",
  "FF&E",
  "Fiscalização",
  "Project management",
  "Development fee",
  "Outros custos",
  "Branding",
  "Marketing",
  "Lançamento comercial",
  "Reservas",
  "CPCVs",
  "Recebimentos durante a construção",
  "Escrituras",
  "Início do financiamento",
  "Drawdowns",
  "Amortização",
  "Conclusão",
  "Entrega",
] as const;

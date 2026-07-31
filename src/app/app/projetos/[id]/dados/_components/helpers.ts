// Funções puras (sem estado, sem I/O) partilhadas pelos vários "Step*" do
// wizard — extraídas de page.tsx (achado S1 da auditoria de 2026-07-31).

import { resolverSalesTable, type UnidadeVenda } from "@/lib/calc/sales-table";
import type { Typology } from "@/lib/calc/areas";
import type { LinhaCusto } from "@/lib/calc/custos";

export function salesTableDaTipologia(unidades: UnidadeVenda[], tipologias: Typology[], tipologiaId: string) {
  return resolverSalesTable(
    unidades.filter((u) => u.tipologiaId === tipologiaId),
    tipologias
  );
}

// Convenção monetária única do wizard (€ depois do número, sinal antes dos
// dígitos — "-5 000 €", nunca "€-5 000"). Usar aqui em vez de reimplementar
// `€${Math.round(v).toLocaleString("pt-PT")}` em cada célula — essa forma
// coloca o sinal negativo a seguir ao símbolo do euro, ilegível em tabelas
// densas como o "Cash flow mensal" (achado da auditoria de formatação).
export function fmtEUR(v: number): string {
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(v) + " €";
}

export function adicionarMesesData(data: string, meses: number): string {
  if (!data) return "";
  const [ano, mes, dia] = data.split("-").map(Number);
  if (!ano || !mes || !dia) return "";
  const d = new Date(Date.UTC(ano, mes - 1 + Math.max(0, Math.floor(meses)), dia));
  return d.toISOString().slice(0, 10);
}

export function diferencaMesesDatas(inicio: string, fim: string): number {
  if (!inicio || !fim) return 0;
  const a = new Date(`${inicio}T00:00:00Z`);
  const b = new Date(`${fim}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  return Math.max(0, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth());
}

export function obterDatasConstrucaoDosCustos(custos: LinhaCusto[]): { inicio: string; fim: string } {
  const principais = custos.filter(
    (c) =>
      c.grupo === "hard_cost" &&
      ["Construção acima do solo", "Construção abaixo do solo", "Construção dependente"].includes(c.nome)
  );
  const inicios = principais.map((c) => c.dataInicial).filter((d): d is string => Boolean(d)).sort();
  const finais = principais.map((c) => c.dataFinal).filter((d): d is string => Boolean(d)).sort();
  return { inicio: inicios[0] ?? "", fim: finais[finais.length - 1] ?? "" };
}

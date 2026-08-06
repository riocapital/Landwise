// Renderização pura de uma matriz de sensibilidade já calculada (Gate 7,
// secção 19 do prompt 03_08) — nunca recalcula nada aqui, só apresenta o
// MatrizResultado que project-loader.ts já produziu com a função central
// completa. Componente de servidor (sem "use client") — a matriz é
// estática, não interativa, na página de resultados.

import type { MatrizResultado, IndicadorSensibilidade } from "@/lib/calc/sensibilidades";

const LABEL_EIXO: Record<string, string> = {
  aquisicao: "Aquisição",
  custo_construcao: "Custo de construção",
  preco_venda: "Preço de venda",
};

const EIXOS_POR_MATRIZ: Record<string, [string, string]> = {
  aquisicao_vs_custo_construcao: ["aquisicao", "custo_construcao"],
  custo_construcao_vs_preco_venda: ["custo_construcao", "preco_venda"],
  aquisicao_vs_preco_venda: ["aquisicao", "preco_venda"],
};

function formatarValor(v: number | null, indicador: IndicadorSensibilidade): string {
  if (v === null) return "—";
  if (indicador.startsWith("irr") || indicador === "margem" || indicador === "roi" || indicador === "roi_nao_alavancado") {
    return `${(v * 100).toFixed(1)}%`;
  }
  if (indicador === "moic") return `${v.toFixed(2)}x`;
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(v) + " €";
}

export function MatrizSensibilidadeView({ titulo, resultado }: { titulo: string; resultado: MatrizResultado }) {
  const [eixoLinha, eixoColuna] = EIXOS_POR_MATRIZ[resultado.matriz] ?? ["aquisicao", "custo_construcao"];

  return (
    <div className="bg-white border border-[#E3DACB] rounded-xl p-6 mb-5 overflow-x-auto">
      <p className="text-sm font-bold text-[#142B3A] mb-1">{titulo}</p>
      <p className="text-xs text-[#59636A] mb-3">
        Linhas: {LABEL_EIXO[eixoLinha]} · Colunas: {LABEL_EIXO[eixoColuna]} · Indicador: TIR alavancada
      </p>
      <table className="w-full text-xs text-center">
        <tbody>
          {resultado.celulas.map((linha, i) => (
            <tr key={i}>
              {linha.map((celula, j) => {
                const central = celula.variacaoLinha === 0 && celula.variacaoColuna === 0;
                return (
                  <td
                    key={j}
                    title={`GDV: ${formatarValor(celula.gdv, "peak_debt")} · Custo total: ${formatarValor(celula.custoTotal, "peak_debt")} · Lucro líquido: ${formatarValor(celula.lucro, "peak_debt")} · Margem: ${(celula.margem * 100).toFixed(1)}%`}
                    className={`p-2 border border-[#E3DACB] ${central ? "bg-[#B96343]/20 font-bold" : ""}`}
                  >
                    {formatarValor(celula.valor, resultado.indicador)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

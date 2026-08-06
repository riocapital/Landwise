"use client";

// Gráfico de cash flow — Gate 6/secção 18 do prompt 03_08. Usa exatamente
// o ledger mensal central (LinhaCashFlowMensal, o mesmo que a tabela
// técnica abaixo dele) — nunca uma série recalculada à parte.

import { useMemo, useState } from "react";
import type { LinhaCashFlowMensal } from "@/lib/calc/cashflow";

type SerieId = "receitas" | "capex" | "drawdowns" | "equity_calls" | "juros_fees" | "amortizacoes" | "distribuicoes";

const SERIES_SELECIONAVEIS: { id: SerieId; label: string; cor: string; extrair: (l: LinhaCashFlowMensal) => number }[] = [
  { id: "receitas", label: "Receitas", cor: "#4E7A5C", extrair: (l) => l.receitaVendas },
  {
    id: "capex",
    label: "CAPEX",
    cor: "#B96343",
    extrair: (l) => l.custosAquisicao + l.hardCosts + l.softCosts + l.outrosCustos + l.feesOperacionais + l.ivaNaoRecuperavel,
  },
  { id: "drawdowns", label: "Drawdowns", cor: "#3E6E8E", extrair: (l) => l.drawdown },
  { id: "equity_calls", label: "Equity calls", cor: "#8A4A2E", extrair: (l) => l.equityCall },
  { id: "juros_fees", label: "Juros e fees de financiamento", cor: "#68735E", extrair: (l) => l.jurosEFees },
  { id: "amortizacoes", label: "Amortizações", cor: "#59636A", extrair: (l) => l.amortizacao },
  {
    id: "distribuicoes",
    label: "Distribuições (capital + lucro — o ledger mensal não separa as duas)",
    cor: "#C08A3E",
    extrair: (l) => l.distribuicoes,
  },
];

const SERIES_PADRAO: { label: string; cor: string; extrair: (l: LinhaCashFlowMensal) => number }[] = [
  { label: "Saldo de caixa", cor: "#142B3A", extrair: (l) => l.saldoCaixaAcumulado },
  { label: "Equity em risco (outstanding)", cor: "#C08A3E", extrair: (l) => l.equityOutstanding },
  { label: "Dívida em aberto", cor: "#A13D2E", extrair: (l) => l.saldoDivida },
];

function fmtEUR(v: number) {
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(v) + " €";
}

const LARGURA = 900;
const ALTURA = 320;
const PAD_ESQ = 70;
const PAD_DIR = 16;
const PAD_TOPO = 16;
const PAD_BASE = 32;

export function CashFlowChart({ linhas }: { linhas: LinhaCashFlowMensal[] }) {
  const [ativas, setAtivas] = useState<Set<SerieId>>(new Set());
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const seriesAtivas = useMemo(
    () => [...SERIES_PADRAO, ...SERIES_SELECIONAVEIS.filter((s) => ativas.has(s.id))],
    [ativas]
  );

  const n = linhas.length;
  const plotW = LARGURA - PAD_ESQ - PAD_DIR;
  const plotH = ALTURA - PAD_TOPO - PAD_BASE;

  const { min, max } = useMemo(() => {
    let mn = 0;
    let mx = 0;
    for (const s of seriesAtivas) {
      for (const l of linhas) {
        const v = s.extrair(l);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    if (mn === mx) {
      mn -= 1;
      mx += 1;
    }
    return { min: mn, max: mx };
  }, [seriesAtivas, linhas]);

  if (n === 0) return null;

  const x = (i: number) => (n === 1 ? PAD_ESQ + plotW / 2 : PAD_ESQ + (i / (n - 1)) * plotW);
  const y = (v: number) => PAD_TOPO + plotH - ((v - min) / (max - min)) * plotH;
  const yZero = y(0);

  const caminho = (extrair: (l: LinhaCashFlowMensal) => number) =>
    linhas.map((l, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(extrair(l)).toFixed(1)}`).join(" ");

  function toggleSerie(id: SerieId) {
    setAtivas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * LARGURA;
    const rel = (px - PAD_ESQ) / plotW;
    const idx = Math.round(rel * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
  }

  const linhaHover = hoverIdx !== null ? linhas[hoverIdx] : null;
  const saldoInicial = hoverIdx !== null ? (hoverIdx === 0 ? 0 : linhas[hoverIdx - 1].saldoCaixaAcumulado) : 0;
  const entradas = linhaHover ? linhaHover.receitaVendas + linhaHover.drawdown + linhaHover.equityCall : 0;
  const saidas = linhaHover
    ? linhaHover.custosAquisicao +
      linhaHover.hardCosts +
      linhaHover.softCosts +
      linhaHover.outrosCustos +
      linhaHover.feesOperacionais +
      linhaHover.ivaNaoRecuperavel +
      linhaHover.comissaoComercial +
      linhaHover.jurosEFees +
      linhaHover.amortizacao +
      linhaHover.distribuicoes
    : 0;

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3 text-xs">
        {SERIES_PADRAO.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[#142B3A] font-medium">
            <span className="inline-block w-3 h-0.5" style={{ background: s.cor }} />
            {s.label}
          </span>
        ))}
        {SERIES_SELECIONAVEIS.map((s) => (
          <button
            key={s.id}
            onClick={() => toggleSerie(s.id)}
            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded"
            style={{ opacity: ativas.has(s.id) ? 1 : 0.4, border: `1px solid ${s.cor}` }}
          >
            <span className="inline-block w-3 h-0.5" style={{ background: s.cor }} />
            {s.label}
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="w-full h-auto"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <line x1={PAD_ESQ} y1={yZero} x2={LARGURA - PAD_DIR} y2={yZero} stroke="#E3DACB" strokeWidth={1} />
        <text x={PAD_ESQ - 8} y={y(max) + 4} textAnchor="end" className="fill-[#59636A]" fontSize={10}>
          {fmtEUR(max)}
        </text>
        <text x={PAD_ESQ - 8} y={y(min) + 4} textAnchor="end" className="fill-[#59636A]" fontSize={10}>
          {fmtEUR(min)}
        </text>

        {seriesAtivas.map((s) => (
          <path key={s.label} d={caminho(s.extrair)} fill="none" stroke={s.cor} strokeWidth={1.75} />
        ))}

        {hoverIdx !== null && <line x1={x(hoverIdx)} y1={PAD_TOPO} x2={x(hoverIdx)} y2={ALTURA - PAD_BASE} stroke="#59636A" strokeDasharray="3,3" />}

        {n <= 40 &&
          linhas.map((l, i) =>
            i % Math.max(1, Math.round(n / 12)) === 0 ? (
              <text key={l.mes} x={x(i)} y={ALTURA - PAD_BASE + 16} textAnchor="middle" className="fill-[#59636A]" fontSize={9}>
                {l.mes}
              </text>
            ) : null
          )}
      </svg>

      {linhaHover && (
        <div className="mt-2 bg-white border border-[#E3DACB] rounded-lg p-3 text-xs grid grid-cols-4 gap-x-4 gap-y-1">
          <div className="col-span-4 font-bold text-[#142B3A] mb-1">{linhaHover.mes}</div>
          <div>
            <span className="text-[#59636A]">Saldo inicial: </span>
            {fmtEUR(saldoInicial)}
          </div>
          <div>
            <span className="text-[#59636A]">Entradas: </span>
            {fmtEUR(entradas)}
          </div>
          <div>
            <span className="text-[#59636A]">Saídas: </span>
            {fmtEUR(saidas)}
          </div>
          <div>
            <span className="text-[#59636A]">Saldo final: </span>
            {fmtEUR(linhaHover.saldoCaixaAcumulado)}
          </div>
          <div>
            <span className="text-[#59636A]">Dívida em aberto: </span>
            {fmtEUR(linhaHover.saldoDivida)}
          </div>
          <div>
            <span className="text-[#59636A]">Equity em risco: </span>
            {fmtEUR(linhaHover.equityOutstanding)}
          </div>
        </div>
      )}
    </div>
  );
}

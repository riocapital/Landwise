"use client";

// Extraído de page.tsx (achado S1 da auditoria de 2026-07-31) — componente
// puramente controlado por props, sem dependência do estado do wizard.

import type { LinhaCashFlowMensal } from "@/lib/calc/cashflow";

export function CashFlowChart({ linhas }: { linhas: LinhaCashFlowMensal[] }) {
  if (linhas.length === 0) return <p className="text-xs text-[#59636A]">Sem dados para mostrar.</p>;

  const largura = 900;
  const altura = 260;
  const margem = { top: 10, right: 10, bottom: 24, left: 10 };
  const w = largura - margem.left - margem.right;
  const h = altura - margem.top - margem.bottom;

  const saldos = linhas.map((l) => l.saldoCaixaAcumulado);
  const cfs = linhas.map((l) => l.cashFlowLevered);
  const minY = Math.min(0, ...saldos, ...cfs);
  const maxY = Math.max(0, ...saldos, ...cfs);
  const rangeY = maxY - minY || 1;

  const x = (i: number) => margem.left + (linhas.length <= 1 ? 0 : (i / (linhas.length - 1)) * w);
  const y = (v: number) => margem.top + h - ((v - minY) / rangeY) * h;
  const yZero = y(0);

  const pontosSaldo = saldos.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const larguraBarra = Math.max(1, (w / linhas.length) * 0.6);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" style={{ minWidth: 600 }}>
        <line x1={margem.left} y1={yZero} x2={largura - margem.right} y2={yZero} stroke="#E3DACB" strokeWidth={1} />
        {cfs.map((v, i) => (
          <rect
            key={i}
            x={x(i) - larguraBarra / 2}
            y={v >= 0 ? y(v) : yZero}
            width={larguraBarra}
            height={Math.abs(y(v) - yZero)}
            fill={v >= 0 ? "#4E7A5C" : "#B96343"}
            opacity={0.6}
          />
        ))}
        <polyline points={pontosSaldo} fill="none" stroke="#3E6E8E" strokeWidth={2} />
        {[0, Math.floor(linhas.length / 2), linhas.length - 1].map((i) => (
          <text key={i} x={x(i)} y={altura - 6} fontSize={10} fill="#59636A" textAnchor="middle">
            {linhas[i].mes}
          </text>
        ))}
      </svg>
      <div className="flex gap-4 text-[10px] text-[#59636A] mt-1">
        <span><span className="inline-block w-3 h-0.5 bg-[#3E6E8E] align-middle mr-1" />Saldo de caixa acumulado</span>
        <span><span className="inline-block w-3 h-3 bg-[#4E7A5C] opacity-60 align-middle mr-1" />CF levered positivo</span>
        <span><span className="inline-block w-3 h-3 bg-[#B96343] opacity-60 align-middle mr-1" />CF levered negativo</span>
      </div>
    </div>
  );
}

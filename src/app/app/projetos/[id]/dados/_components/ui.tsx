"use client";

// Auxiliares visuais partilhados pelos vários "Step*" do wizard — extraídos
// de page.tsx (achado S1 da auditoria de 2026-07-31: ficheiro único demasiado
// grande). Todos são puramente controlados por props, sem estado do wizard.

import { useState } from "react";
import {
  calcularMatrizSensibilidade,
  type MatrizSensibilidade,
  type IndicadorSensibilidade,
  type PremissasBaseSensibilidade,
} from "@/lib/calc/sensibilidades";

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E3DACB] rounded-xl p-6 mb-5">
      <h3 className="text-[#142B3A] font-bold text-[1.02rem] mb-1">{title}</h3>
      {subtitle && <p className="text-[#59636A] text-sm mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-4 mb-4">{children}</div>;
}

// Chamado "FieldGroup" (não "Field") de propósito: src/components/ui.tsx já
// tem um `Field` com uma API diferente (renderiza o próprio <input>, não
// aceita `children`) — dois componentes com o mesmo nome e comportamentos
// incompatíveis era um risco real de confusão (achado de segmentação da
// auditoria de 2026-07-31).
export function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-xs text-[#59636A] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// Campo de valor em euros com separador de milhares (ex.: "1.234.567") —
// mostra os dígitos "em bruto" enquanto o campo está focado (mais fácil de
// editar) e formata com separadores assim que perde o foco. Evita o
// problema clássico de reformatar a cada tecla (o cursor salta de posição).
export function NumeroInput({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");

  const exibido = editando ? texto : value ? value.toLocaleString("pt-PT") : "";

  return (
    <input
      type="text"
      inputMode="numeric"
      className="input-dark"
      placeholder={placeholder}
      value={exibido}
      disabled={disabled}
      onFocus={() => {
        setEditando(true);
        setTexto(value ? String(value) : "");
      }}
      onChange={(e) => {
        const somenteDigitos = e.target.value.replace(/[^\d]/g, "");
        setTexto(somenteDigitos);
        onChange(somenteDigitos === "" ? 0 : Number(somenteDigitos));
      }}
      onBlur={() => setEditando(false)}
    />
  );
}

export function PercentInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      className="input-dark"
      value={Math.round(value * 1000) / 10}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      disabled={disabled}
    />
  );
}

export function CheckboxIdent({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-[#142B3A] mb-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function ResumoItem({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <span className="text-xs text-[#59636A] block">{label}</span>
      <span className="font-semibold text-[#142B3A]">{valor}</span>
    </div>
  );
}

export function SensibilidadesMatriz({
  base,
  matriz,
  indicador,
}: {
  base: PremissasBaseSensibilidade;
  matriz: MatrizSensibilidade;
  indicador: IndicadorSensibilidade;
}) {
  const resultado = calcularMatrizSensibilidade(base, matriz, indicador);
  const formatar = (v: number | null) => {
    if (v === null) return "—";
    if (indicador.startsWith("irr") || indicador === "margem" || indicador === "roi") return `${(v * 100).toFixed(1)}%`;
    if (indicador === "moic") return `${v.toFixed(2)}x`;
    return `€${Math.round(v).toLocaleString("pt-PT")}`;
  };

  return (
    <table className="w-full text-xs text-center">
      <tbody>
        {resultado.celulas.map((linha, i) => (
          <tr key={i}>
            {linha.map((celula, j) => {
              const central = celula.variacaoLinha === 0 && celula.variacaoColuna === 0;
              return (
                <td
                  key={j}
                  title={`GDV: €${Math.round(celula.gdv).toLocaleString("pt-PT")} · Custo total: €${Math.round(celula.custoTotal).toLocaleString("pt-PT")} · Lucro: €${Math.round(celula.lucro).toLocaleString("pt-PT")} · Margem: ${(celula.margem * 100).toFixed(1)}%`}
                  className={`p-2 border border-[#E3DACB] ${central ? "bg-[#B96343]/20 font-bold" : ""}`}
                >
                  {formatar(celula.valor)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

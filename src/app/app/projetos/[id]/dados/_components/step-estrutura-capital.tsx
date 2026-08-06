"use client";

// Extraído de page.tsx (achado S1 da auditoria de 2026-07-31) — Etapa 5 do wizard.

import { type ModeloCapital } from "@/lib/calc/estrutura-capital";
import type { NivelHurdle } from "@/lib/calc/waterfall";
import { resolverValorFee, agregarFees, type Fee, type TipoFee, type ContextoFees } from "@/lib/calc/fees";
import { type EstruturaCapitalEstado } from "@/lib/supabase/project-capital";
import { Card, Row, FieldGroup, PercentInput } from "./ui";

const MODELOS_CAPITAL: { value: ModeloCapital; label: string }[] = [
  { value: "promotor_sozinho", label: "Promotor sem investidor externo" },
  { value: "joint_venture_simples", label: "Joint venture simples" },
  { value: "family_office_sem_fees", label: "Family office sem fees" },
  { value: "family_office_com_fees", label: "Family office com fees" },
  { value: "personalizado", label: "Estrutura personalizada" },
];

const TIPOS_FEE: { value: TipoFee; label: string }[] = [
  { value: "origination", label: "Origination fee" },
  { value: "development", label: "Development fee" },
  { value: "asset_management", label: "Asset management fee" },
  { value: "project_management", label: "Project management fee" },
  { value: "acquisition", label: "Acquisition fee" },
  { value: "disposition", label: "Disposition fee" },
  { value: "outro", label: "Outro fee" },
];

export function StepEstruturaCapital({
  estruturaCapital,
  hurdles,
  feesNovos,
  onAplicarModelo,
  updateEstruturaCapital,
  onAdicionarHurdle,
  onAtualizarHurdle,
  onRemoverHurdle,
  onAdicionarFee,
  onAtualizarFee,
  onRemoverFee,
  contextoFees,
}: {
  estruturaCapital: EstruturaCapitalEstado;
  hurdles: (NivelHurdle & { id: string })[];
  feesNovos: Fee[];
  onAplicarModelo: (modelo: ModeloCapital) => void;
  updateEstruturaCapital: <K extends keyof EstruturaCapitalEstado>(k: K, v: EstruturaCapitalEstado[K]) => void;
  onAdicionarHurdle: () => void;
  onAtualizarHurdle: (id: string, patch: Partial<NivelHurdle>) => void;
  onRemoverHurdle: (id: string) => void;
  onAdicionarFee: (tipo: TipoFee, nome: string) => void;
  onAtualizarFee: (id: string, patch: Partial<Fee>) => void;
  onRemoverFee: (id: string) => void;
  contextoFees: ContextoFees;
}) {
  const resumoFees = agregarFees(feesNovos, contextoFees);

  return (
    <>
      <Card title="Este projeto possui investidores externos?">
        <Row>
          <FieldGroup label="Investidor externo">
            <select
              className="input-dark"
              value={estruturaCapital.temInvestidorExterno ? "sim" : "nao"}
              onChange={(e) => updateEstruturaCapital("temInvestidorExterno", e.target.value === "sim")}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Modelo inicial (aplica valores de referência, tudo editável depois)">
            <select className="input-dark" value={estruturaCapital.modelo} onChange={(e) => onAplicarModelo(e.target.value as ModeloCapital)}>
              {MODELOS_CAPITAL.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </FieldGroup>
        </Row>
        {!estruturaCapital.temInvestidorExterno && (
          <p className="text-xs text-[#59636A]">
            Sem investidor externo: mostra-se só equity do promotor, capital calls, peak cash exposure e resultado do projeto — sem waterfall avançada.
          </p>
        )}
      </Card>

      {estruturaCapital.temInvestidorExterno && (
        <>
          <Card title="Estrutura de capital">
            <Row>
              <FieldGroup label="% do investidor">
                <PercentInput
                  value={estruturaCapital.percentagemInvestidor}
                  onChange={(v) => updateEstruturaCapital("percentagemInvestidor", v)}
                />
              </FieldGroup>
              <FieldGroup label="% do promotor (co-investimento, calculado)">
                <input className="input-dark" value={`${((1 - estruturaCapital.percentagemInvestidor) * 100).toFixed(1)}%`} disabled />
              </FieldGroup>
            </Row>
            <Row>
              <FieldGroup label="Catch-up ativo?">
                <select
                  className="input-dark"
                  value={estruturaCapital.catchUpAtivo ? "sim" : "nao"}
                  onChange={(e) => updateEstruturaCapital("catchUpAtivo", e.target.value === "sim")}
                >
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </FieldGroup>
              {estruturaCapital.catchUpAtivo && (
                <FieldGroup label="% de catch-up">
                  <PercentInput value={estruturaCapital.catchUpPct} onChange={(v) => updateEstruturaCapital("catchUpPct", v)} />
                </FieldGroup>
              )}
            </Row>
          </Card>

          <Card title="Hurdles e promote" subtitle="Ordem: retorno preferencial até ao 1.º hurdle, depois promote sobre o incremento de cada tier.">
            {hurdles.map((h, i) => (
              <Row key={h.id}>
                <FieldGroup label={`Hurdle ${i + 1} (IRR)`}>
                  <PercentInput value={h.hurdleIRR} onChange={(v) => onAtualizarHurdle(h.id, { hurdleIRR: v })} />
                </FieldGroup>
                <FieldGroup label={`Promote ${i + 1} (acima deste hurdle)`}>
                  <PercentInput value={h.promotePctAcima} onChange={(v) => onAtualizarHurdle(h.id, { promotePctAcima: v })} />
                </FieldGroup>
                <div className="flex items-end pb-1">
                  <button onClick={() => onRemoverHurdle(h.id)} className="text-[#A13D2E] text-xs">
                    Remover
                  </button>
                </div>
              </Row>
            ))}
            <button onClick={onAdicionarHurdle} className="text-[#B96343] text-sm font-semibold mt-2">
              + Adicionar tier
            </button>
          </Card>
        </>
      )}

      <Card title="Development fees" subtitle={`Total: €${Math.round(resumoFees.total).toLocaleString("pt-PT")}`}>
        {feesNovos.map((f) => (
          <div key={f.id} className="border border-[#E3DACB] rounded-lg p-3 mb-3">
            <Row>
              <FieldGroup label="Nome">
                <input className="input-dark" value={f.nome} onChange={(e) => onAtualizarFee(f.id, { nome: e.target.value })} />
              </FieldGroup>
              <FieldGroup label="Base de cálculo">
                <select
                  className="input-dark"
                  value={f.baseCalculo}
                  onChange={(e) => onAtualizarFee(f.id, { baseCalculo: e.target.value as Fee["baseCalculo"] })}
                >
                  <option value="valor_fixo">Valor fixo</option>
                  <option value="valor_mensal">Valor mensal</option>
                  <option value="percentagem_vgv_bruto">% do VGV bruto</option>
                  <option value="percentagem_vgv_liquido">% do VGV líquido</option>
                  <option value="percentagem_aquisicao">% da aquisição</option>
                  <option value="percentagem_hard_costs">% dos hard costs</option>
                  <option value="percentagem_capex">% do CAPEX (antes deste fee)</option>
                  <option value="percentagem_custo_total">% do custo total</option>
                  <option value="eur_m2">€/m²</option>
                  <option value="eur_unidade">€/unidade</option>
                </select>
              </FieldGroup>
              <FieldGroup label={f.baseCalculo.startsWith("percentagem") ? "Percentagem" : f.baseCalculo === "valor_mensal" ? "Valor por mês" : "Valor"}>
                {f.baseCalculo.startsWith("percentagem") ? (
                  <PercentInput value={f.valorInput} onChange={(v) => onAtualizarFee(f.id, { valorInput: v })} />
                ) : (
                  <input
                    type="number"
                    className="input-dark"
                    value={f.valorInput}
                    onChange={(e) => onAtualizarFee(f.id, { valorInput: Number(e.target.value) })}
                  />
                )}
              </FieldGroup>
            </Row>
            <Row>
              <FieldGroup label="Momento de pagamento (calendário por defeito)">
                <select
                  className="input-dark"
                  value={f.momentoPagamento}
                  onChange={(e) => onAtualizarFee(f.id, { momentoPagamento: e.target.value as Fee["momentoPagamento"] })}
                >
                  <option value="aquisicao">Na aquisição (escritura)</option>
                  <option value="escritura">Na escritura da aquisição</option>
                  <option value="durante_desenvolvimento">Durante a construção (espalhado)</option>
                  <option value="mensal">Mensal, durante a construção</option>
                  <option value="proporcional_capex">Proporcional ao CAPEX (durante a construção)</option>
                  <option value="conclusao">Na conclusão da obra</option>
                  <option value="venda">Na escritura de venda</option>
                  <option value="data_personalizada">Data específica</option>
                </select>
              </FieldGroup>
              {f.momentoPagamento === "data_personalizada" && (
                <FieldGroup label="Data">
                  <input
                    type="date"
                    className="input-dark"
                    value={f.dataPersonalizada ?? ""}
                    onChange={(e) => onAtualizarFee(f.id, { dataPersonalizada: e.target.value || null })}
                  />
                </FieldGroup>
              )}
              <FieldGroup label="Override do calendário (opcional)">
                <input
                  type="date"
                  className="input-dark"
                  placeholder="Usa o calendário por defeito"
                  value={f.dataInicial ?? ""}
                  onChange={(e) =>
                    onAtualizarFee(f.id, {
                      dataInicial: e.target.value || null,
                      duracaoMeses: e.target.value ? (f.duracaoMeses ?? 1) : null,
                    })
                  }
                />
                <span className="block text-[10px] text-[#59636A] mt-1">
                  {f.dataInicial ? "Calendário próprio, sobrepõe o por defeito." : "Sem override — usa o calendário por defeito derivado do momento de pagamento."}
                </span>
              </FieldGroup>
            </Row>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#59636A]">
                Valor resolvido: €{Math.round(resolverValorFee(f, contextoFees, f.duracaoMeses)).toLocaleString("pt-PT")}
              </span>
              <button onClick={() => onRemoverFee(f.id)} className="text-[#A13D2E] text-xs">
                Remover
              </button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 mt-2">
          {TIPOS_FEE.map((t) => (
            <button
              key={t.value}
              onClick={() => onAdicionarFee(t.value, t.label)}
              className="text-xs px-2.5 py-1 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343]"
            >
              + {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[#8FA6AF] mt-3">Todos os fees começam em €0 até serem configurados — nunca um valor pré-definido.</p>
      </Card>
    </>
  );
}

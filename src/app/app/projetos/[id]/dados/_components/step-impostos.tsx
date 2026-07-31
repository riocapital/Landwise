"use client";

// Extraído de page.tsx (achado S1 da auditoria de 2026-07-31) — Etapa 6 do wizard.

import { useState } from "react";
import {
  resolverTaxaIRC,
  calcLucroTributavel,
  calcLucroEconomico,
  calcLucroTributavelEstimado,
  calcIRCComRegime,
  calcDerramaMunicipal,
  calcDerramaEstadual,
} from "@/lib/calc/impostos";
import type { ImpostosEstado } from "@/lib/supabase/project-taxes";
import { calcularCashFlow } from "@/lib/calc/cashflow";
import { Card, Row, FieldGroup, NumeroInput, PercentInput } from "./ui";
import { ConsultoriaModal } from "./consultoria-modal";

export function StepImpostos({
  impostos,
  updateImpostos,
  resultado,
  onSolicitarConsultoria,
}: {
  impostos: ImpostosEstado;
  updateImpostos: <K extends keyof ImpostosEstado>(k: K, v: ImpostosEstado[K]) => void;
  resultado: ReturnType<typeof calcularCashFlow> | null;
  onSolicitarConsultoria: (
    dados: { name: string; company: string; email: string; phone: string; message: string; preferenciaContacto: "email" | "telefone" },
    impostoEstimado: number
  ) => Promise<{ ok: boolean; erro?: string }>;
}) {
  const { taxa: taxaIrc, taxaManualAplicada } = resolverTaxaIRC(impostos.ircAnoFiscalReferencia, impostos.ircTaxaManual);
  const lucroEconomico = resultado
    ? calcLucroEconomico(resultado.gdv, resultado.comissaoComercialTotal, resultado.custoTotal - resultado.comissaoComercialTotal)
    : 0;
  const lucroTributavelAntesDeAjustes = resultado
    ? calcLucroTributavelEstimado({
        receitasReconhecidas: resultado.gdv,
        custosFiscalmenteConsiderados: resultado.custoTotal - resultado.comissaoComercialTotal,
        comissaoDedutivel: resultado.comissaoComercialTotal,
        feesDedutiveis: 0,
        custosFinanceirosDedutiveis: resultado.financiamento.jurosTotais,
        ajustesFiscais: impostos.ircAjustesFiscais,
      })
    : 0;
  const lucroTributavel = calcLucroTributavel(lucroTributavelAntesDeAjustes, impostos.ircPrejuizosFiscaisAcumulados);
  const resultadoIrc = calcIRCComRegime(lucroTributavel, taxaIrc, impostos.ircRegime);
  const ircEstimado = impostos.estruturaFiscalAssumida === "empresa_spv" ? resultadoIrc.imposto : 0;
  const derramaMunicipal = impostos.estruturaFiscalAssumida === "empresa_spv" ? calcDerramaMunicipal(lucroTributavel, impostos.derramaMunicipalTaxa) : 0;
  const derramaEstadual = impostos.estruturaFiscalAssumida === "empresa_spv" ? calcDerramaEstadual(lucroTributavel) : 0;
  const impostoSimulacaoManual = impostos.estruturaFiscalAssumida !== "empresa_spv" ? (impostos.simulacaoImpostoEstimadoManual ?? 0) : 0;
  const impostoEstimadoTotal = ircEstimado + derramaMunicipal + derramaEstadual + impostoSimulacaoManual;
  const [modalAberto, setModalAberto] = useState(false);

  return (
    <>
      <Card
        title="Impostos — estimativa"
        subtitle="O tratamento depende da estrutura jurídica, do município, do ano e das regras aplicáveis ao projeto. Confirme sempre com contabilista certificado ou consultor fiscal."
      >
        <Row>
          <FieldGroup label="Estrutura fiscal assumida">
            <select className="input-dark" value={impostos.estruturaFiscalAssumida} onChange={(e) => updateImpostos("estruturaFiscalAssumida", e.target.value as ImpostosEstado["estruturaFiscalAssumida"])}>
              <option value="empresa_spv">Empresa/SPV — IRC</option>
              <option value="pessoa_singular">Pessoa singular / atividade individual — IRS</option>
              <option value="nao_definida">Estrutura ainda não definida</option>
              <option value="outra">Outra</option>
            </select>
          </FieldGroup>
        </Row>

        {impostos.estruturaFiscalAssumida === "empresa_spv" ? (
          <>
            <Row>
              <FieldGroup label="Regime de IRC assumido">
                <select className="input-dark" value={impostos.ircRegime} onChange={(e) => updateImpostos("ircRegime", e.target.value as ImpostosEstado["ircRegime"])}>
                  <option value="geral">Taxa geral</option>
                  <option value="pme_small_mid_cap">PME / Small Mid Cap elegível</option>
                </select>
              </FieldGroup>
              <FieldGroup label="Ano fiscal de referência"><input type="number" className="input-dark" value={impostos.ircAnoFiscalReferencia} onChange={(e) => updateImpostos("ircAnoFiscalReferencia", Number(e.target.value))} /></FieldGroup>
              <FieldGroup label="Taxa geral de referência"><input className="input-dark" value={`${(taxaIrc * 100).toFixed(1)}%`} disabled /></FieldGroup>
              <FieldGroup label="Taxa geral manual (opcional)"><input type="number" className="input-dark" value={impostos.ircTaxaManual == null ? "" : impostos.ircTaxaManual * 100} onChange={(e) => updateImpostos("ircTaxaManual", e.target.value ? Number(e.target.value) / 100 : null)} placeholder={`${(taxaIrc * 100).toFixed(1)}%`} /></FieldGroup>
            </Row>
            {taxaManualAplicada && <p className="text-xs text-[#B96343] mb-2">Taxa geral manual aplicada. Esta premissa deve ser validada.</p>}
            {impostos.ircRegime === "pme_small_mid_cap" && (
              <p className="text-xs text-[#59636A] mb-3">O motor aplica a taxa reduzida apenas aos primeiros €50.000 de matéria coletável e a taxa geral ao excedente. A elegibilidade deve ser confirmada.</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
              <div><span className="text-xs text-[#59636A] block">Lucro económico</span><span className="font-semibold text-[#142B3A]">€{Math.round(lucroEconomico).toLocaleString("pt-PT")}</span></div>
              <div><span className="text-xs text-[#59636A] block">Lucro tributável estimado</span><span className="font-semibold text-[#142B3A]">€{Math.round(lucroTributavel).toLocaleString("pt-PT")}</span></div>
              <div><span className="text-xs text-[#59636A] block">IRC estimado</span><span className="font-semibold text-[#142B3A]">€{Math.round(ircEstimado).toLocaleString("pt-PT")}</span></div>
              <div><span className="text-xs text-[#59636A] block">Imposto total estimado</span><span className="font-semibold text-[#142B3A]">€{Math.round(impostoEstimadoTotal).toLocaleString("pt-PT")}</span></div>
            </div>
            {impostos.ircRegime === "pme_small_mid_cap" && (
              <p className="text-xs text-[#59636A] mb-3">Parcela com taxa reduzida: €{Math.round(resultadoIrc.parcelaTaxaReduzida).toLocaleString("pt-PT")} · Parcela com taxa geral: €{Math.round(resultadoIrc.parcelaTaxaGeral).toLocaleString("pt-PT")}</p>
            )}
            <Row>
              <FieldGroup label="Ajustes fiscais estimados (€)"><input type="number" className="input-dark" value={impostos.ircAjustesFiscais} onChange={(e) => updateImpostos("ircAjustesFiscais", Number(e.target.value))} /></FieldGroup>
              <FieldGroup label="Prejuízos fiscais acumulados (€)"><NumeroInput value={impostos.ircPrejuizosFiscaisAcumulados} onChange={(v) => updateImpostos("ircPrejuizosFiscaisAcumulados", v)} /></FieldGroup>
              <FieldGroup label="Derrama municipal (%)"><PercentInput value={impostos.derramaMunicipalTaxa} onChange={(v) => updateImpostos("derramaMunicipalTaxa", v)} /></FieldGroup>
            </Row>
            <p className="text-xs text-[#59636A] mt-2">Derrama municipal estimada: €{Math.round(derramaMunicipal).toLocaleString("pt-PT")} · Derrama estadual progressiva estimada: €{Math.round(derramaEstadual).toLocaleString("pt-PT")}.</p>
            <p className="text-xs text-[#8FA6AF] mt-2">A derrama municipal não é fixa nacionalmente. A derrama estadual não é uma taxa fixa de 1,5% e só se aplica quando os limites legais são ultrapassados.</p>
          </>
        ) : (
          <>
            <p className="text-xs text-[#B96343] mb-3">O tratamento pode estar sujeito a IRS ou outro enquadramento. O Landwise não aplica IRC automaticamente.</p>
            <Row>
              <FieldGroup label="Taxa efetiva manual (simulação)"><PercentInput value={impostos.simulacaoTaxaEfetivaManual ?? 0} onChange={(v) => updateImpostos("simulacaoTaxaEfetivaManual", v)} /></FieldGroup>
              <FieldGroup label="Imposto estimado manual (€)"><input type="number" className="input-dark" value={impostos.simulacaoImpostoEstimadoManual ?? ""} onChange={(e) => updateImpostos("simulacaoImpostoEstimadoManual", e.target.value ? Number(e.target.value) : null)} /></FieldGroup>
            </Row>
            <p className="text-xs text-[#A13D2E] font-semibold">Premissa manual não validada.</p>
          </>
        )}
      </Card>

      <Card title="Confirmação profissional">
        <p className="text-sm text-[#142B3A] mb-3">IMT e imposto do selo pertencem à aquisição; IVA pertence a cada custo. Esta aba apresenta apenas uma estimativa do imposto sobre o resultado.</p>
        <button onClick={() => setModalAberto(true)} className="text-sm font-semibold text-white bg-[#142B3A] px-4 py-2 rounded-lg">Solicitar análise especializada</button>
      </Card>
      {modalAberto && <ConsultoriaModal onFechar={() => setModalAberto(false)} onEnviar={(dados) => onSolicitarConsultoria(dados, impostoEstimadoTotal)} />}
    </>
  );
}

"use client";

// Extraído de page.tsx (achado S1 da auditoria de 2026-07-31) — Etapa 4 do wizard.

import { useState } from "react";
import { taxaAnual, taxaMensal, type ParametrosFinanciamento } from "@/lib/calc/financiamento";
import { calcularReservaMinimaCustos } from "@/lib/calc/cashflow";
import { Card, Row, FieldGroup, NumeroInput, PercentInput } from "./ui";

export function StepFinanciamento({
  financiamento,
  onToggleComFinanciamento,
  updateFinanciamento,
  reservaMinima,
}: {
  financiamento: ParametrosFinanciamento;
  onToggleComFinanciamento: (v: boolean) => void;
  updateFinanciamento: <K extends keyof ParametrosFinanciamento>(k: K, v: ParametrosFinanciamento[K]) => void;
  reservaMinima: ReturnType<typeof calcularReservaMinimaCustos>;
}) {
  const desativado = !financiamento.comFinanciamento;
  const [euriborCarregando, setEuriborCarregando] = useState(false);
  const [euriborErro, setEuriborErro] = useState<string | null>(null);

  async function atualizarEuribor(tenor: "6m" | "12m") {
    setEuriborCarregando(true);
    setEuriborErro(null);
    try {
      const resp = await fetch(`/api/financiamento/euribor?tenor=${tenor}`);
      const dados = await resp.json();
      if (dados.sucesso) {
        updateFinanciamento("euribor", dados.taxa);
        updateFinanciamento("euriborOrigem", tenor);
        updateFinanciamento("euriborDataReferencia", dados.dataReferencia);
        updateFinanciamento("euriborFonte", dados.fonte);
      } else {
        setEuriborErro(dados.erro);
      }
    } catch {
      setEuriborErro("Não foi possível ligar ao BCE. Preenche a taxa manualmente.");
    } finally {
      setEuriborCarregando(false);
    }
  }

  return (
    <>
      <Card title="Financiamento bancário">
        <Row>
          <FieldGroup label="Este projeto terá financiamento bancário?">
            <select
              className="input-dark"
              value={financiamento.comFinanciamento ? "sim" : "nao"}
              onChange={(e) => onToggleComFinanciamento(e.target.value === "sim")}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </FieldGroup>
        </Row>
        {desativado && (
          <p className="text-xs text-[#59636A] mb-3">
            Sem financiamento bancário: dívida, juros, fees e imposto de selo ficam a €0. O funding passa a ser só equity + recebimentos de clientes.
          </p>
        )}

        <Row>
          <FieldGroup label="% dos hard costs financiada">
            <PercentInput
              value={financiamento.percentagemHardCostsFinanciada}
              onChange={(v) => updateFinanciamento("percentagemHardCostsFinanciada", v)}
              disabled={desativado}
            />
          </FieldGroup>
          <FieldGroup label="% da aquisição financiada">
            <PercentInput
              value={financiamento.percentagemAquisicaoFinanciada}
              onChange={(v) => updateFinanciamento("percentagemAquisicaoFinanciada", v)}
              disabled={desativado}
            />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Euribor">
            <PercentInput
              value={financiamento.euribor}
              onChange={(v) => {
                updateFinanciamento("euribor", v);
                updateFinanciamento("euriborOrigem", "manual");
                updateFinanciamento("euriborDataReferencia", null);
                updateFinanciamento("euriborFonte", null);
              }}
              disabled={desativado}
            />
          </FieldGroup>
          <FieldGroup label="Spread">
            <PercentInput value={financiamento.spread} onChange={(v) => updateFinanciamento("spread", v)} disabled={desativado} />
          </FieldGroup>
          <FieldGroup label="Taxa anual (calculada)">
            <input className="input-dark" value={`${(taxaAnual(financiamento) * 100).toFixed(2)}%`} disabled />
          </FieldGroup>
        </Row>
        {!desativado && (
          <Row>
            <div>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => atualizarEuribor("6m")}
                  disabled={euriborCarregando}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343] disabled:opacity-50"
                >
                  {euriborCarregando ? "A obter…" : "Atualizar Euribor 6M (BCE)"}
                </button>
                <button
                  onClick={() => atualizarEuribor("12m")}
                  disabled={euriborCarregando}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343] disabled:opacity-50"
                >
                  {euriborCarregando ? "A obter…" : "Atualizar Euribor 12M (BCE)"}
                </button>
              </div>
              {euriborErro && <p className="text-xs text-[#A13D2E] mb-1">{euriborErro}</p>}
              {financiamento.euriborOrigem !== "manual" && financiamento.euriborFonte && (
                <p className="text-xs text-[#59636A]">
                  Origem: Euribor {financiamento.euriborOrigem === "6m" ? "6M" : "12M"} · Referência: {financiamento.euriborDataReferencia} · Fonte:{" "}
                  {financiamento.euriborFonte}. Média mensal do BCE — não é a taxa exata de hoje; podes sobrepor o valor manualmente acima a
                  qualquer momento.
                </p>
              )}
              {financiamento.euriborOrigem === "manual" && <p className="text-xs text-[#8FA6AF]">Taxa preenchida manualmente.</p>}
            </div>
          </Row>
        )}
        <Row>
          <FieldGroup label="Metodologia da taxa mensal">
            <select
              className="input-dark"
              value={financiamento.metodoTaxaMensal}
              onChange={(e) => updateFinanciamento("metodoTaxaMensal", e.target.value as ParametrosFinanciamento["metodoTaxaMensal"])}
              disabled={desativado}
            >
              <option value="nominal_anual_div_12">Taxa nominal anual ÷ 12</option>
              <option value="mensal_equivalente">Taxa mensal equivalente</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Taxa mensal (calculada)">
            <input className="input-dark" value={`${(taxaMensal(financiamento) * 100).toFixed(3)}%`} disabled />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Structuring fee (% do limite)">
            <PercentInput value={financiamento.structuringFeePct} onChange={(v) => updateFinanciamento("structuringFeePct", v)} disabled={desativado} />
          </FieldGroup>
          <FieldGroup label="Setup costs (% do limite)">
            <PercentInput value={financiamento.setupCostsPct ?? 0.003} onChange={(v) => updateFinanciamento("setupCostsPct", v)} disabled={desativado} />
          </FieldGroup>
          <FieldGroup label="Setup costs fixos adicionais (€)">
            <NumeroInput value={financiamento.setupCosts} onChange={(v) => updateFinanciamento("setupCosts", v)} disabled={desativado} />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Imposto de selo do empréstimo">
            <PercentInput
              value={financiamento.impostoSeloEmprestimoPct}
              onChange={(v) => updateFinanciamento("impostoSeloEmprestimoPct", v)}
              disabled={desativado}
            />
          </FieldGroup>
          <FieldGroup label="Imposto de selo sobre juros">
            <PercentInput
              value={financiamento.impostoSeloJurosPct}
              onChange={(v) => updateFinanciamento("impostoSeloJurosPct", v)}
              disabled={desativado}
            />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Limite da linha (€) — vazio = sem limite explícito">
            <input
              type="number"
              className="input-dark"
              value={financiamento.limiteCredito ?? ""}
              onChange={(e) => updateFinanciamento("limiteCredito", e.target.value ? Number(e.target.value) : null)}
              disabled={desativado}
            />
          </FieldGroup>
          <FieldGroup label="Meses de custos futuros cobertos pela reserva">
            <select
              className="input-dark"
              value={financiamento.saldoMinimoMesesReserva ?? 6}
              onChange={(e) => {
                const meses = Number(e.target.value);
                updateFinanciamento("saldoMinimoMesesReserva", meses);
                updateFinanciamento("cashSweepMesesCustosFuturos", meses);
              }}
              disabled={desativado}
            >
              {[3, 6, 9, 12].map((m) => <option key={m} value={m}>{m} meses</option>)}
            </select>
          </FieldGroup>
          <FieldGroup label="Saldo mínimo calculado (€)">
            <input className="input-dark" value={`€${Math.round(reservaMinima.valor).toLocaleString("pt-PT")}`} disabled />
            <span className="block text-[10px] text-[#59636A] mt-1">
              Janela crítica: {reservaMinima.mesInicio ?? "—"} a {reservaMinima.mesFim ?? "—"}. Exclui aquisição, amortizações, distribuições e imposto sobre lucro.
            </span>
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Facility revolver?">
            <select
              className="input-dark"
              value={financiamento.revolver ? "sim" : "nao"}
              onChange={(e) => updateFinanciamento("revolver", e.target.value === "sim")}
              disabled={desativado}
            >
              <option value="sim">Sim — amortizar reabre o limite</option>
              <option value="nao">Não — o limite nunca reabre depois de utilizado</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Comissão de compromisso anual (sobre o não utilizado)">
            <PercentInput value={financiamento.commitmentFeePct} onChange={(v) => updateFinanciamento("commitmentFeePct", v)} disabled={desativado} />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Prazo total do empréstimo (anos)">
            <input
              type="number"
              min={0}
              step={0.5}
              className="input-dark"
              value={financiamento.prazoAnos}
              onChange={(e) => updateFinanciamento("prazoAnos", Number(e.target.value))}
              disabled={desativado}
            />
          </FieldGroup>
          <FieldGroup label="Há período de carência de capital?">
            <select
              className="input-dark"
              value={financiamento.carenciaAtiva ? "sim" : "nao"}
              onChange={(e) => updateFinanciamento("carenciaAtiva", e.target.value === "sim")}
              disabled={desativado}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Carência (anos)">
            <input
              type="number"
              min={0}
              step={0.5}
              className="input-dark"
              value={financiamento.carenciaAnos}
              onChange={(e) => updateFinanciamento("carenciaAnos", Number(e.target.value))}
              disabled={desativado || !financiamento.carenciaAtiva}
            />
          </FieldGroup>
        </Row>
        {financiamento.carenciaAtiva && (
          <p className="text-xs text-[#59636A] mb-3">
            Durante a carência só se pagam juros — sem amortização de capital e sem cash sweep. A amortização do capital
            começa a seguir à carência, em linha reta até ao fim do prazo total (com liquidação final na maturidade).
          </p>
        )}
        <Row>
          <FieldGroup label="Evento de saída/refinanciamento (mês) — vazio = liquidação automática no último mês do horizonte">
            <input
              type="month"
              className="input-dark"
              value={financiamento.mesEventoSaida ?? ""}
              onChange={(e) => updateFinanciamento("mesEventoSaida", e.target.value || null)}
              disabled={desativado}
            />
          </FieldGroup>
        </Row>
        <p className="text-xs text-[#59636A] mb-3">
          Se o projeto tiver uma venda final ou refinanciamento previsto para um mês específico, define-o aqui — a dívida é
          liquidada integralmente nesse mês. Sem evento definido, a dívida é sempre liquidada no último mês do horizonte
          modelado (nunca fica por pagar).
        </p>
      </Card>

      <Card
        title="Cash sweep"
        subtitle="A partir de um gatilho, usa o caixa livre para amortizar dívida antecipadamente — nunca abaixo do saldo mínimo, nunca sem reservar os próximos meses de custos."
      >
        <Row>
          <FieldGroup label="Ativar cash sweep?">
            <select
              className="input-dark"
              value={financiamento.cashSweepAtivo ? "sim" : "nao"}
              onChange={(e) => updateFinanciamento("cashSweepAtivo", e.target.value === "sim")}
              disabled={desativado}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </FieldGroup>
          <FieldGroup label="% do caixa livre usado para amortizar">
            <PercentInput
              value={financiamento.cashSweepPctCaixaLivre}
              onChange={(v) => updateFinanciamento("cashSweepPctCaixaLivre", v)}
              disabled={desativado || !financiamento.cashSweepAtivo}
            />
          </FieldGroup>
        </Row>
        {financiamento.cashSweepAtivo && (
          <>
            <Row>
              <FieldGroup label="Reserva protegida pelo cash sweep">
                <input className="input-dark" value={`${financiamento.saldoMinimoMesesReserva ?? 6} meses · €${Math.round(reservaMinima.valor).toLocaleString("pt-PT")}`} disabled />
              </FieldGroup>
              <FieldGroup label="Início do cash sweep">
                <select
                  className="input-dark"
                  value={financiamento.cashSweepInicioTipo}
                  onChange={(e) => updateFinanciamento("cashSweepInicioTipo", e.target.value as ParametrosFinanciamento["cashSweepInicioTipo"])}
                  disabled={desativado}
                >
                  <option value="primeira_escritura">Primeira escritura</option>
                  <option value="pct_vendido">% do projeto vendido</option>
                  <option value="pct_vgv_recebido">% do VGV recebido</option>
                  <option value="data">Data específica</option>
                </select>
              </FieldGroup>
            </Row>
            <Row>
              {financiamento.cashSweepInicioTipo === "data" ? (
                <FieldGroup label="Data de início">
                  <input
                    type="date"
                    className="input-dark"
                    value={financiamento.cashSweepInicioData ?? ""}
                    onChange={(e) => updateFinanciamento("cashSweepInicioData", e.target.value)}
                    disabled={desativado}
                  />
                </FieldGroup>
              ) : (
                financiamento.cashSweepInicioTipo !== "primeira_escritura" && (
                  <FieldGroup label="% gatilho">
                    <PercentInput
                      value={financiamento.cashSweepInicioValorPct ?? 0}
                      onChange={(v) => updateFinanciamento("cashSweepInicioValorPct", v)}
                      disabled={desativado}
                    />
                  </FieldGroup>
                )
              )}
            </Row>
          </>
        )}
      </Card>
    </>
  );
}

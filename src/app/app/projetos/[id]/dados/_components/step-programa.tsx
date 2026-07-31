"use client";

// Extraído de page.tsx (achado S1 da auditoria de 2026-07-31) — Etapa 2 do wizard.

import { Fragment, useState } from "react";
import { type Typology } from "@/lib/calc/areas";
import { calcResumoPrograma } from "@/lib/calc/areas";
import type { IdentificacaoEstruturada } from "../page";
import type { SugestaoPreco } from "@/lib/calc/comparaveis";
import {
  resolverSalesTable,
  calcVgvBruto,
  calcDataEscrituraDefeito,
  validarEscrituraUnidade,
  calcValorEscrituraUnidade,
  type UnidadeVenda,
} from "@/lib/calc/sales-table";
import { gerarAgendaAbsorcao, calcResumoAbsorcao, calcularDatasEfetivas } from "@/lib/calc/sales-curve";
import { type RegraEvolucaoPreco, type TipoGatilhoPreco } from "@/lib/calc/price-escalation";
import { validarEstruturaRecebimentos, type PlanoVendas } from "@/lib/calc/vendas";
import { Card, Row, FieldGroup, NumeroInput, PercentInput } from "./ui";
import { salesTableDaTipologia } from "./helpers";

export function StepPrograma({
  tipologiasNovas,
  identificacao,
  onAdicionarTipologiaNova,
  onAtualizarTipologiaNova,
  onRemoverTipologiaNova,
  sugestoes,
  onPedirSugestao,
  onAplicarSugestao,
  unidades,
  onSincronizarUnidades,
  onAtualizarUnidade,
  planoVendas,
  updatePlanoVendas,
  updateEstruturaRecebimentos,
  regrasPreco,
  onAdicionarRegraPreco,
  onAtualizarRegraPreco,
  onRemoverRegraPreco,
  onAplicarEvolucaoPrecos,
}: {
  tipologiasNovas: Typology[];
  identificacao: IdentificacaoEstruturada;
  onAdicionarTipologiaNova: () => void;
  onAtualizarTipologiaNova: (id: string, patch: Partial<Typology>) => void;
  onRemoverTipologiaNova: (id: string) => void;
  sugestoes: Record<string, { loading: boolean; resultado?: SugestaoPreco; erro?: boolean }>;
  onPedirSugestao: (t: Typology) => void;
  onAplicarSugestao: (id: string, precoM2: number) => void;
  unidades: UnidadeVenda[];
  onSincronizarUnidades: (t: Typology) => void;
  onAtualizarUnidade: (id: string, patch: Partial<UnidadeVenda>) => void;
  planoVendas: PlanoVendas;
  updatePlanoVendas: <K extends keyof PlanoVendas>(key: K, value: PlanoVendas[K]) => void;
  updateEstruturaRecebimentos: <K extends keyof PlanoVendas["estruturaRecebimentos"]>(key: K, value: PlanoVendas["estruturaRecebimentos"][K]) => void;
  regrasPreco: RegraEvolucaoPreco[];
  onAdicionarRegraPreco: () => void;
  onAtualizarRegraPreco: (id: string, patch: Partial<RegraEvolucaoPreco>) => void;
  onRemoverRegraPreco: (id: string) => void;
  onAplicarEvolucaoPrecos: () => void;
}) {
  const resumo = calcResumoPrograma(tipologiasNovas, identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo);
  const semLocalizacao = !identificacao.freguesia && !identificacao.concelho;
  // Sinal/reforços/escritura por unidade ficam num painel expansível, não em
  // colunas sempre visíveis — antes disso mostravam o mesmo texto repetido
  // linha após linha ("Fim de obra + prazo por defeito") sem acrescentar
  // nada a olhar para a tabela principal (feedback direto do utilizador).
  const [unidadeExpandidaId, setUnidadeExpandidaId] = useState<string | null>(null);
  const datasEfetivas = planoVendas.dataLancamentoComercial
    ? calcularDatasEfetivas(
        unidades.map((u) => ({ id: u.id, tipologiaId: u.tipologiaId, ordem: u.ordem, dataVenda: u.dataVenda, estadoComercial: u.estadoComercial })),
        tipologiasNovas.map((t) => ({ id: t.id, quantidade: t.quantidade, mesesParaPrimeiraVenda: t.mesesParaPrimeiraVenda, unidadesPorMes: t.unidadesPorMes })),
        planoVendas.dataLancamentoComercial
      )
    : new Map<string, string>();
  const comissaoSplitValido = Math.abs(planoVendas.comissaoPctPagoSinal + planoVendas.comissaoPctPagoEscritura - 1) < 0.001;
  const somaRecebimentos =
    planoVendas.estruturaRecebimentos.pctReserva +
    planoVendas.estruturaRecebimentos.pctCpcv +
    planoVendas.estruturaRecebimentos.pctDuranteConstrucao +
    planoVendas.estruturaRecebimentos.pctConclusao +
    planoVendas.estruturaRecebimentos.pctEscritura;
  const recebimentosValidos = validarEstruturaRecebimentos(planoVendas.estruturaRecebimentos);

  return (
    <>
      <Card
        title="Plano e velocidade de vendas"
        subtitle="A data de lançamento governa a curva, as datas projetadas da Sales Table, os sinais do CPCV, as comissões e o cash flow."
      >
        <Row>
          <FieldGroup label="Data de lançamento comercial">
            <input
              type="date"
              className="input-dark"
              value={planoVendas.dataLancamentoComercial}
              onChange={(e) => updatePlanoVendas("dataLancamentoComercial", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Comissão comercial (%)">
            <PercentInput value={planoVendas.comissaoMediacaoPct} onChange={(v) => updatePlanoVendas("comissaoMediacaoPct", v)} />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="IVA da comissão">
            <select
              className="input-dark"
              value={planoVendas.comissaoTaxaIva}
              onChange={(e) => updatePlanoVendas("comissaoTaxaIva", Number(e.target.value))}
            >
              <option value={0}>Sem IVA</option>
              <option value={0.06}>6%</option>
              <option value={0.23}>23%</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Comissão paga no sinal (%)">
            <PercentInput value={planoVendas.comissaoPctPagoSinal} onChange={(v) => updatePlanoVendas("comissaoPctPagoSinal", v)} />
          </FieldGroup>
          <FieldGroup label="Comissão paga na escritura (%)">
            <PercentInput value={planoVendas.comissaoPctPagoEscritura} onChange={(v) => updatePlanoVendas("comissaoPctPagoEscritura", v)} />
          </FieldGroup>
          <FieldGroup label="IVA recuperável da comissão (%)">
            <PercentInput value={planoVendas.comissaoIvaRecuperavelPct} onChange={(v) => updatePlanoVendas("comissaoIvaRecuperavelPct", v)} />
          </FieldGroup>
        </Row>
        {!comissaoSplitValido && (
          <p className="text-xs text-[#A13D2E] mt-2">A comissão paga no sinal e na escritura deve somar 100%.</p>
        )}
        <p className="text-xs text-[#59636A] mt-2">
          A comissão incide sobre o preço total da unidade. O sinal do CPCV entra no mês da venda; o saldo entra na escritura.
        </p>

        <div className="mt-5 pt-4 border-t border-[#E3DACB]">
          <p className="text-xs font-semibold text-[#142B3A] mb-3">Calendário e recebimentos comerciais</p>
          <Row>
            <FieldGroup label="Data prevista das escrituras">
              <input
                type="date"
                className="input-dark"
                value={planoVendas.dataEscritura}
                onChange={(e) => updatePlanoVendas("dataEscritura", e.target.value)}
              />
            </FieldGroup>
            <FieldGroup label="Cancelamentos estimados (%)">
              <PercentInput value={planoVendas.cancelamentosEstimadosPct} onChange={(v) => updatePlanoVendas("cancelamentosEstimadosPct", v)} />
            </FieldGroup>
            <FieldGroup label="Início da construção (derivado dos hard costs)">
              <input className="input-dark" value={planoVendas.dataInicioConstrucao || "—"} disabled />
            </FieldGroup>
            <FieldGroup label="Fim da construção (derivado dos hard costs)">
              <input className="input-dark" value={planoVendas.dataFimConstrucao || "—"} disabled />
            </FieldGroup>
          </Row>
          <Row>
            <FieldGroup label="Escritura de cada unidade: meses após fim de obra (sugestão por defeito)">
              <input
                type="number"
                min={0}
                className="input-dark"
                value={planoVendas.duracaoEscrituraAposObraMeses}
                onChange={(e) => updatePlanoVendas("duracaoEscrituraAposObraMeses", Math.max(0, Number(e.target.value) || 0))}
              />
            </FieldGroup>
          </Row>
          <p className="text-xs text-[#59636A] -mt-2 mb-2">
            Usado só para sugerir a data de escritura de cada unidade na Sales Table — sempre sobreponível linha a linha.
          </p>
          <p className="text-xs font-semibold text-[#142B3A] mt-3 mb-2">
            Estrutura de recebimentos — {Math.round(somaRecebimentos * 100)}%
            {!recebimentosValidos && <span className="text-[#A13D2E]"> (tem de somar 100%)</span>}
          </p>
          <Row>
            <FieldGroup label="Reserva (%)">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctReserva} onChange={(v) => updateEstruturaRecebimentos("pctReserva", v)} />
            </FieldGroup>
            <FieldGroup label="CPCV / sinal (%)">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctCpcv} onChange={(v) => updateEstruturaRecebimentos("pctCpcv", v)} />
            </FieldGroup>
            <FieldGroup label="Durante a construção (%)">
              <PercentInput
                value={planoVendas.estruturaRecebimentos.pctDuranteConstrucao}
                onChange={(v) => updateEstruturaRecebimentos("pctDuranteConstrucao", v)}
              />
            </FieldGroup>
            <FieldGroup label="Na conclusão (%)">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctConclusao} onChange={(v) => updateEstruturaRecebimentos("pctConclusao", v)} />
            </FieldGroup>
            <FieldGroup label="Na escritura (%)">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctEscritura} onChange={(v) => updateEstruturaRecebimentos("pctEscritura", v)} />
            </FieldGroup>
          </Row>
        </div>
      </Card>

      <Card
        title="Programa de tipologias"
        subtitle="Cada alteração de quantidade sincroniza automaticamente a Sales Table abaixo — que é a única fonte do VGV."
      >
        {semLocalizacao && (
          <p className="text-xs text-[#B96343] mb-3">
            Preencha a freguesia/concelho na Identificação para poder pedir a Sugestão Landwise por comparáveis.
          </p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[#59636A] uppercase text-left">
              <th className="pb-2">Tipologia</th>
              <th className="pb-2">Qtd</th>
              <th className="pb-2">ABP (m²)</th>
              <th className="pb-2">Varanda m² / %</th>
              <th className="pb-2">Terraço m² / %</th>
              <th className="pb-2">Preço base (€/m²)</th>
              <th className="pb-2">Área vendável</th>
              <th className="pb-2">Receita</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tipologiasNovas.map((t) => {
              const sugestao = sugestoes[t.id];
              return (
                <tr key={t.id} className="align-top">
                  <td className="pr-2 py-1">
                    <input
                      className="input-dark"
                      value={t.nome}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { nome: e.target.value })}
                    />
                  </td>
                  <td className="pr-2 py-1">
                    <input
                      type="number"
                      className="input-dark"
                      value={t.quantidade}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { quantidade: Number(e.target.value) })}
                    />
                  </td>
                  <td className="pr-2 py-1">
                    <input
                      type="number"
                      className="input-dark"
                      value={t.abpUnidade}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { abpUnidade: Number(e.target.value) })}
                    />
                  </td>
                  <td className="pr-2 py-1 flex gap-1">
                    <input
                      type="number"
                      className="input-dark w-20"
                      value={t.varandaM2}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { varandaM2: Number(e.target.value) })}
                    />
                    <PercentInput
                      value={t.varandaPctValorizacao}
                      onChange={(v) => onAtualizarTipologiaNova(t.id, { varandaPctValorizacao: v })}
                    />
                  </td>
                  <td className="pr-2 py-1 flex gap-1">
                    <input
                      type="number"
                      className="input-dark w-20"
                      value={t.terracoM2}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { terracoM2: Number(e.target.value) })}
                    />
                    <PercentInput
                      value={t.terracoPctValorizacao}
                      onChange={(v) => onAtualizarTipologiaNova(t.id, { terracoPctValorizacao: v })}
                    />
                  </td>
                  <td className="pr-2 py-1">
                    <input
                      type="number"
                      className="input-dark"
                      value={t.precoBaseM2}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { precoBaseM2: Number(e.target.value) })}
                    />
                    <button
                      onClick={() => onPedirSugestao(t)}
                      disabled={semLocalizacao || sugestao?.loading}
                      className="text-xs text-[#B96343] font-semibold mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {sugestao?.loading ? "A calcular…" : "★ Pedir Sugestão Landwise"}
                    </button>
                    {sugestao?.erro && <p className="text-xs text-[#A13D2E] mt-1">Não foi possível calcular a sugestão.</p>}
                    {sugestao?.resultado && (
                      <div className="text-xs text-[#59636A] mt-1">
                        {sugestao.resultado.nivelConfianca === "Amostra insuficiente" || !sugestao.resultado.precoSugeridoM2 ? (
                          <span>Amostra insuficiente de comparáveis nesta zona.</span>
                        ) : (
                          <>
                            <p>
                              ★ €{sugestao.resultado.precoSugeridoM2.toLocaleString("pt-PT")}/m² — {sugestao.resultado.numeroComparaveis}{" "}
                              comparáveis, confiança {sugestao.resultado.nivelConfianca.toLowerCase()}
                            </p>
                            <button
                              onClick={() => onAplicarSugestao(t.id, sugestao.resultado!.precoSugeridoM2!)}
                              className="text-[#142B3A] font-semibold underline"
                            >
                              Aplicar sugestão
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="pr-2 py-1 text-[#59636A]">{Math.round(t.abpUnidade + t.varandaM2 * t.varandaPctValorizacao + t.terracoM2 * t.terracoPctValorizacao)} m²</td>
                  <td className="pr-2 py-1 text-[#59636A]">
                    €{Math.round((t.abpUnidade + t.varandaM2 * t.varandaPctValorizacao + t.terracoM2 * t.terracoPctValorizacao) * t.precoBaseM2 * t.quantidade).toLocaleString("pt-PT")}
                  </td>
                  <td className="flex gap-2">
                    <button onClick={() => onSincronizarUnidades(t)} className="text-[#B96343] text-xs font-semibold">
                      Sincronizar Sales Table
                    </button>
                    <button onClick={() => onRemoverTipologiaNova(t.id)} className="text-[#A13D2E] text-xs">
                      Remover
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button onClick={onAdicionarTipologiaNova} className="text-[#B96343] text-sm font-semibold mt-3">
          + Adicionar tipologia
        </button>

        {tipologiasNovas.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-[#E3DACB] text-sm">
            <div>
              <span className="text-xs text-[#59636A] block">Total de unidades</span>
              <span className="font-semibold text-[#142B3A]">{resumo.totalUnidades}</span>
            </div>
            <div>
              <span className="text-xs text-[#59636A] block">Área vendável equivalente</span>
              <span className="font-semibold text-[#142B3A]">{Math.round(resumo.areaVendavelEquivalenteTotal)} m²</span>
            </div>
            <div>
              <span className="text-xs text-[#59636A] block">Receita estimada (antes de gerar a Sales Table)</span>
              <span className="font-semibold text-[#142B3A]">€{Math.round(resumo.receitaTotal).toLocaleString("pt-PT")}</span>
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Curva de vendas por tipologia"
        subtitle="Informa só meses e velocidade — o Landwise projeta a data de cada unidade, nunca fraciona uma unidade nem excede o stock."
      >
        {!planoVendas.dataLancamentoComercial && (
          <p className="text-xs text-[#B96343] mb-3">
            Preenche a data de lançamento comercial no bloco acima para ver a projeção de datas.
          </p>
        )}
        {tipologiasNovas.map((t) => {
          const agenda = planoVendas.dataLancamentoComercial
            ? gerarAgendaAbsorcao(t.quantidade, t.mesesParaPrimeiraVenda, t.unidadesPorMes, planoVendas.dataLancamentoComercial)
            : [];
          const resumoAbsorcao = calcResumoAbsorcao(agenda, t.quantidade);
          return (
            <div key={t.id} className="border border-[#E3DACB] rounded-lg p-3 mb-3">
              <p className="text-xs font-semibold text-[#142B3A] mb-2">{t.nome}</p>
              <Row>
                <FieldGroup label="Meses após o lançamento para a primeira venda">
                  <input
                    type="number"
                    className="input-dark"
                    value={t.mesesParaPrimeiraVenda}
                    onChange={(e) => onAtualizarTipologiaNova(t.id, { mesesParaPrimeiraVenda: Number(e.target.value) })}
                  />
                </FieldGroup>
                <FieldGroup label="Unidades vendidas por mês">
                  <input
                    type="number"
                    step="0.1"
                    className="input-dark"
                    value={t.unidadesPorMes}
                    onChange={(e) => onAtualizarTipologiaNova(t.id, { unidadesPorMes: Number(e.target.value) })}
                  />
                </FieldGroup>
              </Row>
              {resumoAbsorcao.length > 0 && (
                <div className="mt-2 text-xs text-[#59636A]">
                  <p>
                    Última venda projetada: <strong className="text-[#142B3A]">{resumoAbsorcao[resumoAbsorcao.length - 1].mes}</strong> ·
                    Duração da absorção: <strong className="text-[#142B3A]">{resumoAbsorcao.length} meses</strong>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Card
        title="Evolução de preços"
        subtitle="Desconto no lançamento, aumentos por tempo ou por % vendido — geral ou por tipologia. Nunca altera unidades já vendidas, bloqueadas ou com override manual."
      >
        {regrasPreco.map((r) => (
          <div key={r.id} className="border border-[#E3DACB] rounded-lg p-3 mb-3">
            <Row>
              <FieldGroup label="Âmbito">
                <select
                  className="input-dark"
                  value={r.escopo.tipo === "tipologia" ? r.escopo.tipologiaId : "geral"}
                  onChange={(e) =>
                    onAtualizarRegraPreco(r.id, {
                      escopo: e.target.value === "geral" ? { tipo: "geral" } : { tipo: "tipologia", tipologiaId: e.target.value },
                    })
                  }
                >
                  <option value="geral">Geral (todas as tipologias)</option>
                  {tipologiasNovas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Gatilho">
                <select
                  className="input-dark"
                  value={r.gatilho}
                  onChange={(e) => onAtualizarRegraPreco(r.id, { gatilho: e.target.value as TipoGatilhoPreco })}
                >
                  <option value="meses_apos_lancamento">Meses após o lançamento</option>
                  <option value="data">Data específica</option>
                  <option value="pct_vendido_projeto">% do projeto vendido</option>
                  <option value="pct_vendido_tipologia">% da tipologia vendido</option>
                </select>
              </FieldGroup>
            </Row>
            <Row>
              {r.gatilho === "data" ? (
                <FieldGroup label="Data do gatilho">
                  <input
                    type="date"
                    className="input-dark"
                    value={r.valorGatilhoData ?? ""}
                    onChange={(e) => onAtualizarRegraPreco(r.id, { valorGatilhoData: e.target.value })}
                  />
                </FieldGroup>
              ) : r.gatilho === "meses_apos_lancamento" ? (
                <FieldGroup label="Meses após o lançamento">
                  <input
                    type="number"
                    className="input-dark"
                    value={r.valorGatilhoNumero ?? 0}
                    onChange={(e) => onAtualizarRegraPreco(r.id, { valorGatilhoNumero: Number(e.target.value) })}
                  />
                </FieldGroup>
              ) : (
                <FieldGroup label="% vendido (gatilho)">
                  <PercentInput value={r.valorGatilhoNumero ?? 0} onChange={(v) => onAtualizarRegraPreco(r.id, { valorGatilhoNumero: v })} />
                </FieldGroup>
              )}
              <FieldGroup label="Ajuste de preço (%)">
                <PercentInput value={r.ajustePct} onChange={(v) => onAtualizarRegraPreco(r.id, { ajustePct: v })} />
              </FieldGroup>
              <FieldGroup label="Modo">
                <select
                  className="input-dark"
                  value={r.modo}
                  onChange={(e) => onAtualizarRegraPreco(r.id, { modo: e.target.value as "cumulativo" | "substituicao" })}
                >
                  <option value="cumulativo">Cumulativo (soma-se às anteriores)</option>
                  <option value="substituicao">Substituição (ignora as anteriores)</option>
                </select>
              </FieldGroup>
            </Row>
            <div className="flex justify-end">
              <button onClick={() => onRemoverRegraPreco(r.id)} className="text-[#A13D2E] text-xs">
                Remover regra
              </button>
            </div>
          </div>
        ))}
        <div className="flex gap-3 items-center">
          <button onClick={onAdicionarRegraPreco} className="text-[#B96343] text-sm font-semibold">
            + Adicionar regra
          </button>
          {regrasPreco.length > 0 && (
            <button onClick={onAplicarEvolucaoPrecos} className="text-xs px-3 py-1.5 rounded-lg bg-[#142B3A] text-white font-semibold">
              Aplicar evolução de preços à Sales Table
            </button>
          )}
        </div>
      </Card>

      <Card
        title="Sales Table"
        subtitle="Uma linha por unidade real. É a única fonte do VGV — nenhum outro ecrã soma preços de tipologias para chegar a este valor."
      >
        {unidades.length === 0 && (
          <p className="text-xs text-[#8FA6AF] mb-3">
            Ainda sem unidades. Clica em &quot;Sincronizar Sales Table&quot; em cada tipologia acima para gerar as unidades.
          </p>
        )}
        {tipologiasNovas.map((tipologia) => {
          const unidadesDaTipologia = salesTableDaTipologia(unidades, tipologiasNovas, tipologia.id);
          if (unidadesDaTipologia.length === 0) return null;
          return (
            <div key={tipologia.id} className="mb-5">
              <p className="text-xs font-semibold text-[#142B3A] mb-2">{tipologia.nome}</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#59636A] uppercase">
                    <th className="pb-1 pr-2">Bloco</th>
                    <th className="pb-1 pr-2">Piso</th>
                    <th className="pb-1 pr-2">Área vendável</th>
                    <th className="pb-1 pr-2">Prémio/desconto</th>
                    <th className="pb-1 pr-2">Override manual</th>
                    <th className="pb-1 pr-2">Preço final</th>
                    <th className="pb-1 pr-2">Estado</th>
                    <th className="pb-1 pr-2">Data venda</th>
                    <th className="pb-1 pr-2">Escritura</th>
                  </tr>
                </thead>
                <tbody>
                  {unidadesDaTipologia.map((u) => {
                    const validacaoEscritura = validarEscrituraUnidade(u, u.precoFinal);
                    const valorEscritura = calcValorEscrituraUnidade(u, u.precoFinal);
                    const dataEscrituraDefeito = calcDataEscrituraDefeito(planoVendas.dataFimConstrucao, planoVendas.duracaoEscrituraAposObraMeses);
                    const expandida = unidadeExpandidaId === u.id;
                    return (
                    <Fragment key={u.id}>
                    <tr className="border-t border-[#E3DACB]">
                      <td className="py-1 pr-2">
                        <input className="input-dark w-20" value={u.bloco ?? ""} onChange={(e) => onAtualizarUnidade(u.id, { bloco: e.target.value })} />
                      </td>
                      <td className="py-1 pr-2">
                        <input className="input-dark w-16" value={u.piso ?? ""} onChange={(e) => onAtualizarUnidade(u.id, { piso: e.target.value })} />
                      </td>
                      <td className="py-1 pr-2 text-[#59636A]">{Math.round(u.areaVendavel)} m²</td>
                      <td className="py-1 pr-2">
                        <input
                          type="number"
                          className="input-dark w-24"
                          value={u.premioDescontoUnidade}
                          onChange={(e) => onAtualizarUnidade(u.id, { premioDescontoUnidade: Number(e.target.value) })}
                          disabled={u.estadoComercial !== "disponivel"}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="number"
                          className="input-dark w-24"
                          placeholder="—"
                          value={u.overrideManualValor ?? ""}
                          onChange={(e) => onAtualizarUnidade(u.id, { overrideManualValor: e.target.value ? Number(e.target.value) : null })}
                          disabled={u.estadoComercial !== "disponivel"}
                        />
                      </td>
                      <td className="py-1 pr-2 font-semibold text-[#142B3A]">€{Math.round(u.precoFinal).toLocaleString("pt-PT")}</td>
                      <td className="py-1 pr-2">
                        <span
                          className={
                            u.estadoComercial === "disponivel"
                              ? "text-[#59636A]"
                              : u.estadoComercial === "vendido" || u.estadoComercial === "escriturado"
                                ? "text-[#4E7A5C] font-semibold"
                                : "text-[#B96343]"
                          }
                        >
                          {u.estadoComercial}
                        </span>
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="date"
                          className="input-dark"
                          value={u.dataVenda ?? datasEfetivas.get(u.id) ?? ""}
                          onChange={(e) => onAtualizarUnidade(u.id, { dataVenda: e.target.value || null })}
                          disabled={u.estadoComercial === "escriturado"}
                        />
                        <span className="block text-[10px] text-[#59636A] mt-1">
                          {u.dataVenda ? "Override manual" : datasEfetivas.has(u.id) ? "Calculada pela curva" : "Preencha o lançamento e a curva"}
                        </span>
                      </td>
                      <td className="py-1 pr-2">
                        <button
                          onClick={() => setUnidadeExpandidaId(expandida ? null : u.id)}
                          className={`text-[10px] px-2 py-1 rounded-full border ${
                            validacaoEscritura.valido ? "border-[#E3DACB] text-[#59636A]" : "border-[#A13D2E] text-[#A13D2E] font-semibold"
                          } hover:border-[#B96343]`}
                        >
                          {expandida ? "Fechar ▲" : validacaoEscritura.valido ? "Detalhe ▾" : "Ver erro ▾"}
                        </button>
                      </td>
                    </tr>
                    {expandida && (
                      <tr className="bg-[#F5F0E6]">
                        <td colSpan={9} className="p-3">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <FieldGroup label="Sinal">
                              <NumeroInput value={u.sinalValor} onChange={(v) => onAtualizarUnidade(u.id, { sinalValor: v })} />
                            </FieldGroup>
                            <FieldGroup label="Reforços">
                              <NumeroInput value={u.reforcosValor} onChange={(v) => onAtualizarUnidade(u.id, { reforcosValor: v })} />
                            </FieldGroup>
                            <FieldGroup label="Escritura (residual)">
                              <input className="input-dark" disabled value={`€${Math.round(valorEscritura).toLocaleString("pt-PT")}`} />
                            </FieldGroup>
                            <FieldGroup label="Data escritura">
                              <input
                                type="date"
                                className="input-dark"
                                value={u.dataEscritura ?? dataEscrituraDefeito ?? ""}
                                onChange={(e) => onAtualizarUnidade(u.id, { dataEscritura: e.target.value || null })}
                              />
                            </FieldGroup>
                          </div>
                          <p className={`text-[10px] mt-2 ${validacaoEscritura.valido ? "text-[#59636A]" : "text-[#A13D2E] font-semibold"}`}>
                            {!validacaoEscritura.valido
                              ? validacaoEscritura.erro
                              : u.dataEscritura
                                ? "Data de escritura: override manual."
                                : dataEscrituraDefeito
                                  ? "Data de escritura: fim de obra + prazo por defeito."
                                  : "Preencha o fim de obra para sugerir a data de escritura."}
                          </p>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
        {unidades.length > 0 && (
          <div className="pt-4 border-t border-[#E3DACB] text-sm">
            <span className="text-xs text-[#59636A] block">VGV Bruto (fonte única — soma real da Sales Table)</span>
            <span className="font-bold text-lg text-[#142B3A]">
              €{Math.round(calcVgvBruto(resolverSalesTable(unidades, tipologiasNovas))).toLocaleString("pt-PT")}
            </span>
          </div>
        )}
      </Card>
    </>
  );
}

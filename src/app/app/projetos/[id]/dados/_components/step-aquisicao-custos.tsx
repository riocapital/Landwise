"use client";

// Extraído de page.tsx (achado S1 da auditoria de 2026-07-31) — Etapa 3 do wizard.

import { useState } from "react";
import { type ProjectInputs } from "@/lib/calc/viabilidade";
import { calcResumoPrograma, type Typology } from "@/lib/calc/areas";
import { resolverCustos, agregarCustos, type LinhaCusto, type GrupoCusto, type ContextoCusto } from "@/lib/calc/custos";
import { CUSTOS_PADRAO } from "@/lib/supabase/project-defaults";
import { calcDataFinal } from "@/lib/calc/calendario";
import { calcularImt, FONTE_TABELAS_IMT, type TipoImovelImt } from "@/lib/calc/imt";
import type { IdentificacaoEstruturada } from "../page";
import { Card, Row, FieldGroup, NumeroInput, PercentInput } from "./ui";
import { adicionarMesesData, diferencaMesesDatas } from "./helpers";

const GRUPOS_CUSTO: { grupo: GrupoCusto; titulo: string; sugestoes: string[] }[] = [
  { grupo: "aquisicao", titulo: "Aquisição", sugestoes: [] },
  { grupo: "hard_cost", titulo: "Hard costs", sugestoes: ["Jardinagem e exteriores", "Demolição", "Infraestruturas", "Ligações", "Equipamentos"] },
  { grupo: "soft_cost", titulo: "Soft costs", sugestoes: ["Especialidades", "Seguros"] },
  { grupo: "outro", titulo: "Outros custos", sugestoes: ["Branding", "Outro"] },
];

const TIPOS_CALCULO_CUSTO: { value: LinhaCusto["tipoCalculo"]; label: string }[] = [
  { value: "valor_fixo", label: "Valor fixo (€)" },
  { value: "valor_mensal", label: "Valor mensal (€/mês)" },
  { value: "percentagem_aquisicao", label: "% da aquisição" },
  { value: "percentagem_hard_costs", label: "% dos hard costs" },
  { value: "percentagem_capex", label: "% do capex" },
  { value: "percentagem_custo_total", label: "% do custo total" },
  { value: "eur_m2_abc_acima", label: "€/m² de ABC acima do solo" },
  { value: "eur_m2_abc_abaixo", label: "€/m² de ABC abaixo do solo" },
  { value: "eur_m2_abd", label: "€/m² de ABD (área dependente)" },
  { value: "eur_m2_abc_principal", label: "€/m² de ABC (sem ABD)" },
  { value: "eur_m2_abc_total", label: "€/m² de ABC Total (com ABD)" },
  { value: "eur_unidade", label: "€/unidade" },
];

const PERFIS_DESEMBOLSO: { value: LinhaCusto["perfilDesembolso"]; label: string }[] = [
  { value: "unico_inicio", label: "Único no início" },
  { value: "unico_fim", label: "Único no fim" },
  { value: "linear", label: "Linear" },
  { value: "curva_s", label: "Curva S" },
  { value: "front_loaded", label: "Front-loaded" },
  { value: "back_loaded", label: "Back-loaded" },
];

const NOMES_CUSTOS_FIXOS = new Set(CUSTOS_PADRAO.map((c) => c.nome));

export function StepAquisicaoCustos({
  custosNovos,
  identificacao,
  tipologiasNovas,
  inputs,
  updateInput,
  onAdicionarCusto,
  onAtualizarCusto,
  onRemoverCusto,
}: {
  custosNovos: LinhaCusto[];
  identificacao: IdentificacaoEstruturada;
  tipologiasNovas: Typology[];
  inputs: ProjectInputs;
  updateInput: <K extends keyof ProjectInputs>(key: K, value: ProjectInputs[K]) => void;
  onAdicionarCusto: (grupo: GrupoCusto, nome: string) => void;
  onAtualizarCusto: (id: string, patch: Partial<LinhaCusto>) => void;
  onRemoverCusto: (id: string) => void;
}) {
  const resumoProgramaLocal = calcResumoPrograma(tipologiasNovas, identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo);
  const contexto: ContextoCusto = {
    valorAquisicao: inputs.custoTerreno || 0,
    abcAcimaSolo: identificacao.abcAcimaSolo ?? 0,
    abcAbaixoSolo: identificacao.abcAbaixoSolo ?? 0,
    abdTotal: resumoProgramaLocal.areaDependenteTotal,
    numeroUnidades: tipologiasNovas.reduce((soma, t) => soma + t.quantidade, 0),
  };
  const resolvidas = resolverCustos(custosNovos, contexto);
  const resumo = agregarCustos(resolvidas);
  const custoPorNome = (nome: string) => custosNovos.find((c) => c.nome === nome);
  const reforcos = custosNovos.filter((c) => c.grupo === "aquisicao" && c.nome.startsWith("Reforço da aquisição"));
  const somaReforcos = reforcos.reduce((soma, c) => soma + c.valorInput, 0);
  const sinalValor = Math.max(0, (inputs.custoTerreno || 0) * (inputs.sinalAquisicaoPct || 0));
  const valorEscritura = Math.max(0, (inputs.custoTerreno || 0) - sinalValor - somaReforcos);
  const dataEscrituraCalculada = inputs.dataEscrituraAquisicao || adicionarMesesData(inputs.dataSinalAquisicao, inputs.duracaoAteEscrituraMeses);

  function atualizarLinha(nome: string, patch: Partial<LinhaCusto>) {
    const c = custoPorNome(nome);
    if (c) onAtualizarCusto(c.id, patch);
  }

  function sincronizarAquisicao(patchInputs: Partial<ProjectInputs>) {
    const proximo = { ...inputs, ...patchInputs };
    const sinal = Math.max(0, (proximo.custoTerreno || 0) * (proximo.sinalAquisicaoPct || 0));
    const dataEscritura = proximo.dataEscrituraAquisicao || adicionarMesesData(proximo.dataSinalAquisicao, proximo.duracaoAteEscrituraMeses);
    const residual = Math.max(0, (proximo.custoTerreno || 0) - sinal - somaReforcos);
    atualizarLinha("Sinal da aquisição", {
      valorInput: sinal,
      dataInicial: proximo.dataSinalAquisicao || null,
      dataFinal: proximo.dataSinalAquisicao || null,
      duracaoMeses: 1,
      perfilDesembolso: "unico_inicio",
    });
    atualizarLinha("Escritura da aquisição", {
      valorInput: residual,
      dataInicial: dataEscritura || null,
      dataFinal: dataEscritura || null,
      duracaoMeses: 1,
      perfilDesembolso: "unico_inicio",
    });
    ["Notário", "Registos", "IMT", "Imposto do selo", "Comissão de aquisição", "Outros custos de aquisição"].forEach((nome) => {
      const linha = custoPorNome(nome);
      if (linha && !linha.dataInicial) {
        onAtualizarCusto(linha.id, { dataInicial: dataEscritura || null, dataFinal: dataEscritura || null, duracaoMeses: 1, perfilDesembolso: "unico_inicio" });
      }
    });
  }

  function alterarInput<K extends keyof ProjectInputs>(key: K, value: ProjectInputs[K]) {
    updateInput(key, value);
    sincronizarAquisicao({ [key]: value } as Partial<ProjectInputs>);
  }

  function handleData(custo: LinhaCusto, dataInicial: string, duracaoMeses: number) {
    const dataFinal = dataInicial && duracaoMeses > 0 ? calcDataFinal(dataInicial, duracaoMeses) : null;
    onAtualizarCusto(custo.id, { dataInicial: dataInicial || null, duracaoMeses: duracaoMeses || null, dataFinal });
  }

  const [imtTipoImovel, setImtTipoImovel] = useState<TipoImovelImt>("outro_urbano_ou_terreno_construcao");
  const [imtRegiaoAutonoma, setImtRegiaoAutonoma] = useState(false);
  const [imtJovem, setImtJovem] = useState(false);
  const [imtOffshore, setImtOffshore] = useState(false);
  const imtCalculado = calcularImt({ tipoImovel: imtTipoImovel, valor: inputs.custoTerreno || 0, regiaoAutonoma: imtRegiaoAutonoma, jovemAte35: imtJovem, offshore: imtOffshore });

  function aplicarImtCalculado() {
    atualizarLinha("IMT", { valorInput: Math.round(imtCalculado.imt * 100) / 100 });
    atualizarLinha("Imposto do selo", { valorInput: Math.round(imtCalculado.impostoSelo * 100) / 100 });
  }

  function renderLinhaAquisicaoCompacta(c: LinhaCusto) {
    return (
      <div key={c.id} className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] gap-3 items-end border-b border-[#E3DACB] py-3 last:border-b-0">
        <FieldGroup label="Custo">
          <input className="input-dark" value={c.nome} disabled />
        </FieldGroup>
        <FieldGroup label="Valor (€)">
          <NumeroInput
            value={c.valorInput}
            onChange={(v) => onAtualizarCusto(c.id, { valorInput: v, tipoCalculo: "valor_fixo", taxaIva: null, ivaRecuperavelPct: 0 })}
          />
        </FieldGroup>
        <FieldGroup label="Data">
          <input
            type="date"
            className="input-dark"
            value={c.dataInicial ?? ""}
            onChange={(e) =>
              onAtualizarCusto(c.id, {
                dataInicial: e.target.value || null,
                dataFinal: e.target.value || null,
                duracaoMeses: 1,
                perfilDesembolso: "unico_inicio",
              })
            }
          />
        </FieldGroup>
      </div>
    );
  }

  function renderLinhaCusto(c: LinhaCusto, opcoes: { mostrarIva?: boolean } = {}) {
    const fixa = NOMES_CUSTOS_FIXOS.has(c.nome);
    const mensal = c.tipoCalculo === "valor_mensal";
    const mostrarIva = opcoes.mostrarIva ?? true;
    return (
      <div key={c.id} className="border border-[#E3DACB] rounded-lg p-3 mb-3">
        <Row>
          <FieldGroup label="Nome">
            <input className="input-dark" value={c.nome} disabled={fixa} onChange={(e) => onAtualizarCusto(c.id, { nome: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Tipo de cálculo">
            <select
              className="input-dark"
              value={c.tipoCalculo}
              disabled={["Construção acima do solo", "Construção abaixo do solo", "Construção dependente", "Fiscalização de obra"].includes(c.nome)}
              onChange={(e) => onAtualizarCusto(c.id, { tipoCalculo: e.target.value as LinhaCusto["tipoCalculo"] })}
            >
              {TIPOS_CALCULO_CUSTO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </FieldGroup>
          <FieldGroup label={mensal ? "Valor por mês" : c.tipoCalculo.startsWith("percentagem") ? "Percentagem" : "Valor"}>
            {c.tipoCalculo.startsWith("percentagem") ? (
              <PercentInput value={c.valorInput} onChange={(v) => onAtualizarCusto(c.id, { valorInput: v })} />
            ) : (
              <NumeroInput value={c.valorInput} onChange={(v) => onAtualizarCusto(c.id, { valorInput: v })} />
            )}
          </FieldGroup>
        </Row>
        <Row>
          {mostrarIva && (
            <>
              <FieldGroup label="Taxa de IVA">
                <select className="input-dark" value={c.taxaIva ?? ""} onChange={(e) => onAtualizarCusto(c.id, { taxaIva: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Sem IVA</option><option value={0.06}>6%</option><option value={0.13}>13%</option><option value={0.23}>23%</option>
                </select>
              </FieldGroup>
              <FieldGroup label="% de IVA recuperável"><PercentInput value={c.ivaRecuperavelPct} onChange={(v) => onAtualizarCusto(c.id, { ivaRecuperavelPct: v })} /></FieldGroup>
            </>
          )}
          <FieldGroup label="Perfil de desembolso">
            <select className="input-dark" value={c.perfilDesembolso} onChange={(e) => onAtualizarCusto(c.id, { perfilDesembolso: e.target.value as LinhaCusto["perfilDesembolso"] })}>
              {PERFIS_DESEMBOLSO.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Data inicial"><input type="date" className="input-dark" value={c.dataInicial ?? ""} disabled={c.nome === "Fiscalização de obra"} onChange={(e) => handleData(c, e.target.value, c.duracaoMeses ?? 1)} /></FieldGroup>
          <FieldGroup label="Duração (meses)"><input type="number" className="input-dark" value={c.duracaoMeses ?? ""} disabled={c.nome === "Fiscalização de obra"} onChange={(e) => handleData(c, c.dataInicial ?? "", Number(e.target.value))} /></FieldGroup>
          <FieldGroup label="Data final (calculada)"><input type="date" className="input-dark" value={c.dataFinal ?? ""} disabled /></FieldGroup>
        </Row>
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-[#59636A]">Valor resolvido: €{Math.round(resolvidas.find((r) => r.id === c.id)?.valorResolvido ?? 0).toLocaleString("pt-PT")}</span>
          {!fixa && <button onClick={() => onRemoverCusto(c.id)} className="text-[#A13D2E] text-xs">Remover</button>}
        </div>
      </div>
    );
  }

  return (
    <>
      <Card title="Aquisição" subtitle={`Subtotal: €${Math.round(resumo.totalAquisicao).toLocaleString("pt-PT")}. A aquisição é preenchida aqui e não na Identificação.`}>
        <Row>
          <FieldGroup label="Preço total"><NumeroInput value={inputs.custoTerreno || 0} onChange={(v) => alterarInput("custoTerreno", v)} /></FieldGroup>
          <FieldGroup label="Sinal (%)"><PercentInput value={inputs.sinalAquisicaoPct} onChange={(v) => alterarInput("sinalAquisicaoPct", v)} /></FieldGroup>
          <FieldGroup label="Valor do sinal"><input className="input-dark" value={`€${Math.round(sinalValor).toLocaleString("pt-PT")}`} disabled /></FieldGroup>
          <FieldGroup label="Data do sinal"><input type="date" className="input-dark" value={inputs.dataSinalAquisicao} onChange={(e) => alterarInput("dataSinalAquisicao", e.target.value)} /></FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Tempo até à escritura (meses)"><input type="number" className="input-dark" value={inputs.duracaoAteEscrituraMeses} onChange={(e) => { const meses = Number(e.target.value); updateInput("dataEscrituraAquisicao", ""); alterarInput("duracaoAteEscrituraMeses", meses); }} /></FieldGroup>
          <FieldGroup label="Data da escritura">
            <input type="date" className="input-dark" value={dataEscrituraCalculada} onChange={(e) => { const data = e.target.value; updateInput("dataEscrituraAquisicao", data); updateInput("duracaoAteEscrituraMeses", diferencaMesesDatas(inputs.dataSinalAquisicao, data)); sincronizarAquisicao({ dataEscrituraAquisicao: data, duracaoAteEscrituraMeses: diferencaMesesDatas(inputs.dataSinalAquisicao, data) }); }} />
          </FieldGroup>
          <FieldGroup label="Reforços"><input className="input-dark" value={`€${Math.round(somaReforcos).toLocaleString("pt-PT")}`} disabled /></FieldGroup>
          <FieldGroup label="Valor residual da escritura"><input className="input-dark" value={`€${Math.round(valorEscritura).toLocaleString("pt-PT")}`} disabled /></FieldGroup>
        </Row>
        {sinalValor + somaReforcos > (inputs.custoTerreno || 0) && <p className="text-xs text-[#A13D2E]">Sinal e reforços não podem ultrapassar o preço de aquisição.</p>}

        {reforcos.map((c, idx) => (
          <div key={c.id} className="grid grid-cols-4 gap-3 border-t border-[#E3DACB] pt-3 mt-3">
            <FieldGroup label={`Reforço ${idx + 1} (€)`}><NumeroInput value={c.valorInput} onChange={(novoValor) => {
              onAtualizarCusto(c.id, { valorInput: novoValor });
              atualizarLinha("Escritura da aquisição", { valorInput: Math.max(0, (inputs.custoTerreno || 0) - sinalValor - (somaReforcos - c.valorInput + novoValor)) });
            }} /></FieldGroup>
            <FieldGroup label="Data"><input type="date" className="input-dark" value={c.dataInicial ?? ""} onChange={(e) => onAtualizarCusto(c.id, { dataInicial: e.target.value || null, dataFinal: e.target.value || null, duracaoMeses: 1, perfilDesembolso: "unico_inicio" })} /></FieldGroup>
            <FieldGroup label="% do preço"><input className="input-dark" value={`${inputs.custoTerreno > 0 ? ((c.valorInput / inputs.custoTerreno) * 100).toFixed(2) : "0.00"}%`} disabled /></FieldGroup>
            <div className="flex items-end"><button className="text-[#A13D2E] text-xs pb-2" onClick={() => {
              atualizarLinha("Escritura da aquisição", { valorInput: Math.max(0, (inputs.custoTerreno || 0) - sinalValor - (somaReforcos - c.valorInput)) });
              onRemoverCusto(c.id);
            }}>Remover reforço</button></div>
          </div>
        ))}
        <button onClick={() => onAdicionarCusto("aquisicao", `Reforço da aquisição ${reforcos.length + 1}`)} className="text-[#B96343] text-sm font-semibold mt-3">+ Adicionar reforço</button>

        <details className="mt-5 pt-4 border-t border-[#E3DACB]">
          <summary className="cursor-pointer text-xs font-semibold text-[#142B3A]">Calcular IMT e Imposto do Selo assistidamente</summary>
          <div className="mt-3">
            <Row>
              <FieldGroup label="Tipo de imóvel">
                <select className="input-dark" value={imtTipoImovel} onChange={(e) => setImtTipoImovel(e.target.value as TipoImovelImt)}>
                  <option value="outro_urbano_ou_terreno_construcao">Terreno para construção / outro prédio urbano</option>
                  <option value="habitacao_propria_permanente">Habitação própria e permanente</option>
                  <option value="habitacao_secundaria_ou_arrendamento">Habitação secundária / arrendamento</option>
                  <option value="predio_rustico">Prédio rústico</option>
                </select>
              </FieldGroup>
              <FieldGroup label="Região">
                <select className="input-dark" value={imtRegiaoAutonoma ? "ra" : "continente"} onChange={(e) => setImtRegiaoAutonoma(e.target.value === "ra")}>
                  <option value="continente">Portugal Continental</option>
                  <option value="ra">Região Autónoma (Açores/Madeira)</option>
                </select>
              </FieldGroup>
            </Row>
            <Row>
              <label className="flex items-center gap-2 text-xs text-[#59636A]">
                <input
                  type="checkbox"
                  checked={imtJovem}
                  disabled={imtTipoImovel !== "habitacao_propria_permanente"}
                  onChange={(e) => setImtJovem(e.target.checked)}
                />
                Adquirente jovem até 35 anos (só HPP)
              </label>
              <label className="flex items-center gap-2 text-xs text-[#59636A]">
                <input type="checkbox" checked={imtOffshore} onChange={(e) => setImtOffshore(e.target.checked)} />
                Adquirente offshore (paraíso fiscal — taxa agravada de 10%)
              </label>
            </Row>
            <div className="text-xs text-[#142B3A] mt-2 space-y-1">
              <p>{imtCalculado.escalaoDescricao}</p>
              <p>IMT: €{imtCalculado.imt.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} · Imposto do selo (0,8%): €{imtCalculado.impostoSelo.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} · Total: €{imtCalculado.total.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-[#59636A]">Fonte: {FONTE_TABELAS_IMT}. Sugestão calculada sobre o preço de aquisição introduzido acima — confirma sempre o VPT antes da escritura, pois o IMT incide sobre o maior dos dois valores.</p>
            </div>
            <button onClick={aplicarImtCalculado} className="text-xs px-3 py-1.5 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343] mt-2">
              Aplicar às linhas &quot;IMT&quot; e &quot;Imposto do selo&quot;
            </button>
          </div>
        </details>

        <div className="mt-5 pt-4 border-t border-[#E3DACB]">
          <p className="text-xs font-semibold text-[#142B3A] mb-3">Custos de aquisição</p>
          {custosNovos
            .filter((c) => c.grupo === "aquisicao" && !["Sinal da aquisição", "Escritura da aquisição"].includes(c.nome) && !c.nome.startsWith("Reforço da aquisição"))
            .map(renderLinhaAquisicaoCompacta)}
        </div>
      </Card>

      {GRUPOS_CUSTO.filter((g) => g.grupo !== "aquisicao").map(({ grupo, titulo, sugestoes }) => {
        const linhasDoGrupo = custosNovos.filter((c) => c.grupo === grupo);
        const subtotal = grupo === "hard_cost" ? resumo.totalHardCosts : grupo === "soft_cost" ? resumo.totalSoftCosts : resumo.totalOutros;
        const sugestoesOpcionais = sugestoes.filter((nome) => !NOMES_CUSTOS_FIXOS.has(nome) && !linhasDoGrupo.some((c) => c.nome === nome));
        return (
          <Card key={grupo} title={titulo} subtitle={`Subtotal: €${Math.round(subtotal).toLocaleString("pt-PT")}`}>
            {linhasDoGrupo.map((c) => renderLinhaCusto(c))}
            <div className="flex flex-wrap gap-2 mt-2">
              {sugestoesOpcionais.map((nome) => <button key={nome} onClick={() => onAdicionarCusto(grupo, nome)} className="text-xs px-2.5 py-1 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343]">+ {nome}</button>)}
              <button onClick={() => onAdicionarCusto(grupo, "Nova linha")} className="text-xs px-2.5 py-1 rounded-full border border-dashed border-[#B96343] text-[#B96343]">+ Linha personalizada</button>
            </div>
          </Card>
        );
      })}

      <Card title="Resumo de custos e IVA">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-xs text-[#59636A] block">Custo total</span><span className="font-semibold text-[#142B3A]">€{Math.round(resumo.custoTotal).toLocaleString("pt-PT")}</span></div>
          <div><span className="text-xs text-[#59636A] block">IVA suportado</span><span className="font-semibold text-[#142B3A]">€{Math.round(resumo.ivaSuportadoTotal).toLocaleString("pt-PT")}</span></div>
          <div><span className="text-xs text-[#59636A] block">IVA recuperável</span><span className="font-semibold text-[#142B3A]">€{Math.round(resumo.ivaRecuperavelTotal).toLocaleString("pt-PT")}</span></div>
          <div><span className="text-xs text-[#59636A] block">IVA não recuperável</span><span className="font-semibold text-[#142B3A]">€{Math.round(resumo.ivaNaoRecuperavelTotal).toLocaleString("pt-PT")}</span></div>
        </div>
      </Card>
    </>
  );
}

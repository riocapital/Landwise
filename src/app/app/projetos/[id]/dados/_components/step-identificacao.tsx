"use client";

// Extraído de page.tsx (achado S1 da auditoria de 2026-07-31) — Etapa 1 do wizard.

import { TIPOS_PROJETO } from "@/lib/project-types";
import { type ProjectInputs } from "@/lib/calc/viabilidade";
import { calcAbcTotalProgramado, calcEficiencia, calcDivergenciaAbp, type Typology } from "@/lib/calc/areas";
import type { IdentificacaoEstruturada } from "../page";
import { Card, Row, FieldGroup, CheckboxIdent } from "./ui";

export function StepIdentificacao({
  nome,
  setNome,
  tipoProjeto,
  setTipoProjeto,
  inputs,
  updateInput,
  identificacao,
  updateIdentificacao,
  aLoadearCp,
  erroCp,
  opcoesCp,
  onCodigoPostalBlur,
  onEscolherOpcaoCp,
  tipologiasNovas,
}: {
  nome: string;
  setNome: (v: string) => void;
  tipoProjeto: string;
  setTipoProjeto: (v: string) => void;
  inputs: ProjectInputs;
  updateInput: <K extends keyof ProjectInputs>(k: K, v: ProjectInputs[K]) => void;
  identificacao: IdentificacaoEstruturada;
  updateIdentificacao: <K extends keyof IdentificacaoEstruturada>(k: K, v: IdentificacaoEstruturada[K]) => void;
  aLoadearCp: boolean;
  erroCp: string | null;
  opcoesCp: { rua: string | null; localidade: string | null; freguesia: string | null; concelho: string | null; distrito: string | null; latitude: number | null; longitude: number | null }[];
  onCodigoPostalBlur: () => void;
  onEscolherOpcaoCp: (opcao: { rua: string | null; localidade: string | null; freguesia: string | null; concelho: string | null; distrito: string | null; latitude: number | null; longitude: number | null }) => void;
  tipologiasNovas: Typology[];
}) {
  const abcTotalProgramado = calcAbcTotalProgramado(identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo, tipologiasNovas);
  const abpProgramada = tipologiasNovas.reduce((s, t) => s + t.quantidade * t.abpUnidade, 0);
  const eficiencia = calcEficiencia(abpProgramada, abcTotalProgramado);
  const divergencia =
    identificacao.abpEstimada && tipologiasNovas.length > 0
      ? calcDivergenciaAbp(identificacao.abpEstimada, tipologiasNovas)
      : null;

  return (
    <>
      <Card title="Identificação do ativo">
        <Row>
          <FieldGroup label="Nome do projeto">
            <input className="input-dark" value={nome} onChange={(e) => setNome(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Tipo de projeto">
            <select className="input-dark" value={tipoProjeto} onChange={(e) => setTipoProjeto(e.target.value)}>
              {TIPOS_PROJETO.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Área do lote (m²)">
            <input
              type="number"
              className="input-dark"
              value={inputs.areaLote ?? ""}
              onChange={(e) => updateInput("areaLote", e.target.value ? Number(e.target.value) : null)}
            />
          </FieldGroup>
        </Row>
      </Card>

      <Card
        title="Localização"
        subtitle="Introduza o código postal — a rua, freguesia, concelho e distrito são sugeridos automaticamente, mas continuam editáveis."
      >
        <Row>
          <FieldGroup label="Código postal">
            <input
              className="input-dark"
              placeholder="0000-000"
              value={identificacao.codigoPostal}
              onChange={(e) => updateIdentificacao("codigoPostal", e.target.value)}
              onBlur={onCodigoPostalBlur}
            />
          </FieldGroup>
          <FieldGroup label="Rua">
            <input className="input-dark" value={identificacao.rua} onChange={(e) => updateIdentificacao("rua", e.target.value)} />
          </FieldGroup>
        </Row>
        {aLoadearCp && <p className="text-xs text-[#8FA6AF] mb-3">A procurar o código postal…</p>}
        {erroCp && <p className="text-xs text-[#A13D2E] mb-3">{erroCp}</p>}
        {opcoesCp.length > 1 && (
          <div className="mb-4">
            <p className="text-xs text-[#59636A] mb-2">Este código postal tem várias moradas — escolha uma:</p>
            {opcoesCp.map((o, i) => (
              <button
                key={i}
                onClick={() => onEscolherOpcaoCp(o)}
                className="block w-full text-left text-sm px-3 py-2 rounded-lg border border-[#E3DACB] hover:border-[#B96343] mb-1.5"
              >
                {o.rua || "Rua não identificada"} — {o.freguesia}, {o.concelho}
              </button>
            ))}
          </div>
        )}
        <Row>
          <FieldGroup label="Freguesia">
            <input
              className="input-dark"
              value={identificacao.freguesia}
              onChange={(e) => updateIdentificacao("freguesia", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Concelho">
            <input
              className="input-dark"
              value={identificacao.concelho}
              onChange={(e) => updateIdentificacao("concelho", e.target.value)}
            />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Distrito">
            <input
              className="input-dark"
              value={identificacao.distrito}
              onChange={(e) => updateIdentificacao("distrito", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Localidade">
            <input
              className="input-dark"
              value={identificacao.localidade}
              onChange={(e) => updateIdentificacao("localidade", e.target.value)}
            />
          </FieldGroup>
        </Row>
      </Card>

      <Card
        title="Áreas do projeto"
        subtitle="ABC Total e eficiência são calculados automaticamente a partir destes valores e do programa de tipologias."
      >
        <Row>
          <FieldGroup label="ABC acima do solo (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.abcAcimaSolo ?? ""}
              onChange={(e) => updateIdentificacao("abcAcimaSolo", e.target.value ? Number(e.target.value) : null)}
            />
          </FieldGroup>
          <FieldGroup label="ABC abaixo do solo (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.abcAbaixoSolo ?? ""}
              onChange={(e) => updateIdentificacao("abcAbaixoSolo", e.target.value ? Number(e.target.value) : null)}
            />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Área dependente estimada (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.areaDependenteEstimada ?? ""}
              onChange={(e) => updateIdentificacao("areaDependenteEstimada", e.target.value ? Number(e.target.value) : null)}
            />
          </FieldGroup>
          <FieldGroup label="ABP estimada (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.abpEstimada ?? ""}
              onChange={(e) => updateIdentificacao("abpEstimada", e.target.value ? Number(e.target.value) : null)}
            />
          </FieldGroup>
        </Row>
        <div className="flex gap-6 mt-2 text-sm">
          <div>
            <span className="text-xs text-[#59636A] block">ABC Total programado</span>
            <span className="font-semibold text-[#142B3A]">{abcTotalProgramado ? `${Math.round(abcTotalProgramado)} m²` : "—"}</span>
          </div>
          <div>
            <span className="text-xs text-[#59636A] block">Eficiência</span>
            <span className="font-semibold text-[#142B3A]">{eficiencia !== null ? `${Math.round(eficiencia * 100)}%` : "—"}</span>
          </div>
        </div>
        {divergencia && Math.abs(divergencia.diferencaAbsoluta) > 1 && (
          <p className="text-xs text-[#B96343] mt-3">
            Existe uma diferença entre a ABP estimada e a ABP calculada pelo programa ({Math.round(divergencia.abpCalculada)} m²,{" "}
            {divergencia.diferencaPercentual !== null ? `${Math.round(divergencia.diferencaPercentual * 100)}%` : ""} de diferença).
            Ajuste a ABP estimada ou reveja as tipologias na etapa seguinte.
          </p>
        )}
      </Card>

      <Card title="Características">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <FieldGroup label="Número de garagens/estacionamentos">
              <input
                type="number"
                min={0}
                className="input-dark mb-3"
                value={identificacao.numEstacionamentos}
                onChange={(e) => {
                  const n = Math.max(0, Number(e.target.value) || 0);
                  updateIdentificacao("numEstacionamentos", n);
                  updateIdentificacao("temGaragem", n > 0);
                }}
              />
            </FieldGroup>
          </div>
          <div>
            <FieldGroup label="Número de elevadores">
              <input
                type="number"
                min={0}
                className="input-dark mb-3"
                value={identificacao.numElevadores}
                onChange={(e) => {
                  const n = Math.max(0, Number(e.target.value) || 0);
                  updateIdentificacao("numElevadores", n);
                  updateIdentificacao("temElevador", n > 0);
                }}
              />
            </FieldGroup>
          </div>
          <CheckboxIdent
            label="Possui jardim ou áreas exteriores"
            checked={identificacao.temJardimExterior}
            onChange={(v) => updateIdentificacao("temJardimExterior", v)}
          />
          <CheckboxIdent label="Imóvel ocupado" checked={identificacao.imovelOcupado} onChange={(v) => updateIdentificacao("imovelOcupado", v)} />
        </div>
        <p className="text-xs text-[#8FA6AF] mt-2">
          Demolição é configurada como custo opcional. O enquadramento do licenciamento decorre do tipo de projeto.
        </p>
      </Card>
    </>
  );
}

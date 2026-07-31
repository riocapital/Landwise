"use client";

// Extraído de page.tsx (achado S1 da auditoria de 2026-07-31) — Etapa 7 do wizard.

import type { LinhaCusto } from "@/lib/calc/custos";
import type { PlanoVendas } from "@/lib/calc/vendas";
import type { UnidadeVenda } from "@/lib/calc/sales-table";
import type { Typology } from "@/lib/calc/areas";
import { calcularCashFlow } from "@/lib/calc/cashflow";
import { calcularDatasEfetivas } from "@/lib/calc/sales-curve";
import { montarCalendarioAutomatico, type EventoTipologiaVendas, type EventoFinanciamentoMensal } from "@/lib/calc/calendario-automatico";
import { Card } from "./ui";

export function StepCalendario({
  custosNovos,
  planoVendas,
  unidades,
  tipologiasNovas,
  resultado,
}: {
  custosNovos: LinhaCusto[];
  planoVendas: PlanoVendas;
  unidades: UnidadeVenda[];
  tipologiasNovas: Typology[];
  resultado: ReturnType<typeof calcularCashFlow> | null;
}) {
  const datasEfetivas = calcularDatasEfetivas(
    unidades.map((u) => ({ id: u.id, tipologiaId: u.tipologiaId, ordem: u.ordem, dataVenda: u.dataVenda, estadoComercial: u.estadoComercial })),
    tipologiasNovas.map((t) => ({ id: t.id, quantidade: t.quantidade, mesesParaPrimeiraVenda: t.mesesParaPrimeiraVenda, unidadesPorMes: t.unidadesPorMes })),
    planoVendas.dataLancamentoComercial
  );

  const porTipologia: EventoTipologiaVendas[] = tipologiasNovas.map((t) => {
    const datasDaTipologia = unidades
      .filter((u) => u.tipologiaId === t.id)
      .map((u) => datasEfetivas.get(u.id))
      .filter((d): d is string => Boolean(d))
      .sort();
    return {
      tipologiaId: t.id,
      nome: t.nome,
      primeiraData: datasDaTipologia[0] ?? null,
      ultimaData: datasDaTipologia[datasDaTipologia.length - 1] ?? null,
    };
  });

  const eventosFinanciamento: EventoFinanciamentoMensal[] =
    resultado?.linhas.map((l) => ({ mes: l.mes, drawdown: l.drawdown, amortizacao: l.amortizacao, saldoDivida: l.saldoDivida })) ?? [];

  const { grupos, dataInicial, dataFinal } = montarCalendarioAutomatico(
    custosNovos,
    { dataLancamentoComercial: planoVendas.dataLancamentoComercial || null, dataEscritura: planoVendas.dataEscritura || null, porTipologia },
    eventosFinanciamento
  );

  const todasAsLinhas = grupos.flatMap((g) => g.linhas);
  const datasValidas = todasAsLinhas
    .flatMap((l) => [new Date(`${l.inicio}T00:00:00Z`).getTime(), new Date(`${l.fim}T00:00:00Z`).getTime()])
    .filter((v) => Number.isFinite(v));
  const dataMinMs = datasValidas.length > 0 ? Math.min(...datasValidas) : 0;
  const dataMaxMs = datasValidas.length > 0 ? Math.max(...datasValidas) : 1;
  const totalMs = dataMaxMs - dataMinMs || 1;

  return (
    <>
      <Card
        title="Calendário do projeto"
        subtitle="Gerado automaticamente a partir da Aquisição, Custos, Plano de Vendas e Financiamento — para mudar uma data, edita-a na etapa de origem. Este ecrã nunca guarda datas próprias."
      >
        {grupos.length === 0 && (
          <p className="text-xs text-[#8FA6AF]">
            Ainda não há datas suficientes preenchidas em Aquisição, Custos, Plano de Vendas ou Financiamento para gerar o calendário.
          </p>
        )}
        {(dataInicial || dataFinal) && (
          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <span className="text-xs text-[#59636A] block">Data inicial (primeiro fluxo financeiro)</span>
              <span className="font-semibold text-[#142B3A]">{dataInicial ?? "—"}</span>
            </div>
            <div>
              <span className="text-xs text-[#59636A] block">Data final (último evento ativo)</span>
              <span className="font-semibold text-[#142B3A]">{dataFinal ?? "—"}</span>
            </div>
          </div>
        )}
      </Card>

      {grupos.map((grupo) => (
        <Card key={grupo.grupo} title={grupo.titulo}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#59636A] uppercase">
                <th className="pb-2 pr-2">Evento</th>
                <th className="pb-2 pr-2">Início</th>
                <th className="pb-2 pr-2">Fim</th>
              </tr>
            </thead>
            <tbody>
              {grupo.linhas.map((l) => (
                <tr key={l.id} className="border-t border-[#E3DACB]">
                  <td className="py-1.5 pr-2 text-[#142B3A]">{l.nome}</td>
                  <td className="py-1.5 pr-2">{l.inicio}</td>
                  <td className="py-1.5 pr-2">{l.fim}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      {todasAsLinhas.length > 0 && (
        <Card title="Gantt do projeto">
          <div className="space-y-2">
            {grupos.map((grupo) =>
              grupo.linhas.map((g) => {
                const inicioMs = new Date(`${g.inicio}T00:00:00Z`).getTime();
                const fimMs = new Date(`${g.fim}T00:00:00Z`).getTime();
                if (!Number.isFinite(inicioMs) || !Number.isFinite(fimMs)) return null;
                const offsetPct = ((inicioMs - dataMinMs) / totalMs) * 100;
                const larguraPct = Math.max(1, ((fimMs - inicioMs) / totalMs) * 100);
                return (
                  <div key={`${grupo.grupo}-${g.id}`} className="flex items-center gap-3 text-xs">
                    <span className="w-48 truncate text-[#142B3A]">{g.nome}</span>
                    <div className="flex-1 h-4 bg-[#F4EFE6] rounded relative">
                      <div
                        className="absolute h-4 rounded bg-[#B96343]"
                        style={{ left: `${offsetPct}%`, width: `${larguraPct}%` }}
                        title={`${g.inicio} → ${g.fim}`}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}
    </>
  );
}

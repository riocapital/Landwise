"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function PreAnaliseForm() {
  const supabase = createClient();
  const [tipoProjeto, setTipoProjeto] = useState("Terreno para construir");
  const [localizacao, setLocalizacao] = useState("");
  const [areaLote, setAreaLote] = useState("");
  const [areaConstrucao, setAreaConstrucao] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const { error } = await supabase.from("pre_analises").insert([
      {
        tipo_projeto: tipoProjeto,
        localizacao,
        area_lote: areaLote ? Number(areaLote) : null,
        area_construcao: areaConstrucao ? Number(areaConstrucao) : null,
        email,
      },
    ]);
    setStatus(error ? "error" : "ok");
  }

  return (
    <section className="form-section" id="form">
      <div className="wrap form-flex">
        <div>
          <span className="eyebrow" style={{ color: "var(--slate)" }}>
            Comece agora
          </span>
          <h2>Faça uma pré-análise do ativo</h2>
          <p>
            Indique o essencial — a nossa equipa responde por email com a pré-análise. Para o Pacote Landwise completo,{" "}
            <a href="/registo" style={{ color: "var(--terracotta)", textDecoration: "underline" }}>
              crie uma conta gratuita
            </a>
            .
          </p>
        </div>
        <div>
          <div className="mini-form">
            <form onSubmit={handleSubmit}>
              <h3>Terreno, prédio ou remodelação</h3>
              <div className="field">
                <label htmlFor="tipo">Tipo de projeto</label>
                <select id="tipo" value={tipoProjeto} onChange={(e) => setTipoProjeto(e.target.value)}>
                  <option>Terreno para construir</option>
                  <option>Prédio aprovado</option>
                  <option>Apartamento para remodelar</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="loc">Localização</label>
                <input
                  id="loc"
                  type="text"
                  placeholder="Ex.: Benfica, Lisboa"
                  required
                  value={localizacao}
                  onChange={(e) => setLocalizacao(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="lote">Área do lote (m²)</label>
                <input
                  id="lote"
                  type="number"
                  placeholder="Ex.: 850"
                  value={areaLote}
                  onChange={(e) => setAreaLote(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="constr">Área de construção — se conhecida (m²)</label>
                <input
                  id="constr"
                  type="number"
                  placeholder="Opcional"
                  value={areaConstrucao}
                  onChange={(e) => setAreaConstrucao(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="email">O seu email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="nome@empresa.pt"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={status === "sending"}
                className="btn btn-primary"
                style={{ width: "100%", border: "none", cursor: "pointer" }}
              >
                {status === "sending" ? "A enviar…" : "Gerar pré-análise gratuita"}
              </button>
              <p
                style={{
                  fontSize: "0.86rem",
                  marginTop: "10px",
                  textAlign: "center",
                  color: status === "error" ? "#C6453A" : "#4E7A5C",
                }}
              >
                {status === "ok" && "Recebemos o seu pedido. Entraremos em contacto brevemente."}
                {status === "error" && "Não foi possível enviar. Tente novamente."}
              </p>
            </form>
            <p className="microcopy">Sem cartão de crédito</p>
          </div>
        </div>
      </div>
    </section>
  );
}

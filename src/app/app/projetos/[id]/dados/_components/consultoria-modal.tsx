"use client";

// Extraído de page.tsx (achado S1 da auditoria de 2026-07-31) — modal
// autónomo, com o próprio estado interno de formulário.

import { useState } from "react";
import { Row, FieldGroup } from "./ui";

export function ConsultoriaModal({
  onFechar,
  onEnviar,
}: {
  onFechar: () => void;
  onEnviar: (dados: {
    name: string;
    company: string;
    email: string;
    phone: string;
    message: string;
    preferenciaContacto: "email" | "telefone";
  }) => Promise<{ ok: boolean; erro?: string }>;
}) {
  const [nome, setNomeLead] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [preferencia, setPreferencia] = useState<"email" | "telefone">("email");
  const [aEnviar, setAEnviar] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleEnviar() {
    if (!nome || !email) {
      setErro("Preenche pelo menos o nome e o email.");
      return;
    }
    setAEnviar(true);
    setErro(null);
    const resultado = await onEnviar({ name: nome, company: empresa, email, phone: telefone, message: mensagem, preferenciaContacto: preferencia });
    setAEnviar(false);
    if (resultado.ok) {
      setEnviado(true);
    } else {
      setErro(resultado.erro ?? "Não foi possível enviar o pedido. Tenta novamente.");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        {enviado ? (
          <>
            <h3 className="text-[#142B3A] font-bold text-lg mb-2">Pedido enviado</h3>
            <p className="text-sm text-[#59636A] mb-4">
              Obrigado. A nossa equipa entra em contacto por {preferencia === "email" ? "email" : "telefone"} em breve.
            </p>
            <button onClick={onFechar} className="px-4 py-2 rounded-lg bg-[#142B3A] text-white text-sm font-bold">
              Fechar
            </button>
          </>
        ) : (
          <>
            <h3 className="text-[#142B3A] font-bold text-lg mb-1">Solicitar análise especializada</h3>
            <p className="text-xs text-[#8FA6AF] mb-4">Esta estimativa não substitui uma análise fiscal, jurídica ou contabilística individual.</p>
            <Row>
              <FieldGroup label="Nome">
                <input className="input-dark" value={nome} onChange={(e) => setNomeLead(e.target.value)} />
              </FieldGroup>
              <FieldGroup label="Empresa">
                <input className="input-dark" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
              </FieldGroup>
            </Row>
            <Row>
              <FieldGroup label="Email">
                <input type="email" className="input-dark" value={email} onChange={(e) => setEmail(e.target.value)} />
              </FieldGroup>
              <FieldGroup label="Telefone">
                <input className="input-dark" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </FieldGroup>
            </Row>
            <Row>
              <FieldGroup label="Preferência de contacto">
                <select className="input-dark" value={preferencia} onChange={(e) => setPreferencia(e.target.value as "email" | "telefone")}>
                  <option value="email">Email</option>
                  <option value="telefone">Telefone</option>
                </select>
              </FieldGroup>
            </Row>
            <Row>
              <FieldGroup label="Mensagem (opcional)">
                <textarea className="input-dark" rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
              </FieldGroup>
            </Row>
            {erro && <p className="text-xs text-[#A13D2E] mb-2">{erro}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={handleEnviar} disabled={aEnviar} className="px-4 py-2 rounded-lg bg-[#142B3A] text-white text-sm font-bold disabled:opacity-60">
                {aEnviar ? "A enviar…" : "Enviar pedido"}
              </button>
              <button onClick={onFechar} className="px-4 py-2 rounded-lg border border-[#E3DACB] text-[#142B3A] text-sm font-semibold">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

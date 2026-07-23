// Acesso a `consulting_leads` — secção 10 do plano.
//
// lead_type é sempre 'tax_optimization' para o botão da etapa Impostos.
// Nunca menciona SIC/SICAFI/fundos — só o formulário genérico de contacto.

import type { SupabaseClient } from "@supabase/supabase-js";

export type NovoLeadConsultoria = {
  userId: string;
  projectId: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  message: string | null;
  preferenciaContacto: "email" | "telefone";
  projectSummary: {
    projeto: string;
    localizacao: string | null;
    valorAquisicao: number;
    gdv: number;
    custoTotal: number;
    impostoEstimado: number;
  };
};

export async function criarLeadConsultoria(supabase: SupabaseClient, lead: NovoLeadConsultoria): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase.from("consulting_leads").insert({
    user_id: lead.userId,
    project_id: lead.projectId,
    lead_type: "tax_optimization",
    name: lead.name,
    company: lead.company,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    project_summary: { ...lead.projectSummary, preferenciaContacto: lead.preferenciaContacto },
    status: "novo",
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

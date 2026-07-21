import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-xl font-bold text-[#142B3A] mb-6">Configurações</h1>
      <div className="bg-white border border-[#E3DACB] rounded-lg p-6 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Email</div>
          <div className="text-sm text-[#142B3A] font-medium">{user.email}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Nome</div>
          <div className="text-sm text-[#142B3A] font-medium">{profile?.nome || "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Empresa</div>
          <div className="text-sm text-[#142B3A] font-medium">{profile?.empresa || "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Papel</div>
          <div className="text-sm text-[#142B3A] font-medium capitalize">{profile?.papel || "—"}</div>
        </div>
      </div>
    </div>
  );
}

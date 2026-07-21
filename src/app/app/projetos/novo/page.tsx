import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function NovoProjetoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projeto, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, nome: "Novo projeto", status: "rascunho" })
    .select()
    .single();

  if (error || !projeto) {
    redirect("/app/projetos");
  }

  redirect(`/app/projetos/${projeto.id}/dados`);
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, Field, PrimaryButton, ErrorText } from "@/components/ui";

export default function RecuperarPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/app/configuracoes`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEnviado(true);
  }

  return (
    <AuthCard>
      <h1 className="text-2xl font-bold text-[#142B3A] mb-2">Recuperar palavra-passe</h1>
      <p className="text-sm text-[#59636A] mb-6">
        Indique o email da sua conta — enviamos um link para definir uma nova palavra-passe.
      </p>

      {enviado ? (
        <p className="text-sm text-[#4E7A5C] bg-[#4E7A5C]/10 border border-[#4E7A5C]/30 rounded-lg px-3 py-2.5">
          Se existir uma conta com este email, enviámos as instruções. Verifique a sua caixa de entrada.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <ErrorText>{error}</ErrorText>
          <Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <PrimaryButton type="submit" disabled={loading}>
            {loading ? "A enviar…" : "Enviar link de recuperação"}
          </PrimaryButton>
        </form>
      )}

      <p className="text-sm text-[#59636A] text-center mt-6">
        <Link href="/login" className="text-[#B96343] font-medium hover:underline">
          Voltar ao login
        </Link>
      </p>
    </AuthCard>
  );
}

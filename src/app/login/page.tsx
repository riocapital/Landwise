"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  AuthCard,
  Field,
  CheckboxField,
  PrimaryButton,
  OAuthButton,
  Divider,
  ErrorText,
  InfoBanner,
} from "@/components/ui";

const OAUTH_GOOGLE_ENABLED = process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "true";
const OAUTH_MICROSOFT_ENABLED = process.env.NEXT_PUBLIC_OAUTH_MICROSOFT_ENABLED === "true";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [manterSessao, setManterSessao] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Email ou palavra-passe incorretos.");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  async function handleOAuth(provider: "google" | "azure", label: string) {
    const enabled = provider === "google" ? OAUTH_GOOGLE_ENABLED : OAUTH_MICROSOFT_ENABLED;
    if (!enabled) {
      setOauthNotice(
        `Configuração pendente — o login com ${label} ainda não foi ativado nesta instalação.`
      );
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <AuthCard>
      <h1 className="text-2xl font-bold text-[#142B3A] mb-6">Entre na Landwise</h1>

      {oauthNotice && <InfoBanner>{oauthNotice}</InfoBanner>}

      <div className="space-y-3 mb-2">
        <OAuthButton onClick={() => handleOAuth("google", "Google")}>Continuar com Google</OAuthButton>
        <OAuthButton onClick={() => handleOAuth("azure", "Microsoft")}>Continuar com Microsoft</OAuthButton>
      </div>

      <Divider label="ou" />

      <form onSubmit={handleSubmit}>
        <ErrorText>{error}</ErrorText>
        <Field
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Palavra-passe"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex items-center justify-between mb-4">
          <CheckboxField
            label="Manter sessão iniciada"
            checked={manterSessao}
            onChange={(e) => setManterSessao(e.target.checked)}
          />
          <Link href="/recuperar-password" className="text-sm text-[#B96343] hover:underline">
            Esqueci a palavra-passe
          </Link>
        </div>
        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "A entrar…" : "Entrar"}
        </PrimaryButton>
      </form>

      <p className="text-sm text-[#59636A] text-center mt-6">
        Ainda não tem conta?{" "}
        <Link href="/registo" className="text-[#B96343] font-medium hover:underline">
          Criar conta grátis.
        </Link>
      </p>
    </AuthCard>
  );
}

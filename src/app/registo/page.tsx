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

export default function RegistoPage() {
  const router = useRouter();
  const supabase = createClient();
  const [nome, setNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [aceitaPrivacidade, setAceitaPrivacidade] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmar) {
      setError("As palavras-passe não coincidem.");
      return;
    }
    if (password.length < 8) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }
    if (!aceitaTermos || !aceitaPrivacidade) {
      setError("Tem de aceitar os Termos e a Política de Privacidade para continuar.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome: `${nome} ${apelido}`.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);

    if (error) {
      setError(error.message === "User already registered" ? "Este email já tem conta." : error.message);
      return;
    }
    router.push("/onboarding");
  }

  async function handleOAuth(provider: "google" | "azure", label: string) {
    const enabled = provider === "google" ? OAUTH_GOOGLE_ENABLED : OAUTH_MICROSOFT_ENABLED;
    if (!enabled) {
      setOauthNotice(
        `Configuração pendente — o registo com ${label} ainda não foi ativado nesta instalação.`
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
      <h1 className="text-2xl font-bold text-[#142B3A] mb-6">Crie a sua conta Landwise</h1>

      {oauthNotice && <InfoBanner>{oauthNotice}</InfoBanner>}

      <div className="space-y-3 mb-2">
        <OAuthButton onClick={() => handleOAuth("google", "Google")}>Registar com Google</OAuthButton>
        <OAuthButton onClick={() => handleOAuth("azure", "Microsoft")}>Registar com Microsoft</OAuthButton>
      </div>

      <Divider label="ou" />

      <form onSubmit={handleSubmit}>
        <ErrorText>{error}</ErrorText>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
          <Field label="Apelido" required value={apelido} onChange={(e) => setApelido(e.target.value)} />
        </div>
        <Field
          label="Email profissional"
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
        <Field
          label="Confirmar palavra-passe"
          type="password"
          required
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
        />
        <CheckboxField
          label={
            <>
              Aceito os{" "}
              <Link href="/termos" className="text-[#B96343] hover:underline">
                Termos de Utilização
              </Link>
            </>
          }
          checked={aceitaTermos}
          onChange={(e) => setAceitaTermos(e.target.checked)}
        />
        <CheckboxField
          label={
            <>
              Aceito a{" "}
              <Link href="/privacidade" className="text-[#B96343] hover:underline">
                Política de Privacidade
              </Link>
            </>
          }
          checked={aceitaPrivacidade}
          onChange={(e) => setAceitaPrivacidade(e.target.checked)}
        />
        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "A criar conta…" : "Criar conta grátis"}
        </PrimaryButton>
      </form>

      <p className="text-sm text-[#59636A] text-center mt-6">
        Já tem conta?{" "}
        <Link href="/login" className="text-[#B96343] font-medium hover:underline">
          Entrar.
        </Link>
      </p>
    </AuthCard>
  );
}

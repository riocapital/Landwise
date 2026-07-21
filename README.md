# Landwise — aplicação

Next.js (App Router) + TypeScript + Tailwind + Supabase (Auth + Postgres). Site institucional preservado em `/`, área autenticada em `/app`.

## 1. Configurar o Supabase

1. Vai ao teu projeto em [supabase.com](https://supabase.com) → **SQL Editor**.
2. Corre o conteúdo de `supabase/schema.sql` (cria `profiles`, `projects`, RLS, e o trigger que cria o perfil automaticamente no registo).
3. Em **Settings → API**, copia o **Project URL** e a **anon public key**.

## 2. Variáveis de ambiente

Copia `.env.example` para `.env.local` e preenche:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=false
NEXT_PUBLIC_OAUTH_MICROSOFT_ENABLED=false
```

No **Vercel**, define as mesmas variáveis em Project Settings → Environment Variables.

## 3. Login com Google e Microsoft (opcional)

Os botões já existem no ecrã de login e registo. Enquanto as credenciais abaixo não estiverem criadas, clicar neles mostra "configuração pendente" — não simulam um login.

### Google
1. [Google Cloud Console](https://console.cloud.google.com) → criar projeto (ou usar um existente) → **APIs & Services → Credentials**.
2. Criar **OAuth Client ID**, tipo "Web application".
3. Em "Authorized redirect URIs", adicionar: `https://<o-teu-projeto>.supabase.co/auth/v1/callback`.
4. Copiar o Client ID e Client Secret.
5. No Supabase: **Authentication → Providers → Google** → colar as duas credenciais → ativar.
6. No `.env.local`/Vercel: mudar `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` para `true`.

### Microsoft (Azure)
1. [Azure Portal](https://portal.azure.com) → **App registrations → New registration**.
2. Em "Redirect URI", adicionar: `https://<o-teu-projeto>.supabase.co/auth/v1/callback`.
3. Criar um **Client Secret** em Certificates & Secrets.
4. No Supabase: **Authentication → Providers → Azure** → colar Application (client) ID, Client Secret, e o Directory (tenant) ID → ativar.
5. No `.env.local`/Vercel: mudar `NEXT_PUBLIC_OAUTH_MICROSOFT_ENABLED` para `true`.

## 4. Correr localmente

```
npm install
npm run dev
```

## 5. Testes do motor de cálculo

```
npm run test
```

## 6. Deployment (Vercel)

Como já fazias antes: liga o repositório GitHub à Vercel, define as variáveis de ambiente do passo 2, e o deployment continua automático a cada push.

---

## O que está funcional agora

- Site institucional em `/` — design preservado, formulário de pré-análise a gravar na tabela `pre_analises`
- Registo e login por email/password, com sessão persistente
- Rotas `/app/*` protegidas — sem sessão, redireciona para `/login`
- Onboarding em 3 passos, que cria automaticamente o projeto demonstrativo
- Criar projeto → wizard (Identificação, Programa e Vendas, Custos e Financiamento, Calendário, Revisão) → autosave a cada 1,5s
- Motor de cálculo determinístico (sem valores aleatórios), com 12 testes unitários
- Dashboard de resultados com decomposição do resultado, cores com significado, e "Ver premissas e cálculos"
- Editar premissas e recalcular altera os resultados
- Duplicar e eliminar projetos

## O que depende de configuração externa (não é um bug — falta só a credencial)

- Login/registo com Google — precisa das credenciais da secção 3
- Login/registo com Microsoft — precisa das credenciais da secção 3

## O que ficou fora desta fase, deliberadamente

- Secções "Comparar ativos", "Mercado", "Relatórios", "Equipa", "Plano e faturação" — existem como páginas "Em breve", não têm funcionalidade ainda
- Exportação em PDF/Excel dos 3 documentos do Pacote Landwise
- Alterações de copy da landing page pedidas no documento grande (login social no hero, etc.) — combinámos deixar para depois desta fase estar estável
- Upload de fotografia/documento na etapa de Identificação do wizard

## Estrutura de ficheiros criados

```
src/
  app/
    page.tsx                          — landing pública (design preservado)
    layout.tsx
    globals.css                       — tokens de cor + .input-dark
    login/page.tsx
    registo/page.tsx
    recuperar-password/page.tsx
    auth/callback/route.ts
    onboarding/page.tsx
    app/
      layout.tsx                      — shell com barra lateral
      page.tsx                        — Visão geral
      projetos/page.tsx               — lista de projetos
      projetos/novo/page.tsx          — criação rápida
      projetos/[id]/page.tsx          — dashboard de resultados
      projetos/[id]/dados/page.tsx    — wizard
      comparar|mercado|relatorios|equipa|faturacao/page.tsx  — placeholders "Em breve"
      configuracoes/page.tsx
  components/
    ui.tsx, sidebar.tsx, em-breve.tsx, pre-analise-form.tsx
  lib/
    calc/viabilidade.ts               — motor de cálculo
    calc/viabilidade.test.ts          — 12 testes
    demo-project.ts                   — dados do projeto demonstrativo
    supabase/client.ts, server.ts, middleware.ts
  content/
    landing-style.css, landing-before-form.html, landing-after-form.html
  proxy.ts                             — antigo middleware.ts (Next.js 16 renomeou a convenção)
supabase/schema.sql
.env.example
```

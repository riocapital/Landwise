"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/app", label: "Visão geral" },
  { href: "/app/projetos", label: "Projetos" },
  { href: "/app/comparar", label: "Comparar ativos" },
  { href: "/app/mercado", label: "Mercado" },
  { href: "/app/relatorios", label: "Relatórios" },
  { href: "/app/equipa", label: "Equipa" },
  { href: "/app/faturacao", label: "Plano e faturação" },
  { href: "/app/configuracoes", label: "Configurações" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="w-[230px] bg-[#081726] min-h-screen py-6 flex flex-col shrink-0">
      <div className="flex items-center px-6 pb-7">
        <svg viewBox="0 0 100 100" className="w-6 h-6 mr-2">
          <path d="M15 40 L15 15 L40 15" fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="square" />
          <path d="M60 85 L85 85 L85 60" fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="square" />
          <circle cx="70" cy="70" r="8" fill="#35C99A" />
        </svg>
        <span className="font-extrabold text-white tracking-wide text-[1.05rem]">
          LAND<span className="text-[#35C99A]">WISE</span>
        </span>
      </div>
      <nav className="flex-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-6 py-2.5 text-[0.86rem] border-l-[3px] ${
                active
                  ? "text-white bg-white/5 border-[#18A47B]"
                  : "text-[#8FA6AF] border-transparent hover:text-white"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 mr-3" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={handleLogout}
        className="mx-6 mt-4 text-left text-[0.82rem] text-[#8FA6AF] hover:text-white"
      >
        Terminar sessão
      </button>
    </div>
  );
}

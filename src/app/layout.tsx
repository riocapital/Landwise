import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Landwise — Inteligência para decisões imobiliárias",
  description: "Antes de comprometer capital, conheça o potencial do ativo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}

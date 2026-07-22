import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sugerirPreco, type SujeitoComparacao } from "@/lib/calc/comparaveis";
import type { MarketComparable } from "@/lib/calc/market-comparables-types";

// POST /api/comparaveis/sugestao
//
// Corre no servidor (nunca no browser): lê comparáveis da Supabase (RLS
// exige utilizador autenticado — nunca dados de outro utilizador, a tabela
// é partilhada mas só leitura) e devolve a sugestão de preço calculada por
// src/lib/calc/comparaveis.ts. A rota NUNCA decide o preço final — devolve
// só a sugestão; a aplicação do valor ao campo é sempre uma ação explícita
// do utilizador ("Aplicar sugestão"), nunca automática (secção 4 do plano).
export async function POST(request: NextRequest) {
  const sujeito = (await request.json()) as SujeitoComparacao;

  if (!sujeito.municipality && !sujeito.parish && !sujeito.zone) {
    return NextResponse.json(
      { erro: "É preciso pelo menos concelho, freguesia ou zona para procurar comparáveis." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Filtra por concelho no servidor (reduz o payload); o resto do matching
  // hierárquico (zona > freguesia > distância) é feito pelo motor em memória,
  // não aqui — para manter uma única fonte de lógica de comparação.
  let query = supabase.from("market_comparables").select("*").eq("active", true).limit(500);
  if (sujeito.municipality) {
    query = query.eq("municipality", sujeito.municipality);
  }
  if (sujeito.propertyType) {
    query = query.eq("property_type", sujeito.propertyType);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ erro: "Falha ao consultar comparáveis: " + error.message }, { status: 500 });
  }

  const sugestao = sugerirPreco(sujeito, (data ?? []) as MarketComparable[]);
  return NextResponse.json(sugestao);
}

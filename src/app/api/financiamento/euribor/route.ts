import { NextRequest, NextResponse } from "next/server";
import { obterEuribor, type TenorEuribor } from "@/lib/financiamento/euribor";

// GET /api/financiamento/euribor?tenor=6m | 12m
//
// Corre no servidor. Nunca inventa um valor — se o BCE falhar ou devolver
// algo inesperado, a resposta indica isso explicitamente (secção 23 do
// plano) para a UI pedir preenchimento manual, nunca assumir 0 ou um
// número de exemplo.
export async function GET(request: NextRequest) {
  const tenorParam = request.nextUrl.searchParams.get("tenor");
  if (tenorParam !== "6m" && tenorParam !== "12m") {
    return NextResponse.json({ sucesso: false, erro: "Tenor inválido. Usa 6m ou 12m." }, { status: 400 });
  }
  const resultado = await obterEuribor(tenorParam as TenorEuribor);
  return NextResponse.json(resultado);
}

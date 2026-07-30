import { NextRequest, NextResponse } from "next/server";
import { procurarCodigoPostal } from "@/lib/localizacao/codigo-postal";

export async function GET(request: NextRequest) {
  const cp = request.nextUrl.searchParams.get("cp") ?? "";
  const resultado = await procurarCodigoPostal(cp);
  return NextResponse.json(resultado, {
    status: resultado.encontrado || resultado.motivo !== "codigo_invalido" ? 200 : 400,
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { procurarCodigoPostal } from "@/lib/localizacao/codigo-postal";

// GET /api/localizacao/codigo-postal?cp=2495-300
//
// Corre no servidor. O componente do wizard (client) chama esta rota — nunca
// chama o provedor externo diretamente, para nunca expor a lógica/chave do
// provedor no browser (secção 1 do plano: "não colocar chaves de APIs
// diretamente no frontend").
export async function GET(request: NextRequest) {
  const cp = request.nextUrl.searchParams.get("cp") ?? "";
  const resultado = await procurarCodigoPostal(cp);
  return NextResponse.json(resultado);
}

// Motor de perfis de desembolso — Landwise, Fase 5
//
// Distribui um valor total por uma lista de meses, de acordo com o perfil
// escolhido (secção 11 do plano). Função pura, partilhada por custos,
// financiamento e vendas — para nunca haver duas lógicas de "espalhar por
// meses" divergentes no mesmo produto.

export type PerfilDesembolso =
  | "unico_inicio"
  | "unico_fim"
  | "linear"
  | "curva_s"
  | "front_loaded"
  | "back_loaded"
  | "personalizado";

/** Lista de "YYYY-MM" entre duas datas (inclusive), pela ordem cronológica. */
export function gerarMesesEntre(dataInicial: string, dataFinal: string): string[] {
  const [anoI, mesI] = dataInicial.split("-").map(Number);
  const [anoF, mesF] = dataFinal.split("-").map(Number);
  const meses: string[] = [];
  let ano = anoI;
  let mes = mesI;
  while (ano < anoF || (ano === anoF && mes <= mesF)) {
    meses.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes++;
    if (mes > 12) {
      mes = 1;
      ano++;
    }
  }
  return meses;
}

/** Pesos de uma curva em S simplificada (distribuição logística discretizada), sempre a somar 1. */
function pesosCurvaS(n: number): number[] {
  if (n <= 1) return [1];
  const bruto = Array.from({ length: n }, (_, i) => {
    const x = (i / (n - 1)) * 12 - 6; // -6..+6
    return 1 / (1 + Math.exp(-x));
  });
  // Converte a curva cumulativa em incrementos mensais (derivada discreta).
  const incrementos = bruto.map((v, i) => (i === 0 ? v : v - bruto[i - 1]));
  const soma = incrementos.reduce((s, v) => s + v, 0);
  return incrementos.map((v) => v / soma);
}

function pesosLineares(n: number): number[] {
  return Array.from({ length: n }, () => 1 / n);
}

function pesosFrontLoaded(n: number): number[] {
  const bruto = Array.from({ length: n }, (_, i) => n - i);
  const soma = bruto.reduce((s, v) => s + v, 0);
  return bruto.map((v) => v / soma);
}

function pesosBackLoaded(n: number): number[] {
  return pesosFrontLoaded(n).slice().reverse();
}

/**
 * Distribui `valorTotal` pelos meses entre `dataInicial` e `dataFinal`,
 * segundo `perfil`. Devolve um Map "YYYY-MM" -> valor nesse mês, com soma
 * exatamente igual a valorTotal (ajuste de arredondamento no último mês).
 *
 * `pesosPersonalizados`, quando o perfil é 'personalizado', deve somar 1
 * (percentagens mensais) — validado por quem chama (validarPesosPersonalizados).
 */
export function distribuirValorPorPerfil(
  valorTotal: number,
  dataInicial: string,
  dataFinal: string,
  perfil: PerfilDesembolso,
  pesosPersonalizados?: number[]
): Map<string, number> {
  const meses = gerarMesesEntre(dataInicial, dataFinal);
  const resultado = new Map<string, number>();

  if (meses.length === 0) return resultado;

  let pesos: number[];
  switch (perfil) {
    case "unico_inicio":
      pesos = meses.map((_, i) => (i === 0 ? 1 : 0));
      break;
    case "unico_fim":
      pesos = meses.map((_, i) => (i === meses.length - 1 ? 1 : 0));
      break;
    case "linear":
      pesos = pesosLineares(meses.length);
      break;
    case "curva_s":
      pesos = pesosCurvaS(meses.length);
      break;
    case "front_loaded":
      pesos = pesosFrontLoaded(meses.length);
      break;
    case "back_loaded":
      pesos = pesosBackLoaded(meses.length);
      break;
    case "personalizado":
      pesos = pesosPersonalizados && pesosPersonalizados.length === meses.length ? pesosPersonalizados : pesosLineares(meses.length);
      break;
    default:
      pesos = pesosLineares(meses.length);
  }

  let acumulado = 0;
  meses.forEach((mes, i) => {
    const valor = i === meses.length - 1 ? valorTotal - acumulado : Math.round(valorTotal * pesos[i] * 100) / 100;
    resultado.set(mes, valor);
    acumulado += valor;
  });

  return resultado;
}

/** Valida que percentagens mensais personalizadas somam 100% (com tolerância de arredondamento). */
export function validarPesosPersonalizados(pesos: number[]): boolean {
  const soma = pesos.reduce((s, p) => s + p, 0);
  return Math.abs(soma - 1) < 0.001;
}

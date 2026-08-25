// src/ui/qr.ts
// Codificador de QR mínimo y completo, sin dependencias.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTÁ ESCRITO A MANO
// ══════════════════════════════════════════════════════════════════════════
// /instalar es la página que se abre con la peor red posible: teléfono nuevo,
// primer arranque, 4G de galpão. Traer una librería de QR (~20 kB) para pintar
// un cuadrado que codifica una URL de 40 caracteres es caro justo donde menos
// se puede pagar. Y un `<img src="https://api.qrserver…">` es peor todavía:
// manda la URL interna de la empresa a un tercero y no funciona sin red.
//
// Alcance deliberado: **modo byte, nivel de corrección M, versiones 1 a 10**.
// Eso cubre hasta 216 bytes, que son cuatro veces cualquier URL nuestra. Fuera
// de ese rango la función lanza en vez de emitir un QR inválido: un QR que no
// escanea es peor que no tener QR, porque nadie sabe si falló el código o la
// cámara.
//
// Nivel M (recupera ~15 %) y no L: el QR se va a escanear de una pantalla con
// brillo bajo o de una hoja impresa en la planta.

/* ══════════════════════════════════════════════════════════════════════════
   1 · GF(256) — la aritmética de Reed-Solomon
   ══════════════════════════════════════════════════════════════════════════ */

// Polinomio primitivo x⁸+x⁴+x³+x²+1 = 0x11D, el que fija la norma para QR.
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)

;(function construirTabelas() {
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255] as number
})()

function multiplicar(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP[((LOG[a] as number) + (LOG[b] as number)) % 255] as number
}

/** Polinomio generador de grado `grau`, para el código de corrección. */
function polinomioGerador(grau: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < grau; i += 1) {
    const proximo = new Uint8Array(poly.length + 1)
    for (let j = 0; j < poly.length; j += 1) {
      proximo[j] = (proximo[j] as number) ^ (poly[j] as number)
      proximo[j + 1] =
        (proximo[j + 1] as number) ^ multiplicar(poly[j] as number, EXP[i] as number)
    }
    poly = proximo
  }
  return poly
}

/** Los `ecLen` codewords de corrección de un bloque de datos. */
function corrigir(dados: Uint8Array, ecLen: number): Uint8Array {
  const gerador = polinomioGerador(ecLen)
  const resto = new Uint8Array(ecLen)
  for (const byte of dados) {
    const fator = byte ^ (resto[0] as number)
    resto.copyWithin(0, 1)
    resto[ecLen - 1] = 0
    if (fator !== 0) {
      for (let i = 0; i < ecLen; i += 1) {
        resto[i] = (resto[i] as number) ^ multiplicar(gerador[i + 1] as number, fator)
      }
    }
  }
  return resto
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · Tablas de la norma (nivel M, versiones 1-10)
   ══════════════════════════════════════════════════════════════════════════ */

interface ConfigVersao {
  /** Codewords de datos totales de la versión. */
  dados: number
  /** Codewords de corrección por bloque. */
  ecPorBloco: number
  /** [cantidad de bloques, codewords de datos por bloque] del grupo 1 y 2. */
  grupos: [number, number][]
  /** Centros de los patrones de alineación. */
  alinhamento: number[]
}

const VERSOES: readonly ConfigVersao[] = [
  { dados: 16, ecPorBloco: 10, grupos: [[1, 16]], alinhamento: [] },
  { dados: 28, ecPorBloco: 16, grupos: [[1, 28]], alinhamento: [6, 18] },
  { dados: 44, ecPorBloco: 26, grupos: [[1, 44]], alinhamento: [6, 22] },
  { dados: 64, ecPorBloco: 18, grupos: [[2, 32]], alinhamento: [6, 26] },
  { dados: 86, ecPorBloco: 24, grupos: [[2, 43]], alinhamento: [6, 30] },
  { dados: 108, ecPorBloco: 16, grupos: [[4, 27]], alinhamento: [6, 34] },
  { dados: 124, ecPorBloco: 18, grupos: [[4, 31]], alinhamento: [6, 22, 38] },
  {
    dados: 154,
    ecPorBloco: 22,
    grupos: [
      [2, 38],
      [2, 39],
    ],
    alinhamento: [6, 24, 42],
  },
  {
    dados: 182,
    ecPorBloco: 22,
    grupos: [
      [3, 36],
      [2, 37],
    ],
    alinhamento: [6, 26, 46],
  },
  {
    dados: 216,
    ecPorBloco: 26,
    grupos: [
      [4, 43],
      [1, 44],
    ],
    alinhamento: [6, 28, 50],
  },
]

/** Información de versión (18 bits) para las versiones 7 a 10. */
const INFO_VERSAO: Readonly<Record<number, number>> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · Codificación
   ══════════════════════════════════════════════════════════════════════════ */

export interface MatrizQr {
  /** Lado en módulos (sin zona tranquila). */
  size: number
  /** `true` = módulo oscuro. Indexado [linha][coluna]. */
  modules: boolean[][]
  version: number
}

class Bits {
  readonly bits: number[] = []
  push(valor: number, quantidade: number): void {
    for (let i = quantidade - 1; i >= 0; i -= 1) this.bits.push((valor >> i) & 1)
  }
}

/**
 * Codifica `texto` como QR. Lanza si no entra en la versión 10.
 * El texto se codifica en UTF-8: los acentos de PT-BR ocupan 2 bytes.
 */
export function encodeQr(texto: string): MatrizQr {
  const bytes = new TextEncoder().encode(texto)

  // ── versión mínima que aguanta el payload ────────────────────────────────
  let versao = 0
  for (let v = 1; v <= 10; v += 1) {
    const cfg = VERSOES[v - 1] as ConfigVersao
    const bitsContagem = v <= 9 ? 8 : 16
    const bitsNecessarios = 4 + bitsContagem + bytes.length * 8
    if (Math.ceil(bitsNecessarios / 8) <= cfg.dados) {
      versao = v
      break
    }
  }
  if (versao === 0) {
    throw new Error('Texto longo demais para um QR versão 10 (máximo 216 bytes).')
  }

  const cfg = VERSOES[versao - 1] as ConfigVersao
  const bitsContagem = versao <= 9 ? 8 : 16

  // ── bitstream: modo byte + contador + datos + terminador + relleno ───────
  const buffer = new Bits()
  buffer.push(0b0100, 4)
  buffer.push(bytes.length, bitsContagem)
  for (const b of bytes) buffer.push(b, 8)

  const capacidadeBits = cfg.dados * 8
  const terminador = Math.min(4, capacidadeBits - buffer.bits.length)
  buffer.push(0, terminador)
  while (buffer.bits.length % 8 !== 0) buffer.bits.push(0)

  const codewords: number[] = []
  for (let i = 0; i < buffer.bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (buffer.bits[i + j] as number)
    codewords.push(byte)
  }
  // Relleno alternado 0xEC / 0x11, como manda la norma.
  const PADS = [0xec, 0x11]
  let p = 0
  while (codewords.length < cfg.dados) {
    codewords.push(PADS[p % 2] as number)
    p += 1
  }

  // ── bloques + corrección ────────────────────────────────────────────────
  const blocosDados: Uint8Array[] = []
  const blocosEc: Uint8Array[] = []
  let offset = 0
  for (const [quantidade, tamanho] of cfg.grupos) {
    for (let i = 0; i < quantidade; i += 1) {
      const bloco = Uint8Array.from(codewords.slice(offset, offset + tamanho))
      offset += tamanho
      blocosDados.push(bloco)
      blocosEc.push(corrigir(bloco, cfg.ecPorBloco))
    }
  }

  // Intercalado: primer codeword de cada bloque, después el segundo, etc.
  const finais: number[] = []
  const maiorDados = Math.max(...blocosDados.map((b) => b.length))
  for (let i = 0; i < maiorDados; i += 1) {
    for (const bloco of blocosDados) if (i < bloco.length) finais.push(bloco[i] as number)
  }
  for (let i = 0; i < cfg.ecPorBloco; i += 1) {
    for (const bloco of blocosEc) finais.push(bloco[i] as number)
  }

  return desenhar(versao, cfg, finais)
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · Dibujo de la matriz
   ══════════════════════════════════════════════════════════════════════════ */

function desenhar(versao: number, cfg: ConfigVersao, codewords: readonly number[]): MatrizQr {
  const size = versao * 4 + 17
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  )
  const funcao: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  )

  const marcar = (r: number, c: number, escuro: boolean): void => {
    ;(modules[r] as boolean[])[c] = escuro
    ;(funcao[r] as boolean[])[c] = true
  }

  // ── buscadores + separadores ────────────────────────────────────────────
  const finder = (linha: number, coluna: number): void => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = linha + r
        const cc = coluna + c
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue
        // El anillo r/c = -1 o 7 es el SEPARADOR: siempre claro. Tratarlo
        // como parte del borde pinta un marco negro de más y, peor, cambia la
        // penalización y con ella la máscara elegida — el QR entero sale otro.
        const dentro = r >= 0 && r <= 6 && c >= 0 && c <= 6
        const borda = dentro && (r === 0 || r === 6 || c === 0 || c === 6)
        const centro = r >= 2 && r <= 4 && c >= 2 && c <= 4
        marcar(rr, cc, borda || centro)
      }
    }
  }
  finder(0, 0)
  finder(0, size - 7)
  finder(size - 7, 0)

  // ── temporizadores ──────────────────────────────────────────────────────
  for (let i = 8; i < size - 8; i += 1) {
    marcar(6, i, i % 2 === 0)
    marcar(i, 6, i % 2 === 0)
  }

  // ── patrones de alineación ──────────────────────────────────────────────
  for (const linha of cfg.alinhamento) {
    for (const coluna of cfg.alinhamento) {
      // Los tres que caerían encima de un buscador no se dibujan.
      const noFinder =
        (linha === 6 && coluna === 6) ||
        (linha === 6 && coluna === size - 7) ||
        (linha === size - 7 && coluna === 6)
      if (noFinder) continue
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const anel = Math.max(Math.abs(r), Math.abs(c))
          marcar(linha + r, coluna + c, anel !== 1)
        }
      }
    }
  }

  // ── módulo oscuro fijo + reserva del formato ────────────────────────────
  marcar(size - 8, 8, true)
  for (let i = 0; i < 9; i += 1) {
    if (!(funcao[8] as boolean[])[i]) marcar(8, i, false)
    if (!(funcao[i] as boolean[])[8]) marcar(i, 8, false)
  }
  for (let i = 0; i < 8; i += 1) {
    if (!(funcao[8] as boolean[])[size - 1 - i]) marcar(8, size - 1 - i, false)
    if (!(funcao[size - 1 - i] as boolean[])[8]) marcar(size - 1 - i, 8, false)
  }

  // ── información de versión (sólo v ≥ 7) ─────────────────────────────────
  const info = INFO_VERSAO[versao]
  if (info !== undefined) {
    for (let i = 0; i < 18; i += 1) {
      const bit = ((info >> i) & 1) === 1
      const linha = Math.floor(i / 3)
      const coluna = size - 11 + (i % 3)
      marcar(linha, coluna, bit)
      marcar(coluna, linha, bit)
    }
  }

  // ── datos, en zigzag de dos columnas de abajo hacia arriba ──────────────
  let bitIndex = 0
  const totalBits = codewords.length * 8
  const proximoBit = (): boolean => {
    if (bitIndex >= totalBits) return false
    const byte = codewords[bitIndex >> 3] as number
    const bit = (byte >> (7 - (bitIndex & 7))) & 1
    bitIndex += 1
    return bit === 1
  }

  // Zigzag de dos columnas, de la derecha hacia la izquierda. La dirección
  // NO se alterna con un booleano: sale de la propia columna
  // (`((direita + 1) & 2) === 0`). Con un booleano, el salto de la columna 6
  // —el temporizador vertical, que se saltea entera— invierte la paridad y
  // todo el bloque de abajo queda espejado.
  let direita = size - 1
  while (direita >= 1) {
    if (direita === 6) direita = 5
    const subindo = ((direita + 1) & 2) === 0
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let d = 0; d < 2; d += 1) {
        const cc = direita - d
        const linha = subindo ? size - 1 - vertical : vertical
        if ((funcao[linha] as boolean[])[cc]) continue
        ;(modules[linha] as boolean[])[cc] = proximoBit()
      }
    }
    direita -= 2
  }

  // ── máscara: se prueban las 8 y gana la de menor penalización ───────────
  let melhorMascara = 0
  let melhorPenalidade = Number.POSITIVE_INFINITY
  let melhorMatriz: boolean[][] = modules

  for (let mascara = 0; mascara < 8; mascara += 1) {
    const candidata = aplicarMascara(modules, funcao, mascara)
    escreverFormato(candidata, funcao, mascara, size)
    const penalidade = penalizar(candidata, size)
    if (penalidade < melhorPenalidade) {
      melhorPenalidade = penalidade
      melhorMascara = mascara
      melhorMatriz = candidata
    }
  }
  void melhorMascara

  return { size, modules: melhorMatriz, version: versao }
}

function condicaoDeMascara(mascara: number, r: number, c: number): boolean {
  switch (mascara) {
    case 0:
      return (r + c) % 2 === 0
    case 1:
      return r % 2 === 0
    case 2:
      return c % 3 === 0
    case 3:
      return (r + c) % 3 === 0
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  }
}

function aplicarMascara(
  base: readonly boolean[][],
  funcao: readonly boolean[][],
  mascara: number,
): boolean[][] {
  return base.map((linha, r) =>
    linha.map((valor, c) =>
      (funcao[r] as boolean[])[c] ? valor : valor !== condicaoDeMascara(mascara, r, c),
    ),
  )
}

/** BCH(15,5) del formato, con el XOR 0x5412 de la norma. Nivel M = 0b00. */
function escreverFormato(
  matriz: boolean[][],
  funcao: readonly boolean[][],
  mascara: number,
  size: number,
): void {
  const dados = (0b00 << 3) | mascara
  let resto = dados
  for (let i = 0; i < 10; i += 1) resto = (resto << 1) ^ ((resto >> 9) * 0x537)
  const formato = (((dados << 10) | resto) ^ 0x5412) & 0x7fff

  const escrever = (r: number, c: number, bit: boolean): void => {
    ;(matriz[r] as boolean[])[c] = bit
  }

  // Copia 1: los bits 0-8 bajan por la COLUMNA 8 y los 9-14 salen por la
  // FILA 8 hacia la izquierda. (Transponer estas dos líneas produce un QR que
  // se dibuja perfecto y no escanea: el lector encuentra un nivel de
  // corrección y una máscara que no son los que se usaron.)
  const bit = (i: number): boolean => ((formato >> i) & 1) === 1
  for (let i = 0; i <= 5; i += 1) escrever(i, 8, bit(i))
  escrever(7, 8, bit(6))
  escrever(8, 8, bit(7))
  escrever(8, 7, bit(8))
  for (let i = 9; i < 15; i += 1) escrever(8, 14 - i, bit(i))

  // Copia 2: bits 0-7 por la fila 8 desde la derecha, 8-14 por la columna 8
  // desde abajo.
  for (let i = 0; i < 8; i += 1) escrever(8, size - 1 - i, bit(i))
  for (let i = 8; i < 15; i += 1) escrever(size - 15 + i, 8, bit(i))
  void funcao
}

/** Las cuatro reglas de penalización de la norma. Menos es mejor. */
function penalizar(matriz: readonly boolean[][], size: number): number {
  let total = 0

  // Regla 1: corridas de 5 o más del mismo color.
  const corrida = (obter: (i: number, j: number) => boolean): void => {
    for (let i = 0; i < size; i += 1) {
      let atual = obter(i, 0)
      let comprimento = 1
      for (let j = 1; j < size; j += 1) {
        const valor = obter(i, j)
        if (valor === atual) comprimento += 1
        else {
          if (comprimento >= 5) total += comprimento - 2
          atual = valor
          comprimento = 1
        }
      }
      if (comprimento >= 5) total += comprimento - 2
    }
  }
  corrida((i, j) => (matriz[i] as boolean[])[j] as boolean)
  corrida((i, j) => (matriz[j] as boolean[])[i] as boolean)

  // Regla 2: bloques de 2×2 del mismo color.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = (matriz[r] as boolean[])[c]
      if (
        v === (matriz[r] as boolean[])[c + 1] &&
        v === (matriz[r + 1] as boolean[])[c] &&
        v === (matriz[r + 1] as boolean[])[c + 1]
      ) {
        total += 3
      }
    }
  }

  // Regla 3: el patrón 1:1:3:1:1 que imita un buscador, precedido o seguido
  // por 4 módulos claros. Se exige que los 4 claros estén DENTRO del símbolo
  // (ventana de 11 módulos): tratar el borde como claro dispara la regla en
  // casi todas las filas y la penalización deja de discriminar entre máscaras.
  for (let i = 0; i < size; i += 1) {
    const linha = (k: number) => (matriz[i] as boolean[])[k] as boolean
    const coluna = (k: number) => (matriz[k] as boolean[])[i] as boolean
    for (let j = 0; j + 10 < size; j += 1) {
      for (const obter of [linha, coluna]) {
        const m = (k: number) => obter(j + k)
        const seguido =
          m(0) && !m(1) && m(2) && m(3) && m(4) && !m(5) && m(6) && !m(7) && !m(8) && !m(9) && !m(10)
        const precedido =
          !m(0) && !m(1) && !m(2) && !m(3) && m(4) && !m(5) && m(6) && m(7) && m(8) && !m(9) && m(10)
        if (seguido || precedido) total += 40
      }
    }
  }

  // Regla 4: desequilibrio entre módulos oscuros y claros.
  let escuros = 0
  for (const linha of matriz) for (const v of linha) if (v) escuros += 1
  const proporcao = (escuros * 100) / (size * size)
  total += Math.floor(Math.abs(proporcao - 50) / 5) * 10

  return total
}

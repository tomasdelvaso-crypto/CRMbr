// api/_lib/casos.ts
// Los casos de éxito REALES de Ventapel, copiados de api/assistant.js del v2
// (CASOS_EXITO_REAIS) y tipados. No son marketing: son las únicas cifras que
// el Ventus tiene permitido citar. Todo lo demás que suene a número tiene que
// salir del CRM o declararse hipótesis.
//
// El matcher es el `findRelevantCases` del v2, con dos correcciones:
//   · La línea de producto pesa 5 y RESTA 3 cuando no coincide. Sin eso, el
//     Ventus le vendía anti-robo a un cliente de E-comfill.
//   · La descripción de la escala DOR se lee con `getScaleDescription`, que
//     tolera los tres formatos históricos del jsonb `scales`.

import type { Opportunity, ProductLine } from '../../src/core/index.js'
import { getScale, getScaleDescription } from '../../src/core/index.js'

export interface CasoDeExito {
  chave: string
  empresa: string
  setor: string
  linhas: readonly ProductLine[]
  problema: string
  solucao: string
  resultados: Readonly<Record<string, string | number>>
  tags: readonly string[]
  detalhe?: Readonly<Record<string, string>>
  aprendizado?: string
}

export const CASOS_DE_EXITO: readonly CasoDeExito[] = [
  {
    chave: 'honda',
    empresa: 'Honda Argentina',
    setor: 'Automotivo',
    linhas: ['better_pack', 'better_pack_venom'],
    problema: 'Velocidade limitada, 1% de perdas, problemas ergonômicos',
    solucao: 'BP555 + Fita Gorilla 300m',
    resultados: {
      velocidade: '+40%',
      perdas: '100% eliminadas',
      roi_meses: 3,
      investimento: 150000,
      economia_anual: 600000,
    },
    tags: ['automotivo', 'concessionárias', 'alta-segurança', 'ergonomia', 'ruído-laboral', 'espaço-limitado'],
    detalhe: {
      funcionarios: '>1000',
      regiao: 'Argentina',
      melhoria_ergonomia: 'Permitiu diversidade de operadores',
      reducao_ruido: 'Significativa',
    },
  },
  {
    chave: 'loreal',
    empresa: "L'Oréal Brasil",
    setor: 'Cosmética',
    linhas: ['better_pack_venom'],
    problema: '+10% de perdas por roubo, gargalos de produção',
    solucao: 'RSA + Fita Gorilla 700m',
    resultados: {
      roubos: '100% eliminados',
      eficiencia: '+50%',
      roi_meses: 3,
      investimento: 280000,
      economia_anual: 2500000,
      capacidade: '12 caixas/minuto',
      rastreabilidade: '100% implementada',
    },
    tags: ['cosmética', 'alto-valor', 'anti-roubo', 'rastreabilidade', 'ROI-rápido', 'espaço-limitado'],
    detalhe: {
      funcionarios: '>5000',
      regiao: 'Brasil',
      volume: 'Alto volume diário',
      espaco: 'Sem possibilidade de expansão',
    },
  },
  {
    chave: 'nike',
    empresa: 'Nike Brasil',
    setor: 'Calçado/Têxtil',
    linhas: ['better_pack_venom'],
    problema: '10% de perdas em transporte',
    solucao: 'BP755 + Fita Gorilla 300m',
    resultados: {
      perdas: '100% eliminadas',
      eficiencia: '+30%',
      roi_meses: 2,
      investimento: 200000,
      economia_anual: 1200000,
      disputas: '100% de redução com transportadoras',
    },
    tags: ['têxtil', 'calçado', 'e-commerce', 'transportadoras', 'saúde-ocupacional', 'ROI-rápido'],
    detalhe: {
      funcionarios: '>3000',
      regiao: 'Brasil',
      problema_saude: 'Dores em operadores eliminadas',
      controle_visual: 'Melhorado imediatamente',
    },
  },
  {
    chave: 'mercadolibre',
    empresa: 'MercadoLibre',
    setor: 'E-commerce',
    linhas: ['better_pack_venom'],
    problema: 'Alto retrabalho, perdas em fulfillment',
    solucao: 'BP555e + Fita VENOM',
    resultados: { retrabalho: '-100%', economia_mensal: 180000, roi_meses: 2, investimento: 360000 },
    tags: ['e-commerce', 'marketplace', 'fulfillment', 'alto-volume'],
    detalhe: { tipo_operacao: 'Centro de fulfillment', picos: 'Sazonais significativos' },
  },
  {
    chave: 'correio_argentino',
    empresa: 'Correo Argentino',
    setor: 'Logística/Postal',
    linhas: ['better_pack_venom'],
    problema:
      'Roubos de celulares em trânsito; o departamento de segurança questionava a fita gomada por possível violação sem evidência',
    solucao: 'BP555e + Fita VENOM + protocolo de fechamento padronizado + verificação imediata',
    resultados: {
      roubos: 'Detecção imediata de violações',
      evidencia: '100% de rastreabilidade de abertura',
      processo: 'Padronização completa do fechamento',
      roi_meses: 2,
      investimento: 180000,
    },
    tags: ['logística', 'postal', 'anti-roubo', 'celulares', 'alta-segurança', 'rastreabilidade', 'protocolo'],
    detalhe: {
      regiao: 'Argentina',
      tipo_carga: 'Celulares e eletrônicos',
      solucao_chave:
        'Protocolo de detecção: o cliente reporta imediatamente qualquer anomalia de peso ou aparência',
      departamento_envolvido: 'Segurança e prevenção de roubos',
    },
    aprendizado:
      'A fita gomada SEMPRE deixa evidência de violação. O êxito depende de: 1) padronizar o método de fechamento, 2) treinar o receptor para detectar anomalias, 3) protocolo de reporte imediato.',
  },
  {
    chave: 'ecomfill_ecommerce',
    empresa: 'Referência: E-commerce Moda BR',
    setor: 'E-commerce/Moda',
    linhas: ['ecomfill_resmas'],
    problema:
      'Over-packaging com caixas de papelão para produtos não frágeis, alto custo de frete por peso volumétrico, devoluções complicadas',
    solucao: 'E-combag Paper com sistema Vai e Vem + E-combag Pro para itens frágeis',
    resultados: {
      reducao_material: '-60% de custo de material vs caixa+preenchimento',
      frete: '-35% de custo de frete',
      velocidade_packing: '+50%',
      roi_meses: 3,
      investimento: 80000,
    },
    tags: ['e-commerce', 'moda', 'têxtil', 'logística-inversa', 'sustentável', 'sobres', 'SIOC', 'frete'],
    detalhe: { regiao: 'Brasil', beneficio_principal: 'Eliminação de caixas para 70% dos envios' },
    aprendizado:
      'Para moda e acessórios a caixa de papelão é over-packaging. O E-combag Paper elimina caixa, enchimento e fita de uma vez, e o Vai e Vem resolve a logística inversa.',
  },
  {
    chave: 'ecomfill_cosmeticos',
    empresa: 'Referência: Indústria Cosmética BR',
    setor: 'Cosmética/DTC',
    linhas: ['ecomfill_resmas'],
    problema: 'Plástico bolha gera imagem negativa da marca, unboxing pobre, custo alto de preenchimento',
    solucao: 'E-compaper Wrap (honeycomb) + E-comfill V-PAD TH para void-fill',
    resultados: {
      eliminacao_plastico: '100%',
      sustentabilidade: '100% papel reciclável',
      velocidade: '+40% de velocidade de preenchimento',
      roi_meses: 4,
      investimento: 120000,
    },
    tags: ['cosmética', 'DTC', 'sustentável', 'unboxing', 'papel', 'premium', 'anti-plástico'],
    detalhe: { regiao: 'Brasil', tipo_operacao: 'Envio direto ao consumidor (DTC)' },
    aprendizado:
      'Marcas premium estão sob pressão para eliminar plástico. O honeycomb dá proteção real e visual premium: é o oposto do plástico bolha.',
  },
  {
    chave: 'ecomfill_fulfillment',
    empresa: 'Referência: Centro de Fulfillment BR',
    setor: 'Logística/3PL',
    linhas: ['ecomfill_resmas', 'better_pack_venom'],
    problema: 'Air pillows ocupam muito espaço de armazém, preenchimento lento, ESG exigindo menos plástico',
    solucao: 'E-comfill V-FILLT PRO (126,5 m/min) + E-compaper Fill + BP555e para fechamento',
    resultados: {
      espaco_armazem: '-80% vs air pillows',
      velocidade: '126,5 m/min com anti-atolamento',
      eliminacao_plastico: '100% dos air pillows',
      roi_meses: 6,
      investimento: 250000,
    },
    tags: ['logística', '3PL', 'fulfillment', 'air-pillows', 'sustentável', 'alto-volume', 'armazém', 'ESG'],
    detalhe: { regiao: 'Brasil', volume: 'Alto volume (1000+ pacotes/dia)' },
    aprendizado:
      'O argumento matador em alto volume é espaço: rolos de papel planos contra montanhas de air pillows pré-inflados.',
  },
]

/* ══════════════════════════════════════════════════════════════════════════
   Matcher
   ══════════════════════════════════════════════════════════════════════════ */

/** Tags derivadas de la oportunidad, para cruzar contra las del caso. */
function tagsDaOportunidade(opp: Opportunity): string[] {
  const tags: string[] = []
  if (opp.industry) tags.push(opp.industry.toLowerCase())

  const produto = (opp.product ?? '').toLowerCase()
  if (produto.includes('bp')) tags.push('máquina')
  if (produto.includes('fita')) tags.push('fita')
  if (produto.includes('venom')) tags.push('anti-roubo')
  if (produto.includes('ecomfill')) tags.push('sustentável')
  if (produto.includes('sobre')) tags.push('sobres')
  if (produto.includes('resma')) tags.push('papel')
  if ((opp.value ?? 0) > 500_000) tags.push('enterprise', 'alto-volume')

  const dor = getScaleDescription(getScale(opp.scales, 'dor')).toLowerCase()
  if (dor.includes('roubo')) tags.push('anti-roubo')
  if (dor.includes('ergon')) tags.push('ergonomia')
  if (dor.includes('plástico') || dor.includes('sustentab')) tags.push('sustentável', 'anti-plástico')

  return tags
}

export interface CasoPontuado {
  caso: CasoDeExito
  pontos: number
}

/**
 * Los 2 casos más parecidos a esta oportunidad.
 *
 * La línea de producto manda: si el caso es de otra línea RESTA, no empata.
 * Un caso de anti-robo en una venta de E-comfill no es «menos relevante», es
 * un argumento equivocado que hace que el vendedor pierda credibilidad.
 */
export function casosRelevantes(opp: Opportunity | null | undefined, limite = 2): CasoDeExito[] {
  if (!opp) return []

  const tags = tagsDaOportunidade(opp)
  const linhas = opp.product_lines ?? []
  const dor = getScaleDescription(getScale(opp.scales, 'dor')).toLowerCase()
  const palavrasDaDor = dor.split(/\s+/).filter((p) => p.length > 3)

  const pontuados: CasoPontuado[] = []
  for (const caso of CASOS_DE_EXITO) {
    let pontos = 0

    if (linhas.length > 0) {
      pontos += caso.linhas.some((l) => linhas.includes(l)) ? 5 : -3
    }
    if (opp.industry && caso.setor.toLowerCase().includes(opp.industry.toLowerCase())) {
      pontos += 3
    }
    for (const tag of caso.tags) {
      if (tags.includes(tag)) pontos += 1
    }
    if (palavrasDaDor.length > 0) {
      const doCaso = caso.problema.toLowerCase().split(/\s+/)
      pontos += palavrasDaDor.filter((p) => doCaso.includes(p)).length * 0.5
    }

    if (pontos > 0) pontuados.push({ caso, pontos })
  }

  return pontuados
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
    .map((p) => p.caso)
}

/** El caso, listo para pegar en el prompt. Sin JSON: el modelo lee mejor prosa. */
export function textoDoCaso(caso: CasoDeExito): string {
  const resultados = Object.entries(caso.resultados)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'number' ? v.toLocaleString('pt-BR') : v}`)
    .join(' · ')
  const linhas = [
    `${caso.empresa} (${caso.setor})`,
    `  Problema: ${caso.problema}`,
    `  Solução: ${caso.solucao}`,
    `  Resultados: ${resultados}`,
  ]
  if (caso.aprendizado) linhas.push(`  Aprendizado: ${caso.aprendizado}`)
  return linhas.join('\n')
}

/** Bloque de casos para el contexto dinámico del prompt. */
export function blocoDeCasos(opp: Opportunity | null | undefined): string {
  const casos = casosRelevantes(opp)
  if (casos.length === 0) return ''
  return `CASOS DE ÊXITO COMPARÁVEIS (as ÚNICAS cifras que você pode citar de memória):\n${casos
    .map(textoDoCaso)
    .join('\n\n')}`
}

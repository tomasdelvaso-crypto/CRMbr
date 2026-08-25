// src/screens/GoldenHour/telefone.ts
// Normalización de teléfonos brasileños y deep links accionables.
//
// Por qué vive acá y no se usa solo `normalizeBrPhone` de @/core: el core
// acepta 10 dígitos y devuelve `+55` + 10, que es exactamente lo que wa.me
// rechaza con «número inválido». En la base de Ventapel hay celulares
// cargados SIN el noveno dígito (venían del ERP viejo y de planillas), y
// durante la Golden Hour un link muerto no se puede depurar: cuesta el toque.
// Acá se decide, dígito por dígito, si esos 10 son un fijo o un celular al
// que hay que devolverle el 9.
//
// Regla de negocio del noveno dígito (ANATEL, vigente en todo el país desde
// 2016): los móviles tienen 9 dígitos y empiezan con 9. Los fijos tienen 8 y
// empiezan con 2, 3, 4 o 5. Un número de 8 dígitos que empieza con 6, 7, 8 o 9
// es un móvil antiguo: se le antepone el 9.

import type { Channel, Lead } from '@/core'

/** DDDs que existen de verdad. '01', '10', '20', '23'… no son áreas válidas. */
const DDDS_VALIDOS: ReadonlySet<number> = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
  21, 22, 24, // RJ
  27, 28, // ES
  31, 32, 33, 34, 35, 37, 38, // MG
  41, 42, 43, 44, 45, 46, // PR
  47, 48, 49, // SC
  51, 53, 54, 55, // RS
  61, // DF
  62, 64, // GO
  63, // TO
  65, 66, // MT
  67, // MS
  68, // AC
  69, // RO
  71, 73, 74, 75, 77, // BA
  79, // SE
  81, 87, // PE
  82, // AL
  83, // PB
  84, // RN
  85, 88, // CE
  86, 89, // PI
  91, 93, 94, // PA
  92, 97, // AM
  95, // RR
  96, // AP
  98, 99, // MA
])

export interface TelefoneBr {
  /** E.164 listo para tel: y wa.me — `+5511987654321`. */
  e164: string
  /** Solo dígitos con el 55 adelante, que es lo que pide wa.me. */
  wa: string
  ddd: number
  celular: boolean
  /** Formato humano: `(11) 98765-4321`. */
  bonito: string
  /** true si le agregamos el noveno dígito que faltaba. */
  corrigido: boolean
}

/**
 * Normaliza cualquier cosa que un humano haya escrito en el campo teléfono.
 *
 * Acepta: `(11) 98765-4321`, `11987654321`, `+55 11 98765 4321`,
 * `0055 11 3456-7890`, `011 3456 7890`, `98765-4321` (con dddPadrao),
 * `11 8765-4321` (celular viejo sin el 9 → se corrige).
 *
 * Devuelve null cuando NO se puede garantizar el número. Nunca inventa un DDD
 * que no le pasaron: mandar un WhatsApp al DDD equivocado es peor que no
 * tener el link, porque el vendedor cree que tocó y no tocó.
 */
export function normalizarTelefoneBr(
  bruto: string | null | undefined,
  dddPadrao?: number,
): TelefoneBr | null {
  if (!bruto) return null

  let d = bruto.replace(/\D/g, '')
  if (d === '') return null

  // Prefijo internacional escrito como 00 (00 55 …).
  if (d.startsWith('00')) d = d.slice(2)
  // Código de país. Solo se saca si sobra: '5511987654321' (13) o
  // '551134567890' (12). Un '55' de 11 dígitos es un celular del DDD 55 (RS).
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  // Cero de operadora antes del DDD: 011, 021…
  if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1)

  // Sin DDD: 8 o 9 dígitos. Solo sirve si nos dieron uno por defecto.
  if ((d.length === 8 || d.length === 9) && dddPadrao !== undefined) {
    d = `${String(dddPadrao).padStart(2, '0')}${d}`
  }

  if (d.length !== 10 && d.length !== 11) return null

  const ddd = Number(d.slice(0, 2))
  if (!DDDS_VALIDOS.has(ddd)) return null

  let assinante = d.slice(2)
  let corrigido = false

  if (assinante.length === 8) {
    const inicial = assinante.charCodeAt(0) - 48
    if (inicial >= 6) {
      // Celular antiguo: le falta el noveno dígito.
      assinante = `9${assinante}`
      corrigido = true
    } else if (inicial < 2) {
      // 0xxx y 1xxx no son prefijos de assinante válidos.
      return null
    }
  } else if (assinante.charCodeAt(0) - 48 < 6) {
    // 9 dígitos que no empiezan con 6-9: no es un móvil válido.
    return null
  }

  const celular = assinante.length === 9
  const digitos = `${String(ddd).padStart(2, '0')}${assinante}`
  const corte = celular ? 5 : 4

  return {
    e164: `+55${digitos}`,
    wa: `55${digitos}`,
    ddd,
    celular,
    bonito: `(${String(ddd).padStart(2, '0')}) ${assinante.slice(0, corte)}-${assinante.slice(corte)}`,
    corrigido,
  }
}

/* ── Deep links ──────────────────────────────────────────────────────────── */

export interface LinkDeCanal {
  canal: Channel
  href: string
  rotulo: string
  /** Abre fuera de la PWA: el `target` cambia y el modo foco no se pierde. */
  externo: boolean
}

/** Perfil de LinkedIn: acepta URL completa, `in/slug` o solo el slug. */
export function linkLinkedIn(bruto: string | null | undefined): string | null {
  const li = (bruto ?? '').trim()
  if (li === '') return null
  if (/^https?:\/\//i.test(li)) return li
  const slug = li.replace(/^\/+|\/+$/g, '').replace(/^in\//i, '')
  if (slug === '') return null
  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}`
}

/**
 * El link accionable de un canal para este lead, con el rascunho precargado.
 * null cuando falta el dato: el botón se dibuja apagado, nunca muerto.
 */
export function linkDoCanal(canal: Channel, lead: Lead, mensagem?: string): string | null {
  switch (canal) {
    case 'whatsapp': {
      const tel = normalizarTelefoneBr(lead.contact_whatsapp ?? lead.contact_phone)
      if (!tel) return null
      // WhatsApp solo entrega a móviles: un fijo normalizado abre un chat que
      // no existe. Mejor no ofrecer el botón.
      if (!tel.celular) return null
      const base = `https://wa.me/${tel.wa}`
      return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base
    }
    case 'phone': {
      const tel = normalizarTelefoneBr(lead.contact_phone ?? lead.contact_whatsapp)
      return tel ? `tel:${tel.e164}` : null
    }
    case 'email': {
      const mail = (lead.contact_email ?? '').trim()
      if (mail === '' || !mail.includes('@')) return null
      const assunto = encodeURIComponent(`Ventapel · ${lead.company_name}`)
      const corpo = mensagem ? `&body=${encodeURIComponent(mensagem)}` : ''
      return `mailto:${mail}?subject=${assunto}${corpo}`
    }
    case 'linkedin':
      return linkLinkedIn(lead.contact_linkedin)
    default:
      return null
  }
}

const ROTULOS: Readonly<Record<Channel, string>> = {
  whatsapp: 'WhatsApp',
  phone: 'Ligar',
  email: 'E-mail',
  linkedin: 'LinkedIn',
}

/** Todos los links disponibles del contacto, en el orden en que se usan. */
export function linksDoContato(lead: Lead, mensagem?: string): LinkDeCanal[] {
  const ordem: readonly Channel[] = ['whatsapp', 'phone', 'email', 'linkedin']
  const links: LinkDeCanal[] = []
  for (const canal of ordem) {
    const href = linkDoCanal(canal, lead, mensagem)
    if (href === null) continue
    links.push({
      canal,
      href,
      rotulo: ROTULOS[canal],
      // tel: y mailto: los toma el SO en la misma pestaña; wa.me y LinkedIn
      // abren navegador y se llevarían la PWA con ellos si no fuera _blank.
      externo: canal === 'whatsapp' || canal === 'linkedin',
    })
  }
  return links
}

/** Teléfono mostrable del lead, ya normalizado. `null` si no hay ninguno. */
export function telefoneVisivel(lead: Lead): string | null {
  const tel =
    normalizarTelefoneBr(lead.contact_whatsapp) ?? normalizarTelefoneBr(lead.contact_phone)
  return tel?.bonito ?? null
}

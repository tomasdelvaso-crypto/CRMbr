// @vitest-environment jsdom
// src/host/__tests__/acao-critica.test.tsx
//
// El contrato «una acción crítica por pantalla», probado sobre un host falso
// que graba lo que le declaran. No monta Telegram: monta la MISMA interfaz que
// `criarHostTelegram()` implementa, que es lo que las pantallas ven.
//
// Dos cosas se fijan acá y las dos se rompieron en el camino:
//
//  1. El booleano. La pantalla llama al hook y NO pregunta dónde corre: si el
//     host dibuja el botón, la pantalla no dibuja el suyo.
//
//  2. EL ORDEN. React corre los efectos de abajo hacia arriba: los de un hijo
//     antes que los del padre. Un Sheet que declara su propio botón primario
//     (el editor de escala del Dossiê) es HIJO de la pantalla, así que si la
//     pantalla declarara desde el componente padre, su `esconder()` correría
//     DESPUÉS y borraría el botón del Sheet en el mismo commit. El patrón que
//     usa el Dossiê —declarar desde un hermano que va ANTES en el árbol— es lo
//     que este test fija.

import '@/app/__tests__/setup-jsdom'

import { act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { HostContext, useBotaoPrimario, type HostContextValue, type OpcoesDeBotao } from '@/host'
import type { ControleDeBotao, EstadoDoBotao, Host } from '@/host'

/** Lo último que el host tiene declarado. null = escondido. */
interface Gravador {
  estado: EstadoDoBotao | null
  tocar: () => void
}

function criarControle(g: Gravador): ControleDeBotao {
  return {
    nativo: true,
    definir(estado, aoTocar) {
      g.estado = estado
      g.tocar = () => void aoTocar()
    },
    esconder() {
      g.estado = null
    },
  }
}

function criarHostFalso(g: Gravador): Host {
  const inerte: ControleDeBotao = {
    nativo: true,
    definir: () => undefined,
    esconder: () => undefined,
  }
  return {
    tipo: 'telegram',
    plataforma: 'android',
    auth: {
      modo: 'telegram',
      entrar: () =>
        Promise.resolve({ ok: false, motivo: 'nao_aplica', mensagem: 'test' } as const),
    },
    botao: { primario: criarControle(g), secundario: inerte },
    back: { nativo: true, mostrar: () => () => undefined },
    haptics: { nativo: true, disparar: () => undefined },
    avisos: {
      canal: 'telegram',
      suporte: () => ({
        pode: false,
        motivo: 'sem_suporte',
        precisaInstalar: false,
        permissao: 'default',
      }),
      assinar: () => Promise.resolve({ ok: false, motivo: 'sem_suporte' } as const),
      cancelar: () => Promise.resolve(),
      permissao: () => 'default',
    },
    montar: () => () => undefined,
  } as unknown as Host
}

let root: Root | null = null
let caixa: HTMLDivElement | null = null

function montar(children: ReactNode, host: Host): void {
  const valor: HostContextValue = {
    host,
    entrada: 'pronto',
    falha: null,
    tentarDeNovo: () => undefined,
  }
  caixa = document.createElement('div')
  document.body.appendChild(caixa)
  const criado = createRoot(caixa)
  root = criado
  act(() => {
    criado.render(<HostContext.Provider value={valor}>{children}</HostContext.Provider>)
  })
}

afterEach(() => {
  act(() => root?.unmount())
  caixa?.remove()
  root = null
  caixa = null
})

/** Una pantalla cualquiera: declara y usa el booleano para no duplicar. */
function Tela({ opcoes }: { opcoes: OpcoesDeBotao | null }) {
  const nativo = useBotaoPrimario(opcoes)
  return <div>{!nativo && <button type="button">botão próprio</button>}</div>
}

describe('la acción crítica se declara al host', () => {
  it('cuando el host la dibuja, la pantalla no dibuja la suya', () => {
    const g: Gravador = { estado: null, tocar: () => undefined }
    let tocado = 0
    montar(
      <Tela
        opcoes={{
          rotulo: 'Iniciar Golden Hour',
          aoTocar: () => {
            tocado += 1
          },
        }}
      />,
      criarHostFalso(g),
    )

    expect(g.estado?.rotulo).toBe('Iniciar Golden Hour')
    expect(caixa?.querySelector('button')).toBeNull()

    act(() => g.tocar())
    expect(tocado).toBe(1)
  })

  it('sin acción declarada el host esconde el botón', () => {
    const g: Gravador = { estado: null, tocar: () => undefined }
    montar(<Tela opcoes={null} />, criarHostFalso(g))
    expect(g.estado).toBeNull()
    // Y la pantalla tampoco dibuja el suyo: no hay nada que ofrecer.
    expect(caixa?.querySelector('button')?.textContent).toBe('botão próprio')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   El orden: pantalla + Sheet
   ══════════════════════════════════════════════════════════════════════════ */

/** El hermano que declara por la pantalla. Es el patrón del Dossiê. */
function AcaoDaTela({ opcoes }: { opcoes: OpcoesDeBotao | null }): null {
  useBotaoPrimario(opcoes)
  return null
}

function TelaComSheet({ abrir }: { abrir: boolean }) {
  return (
    <div>
      {/* PRIMERO en el árbol: su efecto corre antes que el del Sheet. */}
      <AcaoDaTela
        opcoes={abrir ? null : { rotulo: 'Avançar para Negociação', aoTocar: () => undefined }}
      />
      <p>ficha</p>
      {abrir && <AcaoDaTela opcoes={{ rotulo: 'Salvar VALOR em 6', aoTocar: () => undefined }} />}
    </div>
  )
}

function Palco() {
  const [abrir, setAbrir] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbrir((v) => !v)}>
        alternar
      </button>
      <TelaComSheet abrir={abrir} />
    </>
  )
}

describe('el Sheet le gana el botón a la pantalla, y se lo devuelve', () => {
  it('abrir el editor deja «Salvar»; cerrarlo devuelve «Avançar»', () => {
    const g: Gravador = { estado: null, tocar: () => undefined }
    montar(<Palco />, criarHostFalso(g))
    expect(g.estado?.rotulo).toBe('Avançar para Negociação')

    const alternar = caixa?.querySelector('button')
    act(() => alternar?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    // Si la pantalla declarara desde el componente padre, acá habría null: su
    // esconder() correría después del definir() del Sheet.
    expect(g.estado?.rotulo).toBe('Salvar VALOR em 6')

    act(() => alternar?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(g.estado?.rotulo).toBe('Avançar para Negociação')
  })
})

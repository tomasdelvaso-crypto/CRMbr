// src/screens/Ventus/__tests__/rotas.test.ts
// Qué ocupa el pie de cada ruta.
//
// `microfoneFlutuanteVisivel` existe por un bug de campo (primer test en el
// Android del dueño, 27/08): el FAB «Registrar por voz» es `fixed z-40` y el
// compositor del Ventus es `sticky`, así que el FAB le quedaba ENCIMA del
// botón «Enviar» y tocarlo abría la grabadora en vez de mandar la pregunta.
// Ver el comentario grande en `../rotas.ts` y `QA.md` §3-bis.1.

import { describe, expect, it } from 'vitest'
import {
  ROTAS_COM_COMPOSITOR_PROPRIO,
  ROTAS_SEM_BARRA,
  barraDeComandoVisivel,
  microfoneFlutuanteVisivel,
} from '../rotas'

describe('microfoneFlutuanteVisivel', () => {
  it('se esconde en las rutas que traen su propio compositor', () => {
    // /ventus: el compositor de pantalla completa, con su «Ditar» y su «Enviar».
    expect(microfoneFlutuanteVisivel('/ventus')).toBe(false)
    // /registrar: la barra de acción con «Confirmar», que ya estaba contemplada.
    expect(microfoneFlutuanteVisivel('/registrar')).toBe(false)
  })

  it('cubre también las subrutas, no sólo el prefijo exacto', () => {
    // El chat abierto desde una ficha (?opp=123) y cualquier tramo más abajo:
    // el compositor es el mismo, así que el FAB tampoco puede aparecer.
    expect(microfoneFlutuanteVisivel('/ventus/qualquer-coisa')).toBe(false)
    expect(microfoneFlutuanteVisivel('/registrar/rascunho')).toBe(false)
  })

  it('sigue apareciendo en las pantallas donde es la acción principal', () => {
    for (const rota of ['/', '/carteira', '/carteira/46', '/placar', '/rituais', '/revisao']) {
      expect(microfoneFlutuanteVisivel(rota), `esperava o FAB em ${rota}`).toBe(true)
    }
  })

  it('no se contradice con la barra de comando: donde hay barra, el FAB vive dentro de ella', () => {
    // Invariante del Shell: el FAB flotante se pinta con
    // `mostrarMicrofoneFlutuante && !comBarra`. Las rutas con compositor propio
    // están TODAS en ROTAS_SEM_BARRA, así que nunca dependen de esa segunda
    // condición para esconderse — si alguien sacara una de la lista de la
    // barra, el FAB tiene que seguir escondido por mérito propio.
    for (const rota of ROTAS_COM_COMPOSITOR_PROPRIO) {
      expect(ROTAS_SEM_BARRA).toContain(rota)
      expect(barraDeComandoVisivel(rota, 'Renata')).toBe(false)
      expect(microfoneFlutuanteVisivel(rota)).toBe(false)
    }
  })
})

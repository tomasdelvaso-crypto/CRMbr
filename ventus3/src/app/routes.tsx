// src/app/routes.tsx
// Definición de rutas. Todo lo que vive dentro del Shell exige sesión;
// /login y /instalar son públicas (el link de instalación llega por Telegram).
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ CASI TODAS LAS PANTALLAS SON DIFERIDAS
// ══════════════════════════════════════════════════════════════════════════
// Con las 15 pantallas en un solo chunk el bundle daba 1,39 MB sin comprimir
// (412 kB gzip). Eso son varios segundos en la red de un galpão, y se pagan
// ANTES de ver la primera tarjeta del día. Partido por ruta, el arranque baja
// 347 kB (112 kB gzip) y el resto llega al tocar la tab.
//
// Dos pantallas quedan EAGER a propósito:
//   · Hoje  — es la ruta índice: diferirla sería un waterfall en el arranque.
//   · Login — es a donde manda la guardia de sesión; pedir un chunk para poder
//             decir «entre de novo» es la peor red en el peor momento.
//
// Offline: los chunks entran en el precache del service worker (globPatterns
// incluye **/*.js — 53 entradas, 1,4 MB), así que después de la primera visita
// la app sigue navegable entera en modo avión. Ver vite.config.ts.

import type { RouteObject } from 'react-router-dom'
import { Shell } from './Shell'
import { RouteError } from './RouteError'
import HojeScreen from '@/screens/Hoje'
import LoginScreen from '@/screens/Login'
import {
  AjustesScreen,
  CadenciaScreen,
  CarteiraScreen,
  DossieScreen,
  GestorScreen,
  GoldenHourScreen,
  InstalarScreen,
  KitchenSink,
  MaisScreen,
  PlacarScreen,
  RegistrarScreen,
  RevisaoScreen,
  RituaisScreen,
  RotaLenta,
  VentusScreen,
} from './telas'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HojeScreen /> },
      {
        path: 'carteira',
        element: (
          <RotaLenta variant="tiles-carteira" count={1}>
            <CarteiraScreen />
          </RotaLenta>
        ),
      },
      // O Dossiê é a ficha de UMA oportunidade.
      {
        path: 'carteira/:opportunityId',
        element: (
          <RotaLenta variant="dossie" count={1}>
            <DossieScreen />
          </RotaLenta>
        ),
      },
      {
        path: 'golden',
        element: (
          <RotaLenta variant="golden" count={1}>
            <GoldenHourScreen />
          </RotaLenta>
        ),
      },
      {
        path: 'registrar',
        element: (
          <RotaLenta variant="card-acao" count={2}>
            <RegistrarScreen />
          </RotaLenta>
        ),
      },
      {
        path: 'revisao',
        element: (
          <RotaLenta variant="revisao" count={2}>
            <RevisaoScreen />
          </RotaLenta>
        ),
      },
      {
        path: 'cadencia',
        element: (
          <RotaLenta variant="linha-cadencia" count={5}>
            <CadenciaScreen />
          </RotaLenta>
        ),
      },
      {
        path: 'placar',
        element: (
          <RotaLenta variant="placar" count={1}>
            <PlacarScreen />
          </RotaLenta>
        ),
      },
      {
        path: 'rituais',
        element: (
          <RotaLenta variant="rituais" count={1}>
            <RituaisScreen />
          </RotaLenta>
        ),
      },
      {
        path: 'ventus',
        element: (
          <RotaLenta variant="chat" count={3}>
            <VentusScreen />
          </RotaLenta>
        ),
      },
      {
        path: 'gestor',
        element: (
          <RotaLenta variant="lista" count={5}>
            <GestorScreen />
          </RotaLenta>
        ),
      },
      {
        path: 'ajustes',
        element: (
          <RotaLenta variant="lista" count={5}>
            <AjustesScreen />
          </RotaLenta>
        ),
      },
      {
        path: 'mais',
        element: (
          <RotaLenta variant="lista" count={5}>
            <MaisScreen />
          </RotaLenta>
        ),
      },
      // Vitrine do design system: é como revisamos as primitivas.
      {
        path: 'kitchen',
        element: (
          <RotaLenta variant="lista" count={4}>
            <KitchenSink />
          </RotaLenta>
        ),
      },
    ],
  },
  { path: '/login', element: <LoginScreen />, errorElement: <RouteError /> },
  {
    path: '/instalar',
    element: (
      <RotaLenta variant="lista" count={4}>
        <InstalarScreen />
      </RotaLenta>
    ),
    errorElement: <RouteError />,
  },
]

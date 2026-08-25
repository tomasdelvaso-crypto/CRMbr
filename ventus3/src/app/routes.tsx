// src/app/routes.tsx
// Definición de rutas. Todo lo que vive dentro del Shell exige sesión;
// /login y /instalar son públicas (el link de instalación llega por Telegram).

import type { RouteObject } from 'react-router-dom'
import { Shell } from './Shell'
import { RouteError } from './RouteError'

import HojeScreen from '@/screens/Hoje'
import CarteiraScreen from '@/screens/Carteira'
import DossieScreen from '@/screens/Dossie'
import GoldenHourScreen from '@/screens/GoldenHour'
import RegistrarScreen from '@/screens/Registrar'
import RevisaoScreen from '@/screens/Revisao'
import CadenciaScreen from '@/screens/Cadencia'
import PlacarScreen from '@/screens/Placar'
import RituaisScreen from '@/screens/Rituais'
import VentusScreen from '@/screens/Ventus'
import GestorScreen from '@/screens/Gestor'
import AjustesScreen from '@/screens/Ajustes'
import MaisScreen from '@/screens/Mais'
import InstalarScreen from '@/screens/Instalar'
import LoginScreen from '@/screens/Login'
import KitchenSink from '@/screens/Kitchen/KitchenSink'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HojeScreen /> },
      { path: 'carteira', element: <CarteiraScreen /> },
      // O Dossiê é a ficha de UMA oportunidade.
      { path: 'carteira/:opportunityId', element: <DossieScreen /> },
      { path: 'golden', element: <GoldenHourScreen /> },
      { path: 'registrar', element: <RegistrarScreen /> },
      { path: 'revisao', element: <RevisaoScreen /> },
      { path: 'cadencia', element: <CadenciaScreen /> },
      { path: 'placar', element: <PlacarScreen /> },
      { path: 'rituais', element: <RituaisScreen /> },
      { path: 'ventus', element: <VentusScreen /> },
      { path: 'gestor', element: <GestorScreen /> },
      { path: 'ajustes', element: <AjustesScreen /> },
      { path: 'mais', element: <MaisScreen /> },
      // Vitrine do design system: é como revisamos as primitivas.
      { path: 'kitchen', element: <KitchenSink /> },
    ],
  },
  { path: '/login', element: <LoginScreen />, errorElement: <RouteError /> },
  { path: '/instalar', element: <InstalarScreen />, errorElement: <RouteError /> },
]

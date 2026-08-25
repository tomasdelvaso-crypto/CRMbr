# Ventus v3 — Plano de Produto e Arquitetura

> Documento gerado a partir de uma auditoria completa do CRM v2, do bot de Telegram e de pesquisa de mercado (12 agentes, ~2M tokens). É a fonte única de verdade do projeto.

## Visão

**Ventus v3 no es un CRM con IA adentro: es un agente comercial con superficie, y el CRM es la mesa donde el vendedor y Ventus se ponen de acuerdo.**

El CRM actual es un repositorio honesto: guarda 65 oportunidades, R$2,1M de pipeline y 239 empresas mapeadas. Pero en cinco meses acumuló 18 interacciones comerciales humanas reales, 51 de sus 54 oportunidades vivas no tienen próxima acción con fecha, 48 de 54 leads tienen el toque vencido —hasta 136 días—, tres de los cuatro vendedores tienen cero leads mientras 83 empresas asignadas nunca entraron al sistema, y sus 4.521 notificaciones tienen exactamente 0,0% de lectura. El diagnóstico no es que la herramienta esté mal construida: **le pide al vendedor que le cuente lo que pasó, en vez de decirle lo que tiene que pasar.**

El v3 invierte la relación alrededor de un solo ritual diario. Victor Hugo abre la app y ve **tres** cosas para hacer hoy, cada una con el motivo escrito ("esta sale de Qualificação sólo con DOR≥5, y hoy está en 3"). A las 16h entra a su **Golden Hour**: una pantalla, timer corriendo, la fila cargada la noche anterior, el mensaje del touchpoint que toca ya redactado, y los otros tres prospectando al mismo tiempo. Sale de una visita, mantiene apretado un botón, habla cuarenta segundos en portuñol, y Ventus le devuelve el registro armado con la próxima acción con fecha y una propuesta: *"el cliente dijo que pierde 4 horas por semana reprocesando cajas mal cerradas — ¿subo DOR de 3 a 6?"*, con la cita al lado. Un tap. Todo eso funciona sin señal en el galpón, y todo eso pasa también dentro de Telegram —donde el equipo ya vive— con los mismos botones y el mismo cerebro, porque hay **un solo Ventus**, no dos.

La metodología no se toca: PPVVCC, gates, la cadencia de siete toques en veintiún días y los compromisos del lunes siguen siendo la verdad del negocio. Lo que cambia es que dejan de ser un formulario de autoevaluación y pasan a ser el motor de decisión, con una regla nueva y no negociable: **una escala solo sube si podés apuntar a algo que el comprador dijo o mandó.** Eso convierte el health score de opinión en evidencia y hace que la reunión del lunes sea honesta.

Y encima, un juego que no corrompe el dato: anillos que se cierran todos los días, una racha que se gana prospectando —no abriendo la app—, escudos que perdonan el día que se cayó la logística, y puntos que solo existen cuando el negocio avanza de verdad. Porque si la gamificación premia el registro, cuatro vendedores aprenden a inflar el registro en dos semanas y el CRM v3 nace podrido.

El objetivo es simple de enunciar y difícil de lograr: que un vendedor de Ventapel abra esta app cuarenta veces por día no porque se lo pidan, sino porque **es el lugar donde su trabajo se vuelve más fácil**.

## North Star

**Avanços Verificados por Vendedor por Semana (AVV).**

Un *avanço verificado* es un evento que cambia el estado real de un negocio **y tiene prueba adjunta**: (1) una escala PPVVCC que sube — o baja — con la cita textual de lo que el comprador dijo; (2) una reunión marcada como **realizada** (no agendada) con registro; (3) una oportunidad que avanza de etapa cumpliendo su STAGE_GATE con evidencia en las escalas del gate. Nada que el vendedor pueda fabricar solo cuenta.

**Baseline medido en la base al 24/08/2026:** 18 interacciones comerciales humanas en 5 meses entre 4 vendedores, 6 reuniones agendadas, 4 leads convertidos de 54 ≈ **0,3 AVV/vendedor/semana**.
**Meta 90 días: 5 AVV. Meta 180 días: 8.**

La métrica de *input* que lo produce, y sobre la que se construye toda la gamificación, es el **Dia Cheio**: Golden Hour completada (≥40 min, meta de toques, ≥1 conversa real, debrief) **+ ≥1 avanço com evidência**. Por construcción, Dia Cheio ⊃ AVV: la racha diaria genera el north star. Baseline 0,0 → meta 90 días: **4 de 5 días hábiles** en los 4 vendedores.

**Guardarraíles que no pueden empeorar mientras sube el AVV** (si empeoran, el AVV se está inflando):

| Métrica | Hoy | Meta |
|---|---|---|
| Oportunidades vivas con próxima acción **con fecha** | 4/65 (6%) | ≥95% |
| Leads activos con próximo toque **no vencido** | 6/54 (11%) | ≥80% |
| Tasa de lectura de notificaciones | **0,0%** (4.521 sin leer) | ≥50%, con ≤4 push/día |
| Registros efectivos / interacciones iniciadas | 13% (7 de 54 eventos del bot) | ≥80% |
| p95 "apretar mic → registro confirmado" | — | ≤45 s |
| Registros perdidos por falta de señal | — | **0** |
| Ratio de eventos con evidencia | 0% | ≥70% (bajo eso se congela el juego) |
| Accept rate de recomendaciones de Ventus | — | ≥40% (bajo eso, la regla se apaga) |

**Anti-métricas que el v3 mata explícitamente, no silencia:** el "SPIN %" (cuenta caracteres `✓` en textareas y divide por 84), la "saúde do vendedor" del AdminDashboard (fórmula ad-hoc `10 − días/5`, sin relación con el health PPVVCC) y "días sin movimiento" medido contra `last_update` (que se pisa al corregir un typo). Se explican de frente en el lanzamiento: si el equipo se acostumbró a esos números, el salto hay que contarlo, no esconderlo.

## Telas

### 1. Hoje

**Pantalla de arranque y única respuesta a «o que eu faço agora?». Reemplaza el dashboard: acción primero, KPIs después.**

- Header con los 3 anéis (Contato/Conversa/Avanço) cerrándose en tiempo real vía realtime, con largada dotada en 2/12
- Racha de Golden Hour con llama + escudos disponibles
- Exactamente 3 cards priorizados por el motor determinístico (nunca más), cada uno con cliente, la acción concreta, el chip «Por que isto?» y 2 botones: Fazer agora / Adiar
- Botón grande «Iniciar Golden Hour» con el contador de la fila precargada («12 contatos prontos»)
- Corrente do time: 4 avatares con el anillo de Avanço de cada compañero + high-five
- Estado terminal «Pronto por hoje» — NO recarga otras 3
- Lista secundaria colapsada «Ver tudo (17)», que hay que abrir a propósito
- FAB persistente de micrófono + badge de registros pendientes de envío

_Mobile:_ 100svh (no dvh), viewport-fit=cover + env(safe-area-inset-*), overscroll-behavior-y:contain. Swipe derecha = Feito (haptic + colapso + undo 5s), izquierda = Adiar (sheet: mais tarde / amanhã / segunda). Renderiza desde Dexie en <100ms sin red y revalida en background. Skeletons con la forma exacta del card, cero spinners. En Mini App el MainButton nativo se reserva para «Iniciar Golden Hour».

### 2. Golden Hour (modo foco)

**Bloque diario de prospección protegido: una sola pantalla, sin navegación, sin edición de campos, sin dashboards. Es donde se genera el pipeline.**

- Timer regresivo grande + Screen Wake Lock activo
- Card a pantalla completa: empresa, contacto, cargo, canal que toca según CADENCE_SCHEDULE (TP1 linkedin d1 … TP7 whatsapp d21), último toque y su resultado, y el rascunho listo para ese canal y ese TP
- 4 botones grandes: Ligou / Falou / Agendou / Passar — cada uno registra el touchpoint y trae el siguiente
- Deep links: wa.me con +55 normalizado y mensaje precargado, tel:, mailto:, LinkedIn
- HUD: toques vs meta, conversas, y barra «Here Now» con quién más está en Golden Hour ahora (solo estado, sin ranking) + high-five con haptic cruzado
- Nota de voz de 15s entre contactos, transcripta después de la hora
- Confetti + haptic + anuncio en Telegram al instante al agendar una reunión
- Cierre no salteable de 60s: resumen, 3 preguntas de debrief por voz o tap, y sello Hora Cheia

_Mobile:_ Full-bleed sin chrome. La fila viene precargada desde IndexedDB: funciona completa en modo avión y sincroniza al salir. Carrusel horizontal con overscroll-behavior:contain (bug de Safari). El back del sistema pide confirmación («Sair da Golden Hour? Faltam 22 min»). requestFullscreen() en el Mini App.

### 3. Registrar (voz em 1 tap)

**La puerta principal de entrada de datos. Tiene que costar menos que abrir la libreta.**

- Botón hold-to-talk gigante con waveform en vivo (AnalyserNode), haptic al iniciar y al soltar
- Alternativas: teclado, colar e-mail o conversa de WhatsApp, foto (share_target en Android)
- Tarjeta de confirmación con chips editables: cliente matcheado (o botones de desambiguación), tipo, resumo, resultado
- Gate duro con **botones** de fecha: Hoje / Amanhã / Segunda / +7d / Escolher — nunca texto libre
- Bloque «Ventus sugere» con los deltas PPVVCC y la CITA textual que los justifica, accept/edit/dismiss por escala
- Contactos por rol detectados (solo rellenan huecos, nunca pisan)
- ✅ Confirmar · ✏️ Corrigir falando · ❌ Descartar

_Mobile:_ MediaRecorder con negociación de mimeType (audio/webm;codecs=opus → audio/mp4 en iOS ≤18.3). **Nunca webkitSpeechRecognition**: pasa el feature detection y falla en silencio en PWA standalone en iOS. El blob va a IndexedDB antes de subir. Inputs ≥16px, inputmode y enterkeyhint correctos, barra de acción levantada con visualViewport.

### 4. Revisão do Ventus

**La bandeja donde el agente propone y el humano decide. Nada capturado se pierde.**

- Cada ítem: valor antigo → valor novo, con la cita textual y su fuente (áudio / e-mail / reunião) y el nivel de confianza
- Accept / Edit / Dismiss **por campo**, no por ítem completo
- Al rechazar: 3 razones fijas (dado errado / já fiz isso / não é prioridade agora)
- Sección de registros del bot que no matchearon cliente, con [Vincular a…]
- Sección de empresas de market_sweep asignadas sin lead y de sinais de mercado
- Los ítems expiran a las 48h y lo dicen

_Mobile:_ Swipe derecha = aceitar, izquierda = descartar, con colapso animado. Badge con contador en la bottom nav y en navigator.setAppBadge. Objetivo de diseño: llegar a cero todos los días.

### 5. Dossiê do Cliente

**Todo lo que importa en un scroll, para leerlo en el estacionamiento antes de entrar a la planta.**

- Header pegajoso: nombre, health verificado, etapa, valor, y [Ligar] [WhatsApp] [Registrar voz]
- Bloque «Próximo passo» con la task, su estado y botones Feito / Reagendar
- Hexágono PPVVCC: cada escala con badge de evidencia (verde con cita / âmbar «sem evidência há 45 dias» / vermelho «nunca documentada»)
- Bloque de gate: «Para sair de Validação/Teste falta VALOR ≥ 6 (hoje 4)» + 2-3 preguntas concretas para ESTE cliente, copiables
- Mapa de stakeholders por rol, con los faltantes en gris y alerta de single-threading
- Timeline unificado append-only: activities + touchpoints + stage_change + notas de voz con su transcripción, con badge de origen (🎙 / 🤖 / ✋ / 💬)
- «O que prometi»: commitments vinculados con su veredicto
- Líneas de producto, valor, fecha de cierre, outcome y lecciones

_Mobile:_ Sin tabs internos: todo scroll con secciones colapsables y estado recordado. Header con view-transition-name para hacer morph desde la lista. **Una sola query**: la ficha viene de una vista agregada, cero paneles de actividad embebidos por fila.

### 6. Editor de escala PPVVCC

**Que mover una escala sea un gesto de 10 segundos, con evidencia obligatoria.**

- Los 11 niveles canónicos de SCALE_DEFINITIONS como lista tocable (elegir uno setea score y texto de golpe)
- Stepper de 0-10 en la zona del pulgar — nada de input type=range
- Campo de evidencia obligatorio por encima de 5: quem disse, cargo, quando, e a citação (dictable por voz o seleccionable desde el timeline)
- Preview del efecto: «Isto destrava a Negociação» o «Faltará ainda COMPRAS ≥ 6»
- Historial de la escala con quién la movió y con qué evidencia
- Banco de perguntas SPIN de esa escala, con las ya usadas marcadas y **persistidas**

_Mobile:_ Bottom sheet arrastrable y descartable; MainButton (nativo en Telegram, fijo sobre safe-area en la PWA) = Salvar. Cambio optimista que entra al outbox. El gate se revalida SIEMPRE en el servidor: el cliente puede estar con datos viejos.

### 7. Carteira

**Buscar y triar rápido cuando el vendedor quiere guiarse solo. Deliberadamente secundaria.**

- 6 Smart Views como tiles con contador: «Sem toque há 15+ dias» · «Gate travado» · «TP de cadência atrasado» · «Sem próxima ação com data» · «Fechamento este mês» · «Compromisso sem veredicto»
- Vista compacta por default: 72px por fila con nombre, cliente, etapa, health, días sin contacto y semáforo de riesgo
- Búsqueda con debounce + chips de filtros activos persistidos + contador de resultados
- Swipe: derecha = registrar, izquierda = adiar
- Pool de oportunidades sem dono con botón Assumir

_Mobile:_ Lista virtualizada. **Cero queries por fila**: una vista agregada devuelve la próxima acción y los días sin contacto ya resueltos (hoy abrir el tab dispara ~195 queries). Filtros en un sheet, no en dropdowns.

### 8. Cadência (fila, não kanban)

**Mantener vivo el funil 1a-1d fuera de la Golden Hour, sin scroll anidado.**

- Lista única ordenada por next_touchpoint_date **real** (no por umbral fijo de 3/5 días)
- Cada fila: empresa, contacto, 7 puntitos de progreso, canal del próximo TP, días de atraso
- Segmented control 1A/1B/1C/1D para filtrar, no para apilar columnas
- Sheet de lead: contactos con links accionables, timeline de touchpoints, rascunho del próximo toque por canal
- Botón «Converter em oportunidade» SIEMPRE disponible, no solo al registrar meeting_scheduled
- Botón «Puxar do mapa de mercado»: las 83 empresas asignadas sin lead, a un tap
- Aviso de colisión de empresa al escribir el nombre: advierte sin bloquear

_Mobile:_ Kanban solo en tablet/desktop. Prohibido el scroll anidado en móvil (hoy son 4 cajas de max-h-60vh apiladas dentro del scroll de la página). Drag&drop eliminado: la etapa se mueve sola según el resultado del touchpoint. Safe-area-inset-bottom en el panel (hoy el botón de registrar queda bajo el home indicator).

### 9. Placar da Semana

**Presión social sana en un equipo de 4 sin fabricar tres perdedores permanentes.**

- «Eu vs eu»: esta semana contra mi promedio de 4 semanas, por métrica
- «Time»: cuatro carriles paralelos con % contra la meta propia — SIN posiciones, SIN ranking
- Los 5 troféus de la semana (Motor, Escalador, Conversador, Zelador, Reanimador), revelados viernes 17h
- Barra colectiva mensual con la recompensa votada por el equipo
- Bilhetes de la temporada y récords históricos
- Kudos: 5 por semana, no acumulables, con texto obligatorio

_Mobile:_ Cards horizontales con overscroll-behavior:contain. Celebración de trofeo con confetti + haptic + eco en Telegram. Toda métrica es tocable y explica cómo se calculó. Nunca se muestra a nadie como «último».

### 10. Rituais (manhã / encerramento / segunda / sexta)

**Convertir la cola impuesta por el sistema en compromiso propio, y capturar el día cuando está fresco.**

- MANHÃ (antes de las 10h): «Escolha suas 3 prioridades» con las sugerencias precargadas + aviso de sobrecarga basado en el histórico
- Frase si-entonces de la Golden Hour visible y confirmable
- NOITE (18h): planeado vs hecho, 1 tap por ítem (feito / não rolou / reagendar), arrastre a mañana, y prompt de registro por voz
- SEGUNDA: declarar 3 compromissos **eligiéndolos de la cola**, no escribiéndolos de cero
- SEXTA 16h: veredicto con 3 botones (cumprido / parcial / não rolou), con el veredicto que Ventus propone cruzando commitments vs activities/touchpoints

_Mobile:_ Máximo 3 pantallas de ≤20 segundos cada una, con progreso visible y salida sin castigo. Nunca bloquean el uso de la app. Se completan enteros desde Telegram con inline keyboards, sin abrir la app.

### 11. Ventus (chat + barra de comando)

**El acceso conversacional al agente: preguntar, navegar o escribir en lenguaje natural.**

- Barra persistente sobre la bottom nav, con botón de mic
- Muestra SIEMPRE lo que va a hacer antes de hacerlo (preview de la acción)
- Consultas instantáneas sin tokens: pendências, status de cliente, sem toque há N dias, pipeline, compromissos
- Coaching contextual dentro de la ficha: diagnóstico + una jugada concreta con el texto listo
- Feedback 👍/👎 en cada respuesta con 3 razones fijas
- Historial persistido por oportunidad

_Mobile:_ Streaming obligatorio (hoy no hay y produce 504s silenciosos que el vendedor lee como «la app se colgó»). Bottom sheet expandible con drag-to-dismiss. enterkeyhint='send'; NO usar onKeyPress (deprecado y poco confiable en teclados Android). Sin red responde el motor determinístico con aviso claro.

### 12. Painel do Gestor

**Coaching semanal específico para Jordi y Tomás, no un tablero de números.**

- Por vendedor: qué se movió (escalas que subieron CON evidencia), qué se estancó, % de compromissos, actividad vs cookbook, y UNA sugerencia de coaching anclada en PPVVCC
- Alertas de riesgo accionables: single-threaded, silêncio >21d en etapa ≥4, regressão de escala, gate falso, ação vencida >7d, proposta sem resposta >14d
- Cola de calibración con los patrones que marcó la auditoría automática — para revisar juntos, nunca para penalizar solo
- Salud del sistema: accept rate de las recomendaciones por tipo, tasa de lectura de notificaciones, ratio de eventos con evidencia, adopción por vendedor
- Nombres de etapa **correctos**: Prospecção / Qualificação / Apresentação / Validação-Teste / Negociação / Fechado

_Mobile:_ Optimizada para tablet y desktop, usable en teléfono. El resumen de 6 líneas por vendedor llega por Telegram el viernes 17h. Nada de recalcular payloads analíticos en el cliente: todo sale de vistas/RPC.

### 13. Ajustes, Metas e Conexões

**Autonomía sobre la meta y sobre el ruido. Incluye el opt-out real de la gamificación.**

- Cookbook semanal: toques, conversas, reuniões, avanços — propuesto desde el histórico de 4 semanas, ajustable ±30%
- Golden Hour: horario y días como frase si-entonces
- Vinculación de Telegram por **código de emparejamiento** generado en la app (no por @username, que es suplantable)
- Notificaciones: presupuesto diario (máx 4), quiet hours, tipos y canal preferido
- Opt-out real: apagar anillos y rachas y quedarse con agenda y recordatorios, sin perder acceso a nada
- Estado de sincronización: registros pendientes, último sync, forzar envío, uso de almacenamiento
- «Regras do jogo» con historial de cambios y autor
- Tema: claro / escuro / sistema

_Mobile:_ El prompt de permiso de notificaciones sale SIEMPRE de un tap explícito (en useEffect iOS lo rechaza en silencio). En Android se captura beforeinstallprompt para ofrecer Instalar in-app; en iOS, pantalla de coaching con la animación de Compartilhar → Adicionar à Tela de Início.

### 14. Onboarding e Instalação (/instalar)

**Que el alta termine con la app instalada, Telegram vinculado y la primera Golden Hour cargada. Hoy 3 de 4 vendedores no pueden usar el bot y Paulo tiene cero filas en cinco meses.**

- Página pública /instalar en PT-BR con QR, link al APK y capturas paso a paso, incluyendo el aviso de Play Protect («App não verificada → Instalar mesmo assim»)
- Sección iOS separada: Compartilhar → Adicionar à Tela de Início (requisito absoluto para push)
- Código de emparejamiento de Telegram de 6 dígitos con TTL
- Primer cookbook asistido con valores propuestos y la frase si-entonces de la Golden Hour
- Primera Golden Hour guiada con 10 empresas ya cargadas desde market_sweep

_Mobile:_ El link se manda por el propio bot. Procedimiento adb documentado como ruta blindada por si el trámite de Google se demora. Verificación de assetlinks en teléfono real: si aparece la barra de Chrome, falló.

## Features MVP

### M1. Motor determinístico de Próxima Melhor Ação (rankDay) (M)

Función pura en `packages/core/planner.ts`: score = f(gate PPVVCC bloqueado por la escala más baja, días desde el último contacto real vía getDaysSinceLastContact, tarea vencida, touchpoint atrasado contra CADENCE_SCHEDULE, valor, riesgo de single-threading). Devuelve las 3 mejores con {acción, motivo estructurado, escala_alvo, preguntas_sugeridas desde SCALE_DEFINITIONS}. Cero llamadas a LLM.

**Por quê:** Es el 'decíle qué hacer ahora' del brief. Toda la señal ya existe en la base y nadie la usa para priorizar. Determinístico significa que corre offline, cuesta 0 tokens y el vendedor puede auditar el porqué — requisito para que un equipo chico y desconfiado le crea.

### M2. Tela Hoje con límite duro de 3 acciones y swipe para resolver (M)

Home con 3 cards máximo, chip 'Por que isto?' que despliega las 2-3 señales, swipe derecha=Feito (abre registro), izquierda=Adiar con picker rápido, undo de 5s, anillos en el header, chips de zona (Prospecção/Avanço/Fechamento). Al completar las 3 dice 'Pronto por hoje' y NO trae más.

**Por quê:** El fallo de producto más grande del v2: el panel de acciones pendientes es 100% read-only — se ve 'Atrasada · Ligar pro comprador' y hay que ir a otro tab, encontrar la tarjeta y scrollear ~600px para resolverla. El límite de 3 es lo que convierte un repositorio en un asistente.

### M3. Tarefa (tasks) como entidad de primera clase (M)

Tabla con dueño, oportunidad o lead, canal, fecha obligatoria, estado, origen (manual/ia/bot/cron), draft_content y expected_outcome. Un trigger en la BASE proyecta la más próxima a opportunities.next_action, en vez de depender de que 3 clientes llamen a syncNextAction.

**Por quê:** Hoy 51 de 54 oportunidades vivas no tienen fecha, y el bot escribe next_action con source='ai_parsed' que el CRM le borra al primer uso del panel. Sin esto, 'la agenda que te recuerda' no tiene sobre qué apoyarse. Además el action plan de la IA hoy tira priority, action_type y expected_outcome al persistir.

### M4. Registro por voz en 1 tap, mismo motor en app, bot y Mini App (M)

Hold-to-talk con MediaRecorder (negociación webm/opus → mp4 en iOS ≤18.3), blob a IndexedDB ANTES de subir, Groq whisper-large-v3-turbo sin fijar language (banca portuñol), extracción con claude-sonnet-5 y structured outputs reusando el system prompt validado del bot, match contra la cartera real, y tarjeta de confirmación con chips editables.

**Por quê:** El pipeline ya está probado con la jerga del negocio pero solo vive en Telegram, no llega a la mitad del equipo y tiene 13% de éxito por el .oga y por pedir la próxima acción en texto libre. Traerlo a la app con botones de fecha ataca el 43% de respuestas incompletas medido en bot_log.

### M5. Gate de próxima acción con botones de fecha (S)

Ningún registro cierra sin próxima acción CON fecha, pero la fecha se elige con botones (Hoje / Amanhã / Segunda / +7d / Escolher), nunca escribiéndola.

**Por quê:** El gate ya existe en el bot y es la mejor regla del sistema; lo que falla es la entrada. 7 de 16 respuestas quedaron 'next_action_incomplete'. Cambiar texto libre por botones es barato y es el fix de mayor impacto por línea de código de todo el plan.

### M6. Evidencia obligatoria en las escalas PPVVCC (M)

Tabla scale_evidence con CHECK que impide pasar de 5 sin quote. La UI muestra tres estados por escala (verde con cita / âmbar 'sem evidência há 45 dias' / vermelho 'nunca documentada') y DOS números: health declarado y health verificado (solo escalas con prova de los últimos 90 días).

**Por quê:** Es el mayor upgrade posible al PPVVCC sin cambiar la metodología. Hoy los scores son autoevaluación pura, la columna health_score promedia 1,72 contra 3,77 real, y hay 10 oportunidades con las 6 escalas en 0. Con evidencia el health deja de ser opinión y los gates dejan de ser burocracia sorteable.

### M7. Editor de escala con niveles canónicos y stepper (S)

Bottom sheet con los 11 niveles de SCALE_DEFINITIONS como lista tocable (elegir uno setea score y texto), stepper de 0-10 en la zona del pulgar, campo de evidencia dictable por voz, preview del efecto ('Isto destrava a Validação/Teste') e historial de la escala.

**Por quê:** La pieza de metodología mejor construida del v2 está mal adaptada a touch: el input type=range nativo es imposible de precisar con el dedo, y el estado de las perguntas SPIN usadas se pierde al cerrar el modal.

### M8. Propose-then-commit con idempotencia y staleness check (M)

Tabla ventus_actions con payload, evidencia, confianza, precondition_hash e idempotency_key. Commit valida que el registro no cambió desde que Ventus lo leyó, ejecuta una sola vez y escribe en ventus_audit (inmutable). Confianza graduada: alta auto-commitea, media va a Revisão con accept/edit/dismiss POR CAMPO, baja pregunta.

**Por quê:** Van a escribir cuatro superficies sobre las mismas tablas (app, bot, Mini App, cron). El bot ya sufre el doble-registro por doble-tap. El primer duplicado o el primer pisado silencioso destruye la confianza en el asistente y eso no se recupera.

### M9. 14 tools tipadas con strict:true en vez de SQL genérico (M)

ventus_registrar_atividade, ventus_definir_proxima_acao, ventus_atualizar_escala, ventus_avancar_etapa, ventus_criar_touchpoint, ventus_converter_lead, ventus_marcar_commitment, ventus_redigir_mensagem, ventus_adiar_acao, ventus_registrar_sinal_comprador, ventus_arquivar_lead, ventus_buscar_carteira, ventus_ler_oportunidade, ventus_agendar_lembrete. Identificadores naturales, errores que guían al modelo.

**Por quê:** Con tools separadas se decide por acción cuál corre sola y cuál pide confirmación, cuál se audita y cuál se renderiza distinto. Un bash/SQL genérico le da al harness un string opaco y no hay dónde poner el gate.

### M10. Gates PPVVCC no evadibles, validados en Postgres (S)

RPC avancar_etapa() con SECURITY DEFINER que revalida checkStageRequirements contra el estado actual, registra la actividad stage_change y persiste el override con motivo y autor si lo hay.

**Por quê:** Hoy los gates se saltan tildando un checklist local que nunca se guarda, y moveStage no deja rastro en el timeline. El cliente además puede estar operando con datos de hace dos horas.

### M11. Golden Hour: fila de la víspera, modo foco, timer y debrief (L)

Job 18h que arma la fila y la manda por Telegram para aprobar con un tap; push T-15; pantalla full-screen SIN navegación ni edición de campos, Wake Lock, carrusel de un contacto por vez con el rascunho del canal que toca, 4 botones, HUD 'Here Now' con high-five; cierre de 60s con 3 preguntas y sello Hora Cheia.

**Por quê:** Es el objetivo declarado del proyecto y hoy no existe nada. La cadencia muere en el TP3 (44→39→30→24→15→9→7) y 48 de 54 leads tienen el toque vencido hasta 136 días. La regla del power hour es 'nada de gestión de CRM durante la hora': si la app deja navegar, la hora se convierte en higiene de datos.

### M12. Cadência como fila, no como kanban (M)

Lista ordenada por next_touchpoint_date real (no por umbral fijo de 3/5 días), chips de filtro 1A-1D, panel de lead con links accionables, rascunho por canal y TP, botón Converter SIEMPRE disponible que crea la task, y fix del borrado de touchpoint.

**Por quê:** El kanban actual apila 4 columnas con max-h-60vh y overflow interno: scroll anidado dentro del scroll de la página, la peor experiencia táctil posible. Y tres bugs concretos rompen el funnel: el calendario es decorativo, la conversión solo se dispara con meeting_scheduled, y borrar un touchpoint deja el lead corrupto.

### M13. Puente market_sweep → lead en un tap (S)

RPC promote_sweep_to_lead() y pantalla que lista las empresas asignadas con crm_lead_id NULL, con su enrichment, validando anti-duplicado contra los índices únicos parciales de cnpj_raiz y domain_normalized más check_company_collision.

**Por quê:** 83 empresas asignadas a Victor Hugo, Renata y Paulo nunca entraron al CRM — es exactamente por eso que esos tres tienen CERO leads. Son 83 arranques de prospección listos para la Golden Hour del día 1, sin prospección nueva.

### M14. Offline-first: cache de cartera + outbox de mutaciones (XL)

Dexie con la cartera del vendedor y la fila de Golden Hour; toda escritura entra al outbox con client_uuid y se aplica optimista; flush por evento sync del SW, por online y por visibilitychange; badge visible de pendientes; append-only para activities/touchpoints y LWW por CAMPO para escalas y etapa.

**Por quê:** Los vendedores registran en plantas y galpones sin señal. Si la app pierde una nota una vez, vuelven a la libreta y no hay segunda oportunidad. Y iOS no tiene Background Sync: el fallback por visibilitychange no es un extra, es el mecanismo principal en la mitad de los dispositivos.

### M15. Dispatcher único de notificaciones con presupuesto (M)

Una cola con dos transportes (Web Push VAPID y Telegram), máximo 4 pushes/día, quiet hours 20-7h, dedupe por (vendor, entidad, tipo) con snooze, header Topic para colapsar, TTL corto, acción directa en cada aviso y medición obligatoria de lectura y de acción por tipo.

**Por quê:** Hoy hay 4.521 notificaciones de 2 tipos con 0,0% de lectura — una oportunidad acumula 106 en 106 días y un vendedor recibe hasta 17 diarias. El canal ya está entrenado como ruido: si el v3 le conecta push encima sin política, el equipo lo silencia la primera semana.

### M16. Telegram como control remoto: /hoje, /golden y avisos accionables (M)

Los 3 cards con inline keyboard [✅ Feito] [⏰ Amanhã] [🎙 Registrar] [📋 Abrir no app], mensajes que se EDITAN in-place, callback_data namespaced y versionado, answerCallbackQuery siempre, /golden que sirve un lead por mensaje, /desfazer, y veredicto de compromissos con 3 botones.

**Por quê:** Telegram es el único canal donde la notificación siempre llega (en iOS el Web Push exige instalación manual). Cerrar la acción sin abrir la app significa que el CRM se actualiza aunque el vendedor nunca la abra ese día.

### M17. Telegram Mini App con el mismo codebase (L)

Un solo build con adapter useHost() que abstrae 5 cosas (auth, botón primario, back, haptics, notificaciones). Auth por initData validado server-side con expiración por auth_date → JWT de Supabase → RLS. Theming de los 14 params, MainButton con loading, CloudStorage, addToHomeScreen en la 3ª sesión, deep links con start_param.

**Por quê:** Un equipo chico no puede mantener tres frontends, y el Mini App le da a Telegram el CRM completo en vez de una versión chat degradada. addToHomeScreen es además el camino de instalación que iOS le niega a la PWA.

### M18. Vinculación de Telegram por código, no por @username (S)

Código de 6 dígitos generado en la app con TTL de 10 min, tabla vendor_channels con múltiples chats por vendedor y verificación de admin para las capacidades de escritura.

**Por quê:** Solo 3 de 6 vendors tienen telegram_id: Victor Hugo, Andre y Paulo no pueden usar el bot y ni siquiera pueden autovincularse. Y el autolink por @username se lo lleva quien tome el username primero — inaceptable cuando el bot escribe en el CRM.

### M19. Anillos diarios + racha de Golden Hour con escudos (M)

Contato/Conversa/Avanço con largada dotada en 2/12, metas derivadas del cookbook semanal que el propio vendedor negocia (±30% sobre lo propuesto desde su histórico), y una sola racha atada a Hora Cheia — no al login — con 2 escudos ganados aplicados en silencio y día de resgate.

**Por quê:** El comportamiento a instalar es diario, no mensual. Una racha atada a abrir la app produce exactamente la conducta que no queremos. Y sin mecanismo de perdón, el día que alguien rompe su primera racha larga es el día que deja de usar el sistema.

### M20. Economía de Pontos de Avanço con las cuatro defensas (M)

scoring_rules versionadas en base + points_ledger append-only. Regra da prova (>20 PA exigen artefacto), techos diarios por categoría, clawback diferido (reunião agendada 10 PA provisorios → 40 al realizarse → 0 en no-show), y peso por señal del comprador (1-3 PA el vendedor vs 15-50 el cliente). Lanzamiento con 2 semanas de shadow mode.

**Por quê:** Si se premiara 'actividades registradas', 4 vendedores aprenden a inflar el registro en dos semanas y el CRM v3 nace con el dato podrido. Es la ley de Goodhart aplicada al único activo del proyecto. Las defensas se construyen ANTES que los puntos.

### M21. Placar de 4 carriles y 5 trofeos rotativos, sin ranking (M)

Cuatro carriles paralelos con % contra la meta propia, sin posiciones. Viernes 17h se entregan Motor, Escalador, Conversador, Zelador y Reanimador con constraint UNIQUE que impide ganar dos. Meta colectiva votada, kudos 5/semana con texto obligatorio, temporadas de 4 semanas con sorteo por bilhetes.

**Por quê:** Con n=4 un leaderboard produce un ganador y un último público permanente que es el 25% del equipo comercial, sentado en la misma sala. 5 títulos y 4 personas = todos ganan algo casi siempre. 'Zelador' convierte la higiene del dato en estatus.

### M22. Base mobile nativa: gestos, transiciones, safe-area, haptics (M)

viewport-fit=cover + env(safe-area-inset-*) en todos los bordes, 100svh, overscroll-behavior contain, View Transitions API para navegación stack y morph de elemento compartido, bottom sheets con drag-to-dismiss, swipe-to-action, wrapper haptic(), inputs a 16px con inputmode y enterkeyhint, barra de acción sobre el teclado con visualViewport, dark mode desde el día 1.

**Por quê:** Son los detalles que separan 'una web en el celular' de 'una app'. Hoy hay 27 alert()/confirm() que en una PWA standalone en iOS muestran el dominio y rompen la ilusión por completo, cero gestos, cero haptics y cero dark mode.

### M23. APK cáscara instalado antes del 30/09 + pipeline TWA (M)

Limited Distribution Account tramitada, keystore custodiado, assetlinks.json con Content-Type correcto, enableNotifications:true, GitHub Action por tag y página /instalar en PT-BR con QR. El APK se instala en la semana 4 con la app a medio hacer y se llena solo con cada deploy web.

**Por quê:** Brasil es mercado piloto de la Android developer verification y el deadline es en ~5 semanas. Como el TWA carga la URL, no hace falta esperar a que la app esté lista: instalar temprano convierte un deadline externo en un trámite de la semana 4 en vez de un bloqueo de la semana 20.

### M24. Reset de seguridad y de identidad de la base (M)

DROP de la policy 'Enable all for development', REVOKE a anon, una policy permissive por acción sobre authenticated con WITH CHECK y auth envuelto en (select ...), vistas a SECURITY INVOKER, vendor_id uuid con backfill en 6 tablas, realtime habilitado por tabla, 12 índices nuevos y ANALYZE.

**Por quê:** Hoy cualquiera con el anon key del bundle lee y escribe los R$2,1M de pipeline y los datos de contacto de 54 leads; renombrar a un vendedor le vacía la cartera sin error; y el realtime anunciado en el stack tiene cero tablas. Es bloqueante: si el v3 comparte la base, hereda el agujero.

## Features v2 (backlog)

- Briefing de áudio matinal de 90 segundos: cron 6:45 genera el guion, TTS, mp3 en Supabase Storage, entregado como voice note por Telegram y cacheado en el SW para escucharlo manejando sin señal
- Prep de reunião automático 90 min antes con 5 bullets (últimas 3 interações, 2 escalas mais fracas + o gate, 3 perguntas concretas, o que ficou prometido, produto/valor) y deep link — se adelanta a F5 si el calendario está integrado
- Sinais de gatilho externos por conta: job diario que busca novo CD, vagas de logística/embalagem, troca de gerente industrial, expansão o roubo de carga, y los sirve como card con el ángulo de entrada ya redactado
- Market sweep semanal automatizado: lote de 10-15 cuentas dormidas o perdidas hace 6-12 meses con ángulo de reapertura generado desde el histórico, servido como una zona más de la Golden Hour
- Rascunho de follow-up en 3 variantes (resumo curto / orientado a próximos passos / técnico com detalhe de produto), editable, nunca autoenviado
- Segmentos do funil estilo Strava: cada transición entre las 6 etapas cronometrada, PR personal y récord del equipo, filtrable por línea de producto — genera el dato de ciclo de venta por producto que hoy no existe (vender una Better Pack no tiene el mismo tempo que reponer cinta Venom)
- Check-in geolocalizado de visita: botón 'Cheguei' con geo-tag y cronómetro, y al alejarse >500m dispara el registro por voz con cliente y duración precargados
- Blitz sincronizado martes y jueves 16-17h con llamada de audio abierta, playlist elegida por el Motor de la semana anterior y barra colectiva en vivo
- Integración con calendario (Google/Outlook) para que las reuniones no dependan de que alguien las cargue a mano
- Auto-scoring PPVVCC desde transcripción de reunión completa, no solo de la nota de voz de 40s
- Ventus role-play: simular la reunión de mañana con el perfil del stakeholder para practicar la objeción que aparece siempre con Venom o con el precio de la máquina
- Base de casos de éxito movida de código a tabla con embeddings o tags normalizadas (hoy son 8 casos en 180 líneas de assistant.js y corregir un ROI exige un deploy)
- Widgets de home screen en Android y App Shortcuts dinámicos que reflejen el estado del día ('2 de 3 feitas')
- Reciclaje inteligente de los 37 leads archivados con recycle_after cumplido, con ángulo nuevo generado desde lo que cambió en el mercado o el catálogo
- Biometría para desbloquear (BiometricManager en el Mini App, credenciales de plataforma en Android)
- Exportación de la reunión de lunes: una página por vendedor con compromisos, veredictos y las 3 oportunidades a discutir, generada el domingo a la noche
- Migración del bot de Vercel a Edge Functions para tener un solo runtime y un solo deploy
- Separación de strings PT-BR a un catálogo, para poder abrir a Ventapel Argentina/Chile sin duplicar código

## Gamificação

## Principio rector

Una sola moneda, generada por **cambio de estado del negocio**, nunca por volumen de registros. El diseño arranca desde la amenaza, no desde la mecánica: con 4 vendedores y puntos visibles, cualquier métrica fabricable se fabrica en dos semanas. Orden de construcción no negociable: **primero las defensas, después los puntos**.

Y una decisión que se anuncia en voz alta el día del lanzamiento: **las comisiones quedan fuera del juego**. Los puntos dan estatus y autonomía, nunca plata. Cuando los puntos pagan dinero la gente miente; cuando dan capacidad de elección frente a tres compañeros que ven todo, el costo/beneficio de mentir se derrumba.

## 1. Pontos de Avanço (PA)

Tabla `scoring_rules` versionada, editable por admin, **nunca hardcodeada, nunca retroactiva, nunca modificada en medio de una temporada**.

| Evento | PA | Prova | Techo diario |
|---|---:|:---:|---:|
| Δ+1 en una escala PPVVCC | 10 | sí (>5) | sin techo |
| Reunião **realizada** | 40 | sí | sin techo |
| Etapa avanzada con gate cumplido | 60 | sí | sin techo |
| Sinal do comprador (respondeu, pediu amostra, apresentou pessoa, mandou specs, foi a compras) | 15-50 | sí | sin techo |
| Commitment cumplido | 25 | sí | — |
| Lead novo com contato nomeado | 8 | no | 40 |
| Empresa de market_sweep → lead | 5 | no | 25 |
| Touchpoint de cadência | 3 | no | **45** |
| Nota/ligação sem resultado | 1 | no | **20** |

**Corregir es avanzar**: bajar una escala con evidencia da los mismos PA que subirla. Sin esto nadie corrige nunca y el pipeline se infla solo.

## 2. Las cuatro defensas (las cuatro son obligatorias)

**(a) Regra da prova.** Todo evento de más de 20 PA exige artefacto: audio de 20-60s transcripto, nombre + cargo de un stakeholder nuevo, fecha/hora de un próximo paso acordado, o un archivo. Sin artefacto queda `pending_evidence` y no acredita. Ventus valida coherencia: si `dor` sube de 3 a 8 y la transcripción no menciona ningún problema ni costo, marca *"avanço não sustentado"*. Doble beneficio: la prueba que se pide para ganar puntos es exactamente el contexto que Ventus necesita para aconsejar y que Jordi necesita para revisar. **La gamificación paga por la calidad del dato en vez de degradarla.**

**(b) Teto diário con rendimientos decrecientes.** Pasado el techo los eventos se registran igual pero valen 0, con mensaje explícito: *"já no máximo de contatos hoje — o que soma agora é conversa e avanço"*. El volumen es trivial de fabricar; la conversación real no.

**(c) Clawback diferido.** Reunião agendada = 10 PA provisorios → 40 al marcarse **realizada** con evidencia → 0 si hay no-show o dos reagendamientos. Etapa que retrocede sin evento externo revierte sus PA como *"ajuste"* — sin castigo social, sin saldo negativo, sin mención en el canal. Premiar *meetings booked* en vez de *held* produce show rates del 40%; y en Ventapel las visitas a plantas se caen seguido por logística.

**(d) Peso pelo sinal do comprador.** El vendedor solo puede fabricar 1-3 PA por evento. Las respuestas del comprador valen 15-50 y son las **únicas** que habilitan a subir dor, poder, valor y compras. Se cargan con un botón dedicado *"O cliente fez algo"*. Es la traducción literal de PPVVCC a la economía: el puntaje deja de ser fabricable en soledad, que es la única defensa estructural contra Goodhart.

Encima corre una **auditoría automática diaria** (>6 registros en <10 min, escalas +3 sin transcripción, reuniones "realizadas" sin artefacto, oscilación de etapa, toques en ráfaga fuera de la ventana). **Nunca penaliza sola**: alimenta una **calibración semanal de 20 minutos** donde Jordi o Tomás y el vendedor revisan 2-3 negocios. Agenda declarada: *"estamos de acuerdo en el número"*, no *"te agarré"*. Es lo único que mantiene comparables las escalas entre cuatro personas que las interpretan distinto.

Y transversal: **transparencia total**. Cada PA es tocable y muestra evento, regla, peso y evidencia. Pantalla *"Regras do jogo"* con todo en una página, con historial de cambios y autor. Si el equipo sospecha que los puntos son arbitrarios, el sistema muere en un mes y se lleva puesta la credibilidad del CRM entero.

## 3. Los tres anillos diarios

**Contato** (toques ejecutados) · **Conversa** (interacciones bidireccionales reales) · **Avanço** (≥1 evento que mueva una escala con evidencia o una reunión realizada). Cerrar los tres = **Dia Fechado**.

Codifican el embudo entero y hacen visible al instante el patrón peligroso: mucho anillo 1 y cero anillo 3 = alguien ocupado sin vender.

**Rampa calibrada contra el baseline real** (12 touchpoints/semana para TODO el equipo, mediana de 17 semanas):

| Período | Contato | Conversa | Avanço |
|---|---:|---:|---:|
| Semanas 1-2 | 4/día | 1 | 1 |
| Mes 2 | 8/día | 2 | 1 |
| Mes 3+ | 12/día | 3 | 1 |

4/día ya son 80 toques/semana del equipo: **6,6× el baseline**. Poner 12/día en la semana 1 sería 20× y el equipo lo lee como ficción. La rampa se comunica de entrada para que se sienta como progreso, no como que le suben la vara.

**Largada dotada**: el anillo de Contato arranca en **2/12**, regalados por confirmar la agenda y revisar las 3 prioridades. La meta se presenta como 12, no como 10, para que el regalo sea real — y las dos acciones regaladas son justo las que queremos que hagan siempre.

**Cookbook negociado**: cada lunes el vendedor define sus metas; el sistema propone desde su histórico de 4 semanas y él ajusta ±30%; los admins ven pero no editan sin conversación. Victor Hugo (25 oportunidades, R$1,15M, 0 leads) y Andre (44 leads, 0 cierres) usan mitades distintas del sistema: una meta única sería injusta y se ignoraría. La autonomía sobre la meta es lo que separa gamificación de vigilancia.

## 4. La racha — de Golden Hour, no de login

Una sola racha visible en todo el producto. Cuenta **días hábiles con Hora Cheia**: ≥40 min + meta de toques + **al menos 1 conversa real** + debrief hecho. Discar números muertos no gana racha. Abrir la app, escribir notas o "estar online" no cuenta absolutamente nada.

- **Calendario útil**: solo días hábiles, con feriados nacionales y de SP y vacaciones marcadas. Castigar a alguien por no prospectar el 12 de octubre destruye la credibilidad del sistema entero.
- **Escudos**: máximo 2, **ganados** (Semana Perfeita 5/5, o 10 kudos recibidos), nunca comprados. Se consumen **en silencio**; al día siguiente aparece un copo de nieve: *"Terça foi coberta pelo seu escudo. Resta 1."* Dos es el punto óptimo; tres erosiona el hábito.
- **Nunca falhar duas vezes**: si se rompe sin escudo, la app **jamás muestra un 0**. Muestra *"Resgate disponível até amanhã 18h"*: una Golden Hour completa + un avance real restaura la racha a *valor anterior − 1*. Máximo 1 por mes. Cero lenguaje de fracaso o deuda.
- Hitos en 5, 10, 21, 50 y 100 con badge y anuncio en el canal.

Los 4 viajan a plantas y tienen días de incendios. Sin perdón, el día que Renata rompe su primera racha larga es el día que deja de usar el sistema.

## 5. Presión social sin fabricar perdedores

**Cero ranking de ventas.** Con n=4 un leaderboard produce un ganador y un último público permanente que es el 25% del equipo comercial, sentado en la misma sala. El placar muestra **cuatro carriles paralelos** con el % de cada uno contra su propia meta. Se ve el carril del otro; no hay posición. La única lista ordenada del producto son los récords históricos, que rara vez cambian de dueño.

**Cinco troféus semanais rotativos** (viernes 17h, nadie gana dos, se asigna el mejor disponible): **Motor** (más PA) · **Escalador** (mayor Δ PPVVCC con evidencia) · **Conversador** (mejor ratio conversas/toques) · **Zelador** (cero commitments vencidos + campos obligatorios completos) · **Reanimador** (más cuentas dormidas +45d reactivadas con respuesta del cliente). Con 4 personas y 5 títulos, todos ganan algo casi siempre. Las categorías rotan por trimestre. *Zelador* es el truco: convierte la higiene del dato — el problema crónico y la razón por la que 51 de 54 oportunidades no tienen fecha — en estatus público.

**Corrente do time**: fila con los 4 avatares y el anillo de Avanço de cada uno. Si los cuatro cierran Golden Hour el mismo día → **Dia Cheio do Time**: +25% de PA para todos y animación en Telegram. **Sin daño cruzado**: el que no llegó no se nombra, solo se pierde el bonus. (Copiar el "daño al party" de Habitica haría que Andre se enoje con Paulo por algo que no controla.)

**Meta coletiva mensual**: barra donde solo suman eventos de calidad (reuniones realizadas, avances con evidencia, cierres — los touchpoints NO). Al 100% se desbloquea una recompensa votada por el equipo. En un equipo de 4 que comparte cuentas, la competencia pura pone a cada uno a esperar que el otro falle; la barra colectiva hace que pasarle un contacto a Paulo tenga sentido para Andre.

**Temporadas de 4 semanas**: los PA de temporada se resetean, los históricos y récords nunca. Cada evento de calidad verificado da un **bilhete**; al cierre se sortean 1-2 premios. El que más trabajó tiene más chances pero no la certeza, y el que va último sigue teniendo motivo en la semana 4. Con 4 personas el líder se vuelve inalcanzable en tres días: el reset es lo único que mantiene el juego vivo.

**Kudos**: 5 por semana, no acumulables, sobre un evento concreto, con una línea de texto obligatoria. **No dan PA** (evita el intercambio de favores entre 4 personas que se conocen) pero dan escudos y cuentan para el trofeo Companheiro. Los admins tienen los mismos 5 que todos. Prospectar es solitario y el equipo está disperso: los kudos son lo que convierte esa actividad en social.

**Badges** (~20): todos por comportamiento raro y verificable — *Multi-thread* (3+ stakeholders), *Dor 8* (sostenida con transcripción), *Poder na sala* (reunião con quien firma), *Teste Rodando* (POC en planta), *Loop Fechado*, *Ressuscitador*, *Primeira Venom*, *Contrato de Manutenção*. **Cero** "100 ligações" o "500 registros": eso es la *pointsification* que Gartner identificó como causa del 80% de los fracasos.

## 6. Golden Hour — diseño operativo

**Agendamiento como implementation intention.** Cada lunes el vendedor fija su frase si-entonces: *"Terça a sexta, 16:00-17:00, do escritório, com a lista de retomadas"*. Es la pieza con mejor evidencia experimental de todo el diseño (d=.65 sobre 94 tests; 71% vs 32% de cumplimiento) y cuesta casi nada.

**Horario: default 16h.** Los datos propios dicen que el equipo YA trabaja el bloque 15-16h (42 y 25 touchpoints), con segundo pico 9-10h; 16-17h es además la ventana de mejor conexión global. Anclar donde ya hay conducta multiplica la adopción; imponer las 7h es empezar peleando contra el hábito real. Se puede mover, pero **solo el día anterior**, nunca en el momento.

**Víspera 18h (Platinum Hour).** Ventus arma la fila — leads con toque vencido según CADENCE_SCHEDULE (hay 48), negocios sin toque hace N días, empresas de market_sweep asignadas sin lead (hay 83) — y la manda por Telegram para aprobar o editar con un tap. Armar listas y cargar el CRM se hace ANTES, nunca durante.

**T-15**: push *"Golden Hour em 15 — 12 contatos prontos"*. Se silencian todas las demás notificaciones internas durante el bloque.

**Durante**: modo foco full-screen. Una pantalla, sin navegación, sin dashboards, **sin edición de campos**. Solo el contacto actual, su última interacción, el rascunho del canal correcto para ese TP, y cuatro botones grandes. Wake Lock activo. HUD con reloj regresivo, toques vs meta, conversas, y barra *"Here Now"* con los compañeros que están prospectando ahora (solo estado, sin ranking) más high-five con haptic cruzado. Nota de voz de 15s entre contactos, transcripta después. **Si la app permitiera navegar, la hora se convierte en higiene de datos y no entra ninguna llamada**: el modo foco no es adorno, es la decisión de producto que hace funcionar la mecánica.

**Cierre (60s, no salteable pero corto)**: resumen automático, tres preguntas por voz o tap — *"Qual foi a melhor conversa?"*, *"Qual objeção apareceu mais?"*, *"O que muda amanhã?"* — y calificación de la hora. Resumen de 4 líneas al canal. La objeción más repetida de la semana entra en la agenda del lunes. Sin debrief la hora es solo actividad; con debrief es **la única fuente sistemática de inteligencia de mercado que va a tener Ventapel**: qué objeción aparece siempre con Venom, con qué argumento entra el E-comfill, a qué precio se cae la máquina.

**Blitz sincronizado** martes y jueves 16-17h: los cuatro a la vez, audio abierto opcional, playlist del Motor de la semana anterior, meta de equipo, huddle de 2 minutos donde cada uno declara en voz alta su número (compromiso público, difícil de esquivar en un grupo de 4) y debrief de 5 minutos reconociendo a todos los que aportaron. Es de las pocas mecánicas que funciona **mejor** con 4 personas que con 40.

## 7. Recompensas, tono y ética

**Catálogo de premios**: elegir primero entre los leads calientes del market_sweep del mes · elegir la playlist del blitz · sexta-feira curta · elegir a qué cliente se visita la fábrica · el lugar en la próxima feria · la foto en la pantalla de inicio de todos por una semana.

**Celebración instantánea**: reunião realizada, gate cruzado, etapa avanzada y negocio fechado disparan en <1s un patrón háptico propio, animación corta, y mensaje en Telegram con el *anthem* que ese vendedor eligió. Fechado además manda push a los cuatro. Cada uno puede bajar el volumen de las propias, nunca de las ajenas. Es el sustituto remoto de la campana: el equipo está en la calle y la wallboard no aplica, pero el canal de Telegram sí.

**Ventus es narrador, no capataz.** Celebra en concreto (*"Reunião na planta realizada — o poder subiu de 4 pra 6"*), nunca compara sin permiso, máximo 3 notificaciones de juego por día, **jamás usa culpa**. Tres días sin actividad = oferta con acción concreta (*"quer que eu monte a lista de amanhã?"*), no reproche. **Opt-out real**: cualquiera puede apagar anillos y rachas y quedarse con agenda y recordatorios, sin perder acceso a nada. Con 4 personas que se conocen, un tono equivocado no produce churn de usuario: produce resentimiento con la empresa.

## 8. Lanzamiento medido y control de calidad del propio juego

**Shadow mode de 2 semanas**: los PA se calculan con `status='shadow'` y no se muestran, para calibrar los pesos contra el comportamiento real. Encender un sistema mal calibrado es peor que no encenderlo.

Tres controles instrumentados desde F4:
1. **Dia Cheio por vendedor por semana** (input del north star)
2. **Accept rate por tipo de recomendación** — las reglas que nadie acepta se matan antes de erosionar la confianza
3. **Ratio de eventos con evidencia sobre eventos totales** — termómetro directo de si el juego está corrompiendo el dato. **Si cae por debajo del 70%, se congela la economía y se recalibra antes de agregar una sola mecánica más.**

## Telegram

## Posición: Telegram es la mitad del producto, no un accesorio

**Decisión de arquitectura, no de conveniencia.** En iOS el Web Push de una PWA solo funciona si el usuario la instaló manualmente (Safari → Compartilhar → Adicionar à Tela de Início; no existe `beforeinstallprompt` en Safari), y **no hay Background Sync, ni Periodic Sync, ni Background Fetch, sin fecha**. Si el v3 apuesta a Web Push como canal principal, en el primer iPhone del equipo la promesa "te recuerda la agenda" se cae y nadie se entera de por qué.

> Telegram es el canal de entrega de todo lo proactivo. La app es el lugar de trabajo.

Y ya está construido: bot funcionando, transcripción con Whisper, structured outputs con Claude, `bot_sessions`, `bot_log`, cron de digest. Es infraestructura hundida que tapa el agujero más grande de la web.

## A. Lo que se arregla del bot actual (bloqueante)

| Bug verificado | Fix |
|---|---|
| **Cobertura rota**: solo 3 de 6 vendors tienen `telegram_id`. Victor Hugo, Andre y Paulo no pueden usar el bot y ni siquiera pueden autovincularse | Código de emparejamiento de 6 dígitos generado en la app, TTL 10 min, tabla `vendor_channels`. El autolink por `@username` se elimina: lo gana quien tome el username primero |
| `activities.result`: el bot escribe prosa, el CRM espera enum → 12 valores conviviendo, el badge del histórico no renderiza y el propio digest nunca muestra icono | enum + `result_note` para la prosa |
| El bot escribe `opportunities.next_action` con `source='ai_parsed'` y `syncNextAction` de la web lo **borra** al primer uso del panel | `tasks` es la fuente de verdad; un trigger en la base denormaliza |
| `commitTouchpoint` ignora CADENCE_SCHEDULE, usa un contador denormalizado y **no mueve `leads.stage`** → un lead que agenda reunión por Telegram sigue en 1a | llama la misma RPC de dominio que la app, sobre `packages/core/cadence.ts` |
| `claimUpdate()` marca el `update_id` **antes** de procesar: si Groq o Anthropic fallan a mitad, el reintento se descarta y el audio se pierde para siempre (4 casos reales) | claim en dos fases: ack <1s al webhook, procesamiento encolado con reintento |
| `/api/digest` **fail-OPEN** si falta `CRON_SECRET` (al revés que el webhook) | fail-closed |
| 43% de respuestas al gate de próxima acción quedan incompletas (7 de 16) porque se pide texto libre | **botones** Hoje / Amanhã / Segunda / +7d |
| `last_activity_date` escrito en UTC sobre columna sin timezone → 3h de desfasaje | `timestamptz` + BRT centralizado en `packages/core/dates.ts` |
| Sin prompt caching: la cartera completa se reinyecta 2-4 veces por interacción | prefijo estable cacheado, cartera después del breakpoint |
| Cron desalineado: `vercel.json` dice `0 12 * * 1-5`, el README promete 7:30, el comentario dice 10:30 | pg_cron con horario BRT declarado y único |
| Sin troceo a 4096 chars ni retry: un digest largo se pierde en silencio | troceo + retry |
| Dos taps en ✅ = dos activities | `idempotency_key` en `ventus_commit_action` |

## B. Lo que Telegram **envía** (dispatcher único, presupuesto compartido con push)

| Prioridad | Aviso | Cuándo |
|---|---|---|
| 1 | Preparo de reunião (5 bullets + deep link) | T-90 min |
| 1 | Golden Hour: "começa em 15 — 12 contatos prontos" | T-15 min |
| 2 | Fila de la Golden Hour para aprobar con un tap | víspera 18h |
| 2 | Agenda da manhã: 3 prioridades + anillos + racha | 7h |
| 2 | Risco crítico (single-threaded, silêncio, regressão) | al detectarse, máx 1/día |
| 3 | Ventus propuso algo para revisar | agregado, máx 1/día |
| 4 | Veredicto de compromissos | viernes 16h |
| — | Celebraciones del equipo con el *anthem* elegido | en tiempo real |

Todas con **acción directa**, nunca "abra o app". Máximo 4/día, quiet hours 20-7h, dedupe por `(vendor, entidad, tipo)`, `Topic` para colapsar (teléfono apagado toda la mañana = **una** notificación de agenda, no seis).

**El digest se reescribe**: hoy va solo a admins y su línea de "Regra 2" repite el mismo número gigante (50 oportunidades sem data) todas las mañanas — fatiga de alerta de fábrica. Ahora **cada vendedor recibe el suyo** con su Plano do Dia y botones; los admins reciben diagnóstico y coaching, no volumen.

## C. Lo que Telegram **permite hacer** (control remoto real)

Hoy el bot registra pero no modifica. En el v3 puede, con las mismas tools tipadas y las mismas reglas de escritura no destructiva:

| Comando / botón | Qué hace |
|---|---|
| `/hoje` | Los 3 cards en **un** mensaje con `[✅ Feito] [⏰ Amanhã] [🎙 Registrar] [📋 Abrir no app]` |
| `/golden` | Sesión de prospección sirviendo un lead por mensaje con el rascunho del canal que toca |
| `/anel` · `/placar` | Estado de los tres anillos, racha, escudos; carriles y trofeos de la semana |
| `/compromissos` | Declarar los 3 del lunes desde la cola; veredicto del viernes con 3 botones |
| `/status <cliente>` | Resumen + escalas + gate + días de inactividad (hoy el contexto **no** incluye PPVVCC ni health) |
| `/pendentes` `/parados` `/pipeline` | Las 5 consultas actuales, ahora como **tools** que un agente puede combinar en vez de un switch cerrado |
| `/vincular <código>` | Emparejamiento verificado con la app |
| `/desfazer` | Revertir el último registro confirmado (hoy no existe y es la queja obvia) |
| Botones inline | Marcar task hecha, reprogramar, dar veredicto, convertir lead→oportunidad, aceptar/rechazar un delta de escala |

**Convenciones técnicas**: `callback_data` namespaced y **versionado** con fingerprint de estado (`opp:1842:done:v3`) — un botón viejo scrolleado arriba responde *"esta ação já foi feita"* en vez de duplicar. `answerCallbackQuery` **siempre**, aunque sea vacío (si no, spinner de 30s). `editMessageText` para que la confirmación, la agenda y la sesión de Golden Hour vivan en **un mensaje que se edita**, no en un chat que se llena con 6 personas registrando.

## D. Telegram Mini App: el CRM completo dentro de Telegram

**El mismo bundle** que la PWA, con una capa `useHost()` que abstrae cinco cosas: auth, botón primario, back, haptics, notificaciones.

**Auth sin login**: `supabase/functions/tma-auth` recibe el `initData` crudo, arma el data-check-string (todos los params menos `hash`, ordenados alfabéticamente, unidos con `\n`), compara contra `HMAC-SHA256(dataCheckString, HMAC-SHA256(botToken,"WebAppData"))`, **rechaza si `auth_date` venció**, resuelve `telegram_id → vendors` y emite un JWT de Supabase con el claim del vendedor. De ahí las RLS hacen el resto. Sin validación server-side cualquiera se hace pasar por Victor Hugo.

**Ergonomía nativa**: los 14 theme params mapeados a los tokens de Tailwind + evento `theme_changed` · **MainButton nativo** reservado para LA acción crítica, con estado de loading que previene el doble-tap que duplica registros · SecondaryButton para "Adiar", BackButton nativo · `safeAreaInset`/`contentSafeAreaInset` · `HapticFeedback` (que **sí** funciona en iOS, a diferencia de la PWA) · `CloudStorage` para respaldar borradores largos que sobrevivan al cierre del bottom sheet · `requestFullscreen()` durante la Golden Hour.

**`addToHomeScreen()`** ofrecido en la tercera sesión (con `checkHomeScreenStatus()` para no insistir): es el camino de instalación que iOS le niega a la PWA. Ícono en el home = uso diario en vez de "cuando me acuerdo".

**Deep links accionables**: `t.me/VentusBot/app?startapp=opp_1842_log` (hasta 64 chars en `start_param`) abre la ficha con el registro ya abierto. Cada notificación es un tap hasta la acción — la diferencia entre "el bot me avisó" y "el bot me hizo hacerlo".

## E. Seguridad

El bot hoy usa `SUPABASE_SERVICE_ROLE_KEY` e ignora RLS: **todo el aislamiento entre vendedores depende de que nadie olvide un `.eq('vendor', ...)`**. Con las capacidades de escritura ampliadas del v3 esa superficie crece mucho. Cambio: las operaciones de negocio pasan por **RPCs `SECURITY DEFINER` que reciben el `vendor_id` ya verificado**; service_role queda solo para `bot_log` y `bot_sessions`. Retención de 180 días en `bot_log` (hoy guarda transcripciones íntegras de conversaciones con clientes, sin TTL ni cifrado).

**El contrato del README se conserva escrito**, aunque el v3 sí permita modificar: *no crea clientes ni oportunidades de la nada · no borra historial · no le escribe a clientes · nadie registra a nombre de otro · contactos y descripciones de escalas solo rellenan huecos · el `score` PPVVCC jamás se toca sin confirmación humana con evidencia.*

## Arquitetura

## Decisión de fondo
Reescritura completa de la capa de aplicación en un repo nuevo (`/home/user/ventus3`), contra la MISMA base Supabase saneada, conviviendo con el v2 hasta el corte. Lo único portable del v2 es `api/_lib/ppvvcc.js`, los catálogos (CADENCE_SCHEDULE, METHODOLOGY_ACTIVITIES, PRODUCT_LINES, banco SPIN) y el motor determinístico de `api/assistant.js:310-709`. El resto es lógica pegada al JSX (handlers de 600 chars dentro de `onClick`, queries en el render tree): no se refactoriza, se reescribe.

## Monorepo (pnpm + Turborepo)
```
ventus3/
  packages/
    core/          # dominio puro, isomórfico, cero red
      ppvvcc.ts    # port tipado de api/_lib/ppvvcc.js (66 defs, STAGE_GATES)
      cadence.ts   # CADENCE_SCHEDULE 1/3/6/10/13/17/21, progresión 1a→1d
      methodology.ts # 32 hitos 1A-6C + getSuggestedNextStep
      planner.ts   # rankDay(): EL algoritmo del Plano do Dia
      risk.ts      # 6 reglas de deal_risks
      scoring.ts   # PA, techos, clawback, anillos, racha, calendario BR/SP
      spin.ts      # 6 escalas × 4 categorías de perguntas
      dates.ts     # port de ventus-bot/lib/dates.js (BRT, DST-safe)
    agent/         # Ventus: tools tipadas, prompts, propose→commit
    data/          # Dexie + outbox + sync + realtime reconciler
    ui/            # design system PT-BR: Sheet, Ring, SwipeRow, haptic()
  apps/
    app/           # PWA + TWA + Telegram Mini App (UN build, adapter useHost)
    bot/           # webhook Telegram (Vercel, ack <1s + encola)
  supabase/
    migrations/    # SQL versionado
    functions/     # ventus-plan, ventus-ingest, ventus-act, dispatch,
                   # tma-auth, golden-queue, close-day, weekly-awards, audit
  android/         # proyecto Bubblewrap (TWA)
```
`packages/core` corre en el browser (offline, sin tokens), en Edge Functions y en el bot. Es la respuesta al pecado original: hoy hay DOS Ventus divergentes (`CRMbr/api/assistant.js` y `ventus-bot/lib/claude.js`) y TRES escritores con reglas distintas sobre las mismas columnas.

## Stack (versiones verificadas ago/2026)
React 19.2 + Vite 8.2 + TS 7 + Tailwind 4.3 · React Router 8 con `viewTransition` · TanStack Query 5.102 + persister IndexedDB (con `setMutationDefaults` por mutationKey, si no las mutaciones pausadas no resumen tras reload) · Dexie 4.4.5 · vite-plugin-pwa 1.3.0 **injectManifest** + Workbox 7.4.1 · motion 13.1 solo para drag físico · @use-gesture/react 10.3 · Bubblewrap CLI 1.25.0 + JDK 17 · Supabase (Postgres + Edge Functions Deno + Realtime + pg_cron/pg_net).

**IA**: `claude-opus-5` para coaching y diagnóstico (effort high), `claude-sonnet-5` para extracción de voz y plan diario (effort low), Groq `whisper-large-v3-turbo` para STT. Prompt caching: prefijo estable (~2.500 tokens: PPVVCC, gates, cadencia, catálogo de tools, tono PT-BR) antes del breakpoint, cartera después. Model ids y precios en UNA constante (hoy hay 3 archivos con 3 formatos).

## Dos cerebros, no uno
```
MOTOR DETERMINÍSTICO (packages/core) → rankDay, riskScore, nextBestAction,
gates, cadencia, anillos, PA. Corre offline, <5ms, cero tokens.
        ↓ produce hechos y prioridades
CAPA LLM (packages/agent) → redacta, extrae, explica, coachea.
NUNCA decide prioridad sola.
```
`generateAlerts` + `generateNextBestAction` ya funcionan sin Claude y son lo mejor del sistema actual: se promueven de "fallback de emergencia" a motor principal.

## Escrituras: propose-then-commit
14 tools `ventus_*` con `strict:true`, `additionalProperties:false`, enums, e identificadores naturales (nombre del cliente, no UUID). Toda escritura no trivial pasa por `ventus_actions`:
```
propose → {payload, evidencia, confianza, precondition_hash, expires_at}
commit  → valida staleness (¿updated_at cambió?) → ejecuta con
          idempotency_key → verifica → audit log inmutable
```
Confianza graduada: **alta** (el cliente lo dijo textual, hay cita) → auto-commit con aviso; **media** (inferencia) → Revisão do Ventus con accept/edit/dismiss **por campo**; **baja** → Ventus pregunta. Los gates de etapa se validan SIEMPRE en Postgres, nunca solo en el cliente.

## Offline (partido en dos fases, no big-bang)
- **Lectura**: Dexie con la cartera del vendedor (opportunities, leads, tasks, activities 90d, fila de Golden Hour). Toda la base son 3,3 MB: la cartera de uno entra sin esfuerzo.
- **Escritura**: outbox con `client_uuid` + idempotency key, UI optimista. Flush por 3 vías: evento `sync` del SW (solo Chromium), evento `online`, y **`visibilitychange`** — que en iOS no es un extra, es el mecanismo principal (no hay Background Sync ni Periodic Sync, sin fecha).
- **Conflictos**: append-only con UUID para activities/touchpoints (~80% del tráfico, imposible de conflictuar); **LWW por CAMPO** con timestamp por campo para escalas/etapa/fechas, con `conflict_log`.
- **Realtime**: la publicación `supabase_realtime` hoy tiene CERO tablas — el realtime del v2 es ficción. Se habilita por tabla con REPLICA IDENTITY. Regla: un evento remoto NO pisa un valor local con mutación pendiente sobre el mismo campo (si no, aparece el bug que mata la confianza: el cambio del vendedor "se revierte" solo).
- `navigator.storage.persist()` + asumir la purga de 7 días de iOS: badge "X registros pendentes", flush agresivo, full refetch sin drama si el store aparece vacío con sesión viva.

## Notificaciones
**Telegram es el canal primario, Web Push el secundario.** En iOS el push exige que el usuario instale la PWA a mano (no hay `beforeinstallprompt` en Safari). Dispatcher único con dos transportes, presupuesto de 4/día, quiet hours 20-7h, dedupe por `(vendor, entidad, tipo)`, header `Topic` para colapsar, `Urgency` y TTL corto. Scheduling en **pg_cron + pg_net** (precisión de minuto, gratis) en vez de Vercel Cron (Hobby: 1×/día, precisión de hora) — "reunião em 15 minutos" necesita minutos.

## Android — con deadline real
🚨 Brasil es uno de los 4 mercados piloto de la Android Developer Verification: **30/09/2026**, a ~5 semanas. Solución: **Limited Distribution Account** (gratis, sin ID gubernamental, hasta 20 dispositivos; Ventapel tiene 6).

**Decisión de secuencia**: en F1 se publica un **APK cáscara** con el package name definitivo (`br.com.ventapel.ventus`) y el keystore de release, se registra el fingerprint y se instala en los 6 teléfonos **antes del 30/09** — aunque la app esté a medio hacer. Como el TWA carga la URL web, cada deploy posterior actualiza la app sin recompilar ni redistribuir. Eso convierte un deadline externo en un trámite de la semana 4.

`public/.well-known/assetlinks.json` servido con header `Content-Type: application/json` en `vercel.json` (Vercel a veces lo manda como texto plano y la verificación falla en silencio → aparece la barra de Chrome). `enableNotifications: true` en `twa-manifest.json` → notificaciones con el ícono de Ventapel y permiso nativo POST_NOTIFICATIONS. Keystore RSA 4096 en el gestor de secretos, `*.keystore` en .gitignore. Plan B documentado: `adb install -r` (vía explícitamente exenta).

## Seguridad — bloqueante antes de la primera línea
Hoy la policy `"Enable all for development"` (ALL, rol `public`, `USING true`) sobre opportunities/leads/touchpoints anula todo el scoping, y `anon` tiene INSERT/UPDATE/DELETE/TRUNCATE sobre las 12 tablas: el anon key del bundle alcanza para leer y escribir los R$2,1M de pipeline. Además 5 vistas SECURITY DEFINER filtran datos de todos los vendedores, y `current_vendor_name()` se re-evalúa por fila (174.562 seq_scan sobre una tabla de 6 filas). Todo se corrige en F0.

Auth del backend **fail-CLOSED** con verificación local de firma (JWKS), no round-trip por request. CORS específico, no `*`. Rate limiting y cuota por vendedor con usage persistido. Se borran `api/google-search.js` (sin auth, expone SERPER_API_KEY), la ruta `cadencia` como proxy crudo de LLM, `src/config/vendorsConfig.js` y `src/supabaseClient.ts` (huérfanos y engañosos).

## Trampas técnicas ya identificadas
| Trampa | Qué hacer |
|---|---|
| `webkitSpeechRecognition` pasa el feature detection y **falla en silencio en PWA standalone en iOS** | MediaRecorder + Whisper server-side |
| `navigator.vibrate` no existe en Safari; el truco del `<input switch>` murió en iOS 26.5 | `haptic()` con Android real, HapticFeedback nativo en Mini App, micro-animación en iOS-PWA |
| `100dvh` hace saltar el layout | `100svh` por default |
| ActivityPanel embebido en cada card → ~195 queries | UNA vista/RPC agregada por pantalla |
| `last_update` como proxy de inactividad (se pisa al corregir un typo) | `last_activity_at` por trigger |
| `health_score` columna (38/65 desincronizadas) | columna generada / vista |
| 27 `alert()`/`confirm()` | Sheets + toasts con undo |
| Sin Error Boundary → pantalla blanca | Boundary por ruta |

## Rendimiento y calidad
TTI <1,5s en Android gama media con 4G brasileña, verificado en dispositivo real. Plano do Dia desde Dexie en <100ms sin red. Solo `transform`/`opacity` en animaciones. `registerType: 'prompt'` (nunca `autoUpdate`: la app no se recarga sola mientras el vendedor tipea notas). Vitest sobre `packages/core` con las 65 oportunidades reales como fixtures (hoy: cero tests). Playwright sobre 3 flujos: Golden Hour completa, registro por voz offline→sync, avance de etapa con gate. Staging con base propia (hoy el bot se prueba en producción).

## Mudanças no modelo de dados

### DM1

-- ═══ F0.1 SEGURIDAD (bloqueante, va primero) ═══
DROP POLICY "Enable all for development" ON public.opportunities;
DROP POLICY "Enable all for development" ON public.leads;
DROP POLICY "Enable all for development" ON public.touchpoints;
DROP POLICY "all_read_vendors" ON public.vendors;
DROP POLICY "Anyone can view active vendors" ON public.vendors;
CREATE POLICY vendors_read_team ON public.vendors FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE SELECT ON public.opportunities, public.leads, public.touchpoints, public.activities, public.notifications, public.commitments FROM anon;
-- las 5 vistas SECURITY DEFINER devuelven filas de TODOS los vendedores (4 ERROR del advisor)
ALTER VIEW public.pending_actions          SET (security_invoker = on);
ALTER VIEW public.vendor_notifications     SET (security_invoker = on);
ALTER VIEW public.vendor_activity_summary  SET (security_invoker = on);
ALTER VIEW public.opportunity_timeline     SET (security_invoker = on);
ALTER VIEW public.stale_opportunities      SET (security_invoker = on);
ALTER FUNCTION public.current_vendor_name() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin()            SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.is_admin(), public.current_vendor_name() FROM anon;

### DM2

-- ═══ F0.2 IDENTIDAD: vendor STRING → vendor_id UUID ═══
-- Hoy 'Victor Hugo' es texto en 6 tablas + en el bot. Renombrar a alguien rompe su historial entero.
ALTER TABLE opportunities ADD COLUMN vendor_id uuid REFERENCES vendors(id);
ALTER TABLE activities    ADD COLUMN vendor_id uuid REFERENCES vendors(id);
ALTER TABLE leads         ADD COLUMN vendor_id uuid REFERENCES vendors(id);
ALTER TABLE notifications ADD COLUMN vendor_id uuid REFERENCES vendors(id);
ALTER TABLE market_sweep  ADD COLUMN vendor_id uuid REFERENCES vendors(id);
ALTER TABLE commitments   ADD COLUMN vendor_id uuid REFERENCES vendors(id);
UPDATE opportunities o SET vendor_id = v.id FROM vendors v WHERE v.name = o.vendor;  -- idem las otras 5
-- verificar 0 huérfanos ANTES de dropear la columna texto; el nombre queda solo para display
ALTER TABLE vendors DROP COLUMN auth_user_id;   -- duplicado exacto de auth_id en los 6, con índice propio
ALTER TABLE vendors DROP COLUMN monthly_target; -- NULL en los 6; las metas van a vendor_goals
ALTER TABLE vendors DROP COLUMN telegram_username; -- vinculación por @username es suplantable
ALTER TABLE vendors
  ADD COLUMN timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN golden_hour_start time DEFAULT '16:00',
  ADD COLUMN golden_hour_days int[] DEFAULT '{2,3,4,5,6}',
  ADD COLUMN golden_hour_minutes int DEFAULT 45,
  ADD COLUMN anthem text, ADD COLUMN onboarded_at timestamptz;
CREATE FUNCTION public.current_vendor_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp AS $$ SELECT id FROM vendors WHERE auth_id = (select auth.uid()) AND is_active LIMIT 1 $$;

### DM3

-- ═══ F0.3 RLS v3: UNA policy permissive por acción, auth envuelto en (select ...) ═══
-- Hoy: 106 warnings de multiple_permissive_policies y 174.562 seq_scan sobre una tabla de 6 filas
CREATE POLICY opp_select ON opportunities FOR SELECT TO authenticated
  USING ((select is_admin()) OR vendor_id = (select current_vendor_id()) OR vendor_id IS NULL);
CREATE POLICY opp_insert ON opportunities FOR INSERT TO authenticated
  WITH CHECK (vendor_id = (select current_vendor_id()) OR (select is_admin()));
CREATE POLICY opp_update ON opportunities FOR UPDATE TO authenticated
  USING ((select is_admin()) OR vendor_id = (select current_vendor_id()) OR vendor_id IS NULL)
  WITH CHECK ((select is_admin()) OR vendor_id = (select current_vendor_id()));
-- mismo patrón en leads, touchpoints, activities, tasks, notifications.
-- Se CONSERVA el modelo de pool (ver sin dueño + tomar con WITH CHECK) que ya está bien diseñado.
-- market_sweep tiene RLS ON y CERO policies (invisible para el front): se le da policy por vendor
CREATE POLICY ms_own ON market_sweep FOR SELECT TO authenticated
  USING (vendor_id = (select current_vendor_id()) OR (select is_admin()));
CREATE POLICY ms_claim ON market_sweep FOR UPDATE TO authenticated
  USING (vendor_id = (select current_vendor_id())) WITH CHECK (vendor_id = (select current_vendor_id()));

### DM4

-- ═══ F2.1 TASKS: la próxima acción como entidad de primera clase ═══
-- Reemplaza la denormalización frágil de opportunities.next_action (hoy 51 de 54 vivas sin fecha,
-- y el bot y la web se pisan el campo mutuamente).
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid uuid UNIQUE NOT NULL,                    -- idempotencia del outbox offline
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  opportunity_id int REFERENCES opportunities(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  title text NOT NULL,
  channel text CHECK (channel IN ('call','whatsapp','email','linkedin','meeting','visit','demo','proposal','other')),
  due_date date NOT NULL,                              -- fecha OBLIGATORIA, nunca null
  due_time time, priority smallint DEFAULT 2,
  target_scale text CHECK (target_scale IN ('dor','poder','visao','valor','controle','compras')),
  draft_content text, expected_outcome text,           -- hoy se tiran al persistir el action plan
  source text NOT NULL CHECK (source IN ('manual','ia','bot','cron','conversion','ritual')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','snoozed','discarded','expired')),
  snoozed_until date, resolved_activity_id int REFERENCES activities(id),
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CHECK (opportunity_id IS NOT NULL OR lead_id IS NOT NULL));
CREATE INDEX idx_tasks_agenda ON tasks(vendor_id, due_date) WHERE status='open';
CREATE INDEX idx_tasks_opp ON tasks(opportunity_id) WHERE status='open';
-- El trigger vive en la BASE, no en 3 clientes llamando syncNextAction()
CREATE FUNCTION sync_next_action() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oid int := COALESCE(NEW.opportunity_id, OLD.opportunity_id); BEGIN
  UPDATE opportunities o SET next_action = t.title, next_action_date = t.due_date
  FROM (SELECT title, due_date FROM tasks WHERE opportunity_id = oid AND status='open'
        ORDER BY due_date LIMIT 1) t WHERE o.id = oid; RETURN NULL; END $$;
CREATE TRIGGER trg_sync_next_action AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION sync_next_action();

### DM5

-- ═══ F3.1 EVIDENCIA PPVVCC: la regra da prova, en la base ═══
CREATE TABLE scale_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id int NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  scale text NOT NULL CHECK (scale IN ('dor','poder','visao','valor','controle','compras')),
  score_from smallint, score_to smallint NOT NULL CHECK (score_to BETWEEN 0 AND 10),
  quote text,                                    -- lo que el COMPRADOR dijo, textual
  said_by text, said_role text, said_at date,
  source text CHECK (source IN ('audio','email','whatsapp','meeting','document','manual')),
  activity_id int REFERENCES activities(id),
  confidence text CHECK (confidence IN ('alta','media','baixa')),
  proposed_by text DEFAULT 'ventus' CHECK (proposed_by IN ('ventus','vendedor')),
  accepted_by uuid REFERENCES vendors(id), accepted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CHECK (score_to <= 5 OR quote IS NOT NULL));   -- sin prova no se pasa de 5
CREATE INDEX idx_scale_evid ON scale_evidence(opportunity_id, scale, created_at DESC);

-- health deja de ser columna escrita a mano (hoy guarda 1,72 vs 3,77 real, 38/65 desincronizadas)
ALTER TABLE opportunities DROP COLUMN health_score;
ALTER TABLE opportunities ADD COLUMN health_score numeric GENERATED ALWAYS AS (
  (COALESCE((scales->'dor'->>'score')::numeric,0) + COALESCE((scales->'poder'->>'score')::numeric,0)
 + COALESCE((scales->'visao'->>'score')::numeric,0)+ COALESCE((scales->'valor'->>'score')::numeric,0)
 + COALESCE((scales->'controle'->>'score')::numeric,0)+COALESCE((scales->'compras'->>'score')::numeric,0))/6.0) STORED;
CREATE VIEW opportunity_verified_health AS  -- health_verificado: solo escalas con prova <90d
  SELECT o.id, o.health_score AS health_declarado, /* AVG filtrado por scale_evidence reciente */ ...
  FROM opportunities o;

### DM6

-- ═══ F3.2 VENTUS: propose-then-commit, idempotencia, auditoría inmutable ═══
CREATE TABLE ventus_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text UNIQUE NOT NULL,
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  tool_name text NOT NULL,                       -- ventus_atualizar_escala, ventus_avancar_etapa, ...
  payload jsonb NOT NULL, evidence jsonb,
  reason text NOT NULL, signals jsonb,           -- el chip 'Por que isto?' mostrable al vendedor
  confidence text NOT NULL CHECK (confidence IN ('alta','media','baixa')),
  precondition jsonb,                            -- {table,id,updated_at} → staleness check
  entity_table text, entity_id text, surface text CHECK (surface IN ('app','telegram','tma','cron')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','executed','rejected','expired','stale','failed')),
  reject_reason text CHECK (reject_reason IN ('dado_errado','ja_fiz','nao_e_prioridade','outro')),
  result jsonb, proposed_at timestamptz DEFAULT now(), decided_at timestamptz,
  executed_at timestamptz, expires_at timestamptz DEFAULT now() + interval '48 hours');
CREATE INDEX idx_va_pending ON ventus_actions(vendor_id, status, proposed_at DESC) WHERE status='pending';
CREATE INDEX idx_va_learn ON ventus_actions(tool_name, status);   -- accept rate por tipo

CREATE TABLE ventus_audit (   -- el chat NO es audit trail
  id bigserial PRIMARY KEY, action_id uuid REFERENCES ventus_actions(id),
  actor text NOT NULL, event text NOT NULL, before jsonb, after jsonb, at timestamptz DEFAULT now());
REVOKE UPDATE, DELETE ON ventus_audit FROM authenticated, anon;

CREATE TABLE ventus_recommendations (   -- ¿sirve Ventus? sin esto no se puede saber
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid, rec_type text,
  entity_type text, entity_id text, reason_signals jsonb, shown_at timestamptz,
  outcome text CHECK (outcome IN ('accepted','snoozed','dismissed','executed','ignored')),
  outcome_at timestamptz, feedback_reason text,
  followup_scale_moved boolean, followup_stage_advanced boolean, measured_at timestamptz);
CREATE TABLE ai_usage_log (id bigserial PRIMARY KEY, vendor_id uuid, endpoint text, model text,
  input_tokens int, cache_read_tokens int, output_tokens int, cost_usd numeric,
  request_id text, created_at timestamptz DEFAULT now());

### DM7

-- ═══ F3.3 HIGIENE DE DATOS: bugs verificados del v2 ═══
-- activities.result: el bot escribe prosa, el CRM espera enum → 12 valores conviviendo,
-- el badge del histórico no renderiza y el digest nunca muestra icono
ALTER TABLE activities ADD COLUMN result_note text, ADD COLUMN client_uuid uuid UNIQUE;
UPDATE activities SET result_note = result
  WHERE result NOT IN ('positivo','neutro','negativo','descartado','expirado','pendente');
UPDATE activities SET result = 'neutro'
  WHERE result NOT IN ('positivo','neutro','negativo','descartado','expirado','pendente') AND result IS NOT NULL;
ALTER TABLE activities ADD CONSTRAINT activities_result_chk
  CHECK (result IS NULL OR result IN ('positivo','neutro','negativo','descartado','expirado','pendente'));
ALTER TABLE activities DROP COLUMN ai_confidence;      -- NULL en las 151 filas
ALTER TABLE opportunities DROP COLUMN activities, DROP COLUMN alerts;  -- jsonb, 0 de 65 con contenido

-- last_activity_at por TRIGGER (hoy last_update se pisa al corregir un typo del nombre del cliente)
ALTER TABLE opportunities ADD COLUMN last_activity_at timestamptz, ADD COLUMN client_uuid uuid UNIQUE,
  ADD COLUMN scales_updated_at jsonb NOT NULL DEFAULT '{}'::jsonb;   -- timestamp por campo (LWW)
CREATE FUNCTION touch_last_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  UPDATE opportunities SET last_activity_at = GREATEST(COALESCE(last_activity_at,'-infinity'),
    COALESCE(NEW.activity_date::timestamptz, NEW.created_at)) WHERE id = NEW.opportunity_id;
  RETURN NEW; END $$;
CREATE TRIGGER trg_touch_last_activity AFTER INSERT ON activities FOR EACH ROW
  EXECUTE FUNCTION touch_last_activity();

-- moveStage no deja rastro: los cambios de etapa son invisibles en el timeline
CREATE FUNCTION log_stage_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO activities(opportunity_id, vendor_id, activity_type, description,
      stage_at_time, source, activity_date)
    VALUES (NEW.id, NEW.vendor_id, 'stage_change',
      format('Etapa %s → %s', OLD.stage, NEW.stage), NEW.stage, 'system', current_date);
  END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_log_stage AFTER UPDATE OF stage ON opportunities FOR EACH ROW
  EXECUTE FUNCTION log_stage_change();

### DM8

-- ═══ F4.1 CADENCIA Y MARKET SWEEP ═══
-- una visita presencial hoy se degrada a 'phone' con '[meeting]' embebido en notes
ALTER TABLE touchpoints DROP CONSTRAINT touchpoints_channel_check;
ALTER TABLE touchpoints ADD CONSTRAINT touchpoints_channel_check
  CHECK (channel IN ('linkedin','whatsapp','email','phone','meeting','visit','event','referral'));
ALTER TABLE touchpoints ADD COLUMN client_uuid uuid UNIQUE, ADD COLUMN sent_message text;
  -- sent_message: para que el TP siguiente sepa qué ya se dijo
ALTER TABLE leads ADD COLUMN market_sweep_id uuid REFERENCES market_sweep(id);
ALTER TABLE market_sweep ADD COLUMN assigned_at timestamptz, ADD COLUMN promoted_at timestamptz;

-- 83 empresas 'asignada' con crm_lead_id NULL: por eso Victor Hugo, Renata y Paulo tienen CERO leads
CREATE FUNCTION promote_sweep_to_lead(p_sweep_id uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ ... $$;
  -- crea el lead, arranca la cadencia con next_touchpoint_date = hoje+1, setea crm_lead_id
  -- y promoted_at, y valida anti-duplicado contra los índices únicos parciales
  -- cnpj_raiz / domain_normalized (el mejor diseño de la base: se conserva intacto)

-- next_touchpoint_date pasa a MANDAR de verdad en la UI (hoy se calcula, se guarda y LeadCard lo ignora)
CREATE INDEX idx_leads_queue ON leads(vendor_id, status, next_touchpoint_date) WHERE status='active';
CREATE INDEX idx_ms_pending ON market_sweep(vendor_id, status) WHERE crm_lead_id IS NULL;

### DM9

-- ═══ F4.2 GOLDEN HOUR, ANILLOS Y RACHA (el hábito mínimo viable) ═══
CREATE TABLE golden_hour_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id), day date NOT NULL,
  planned_at timestamptz, started_at timestamptz, ended_at timestamptz, duration_seconds int,
  queue jsonb NOT NULL,                          -- lista aprobada la víspera a las 18h
  touches int DEFAULT 0, conversas int DEFAULT 0, meetings int DEFAULT 0, skipped int DEFAULT 0,
  goal_touches int NOT NULL,
  hora_cheia boolean DEFAULT false,              -- meta de toques Y >=1 conversa Y debrief
  debrief jsonb,                                 -- {melhor_conversa, objecao_frequente, o_que_muda}
  surface text CHECK (surface IN ('app','telegram','tma')),
  UNIQUE (vendor_id, day));

CREATE TABLE business_calendar (d date PRIMARY KEY, is_workday boolean NOT NULL, label text);
  -- feriados nacionales + estaduales SP + vacaciones: la racha NO rompe el 12 de octubre

CREATE TABLE vendor_goals (   -- el cookbook semanal negociado por el propio vendedor
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid NOT NULL REFERENCES vendors(id),
  period_type text NOT NULL CHECK (period_type IN ('day','week','month')), period_start date NOT NULL,
  metric text NOT NULL CHECK (metric IN ('contatos','conversas','avancos','reunioes','valor')),
  target numeric NOT NULL, suggested numeric,    -- lo que propuso el sistema desde el histórico 4 semanas
  set_by text NOT NULL DEFAULT 'vendedor',
  UNIQUE (vendor_id, period_type, period_start, metric));

CREATE TABLE daily_rings (
  vendor_id uuid NOT NULL REFERENCES vendors(id), day date NOT NULL,
  contatos int DEFAULT 2,                        -- largada dotada 2/12 (endowed progress)
  conversas int DEFAULT 0, avancos int DEFAULT 0,
  goal_contatos int, goal_conversas int, goal_avancos int,
  closed boolean GENERATED ALWAYS AS (contatos>=goal_contatos AND conversas>=goal_conversas
    AND avancos>=goal_avancos) STORED,
  is_business_day boolean DEFAULT true, PRIMARY KEY (vendor_id, day));

CREATE TABLE streaks (
  vendor_id uuid PRIMARY KEY REFERENCES vendors(id),
  current_count int DEFAULT 0, best_count int DEFAULT 0, last_qualified_day date,
  shields int DEFAULT 0 CHECK (shields BETWEEN 0 AND 2), shield_used_days date[] DEFAULT '{}',
  rescue_available_until timestamptz, rescues_used_this_month int DEFAULT 0);

### DM10

-- ═══ F7.1 ECONOMÍA DE PUNTOS (shadow mode desde F4, visible en F7) ═══
CREATE TABLE scoring_rules (   -- pesos VERSIONADOS y editables por admin, nunca hardcodeados
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version int NOT NULL, event_type text NOT NULL,
  points int NOT NULL, points_per_unit boolean DEFAULT false,
  requires_evidence boolean DEFAULT false, daily_cap_points int,
  provisional boolean DEFAULT false, settles_on text,     -- clawback diferido
  valid_from date NOT NULL, valid_to date, changed_by uuid REFERENCES vendors(id),
  UNIQUE (event_type, version));

CREATE TABLE points_ledger (   -- append-only; cada PA es tocable y explicable
  id bigserial PRIMARY KEY, client_uuid uuid UNIQUE,
  vendor_id uuid NOT NULL REFERENCES vendors(id), season_id uuid,
  event_type text NOT NULL, rule_version int NOT NULL,
  points int NOT NULL, capped_points int NOT NULL,        -- lo que acreditó tras el techo
  status text NOT NULL DEFAULT 'settled'
    CHECK (status IN ('provisional','settled','reverted','capped','pending_evidence','shadow')),
  opportunity_id int, lead_id uuid, activity_id int, touchpoint_id int,
  evidence_id uuid REFERENCES scale_evidence(id), reason text,
  occurred_at timestamptz NOT NULL, settled_at timestamptz, reverted_at timestamptz, revert_reason text);
CREATE INDEX idx_pl_vendor ON points_ledger(vendor_id, occurred_at DESC);
CREATE INDEX idx_pl_season ON points_ledger(season_id, vendor_id) WHERE status='settled';

CREATE TABLE buyer_signals (   -- lo que hace el COMPRADOR: 15-50 PA vs 1-3 del vendedor
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id int REFERENCES opportunities(id), lead_id uuid REFERENCES leads(id),
  signal text NOT NULL,   -- respondeu|aceitou_convite|pediu_amostra|apresentou_pessoa|mandou_specs|foi_a_compras
  detail text, evidence_activity_id int REFERENCES activities(id),
  occurred_at timestamptz NOT NULL DEFAULT now());

### DM11

-- ═══ F7.2 PLACAR, TEMPORADAS, KUDOS Y AUDITORÍA ANTI-INFLADO ═══
CREATE TABLE seasons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), starts_on date, ends_on date,
  collective_goal_points int, collective_reward text, label text);
CREATE TABLE awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week_of date NOT NULL,
  category text NOT NULL CHECK (category IN ('motor','escalador','conversador','zelador','reanimador','companheiro')),
  vendor_id uuid NOT NULL REFERENCES vendors(id), metric_value numeric, computed_at timestamptz DEFAULT now(),
  UNIQUE (week_of, category), UNIQUE (week_of, vendor_id));   -- nadie gana dos en la misma semana
CREATE TABLE kudos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_vendor uuid NOT NULL REFERENCES vendors(id), to_vendor uuid NOT NULL REFERENCES vendors(id),
  week_of date NOT NULL, ref_type text, ref_id text,
  note text NOT NULL CHECK (length(note) >= 5),               -- obligan a escribir
  created_at timestamptz DEFAULT now(), CHECK (from_vendor <> to_vendor));
  -- presupuesto de 5/semana forzado por trigger
CREATE TABLE raffle_tickets (id bigserial PRIMARY KEY, vendor_id uuid, season_id uuid,
  ledger_id bigint REFERENCES points_ledger(id), created_at timestamptz DEFAULT now());
CREATE TABLE badges (id text PRIMARY KEY, label text, description text, rule jsonb);
CREATE TABLE vendor_badges (vendor_id uuid, badge_id text REFERENCES badges(id),
  earned_at timestamptz, evidence_ref text, PRIMARY KEY (vendor_id, badge_id));

CREATE TABLE audit_flags (   -- NUNCA penaliza sola: alimenta la calibración semanal de 20 min
  id bigserial PRIMARY KEY, vendor_id uuid NOT NULL REFERENCES vendors(id),
  flag_type text NOT NULL CHECK (flag_type IN ('burst_registration','scale_jump_no_evidence',
    'meeting_held_no_artifact','stage_oscillation','touchpoint_burst_offhours','conversa_sem_resposta')),
  entity_type text, entity_id text, details jsonb, detected_at timestamptz DEFAULT now(),
  review_status text DEFAULT 'open' CHECK (review_status IN ('open','calibrated','dismissed')),
  reviewed_by uuid REFERENCES vendors(id), reviewed_at timestamptz, review_notes text);

### DM12

-- ═══ F5.1 NOTIFICACIONES v2: presupuesto, dedupe y medición ═══
-- La tabla vieja: 4.521 filas, 2 tipos, 0,0% de lectura, la opp 46 con 106 avisos en 106 días.
-- NO se migra: se archiva un agregado y se arranca de cero.
CREATE TABLE notifications_archive AS
  SELECT vendor, type, count(*) n, min(created_at) desde, max(created_at) ate FROM notifications GROUP BY 1,2;
DROP TABLE notifications CASCADE;
SELECT cron.unschedule('check-inactivity-daily');   -- el cron que las generaba sin deduplicar

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid NOT NULL REFERENCES vendors(id),
  dedupe_key text NOT NULL,                        -- (vendor, entidad, tipo)
  type text NOT NULL, priority smallint NOT NULL CHECK (priority BETWEEN 1 AND 4),
  channel text CHECK (channel IN ('push','telegram','inapp')),
  topic text, ttl_seconds int DEFAULT 3600,
  title text NOT NULL, body text NOT NULL, deep_link text, actions jsonb,
  action_id uuid REFERENCES ventus_actions(id),
  scheduled_for timestamptz NOT NULL, sent_at timestamptz, read_at timestamptz,
  acted_at timestamptz, snoozed_until timestamptz, suppressed_reason text,
  created_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX uq_notif_live ON notifications(vendor_id, dedupe_key)
  WHERE read_at IS NULL AND status_is_open;
CREATE INDEX idx_notif_queue ON notifications(vendor_id, scheduled_for) WHERE sent_at IS NULL;

CREATE TABLE notification_prefs (
  vendor_id uuid PRIMARY KEY REFERENCES vendors(id),
  daily_budget int DEFAULT 4, quiet_from time DEFAULT '20:00', quiet_to time DEFAULT '07:00',
  channels text[] DEFAULT '{telegram,push}', muted_types text[] DEFAULT '{}',
  game_notifications boolean DEFAULT true,          -- opt-out real de anillos y rachas
  learned_hour int);
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid NOT NULL REFERENCES vendors(id),
  endpoint text UNIQUE NOT NULL, p256dh text NOT NULL, auth text NOT NULL,
  platform text, user_agent text, created_at timestamptz DEFAULT now(),
  last_seen_at timestamptz, failed_at timestamptz);

### DM13

-- ═══ F5.2 TELEGRAM: vinculación verificada y multi-chat ═══
-- Hoy solo 3 de 6 vendors tienen telegram_id: Victor Hugo, Andre y Paulo NO pueden usar el bot,
-- y el autolink por @username lo gana quien tome el username primero.
CREATE TABLE vendor_link_codes (
  code char(6) PRIMARY KEY, vendor_id uuid NOT NULL REFERENCES vendors(id),
  expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE vendor_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid NOT NULL REFERENCES vendors(id),
  kind text NOT NULL CHECK (kind IN ('telegram_dm','telegram_group')),
  chat_id bigint NOT NULL, telegram_user_id bigint,
  verified_at timestamptz, is_primary boolean DEFAULT true, is_active boolean DEFAULT true,
  UNIQUE (kind, chat_id));

### DM14

-- ═══ F6/F8 RITUALES, RIESGO, STAKEHOLDERS Y CONFLICTOS ═══
CREATE TABLE daily_plans (vendor_id uuid, day date, planned_task_ids uuid[], done_task_ids uuid[],
  morning_done_at timestamptz, shutdown_done_at timestamptz, shutdown_notes text,
  PRIMARY KEY (vendor_id, day));
ALTER TABLE commitments
  ADD COLUMN task_id uuid REFERENCES tasks(id),
  ADD COLUMN declared_from text CHECK (declared_from IN ('queue','manual')),
  ADD COLUMN verdict_proposed jsonb,               -- veredicto sugerido por Ventus
  ADD COLUMN verdict_by uuid REFERENCES vendors(id),
  ADD COLUMN verdict_channel text CHECK (verdict_channel IN ('app','telegram')),
  ADD COLUMN points_awarded int DEFAULT 0;
CREATE INDEX idx_commit_week ON commitments(vendor_id, week_of, status);

CREATE TABLE stakeholders (   -- hoy son 4 strings sueltos en opportunities
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id int REFERENCES opportunities(id) ON DELETE CASCADE,
  name text NOT NULL, title text, email text, phone text, whatsapp text, linkedin text,
  role text CHECK (role IN ('tomador_decisao','pessoa_contato','influenciador','apoio','compras','bloqueador')),
  engagement text CHECK (engagement IN ('quente','morno','frio','nunca_falou')),
  last_touch_at timestamptz, created_at timestamptz DEFAULT now());

CREATE TABLE deal_risks (   -- 6 reglas determinísticas, job nocturno
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id int REFERENCES opportunities(id) ON DELETE CASCADE,
  rule text NOT NULL CHECK (rule IN ('single_threaded','silencio','regressao_escala',
    'gate_falso','acao_vencida','proposta_sem_resposta')),
  severity text CHECK (severity IN ('atencao','critico')), detail jsonb NOT NULL,
  detected_at timestamptz DEFAULT now(), resolved_at timestamptz);

CREATE TABLE conflict_log (id bigserial PRIMARY KEY, table_name text, row_id text, field text,
  discarded_value jsonb, winning_value jsonb, vendor_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE market_signals (   -- gatillos externos (v2 del roadmap; tabla desde ya)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL, domain text,
  market_sweep_id uuid, opportunity_id int,
  kind text CHECK (kind IN ('novo_cd','vaga_logistica','expansao','troca_gerente','noticia_qualidade','roubo_carga')),
  headline text NOT NULL, url text, angle text, found_at timestamptz DEFAULT now(), consumed_at timestamptz);

### DM15

-- ═══ ÍNDICES Y REALTIME (la query central del v3 hoy hace seq scan) ═══
CREATE INDEX idx_opp_next_action ON opportunities(next_action_date) WHERE outcome IS NULL;
CREATE INDEX idx_opp_board ON opportunities(vendor_id, stage) WHERE outcome IS NULL;
CREATE INDEX idx_opp_close ON opportunities(expected_close) WHERE outcome IS NULL;
CREATE INDEX idx_opp_fresh ON opportunities(last_activity_at) WHERE outcome IS NULL;
CREATE INDEX idx_act_timeline ON activities(opportunity_id, created_at DESC);
CREATE INDEX idx_act_game ON activities(vendor_id, activity_date);     -- conteo diario de gamificación
CREATE INDEX idx_tp_time ON touchpoints(executed_at DESC);
CREATE INDEX idx_tp_metrics ON touchpoints(channel, result);           -- métricas de cadencia por canal
CREATE INDEX idx_tp_seq ON touchpoints(lead_id, sequence_number);
-- 4 FKs sin índice (INFO del advisor)
CREATE INDEX idx_leads_opp ON leads(opportunity_id);
CREATE INDEX idx_commit_lead ON commitments(lead_id);
CREATE INDEX idx_bot_sessions_vendor ON bot_sessions(vendor_id);
-- índices que nunca se usaron
DROP INDEX idx_opportunities_health_score, idx_notifications_vendor, market_sweep_name_idx,
  idx_apollo_cache_endpoint, idx_lusha_cache_expires;
ANALYZE;   -- nunca corrió: list_tables reporta 0 filas en vendors

-- Realtime: la publicación supabase_realtime tiene CERO tablas pese a figurar en el stack
ALTER TABLE tasks REPLICA IDENTITY FULL;
ALTER TABLE daily_rings REPLICA IDENTITY FULL;
ALTER TABLE points_ledger REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE opportunities, tasks, activities, touchpoints,
  leads, notifications, ventus_actions, points_ledger, daily_rings, golden_hour_sessions, kudos;

### DM16

-- ═══ JOBS pg_cron (reemplazan Vercel Cron: precisión de minuto, gratis, al lado del dato) ═══
SELECT cron.schedule('dispatch-notifications','*/5 * * * *',
  $$ SELECT net.http_post(url:='.../functions/v1/dispatch',
     headers:='{"Authorization":"Bearer <service_role>"}'::jsonb) $$);
SELECT cron.schedule('golden-queue','0 21 * * 1-5', $$ SELECT net.http_post(url:='.../golden-queue') $$);   -- 18h BRT
SELECT cron.schedule('close-day','5 3 * * *',     $$ SELECT net.http_post(url:='.../close-day') $$);        -- 00:05 BRT
SELECT cron.schedule('settle-points','0 10 * * *',$$ SELECT net.http_post(url:='.../settle-points') $$);    -- clawback
SELECT cron.schedule('weekly-awards','0 20 * * 5',$$ SELECT net.http_post(url:='.../weekly-awards') $$);    -- vie 17h BRT
SELECT cron.schedule('risk-scan','0 6 * * *',     $$ SELECT net.http_post(url:='.../risk-scan') $$);
SELECT cron.schedule('audit-flags','0 7 * * *',   $$ SELECT net.http_post(url:='.../audit-flags') $$);

-- ═══ RETENCIÓN Y PRIVACIDAD ═══
-- bot_log guarda transcripciones íntegras de conversaciones con clientes, sin TTL ni cifrado
CREATE INDEX idx_bot_log_created ON bot_log(created_at);
SELECT cron.schedule('purge-bot-log','0 4 * * 0',
  $$ DELETE FROM bot_log WHERE created_at < now() - interval '180 days' $$);
SELECT cron.schedule('purge-sessions','0 4 * * *',
  $$ DELETE FROM bot_sessions WHERE updated_at < now() - interval '7 days' $$);
SELECT cron.schedule('purge-notifications','0 4 * * 0',
  $$ DELETE FROM notifications WHERE scheduled_for < now() - interval '90 days' $$);

### DM17

-- ═══ MIGRACIÓN DE DATOS: qué SÍ y qué NO ═══
-- SÍ: 65 opportunities (con normalizeScales tolerando los 3 formatos históricos),
--     54 leads, 168 touchpoints, 6 vendors, 239 market_sweep (índices únicos parciales intactos),
--     3 commitments, y de las 151 activities SOLO las 18 humanas + 5 ai_parsed.
-- NO: 90 activities 'system' (subproducto de triggers que el v3 regenera),
--     4.521 notifications (0% de lectura; migrar ruido = avalancha el día 1),
--     apollo_search_cache (856 kB, 62% del volumen junto a notifications).

-- AUDITAR ANTES DE CONFIAR EN stage: los gates eran evadibles con un checklist local no persistido.
-- stage 3 promedia MENOS dor (2,7) que stage 2 (4,0). Toda métrica que asuma 'etapa 4 ⇒ valor>=6'
-- está mal sobre los datos migrados.
CREATE TABLE migration_gate_audit AS
SELECT id, name, vendor, stage,
  (scales->'dor'->>'score')::int dor, (scales->'poder'->>'score')::int poder,
  (scales->'visao'->>'score')::int visao, (scales->'valor'->>'score')::int valor,
  (scales->'controle'->>'score')::int controle, (scales->'compras'->>'score')::int compras,
  CASE WHEN stage>=2 AND ((scales->'dor'->>'score')::int < 5 OR (scales->'poder'->>'score')::int < 4)
       THEN true ELSE false END AS gate_violado
FROM opportunities WHERE outcome IS NULL;

## Plano de entrega

### F0 · Desminado (semana 1)

**Meta:** Cerrar el agujero de seguridad de la base y disparar el único ítem con deadline externo. Nada de F1 en adelante empieza hasta que F0 esté verde.

- `supabase/migrations/0001_security.sql` — DROP de la policy 'Enable all for development' en opportunities/leads/touchpoints, REVOKE de escritura a anon, las 5 vistas a SECURITY INVOKER, search_path fijo. **Done cuando**: con el anon key del bundle un `select * from opportunities` devuelve 0 filas, y el CRM v2 sigue funcionando (verificar que `AIAssistant.jsx:58` no dependía de la policy abierta).
- Trámite de la **Limited Distribution Account** de Android iniciado (gratis, ≤20 dispositivos). **Done cuando**: hay número de solicitud y el package `br.com.ventapel.ventus` está reservado.
- `android/ventapel-ventus.keystore` RSA 4096 creado, guardado en el gestor de secretos, `*.keystore` en .gitignore, SHA-256 documentado. **Done cuando**: `keytool -list -v` devuelve el fingerprint y está anotado en dos lugares (registro de Google + futuro assetlinks).
- `supabase/migrations/0002_identity.sql` — vendor_id uuid + backfill en 6 tablas + `current_vendor_id()`. **Done cuando**: `select count(*) from opportunities where vendor_id is null` = 0 en las 6 tablas.
- `migration_gate_audit` poblada. **Done cuando**: hay un número concreto de cuántas de las 65 oportunidades violan su propio STAGE_GATE, reportado a Jordi.
- Borrado de `src/config/vendorsConfig.js`, `src/supabaseClient.ts` y `api/google-search.js`. **Done cuando**: `grep -r vendorsConfig src/` no devuelve nada.
- Proyecto/branch Supabase de staging con copia de datos. **Done cuando**: el bot puede apuntar a staging con una env var.

_Agentes:_ `agente-seguridad` (**Opus**) diseña el modelo RLS nuevo y la estrategia de backfill — es donde un error abre o cierra el pipeline entero y hay que razonar sobre 12 tablas, 3 clientes y 5 triggers a la vez. `agente-sql` (**Sonnet**) escribe las migraciones, los scripts de verificación de huérfanos y el staging. Tomás dispara el trámite de Google el día 1 (humano en el loop, no delegable).

### F1 · Dominio + cáscara instalable (semanas 2-4) — ⚠️ cierra antes del 30/09

**Meta:** Tener el dominio extraído y testeado, y el APK instalado en los 6 teléfonos ANTES del deadline de Android. Como el TWA carga la URL web, el APK se instala vacío y se llena solo con cada deploy: eso convierte un deadline externo en un trámite de la semana 4.

- Monorepo `ventus3/` con pnpm+Turborepo y `packages/core`: `ppvvcc.ts` (port tipado de `/home/user/CRMbr/api/_lib/ppvvcc.js`), `cadence.ts`, `methodology.ts`, `spin.ts`, `dates.ts` (port de `/home/user/ventus-bot/lib/dates.js`). **Done cuando**: `pnpm test` pasa con las 65 oportunidades reales como fixtures y `checkStageRequirements` da idéntico resultado que el v2 en las 65.
- `packages/core/planner.ts` → `rankDay(cartera, leads, hoy)` devuelve 3 items con `{acción, motivo:{señales[]}, escala_alvo, preguntas[]}`. **Done cuando**: corre en <5ms sin red y hay un snapshot test que grita si cambia el orden.
- `packages/core/risk.ts` — port de `analyzePipelineHealth` (excluyendo deals cerrados, que hoy inflan totales), `analyzeOpportunity`, `generateAlerts`, `generateNextBestAction`. **Done cuando**: cobertura >80% en Vitest.
- `apps/app` shell: React 19 + Vite 8 + Tailwind 4, React Router 8 con rutas canónicas (`/hoje`, `/golden`, `/oportunidade/:id`, `/lead/:id`, `/agenda`, `/placar`), Error Boundary por ruta, `packages/ui` con Sheet, Card, SwipeRow, Ring, Toast-con-undo, Skeleton, `haptic()`, `useSafeArea()`, `useHost()`. **Done cuando**: `grep -r 'alert(\|confirm(' apps/app/src` devuelve 0.
- `apps/app/manifest.webmanifest` 2026: `id`, `display:standalone`, `launch_handler:focus-existing`, 4 shortcuts (⚡ Golden Hour / 🎙 Registrar / 📋 Hoje / 💼 Carteira), screenshots narrow + description, `share_target` POST multipart. `apps/app/src/sw.ts` con injectManifest (handlers de push/sync/notificationclick). **Done cuando**: Lighthouse PWA installable = pass.
- `android/` con Bubblewrap 1.25.0 + JDK 17, `public/.well-known/assetlinks.json` con header `Content-Type: application/json` en `vercel.json`, `enableNotifications:true`, GitHub Action `release-apk.yml` por tag. **Done cuando**: el APK abre a pantalla completa SIN la barra de Chrome en un teléfono real, y está instalado en los 6 teléfonos antes del 30/09.

_Agentes:_ `agente-dominio` (**Opus**) diseña `rankDay()` y el contrato de `packages/core` — es una decisión de producto disfrazada de código y define si el CRM se siente inteligente o arbitrario. `agente-port` (**Sonnet**) traduce ppvvcc/cadencia/methodology JS→TS con tests. `agente-ds` (**Sonnet**) construye `packages/ui`. `agente-android` (**Sonnet**) arma Bubblewrap, assetlinks y la GitHub Action.

### F2 · Datos, tareas y la tela Hoje (semanas 4-7)

**Meta:** Que el vendedor abra la app y vea TRES cosas para hacer, con el porqué, y las pueda resolver de un swipe — offline incluido. Resuelve el fallo de producto más grande del v2: el panel de acciones es 100% read-only.

- `supabase/migrations/0003_tasks.sql` — tabla `tasks` + trigger `sync_next_action()` + migración de los `next_action` existentes. **Done cuando**: crear una task por 3 caminos distintos (app, bot, cron) deja `opportunities.next_action` correcto sin que ningún cliente llame a nada.
- `packages/data`: `db.ts` (Dexie con opportunities/leads/tasks/activities-90d), `outbox.ts` (client_uuid + idempotency), `sync.ts` (flush por `sync` del SW / `online` / `visibilitychange`), `realtime.ts` (reconciliador que respeta el outbox). **Done cuando**: test de Playwright — modo avión → 5 mutaciones → reconectar → 5 filas en la base, 0 duplicados, y ningún evento remoto pisó un valor optimista.
- `supabase/migrations/0004_views.sql` — vista/RPC agregada `v_carteira_do_dia` que devuelve la lista con próxima acción, health y días-sin-contacto ya resueltos. **Done cuando**: abrir `/carteira` con 65 oportunidades dispara **1** query (hoy son ~195).
- `apps/app/src/routes/hoje.tsx` — 3 cards máximo, chip 'Por que isto?', swipe derecha=Feito / izquierda=Adiar con picker rápido y undo 5s, anillos en el header (todavía sin puntos), chips de zona, 'Pronto por hoje' que NO recarga. **Done cuando**: se renderiza desde Dexie en <100ms sin red en un Android de gama media.
- `apps/app/src/routes/carteira.tsx` con 6 Smart Views como tiles con contador y vista compacta de 72px por fila. **Done cuando**: ver 10 oportunidades cuesta <1 pantalla de scroll (hoy son ~8.000px).

_Agentes:_ `agente-datos` (**Opus**) diseña el contrato del outbox, la reconciliación con realtime y el modelo de idempotencia — decisiones irreversibles. `agente-ui-hoje` (**Sonnet**) implementa la tela Hoje, el swipe y la carteira. `agente-sql` (**Sonnet**) escribe tasks, trigger y vistas agregadas.

### F3 · Captura sin fricción + Ventus escribe (semanas 7-10)

**Meta:** Que registrar una interacción cueste 30 segundos hablando, y que Ventus pueda proponer cambios en el PPVVCC con la cita que los justifica sin que nadie pierda control.

- `supabase/functions/ventus-ingest/` — MediaRecorder (negociación webm/opus → mp4 en iOS ≤18.3) → Groq whisper-large-v3-turbo → claude-sonnet-5 structured outputs, reusando **palabra por palabra** el system prompt de `/home/user/ventus-bot/lib/claude.js:148-172`. **Done cuando**: 20 audios de prueba en portuñol dan ≥90% de match correcto de cliente y 0 clientes inventados.
- `apps/app/src/features/registro-voz/` — hold-to-talk con waveform, blob a IndexedDB **antes** de subir, gate de próxima acción con **botones** de fecha (Hoje/Amanhã/Segunda/+7d). **Done cuando**: p95 del tiempo 'apretar mic → registro confirmado' ≤45s, y matar la app a mitad de la subida no pierde el audio.
- `supabase/migrations/0005_ventus.sql` + `packages/agent/tools/` — las 14 tools `ventus_*` con `strict:true`, `ventus_actions` con idempotency_key y precondition_hash, RPC `ventus_commit_action()`. **Done cuando**: dos taps rápidos en Confirmar producen **una** fila, y editar la oportunidad en otra pestaña hace que el commit devuelva `stale` y re-proponga.
- `supabase/migrations/0006_evidence.sql` + `apps/app/src/features/ppvvcc/` — `scale_evidence` con el CHECK que impone la regra da prova, editor de escala como sheet con los 11 niveles canónicos y stepper (adiós al `input type=range`), badges verde/âmbar/vermelho, health declarado vs verificado. **Done cuando**: es imposible por UI y por RPC subir una escala por encima de 5 sin `quote`.
- `apps/app/src/routes/oportunidade.tsx` (Dossiê) + `revisao.tsx` (diffs con accept/edit/dismiss por campo y 3 razones fijas de rechazo). **Done cuando**: la ficha carga con 1 query y el timeline muestra activities+touchpoints+stage_change unificados.
- RPC `avancar_etapa()` con gate revalidado server-side + trigger `log_stage_change`. **Done cuando**: el checklist textual ya no permite saltar el gate sin dejar un override auditado con motivo y autor.

_Agentes:_ `agente-agente` (**Opus**) diseña el esquema de las tools, la confianza graduada y el flujo propose→commit; y el prompt de extracción (es donde se define si el dato entra limpio). `agente-voz` (**Sonnet**) implementa MediaRecorder, la cola de audios y la Edge Function. `agente-ppvvcc` (**Sonnet**) hace el editor de escalas, el Dossiê y la Revisão.

### F4 · Golden Hour, cadencia y el hábito mínimo (semanas 10-12)

**Meta:** Instalar el ritual que genera pipeline y hacer visible el hábito. Los anillos y la racha salen acá porque sin ellos la Golden Hour es solo una pantalla; la economía de puntos arranca en **shadow mode** (se calcula, no se muestra).

- `supabase/functions/golden-queue/` — job 18h que arma la fila (touchpoints vencidos por CADENCE_SCHEDULE + oportunidades frías + market_sweep asignado) y la manda por Telegram para aprobar con un tap. **Done cuando**: los 4 vendedores reciben su fila a las 18h y la aprueban en <10s.
- `apps/app/src/routes/golden.tsx` — full-screen sin navegación ni edición de campos, timer, Screen Wake Lock, carrusel de un contacto por vez, rascunho por canal y TP, 4 botones (Ligou/Falou/Agendou/Passar), HUD 'Here Now' por realtime + high-five con haptic cruzado, nota de voz de 15s. **Done cuando**: una sesión completa de 45 min funciona **en modo avión** y sincroniza al salir.
- Pantalla de cierre con las 3 preguntas de debrief y cálculo de `hora_cheia`. **Done cuando**: `hora_cheia` solo es true con meta de toques Y ≥1 conversa real Y debrief — discar números muertos no la gana.
- `apps/app/src/routes/cadencia.tsx` como **fila ordenada por `next_touchpoint_date`** (no kanban, no scroll anidado), urgencia calculada contra el schedule real, botón `Converter` siempre disponible que crea la fila en `tasks`, y fix del borrado de touchpoint (`remaining > 0 ? null : null` devuelve null en las dos ramas). **Done cuando**: convertir un lead deja una task con fecha y el lead ya no queda huérfano.
- `promote_sweep_to_lead()` + pantalla 'Puxar do mapa de mercado'. **Done cuando**: las 83 empresas asignadas sin lead son convertibles de un tap y Victor Hugo, Renata y Paulo dejan de tener cero leads.
- `supabase/migrations/0007_habit.sql` + `packages/core/scoring.ts` — `daily_rings` con largada dotada 2/12, `vendor_goals` (cookbook ±30%), `streaks` con 2 escudos y resgate, `business_calendar` con feriados BR/SP, `golden_hour_sessions`. `points_ledger` escribiendo con `status='shadow'`. **Done cuando**: los anillos se cierran en tiempo real vía realtime y la racha respeta el 12 de octubre.

_Agentes:_ `agente-ritual` (**Opus**) diseña la mecánica de la sesión, qué entra en la fila y con qué prioridad, la definición de Hora Cheia y la máquina de estados de la racha (feriados, escudo silencioso, resgate parcial — muchos casos borde). `agente-golden` (**Sonnet**) implementa el modo foco, el carrusel y el Wake Lock. `agente-cadencia` (**Sonnet**) reescribe la cadencia y el puente de market_sweep.

### F5 · Telegram completo: dispatcher, control remoto y Mini App (semanas 12-15)

**Meta:** Cerrar el loop proactivo por el único canal que llega siempre, y darle a Telegram el CRM entero. Es también la fase que incorpora a los 3 vendedores que hoy no pueden usar el bot.

- `apps/bot` reescrito sobre `packages/core` y las RPC de dominio (fin de los dos Ventus). Fixes: result como enum + `result_note`; sin pisada de `next_action`; CADENCE_SCHEDULE aplicado y `leads.stage` movido; `claimUpdate()` en dos fases (hoy si Groq falla el audio se pierde para siempre); `/api/digest` fail-**closed**; troceo a 4096 chars; prompt caching. **Done cuando**: bot_log muestra ≥80% de registros efectivos sobre eventos (hoy 13%).
- `vendor_link_codes` + `/vincular <código>` + pantalla de emparejamiento en Ajustes. **Done cuando**: Victor Hugo, Andre y Paulo mandan su primer audio al bot.
- `supabase/functions/dispatch/` — cola única con Web Push VAPID + Telegram, presupuesto 4/día, quiet hours, dedupe_key, Topic/Urgency/TTL, medición de lectura y acción. **Done cuando**: apagar el teléfono toda la mañana produce **una** notificación de agenda al prenderlo, no seis.
- Avisos en producción: agenda 7h · prep de reunião T-90 con 5 bullets · Golden Hour T-15 y fila de la víspera · alertas de riesgo · veredicto de compromissos viernes 16h. **Done cuando**: la tasa de lectura a 7 días es ≥50% (hoy 0,0%).
- `/hoje` y `/golden` con inline keyboard, `editMessageText` in-place, `callback_data` namespaced + versionado, `answerCallbackQuery` siempre, `/desfazer`. **Done cuando**: tocar un botón scrolleado de ayer responde 'já foi feito' en vez de duplicar.
- `apps/app` compilando también como **Telegram Mini App** vía `useHost()`; `supabase/functions/tma-auth/` valida initData (HMAC-SHA256 con secret `HMAC-SHA256(botToken,'WebAppData')` **con expiración por auth_date**) → JWT de Supabase; 14 theme params, MainButton/SecondaryButton/BackButton, safeAreaInset, CloudStorage, `addToHomeScreen()` en la 3ª sesión; deep links `?startapp=opp_1842_log`. **Done cuando**: un initData vencido o alterado devuelve 401 y un vendedor entra a su cartera sin login.

_Agentes:_ `agente-notificaciones` (**Opus**) diseña la política del dispatcher (presupuesto, dedupe, escalamiento) y el contrato de validación de initData — dos piezas donde un error es un agujero de seguridad o una avalancha. `agente-bot` (**Sonnet**) reescribe el bot y los comandos. `agente-tma` (**Sonnet**) hace el adapter useHost, el theming y tma-auth.

### F6 · Offline duro, conflictos y rendimiento (semanas 15-17)

**Meta:** Que la app sea confiable en la planta. Es el punto más caro y no hay nada reutilizable del v2: todas sus escrituras son llamadas a supabase-js esparcidas dentro de onClick.

- LWW **por campo** con `scales_updated_at` jsonb + `conflict_log` + delta fetch por `updated_at > last_sync_at` al reconectar. **Done cuando**: dos dispositivos editando escalas distintas de la misma oportunidad offline convergen sin pisarse, y el valor descartado queda logueado.
- `navigator.storage.persist()` + badge 'X registros pendentes' + full refetch silencioso si el store aparece vacío con sesión viva. **Done cuando**: borrar el IndexedDB a mano y reabrir no muestra una cartera vacía.
- Precache nocturno del 'modo viagem' (fichas, últimas 10 actividades, evidencias, teléfonos y brief de las reuniones de mañana), disparado **en foreground** a las 21h porque iOS no tiene Periodic Sync. **Done cuando**: el banner dice '3 visitas amanhã — tudo baixado ✅' o nombra explícitamente qué falta.
- Presupuestos verificados en Android de gama media real con throttling 4G: TTI <1,5s, cero spinners bloqueantes, animaciones solo en compositor. **Done cuando**: hay un trace de Performance adjunto al PR.
- `playwright/` con los 3 flujos críticos: Golden Hour completa, registro por voz offline→sync, avance de etapa con gate. **Done cuando**: los 3 corren en CI y bloquean el merge.
- APK final por tag + página `/instalar` en PT-BR con QR y capturas (incluyendo el paso de Play Protect) + procedimiento `adb install -r` documentado. **Done cuando**: un vendedor instala solo, siguiendo el QR, sin ayuda.

_Agentes:_ `agente-sync` (**Opus**) diseña el modelo de conflictos por campo y la interacción outbox↔realtime — lo más difícil de corregir después. `agente-offline` (**Sonnet**) implementa LWW, conflict_log, precache y persist. `agente-qa` (**Sonnet**) escribe Playwright y mide rendimiento en dispositivo.

### F7 · Gamificación visible: de shadow mode a Temporada 1 (semanas 17-20)

**Meta:** Encender el juego con las defensas construidas ANTES que los puntos, y con dos semanas de datos reales para calibrar. Si los puntos salieran primero, el dato estaría podrido en dos semanas y no se recupera.

- `supabase/migrations/0008_scoring.sql` — `scoring_rules` versionadas, `points_ledger`, `buyer_signals`, y el motor en `packages/core/scoring.ts` con techos diarios, clawback diferido y peso por señal del comprador. **Done cuando**: hay ≥2 semanas de ledger en `status='shadow'` y los pesos se recalibraron contra el comportamiento real medido.
- Botón **'O cliente fez algo'** en el Dossiê y en el bot. **Done cuando**: dor/poder/valor/compras solo pueden subir si existe un `buyer_signal` o una `scale_evidence` con cita.
- `apps/app/src/routes/placar.tsx` — 4 carriles paralelos **sin posiciones**, 5 trofeos rotativos (constraint UNIQUE que impide ganar dos), meta colectiva votada, kudos 5/semana con texto obligatorio, `seasons` de 4 semanas con `raffle_tickets`. **Done cuando**: ninguna pantalla del producto muestra a nadie como 'último'.
- `apps/app/src/routes/regras.tsx` + 'Por que ganhei isto' tocable en cada PA. **Done cuando**: cualquier vendedor puede explicar en una frase cómo se puntúa, sin ayuda.
- `supabase/functions/audit-flags/` + cola de calibración en el Painel do Gestor. **Done cuando**: la reunión semanal de 20 min está en la agenda de Jordi con dueño y horario fijo.
- Rituais: `manha.tsx`, `encerramento.tsx`, `compromissos.tsx` con veredicto asistido (Ventus cruza commitments vs activities/touchpoints y propone, el humano confirma). **Done cuando**: se pueden completar enteros desde Telegram sin abrir la app.
- Celebración multicanal: haptic por tipo, animación, anthem en el canal, push a los 4 en fechado. **Done cuando**: el tiempo evento→celebración es <1s.
- Sesión de lanzamiento presencial de 90 min: reglas en una página, **se dice en voz alta que las comisiones quedan fuera del juego**, cada uno fija su frase si-entonces de Golden Hour y su primer cookbook.

_Agentes:_ `agente-economia` (**Opus**) calibra pesos, techos y la rampa contra el baseline real (12 touchpoints/semana para todo el equipo), y escribe TODOS los textos de celebración y de perdón — el tono es la diferencia entre coaching y coerción. `agente-juego` (**Sonnet**) implementa ledger, anillos SVG, placar, trofeos y los jobs de pg_cron. `agente-rituais` (**Sonnet**) hace las 3 pantallas de ritual y el veredicto asistido.

### F8 · Coach, gestor, medición y corte del v2 (semanas 20-23)

**Meta:** Que Ventus deje de resumir y empiece a diagnosticar, que se pueda medir qué de todo esto sirve, y apagar el CRM viejo.

- `supabase/functions/ventus-chat/` con **streaming**, prompt caching verificado (`cache_read_input_tokens` en el log), rate limiting y cuota por vendedor, `ai_usage_log` con costo atribuible. **Done cuando**: no queda ningún 504 silencioso y hay un costo/vendedor/mes reportable.
- `supabase/functions/risk-scan/` con las 6 reglas de `deal_risks` + `stakeholders` con roles faltantes en gris + alerta de single-threading. **Done cuando**: cada riesgo llega con una prescripción concreta, no con 'oportunidade parada'.
- `apps/app/src/routes/gestor.tsx` — coaching semanal por vendedor generado los viernes (qué se movió con evidencia, qué se estancó, % de compromissos, UNA sugerencia anclada en PPVVCC), alertas accionables, cola de calibración, salud del dato. **Y los nombres de etapa correctos**: Prospecção/Qualificação/Apresentação/Validação-Teste/Negociação/Fechado (hoy el admin lee tooltips que mienten). **Done cuando**: Jordi recibe el resumen por Telegram el viernes 17h.
- `ventus_recommendations` midiendo mostrada/aceptada/descartada/ejecutada + feedback inline 👍/👎 con 3 razones. **Done cuando**: hay un dashboard de accept rate por tipo y se apagó al menos una regla con <40%.
- Casos de éxito movidos de `api/assistant.js:27-209` a tabla de Supabase con tags normalizadas. **Done cuando**: agregar un caso no requiere un deploy.
- Migración final de datos y corte: el v2 pasa a solo lectura y luego se apaga; columnas `vendor` de texto marcadas como deprecadas. **Done cuando**: nadie abrió el v2 en 7 días corridos.
- Revisión del North Star a 30/60/90 días con los 3 controles (AVV, Dia Cheio, ratio de eventos con evidencia).

_Agentes:_ `agente-coach` (**Opus**) escribe los prompts de coaching y del panel del gestor, el modelo de riesgo y el esquema de medición de recomendaciones — es el output de mayor valor por token del sistema. `agente-medicion` (**Sonnet**) implementa streaming, usage, el dashboard y el tracking. `agente-migracion` (**Sonnet**) hace los scripts de corte con verificación fila por fila.

## Perguntas em aberto

1. **🚨 ¿Quién dispara esta semana el trámite de la Limited Distribution Account de Android?** Deadline Brasil: 30/09/2026, a ~5 semanas. Es gratis, sin ID gubernamental, hasta 20 dispositivos (Ventapel tiene 6). Sin registro, después de esa fecha instalar el APK exige modo desarrollador + reinicio + espera de 24h por teléfono. Necesita una cuenta Google de la empresa y el fingerprint del keystore. Es el único ítem del plan con fecha externa y no puede esperar a F5.
2. **¿Qué teléfonos tiene efectivamente el equipo — marca, modelo, versión de SO?** Es una pregunta de 5 minutos que condiciona tres fases: si los 6 son Android, el TWA + Web Push cubre todo, las haptics funcionan de verdad y hay Background Sync. Si hay iPhones, Telegram pasa de red de seguridad a canal obligatorio, el Mini App sube de prioridad y hay que presupuestar el flujo de instalación manual con pantalla de coaching.
3. **¿Se acepta que la Golden Hour por defecto sea a las 16h?** Los datos propios dicen que el equipo ya prospecta 15-16h (42 y 25 touchpoints) con segundo pico 9-10h. Anclar donde ya hay conducta multiplica la adopción; imponer las 7h o las 9h es empezar peleando contra el hábito real. Y: ¿el blitz sincronizado es martes y jueves 16h para los cuatro, o cada uno su ventana? Choca con agendas de visita a plantas. Decisión de Jordi.
4. **Confirmación explícita: ¿las comisiones quedan fuera del juego?** Es la decisión de diseño más importante de toda la capa de gamificación y hay que tomarla antes de escribir la primera regla de scoring. Si los PA llegan a tocar la remuneración, la gente miente y el dato se pudre; si dan estatus frente a tres compañeros que ven todo, mentir no rinde. Tiene que declararse públicamente en el lanzamiento, no quedar implícito.
5. **¿Se acepta la rampa de metas (4 → 8 → 12 toques/día en 3 meses)?** El baseline es 12 touchpoints por semana para TODO el equipo. Arrancar en 4/día ya es 6,6× ese baseline; arrancar en 12/día sería 20× y hace la racha inalcanzable las primeras semanas, quemando el mecanismo antes de que arraigue.
6. **¿Quién aprueba el catálogo de recompensas y quién garantiza que se cumplen?** 'Sexta-feira curta', 'elegir primero los leads calientes' o 'elegir la fábrica a visitar' tienen costo operativo real. Un premio prometido y no entregado destruye el sistema más rápido que no tener premios. Sin catálogo aprobado, la meta colectiva mensual no se puede lanzar.
7. **¿Se auditan las 65 oportunidades contra sus propios gates antes de migrar?** Los datos dicen que stage 3 promedia menos DOR (2,7) que stage 2 (4,0): hay oportunidades en etapas que no les corresponden, porque los gates eran evadibles con un checklist local que nunca se persistía. Opciones: (a) migrar tal cual y que el sistema las marque como 'gate falso', o (b) una sesión de re-scoring de una hora por vendedor. (b) da mejor dato pero cuesta 4 horas del equipo.
8. **¿Qué pasa con Paulo?** Alta en marzo, cinco meses después: 0 oportunidades, 0 leads, 0 activities, sin telegram_id, y 23 empresas asignadas en market_sweep que nunca tocó. No es un problema de producto — es la prueba de que el sistema actual no arrastra a un usuario nuevo. ¿El onboarding guiado de la primera semana lo resuelve, o hay una situación previa de management? Diseñar sin saberlo es adivinar.
9. **¿El v3 comparte la base actual o se crea un proyecto Supabase nuevo?** Este plan asume compartir (permite convivencia y corte gradual), pero obliga a que el saneamiento de RLS de F0 no rompa el v2 en producción. Un proyecto nuevo evita ese riesgo pero duplica la migración y deja al bot escribiendo en dos lados. Y en cualquier caso hace falta **una fecha de corte del v2**: correr los dos en paralelo indefinidamente es la receta para que el dato se pise.
10. **¿Cuál es el techo mensual de gasto en IA?** Hoy es ilimitado, no atribuible y solo se imprime en un console.log. El v3 multiplica las llamadas (agenda diaria ×4, brief por reunión, cada audio, cada diagnóstico, coaching semanal). Con prompt caching y effort tiering la estimación es USD 80-150/mes para 6 usuarios, pero hace falta un tope declarado para calibrar las cuotas y decidir qué se degrada primero. Propuesta: el coaching cae al motor determinístico, la captura por voz nunca se corta.
11. **¿Quién es el dueño operativo de la calibración semanal de 20 minutos — Jordi o Tomás?** Sin un dueño con nombre y un horario fijo en la agenda, la auditoría automática produce ítems que nadie mira, las escalas PPVVCC dejan de ser comparables entre cuatro personas y todas las defensas técnicas se degradan en tres meses. Es la única parte del sistema que no se puede automatizar.
12. **¿Retención y privacidad de las transcripciones?** `bot_log` guarda hoy conversaciones íntegras con clientes, sin TTL ni cifrado, y el v3 multiplica la captura por voz. Propuesta: 180 días de retención y truncado del `input_text` tras confirmar el registro, manteniendo la estructura extraída. ¿Hay alguna obligación contractual con clientes que condicione esto?
13. **¿Se conserva la búsqueda web con Serper?** Hoy `api/google-search.js` es un endpoint huérfano, sin auth, que expone la SERPER_API_KEY como proxy público. Si las señales externas de mercado del roadmap v2 se van a construir, conviene rehacerlo bien; si no, borrarlo en F0 (que es lo que este plan asume). Relacionado: ¿hay créditos vigentes de Apollo/Lusha para los gatillos de compra?

## Notas de síntese

## Qué tomé de cada propuesta y por qué

**De la mobile-first (P1)** — la disciplina de producto y el detalle de superficie. Sus 14 pantallas con `mobile_notes` concretos son el mejor mapa de UI de las tres: el límite duro de 3 acciones, el swipe con undo, la Carteira compacta de 72px, el kanban reemplazado por fila, la Cadência sin scroll anidado, y el checklist no negociable de sensación nativa (svh, safe-area en todos los bordes, View Transitions, 27 `alert()` a cero). También su regla de "una sola llamada por pantalla", que es el antídoto exacto contra el patrón de ~195 queries del v2. Y su fase F0 de desminado, que es la única forma sensata de arrancar.

**De la agent-first (P2)** — la arquitectura. Su frase organizadora ("no es una app con IA adentro, es un agente con superficie") define el monorepo: `packages/core` isomórfico y puro, `packages/agent` con 14 tools tipadas `strict:true`, y la separación **dos cerebros** — motor determinístico que decide prioridad sin tokens y sin red, capa LLM que solo redacta, extrae y explica. De ahí vienen también las tres piezas técnicas que ninguna otra propuesta formalizó con la misma dureza: propose-then-commit con `idempotency_key`, el **staleness check** por `precondition_hash`, y el modelo de conflictos partido en append-only vs LWW por CAMPO. Su tabla de trampas técnicas (webkitSpeechRecognition que falla en silencio en iOS, el truco de haptics muerto en iOS 26.5, `dvh` vs `svh`) evita semanas de descubrimientos en producción.

**De la de hábito (P3)** — la calibración y el orden de construcción. Es la única que hizo la cuenta que importa: el baseline real es **12 touchpoints por semana para todo el equipo**, así que pedir 12/día en la semana 1 es 20× y quema el mecanismo antes de que arraigue. De ahí la **rampa 4 → 8 → 12** y el **shadow mode de 2 semanas** antes de mostrar un solo punto. También su regla de secuencia — *primero las defensas, después los puntos* — y el **ratio de eventos con evidencia** como control de calidad del propio juego, con un umbral explícito (si cae bajo 70% se congela la economía). Y el default de Golden Hour a las **16h**, anclado donde los datos muestran que el equipo ya trabaja, en vez de imponer un hábito nuevo.

## Dónde tuve que decidir, no promediar

1. **North Star.** P1 y P2 proponían AVV; P3 proponía Dia Cheio. No elegí uno ni los mezclé: los puse en jerarquía. **AVV es el resultado** (lo que le importa al negocio, imposible de inflar), **Dia Cheio es el input diario** sobre el que se construye la racha. Y como Dia Cheio exige por definición ≥1 avanço com evidência, se cumple **Dia Cheio ⊃ AVV**: la racha diaria genera el north star por construcción, no por correlación. Eso hace que el juego y el negocio no puedan divergir.

2. **El deadline de Android.** Las tres lo detectaron; ninguna resolvió el choque entre un plan de 20 semanas y un deadline de 5. La decisión: **APK cáscara en F1**, con el package name y el keystore definitivos, instalado en los 6 teléfonos antes del 30/09 aunque la app esté a medio hacer. Como el TWA carga la URL web, el contenido se llena solo con cada deploy. Un deadline externo se convierte en un trámite de la semana 4 en vez de un bloqueo de la semana 20.

3. **Cuándo aparece la gamificación.** P1 la ponía tarde (F6), P3 la ponía como arquitectura central. Partida en dos: **anillos + racha en F4**, junto con la Golden Hour — porque sin racha la Golden Hour es solo una pantalla y el ritual no arraiga; **economía de PA, placar, trofeos y temporadas en F7**, tras el shadow mode. El hábito visible temprano, la economía compleja después con datos para calibrar.

4. **Offline.** Las tres lo marcaron XL y lo dejaron como un bloque. Partido: **lectura cacheada + outbox append-only en F2** (habilita la Golden Hour sin señal, que es lo que realmente importa), **LWW por campo + conflict_log + reconciliación fina con realtime en F6**. Evita que la fase más cara bloquee las tres funcionalidades que el usuario pidió.

5. **Telegram Mini App.** P1 lo ponía en MVP, P2 en la fase 6, P3 en la 4. Decisión: el **adapter `useHost()` se construye desde F1** (es barato al inicio y carísimo de retrofitear), pero el Mini App **se publica en F5**, cuando la PWA ya es estable y hay algo que valga la pena mostrar dentro de Telegram.

6. **Backend.** P1 mantenía Vercel, P2 y P3 movían todo a Supabase Edge Functions. Tomé la migración a Edge Functions (el backend tiene que leer la base: ese es el pecado original que generó dos Ventus divergentes) **pero dejé el webhook de Telegram en Vercel** con ack <1s y procesamiento encolado — que es además el fix del bug real que hoy pierde audios cuando Groq falla a mitad de camino.

## Lo que las tres coincidieron y por eso no se discute

Telegram como canal primario de notificación (no accesorio) porque iOS no da push sin instalación manual ni Background Sync · el reset de seguridad de RLS como bloqueante previo a la primera línea de código · `tasks` como entidad de primera clase reemplazando la denormalización de `next_action` · evidencia obligatoria en PPVVCC · el motor determinístico ascendido de fallback a motor principal · cero ranking con 4 personas · las comisiones fuera del juego, dicho en voz alta · y `api/_lib/ppvvcc.js` portado tal cual, que es la única pieza del sistema actual sin deuda.
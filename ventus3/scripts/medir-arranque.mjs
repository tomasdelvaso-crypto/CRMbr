// scripts/medir-arranque.mjs
// Mide, sobre el BUILD DE PRODUCCIÓN, las dos cosas que el vendedor siente:
//
//   1. Cuánto tarda la tela Hoje en aparecer con la cartera ya en el teléfono.
//   2. Cuánto pesa el camino crítico —lo que hay que bajar antes de ver algo—
//      sin comprimir y en gzip.
//
// Por qué no alcanza con medirlo contra el dev server: Vite en desarrollo
// sirve cada módulo por separado y sin minificar (más de 600 pedidos), y React
// corre en StrictMode renderizando todo dos veces. El número que sale de ahí
// no se parece al del teléfono.
//
// ⚠️ El build de la medición va a `dist-qa/` y se hace con la URL de Supabase
// apuntando a un host inexistente. Nunca pisa `dist/` ni puede hablarle a la
// base de producción.
//
//   node scripts/medir-arranque.mjs            # build + medición
//   node scripts/medir-arranque.mjs --sem-build # reusa dist-qa/

import { spawn, spawnSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from '@playwright/test'

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SAIDA = join(RAIZ, 'dist-qa')
const PORTA = 5290
const BASE = `http://127.0.0.1:${PORTA}`
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'

const AMBIENTE = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://stub.supabase.test',
  VITE_SUPABASE_ANON_KEY: 'chave-anon-de-teste',
  VITE_INGEST_MOCK: 'on',
  VITE_VENTUS_MOCK: 'on',
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · Build
   ══════════════════════════════════════════════════════════════════════════ */

if (!process.argv.includes('--sem-build')) {
  console.log('› vite build --outDir dist-qa (env de teste)')
  const r = spawnSync('npx', ['vite', 'build', '--outDir', 'dist-qa'], {
    cwd: RAIZ,
    env: AMBIENTE,
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
if (!existsSync(SAIDA)) {
  console.error('Não existe dist-qa/. Rode sem --sem-build.')
  process.exit(1)
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · Peso do caminho crítico
   ══════════════════════════════════════════════════════════════════════════ */

const html = readFileSync(join(SAIDA, 'index.html'), 'utf8')

/** Lo que el navegador baja ANTES de poder pintar: entry + preloads + css. */
const criticos = [
  ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
  ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
].map((m) => m[1].replace(/^\//, ''))

function peso(rel) {
  const bruto = readFileSync(join(SAIDA, rel))
  return { rel, bytes: bruto.length, gzip: gzipSync(bruto, { level: 9 }).length }
}

const doCaminho = [...new Set(criticos)].map(peso)
const htmlPeso = { rel: 'index.html', bytes: Buffer.byteLength(html), gzip: gzipSync(html).length }
const total = [htmlPeso, ...doCaminho].reduce(
  (a, f) => ({ bytes: a.bytes + f.bytes, gzip: a.gzip + f.gzip }),
  { bytes: 0, gzip: 0 },
)

/** Todo lo demás: los chunks por ruta, que bajan cuando se navega. */
function listarTudo(dir, prefixo = '') {
  const saida = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    const st = statSync(caminho)
    if (st.isDirectory()) saida.push(...listarTudo(caminho, `${prefixo}${nome}/`))
    else saida.push({ rel: `${prefixo}${nome}`, bytes: st.size })
  }
  return saida
}
const todos = listarTudo(SAIDA)
const js = todos.filter((f) => f.rel.endsWith('.js') || f.rel.endsWith('.mjs'))

const kb = (n) => `${(n / 1024).toFixed(1)} kB`

console.log('\n╭─ Caminho crítico (o que baixa antes de pintar) ─────────────')
for (const f of [htmlPeso, ...doCaminho].sort((a, b) => b.bytes - a.bytes)) {
  console.log(`│ ${f.rel.padEnd(46)} ${kb(f.bytes).padStart(10)}  gzip ${kb(f.gzip).padStart(9)}`)
}
console.log(`│ ${'TOTAL'.padEnd(46)} ${kb(total.bytes).padStart(10)}  gzip ${kb(total.gzip).padStart(9)}`)
console.log('╰────────────────────────────────────────────────────────────')
console.log(
  `  JS no dist inteiro: ${String(js.length)} arquivos, ${kb(js.reduce((a, f) => a + f.bytes, 0))}\n`,
)

/* ══════════════════════════════════════════════════════════════════════════
   3 · Arranque real, no navegador
   ══════════════════════════════════════════════════════════════════════════ */

const servidor = spawn(
  'npx',
  ['vite', 'preview', '--outDir', 'dist-qa', '--port', String(PORTA), '--strictPort'],
  { cwd: RAIZ, env: AMBIENTE, stdio: 'ignore' },
)
process.on('exit', () => servidor.kill())

await new Promise((r) => setTimeout(r, 2500))

const agora = Math.floor(Date.now() / 1000)
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url')
const jwt = `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(
  JSON.stringify({
    sub: 'e2e-user-renata',
    aud: 'authenticated',
    role: 'authenticated',
    exp: agora + 28800,
    iat: agora,
  }),
)}.assinatura-de-teste`
const sessao = {
  access_token: jwt,
  refresh_token: 'e2e-refresh',
  token_type: 'bearer',
  expires_in: 28800,
  expires_at: agora + 28800,
  user: {
    id: 'e2e-user-renata',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'renata@ventapel.com.br',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
}

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const dias = (n) => {
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const navegador = await chromium.launch({ executablePath: CHROMIUM })
const ctx = await navegador.newContext({ ...devices['Pixel 7'], browserName: undefined })
// Nada sale a la red: el host no existe y encima se corta.
await ctx.route('**://stub.supabase.test/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
)
await ctx.route('**://*.supabase.co/**', (r) => r.abort('blockedbyclient'))
await ctx.addInitScript((s) => {
  localStorage.setItem('ventus.auth', JSON.stringify(s))
  localStorage.setItem('ventus.theme', 'light')
  // Marca de tiempo del primer cartón pintado, desde el inicio de la
  // navegación. Se instala antes que cualquier script de la app.
  window.__hojePintada = null
  const pronto = () =>
    document.querySelector('section[aria-label*="ações de hoje"] > ul > li') !== null
  const obs = new MutationObserver(() => {
    if (window.__hojePintada === null && pronto()) {
      window.__hojePintada = performance.now()
      obs.disconnect()
    }
  })
  // El script de inicialización puede correr antes de que exista
  // documentElement; observar null tira y se pierde la medición entera.
  const instalar = () => {
    if (document.documentElement === null) {
      setTimeout(instalar, 0)
      return
    }
    obs.observe(document.documentElement, { childList: true, subtree: true })
  }
  instalar()
}, sessao)

const pagina = await ctx.newPage()
await pagina.goto(BASE, { waitUntil: 'domcontentloaded' })

// La semilla entra por IndexedDB crudo: en el build de producción no hay
// módulos fuente que importar, y así se prueba además que el esquema de Dexie
// es exactamente el que la app espera.
await pagina.evaluate(
  async ([d38, d26, d19, d4]) => {
    // OJO CON `indexedDB.open('ventus3')` A SECAS: si Dexie todavía no abrió
    // la base, esa llamada NO espera —CREA una base vacía, versión 1, sin un
    // solo object store—. La semilla explota después con
    // «NotFoundError: One of the specified object stores was not found», y de
    // paso deja la base envenenada para el Dexie que venga atrás. Es una
    // carrera de verdad: la app abre Dexie perezosamente, en la primera
    // consulta, y eso pasa DESPUÉS del `domcontentloaded` que dispara esto.
    // Por eso se espera a que el esquema exista en vez de asumirlo.
    const abrirSiTieneEsquema = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('ventus3')
        req.onsuccess = () => {
          const db = req.result
          const tiene = ['vendors', 'opportunities', 'leads'].every((s) =>
            db.objectStoreNames.contains(s),
          )
          if (tiene) {
            resolve(db)
            return
          }
          db.close()
          resolve(null)
        }
        req.onerror = () => reject(req.error)
        // Si la base no existía, `open` la crea acá mismo y vacía. Se aborta la
        // creación para no dejarla hecha: la queremos de Dexie, con esquema.
        req.onupgradeneeded = () => req.transaction?.abort()
      })

    let db = null
    const limite = performance.now() + 15000
    while (db === null) {
      try {
        db = await abrirSiTieneEsquema()
      } catch {
        db = null
      }
      if (db !== null) break
      if (performance.now() > limite) {
        throw new Error(
          'Dexie nunca creó el esquema de «ventus3»: la app no llegó a consultar la base ' +
            '(¿pantalla de diagnóstico por falta de config, o login sin sesión?).',
        )
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    const opp = (id, client, name, value, stage, upd) => ({
      id,
      created_at: '2026-01-10T12:00:00Z',
      name,
      client,
      vendor: 'Renata',
      value,
      stage,
      priority: 'media',
      expected_close: null,
      next_action: null,
      next_action_date: null,
      product: null,
      product_lines: null,
      power_sponsor: null,
      sponsor: 'Marcelo',
      influencer: null,
      support_contact: null,
      probability: null,
      last_update: `${upd}T12:00:00Z`,
      last_activity_date: upd,
      scales: {
        dor: { score: 5, description: '' },
        poder: { score: 4, description: '' },
        visao: { score: 5, description: '' },
        valor: { score: 4, description: '' },
        controle: { score: 3, description: '' },
        compras: { score: 2, description: '' },
      },
      health_score: null,
      is_stalled: null,
      industry: null,
      loss_reason: null,
      outcome: null,
      outcome_notes: null,
      updated_at: null,
    })
    const lead = (id, empresa, tps) => ({
      id,
      vendor: 'Renata',
      source: 'market_sweep',
      company_name: empresa,
      company_domain: null,
      contact_name: 'Ana Souza',
      contact_title: 'Logística',
      contact_email: 'ana@vale.com.br',
      contact_phone: '(11) 98765-4321',
      contact_whatsapp: null,
      contact_linkedin: null,
      active_channels: null,
      stage: '1b',
      status: 'active',
      touchpoints_count: tps,
      next_touchpoint_date: d4,
      last_touchpoint_date: null,
      opportunity_id: null,
      notes: null,
      archived_at: null,
      recycle_after: null,
      created_at: '2026-02-01T12:00:00Z',
      updated_at: '2026-02-01T12:00:00Z',
    })

    await new Promise((resolve, reject) => {
      const tx = db.transaction(['vendors', 'opportunities', 'leads'], 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore('vendors').put({
        id: 1,
        name: 'Renata',
        email: 'renata@ventapel.com.br',
        role: 'vendedor',
        phone: null,
        is_admin: false,
        is_active: true,
        monthly_target: null,
        auth_user_id: 'e2e-user-renata',
        auth_id: 'e2e-user-renata',
        telegram_id: null,
        telegram_username: null,
        created_at: null,
      })
      for (const o of [
        opp(101, 'Tetra Pak', 'Linha 3 — fita e selagem', 320000, 3, d38),
        opp(102, 'Ambev', 'CD Guarulhos', 180000, 4, d26),
        opp(103, 'Natura', 'E-commerce', 95000, 2, d19),
        opp(104, 'Suzano', 'Expedição', 60000, 2, d19),
        opp(105, 'Klabin', 'Paletização', 40000, 1, d19),
      ]) {
        tx.objectStore('opportunities').put(o)
      }
      for (const l of [
        lead(201, 'Embalagens Vale', 2),
        lead(202, 'Distribuidora Norte', 1),
        lead(203, 'Frigorífico Sul', 3),
        lead(204, 'Cosmético Bela', 0),
      ]) {
        tx.objectStore('leads').put(l)
      }
    })
    db.close()
  },
  [dias(38), dias(26), dias(19), dias(4)],
)

// El service worker precachea 63 entradas (1,5 MB) apenas se instala, y eso
// compite por CPU con el primer render. Se espera a que termine: lo que se
// quiere medir es el arranque de todos los días, no el de la instalación.
await pagina.waitForFunction(
  () => navigator.serviceWorker.controller !== null || performance.now() > 15000,
  null,
  { timeout: 20000 },
)
await new Promise((r) => setTimeout(r, 3000))

/** Una medición = una recarga con la cartera ya en el teléfono. */
async function medirArranque() {
  await pagina.reload({ waitUntil: 'domcontentloaded' })
  await pagina.waitForSelector('section[aria-label*="ações de hoje"] > ul > li', { timeout: 20000 })
  return pagina.evaluate(() => ({
    pintado: window.__hojePintada,
    dcl: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? null,
    recursos: performance.getEntriesByType('resource').length,
  }))
}

const medidas = []
for (let i = 0; i < 9; i++) {
  medidas.push(await medirArranque())
  await new Promise((r) => setTimeout(r, 700))
}

const pintados = medidas.map((m) => m.pintado).filter((v) => typeof v === 'number')
pintados.sort((a, b) => a - b)
if (pintados.length === 0) {
  console.error('Não consegui medir o primeiro render: o observador não marcou nada.')
  await navegador.close()
  servidor.kill()
  process.exit(1)
}
const p50 = pintados[Math.floor(pintados.length / 2)]

console.log('╭─ Arranque com a carteira já no aparelho (build de produção) ─')
console.log(`│ Amostras: ${pintados.map((v) => `${v.toFixed(0)} ms`).join(' · ')}`)
console.log(
  `│ Até os 3 cartões pintados — melhor ${pintados[0].toFixed(0)} ms · mediana ${p50.toFixed(0)} ms · pior ${pintados[pintados.length - 1].toFixed(0)} ms`,
)
console.log(`│ Recursos baixados no arranque: ${String(medidas[0].recursos)}`)
console.log('╰────────────────────────────────────────────────────────────\n')

await navegador.close()
servidor.kill()
process.exit(0)

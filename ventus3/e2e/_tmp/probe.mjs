import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5288'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext()
// Nada sale a la red real.
await ctx.route('**://stub.supabase.test/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
await ctx.route('**://*.supabase.co/**', (r) => r.abort())

const agora = Math.floor(Date.now() / 1000)
const payload = Buffer.from(JSON.stringify({ sub: 'user-e2e', role: 'authenticated', exp: agora + 3600, iat: agora, aud: 'authenticated' })).toString('base64url')
const jwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.stub`
const sessao = {
  access_token: jwt,
  refresh_token: 'stub-refresh',
  expires_in: 3600,
  expires_at: agora + 3600,
  token_type: 'bearer',
  user: { id: 'user-e2e', aud: 'authenticated', role: 'authenticated', email: 'renata@ventapel.com.br', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
}
await ctx.addInitScript(([s]) => {
  localStorage.setItem('ventus.auth', JSON.stringify(s))
  localStorage.setItem('ventus.theme', 'light')
}, [sessao])

const p = await ctx.newPage()
p.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 300)))
p.on('pageerror', (e) => console.log('[pageerror]', e.message, '\n' + String(e.stack || '').split('\n').slice(0, 16).join('\n')))
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
const r = await p.evaluate(async () => {
  const mod = await import('/src/data/db.ts')
  const db = mod.getDb()
  await db.open()
  await db.vendors.put({ id: 1, name: 'Renata', email: 'renata@ventapel.com.br', role: null, phone: null, is_admin: false, is_active: true, monthly_target: null, auth_user_id: 'user-e2e', auth_id: 'user-e2e', telegram_id: null, telegram_username: null, created_at: null })
  return { vendors: await db.vendors.count(), name: db.name }
})
console.log('SEED', JSON.stringify(r))
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForTimeout(3000)
console.log('URL:', p.url())
const html = await p.content()
console.log(await p.locator('body').innerText())
await b.close()

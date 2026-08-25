import { chromium, devices } from '@playwright/test'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ ...devices['iPhone 14'], browserName: undefined })
await ctx.route('**://stub.supabase.test/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}))
const agora = Math.floor(Date.now()/1000)
const payload = Buffer.from(JSON.stringify({sub:'e2e-user-renata',aud:'authenticated',role:'authenticated',exp:agora+9999,iat:agora})).toString('base64url')
const sess = {access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.x`,refresh_token:'r',expires_in:9999,expires_at:agora+9999,token_type:'bearer',user:{id:'e2e-user-renata',aud:'authenticated',role:'authenticated',email:'r@v.com',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}
await ctx.addInitScript(s=>localStorage.setItem('ventus.auth',JSON.stringify(s)),sess)
const p = await ctx.newPage()
const erros=[]
p.on('pageerror', e => erros.push(e.message))
await p.goto('http://localhost:5288/', {waitUntil:'domcontentloaded'})
await p.evaluate(async()=>{const m=await import('/src/data/db.ts');const db=m.getDb();await db.open();await db.vendors.put({id:1,name:'Renata',email:null,role:null,phone:null,is_admin:false,is_active:true,monthly_target:null,auth_user_id:'e2e-user-renata',auth_id:'e2e-user-renata',telegram_id:null,telegram_username:null,created_at:null})})
await p.reload({waitUntil:'domcontentloaded'})
await p.waitForTimeout(12000)
console.log('errores de página:', erros.length, JSON.stringify([...new Set(erros)]))
await b.close()

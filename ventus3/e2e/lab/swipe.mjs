import { chromium, devices } from '@playwright/test'
const BASE='http://localhost:5288'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const perfil = process.env.PERFIL === 'desktop' ? {} : { ...devices['iPhone 14'], browserName: undefined }
const ctx = await b.newContext(perfil)
await ctx.route('**://stub.supabase.test/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}))
const agora = Math.floor(Date.now()/1000)
const payload = Buffer.from(JSON.stringify({sub:'e2e-user-renata',role:'authenticated',aud:'authenticated',exp:agora+9999,iat:agora})).toString('base64url')
const sess = {access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.x`,refresh_token:'r',expires_in:9999,expires_at:agora+9999,token_type:'bearer',user:{id:'e2e-user-renata',aud:'authenticated',role:'authenticated',email:'r@v.com',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}
await ctx.addInitScript(s=>{localStorage.setItem('ventus.auth',JSON.stringify(s));localStorage.setItem('ventus.theme','light')},sess)
const p = await ctx.newPage()
await p.goto(BASE+'/')
const hoje = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())
const dias=(n)=>{const d=new Date(`${hoje}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10)}
await p.evaluate(async ([d38])=>{
  const m = await import('/src/data/db.ts'); const db=m.getDb(); await db.open()
  await db.vendors.put({id:1,name:'Renata',email:null,role:null,phone:null,is_admin:false,is_active:true,monthly_target:null,auth_user_id:'e2e-user-renata',auth_id:'e2e-user-renata',telegram_id:null,telegram_username:null,created_at:null})
  const base=(id,client,value,stage,upd)=>({id,created_at:'2026-01-10T12:00:00Z',name:'N '+client,client,vendor:'Renata',value,stage,priority:'media',expected_close:null,next_action:null,next_action_date:null,product:null,product_lines:null,power_sponsor:null,sponsor:'Marcelo',influencer:null,support_contact:null,probability:null,last_update:upd+'T12:00:00Z',last_activity_date:upd,scales:{dor:{score:5,description:''}},health_score:null,is_stalled:null,industry:null,loss_reason:null,outcome:null,outcome_notes:null,updated_at:null})
  await db.opportunities.bulkPut([base(101,'Tetra Pak',320000,3,d38),base(102,'Ambev',180000,4,d38),base(103,'Natura',95000,2,d38),base(104,'Suzano',60000,2,d38)])
},[dias(38)])
await p.reload()
await p.waitForSelector('section[aria-label*="ações de hoje"] li')
await p.evaluate(()=>{ window.__ev=[]; for (const t of ['pointerdown','pointerup','pointercancel','pointermove','touchstart','touchmove','touchcancel','dragstart','lostpointercapture']) document.addEventListener(t, (e)=>{ window.__ev.push(t+'#'+e.pointerId+'/'+e.pointerType+'/'+Math.round(e.clientX)+','+Math.round(e.clientY)+' btn'+e.buttons) }, true) })
const li = p.locator('section[aria-label*="ações de hoje"] > ul > li').first()
const box = await li.boundingBox()
const y=box.y+box.height/2, x0=box.x+60
console.log('caja del li:', JSON.stringify(box), 'viewport', JSON.stringify(p.viewportSize()))
console.log('elemento en el punto:', await p.evaluate(([x,y])=>{const el=document.elementFromPoint(x,y); return el ? el.tagName+'.'+el.className.slice(0,80) : 'NADA'}, [x0,y]))
await p.mouse.move(x0,y); await p.mouse.down()
for (let i=1;i<=12;i++){ await p.mouse.move(x0+(200*i)/12,y); await p.waitForTimeout(10) }
const t = await li.locator('div.will-change-transform').first().evaluate(el=>getComputedStyle(el).transform)
await p.mouse.up()
await p.waitForTimeout(600)
const ev = await p.evaluate(()=>window.__ev)
console.log('perfil', process.env.PERFIL||'mobile', '| transform:', t, '| desfazer:', await p.getByRole('button',{name:'Desfazer'}).count())
console.log(ev.slice(0,6).join('\n'))
await b.close()

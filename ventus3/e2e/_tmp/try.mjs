import { chromium } from '@playwright/test'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage()
await p.goto('data:text/html,<h1>oi</h1>')
console.log('TITLE OK', await p.textContent('h1'))
await b.close()

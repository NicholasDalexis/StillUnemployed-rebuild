/* Standalone fixture browser verification. Does not contact Firebase or production. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dashboard = require('../../js/analytics-dashboard.js');
const root = path.resolve(__dirname, '../..');
const output = process.env.ANALYTICS_QA_OUTPUT || '/tmp/stillunemployed-analytics-dashboard-qa';
fs.mkdirSync(output, {recursive:true});
const checks=[];
function check(label, value) { assert.ok(value,label); checks.push(label); }
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
const server=http.createServer((req,res)=> {
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+relative);
  if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=> {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1100}});
    let signed=false,status=200,payload=dashboard.fixture(30),delay=0,requests=[];
    await context.route('**/js/auth.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.__signed=${signed};window.SUAuth={signedIn:()=>window.__signed,getToken:async()=>"fixture-owner-token"};window.dispatchEvent(new CustomEvent('su:auth-changed',{detail:{signedIn:window.__signed}}));`}));
    await context.route('**/.netlify/functions/analytics-admin?*',async route=> {requests.push(route.request());const body=JSON.stringify(payload);const code=status;if(delay)await new Promise(r=>setTimeout(r,delay));await route.fulfill({status:code,contentType:'application/json',body}).catch(()=>{});});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/analytics.html');
    await page.waitForFunction(()=>document.querySelector('#state-title').textContent.includes('Sign in'));
    check('signed-out dashboard hides data',await page.locator('#dashboard-data').isHidden());
    check('signed-out makes no aggregate request',requests.length===0);
    check('sample not enabled by default',await page.locator('#sample-banner').isHidden());
    await page.locator('#load-sample').focus();await page.keyboard.press('Enter');
    check('keyboard explicitly opens synthetic sample',await page.locator('#sample-banner').isVisible());
    check('sample uses no aggregate request',requests.length===0);
    await page.getByRole('button',{name:'Most popular field?'}).click();
    check('sample answers are explicitly labeled',(await page.locator('#question-answer').textContent()).startsWith('SAMPLE DATA: Marketing'));
    await page.screenshot({path:path.join(output,'desktop-synthetic.png'),fullPage:true});
    for(const width of [1024,700,390,320]) {
      await page.setViewportSize({width,height:1000});
      check('no page overflow at '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      if(width===390) await page.screenshot({path:path.join(output,'mobile-synthetic.png'),fullPage:true});
    }
    await page.locator('#window-days').selectOption('90');
    check('90-day daily bars reflow at 320px',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.locator('#window-days').selectOption('30');
    await page.addStyleTag({content:'* { line-height:1.5!important; letter-spacing:.12em!important; word-spacing:.16em!important; } p { margin-bottom:2em!important; }'});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)) console.log(await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,70)}))));
    check('320px text-spacing override reflows',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.goto(origin+'/analytics.html');
    await page.evaluate(()=>{window.__signed=true;window.dispatchEvent(new CustomEvent('su:auth-changed'));});
    await page.waitForSelector('#dashboard-data:not([hidden])');
    check('authorized fixture renders numeric metric',(await page.locator('.metric-value').nth(3).textContent())==='126');
    check('authorized fixture does not masquerade as sample',await page.locator('#sample-banner').isHidden());
    check('specific-job leaderboard renders safe source labels',(await page.locator('#popular-jobs').textContent()).includes('Social Media Coordinator at Sample Studio'));
    check('privacy page timing has measured-session context',(await page.locator('#page-timing').textContent()).includes('Privacy Policy38 sec'));
    check('request uses bearer token and 30-day range',requests.at(-1).headers().authorization==='Bearer fixture-owner-token' && requests.at(-1).url().includes('days=30'));
    await page.locator('#question').fill('How many women use the tracker?');await page.locator('#question-form button').click();
    check('unsupported question returns limitation',(await page.locator('#question-answer').textContent()).includes('cannot answer demographic questions'));
    await page.locator('#question').fill('How many people signed up?');await page.locator('#question-form button').click();
    check('supported question uses returned aggregate',(await page.locator('#question-answer').textContent()).startsWith('126 recorded sign-ups'));
    await page.locator('#trend-metric').selectOption('apply_clicks');
    check('trend control updates accessible summary',(await page.locator('#trend-summary').textContent()).includes('Apply clicks'));
    await page.locator('.data-details summary').click();check('daily table accessible',await page.locator('#daily-table tr').count()===30);
    await page.setViewportSize({width:1440,height:1000});
    payload.generatedAt='2020-01-01T00:00:00Z';await page.locator('#refresh').click();await page.waitForSelector('#freshness[data-stale="true"]');
    check('stale data prominently labeled',(await page.locator('#freshness').textContent()).includes('STALE'));
    payload=dashboard.fixture(30);Object.keys(payload.totals).forEach(k=>payload.totals[k]=0);payload.timing.meanAwaySeconds=null;payload.fields=[];payload.roles=[];payload.themes=[];payload.events=[];payload.daily=[];
    await page.locator('#refresh').click();await page.waitForSelector('#service-state[data-state="empty"]');
    check('successful empty data remains visible with empty explanation',await page.locator('#dashboard-data').isVisible());
    check('missing away average is not zero',(await page.locator('#away-average').textContent())==='N/A');
    check('empty charts do not emit NaN/Infinity',!(await page.locator('#dashboard-data').innerHTML()).match(/(?:NaN|Infinity)/));
    status=503;await page.locator('#refresh').click();await page.waitForSelector('#service-state[data-state="error"]');
    check('service error clears previous private data',await page.locator('#dashboard-data').isHidden() && await page.locator('.metric').count()===0);
    await page.screenshot({path:path.join(output,'service-unavailable.png'),fullPage:true});
    status=403;await page.locator('#refresh').click();await page.waitForSelector('#service-state[data-state="denied"]');
    check('unauthorized account shows permission denial',await page.locator('#dashboard-data').isHidden());
    status=200;payload=dashboard.fixture(30);await page.locator('#refresh').click();await page.waitForSelector('#dashboard-data:not([hidden])');
    await page.evaluate(()=>{window.__signed=false;window.dispatchEvent(new CustomEvent('su:auth-changed'));});
    check('auth loss immediately removes data from DOM',await page.locator('.metric').count()===0 && await page.locator('#dashboard-data').isHidden() && await page.locator('#away-average').textContent()==='' && await page.locator('#page-timing').textContent()==='' && await page.locator('#popular-jobs').textContent()==='');
    delay=300;await page.evaluate(()=>{window.__signed=true;window.dispatchEvent(new CustomEvent('su:auth-changed'));});
    await page.waitForSelector('#service-state[data-state="loading"]');await page.evaluate(()=>{window.__signed=false;window.dispatchEvent(new CustomEvent('su:auth-changed'));});await page.waitForTimeout(500);
    check('late response after sign-out cannot repopulate private data',await page.locator('.metric').count()===0 && await page.locator('#dashboard-data').isHidden());
    delay=0;payload=dashboard.fixture(7);await page.evaluate(()=>{window.__signed=true;window.dispatchEvent(new CustomEvent('su:auth-changed'));});await page.waitForSelector('#service-state[data-state="error"]');
    check('mismatched time window is not displayed',await page.locator('#dashboard-data').isHidden());
    check('no runtime page errors',errors.length===0);
    fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({at:new Date().toISOString(),fixtureOnly:true,checks,errors},null,2));
    console.log(JSON.stringify({passed:checks.length,output},null,2));
    await context.close();
  }finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

// Exercise the real WebAssembly app with synthetic card/art files only.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve('web');
const fixtures = path.resolve(process.argv[2]);
const metadata = JSON.parse(fs.readFileSync(path.join(fixtures, 'probe.json')));
const server = http.createServer((req,res) => {
  const name = new URL(req.url,'http://localhost').pathname;
  const file = path.resolve(root, '.' + (name==='/'?'/index.html':name));
  if (!file.startsWith(root+path.sep)) {res.writeHead(403);return res.end();}
  try { const data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data); }
  catch {res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let catalogRequests=0;
  await page.route('https://art.slot-cfw.fyi/**', async route=>{
   if(route.request().url().endsWith('/index.json')){catalogRequests++;return route.fulfill({status:200,json:{[metadata.crc]:{'support-texture':'fixture/label.png',wheel:'fixture/logo.png'}}});}
   const image=route.request().url().endsWith('logo.png')?'logo.png':'GBA-scan.png';
   return route.fulfill({status:200,body:fs.readFileSync(path.join(fixtures,image)),contentType:'image/png'});
  });
  await page.route('https://raw.githubusercontent.com/**', async route=>{
   const url=route.request().url();
   if(url.endsWith('.dat'))return route.fulfill({status:200,body:`game (\n name "Renderer Probe (USA)"\n rom ( name "Renderer Probe.gba" crc ${metadata.crc} )\n)`,contentType:'text/plain'});
   if(url.includes('/Named_Logos/'))return route.fulfill({status:200,body:fs.readFileSync(path.join(fixtures,'logo.png')),contentType:'image/png'});
   return route.fulfill({status:404,body:''});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('body[data-ready=true]').waitFor();
  if(!catalogRequests)throw Error('Scanned artwork catalog was not requested by default');
  await page.locator('#start').click();
  await page.locator('#pick-files-label').waitFor({state:'visible'});
  await page.locator('#pick-files').setInputFiles(path.join(fixtures,'card'));
  await page.locator('.cart .face').first().click();
  await page.locator('#editor').waitFor({state:'visible'});
  const finish=page.locator('#ed-finish [data-value="clear"]');
  if(!(await finish.isEnabled()))throw Error('Finish requires a color change on an automatic shell');
  await finish.click();
  await page.waitForFunction(()=>window.__studio.shells()[0].shell.endsWith(' clear'));
  const real=page.locator('#ed-tiles [data-kind="real"]');
  await real.click();
  await page.waitForFunction(()=>window.__studio.states()[0].wears==='real' && window.__studio.idle());
  await page.screenshot({path:path.join(fixtures,'studio-downloaded-label.png'),fullPage:true});
  const logo=page.locator('#ed-tiles [data-kind="logo"]');
  await logo.click();
  if(await logo.getAttribute('aria-pressed')!=='true')throw Error('Logo Only did not remain selected');
  await page.screenshot({path:path.join(fixtures,'studio-logo.png'),fullPage:true});
  const chooser=page.waitForEvent('filechooser');
  await page.locator('#ed-tiles [data-kind="customLabel"]').click();
  await (await chooser).setFiles(path.join(fixtures,'GBA-scan.png'));
  await page.locator('#ed-tiles [data-kind="customLabel"][aria-pressed="true"]').waitFor();
  await page.screenshot({path:path.join(fixtures,'studio-label.png'),fullPage:true});
  await page.locator('#ed-close').click();
  const downloaded=page.waitForEvent('download');
  await page.locator('#write').click();
  await (await downloaded).saveAs(path.join(fixtures,'labels.zip'));
  await page.locator('#guide-done').click();
  // Bulk selection spans system tabs, preserves labels, and writes only chosen shells.
  const card = path.join(fixtures, 'card');
  for (const [platform, name, extension] of [['GBA','Style Second','gba'],['GB','Style GB','gb']]) {
   fs.mkdirSync(path.join(card,'Games',platform),{recursive:true});
   fs.mkdirSync(path.join(card,'Labels',platform),{recursive:true});
   fs.writeFileSync(path.join(card,'Games',platform,`${name}.${extension}`),Buffer.alloc(512));
   fs.copyFileSync(path.join(fixtures,`${platform}-scan.png`),path.join(card,'Labels',platform,`${name}.png`));
  }
  await page.locator('#pick-files').setInputFiles(card);
  await page.locator('.cart[data-state="has-label"]').nth(2).waitFor({state:'attached'});
  await page.locator('#bulk-open').click();
  if(await page.locator('#bulk-open').getAttribute('aria-checked')!=='true')throw Error('Selection switch did not turn on');
  await page.getByRole('button',{name:'Select Renderer Probe',exact:true}).click();
  await page.locator('#tabs button').last().click();
  await page.getByRole('button',{name:'Select Style GB',exact:true}).focus();
  await page.keyboard.press('Space');
  await page.locator('#bulk-colour-mode').selectOption('custom');
  await page.locator('#bulk-colour').fill('#123456');
  await page.waitForFunction(()=>window.__studio.shells().filter(c=>c.stem!=='Style Second').every(c=>c.shell.includes(' 123456 ')));
  await page.locator('#bulk-finish').selectOption('clear');
  await page.waitForFunction(()=>window.__studio.shells().filter(c=>c.stem!=='Style Second').every(c=>c.shell==='auto 123456 clear'));
  if((await page.locator('#bulk-count').textContent())!=='2 carts selected')throw Error('Bulk selection did not span tabs');
  await page.locator('#bulk-artwork').selectOption('real');
  await page.waitForFunction(()=>window.__studio.idle() && window.__studio.states().find(c=>c.stem==='Renderer Probe').wears==='real');
  if(!(await page.locator('#bulk-status').textContent()).includes('artwork was kept'))throw Error('Missing label did not preserve existing artwork');
  await page.screenshot({path:path.join(fixtures,'studio-bulk.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(fixtures,'studio-bulk-mobile.png'),fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('Bulk controls overflow mobile viewport');
  await page.locator('#bulk-open').click();
  if(await page.locator('#bulk-open').getAttribute('aria-checked')!=='false')throw Error('Selection switch did not turn off');
  if(await page.locator('#bulk-panel').isVisible())throw Error('Selection panel stayed open');
  await page.locator('#bulk-open').click();
  await page.locator('#bulk-done').click();
  if(await page.locator('#bulk-open').getAttribute('aria-checked')!=='false')throw Error('Done did not turn selection off');
  const bulkDownload=page.waitForEvent('download');
  await page.locator('#write').click();
  const bulkPath=path.join(fixtures,'bulk-labels.zip');
  await (await bulkDownload).saveAs(bulkPath);
  const bulk=fs.readFileSync(bulkPath).toString('latin1');
  if(!bulk.includes('Renderer Probe = auto 123456 clear')||!bulk.includes('Style GB = auto 123456 clear')||bulk.includes('Style Second ='))throw Error('Bulk export changed the wrong carts or missed selected shells');
  // Verify the live source is readable from the published fork's origin, not just fixtures.
  const live=await browser.newPage();
  await live.route('https://jakegraving.com/slot.sp/studio/art-probe',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Artwork source probe</title>'}));
  await live.goto('https://jakegraving.com/slot.sp/studio/art-probe');
  const source=await live.evaluate(async()=>{try{const r=await fetch('https://art.slot-cfw.fyi/index.json');if(!r.ok)throw Error(`catalog HTTP ${r.status}`);const data=await r.json();const entry=Object.values(data).find(e=>e['support-texture']);if(!entry)throw Error('no scanned labels');const image=await fetch(new URL(entry['support-texture'],'https://art.slot-cfw.fyi/'));if(!image.ok)throw Error(`scan HTTP ${image.status}`);const bytes=new Uint8Array(await image.arrayBuffer());if(bytes[0]!==137||bytes[1]!==80)throw Error('not PNG');return {labels:Object.values(data).filter(e=>e['support-texture']).length,bytes:bytes.length};}catch(e){return {error:e.message}}});
  if(source.error)throw Error(`Published artwork source: ${source.error}`);console.log('Live scanned-label source:',source);await live.close();
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: artwork choices, native previews, bulk selection across tabs, mobile layout and ZIP exports');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

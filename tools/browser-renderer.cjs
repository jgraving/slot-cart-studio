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
  await page.route('https://raw.githubusercontent.com/**', async route=>{
   const url=route.request().url();
   if(url.endsWith('.dat'))return route.fulfill({status:200,body:`game (\n name "Renderer Probe (USA)"\n rom ( name "Renderer Probe.gba" crc ${metadata.crc} )\n)`,contentType:'text/plain'});
   if(url.includes('/Named_Logos/'))return route.fulfill({status:200,body:fs.readFileSync(path.join(fixtures,'logo.png')),contentType:'image/png'});
   return route.fulfill({status:404,body:''});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('#pick-files-label').waitFor({state:'visible'});
  await page.locator('#pick-files').setInputFiles(path.join(fixtures,'card'));
  await page.locator('.cart .face').first().click();
  await page.locator('#editor').waitFor({state:'visible'});
  const logo=page.locator('#ed-tiles [data-kind="logo"]');
  await logo.click();
  if(await logo.getAttribute('aria-pressed')!=='true')throw Error('Logo Only did not remain selected');
  await page.screenshot({path:path.join(fixtures,'studio-logo.png'),fullPage:true});
  const chooser=page.waitForEvent('filechooser');
  await page.locator('#ed-tiles [data-kind="real"]').click();
  await (await chooser).setFiles(path.join(fixtures,'GBA-scan.png'));
  await page.locator('#ed-tiles [data-kind="customLabel"][aria-pressed="true"]').waitFor();
  await page.screenshot({path:path.join(fixtures,'studio-label.png'),fullPage:true});
  await page.locator('#ed-close').click();
  const downloaded=page.waitForEvent('download');
  await page.locator('#write').click();
  await (await downloaded).saveAs(path.join(fixtures,'labels.zip'));
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: logo fallback, explicit selection, missing-label picker, native preview and ZIP export');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

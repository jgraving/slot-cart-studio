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
  await page.addInitScript(()=>{window.romStreams=0;const original=File.prototype.stream;File.prototype.stream=function(){window.romStreams++;return original.call(this);};});
  let catalogRequests=0;
  await page.route('**/art/**', async route=>{
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
  await page.waitForFunction(()=>/\d+%/.test(document.getElementById('loader-detail').textContent));
  const percentage=Number(await page.locator('#loader-meter').getAttribute('aria-valuenow'));
  if(!(percentage>=0&&percentage<=100))throw Error('Loading percentage is outside its range');
  const detail=await page.locator('#loader-detail').textContent();
  if(!/Estimating|About|seconds|Finishing|Complete/.test(detail))throw Error('Loading time estimate is missing');
  await page.locator('body.loading').waitFor({state:'hidden'});
  await page.locator('.cart .face').first().click();
  await page.locator('#editor').waitFor({state:'visible'});
  // Opening an existing label starts its background lookup; it must finish before styling.
  await page.waitForFunction(()=>window.__studio.idle());
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
  const firstReads=await page.evaluate(()=>window.romStreams);
  if(firstReads!==1)throw Error(`Expected one checksum read for first edit, got ${firstReads}`);
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
  await page.locator('#cart-query').fill('style gb');
  await page.waitForFunction(()=>[...document.querySelectorAll('#grid .cart')].filter(c=>!c.hidden).length===1);
  if(!(await page.getByRole('button',{name:'Edit Style GB',exact:true}).isVisible()))throw Error('Search did not find a game in another system');
  if(!(await page.locator('#cart-search-count').textContent()).includes('1 of 3'))throw Error('Search result count is wrong');
  await page.locator('#cart-query').fill('no such game anywhere');
  await page.locator('#cart-search-empty').waitFor({state:'visible'});
  await page.locator('#cart-search-clear').click();
  if(await page.locator('#cart-search-empty').isVisible())throw Error('Clear did not restore the shelf');
  if(await page.getByRole('button',{name:'Edit Style GB',exact:true}).isVisible())throw Error('Clear did not restore the current system');
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
  if((await page.evaluate(()=>window.romStreams))!==firstReads+1)throw Error('An unchanged game was fully reread instead of using its cached checksum');
  // Only the newly selected GB fixture requires another checksum.
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
  // Reopening after a page reload also reuses IndexedDB, without retaining files.
  await page.reload();await page.locator('body[data-ready=true]').waitFor();
  await page.locator('#start').click();await page.locator('#pick-files').setInputFiles(card);
  await page.getByRole('button',{name:'Edit Renderer Probe',exact:true}).click();
  await page.waitForFunction(()=>window.__studio.idle());
  if((await page.evaluate(()=>window.romStreams))!==0)throw Error('Checksum cache was not reused after reload');
  // A fast cached ROM scan must not hide slow artwork or bulk label downloads.
  await page.route('**/art/fixture/**', async route => {
   await new Promise(resolve => setTimeout(resolve, 250));
   const image=route.request().url().endsWith('logo.png')?'logo.png':'GBA-scan.png';
   await route.fulfill({status:200,body:fs.readFileSync(path.join(fixtures,image)),contentType:'image/png'});
  });
  const unlabelled=path.join(fixtures,'unlabelled','Games','GBA');
  fs.mkdirSync(unlabelled,{recursive:true});
  const rom=fs.readFileSync(path.join(card,'Games','GBA','Renderer Probe.gba'));
  for(let i=0;i<12;i++)fs.writeFileSync(path.join(unlabelled,`Progress ${i}.gba`),rom);
  await page.locator('#ed-close').click();
  await page.locator('#pick-files').setInputFiles(path.join(fixtures,'unlabelled'));
  await page.waitForFunction(()=>/Finding artwork.*of 12 games.*%/.test(document.getElementById('progress-text').textContent));
  if(!(await page.locator('#progress').isVisible()))throw Error('Artwork progress disappeared after reading ROMs');
  if(!(await page.locator('#fill-open').isDisabled()))throw Error('Fill appeared ready before artwork finished');
  await page.locator('#fill').waitFor({state:'visible'});
  await page.locator('#fill-real').click();
  await page.waitForFunction(()=>/Downloading labels.*%/.test(document.getElementById('progress-text').textContent));
  if(!(await page.locator('#progress').isVisible()))throw Error('Bulk label download progress is missing');
  await page.waitForFunction(()=>window.__studio.idle() && document.getElementById('progress').hidden);
  if(!(await page.evaluate(()=>window.__studio.states().every(c=>c.wears==='real'))))throw Error('Label download did not finish the fill');
  // Missing labels sort first, filename guesses require explicit approval, and
  // editing a cart must leave the other games at full opacity.
  const review=path.join(fixtures,'review','Games','GBA');
  fs.mkdirSync(review,{recursive:true});
  fs.writeFileSync(path.join(review,'AAA Matched.gba'),rom);
  const patched=Buffer.from(rom);patched[0]=1;
  fs.writeFileSync(path.join(review,'Renderer Probe (patched).gba'),patched);
  const unknown=Buffer.from(rom);unknown[0]=2;
  fs.writeFileSync(path.join(review,'ZZZ Unknown.gba'),unknown);
  await page.locator('#pick-files').setInputFiles(path.join(fixtures,'review'));
  await page.locator('body.loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.__studio.idle() && document.getElementById('progress').hidden);
  if(await page.locator('#fill').isVisible())await page.locator('#fill-logo').click();
  await page.waitForFunction(()=>document.querySelector('#grid .cart .stem')?.textContent.includes('ZZZ Unknown'));
  const order=await page.locator('#grid .cart .stem').allTextContents();
  if(!order[1].includes('Renderer Probe')||!order[2].includes('AAA Matched'))throw Error('Unmatched and suggested labels did not sort ahead of matched labels');
  await page.getByRole('button',{name:'Edit Renderer Probe',exact:true}).click();
  await page.locator('#ed-suggestion').waitFor({state:'visible'});
  if(!(await page.locator('#ed-suggestion-name').textContent()).includes('Renderer Probe'))throw Error('Filename suggestion is missing');
  if((await page.evaluate(()=>window.__studio.states().find(c=>c.stem.includes('patched')).wears))==='real')throw Error('Suggested label was applied without approval');
  if(await page.locator('.cart:not(.current)').first().evaluate(el=>getComputedStyle(el).opacity)!=='1')throw Error('Editing still dims other games');
  await page.locator('#ed-suggestion-approve').click();
  await page.waitForFunction(()=>window.__studio.idle() && window.__studio.states().find(c=>c.stem.includes('patched')).wears==='real');
  if(await page.locator('#ed-suggestion').isVisible())throw Error('Approved match remained pending');
  await page.keyboard.press('Control+z');
  await page.locator('#ed-suggestion').waitFor({state:'visible'});
  await page.locator('#ed-suggestion-dismiss').click();
  if(await page.locator('#ed-suggestion').isVisible())throw Error('Rejected suggestion remained visible');
  await page.locator('#cart-query').fill('Renderer Probe');
  await page.waitForFunction(()=>[...document.querySelectorAll('#grid .cart')].filter(c=>!c.hidden).length===2);
  if(!(await page.getByRole('button',{name:'Edit AAA Matched',exact:true}).isVisible()))throw Error('Search did not find the matched game title');
  await page.locator('#cart-query').press('Escape');
  if(await page.locator('#cart-query').inputValue())throw Error('Escape did not clear search');
  // Use the browser's real private filesystem to exercise direct SD-card writes.
  await page.locator('#ed-close').click();
  await page.evaluate(async ({rom,png})=>{
   const fs=await navigator.storage.getDirectory();
   try{await fs.removeEntry('direct-write-probe',{recursive:true});}catch{}
   const root=await fs.getDirectoryHandle('direct-write-probe',{create:true});
   async function put(folder,name,bytes){const parent=await root.getDirectoryHandle(folder,{create:true});const dir=await parent.getDirectoryHandle('GBA',{create:true});const file=await dir.getFileHandle(name,{create:true});const out=await file.createWritable();await out.write(new Uint8Array(bytes));await out.close();}
   await put('Games','Direct.gba',rom);await put('Labels','Direct.png',png);
   await window.__studio.openDirectory(root);
  },{rom:[...rom],png:[...fs.readFileSync(path.join(fixtures,'GBA-scan.png'))]});
  await page.getByRole('button',{name:'Edit Direct',exact:true}).click();
  await page.waitForFunction(()=>window.__studio.idle());
  await page.locator('#ed-tiles [data-kind="real"]').click();
  await page.waitForFunction(()=>window.__studio.idle() && window.__studio.states()[0].wears==='real');
  await page.locator('#write').click();
  await page.locator('#write-confirmation').waitFor({state:'visible'});
  if(!(await page.locator('#write-confirmation').textContent()).includes('Saved to SD card: 1 label'))throw Error('Direct write has no saved confirmation');
  if(!(await page.locator('#write').isVisible())||!(await page.locator('#write').isDisabled()))throw Error('Saved write button disappeared or remained active');
  await page.locator('#ed-tiles [data-kind="logo"]').click();
  if(await page.locator('#card-done').isVisible())throw Error('Done could discard new edits');
  await page.locator('#write').click();
  await page.locator('#card-done').waitFor({state:'visible'});
  await page.locator('#card-done').click();
  if(await page.locator('#grid .cart').count())throw Error('Done did not close the card');
  if(!(await page.locator('#start').isVisible()))throw Error('Done did not return to the start');
  if(!(await page.locator('#banner').textContent()).includes('Eject the SD card'))throw Error('Done lost the eject reminder');
  // The smoke mirror contains real public scans downloaded by the build. Read it
  // through our own origin, exactly as the published site will serve it.
  const live=await browser.newPage();
  const origin=`http://127.0.0.1:${server.address().port}`;
  await live.route(`${origin}/art-probe`,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Artwork source probe</title>'}));
  await live.goto(`${origin}/art-probe`);
  const source=await live.evaluate(async()=>{const r=await fetch('art/index.json');if(!r.ok)throw Error(`catalog HTTP ${r.status}`);const data=await r.json();const entry=Object.values(data).find(e=>e['support-texture']);if(!entry)throw Error('no scanned labels');const image=await fetch(new URL('art/'+entry['support-texture'],location.href));if(!image.ok)throw Error(`scan HTTP ${image.status}`);const bytes=new Uint8Array(await image.arrayBuffer());if(bytes[0]!==137||bytes[1]!==80)throw Error('not PNG');return {labels:Object.keys(data).length,bytes:bytes.length};});
  console.log('Same-origin scanned-label source:',source);await live.close();
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: artwork choices, native previews, bulk selection across tabs, mobile layout and ZIP exports');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

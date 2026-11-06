// Run with NODE_PATH pointing to Playwright and POCKET_CHROMIUM to a Chromium binary.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const dir = path.join(__dirname, '..');
  const mapSource = fs.readFileSync(path.join(dir, 'scripts/pocket-map.js'), 'utf8');
  const source = fs.readFileSync(path.join(dir, 'scripts/pocket-sheets.js'), 'utf8')
    .replace('./pocket-map.js', `data:text/javascript;base64,${Buffer.from(mapSource).toString('base64')}`)
    + '\nglobalThis.TestPocketSheet = PocketSheet;';
  const browser = await chromium.launch({executablePath: process.env.POCKET_CHROMIUM, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']});
  try {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    await page.setContent('<body class="sbs-pocket-mode"><canvas id="board" style="position:fixed;inset:0;width:100%;height:100%;background:blue"></canvas></body>');
    await page.addStyleTag({content: fs.readFileSync(path.join(dir, 'styles/pocket-sheets.css'), 'utf8')});
    await page.evaluate(() => {
      globalThis.Hooks = {on() {}, once() {}};
      globalThis.foundry = {applications: {api: {ApplicationV2: class {_onRender() {} async close() {} }}}, utils: {escapeHTML: String}};
      globalThis.game = {settings: {get: () => false}, user: {id: 'player'}};
      globalThis.CONFIG = {Canvas: {maxZoom: 3}};
      globalThis.pans = [];
      const token = {id: 't1', actor: {id: 'bard'}, isOwner: true, document: {hidden: false}, visible: true, center: {x: 1200, y: 800}};
      globalThis.canvas = {ready: true, scene: {id: 'scene1'}, tokens: {placeables: [token]}, stage: {pivot: {x: 100, y: 200}, scale: {x: 1}}, pan(p) { pans.push(p); this.stage.pivot = {x:p.x,y:p.y}; this.stage.scale.x = p.scale; }};
    });
    await page.addScriptTag({type: 'module', content: source});
    await page.waitForFunction(() => globalThis.TestPocketSheet);
    await page.evaluate(async (mapSource) => {
      const {renderPocketMap} = await import(`data:text/javascript;base64,${mapSource}`);
      const root = document.createElement('div');
      root.className = 'application sbs-pocket-mobile';
      root.innerHTML = `<header class="sbs-pocket-mobile-header">Pocket Sheets</header><nav class="sbs-pocket-mobile-tabs"><button data-action="change-tab" data-tab="attributes">Sheet</button><button data-action="change-tab" data-tab="map">Map</button></nav><main class="sbs-pocket-mobile-content"><section class="sbs-pocket-panel active" data-panel="attributes">Your sheet</section><section class="sbs-pocket-panel" data-panel="map">${renderPocketMap()}</section></main><footer class="sbs-pocket-mobile-footer">v0.4.0</footer><aside class="sbs-pocket-rail"></aside>`;
      document.body.append(root);
      globalThis.sheet = new TestPocketSheet({id: 'bard', items: {get() {}}});
      sheet.element = root;
      sheet._onRender({}, {});
    }, Buffer.from(mapSource).toString("base64"));
    await page.getByRole('button', {name: 'Map', exact:true}).click();
    await page.waitForFunction(() => document.body.classList.contains('sbs-pocket-map-visible'));
    async function checkCenter() {
      const result = await page.evaluate(() => {
        const r = document.querySelector('.sbs-pocket-map-viewport').getBoundingClientRect();
        const p = pans.at(-1), t = canvas.tokens.placeables[0].center;
        return {dx: (t.x-p.x)*p.scale+innerWidth/2-(r.left+r.width/2), dy:(t.y-p.y)*p.scale+innerHeight/2-(r.top+r.height/2), height:r.height, rootBg:getComputedStyle(sheet.element).backgroundColor, boardDisplay:getComputedStyle(document.getElementById('board')).display, boardPointer:getComputedStyle(document.getElementById('board')).pointerEvents, clip:getComputedStyle(document.getElementById('board')).clipPath};
      });
      assert.ok(Math.abs(result.dx)<1 && Math.abs(result.dy)<1, JSON.stringify(result));
      assert.ok(result.height>80);
      assert.equal(result.rootBg, 'rgba(0, 0, 0, 0)');
      assert.equal(result.boardDisplay, 'block');
      assert.equal(result.boardPointer, 'none');
      assert.match(result.clip, /inset/);
    }
    await checkCenter();
    await page.getByRole('button', {name:'Zoom in',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('output').textContent === '125%');
    await checkCenter();
    await page.evaluate(() => {canvas.tokens.placeables[0].center = {x:1800,y:1900};});
    await page.waitForTimeout(90);
    await checkCenter();
    await page.setViewportSize({width:844,height:390});
    await page.waitForTimeout(90);
    await checkCenter();
    const blocked = await page.evaluate(() => { const e=new KeyboardEvent('keydown',{code:'ArrowUp',bubbles:true,cancelable:true});document.body.dispatchEvent(e);return e.defaultPrevented; });
    assert.equal(blocked,true);
    await page.evaluate(() => {canvas.tokens.placeables[0].document.hidden=true;});
    await page.waitForFunction(() => !document.body.classList.contains('sbs-pocket-map-visible'));
    assert.equal(await page.locator('#board').evaluate(e => getComputedStyle(e).display),'none');
    assert.match(await page.locator('.sbs-pocket-map-message').textContent(),/no visible token/);
    await page.evaluate(() => {canvas.ready=false;});
    await page.waitForFunction(() => document.querySelector('.sbs-pocket-map-message').textContent.includes('Waiting'));
    await page.evaluate(() => {canvas.ready=true;canvas.scene.id='scene2';canvas.tokens.placeables[0].document.hidden=false;});
    await page.waitForFunction(() => document.body.classList.contains('sbs-pocket-map-visible'));
    await checkCenter();
    // Actor updates replace sheet HTML while the Map tab remains active.
    await page.evaluate(() => {
      const root = sheet.element;
      sheet._replaceHTML(root.innerHTML, root);
      sheet._onRender({}, {});
    });
    await page.waitForFunction(() => document.body.classList.contains('sbs-pocket-map-visible'));
    await checkCenter();
    await page.getByRole('button', {name:'Sheet',exact:true}).click();
    assert.equal(await page.locator('#board').evaluate(e=>getComputedStyle(e).display),'none');
    assert.equal(await page.evaluate(() => sheet._map.frame),null);
    const after = await page.evaluate(() => {const e=new KeyboardEvent('keydown',{code:'ArrowUp',bubbles:true,cancelable:true});document.body.dispatchEvent(e);return e.defaultPrevented;});
    assert.equal(after,false);
    await page.getByRole('button', {name:'Map',exact:true}).click();
    await page.waitForFunction(() => document.body.classList.contains('sbs-pocket-map-visible'));
    await page.evaluate(() => sheet.close({force:true}));
    assert.equal(await page.evaluate(() => document.body.classList.contains('sbs-pocket-map-visible')),false);
    assert.equal(await page.evaluate(() => sheet._map.frame),null);
    console.log('PASS: tab buttons, camera follow, zoom, rotation, hidden token, scene reload, actor rerender, keyboard guard, tab/close cleanup. Native Foundry/WebGL still needs live testing.');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});

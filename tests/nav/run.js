/* Horizon directions tests. Run:  node tests/nav/run.js
   1. The navigation exam (tests/nav/exam.js) must score at least FLOOR.
   2. Every page and tab in the app is a place the reader knows, and every place and
      task is reached by at least one exam sentence.
   3. Every button in a page's head row is covered by a Handbook chapter or a task.
   4. Every Handbook chapter can be walked: each step's button exists where it says.
   5. A direction never changes the person's data (moving is never doing).
   Needs Playwright (npm i playwright) with Chromium. */
const path = require('path');
const { chromium } = require('playwright');
const EXAM = require('./exam.js');
const FLOOR = 0.9;
const FILE = 'file://' + path.resolve(__dirname, '../../index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{ width:1536, height:864 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Fixed clock, so month words always mean the same months.
  await page.addInitScript(() => { const T0 = new Date('2026-11-25T10:00:00').getTime(); const RD = Date; const start = RD.now();
    class FD extends RD { constructor(...a){ if(a.length) super(...a); else super(T0 + (RD.now() - start)); } static now(){ return T0 + (RD.now() - start); } } window.Date = FD; });
  await page.goto(FILE); await page.waitForTimeout(600);
  await page.evaluate(() => { state.citizenship = 'SE'; state.homeBase = 'SE'; state.welcomeComplete = true; localStorage.setItem('horizon-finance-os-v1', JSON.stringify(state)); });
  await page.reload(); await page.waitForTimeout(1300);
  let failed = false;
  const fail = msg => { failed = true; console.log('  ✗ ' + msg); };

  // 1. The exam (decisions only: NLD.read has no side effects)
  const results = await page.evaluate(exam => exam.map(([text, want]) => {
    const d = NLD.read(text); let got;
    if(!d || d.kind === 'miss') got = 'ai';
    else if(d.kind === 'chapter') got = 'chapter:' + d.task;
    else if(d.kind === 'guide') got = 'guide:' + d.task;
    else if(d.kind === 'choose') got = 'choose';
    else if(d.kind === 'say') got = 'say';
    else if(d.kind === 'go'){ const p = d.pl; const nm = id => { const all = [].concat(state.trips || [], state.externalAssets || [], typeof retirePlaces === 'function' ? retirePlaces() : []); const e = all.find(x => String(x.id) === String(id)); return e ? e.name : id; };
      got = p.menu ? 'menu' : p.info ? 'info' : p.chat ? 'chat' : `${p.p}/${p.tab || ''}` + (p.month ? '@' + p.month : '') + (p.row != null ? '#' + nm(p.row) : ''); }
    const ok = got === want || (!want.includes('#') && !want.includes('@') && got.split(/[#@]/)[0] === want);
    return { text, want, got, ok, choices:d && d.options ? d.options.map(o => o.label).join(' | ') : '' };
  }), EXAM);
  const right = results.filter(r => r.ok).length, share = right / results.length;
  console.log(`1. Navigation exam: ${right} of ${results.length} right (${(share * 100).toFixed(1)}%, floor ${FLOOR * 100}%)`);
  results.filter(r => !r.ok).forEach(r => console.log(`   – “${r.text}”: wanted ${r.want}, got ${r.got}${r.choices ? ' [' + r.choices + ']' : ''}`));
  if(share < FLOOR) fail('the exam is below the floor');

  // 2. Reachability: every page/tab is a known place; every place and task is asked for in the exam.
  const appTabs = await page.evaluate(async () => {
    const out = [];
    for(const p of ['nl-today','nl-money','nl-plans','nl-future','nl-notebook','nl-setup','nl-settings']){
      NLP.ui(p).tab = undefined; nav(p); await new Promise(r => setTimeout(r, 150));
      const tabs = [...document.querySelectorAll(`#panel-${p} button[role=tab]`)].map(b => (/'([a-z]+)'\)$/.exec(b.getAttribute('onclick') || '') || [])[1]).filter(Boolean);
      if(!tabs.length) out.push(`${p}/`); else tabs.forEach(t => out.push(`${p}/${t}`));
    }
    return out;
  });
  const known = await page.evaluate(() => NLD.PLACES.map(p => `${p.p}/${p.tab || ''}`));
  appTabs.filter(t => !known.includes(t)).forEach(t => fail(`the page/tab ${t} has no place words`));
  const wanted = new Set(EXAM.map(e => e[1].split(/[#@]/)[0]));
  const placesAsked = await page.evaluate(w => NLD.PLACES.filter(p => !w.includes(`${p.p}/${p.tab || ''}`)).map(p => p.id), [...wanted]);
  placesAsked.forEach(id => fail(`no exam sentence reaches the place “${id}”`));
  const taskIds = await page.evaluate(() => NLD.TASKS.map(t => t.id));
  const taskHit = await page.evaluate(exam => { const hit = new Set(); exam.forEach(([text]) => { const d = NLD.read(text);
    if(d && d.task) hit.add(d.task); if(d && d.options) d.options.forEach(o => o.task && hit.add(o.task)); });
    const same = (a, b) => ['p','tab','row','set','setup','menu','info','chat'].every(k => (a[k] ?? null) === (b[k] ?? null));
    NLD.TASKS.forEach(t => t.words.concat([t.label]).forEach(w => { const d = NLD.read(w); if(d && (d.task === t.id || (d.options || []).some(o => o.task === t.id) || (d.kind === 'go' && (same(d.pl, t.place) || (d.pl.p === t.place.p && d.pl.tab === t.place.tab && !t.place.row && !t.place.set && !t.place.setup))))) hit.add(t.id); }));
    return [...hit]; }, EXAM);
  taskIds.filter(id => !taskHit.includes(id)).forEach(id => fail(`the task “${id}” cannot be reached by its own words`));
  const chapters = await page.evaluate(() => (window.NL_HANDBOOK || []).map(c => c.id));
  taskIds.filter(id => !chapters.includes(id)).forEach(id => fail(`the task “${id}” has no Handbook chapter`));
  console.log(`2. Reachability: ${appTabs.length} pages/tabs, ${placesAsked.length ? 'missing places' : 'all places asked for'}, ${taskIds.length} tasks`);

  // 3. Every head-row button is covered by a chapter or a task.
  const heads = await page.evaluate(async () => {
    const out = []; const text = (window.NL_HANDBOOK || []).map(c => c.title + ' ' + c.steps.map(s => Array.isArray(s) ? s[0] : s).join(' ')).join(' ') + ' ' + NLD.TASKS.map(t => t.label + ' ' + t.words.join(' ')).join(' ');
    const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/\d[\d\s]*/g, '').replace(/[·]/g, '').replace(/\s+/g, ' ').trim();
    const book = fold(text);
    for(const p of ['nl-today','nl-money','nl-plans','nl-future','nl-notebook','nl-setup','nl-settings']){
      nav(p); await new Promise(r => setTimeout(r, 120));
      const tabs = [...document.querySelectorAll(`#panel-${p} button[role=tab]`)];
      for(const tb of (tabs.length ? tabs : [null])){
        if(tb){ tb.click(); await new Promise(r => setTimeout(r, 120)); }
        document.querySelectorAll(`#panel-${p} .nl-head button:not([role=tab])`).forEach(b => { const l = fold(b.textContent); if(l && !book.includes(l)) out.push(`${p}: “${b.textContent.trim()}”`); });
      }
    }
    return [...new Set(out)];
  });
  heads.forEach(h => fail(`head button not in the Handbook or task words: ${h}`));
  console.log(`3. Head buttons: ${heads.length ? heads.length + ' not covered' : 'all covered'}`);

  // 4. Walk every chapter: each outlined button must exist; nav steps are pressed for real.
  const NO_PRESS = ['Back to the old look','Restore the backup','Connect and sign in','Download a copy','Choose a bank file','+ Upload','Save to Notebook','#nlst-row-rates button','Add this pension','Save trip','Fill a template','#nl-ask-input','[onclick="nlShowHow()"]','#nl-links [onclick="nlShowHistory()"]'];
  let walked = 0;
  for(const id of chapters){
    await page.evaluate(() => { NLD.stop(); document.getElementById('nl-info-back')?.classList.remove('on'); const m = document.getElementById('nl-menu'); if(m && !m.hidden) nlMenu(); ['nl-today','nl-money','nl-plans','nl-future','nl-notebook','nl-setup','nl-settings'].forEach(p => { NLP.ui(p).open = null; NLP.ui(p).chosen = null; }); nav('nl-today'); });
    await page.waitForTimeout(150);
    await page.evaluate(id => NLD.guide(id), id);
    for(let guard = 0; guard < 12; guard++){
      await page.waitForTimeout(500);
      const g = await page.evaluate(() => NLD.guideState());
      if(!g) break;
      const steps = await page.evaluate(id => NLD.guideSteps(id).map(s => s.target || null), id);
      const tgt = steps[g.i];
      if(tgt && !g.target){ fail(`chapter “${id}”, step ${g.i + 1}: cannot find “${tgt}”`); await page.evaluate(() => NLD.next()); continue; }
      if(!tgt || NO_PRESS.includes(tgt)){ await page.evaluate(() => NLD.next()); continue; }
      await page.click('.nld-ring', { timeout:2000 }).catch(() => fail(`chapter “${id}”, step ${g.i + 1}: could not press “${tgt}”`));
      await page.waitForTimeout(450);
      const after = await page.evaluate(() => NLD.guideState());
      if(after && after.i === g.i){ fail(`chapter “${id}”, step ${g.i + 1}: pressing “${tgt}” did not move the guide on`); await page.evaluate(() => NLD.next()); }
    }
    walked++;
  }
  console.log(`4. Handbook: ${walked} chapters walked`);

  // 5. Moving is never doing: acting on directions leaves the data unchanged.
  const same = await page.evaluate(async () => {
    const keys = ['trips','externalAssets','baseExpenses','baseIncome','baseSavings','monthlyOverrides','retirementAge','retirementScenario','journal','vault'];
    const before = JSON.stringify(keys.map(k => state[k]));
    for(const t of ['delete the paris trip','remove vanguard','old look','add a pension','December','2031','sync','reset my plan']){ window.nlReader(t); await new Promise(r => setTimeout(r, 100)); }
    return before === JSON.stringify(keys.map(k => state[k]));
  });
  if(!same) fail('a direction changed the person’s data'); else console.log('5. Moving is never doing: data unchanged');

  if(errors.length) fail('page errors: ' + errors.join(' | '));
  await browser.close();
  console.log(failed ? '\nFAILED' : '\nPASSED');
  process.exit(failed ? 1 : 0);
})();

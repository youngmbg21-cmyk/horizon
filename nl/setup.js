/* ══ NEW LOOK (L+S) · Setup by chat, and Settings ═══════════════════════════
   Two pages:
   · nl-setup    — "Set up Horizon": open fields filled by typing or by the
                   assistant (fill_setup puts DRAFTS here; nothing is saved
                   until the person presses "Save and start").
   · nl-settings — "Settings": currency, money mode, language, growth
                   numbers, Claude key, sync status and backups.
   In the new look the classic welcome wizard (#welcome-modal) and the
   mandatory citizenship pop-up (#onboarding-modal) are replaced by the
   Setup page. With the new look off, everything behaves exactly as before.
   Design rules: docs/LS-DESIGN.md.                                        */
(function(){
  'use strict';
  if(!window.NLP || typeof state === 'undefined') return;
  const H = NLP.h;
  const SETUP = 'nl-setup', SETTINGS = 'nl-settings';
  const prof = () => (state.profile && typeof state.profile === 'object') ? state.profile : (state.profile = { salary:0, maritalStatus:'', householdIncome:0, goals:'' });
  const words = () => (state.nlSetupWords && typeof state.nlSetupWords === 'object') ? state.nlSetupWords : {};
  const curRate = () => (typeof rate === 'function' ? rate() : 1) || 1;
  const sumIncome = () => (state.baseIncome || []).reduce((s, l) => s + (Number(l && l.amount) || 0), 0);
  const onboardOK = () => !!(state.citizenship && state.homeBase);
  const country = code => (code && typeof countryInfo === 'function') ? countryInfo(code) : null;
  const countryName = code => { const c = country(code); return c ? c.name : (code || ''); };
  const MARITAL = [['single','Single'],['partnered','Partner'],['married','Married'],['divorced','Divorced'],['widowed','Widowed']];
  const maritalLabel = v => (MARITAL.find(m => m[0] === v) || [,''])[1];

  // ══ SETUP: drafts ═══════════════════════════════════════════════════════
  // ui.draft[field] = { value, words? }  — never saved until "Save and start".
  const sui = () => { const u = NLP.ui(SETUP); if(!u.draft) u.draft = {}; return u; };
  const D = () => sui().draft;
  const SAVED = {
    name:      () => state.userName || '',
    citizenship: () => state.citizenship || '',
    homeBase:  () => state.homeBase || '',
    marital:   () => prof().maritalStatus || '',
    people:    () => state.raHouseholdSize == null ? null : Number(state.raHouseholdSize),
    age:       () => Number(state.currentAge) || null,
    retire:    () => Number(state.retirementAge) || null,
    income:    () => null,               // the plan's income lines are shown, not edited here
    goals:     () => prof().goals || '',
  };
  const val = f => (D()[f] ? D()[f].value : SAVED[f]());
  function setDraft(f, v, w){
    const same = (v === '' || v == null) ? (SAVED[f]() === '' || SAVED[f]() == null) : String(v) === String(SAVED[f]() == null ? '' : SAVED[f]());
    if(same && !w) delete D()[f];
    else D()[f] = { value:v, words:w || null };
  }
  const draftCount = () => Object.keys(D()).length;

  // The rows of the Setup page. req = needed before the plan makes sense.
  const ROWS = [
    { key:'name',      label:'Your name',   req:false, filled:() => !!String(val('name')).trim() },
    { key:'citizenship', label:'Citizenship', req:true, block:true, filled:() => !!val('citizenship') },
    { key:'homeBase',  label:'Home base',   req:true, block:true, filled:() => !!val('homeBase') },
    { key:'household', label:'Household',   req:false, filled:() => !!val('marital') || val('people') != null },
    { key:'age',       label:'Your age',    req:true,  filled:() => !!val('age') },
    { key:'retire',    label:'Retire at',   req:true,  filled:() => !!val('retire') },
    { key:'income',    label:'Income',      req:true,  filled:() => sumIncome() > 0 || !!D().income },
    { key:'goals',     label:'Goals',       req:false, filled:() => !!String(val('goals')).trim() },
  ];
  const stateOf = r => r.filled() ? 'filled' : (r.req ? 'needed' : 'optional');
  const drafted = r => r.key === 'household' ? (D().marital || D().people) : D()[r.key];
  function ageProblem(){
    const a = Number(val('age')), r = Number(val('retire'));
    if(!a || a < 18 || a > 99) return 'Your age should be between 18 and 99.';
    if(!r || r <= a || r > 100) return 'Retire at should be above your age, and 100 at most.';
    return '';
  }
  function saveBlock(){
    const miss = [];
    if(!val('citizenship')) miss.push('citizenship');
    if(!val('homeBase')) miss.push('home base');
    if(miss.length) return 'Choose your ' + miss.join(' and ') + ' first.';
    const ap = ageProblem(); if(ap) return ap;
    if(onboardOK() && state.welcomeComplete && !draftCount()) return 'Nothing changed yet.';
    return '';
  }
  const firstRun = () => !onboardOK() || !state.welcomeComplete;

  // Money at retirement, from the app's own projection, with the drafts tried out.
  function projection(){
    const d = D();
    try {
      return NLP.whatIf(st => {
        if(d.age) st.currentAge = Number(d.age.value) || st.currentAge;
        if(d.retire) st.retirementAge = Number(d.retire.value) || st.retirementAge;
        if(d.income && sumIncome() <= 0) st.baseIncome = [{ id:'nl-draft', name:'Income', amount:Number(d.income.value) || 0, type:'fixed' }];
      }, () => getProjection().map(r => ({ age:r.age, v:(state.displayMode === 'nominal' ? r.total : r.realTotal) || 0 })));
    } catch(err){ return []; }
  }
  function chartTitle(pts){
    if(!pts || pts.length < 2) return 'Your money at retirement shows once your ages are set.';
    const last = pts[pts.length - 1];
    return `Your money at ${last.age}: about ${NLP.moneyShort(last.v)}`;
  }
  function drawProjection(w, h){
    const pts = projection();
    if(pts.length < 2) return `<div class="nl-empty"><p>Set a retirement age above your age to see this.</p></div>`;
    const mx = Math.max(1, ...pts.map(p => p.v)), mn = Math.min(0, ...pts.map(p => p.v));
    const yt = NLP.ticks(mn, mx, 3, v => NLP.moneyShort(v));
    const a0 = pts[0].age, a1 = pts[pts.length - 1].age, span = a1 - a0;
    const step = span > 30 ? 10 : span > 12 ? 5 : span > 5 ? 2 : 1;
    const xt = [[a0, String(a0)]]; for(let a = Math.ceil((a0 + 1) / step) * step; a < a1; a += step) if(a - a0 >= step / 2 && a1 - a >= step / 2) xt.push([a, String(a)]); xt.push([a1, String(a1)]);
    return NLP.chart({ w, h, x:[a0, a1], y:[yt.min, yt.max], yt:yt.ticks, xt, pad:{ l:58, r:20, t:22 }, label:chartTitle(pts), draw:k => {
      const xy = pts.map(p => [p.age, p.v]), f = xy[0], l = xy[xy.length - 1];
      return `<path d="${k.area(xy, Math.max(yt.min, 0))}" fill="#087363" fill-opacity=".10"/><path d="${k.line(xy)}" fill="none" stroke="#087363" stroke-width="2.2"/>`
        + `<circle cx="${k.sx(f[0])}" cy="${k.sy(f[1])}" r="3.5" fill="#1D1D1F"/><circle cx="${k.sx(l[0])}" cy="${k.sy(l[1])}" r="4" fill="#087363"/>`
        + `<text class="lab" x="${k.sx(f[0]) + 8}" y="${k.sy(f[1]) - 8}">Now, ${H(NLP.moneyShort(f[1]))}</text>`
        + `<text class="lab" x="${k.sx(l[0]) - 6}" y="${Math.max(14, k.sy(l[1]) - 9)}" text-anchor="end">${H(NLP.moneyShort(l[1]))} at ${l[0]}</text>`;
    } });
  }

  // ── Setup: the open fields ──
  function sub(r){
    const d = r.key === 'household' ? (D().marital || D().people) : D()[r.key];
    const w = d && d.words ? d.words : (!d && words()[r.key]) || '';
    let out = w ? NLP.quote(w) : '';
    if(!r.filled() && r.req && !w) out = `<span class="nls-hint">${H(r.block ? 'Needed before you can start.' : 'Needed for your plan.')}</span>`;
    return out ? `<div class="nls-sub">${out}</div>` : '';
  }
  function badge(r){
    if(drafted(r)) return NLP.badge('Not saved', 'steel');
    const s = stateOf(r);
    if(s === 'needed') return NLP.badge('Needed', 'amber');
    if(s === 'optional') return NLP.badge('Optional', 'grey');
    return '';
  }
  function countryOptions(sel){
    const list = typeof countryList === 'function' ? countryList() : [];
    return `<option value="">Choose a country</option>` + list.map(c => `<option value="${H(c.code)}"${c.code === sel ? ' selected' : ''}>${H(c.flag ? c.flag + ' ' : '')}${H(c.name)}</option>`).join('');
  }
  function fieldHtml(r){
    const k = r.key; let v = '';
    if(k === 'name') v = `<input type="text" id="nls-name" data-f="name" data-nl-keep="no" autocomplete="given-name" placeholder="What should Horizon call you?" value="${H(val('name'))}">`;
    else if(k === 'citizenship') v = `<select id="nls-citizenship" data-f="citizenship" data-nl-keep="no" class="${val('citizenship') ? '' : 'empty'}">${countryOptions(val('citizenship'))}</select>`;
    else if(k === 'homeBase') v = `<select id="nls-homeBase" data-f="homeBase" data-nl-keep="no" class="${val('homeBase') ? '' : 'empty'}">${countryOptions(val('homeBase'))}</select>`;
    else if(k === 'household'){
      const m = val('marital'), p = val('people');
      v = `<div class="nls-pills"><span class="nl-seg" role="group" aria-label="Relationship">${MARITAL.map(x => `<button type="button" data-pick="marital" data-v="${x[0]}" aria-pressed="${m === x[0]}">${x[1]}</button>`).join('')}</span>`
        + `<span class="nl-seg" role="group" aria-label="People at home">${[[1,'Just me'],[2,'Two of us']].map(x => `<button type="button" data-pick="people" data-v="${x[0]}" aria-pressed="${p === x[0]}">${x[1]}</button>`).join('')}</span></div>`;
    }
    else if(k === 'age') v = `<span class="nls-num"><input type="number" class="nl-num-in" id="nls-age" data-f="age" data-nl-keep="no" min="18" max="99" step="1" value="${H(val('age') || '')}"> <span>years old</span></span>`;
    else if(k === 'retire') v = `<span class="nls-num"><input type="number" class="nl-num-in" id="nls-retire" data-f="retire" data-nl-keep="no" min="19" max="100" step="1" value="${H(val('retire') || '')}"> <span>years old</span></span>`;
    else if(k === 'income'){
      const lines = (state.baseIncome || []).filter(l => l && Number(l.amount));
      const d = D().income;
      if(lines.length){
        v = `<div class="nls-val">${H(lines.slice(0, 3).map(l => l.name || 'Income').join(' + '))}${lines.length > 3 ? ` + ${lines.length - 3} more` : ''} · ${H(NLP.money(sumIncome()))} a month</div>`
          + (d ? `<div class="nls-det">You said ${H(NLP.money(d.value))} a month in all. It is kept as your household income.</div>` : '')
          ;
      } else {
        v = `<span class="nls-num"><input type="number" class="nl-num-in" id="nls-income" data-f="income" data-nl-keep="no" min="0" step="100" placeholder="0" value="${d ? H(Math.round(Number(d.value) * curRate())) : ''}"> <span>${H(typeof sym === 'function' ? sym() : '')} a month, after tax</span></span>`
          ;
      }
    }
    else if(k === 'goals') v = `<textarea id="nls-goals" data-f="goals" data-nl-keep="no" rows="2" placeholder="A house, a long trip, retiring early…">${H(val('goals'))}</textarea>`;
    return `<div class="nl-field nls-row" id="nls-row-${k}" data-state="${stateOf(r)}"><label class="lb"${['name','citizenship','homeBase','age','retire','goals','income'].includes(k) ? ` for="nls-${k}"` : ''}>${H(r.label)}</label><div class="v">${v}${sub(r)}${k === 'income' ? `<div class="nls-det">${(state.baseIncome || []).some(l => l && Number(l.amount)) ? NLP.link('Change your income in Money plan', "NLP.go('nl-money')") : 'You can split it into lines later in ' + NLP.link('Money plan', "NLP.go('nl-money')")}</div>` : ''}</div><div class="a">${badge(r)}</div></div>`;
  }

  function renderSetup(host){
    const st = sui(), tab = NLP.tabOf(SETUP, 'all');
    const by = { filled:[], needed:[], optional:[] }; ROWS.forEach(r => by[stateOf(r)].push(r));
    const shown = tab === 'all' ? ROWS : by[tab] || ROWS;
    const pts = projection();
    host.innerHTML = `<div class="nl-wrap nls">${NLP.head({ title:'Set up Horizon', panel:SETUP, tabs:[
        { key:'all', label:'All', count:ROWS.length, on:tab === 'all' },
        { key:'filled', label:'Filled', count:by.filled.length, on:tab === 'filled' },
        { key:'needed', label:'Needed', count:by.needed.length, on:tab === 'needed' },
        { key:'optional', label:'Optional', count:by.optional.length, on:tab === 'optional' } ] })}
      <div class="nls-fields">${shown.length ? shown.map(fieldHtml).join('') : NLP.empty(tab === 'needed' ? 'Nothing is needed. You can start.' : 'Nothing here.')}</div>
      ${ageProblem() ? `<p class="nls-hint nls-age-why">${H(ageProblem())}</p>` : ''}
      <section class="nl-cc nls-chart"><h2 class="nl-ct" id="nls-chart-title">${H(chartTitle(pts))}</h2><p class="nl-cs">From your answers, in ${state.displayMode === 'nominal' ? 'future' : 'today’s'} money. It redraws as you fill them in.</p>${NLP.chartBox(drawProjection, 170, 'Money until retirement')}</section>
    </div>`;
    wireSetup(host);
    st.drawn = true;
  }
  let liveT = null;
  function live(host){
    clearTimeout(liveT);
    liveT = setTimeout(() => {
      NLP.mountCharts(host);
      const t = document.getElementById('nls-chart-title'); if(t) t.textContent = chartTitle(projection());
      NLP.refreshPanel();
    }, 120);
  }
  function wireSetup(host){
    host.querySelectorAll('[data-f]').forEach(el => {
      const f = el.dataset.f;
      const read = () => {
        let v = el.value;
        if(f === 'age' || f === 'retire') v = v === '' ? '' : Math.round(Number(v));
        if(f === 'income') v = v === '' ? '' : Math.max(0, Number(v) / curRate());
        return v;
      };
      if(el.tagName === 'SELECT'){
        el.addEventListener('change', () => { setDraft(f, el.value); NLP.renderPage(SETUP); });
        return;
      }
      el.addEventListener('input', () => { setDraft(f, read()); live(host); });
      el.addEventListener('change', () => { setDraft(f, read()); NLP.renderPage(SETUP); });
    });
    host.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      const f = b.dataset.pick, v = f === 'people' ? Number(b.dataset.v) : b.dataset.v;
      setDraft(f, val(f) === v ? (f === 'people' ? null : '') : v);
      if(f === 'people' && D().people && D().people.value == null && SAVED.people() == null) delete D().people;
      NLP.renderPage(SETUP);
    }));
  }

  // ── Save and start ──
  function saveSetup(){
    const why = saveBlock(); if(why){ NLP.toast(why, 'warn'); return; }
    const d = D(), keepKeys = ['userName','citizenship','homeBase','profile','raHouseholdSize','currentAge','retirementAge','baseIncome','welcomeComplete','nlSetupWords'];
    const before = {}; keepKeys.forEach(k => { before[k] = state[k] === undefined ? undefined : JSON.parse(JSON.stringify(state[k])); });
    const w = Object.assign({}, words());
    const wk = f => (f === 'marital' || f === 'people') ? 'household' : f;
    const put = (f, fn) => { if(!d[f]) return; fn(d[f].value); };
    Object.keys(d).forEach(f => { if(d[f].words) w[wk(f)] = d[f].words; });
    Object.keys(d).forEach(f => { if(!d[f].words && !Object.keys(d).some(g => wk(g) === wk(f) && d[g].words)) delete w[wk(f)]; });
    put('name', v => { state.userName = String(v || '').trim(); });
    put('citizenship', v => { state.citizenship = v; });
    put('homeBase', v => { state.homeBase = v; });
    put('marital', v => { prof().maritalStatus = v || ''; });
    put('people', v => { state.raHouseholdSize = v == null ? null : Number(v); });
    put('age', v => { state.currentAge = Number(v); });
    put('retire', v => { state.retirementAge = Number(v); });
    put('goals', v => { prof().goals = String(v || ''); });
    put('income', v => {
      const amt = Math.round(Number(v) || 0); if(!amt) return;
      if(sumIncome() <= 0) state.baseIncome = [{ id:typeof genId === 'function' ? genId() : 'i' + Date.now(), name:'Income', amount:amt, type:'fixed' }];
      else prof().householdIncome = amt;
    });
    state.nlSetupWords = w;
    state.welcomeComplete = true;
    if(typeof clampRetirementInputs === 'function') clampRetirementInputs();
    if(typeof invalidateSelectors === 'function') invalidateSelectors();
    const first = !before.citizenship || !before.homeBase || !before.welcomeComplete;
    sui().draft = {}; NLP.ui(SETUP).tab = 'all';
    save();
    if(typeof hideOnboardingBlock === 'function') hideOnboardingBlock();
    if(typeof renderAll === 'function') try { renderAll(); } catch(_){}
    NLP.toast(first ? 'Setup saved. Welcome to Horizon.' : 'Setup saved', '', { label:'Undo', fn:() => {
      keepKeys.forEach(k => { if(before[k] === undefined) delete state[k]; else state[k] = before[k]; });
      if(typeof invalidateSelectors === 'function') invalidateSelectors();
      save(); NLP.toast('Setup undone');
      if(!onboardOK() && NLP.isOn()) nav(SETUP);
    } });
    NLP.go('nl-today');
  }
  function skipSetup(){
    sui().draft = {};
    if(!state.welcomeComplete){ state.welcomeComplete = true; save(); }
    NLP.go('nl-today');
  }
  function focusField(k){
    const ui = sui(); if(NLP.tabOf(SETUP, 'all') !== 'all'){ ui.tab = 'all'; NLP.renderPage(SETUP); }
    const row = document.getElementById('nls-row-' + k); if(!row) return;
    row.scrollIntoView({ block:'center', behavior:'smooth' });
    const i = row.querySelector('input,select,textarea,button'); if(i) setTimeout(() => i.focus({ preventScroll:true }), 250);
  }

  function setupOverview(){
    const needed = ROWS.filter(r => stateOf(r) === 'needed'), nd = draftCount();
    const step = (ok, need) => ok ? 'ok' : (need ? 'on' : '');
    const about = ROWS.filter(r => ['citizenship','homeBase','age','retire'].includes(r.key)).every(r => r.filled());
    const money = ROWS.find(r => r.key === 'income').filled(), goals = ROWS.find(r => r.key === 'goals').filled();
    const graphic = `<div class="nl-counts nls-steps"><div class="${step(about, true)}">About you</div><div class="${step(money, true)}">Money in</div><div class="${step(goals, false)}">Goals</div></div>`;
    let headline;
    if(val('citizenship') && val('homeBase')) headline = firstRun() || nd ? 'Almost done. Check the lines on the left, then start.' : 'Your setup is saved. Change any line on the left.';
    else headline = 'Tell Horizon about yourself.';
    const groups = [];
    if(needed.length) groups.push({ title:'Still needed', rows:needed.map(r => ({ text:H(r.label), badge:{ text:'Needed', kind:'amber' }, why:H(r.block ? 'Horizon can’t start without it.' : 'Your plan’s numbers depend on it.'), link:{ label:'Fill in ' + r.label.toLowerCase(), onclick:`nlSetupFocus('${r.key}')` } })) });
    if(nd){
      const ks = ROWS.filter(r => drafted(r)), n = ks.length;
      groups.push({ title:'Not saved yet', rows:[{ text:`${n} line${n > 1 ? 's' : ''} filled in, not saved`, badge:{ text:'Not saved', kind:'steel' }, why:H(ks.map(r => r.label).join(', ')) + '. Saved when you press ' + H(firstRun() ? 'Save and start' : 'Save changes') + '.' }] });
    }
    groups.push({ title:'Talk instead', rows:[{ text:'Tell Horizon in your own words. It asks one question at a time and fills the lines for you.', link:{ label:'Start talking', onclick:"NLP.ask('Help me set up Horizon. Ask me one question at a time.')" } }] });
    const block = saveBlock();
    const label = firstRun() ? 'Save and start' : 'Save changes';
    const links = [];
    if(onboardOK() && (firstRun() || nd)) links.push({ label:firstRun() ? 'Skip for now' : 'Leave without saving', short:firstRun() ? 'Skip' : 'Leave', onclick:'nlSetupSkip()' });
    links.push({ label:'Settings', short:'Settings', onclick:"NLP.go('nl-settings')" });
    const button = (!firstRun() && !nd) ? null : block ? { label, disabledWhy:block } : { label, onclick:'nlSetupSave()' };
    return { headline, graphic, groups, button, links };
  }
  window.nlSetupSave = saveSetup;
  window.nlSetupSkip = skipSetup;
  window.nlSetupFocus = focusField;

  NLP.register({ panel:SETUP, section:'setup', label:'Set up', render:renderSetup, overview:setupOverview });

  // ── The assistant fills drafts ──
  function findCountry(s){
    const list = typeof countryList === 'function' ? countryList() : [];
    const q = String(s || '').trim(); if(!q) return null;
    const up = q.toUpperCase();
    const alias = { UK:'GB', 'UNITED KINGDOM':'GB', BRITAIN:'GB', ENGLAND:'GB', USA:'US', AMERICA:'US', 'UNITED STATES':'US', SVERIGE:'SE', SWEDISH:'SE', KENYAN:'KE', BRITISH:'GB', AMERICAN:'US' };
    if(alias[up]) return list.find(c => c.code === alias[up]) || null;
    let c = list.find(x => x.code === up) || list.find(x => x.name.toUpperCase() === up);
    if(c) return c;
    const hits = list.filter(x => up.includes(x.name.toUpperCase())).sort((a, b) => b.name.length - a.name.length);
    if(hits.length) return hits[0];
    return list.find(x => x.name.toUpperCase().startsWith(up.slice(0, Math.max(4, up.length - 2)))) || null;
  }
  NLP.addTool({
    def:{ name:'fill_setup',
      description:'On the Set up Horizon page: put one DRAFT value into a setup line. Nothing is saved; the person checks the lines and presses "Save and start". Call once per line you learned. Pass the person\'s own short words in `words` so the page can quote them.',
      input_schema:{ type:'object', properties:{
        field:{ type:'string', enum:['name','citizenship','home_base','relationship','people_at_home','age','retire_at','income','goals'] },
        value:{ type:'string', description:'name: what to call them. citizenship / home_base: a country name or ISO code. relationship: single, partnered, married, divorced or widowed. people_at_home: 1 or 2. age / retire_at: whole years. income: total money coming in each month after tax for the household, as a plain number in the currency the person uses in Horizon. goals: a short plain sentence.' },
        words:{ type:'string', description:'The person\'s own words this came from, short, e.g. "I\'m Swedish".' }
      }, required:['field','value'], additionalProperties:false } },
    label:i => 'Filling in ' + String(i && i.field || 'a line').replace(/_/g, ' '),
    run(input){
      if(state.activePanel !== SETUP) return { error:'The Set up Horizon page is not open. Tell the person they can open it from Settings › About you.' };
      const f = String(input.field || ''), raw = String(input.value == null ? '' : input.value).trim(), w = input.words ? String(input.words).slice(0, 160) : null;
      let field, v, shown;
      if(f === 'name'){ field = 'name'; v = raw.slice(0, 60); shown = v; }
      else if(f === 'citizenship' || f === 'home_base'){
        const c = findCountry(raw); if(!c) return { error:'No country matches "' + raw + '". Ask which country they mean.' };
        field = f === 'citizenship' ? 'citizenship' : 'homeBase'; v = c.code; shown = c.name;
      }
      else if(f === 'relationship'){
        const m = raw.toLowerCase(); const hit = MARITAL.find(x => m.startsWith(x[0].slice(0, 5)) || m.includes(x[0])) || (/(partner|together|cohabit|sambo|girlfriend|boyfriend)/.test(m) ? ['partnered'] : null);
        if(!hit) return { error:'Use one of: single, partnered, married, divorced, widowed.' };
        field = 'marital'; v = hit[0]; shown = maritalLabel(v);
      }
      else if(f === 'people_at_home'){ const n = Math.round(Number(raw)); if(!(n >= 1)) return { error:'Give 1 or 2.' }; field = 'people'; v = Math.min(2, n); shown = v === 1 ? 'Just me' : 'Two of us'; }
      else if(f === 'age' || f === 'retire_at'){
        const n = Math.round(Number(String(raw).replace(/[^\d.]/g, ''))); if(!(n >= 18 && n <= 100)) return { error:'Give whole years between 18 and 100.' };
        field = f === 'age' ? 'age' : 'retire'; v = n; shown = n;
      }
      else if(f === 'income'){
        const n = Number(String(raw).replace(/[^\d.]/g, '')); if(!(n > 0)) return { error:'Give the monthly amount as a plain number.' };
        field = 'income'; v = n / curRate(); shown = NLP.money(v) + ' a month';
      }
      else if(f === 'goals'){ field = 'goals'; v = raw.slice(0, 600); shown = v; }
      else return { error:'Unknown field.' };
      setDraft(field, v, w);
      if(!D()[field]) D()[field] = { value:v, words:w };
      NLP.renderPage(SETUP);
      const still = ROWS.filter(r => stateOf(r) === 'needed').map(r => r.label);
      return { ok:true, field:f, shown:String(shown), saved:false, still_needed:still, note:'Draft only. Nothing is saved until the person presses Save and start.' };
    }
  });
  // Dynamic instructions: read each time a message is sent.
  NLP.addSystem({ toString(){
    let s = `

## Settings the assistant can suggest
You can suggest a change to these settings with suggest_setting: currency, money shown as today's or future money, language, growth before retiring, inflation, growth after retiring, life expectancy. It never changes anything: the person sees it marked Suggested on the Settings page and presses "Use it". Say so.`;
    if(typeof state === 'undefined' || state.activePanel !== SETUP) return s;
    const filled = ROWS.filter(r => r.filled()).map(r => r.label), needed = ROWS.filter(r => stateOf(r) === 'needed').map(r => r.label), opt = ROWS.filter(r => stateOf(r) === 'optional').map(r => r.label);
    return s + `

## The person is on the "Set up Horizon" page
Help them set up Horizon by chatting. Ask friendly, short questions ONE AT A TIME (where they live, their citizenship, who is at home, their age and when they'd like to retire, roughly what comes in each month, and anything they are saving towards).
Each time you learn something, call fill_setup for that line, with their own short words in "words". Citizenship and home base are required. Then ask the next question.
fill_setup only puts DRAFTS on the page. Nothing is saved until the person presses "Save and start". Never say anything is saved.
Lines filled now: ${filled.join(', ') || 'none'}. Still needed: ${needed.join(', ') || 'none'}. Optional and empty: ${opt.join(', ') || 'none'}.
Amounts the person says are in ${state.currency || 'SEK'}.`;
  } });

  // ══ SETTINGS ════════════════════════════════════════════════════════════
  const tui = () => { const u = NLP.ui(SETTINGS); if(!u.sug) u.sug = {}; return u; };
  const SET = {
    currency: { label:'Currency', get:() => state.currency || 'SEK', show:v => v },
    displayMode: { label:'Show money as', get:() => state.displayMode || 'real', show:v => v === 'nominal' ? 'Future money' : 'Today’s money' },
    lang: { label:'Language', get:() => state.lang || 'en', show:v => v === 'sv' ? 'Svenska' : 'English' },
    growthRate: { label:'Growth', num:true, unit:'% a year', min:0, max:30, step:0.1, get:() => Number(state.growthRate), show:v => v + '% a year', det:'How fast your savings grow before you retire. Used for every projection.' },
    inflationRate: { label:'Inflation', num:true, unit:'% a year', min:0, max:30, step:0.1, get:() => Number(state.inflationRate), show:v => v + '% a year', det:'How fast prices rise. Today’s money takes this out.' },
    retirementPostGrowth: { label:'Growth after retiring', num:true, unit:'% a year', min:0, max:30, step:0.1, get:() => Number(state.retirementPostGrowth ?? 4), show:v => v + '% a year', det:'Usually lower: money is kept safer once you live on it.' },
    lifeExp: { label:'Plan until age', num:true, unit:'years old', min:50, max:120, step:1, get:() => Number(state.lifeExp || 90), show:v => 'Age ' + v, det:'Your life expectancy. The plan makes your money last this long.' },
  };
  function applySetting(key, v){
    const before = SET[key].get();
    if(String(before) === String(v)) return;
    const restore = () => applySetting(key, before);
    if(key === 'currency'){ if(typeof applyCurrency === 'function') applyCurrency(v); else { state.currency = v; save(); } setTimeout(() => NLP.rerender(), 30); }
    else if(key === 'displayMode'){ if(typeof applyDisplayMode === 'function') applyDisplayMode(v); else { state.displayMode = v; save(); } }
    else if(key === 'lang'){ if(typeof setLang === 'function') setLang(v); else { state.lang = v; save(); } }
    else {
      state[key] = Number(v);
      if(typeof clampRetirementInputs === 'function') clampRetirementInputs();
      if(typeof invalidateSelectors === 'function') invalidateSelectors();
      save();
    }
    delete tui().sug[key];
    NLP.toast(SET[key].label + ' set to ' + SET[key].show(SET[key].get()), '', { label:'Undo', fn:restore });
  }
  window.nlSettingSet = applySetting;
  window.nlSettingUse = function(key){ const s = tui().sug[key]; if(s) applySetting(key, s.value); NLP.rerender(); };
  window.nlSettingDrop = function(key){ delete tui().sug[key]; NLP.rerender(); };
  window.nlSettingsUseAll = function(){ Object.keys(tui().sug).forEach(k => applySetting(k, tui().sug[k].value)); NLP.rerender(); };

  function sugLine(key){
    const s = tui().sug[key]; if(!s) return '';
    return `<div class="nls-sug">${NLP.badge('Suggested', 'amber')} <span class="nl-was">${H(SET[key].show(SET[key].get()))}</span><b>${H(SET[key].show(s.value))}</b>${s.why ? ` <span class="nls-det">${H(s.why)}</span>` : ''}<span class="nls-sug-acts">${NLP.link('Use it', `nlSettingUse('${key}')`)}${NLP.link('Drop', `nlSettingDrop('${key}')`)}</span></div>`;
  }
  const seg = (key, opts) => `<span class="nl-seg" role="group" aria-label="${H(SET[key].label)}">${opts.map(o => `<button type="button" aria-pressed="${SET[key].get() === o[0]}" onclick="nlSettingSet('${key}','${o[0]}')">${H(o[1])}</button>`).join('')}</span>`;
  const row = (id, label, valueHtml, act, cls) => `<div class="nl-field nls-row${cls ? ' ' + cls : ''}" id="nlst-row-${id}"><span class="lb">${H(label)}</span><div class="v">${valueHtml}</div><div class="a">${act || ''}</div></div>`;
  const det = t => `<div class="nls-det">${t}</div>`;
  function aboutSummary(){
    const p = prof(), bits = [];
    if(state.userName) bits.push(H(state.userName));
    if(state.citizenship) bits.push(H(countryName(state.citizenship)) + ' citizen');
    if(state.homeBase) bits.push('lives in ' + H(countryName(state.homeBase)));
    if(p.maritalStatus) bits.push(H(maritalLabel(p.maritalStatus)));
    if(state.currentAge) bits.push('age ' + H(state.currentAge));
    return bits.join(' · ');
  }
  const keyOk = () => !!(state.aiKeys && state.aiKeys.claude);
  function syncInfo(){
    const s = state.sync || {};
    const on = typeof syncConfigured === 'function' ? syncConfigured() : !!(s.enabled && s.url);
    const ago = iso => { const t = Date.parse(iso || ''); if(!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' minute' + (m > 1 ? 's' : '') + ' ago' : m < 1440 ? Math.round(m / 60) + ' hour' + (m >= 90 ? 's' : '') + ' ago' : new Date(t).toLocaleDateString('en-GB', { day:'numeric', month:'short' }); };
    if(!on) return { on:false, text:'Off', detail:'Your data stays on this device only.' };
    const parts = [s.autoSync === false ? 'On, by hand' : 'On'];
    return { on:true, err:s.lastError, text:parts.join('') + (s.email ? ' · ' + s.email : ''), detail:s.lastError ? 'Last try failed: ' + s.lastError : (s.lastSyncAt ? 'Last synced ' + ago(s.lastSyncAt) : 'Not synced yet') };
  }
  // The new-look backup kept on this device (Phase 0). Its date is read from
  // the New look menu, which refreshes it when the menu opens.
  function backupInfo(){
    const btn = document.getElementById('nl-restore-btn'), sub = document.getElementById('nl-restore-sub');
    return { have:!!(btn && !btn.disabled), text:sub ? sub.textContent : '' };
  }
  let backupPoked = false;
  function pokeBackup(){
    if(backupPoked || typeof window.nlMenu !== 'function') return;
    const m = document.getElementById('nl-menu'); if(!m || !m.hidden) return;
    backupPoked = true;
    window.nlMenu(); window.nlMenu();       // open + close in one frame: refreshes the backup date
    setTimeout(() => { if(state.activePanel === SETTINGS) NLP.rerender(); }, 400);
  }

  function renderSettings(host){
    const tab = NLP.tabOf(SETTINGS, 'general'), sg = tui().sug;
    const sugN = k => Object.keys(sg).filter(x => k.includes(x)).length;
    const GEN = ['currency','displayMode','lang','growthRate','inflationRate','retirementPostGrowth','lifeExp'];
    let body = '';
    if(tab === 'general'){
      const curOpts = Object.keys(typeof CURRENCY_SYMBOLS !== 'undefined' ? CURRENCY_SYMBOLS : { SEK:1 }).map(c => [c, c]);
      body += row('currency', 'Currency', seg('currency', curOpts) + sugLine('currency'));
      body += row('displayMode', 'Show money as', seg('displayMode', [['real','Today’s money'],['nominal','Future money']]) + det(state.displayMode === 'nominal' ? 'Future money shows the amounts as they will be on the day.' : `Today’s money takes out ${H(Number(state.inflationRate) || 0)}% inflation a year.`) + sugLine('displayMode'));
      body += row('lang', 'Language', seg('lang', [['en','English'],['sv','Svenska']]) + det('Classic pages follow this. The new look is in English for now.') + sugLine('lang'));
      const ab = aboutSummary();
      body += row('about', 'About you', `<div class="nls-val">${ab || '<span class="nls-hint">Not set up yet</span>'}</div>` + det(Object.keys(words()).length ? 'From your setup chat' : 'From your setup'), `${!onboardOK() ? NLP.badge('Needed', 'amber') + ' ' : ''}${NLP.link(onboardOK() ? 'Change in Setup' : 'Finish setup', "NLP.go('nl-setup')")}`);
      ['growthRate','inflationRate','retirementPostGrowth','lifeExp'].forEach(k => {
        const s = SET[k];
        body += row(k, s.label, `<span class="nls-num"><input type="number" class="nl-num-in" id="nlst-${k}" data-k="${k}" data-nl-keep="no" min="${s.min}" max="${s.max}" step="${s.step}" value="${H(s.get())}"> <span>${H(s.unit)}</span></span>` + det(H(s.det)) + sugLine(k));
      });
    } else if(tab === 'assistant'){
      body += row('key', 'Claude key', `<input type="password" id="nlst-key" data-nl-keep="no" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" value="${H((state.aiKeys && state.aiKeys.claude) || '')}">` + det('Your own key. It stays on this device and is never put in backups or synced.'), keyOk() ? NLP.badge('Key added', 'green') : NLP.badge('Needed', 'amber'), keyOk() ? '' : 'need');
      body += row('can', 'What it can do', `<div class="nls-val">Prepares changes; you decide</div>` + det('It suggests, you press Apply. ' + NLP.link('How the assistant works', 'nlShowHow()')));
    } else {
      const si = syncInfo();
      body += row('sync', 'Sync', `<div class="nls-val">${H(si.text)}</div>` + det(H(si.detail)) + det(NLP.link(si.on ? 'Open classic sync settings' : 'Turn on sync in classic settings', "nav('settings')")), si.on ? NLP.badge(si.err ? 'Problem' : 'On', si.err ? 'ruby' : 'green') : NLP.badge('Off', 'grey'));
      body += row('backup', 'Backup', `<div class="nls-val">A copy of everything as a file</div>` + det('Everything except your Claude key.'), NLP.link('Download a copy', "exportSlice('all')"));
      const b = backupInfo();
      body += row('nlbackup', 'Before the new look', `<div class="nls-val">${b.have ? 'Kept on this device' : 'No backup on this device'}</div>` + det(H(b.have ? b.text : 'Made the first time the new look is turned on.')), b.have ? `<span class="nls-acts">${NLP.link('Restore it', 'nlAskRestore()')}${NLP.link('Download it', 'nlDownloadBackup()')}</span>` : '');
      pokeBackup();
    }
    host.innerHTML = `<div class="nl-wrap nlst">${NLP.head({ title:'Settings', panel:SETTINGS, tabs:[
        { key:'general', label:'General', count:sugN(GEN) || null, on:tab === 'general' },
        { key:'assistant', label:'Assistant', on:tab === 'assistant' },
        { key:'sync', label:'Sync and backup', on:tab === 'sync' } ] })}
      <div class="nls-fields">${body}</div></div>`;
    host.querySelectorAll('input[data-k]').forEach(i => i.addEventListener('change', () => {
      const v = Number(i.value), s = SET[i.dataset.k];
      if(i.value === '' || !isFinite(v) || v < s.min || v > s.max){ NLP.toast(`${s.label} should be between ${s.min} and ${s.max}.`, 'warn'); i.value = s.get(); return; }
      applySetting(i.dataset.k, s.step >= 1 ? Math.round(v) : +v.toFixed(2));
    }));
    const key = host.querySelector('#nlst-key');
    if(key) key.addEventListener('change', () => {
      const before = (state.aiKeys && state.aiKeys.claude) || '', v = key.value.trim();
      if(v === before) return;
      if(!state.aiKeys) state.aiKeys = {};
      state.aiKeys.claude = v; save();
      NLP.toast(v ? 'Claude key saved on this device' : 'Claude key removed', '', { label:'Undo', fn:() => { state.aiKeys.claude = before; save(); } });
    });
  }
  function settingsOverview(){
    const miss = [];
    if(!onboardOK()) miss.push({ text:'About you is not finished', why:'Citizenship and home base are needed.', link:{ label:'Finish setup', onclick:"NLP.go('nl-setup')" }, btn:{ label:'Finish setup', onclick:"NLP.go('nl-setup')" } });
    if(!keyOk()) miss.push({ text:'The assistant needs your Claude key', why:'Without it you can still type everything yourself.', link:{ label:'Add your key', onclick:"nlSettingsKey()" }, btn:{ label:'Add your Claude key', onclick:'nlSettingsKey()' } });
    const sg = tui().sug, sk = Object.keys(sg);
    const si = syncInfo();
    const graphic = `<div class="nl-counts nls-steps"><div class="${onboardOK() ? 'ok' : 'on'}">About you</div><div class="${keyOk() ? 'ok' : 'on'}">Assistant</div><div class="${si.on && !si.err ? 'ok' : (si.err ? 'on' : '')}">Sync${si.on ? '' : ' off'}</div></div>`;
    const headline = sk.length ? `${sk.length} setting${sk.length > 1 ? 's' : ''} suggested. Use ${sk.length > 1 ? 'them' : 'it'} or drop ${sk.length > 1 ? 'them' : 'it'}.`
      : miss.length ? (miss.length === 1 ? miss[0].text + '.' : `${miss.length} things are missing.`) : 'Everything is set. You can also change any of this by asking.';
    const groups = [];
    if(sk.length) groups.push({ title:'Suggested', rows:sk.map(k => ({ text:H(SET[k].label) + ': ' + H(SET[k].show(sg[k].value)), badge:{ text:'Suggested', kind:'amber' }, why:sg[k].why ? H(sg[k].why) : '', link:{ label:'Show it', onclick:`nlSettingsShow('${k}')` } })) });
    if(miss.length) groups.push({ title:'Missing', rows:miss.map(m => ({ text:H(m.text), badge:{ text:'Needed', kind:'amber' }, why:H(m.why), link:m.link })) });
    groups.push({ title:'Ask instead', rows:['Use 6% growth instead','Show everything in euros','Plan until age 95'].map(q => ({ text:`<span class="nl-q">“${H(q)}”</span>`, badge:{ text:'Example', kind:'steel' }, link:{ label:'Try it', onclick:`NLP.ask('${q.replace(/'/g, '')}')` } })) });
    let button = null;
    if(sk.length) button = { label:`Use ${sk.length} suggested setting${sk.length > 1 ? 's' : ''}`, onclick:'nlSettingsUseAll()' };
    else if(miss.length) button = miss[0].btn;
    return { headline, graphic, groups, button, links:[{ label:'Classic settings', short:'Classic', onclick:"nav('settings')" }] };
  }
  window.nlSettingsKey = function(){ NLP.ui(SETTINGS).tab = 'assistant'; if(state.activePanel !== SETTINGS) NLP.go(SETTINGS); else NLP.renderPage(SETTINGS); setTimeout(() => document.getElementById('nlst-key')?.focus(), 60); };
  window.nlSettingsShow = function(k){ NLP.ui(SETTINGS).tab = 'general'; if(state.activePanel !== SETTINGS) NLP.go(SETTINGS); else NLP.renderPage(SETTINGS); setTimeout(() => document.getElementById('nlst-row-' + k)?.scrollIntoView({ block:'center', behavior:'smooth' }), 60); };

  NLP.register({ panel:SETTINGS, section:'settings', label:'Settings', render:renderSettings, overview:settingsOverview });

  NLP.addTool({
    def:{ name:'suggest_setting',
      description:'Suggest a change to one of the person\'s settings. Nothing changes: it appears marked Suggested on the Settings page and the person presses "Use it".',
      input_schema:{ type:'object', properties:{
        setting:{ type:'string', enum:['currency','money_shown_as','language','growth','inflation','growth_after_retiring','life_expectancy'] },
        value:{ type:'string', description:'currency: SEK, USD, EUR or KES. money_shown_as: today or future. language: en or sv. growth / inflation / growth_after_retiring: percent a year, e.g. 6. life_expectancy: age in years.' },
        why:{ type:'string', description:'Short plain reason, quoting the person\'s words.' }
      }, required:['setting','value'], additionalProperties:false } },
    label:() => 'Preparing a setting',
    run(input){
      const map = { currency:'currency', money_shown_as:'displayMode', language:'lang', growth:'growthRate', inflation:'inflationRate', growth_after_retiring:'retirementPostGrowth', life_expectancy:'lifeExp' };
      const key = map[input.setting]; if(!key) return { error:'Unknown setting.' };
      let v = String(input.value || '').trim();
      if(key === 'currency'){ v = v.toUpperCase(); if(/EURO/.test(v)) v = 'EUR'; if(/DOLLAR/.test(v)) v = 'USD'; if(/KRONA|KRONOR/.test(v)) v = 'SEK'; if(/SHILLING/.test(v)) v = 'KES'; if(typeof CURRENCY_SYMBOLS !== 'undefined' && !CURRENCY_SYMBOLS[v]) return { error:'Currency must be SEK, USD, EUR or KES.' }; }
      else if(key === 'displayMode'){ v = /fut|nom/i.test(v) ? 'nominal' : /today|real/i.test(v) ? 'real' : ''; if(!v) return { error:'Use today or future.' }; }
      else if(key === 'lang'){ v = /^(sv|swe|sven)/i.test(v) ? 'sv' : /^(en|eng)/i.test(v) ? 'en' : ''; if(!v) return { error:'Use en or sv.' }; }
      else { const s = SET[key], n = Number(v.replace(/[^\d.]/g, '')); if(!(n >= s.min && n <= s.max)) return { error:`${s.label} must be between ${s.min} and ${s.max}.` }; v = n; }
      if(String(SET[key].get()) === String(v)) return { ok:true, note:'It is already set to that. Nothing to suggest.' };
      tui().sug[key] = { value:v, why:input.why ? String(input.why).slice(0, 200) : '' };
      if(state.activePanel === SETTINGS) NLP.renderPage(SETTINGS); else NLP.refreshPanel();
      return { ok:true, shown:SET[key].label + ': ' + SET[key].show(v), saved:false, note:state.activePanel === SETTINGS ? 'Shown as Suggested on the Settings page. The person presses Use it.' : 'Waiting on the Settings page (the gear at the top right). Tell the person to open it and press Use it.' };
    }
  });

  // ══ Replacing the classic welcome pop-ups (new look only) ════════════════
  const needsSetup = () => !state.welcomeComplete || !onboardOK();
  const closeClassicPopups = () => ['welcome-modal','onboarding-modal'].forEach(id => document.getElementById(id)?.classList.remove('open'));
  const orig = { nav:window.nav, show:window.showOnboardingBlock, welcome:window.showWelcomeModal, ok:window.onboardingComplete };
  let bypass = 0;
  if(typeof orig.ok === 'function') window.onboardingComplete = function(){ return bypass ? true : orig.ok.apply(this, arguments); };
  if(typeof orig.nav === 'function') window.nav = function(panel, opts){
    if(!NLP.isOn() || onboardOK() || panel === 'settings' || (typeof VALID_PANELS !== 'undefined' && !VALID_PANELS.includes(panel))) return orig.nav.apply(this, arguments);
    // New look, setup not done: Setup and Settings stay open; everything else waits.
    let target = panel;
    if(panel !== SETUP && panel !== SETTINGS){
      target = SETUP;
      if(state.activePanel === SETUP) NLP.toast('Choose your citizenship and home base first.', 'warn');
    }
    bypass++;
    try { return orig.nav.call(this, target, opts); } finally { bypass--; }
  };
  const toSetup = () => { closeClassicPopups(); if(state.activePanel !== SETUP && state.activePanel !== SETTINGS) setTimeout(() => { if(NLP.isOn()) nav(SETUP); }, 0); };
  if(typeof orig.show === 'function') window.showOnboardingBlock = function(){ if(NLP.isOn()){ toSetup(); return; } return orig.show.apply(this, arguments); };
  if(typeof orig.welcome === 'function') window.showWelcomeModal = function(){ if(NLP.isOn()){ toSetup(); return; } return orig.welcome.apply(this, arguments); };
  // The new look switching on or off while setup is not done.
  let wasOn = NLP.isOn();
  new MutationObserver(() => {
    const on = NLP.isOn(); if(on === wasOn) return; wasOn = on;
    if(!needsSetup()) return;
    if(on){ closeClassicPopups(); if(state.activePanel !== SETUP && state.activePanel !== SETTINGS) setTimeout(() => nav(SETUP), 0); }
    else setTimeout(() => { if(!state.welcomeComplete) orig.welcome && orig.welcome(); else if(!onboardOK()) orig.show && orig.show(); }, 30);
  }).observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
  // First load: the classic boot already opened its pop-ups before this file ran.
  if(NLP.isOn() && needsSetup()){
    closeClassicPopups();
    const want = (location.hash || '').replace(/^#/, '').split('/')[0];
    nav(want === SETTINGS ? SETTINGS : SETUP);
  }

  // ══ Styles (scoped to the two pages) ═════════════════════════════════════
  NLP.css('nl-setup-css', `
#panel-nl-setup .nls-fields, #panel-nl-settings .nls-fields { max-width:none; }
/* Wide screens: Setup's form and its chart sit side by side instead of leaving empty space. */
@media (min-width:1700px){
  #panel-nl-setup .nl-wrap { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:0 32px; align-items:start; }
  #panel-nl-setup .nl-wrap > * { grid-column:1; }
  #panel-nl-setup .nl-wrap > .nl-head { grid-column:1 / -1; }
  #panel-nl-setup .nl-wrap > .nls-chart { grid-column:2; grid-row:2 / span 8; margin-top:0; }
}
#panel-nl-setup .nl-field, #panel-nl-settings .nl-field { align-items:start; grid-template-columns:150px minmax(0,1fr) auto; }
#panel-nl-setup .nl-field > .lb, #panel-nl-settings .nl-field > .lb { padding-top:3px; }
#panel-nl-setup .nl-field > .v, #panel-nl-settings .nl-field > .v { min-width:0; }
#panel-nl-setup .nl-field > .a, #panel-nl-settings .nl-field > .a { padding-top:2px; display:flex; gap:10px; align-items:center; justify-content:flex-end; flex-wrap:wrap; }
#panel-nl-setup .nl-field select { font:500 14px var(--nl-sans); color:var(--nl-ink); cursor:pointer; max-width:340px; }
#panel-nl-setup .nl-field select.empty { color:#8A5A0A; }
#panel-nl-setup .nl-field textarea { resize:vertical; min-height:44px; line-height:1.5; font-family:var(--nl-sans); }
#panel-nl-setup .nl-field input::placeholder, #panel-nl-setup .nl-field textarea::placeholder, #panel-nl-settings .nl-field input::placeholder { color:var(--nl-detail); font-weight:400; }
#panel-nl-setup .nls-sub { margin-top:3px; font-size:13.5px; }
#panel-nl-setup .nls-sub .nl-q { font-size:14px; }
.nl-page .nls-hint { color:#8A5A0A; font-size:13px; }
#panel-nl-setup .nls-age-why { margin:8px 0 0; }
.nl-page .nls-det { font-size:13px; color:var(--nl-detail); margin-top:3px; overflow-wrap:anywhere; }
.nl-page .nls-val { font-weight:500; overflow-wrap:anywhere; }
.nl-page .nls-num { display:inline-flex; align-items:baseline; gap:6px; color:var(--nl-detail); font-size:13.5px; white-space:nowrap; }
#panel-nl-setup .nls-num .nl-num-in, #panel-nl-settings .nls-num .nl-num-in { width:56px; text-align:left; border-bottom:1px solid var(--nl-edge); }
#panel-nl-setup .nls-num .nl-num-in:focus, #panel-nl-settings .nls-num .nl-num-in:focus { border-bottom-color:var(--nl-accent); }
#panel-nl-setup .nls-pills { display:flex; flex-wrap:wrap; gap:8px; }
#panel-nl-setup .nls-chart { margin-top:18px; max-width:none; }
#panel-nl-settings .nl-field input[type=password] { max-width:360px; border-bottom:1px solid var(--nl-edge); font-family:ui-monospace,Menlo,Consolas,monospace; font-size:13px; }
#panel-nl-settings .nl-field input[type=password]:focus { border-bottom-color:var(--nl-accent); }
#panel-nl-settings .nl-field.need > .lb { color:#8A5A0A; }
#panel-nl-settings .nls-acts { display:flex; gap:12px; }
#panel-nl-settings .nls-sug { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 8px; margin-top:7px; padding:6px 10px; background:#F3FAF7; border-radius:10px; font-size:13.5px; }
#panel-nl-settings .nls-sug .nls-det { flex-basis:100%; margin:0; }
#panel-nl-settings .nls-sug-acts { display:inline-flex; gap:12px; margin-left:auto; }
.nl-side .nls-steps div { font-size:12.5px; }
`);
})();

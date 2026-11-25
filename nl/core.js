/* ══ NEW LOOK (L+S) · shared page framework ════════════════════════════════
   Loaded after the main app script. Every new page (Today, Money plan, Plans,
   Future, Notebook, Setup, Settings) registers here and renders into its own
   host <div class="panel" id="panel-nl-…">. Nothing here changes the old look:
   CSS is scoped to html.nl, and new panels only show when the new look is on.
   Design rules: docs/LS-DESIGN.md.                                          */
(function(){
  'use strict';
  const NLP = window.NLP = window.NLP || {};
  const pages = NLP._pages = {};
  const ui = NLP._ui = {};                 // per-page UI state (tab, chosen row…)

  // ── Basics ───────────────────────────────────────────────────────────────
  NLP.isOn = () => document.documentElement.classList.contains('nl');
  NLP.h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  NLP.money = v => fmt(Number(v) || 0);                 // full amount in the chosen currency
  NLP.moneyShort = v => fmtC(Number(v) || 0);           // compact (kr21K, kr1.5M)
  NLP.monthLabel = ym => { const m = /^(\d{4})-(\d{2})/.exec(ym || ''); return m ? new Date(+m[1], +m[2]-1, 1).toLocaleString('en-GB', { month:'short', year:'numeric' }) : String(ym || ''); };
  NLP.monthShort = ym => { const m = /^(\d{4})-(\d{2})/.exec(ym || ''); return m ? new Date(+m[1], +m[2]-1, 1).toLocaleString('en-GB', { month:'short' }) : ''; };
  NLP.css = (id, text) => { if(document.getElementById(id)) return; const s = document.createElement('style'); s.id = id; s.textContent = text; document.head.appendChild(s); };
  NLP.ui = panel => ui[panel] || (ui[panel] = {});
  NLP.refreshPanel = () => { if(typeof window.nlRender === 'function') window.nlRender(); };
  NLP.toast = (msg, kind, action) => { if(typeof window.nlToast === 'function') window.nlToast(msg, kind, action); };

  // ── Pages ────────────────────────────────────────────────────────────────
  // spec = { panel:'nl-today', section:'today', label:'Today', render(host), overview()? }
  // overview() returns { headline, graphic, groups:[{title, rows:[{text, badge:{text,kind}, link:{label,onclick}}]}],
  //                      button:{label,onclick}, links:[{label, short, onclick}] }   (all optional)
  NLP.SECTIONS = { today:'nl-today', money:'nl-money', plans:'nl-plans', future:'nl-future', notebook:'nl-notebook' };
  NLP.OLD_FOR = { 'nl-today':'dashboard', 'nl-money':'review', 'nl-plans':'funfund', 'nl-future':'retirement', 'nl-notebook':'journal', 'nl-setup':'settings', 'nl-settings':'settings' };
  NLP.register = function(spec){
    pages[spec.panel] = spec;
    if(typeof VALID_PANELS !== 'undefined' && !VALID_PANELS.includes(spec.panel)) VALID_PANELS.push(spec.panel);
    host(spec.panel);
    if(NLP.isOn() && typeof state !== 'undefined' && state.activePanel === spec.panel) NLP.renderPage(spec.panel);
  };
  NLP.page = panel => pages[panel] || null;
  NLP.has = panel => !!pages[panel];
  NLP.activePage = () => (typeof state !== 'undefined' && pages[state.activePanel]) || null;
  function host(panel){
    let el = document.getElementById('panel-' + panel);
    if(!el){
      const content = document.querySelector('#app .content');
      if(!content) return null;
      el = document.createElement('div'); el.className = 'panel nl-page'; el.id = 'panel-' + panel;
      content.appendChild(el);
    }
    return el;
  }
  // Draw a page. Keeps the scroll position and anything half-typed.
  NLP.renderPage = function(panel){
    const spec = pages[panel]; if(!spec || !NLP.isOn()) return;
    const el = host(panel); if(!el) return;
    const content = document.querySelector('#app .content');
    const keep = content ? content.scrollTop : 0;
    const active = document.activeElement, activeId = active && el.contains(active) ? active.id : null;
    const typed = {}; el.querySelectorAll('input[id],textarea[id],select[id]').forEach(i => { typed[i.id] = i.value; });
    try { spec.render(el); }
    catch(err){ console.warn('[nl] render failed', panel, err); el.innerHTML = `<div class="nl-empty">This page couldn’t be drawn: ${NLP.h(err.message)}</div>`; }
    Object.keys(typed).forEach(id => { const i = document.getElementById(id); if(i && el.contains(i) && i.value !== typed[id] && i.dataset.nlKeep !== 'no') i.value = typed[id]; });
    if(activeId){ const i = document.getElementById(activeId); if(i) i.focus(); }
    if(content) content.scrollTop = keep;
    NLP.refreshPanel();
  };
  NLP.rerender = () => { const p = NLP.activePage(); if(p) NLP.renderPage(p.panel); };
  NLP.go = function(panel){ if(pages[panel] && NLP.isOn()) nav(panel); else nav(NLP.OLD_FOR[panel] || panel); };
  // The page the top bar should open for a section.
  NLP.sectionTarget = sec => (NLP.isOn() && pages[NLP.SECTIONS[sec]]) ? NLP.SECTIONS[sec] : null;

  // ── Choosing rows: first press chooses, second press opens, Esc lets go ──
  // Rows need data-nl-row="<id>". onOpen(id) runs on the second press.
  NLP.rows = function(container, panel, onOpen){
    if(!container) return;
    const st = NLP.ui(panel);
    container.querySelectorAll('[data-nl-row]').forEach(r => {
      if(r.dataset.nlRow === String(st.chosen)) r.classList.add('on');
      r.setAttribute('tabindex', '0');
    });
    const act = r => {
      const id = r.dataset.nlRow;
      if(String(st.chosen) === id){ if(onOpen) onOpen(id); return; }
      st.chosen = id;
      container.querySelectorAll('[data-nl-row].on').forEach(x => x.classList.remove('on'));
      r.classList.add('on');
      NLP.refreshPanel();
    };
    container.addEventListener('click', e => {
      if(e.target.closest('a,button,input,select,textarea,label')) return;
      const r = e.target.closest('[data-nl-row]'); if(r && container.contains(r)) act(r);
    });
    container.addEventListener('keydown', e => {
      const r = e.target.closest('[data-nl-row]'); if(!r) return;
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); act(r); }
    });
  };
  NLP.chosen = panel => NLP.ui(panel).chosen ?? null;
  NLP.choose = (panel, id) => { NLP.ui(panel).chosen = id; NLP.rerender(); };
  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape' || e.nlDone || !NLP.isOn()) return;
    if(typeof window.nlFace === 'function' && window.nlFace() === 'chat') return;
    const p = NLP.activePage(); if(!p) return;
    const st = NLP.ui(p.panel);
    if(st.open != null){ st.open = null; e.nlDone = true; NLP.rerender(); return; }
    if(st.chosen != null){ st.chosen = null; e.nlDone = true; NLP.rerender(); }
  });

  // ── Building blocks (HTML strings) ───────────────────────────────────────
  const H = NLP.h;
  // Head row: title · tabs with counts · actions at the right.
  NLP.head = function({ title, tabs, actions, panel }){
    const t = (tabs || []).filter(x => x.on || x.count == null || x.count !== 0 || x.keep);
    return `<div class="nl-head"><h1 class="nl-title">${H(title)}</h1>${t.length ? `<div class="nl-tabs-row" role="tablist">${t.map(x => `<button type="button" role="tab" class="nl-tab${x.on ? ' on' : ''}${x.filter ? ' filt' : ''}" aria-selected="${!!x.on}" ${x.onclick ? `onclick="${H(x.onclick)}"` : (panel ? `onclick="NLP.tab('${panel}','${x.key}')"` : '')}>${H(x.label)}${x.count != null ? `<i>${H(x.count)}</i>` : ''}</button>`).join('')}</div>` : ''}${actions ? `<div class="nl-acts">${actions}</div>` : ''}</div>`;
  };
  NLP.tab = (panel, key) => { const st = NLP.ui(panel); st.tab = key; st.chosen = null; st.open = null; NLP.renderPage(panel); };
  NLP.tabOf = (panel, dflt) => NLP.ui(panel).tab || dflt;
  NLP.badge = (text, kind) => `<span class="nl-b ${kind || 'grey'}">${H(text)}</span>`;
  NLP.pill = (label, onclick, attrs) => `<button type="button" class="nl-gp" onclick="${H(onclick)}" ${attrs || ''}>${H(label)}</button>`;
  NLP.blackBtn = (label, onclick, disabledWhy) => disabledWhy
    ? `<button type="button" class="nl-black" disabled title="${H(disabledWhy)}">${H(label)}</button><p class="nl-note">${H(disabledWhy)}</p>`
    : `<button type="button" class="nl-black" onclick="${H(onclick)}">${H(label)}</button>`;
  NLP.link = (label, onclick) => `<button type="button" class="nl-link" onclick="${H(onclick)}">${H(label)}</button>`;
  NLP.quote = text => `<span class="nl-q">“${H(text)}”</span>`;
  NLP.card = (title, sub, body) => `<section class="nl-cc">${title ? `<h2 class="nl-ct">${H(title)}</h2>` : ''}${sub ? `<p class="nl-cs">${H(sub)}</p>` : ''}${body}</section>`;
  NLP.legend = items => `<div class="nl-legend">${items.map(i => `<span><i class="${i.dash ? 'dash' : ''}" style="${i.dash ? '' : 'background:' + i.color}"></i>${H(i.label)}</span>`).join('')}</div>`;
  NLP.empty = (text, actionHtml) => `<div class="nl-empty"><p>${H(text)}</p>${actionHtml || ''}</div>`;
  NLP.counts = items => `<div class="nl-counts">${items.map(i => `<div class="${i.kind || ''}"><b>${H(i.value)}</b>${H(i.label)}</div>`).join('')}</div>`;
  NLP.minibars = (values, labels) => { const mx = Math.max(1, ...values.map(v => Math.abs(v))); return `<div class="nl-minibars">${values.map(v => v < 0 ? '<i class="neg" title="below zero"></i>' : `<i style="height:${Math.max(3, Math.round(v / mx * 100))}%"></i>`).join('')}</div>${labels ? `<div class="nl-mbl"><span>${H(labels[0])}</span><span>${H(labels[1])}</span></div>` : ''}`; };

  // ── Charts: SVG drawn at real size, redrawn when the box changes size ─────
  // NLP.chart({ w, h, x:[min,max], y:[min,max], pad, xt:[[v,label]], yt:[[v,label]], label, draw:(k)=>svg })
  NLP.chart = function(o){
    const w = Math.max(80, o.w), hgt = Math.max(60, o.h), p = Object.assign({ l:48, r:16, t:14, b:24 }, o.pad || {});
    const span = (a) => (a[1] - a[0]) || 1;
    const sx = v => p.l + (v - o.x[0]) / span(o.x) * (w - p.l - p.r);
    const sy = v => hgt - p.b - (v - o.y[0]) / span(o.y) * (hgt - p.t - p.b);
    const line = pts => pts.map((q, i) => (i ? 'L' : 'M') + sx(q[0]).toFixed(1) + ' ' + sy(q[1]).toFixed(1)).join('');
    const area = (pts, y0) => pts.length ? line(pts) + `L${sx(pts[pts.length-1][0]).toFixed(1)} ${sy(y0).toFixed(1)}L${sx(pts[0][0]).toFixed(1)} ${sy(y0).toFixed(1)}Z` : '';
    let g = (o.yt || []).map(t => `<line class="gl" x1="${p.l}" x2="${w - p.r}" y1="${sy(t[0]).toFixed(1)}" y2="${sy(t[0]).toFixed(1)}"/><text x="${p.l - 6}" y="${(sy(t[0]) + 4).toFixed(1)}" text-anchor="end">${H(t[1])}</text>`).join('');
    g += (o.xt || []).map(t => `<text x="${sx(t[0]).toFixed(1)}" y="${hgt - 6}" text-anchor="middle">${H(t[1])}</text>`).join('');
    return `<svg class="nl-svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" role="img" aria-label="${H(o.label || 'chart')}">${g}${o.draw({ sx, sy, line, area, w, h:hgt, p })}</svg>`;
  };
  // Round tick values for an axis 0…max (or min…max).
  NLP.ticks = function(min, max, count, fmtFn){
    const span = Math.max(1, max - min), raw = span / Math.max(1, count || 4);
    const mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
    for(let v = lo; v <= hi + step / 2; v += step) out.push([v, fmtFn ? fmtFn(v) : String(v)]);
    return { min:lo, max:hi, ticks:out };
  };
  // Mount a chart box: draw(w,h) → svg string. Redraws on resize.
  const observers = new WeakMap();
  NLP.mountCharts = function(root){
    (root || document).querySelectorAll('[data-nl-chart]').forEach(box => {
      const fn = NLP._chartFns[box.dataset.nlChart]; if(!fn) return;
      const draw = () => { const w = box.clientWidth, hh = box.clientHeight; if(w < 40) return; try { box.innerHTML = fn(w, hh); } catch(err){ console.warn('[nl] chart', err); box.innerHTML = ''; } };
      draw();
      if(!observers.has(box) && window.ResizeObserver){ const ro = new ResizeObserver(() => draw()); ro.observe(box); observers.set(box, ro); }
    });
  };
  NLP._chartFns = {};
  let chartSeq = 0;
  // Returns a placeholder; call NLP.mountCharts(host) after inserting HTML.
  NLP.chartBox = (fn, height, label) => { const id = 'c' + (++chartSeq); NLP._chartFns[id] = fn; return `<div class="nl-chart" data-nl-chart="${id}" style="height:${height || 220}px" role="img" aria-label="${H(label || 'chart')}"></div>`; };

  // ── What-if: compute on a temporary copy of the plan, then put it back ────
  const WHATIF_FIELDS = ['baseIncome','baseExpenses','baseSavings','monthlyOverrides','yearlyBases','trips','externalAssets','retirementExpenses','retirementScenario','retirementAge','currentAge','growthRate','inflationRate','retirementPostGrowth','lifeExp'];
  // NOTE: afterwards the listed state fields hold fresh copies — look objects up again
  // (e.g. by id) instead of keeping references taken before calling whatIf.
  NLP.whatIf = function(mutate, compute){
    const keep = {}; WHATIF_FIELDS.forEach(f => { keep[f] = state[f] === undefined ? undefined : JSON.parse(JSON.stringify(state[f])); });
    let out;
    try { mutate(state); if(typeof invalidateSelectors === 'function') invalidateSelectors(); out = compute(); }
    finally {
      WHATIF_FIELDS.forEach(f => { if(keep[f] === undefined) delete state[f]; else state[f] = keep[f]; });
      if(typeof invalidateSelectors === 'function') invalidateSelectors();
    }
    return out;
  };

  // ── The assistant, from pages ────────────────────────────────────────────
  NLP.pending = () => (typeof window.nlPendingProposal === 'function' && window.nlPendingProposal()) || null;
  NLP.pendingChanges = () => { const p = NLP.pending(); return p ? p.changes.filter(c => !c.dropped) : []; };
  // Prepare changes from a page (same rules as the assistant). Returns {ok}|{error}.
  NLP.propose = (summary, changes) => (typeof window.nlProposeFromApp === 'function') ? window.nlProposeFromApp(summary, changes) : { error:'not ready' };
  // A change the person makes directly on a page: saved at once, listed in History, undoable.
  NLP.record = (label, mutate) => (typeof window.nlRecordChange === 'function') ? window.nlRecordChange(label, mutate) : (mutate(), save());
  NLP.ask = text => { if(typeof window.nlAsk === 'function') window.nlAsk(text); };
  // Extra assistant tools a page can add: { def:{name,description,input_schema}, run(input)→object, label(input)→string }
  window.NL_EXTRA_TOOLS = window.NL_EXTRA_TOOLS || [];
  window.NL_EXTRA_SYSTEM = window.NL_EXTRA_SYSTEM || [];
  window.NL_MD_HOOKS = window.NL_MD_HOOKS || [];
  NLP.addTool = t => { window.NL_EXTRA_TOOLS.push(t); };
  NLP.addSystem = s => { window.NL_EXTRA_SYSTEM.push(s); };
  NLP.addMdHook = f => { window.NL_MD_HOOKS.push(f); };

  // The side panel's Overview asks the open page for its summary.
  window.nlPageOverview = function(){
    const p = NLP.activePage(); if(!p || !p.overview || !NLP.isOn()) return null;
    try { return p.overview() || null; } catch(err){ console.warn('[nl] overview', err); return null; }
  };

  // ── Wiring into the app ──────────────────────────────────────────────────
  if(typeof bus !== 'undefined'){
    bus.on('panel:changed', ({ panel }) => {
      if(!pages[panel]) return;
      if(!NLP.isOn()){ setTimeout(() => nav(NLP.OLD_FOR[panel] || 'dashboard'), 0); return; }
      NLP.renderPage(panel);
      setTimeout(() => NLP.mountCharts(document.getElementById('panel-' + panel)), 0);
    });
    let t = null;
    bus.on('state:changed', () => { clearTimeout(t); t = setTimeout(() => { if(NLP.isOn() && !NLP._busy) NLP.rerender(); }, 60); });
  }
  // Re-mount charts after every page draw.
  const _render = NLP.renderPage;
  NLP.renderPage = function(panel){ _render(panel); NLP.mountCharts(document.getElementById('panel-' + panel)); };
  // Turning the new look on/off while a new page is open.
  new MutationObserver(() => {
    if(typeof state === 'undefined') return;
    if(!NLP.isOn() && pages[state.activePanel]) nav(NLP.OLD_FOR[state.activePanel] || 'dashboard');
  }).observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
  // A reload on a new page (#nl-…): land on it once the pages have registered.
  NLP.boot = function(){
    const want = (location.hash || '').replace(/^#/, '').split('/')[0];
    if(NLP.isOn() && pages[want] && state.activePanel !== want) nav(want);
    else if(NLP.isOn() && pages[state.activePanel]) NLP.renderPage(state.activePanel);
  };

  // ── Shared styles (scoped to the new look) ───────────────────────────────
  NLP.css('nl-core-css', `
html.nl .content { background:var(--nl-ground); }
html.nl .panel.nl-page { max-width:none; padding:0; margin:0; background:var(--nl-surface); min-height:100%; color:var(--nl-ink); font:14px/1.5 var(--nl-sans); animation:none; }
html.nl .panel.nl-page.active { display:block; }
.nl-page * { box-sizing:border-box; }
.nl-page .nl-wrap { padding:18px 24px 40px; max-width:1240px; }
.nl-head { display:flex; align-items:flex-end; gap:24px; border-bottom:1px solid var(--nl-line); margin-bottom:14px; min-width:0; }
.nl-title { font:600 26px/1.2 var(--nl-serif); margin:0; padding-bottom:10px; white-space:nowrap; letter-spacing:-.01em; color:var(--nl-ink); }
.nl-tabs-row { display:flex; gap:20px; min-width:0; overflow-x:auto; scrollbar-width:none; }
.nl-tabs-row::-webkit-scrollbar { display:none; }
.nl-tab { border:0; border-bottom:2px solid transparent; background:transparent; padding:0 0 11px; font:400 14px var(--nl-sans); color:var(--nl-detail); cursor:pointer; white-space:nowrap; }
.nl-tab i { font-style:normal; margin-left:5px; color:var(--nl-detail); font-variant-numeric:tabular-nums; }
.nl-tab:hover { color:var(--nl-ink); }
.nl-tab.on { color:var(--nl-ink); border-color:var(--nl-ink); font-weight:500; }
.nl-tab.filt, .nl-tab.filt i { color:var(--nl-accent); }
.nl-acts { margin-left:auto; display:flex; gap:8px; padding-bottom:8px; flex-shrink:0; }
.nl-gp { border:0; background:var(--nl-pill); color:var(--nl-ink); border-radius:999px; padding:6px 13px; font:500 13px var(--nl-sans); cursor:pointer; white-space:nowrap; }
.nl-gp:hover { background:var(--nl-chosen); }
.nl-gp[aria-pressed="true"], .nl-gp.on { background:var(--nl-ink); color:#fff; }
.nl-seg { display:inline-flex; background:var(--nl-pill); border-radius:999px; padding:3px; gap:2px; }
.nl-seg button { border:0; background:transparent; border-radius:999px; padding:5px 12px; font:500 13px var(--nl-sans); color:var(--nl-quiet); cursor:pointer; white-space:nowrap; }
.nl-seg button[aria-pressed="true"] { background:var(--nl-surface); color:var(--nl-ink); box-shadow:0 1px 2px rgba(0,0,0,.08); }
.nl-chips { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 10px; }
.nl-chip { border:1px dashed var(--nl-edge); background:transparent; border-radius:999px; padding:3px 11px; font:400 13px var(--nl-sans); color:var(--nl-quiet); cursor:pointer; white-space:nowrap; }
.nl-chip.on { border:1px solid transparent; background:var(--nl-chosen); color:var(--nl-accent); font-weight:500; }
.nl-b { display:inline-block; padding:2px 9px; border-radius:999px; font:500 12.5px/1.5 var(--nl-sans); white-space:nowrap; }
.nl-b.amber { background:#FBEEDB; color:#8A5A0A; } .nl-b.green { background:#DFF2E7; color:#1F4D3B; } .nl-b.ruby { background:#FBE5E3; color:#8F2A22; } .nl-b.steel { background:#E6ECF6; color:#48639A; } .nl-b.grey { background:var(--nl-pill); color:var(--nl-quiet); }
.nl-tbl-wrap { overflow-x:auto; }
table.nl-tbl { width:100%; border-collapse:collapse; font-size:14px; }
table.nl-tbl th { font:500 12.5px var(--nl-sans); color:var(--nl-detail); text-align:left; padding:7px 8px; border-bottom:1px solid var(--nl-line); white-space:nowrap; }
table.nl-tbl td { padding:9px 8px; border-bottom:1px solid var(--nl-line); vertical-align:top; }
table.nl-tbl .r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
table.nl-tbl .mk { width:28px; color:var(--nl-detail); font-size:12.5px; font-variant-numeric:tabular-nums; }
table.nl-tbl .nm { font-weight:600; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; }
table.nl-tbl .sub { display:block; font-size:13px; color:var(--nl-detail); margin-top:1px; overflow-wrap:anywhere; }
table.nl-tbl tbody tr[data-nl-row] { cursor:pointer; }
table.nl-tbl tbody tr[data-nl-row]:hover td { background:#EEF8F4; }
table.nl-tbl tbody tr.on td { background:var(--nl-chosen); }
table.nl-tbl tbody tr.sug td { background:#F3FAF7; }
table.nl-tbl tbody tr:focus-visible { outline:2px solid var(--nl-accent); outline-offset:-2px; }
.nl-was { color:var(--nl-detail); text-decoration:line-through; margin-right:6px; }
.nl-inrow { display:flex; gap:12px; margin-top:5px; font-size:13px; flex-wrap:wrap; }
.nl-q { font-family:var(--nl-serif); font-style:italic; color:var(--nl-quiet); }
.nl-cc { border:1px solid var(--nl-line); border-radius:10px; padding:14px 16px 10px; margin:0 0 12px; background:var(--nl-surface); min-width:0; }
.nl-ct { font:600 16px/1.3 var(--nl-serif); margin:0; color:var(--nl-ink); }
.nl-cs { font-size:12.5px; color:var(--nl-detail); margin:2px 0 6px; }
.nl-chart { position:relative; width:100%; overflow:hidden; }
.nl-chart svg { display:block; }
svg.nl-svg text { font:11.5px var(--nl-sans); fill:var(--nl-detail); }
svg.nl-svg text.lab { fill:var(--nl-ink); font-weight:500; paint-order:stroke; stroke:#fff; stroke-width:4px; stroke-linejoin:round; }
svg.nl-svg .gl { stroke:var(--nl-line); stroke-width:1; }
.nl-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:12.5px; color:var(--nl-detail); margin-top:4px; }
.nl-legend i { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:5px; vertical-align:-1px; }
.nl-legend i.dash { height:0; width:14px; border-top:2px dashed #48639A; border-radius:0; vertical-align:3px; }
.nl-fcards { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:0 0 12px; }
.nl-fcards > div { border:1px solid var(--nl-line); border-radius:10px; padding:10px 14px; min-width:0; }
.nl-fcards span { display:block; font-size:12.5px; color:var(--nl-detail); }
.nl-fcards b { display:block; font-size:17px; font-weight:600; margin:2px 0 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.nl-two { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:12px; }
@media (max-width:1100px){ .nl-two { grid-template-columns:minmax(0,1fr); } }
.nl-empty { padding:28px 16px; text-align:center; color:var(--nl-detail); }
.nl-empty p { margin:0 0 10px; }
.nl-minibars { display:flex; gap:4px; align-items:flex-end; height:46px; }
.nl-minibars i { flex:1; background:var(--nl-accent); opacity:.75; border-radius:2px 2px 0 0; }
.nl-minibars i.neg { background:#8F2A22; height:6px; align-self:flex-start; margin-top:40px; }
.nl-mbl { display:flex; justify-content:space-between; font-size:11.5px; color:var(--nl-detail); margin-top:3px; }
.nl-field { display:grid; grid-template-columns:170px minmax(0,1fr) auto; gap:12px; align-items:baseline; padding:11px 0; border-bottom:1px solid var(--nl-line); }
.nl-field > .lb { color:var(--nl-detail); font-size:13.5px; }
.nl-field input[type=text], .nl-field input[type=number], .nl-field input[type=password], .nl-field input[type=email], .nl-field select, .nl-field textarea { border:0; border-bottom:1px solid transparent; background:transparent; font:500 14px var(--nl-sans); color:var(--nl-ink); padding:2px 0; width:100%; outline:0; }
.nl-field input:focus, .nl-field select:focus, .nl-field textarea:focus { border-bottom-color:var(--nl-accent); }
.nl-field.need > .lb::after { content:' · needed'; color:#8A5A0A; }
.nl-page input.nl-num-in, .nl-num-in { border:0; border-bottom:1px solid var(--nl-edge); background:transparent; font:500 14px var(--nl-sans); color:var(--nl-ink); width:110px; text-align:right; padding:2px 0; font-variant-numeric:tabular-nums; outline:0; }
.nl-page input.nl-num-in:focus, .nl-num-in:focus { border-bottom-color:var(--nl-accent); }
.nl-page .nl-link, .nl-side .nl-link { border:0; background:transparent; padding:0; font:400 13px/1.5 var(--nl-sans); color:var(--nl-accent); text-decoration:underline; text-underline-offset:2px; cursor:pointer; white-space:nowrap; }
.nl-page .nl-black { border:0; background:var(--nl-black); color:#fff; border-radius:999px; padding:9px 16px; font:600 14px var(--nl-sans); cursor:pointer; white-space:nowrap; }
.nl-page .nl-black:disabled { background:#C9CED8; cursor:default; }
.nl-page .nl-note { font-size:12.5px; color:var(--nl-detail); margin:4px 0 0; }
.nl-page :focus-visible { outline:2px solid var(--nl-accent); outline-offset:2px; }
.nl-sheet-page { background:var(--nl-ground); padding:18px; }
.nl-paper { background:#fff; border:1px solid var(--nl-line); padding:26px 34px; font:15px/1.65 var(--nl-serif); color:var(--nl-ink); max-width:720px; margin:0 auto; }
.nl-paper mark { background:#FFF1C9; color:inherit; padding:1px 2px; }
.nl-cite { display:inline-block; font:500 11px/1.5 var(--nl-sans); font-style:normal; background:#E6ECF6; color:#48639A; border-radius:999px; padding:0 6px; margin-left:3px; vertical-align:1px; white-space:nowrap; cursor:pointer; border:0; }
`);
})();

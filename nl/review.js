/* ══ NEW LOOK (L+S) · Today → Full review ═══════════════════════════════════
   Replaces the classic "AI Financial Analysis". Picked: the Legora + Stripe way.
   One calm list in three groups (Going well · Needs care · Do next). Every
   finding quotes the numbers it comes from and names the page they live on;
   "Do next" rows prepare a change (applied with one press) or open the place.
   The findings and their numbers are worked out from the plan itself, so they
   are always exact. With a Claude key, "Write a new one" lets the assistant
   word them more richly — using only those numbers. Saved copies go to
   Notebook → Reports (state.vault).                                         */
(function(){
  'use strict';
  if(!window.NLP) return;
  const NLP = window.NLP, H = NLP.h, P = 'nl-today';
  const num = v => Number(v) || 0;
  const M = v => NLP.money(v);
  const pct = v => Math.round(v) + '%';
  const st = () => NLP.ui(P);
  const PAGES = {
    'runway':['nl-future','runway','Future · Runway'], 'accounts':['nl-future','accounts','Future · Accounts'], 'wall':['nl-future','wall','Future · Life wall'],
    'plan':['nl-money','plan','Money plan · Plan'], 'forecast':['nl-money','forecast','Money plan · Forecast'], 'years':['nl-money','years','Money plan · Years ahead'],
    'trips':['nl-plans','trips','Plans · Trips'], 'places':['nl-plans','places','Plans · Places to retire'], 'setup':['nl-setup',null,'Setup'],
  };
  const openPage = k => { const p = PAGES[k]; if(!p) return; if(p[1]) NLP.ui(p[0]).tab = p[1]; NLP.go(p[0]); };
  const dateWords = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); };

  // ── The facts, straight from the plan ──────────────────────────────────
  function facts(m){
    const r = m.life || {}, L = num(state.lifeExp) || 90, ret = num(state.retirementAge), cur = num(state.currentAge);
    const cm = (m.months || [])[0] || {};
    const pens = (typeof getPensionAssets === 'function' ? getPensionAssets() : []) || [];
    const penMonthly = pens.reduce((s, p) => s + num(p.monthlyPayout), 0);
    const penStart = pens.length ? Math.min(...pens.map(p => num(p.startAge) || ret)) : null;
    const retLines = (state.retirementExpenses || []).filter(l => num(l.amount) > 0);
    const retSpend = retLines.reduce((s, l) => s + num(l.amount), 0);
    const travel = retLines.filter(l => /travel|trip|holiday|vacation/i.test(l.name || '')).reduce((s, l) => s + num(l.amount), 0);
    const atRet = (r.pts || []).reduce((b, p) => Math.abs(p[0] - ret) < Math.abs(b[0] - ret) ? p : b, (r.pts || [[0, 0]])[0]);
    const atEnd = (r.pts || [])[(r.pts || []).length - 1] || [L, 0];
    const incomeM = m.ti12 / 12, leftAvg = (m.months || []).reduce((s, x) => s + num(x.pureFunFund), 0) / Math.max(1, (m.months || []).length);
    const lowTrip = (m.trips || []).slice().sort((a, b) => b.amount - a.amount)[0] || null;
    return {
      cur, ret, L, coverage:Math.min(100, num(r.coverage)), runout:r.runout || null, verdictKey:r.verdictKey,
      savePct:m.savePct, saveNow:num(cm.savings), saveBase:num(state.baseSavings), monthKey:cm.key, monthWords:cm.key ? NLP.monthLabel(cm.key) : 'this month',
      shortMonths:(m.short || []).map(x => x.key), tripCause:!!m.tripCause, bigTrip:lowTrip,
      pensions:pens.length, penMonthly, penStart, penGap:penStart != null && penStart > ret ? penStart - ret : 0,
      retSpend, penShare:retSpend > 0 ? penMonthly / retSpend * 100 : 0, travel, travelShare:retSpend > 0 ? travel / retSpend * 100 : 0,
      atRet:atRet ? atRet[1] : 0, atEnd:atEnd[1], incomeM, leftAvg, leftShare:incomeM > 0 ? leftAvg / incomeM * 100 : 0,
      bricks:(m.bricks || []).length, green:m.green, amber:m.amber, red:m.red,
    };
  }

  // ── The findings (exact, from the facts) ───────────────────────────────
  function findings(f){
    const out = [], add = o => out.push(Object.assign({ id:'f' + out.length }, o));
    // Going well
    if(f.coverage >= 100) add({ g:'well', title:'Retirement is fully covered', quote:`${pct(f.coverage)} of your retirement years are covered, to age ${f.L}`, page:'runway', fig:pct(f.coverage), badge:['Going well','green'] });
    if(!f.runout || f.runout >= f.L) add({ g:'well', title:`Your money lasts past ${f.L}`, quote:`About ${M(f.atRet)} at ${f.ret}, still ${M(f.atEnd)} at ${f.L}`, page:'runway', fig:NLP.moneyShort(f.atEnd), badge:['Going well','green'] });
    if(f.savePct >= 15) add({ g:'well', title:`You save ${pct(f.savePct)} of your income`, quote:`Over the next 12 months, ${pct(f.savePct)} of what comes in is saved`, page:'forecast', fig:pct(f.savePct), badge:['Going well','green'] });
    if(f.pensions && f.penShare >= 40) add({ g:'well', title:'Pensions carry a big part of retirement', quote:`${M(f.penMonthly)} a month from pensions, about ${pct(f.penShare)} of your planned retirement spending`, page:'accounts', fig:pct(f.penShare), badge:['Going well','green'] });
    if(f.bricks && f.green / f.bricks >= 0.85) add({ g:'well', title:`${f.green} of ${f.bricks} life-wall bricks hold`, quote:f.red ? `${f.red} red, ${f.amber} amber` : `No red bricks${f.amber ? `; ${f.amber} amber` : ''}`, page:'wall', fig:`${f.green}/${f.bricks}`, badge:['Going well','green'] });
    if(!f.shortMonths.length && f.bigTrip) add({ g:'well', title:'This year’s trips fit the Fun Fund', quote:`${f.bigTrip.trip} and the others are paid without going below zero`, page:'trips', fig:'Fits', badge:['Going well','green'] });
    // Needs care
    if(f.saveBase > 0 && f.saveNow === 0) add({ g:'care', title:`Saving is paused in ${f.monthWords}`, short:'Saving is paused this month', quote:`Saving this month: ${M(0)}; your plan saves ${M(f.saveBase)} a month`, page:'plan', fig:M(0), badge:['Needs you','ruby'] });
    if(f.runout && f.runout < f.L) add({ g:'care', title:`Your money runs out at ${f.runout}`, quote:`That is ${f.L - f.runout} years before ${f.L}`, page:'runway', fig:String(f.runout), badge:['Needs you','ruby'] });
    if(f.shortMonths.length) add({ g:'care', title:`${f.shortMonths.length} of the next 12 months run short`, quote:`Short: ${f.shortMonths.slice(0, 4).map(k => NLP.monthShort(k)).join(', ')}${f.shortMonths.length > 4 ? '…' : ''}${f.tripCause ? '; trips cause it' : ''}`, page:'forecast', fig:String(f.shortMonths.length), badge:['Concern','amber'] });
    if(f.penGap > 0) add({ g:'care', title:`A ${f.penGap}-year gap before pensions start`, quote:`You retire at ${f.ret}; pensions start at ${f.penStart}. Savings carry those years alone`, page:'runway', fig:`${f.penGap} yr`, badge:['Concern','amber'] });
    if(!f.pensions) add({ g:'care', title:'No pension is counted yet', quote:'Your retirement counts only savings and investments', page:'accounts', fig:'None', badge:['Missing','amber'] });
    if(f.incomeM > 0 && f.leftShare < 3) add({ g:'care', title:'Little is left over each month', short:'Little is left over each month', quote:`On average ${M(Math.max(0, f.leftAvg))} a month is left for fun, ${pct(Math.max(0, f.leftShare))} of income`, page:'forecast', fig:M(Math.max(0, f.leftAvg)), badge:['Concern','amber'] });
    if(f.travelShare >= 30) add({ g:'care', title:`Travel is ${pct(f.travelShare)} of retirement spending`, quote:`${M(f.travel)} of ${M(f.retSpend)} a month you plan to spend`, page:'runway', fig:pct(f.travelShare), badge:['Worth a look','steel'] });
    // Do next
    if(f.saveBase > 0 && f.saveNow === 0 && f.monthKey) add({ g:'do', title:`Restart saving ${M(f.saveBase)} in ${f.monthWords}`, short:'Restart your monthly saving', quote:'Every month without saving is growth you don’t get back', fig:M(f.saveBase), badge:['Ready to prepare','amber'],
      act:{ type:'prepare', label:'Prepare this change', summary:`Restart saving ${M(f.saveBase)} in ${f.monthWords}.`, changes:[{ kind:'set_savings', where:'month', month:f.monthKey, amount:f.saveBase, why:'Your plan saves this every month; this month it was paused.' }] } });
    if(f.shortMonths.length) add({ g:'do', title:`Fix ${NLP.monthLabel(f.shortMonths[0])}`, quote:'Money plan shows why it is short and prepares a fix', fig:'', badge:['Do next','grey'], act:{ type:'open', label:'See the short months', page:'forecast' } });
    if(f.tripCause && f.bigTrip) add({ g:'do', title:`Make ${f.bigTrip.trip} fit`, quote:'Plans shows ways to move or spread its cost', fig:'', badge:['Do next','grey'], act:{ type:'open', label:'See ways to make it fit', page:'trips' } });
    if(f.penGap > 0) add({ g:'do', title:`Plan for ages ${f.ret}–${f.penStart}`, quote:'Keep enough in lower-risk savings for the years before pensions', fig:'', badge:['Do next','grey'], act:{ type:'ask', label:'Ask Horizon how', text:`How should I cover the ${f.penGap} years between retiring at ${f.ret} and my pensions starting at ${f.penStart}?` } });
    if(!f.pensions) add({ g:'do', title:'Add your pension', quote:'A pension lowers what you take from savings each year', fig:'', badge:['Do next','grey'], act:{ type:'open', label:'Add it in Future', page:'accounts' } });
    if(f.runout && f.runout < f.L) add({ g:'do', title:`Make your money last to ${f.L}`, quote:'Try saving more, retiring later, or spending less, as dashed lines first', fig:'', badge:['Do next','grey'], act:{ type:'ask', label:'Ask Horizon how', text:`My money runs out at ${f.runout}. What are my best options to make it last to ${f.L}?` } });
    add({ g:'do', title:'Test the Lean plan', quote:'See whether a leaner retirement still covers everything', fig:'', badge:['Do next','grey'], act:{ type:'open', label:'Open Runway', page:'runway' } });
    return out;
  }
  function headlineFor(f, list){
    const care = list.filter(x => x.g === 'care');
    const strength = f.coverage >= 100 && (!f.runout || f.runout >= f.L) ? 'A strong plan' : f.coverage >= 90 ? 'A workable plan' : 'A plan that needs work';
    if(!care.length) return `${strength}. Nothing needs care right now.`;
    const words = care.slice(0, 2).map(x => x.title.charAt(0).toLowerCase() + x.title.slice(1));
    return `${strength}. ${care.length === 1 ? 'One thing needs' : care.length + ' things need'} care: ${words.join(', and ')}${care.length > 2 ? ', and more' : ''}.`;
  }

  // ── Keeping a review ───────────────────────────────────────────────────
  // A review worded by the assistant is kept as written (dated). Otherwise the
  // review is worked out fresh from the plan every time, so it is always current.
  let live = null;
  function current(){ return state.nlReview && state.nlReview.ai && Array.isArray(state.nlReview.findings) ? state.nlReview : live; }
  function writeLocal(m){
    const f = facts(m), list = findings(f);
    live = { at:new Date().toISOString(), by:'Horizon', ai:false, headline:headlineFor(f, list), findings:list, coverage:f.coverage };
    return live;
  }
  const review = m => (state.nlReview && state.nlReview.ai && Array.isArray(state.nlReview.findings)) ? state.nlReview : writeLocal(m);
  let busy = false;
  // With a Claude key: the assistant rewords the same findings (same ids, same numbers).
  async function writeWithAI(m){
    const key = state.aiKeys && state.aiKeys.claude;
    const base = JSON.parse(JSON.stringify(writeLocal(m)));
    if(!key || typeof _aiChatRequest !== 'function'){ state.nlReview = null; save(); NLP.toast('Your review is up to date with your plan. Add a Claude key in Settings to have the assistant word it.'); return base; }
    busy = true; NLP.renderPage(P);
    try {
      const f = facts(m);
      const tool = { name:'write_review', description:'Return the reworded review.', input_schema:{ type:'object', additionalProperties:false, required:['headline','findings'], properties:{
        headline:{ type:'string', description:'One plain sentence: how the plan stands and what needs the person.' },
        findings:{ type:'array', items:{ type:'object', additionalProperties:false, required:['id','title','quote'], properties:{ id:{ type:'string' }, title:{ type:'string', description:'Short plain title, under 60 characters.' }, quote:{ type:'string', description:'One plain sentence with the exact figures from the facts.' } } } } } } };
      const prompt = `You are Horizon, writing a person's full financial review in plain, simple English for a non-expert.\nFACTS (exact; amounts already in the person's currency where shown):\n${JSON.stringify(f)}\nDRAFT FINDINGS (keep every id; you may reword title and quote, never change, invent or round a number differently):\n${JSON.stringify(base.findings.map(x => ({ id:x.id, group:x.g, title:x.title, quote:x.quote })))}\nRules: use only numbers that appear in the facts or the draft; keep each quote to one sentence; no advice beyond the draft's next steps; no prices of using the assistant. Call write_review.`;
      const body = { model:AI_CHAT_MODEL, max_tokens:4000, tools:[tool], tool_choice:{ type:'tool', name:'write_review' }, messages:[{ role:'user', content:prompt }] };
      const res = await _aiChatRequest(key, body, false);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      const call = (d.content || []).find(b => b.type === 'tool_use');
      const out = call && call.input;
      if(out && Array.isArray(out.findings)){
        const byId = Object.fromEntries(out.findings.map(x => [x.id, x]));
        base.findings.forEach(x => { const y = byId[x.id]; if(y){ if(y.title) x.title = String(y.title).slice(0, 90); if(y.quote) x.quote = String(y.quote).slice(0, 260); } });
        if(out.headline) base.headline = String(out.headline).slice(0, 220);
        base.ai = true; base.at = new Date().toISOString(); state.nlReview = base; save();
      }
    } catch(err){ NLP.toast('The assistant couldn’t reword it, so Horizon wrote it from your numbers.', 'warn'); }
    busy = false;
    return base;
  }
  function saveToNotebook(){
    const r = current(); if(!r) return;
    const groups = [['well','Going well'],['care','Needs care'],['do','Do next']];
    const md = `# Full review\n\n${r.headline}\n\n` + groups.map(([g, t]) => `## ${t}\n\n` + r.findings.filter(x => x.g === g).map(x => `- **${x.title}** — ${x.quote}${x.page && PAGES[x.page] ? ` (${PAGES[x.page][2]})` : ''}`).join('\n')).join('\n\n');
    if(!Array.isArray(state.vault)) state.vault = [];
    const id = 'rv' + Date.now().toString(36);
    state.vault.unshift({ id, type:'analysis', category:'full-review', title:'Full review · ' + new Date(r.at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }), generatedAt:Date.parse(r.at) || Date.now(), markdown:md });
    if(typeof saveVault === 'function') saveVault(); save();
    NLP.toast('Saved to Notebook → Reports', '', { label:'Undo', fn:() => { state.vault = state.vault.filter(v => v.id !== id); if(typeof saveVault === 'function') saveVault(); save(); } });
  }

  // ── Acting on a finding ────────────────────────────────────────────────
  function act(id){
    const r = current(), x = r && r.findings.find(q => q.id === id); if(!x) return;
    if(!x.act){ if(x.page) openPage(x.page); return; }
    if(x.act.type === 'prepare'){
      const res = NLP.propose(x.act.summary, x.act.changes);
      if(res && res.error) NLP.toast('That couldn’t be prepared: ' + res.error, 'warn');
      else NLP.toast('Prepared. Nothing is saved until you press Apply.');
      NLP.refreshPanel();
    } else if(x.act.type === 'ask') NLP.ask(x.act.text);
    else if(x.act.type === 'open') openPage(x.act.page);
  }

  // ── Drawing ────────────────────────────────────────────────────────────
  const GROUPS = [['well','Going well'],['care','Needs care'],['do','Do next']];
  function body(m){
    const r = review(m);
    const counts = Object.fromEntries(GROUPS.map(([g]) => [g, r.findings.filter(x => x.g === g).length]));
    const filt = st().rvFilter || 'all';
    const chips = `<div class="nl-chips">${[['all','All', r.findings.length]].concat(GROUPS.map(([g, t]) => [g, t, counts[g]])).filter(c => c[2] || c[0] === 'all').map(c => `<button type="button" class="nl-chip${filt === c[0] ? ' on' : ''}" onclick="NLP.review.filter('${c[0]}')">${H(c[1])} · ${c[2]}</button>`).join('')}</div>`;
    let rows = '', n = 0;
    GROUPS.forEach(([g, t]) => {
      if(filt !== 'all' && filt !== g) return;
      const list = r.findings.filter(x => x.g === g);
      rows += `<tr class="rv-grp"><td colspan="4">${H(t)} · ${list.length}</td></tr>`;
      if(!list.length) rows += `<tr><td></td><td colspan="3"><span class="sub">Nothing here right now.</span></td></tr>`;
      list.forEach(x => {
        n++;
        const where = x.page && PAGES[x.page] ? PAGES[x.page][2] : '';
        const link = x.act ? `<span class="nl-inrow">${NLP.link(x.act.label, `NLP.review.act('${x.id}')`)}</span>` : (where ? `<span class="nl-inrow">${NLP.link('Open ' + where, `NLP.review.open('${x.page}')`)}</span>` : '');
        rows += `<tr data-nl-row="${x.id}"><td class="mk">${n}</td><td><span class="nm">${H(x.title)}</span><span class="sub"><span class="nl-q">“${H(x.quote)}”</span>${where && x.g !== 'do' ? ' · from ' + H(where) : ''}</span>${link}</td><td>${NLP.badge(x.badge[0], x.badge[1])}</td><td class="r">${H(x.fig || '')}</td></tr>`;
      });
    });
    return `${busy ? `<p class="nl-note">Horizon is rewording your review… <span class="nl-dots"><i></i><i></i><i></i></span></p>` : ''}${chips}
      <div class="nl-tbl-wrap"><table class="nl-tbl rv-tbl"><thead><tr><th></th><th>Finding, and the numbers it comes from</th><th>Status</th><th class="r">Key figure</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="nl-note">${r.ai ? 'Worded by the assistant' : 'Written by Horizon'} from your plan’s own numbers. Every finding links to the page it comes from.</p>`;
  }
  function actions(){
    const r = current();
    return `<span class="nl-note" style="align-self:center;margin:0">${r && r.ai ? 'Worded ' + H(dateWords(r.at)) : 'Up to date with your plan'}</span>${NLP.pill('Write a new one', 'NLP.review.rewrite()')}${NLP.pill('Save to Notebook', 'NLP.review.save()')}`;
  }
  function wire(host){
    NLP.rows(host.querySelector('.rv-tbl tbody'), P, id => act(id));
  }
  function ring(p){
    const c = p >= 100 ? 'var(--nl-accent)' : p >= 90 ? '#8A5A0A' : '#8F2A22';
    return `<svg width="58" height="58" viewBox="0 0 64 64" aria-label="${Math.round(p)}% covered"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--nl-pill)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(Math.min(100, p) / 100 * 163.4).toFixed(1)} 163.4" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" style="font:600 13px var(--nl-sans);fill:var(--nl-ink)">${Math.round(p)}%</text></svg>`;
  }
  function overview(m){
    const r = review(m);
    const counts = Object.fromEntries(GROUPS.map(([g]) => [g, r.findings.filter(x => x.g === g).length]));
    const graphic = `<div style="display:flex;gap:12px;align-items:center">${ring(r.coverage || 0)}<div class="nl-counts" style="flex:1"><div class="ok"><b>${counts.well}</b>going well</div><div class="${counts.care ? 'on' : 'ok'}"><b>${counts.care}</b>need care</div><div><b>${counts.do}</b>to do</div></div></div>`;
    const chosen = st().chosen != null ? r.findings.find(x => x.id === String(st().chosen)) : null;
    const groups = [];
    const sh = x => x.short || x.title.replace(/[−-]?\s?[^\s\d]*\d[\d\s.,]*\s?(kr|\$|€|KSh)?\b/g, '').replace(/\s{2,}/g, ' ').trim();
    if(chosen) groups.push({ title:'Chosen', rows:[{ text:H(sh(chosen)), badge:{ text:chosen.badge[0], kind:chosen.badge[1] }, why:chosen.page && PAGES[chosen.page] ? 'From ' + H(PAGES[chosen.page][2]) : '', link:chosen.act ? { label:chosen.act.label, onclick:`NLP.review.act('${chosen.id}')` } : (chosen.page ? { label:'Open ' + PAGES[chosen.page][2], onclick:`NLP.review.open('${chosen.page}')` } : null) }] });
    const todo = r.findings.filter(x => x.g === 'do').slice(0, 3);
    if(todo.length) groups.push({ title:'Do next', rows:todo.map(x => ({ text:H(sh(x)), badge:{ text:x.badge[0], kind:x.badge[1] }, link:{ label:x.act.label, onclick:`NLP.review.act('${x.id}')` } })) });
    const first = (chosen && chosen.act) ? chosen : r.findings.find(x => x.act && x.act.type === 'prepare') || todo[0];
    return {
      headline:H(r.headline), graphic, groups,
      button:first ? { label:first.act.type === 'prepare' ? 'Prepare: ' + sh(first).charAt(0).toLowerCase() + sh(first).slice(1) : first.act.label, onclick:`NLP.review.act('${first.id}')` } : null,
      links:[{ label:'Save to Notebook', short:'Save', onclick:'NLP.review.save()' }, { label:'Write a new one', short:'New', onclick:'NLP.review.rewrite()' }],
    };
  }

  NLP.review = {
    body, actions, wire, overview,
    act, open:openPage, save:saveToNotebook,
    filter(f){ st().rvFilter = f; NLP.renderPage(P); },
    async rewrite(){ if(busy) return; st().chosen = null; const had = !!(state.aiKeys && state.aiKeys.claude); await writeWithAI(NLP.today.model()); NLP.renderPage(P); if(had && state.nlReview && state.nlReview.ai) NLP.toast('A new review is ready'); },
  };
  NLP.css('nl-review-css', `
#panel-nl-today .rv-tbl tr.rv-grp td { padding:16px 8px 6px; border-bottom:1px solid var(--nl-line); font:600 11.5px/1.2 var(--nl-sans); letter-spacing:.06em; text-transform:uppercase; color:var(--nl-detail); cursor:default; background:transparent !important; }
#panel-nl-today .rv-tbl td.r { font-weight:500; }
#panel-nl-today .rv-tbl .nl-q { font-size:13.5px; }
`);
})();

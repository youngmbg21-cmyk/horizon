/* ══ NEW LOOK (L+S) · Money plan ═══════════════════════════════════════════
   One page, five tabs: Plan · Forecast · Years ahead · Bank files · History.
   Every number comes from the app's engine (getEffective, resolveYearBase,
   get12Months / the month chain, getYearlyPlan) and from state.transactions.
   Changes the person makes here go through NLP.record (History + Undo);
   changes the page prepares go through NLP.propose (the person applies).
   Nothing here shows or styles anything while the new look is off.
   Design rules: docs/LS-DESIGN.md.                                        */
(function(){
  'use strict';
  if(!window.NLP) return;
  const NLP = window.NLP, H = NLP.h, PANEL = 'nl-money';
  const NLM = window.NLM = {};
  const ui = () => NLP.ui(PANEL);
  const money = v => NLP.money(v);
  const norm = s => String(s || '').trim().toLowerCase();
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const keyOf = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const parseKey = k => { const x = /^(\d{4})-(\d{2})$/.exec(k || ''); return x ? { y:+x[1], m:+x[2] - 1 } : null; };
  const monLong = k => { const p = parseKey(k); return p ? new Date(p.y, p.m, 1).toLocaleString('en-GB', { month:'long' }) : ''; };
  const monLabel = k => NLP.monthLabel(k);
  const monShort = k => NLP.monthShort(k);
  const rateNow = () => (typeof rate === 'function' ? rate() : 1) || 1;
  const curSym = () => (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[state.currency]) || state.currency || 'kr';
  const toShown = v => Math.round((Number(v) || 0) * rateNow());
  const fromShown = v => Math.round((Number(String(v).replace(/\s/g, '').replace(',', '.')) || 0) / rateNow());
  const nlHistory = () => (state.nl && Array.isArray(state.nl.history)) ? state.nl.history : [];
  const txs = () => Array.isArray(state.transactions) ? state.transactions : [];
  const LISTF = { expenses:{ base:'baseExpenses', eff:'expenseItems' }, income:{ base:'baseIncome', eff:'incomeItems' } };

  // ── The month being looked at (Plan tab) ──────────────────────────────
  const MIN_OFF = -1, MAX_OFF = 35;
  function viewMonth(){
    const st = ui();
    if(st.ym == null) st.ym = 0;               // offset from the app's current month
    st.ym = Math.max(MIN_OFF, Math.min(MAX_OFF, st.ym));
    const d = new Date(CY, CM + st.ym, 1);
    return { y:d.getFullYear(), m:d.getMonth(), key:keyOf(d.getFullYear(), d.getMonth()), off:st.ym };
  }
  // The engine's view of a month: the 23-month chain (with trips and the
  // carried-over line) when it covers the month, else getEffective().
  function monthEntry(y, m){
    const key = keyOf(y, m);
    try {
      const chain = (typeof _get13MonthChain === 'function') ? _get13MonthChain() : get12Months();
      const hit = chain.find(e => e.key === key);
      if(hit) return { key, incomeItems:hit.incomeItems, expenseItems:hit.expenseItems, savings:hit.savings, chained:true, entry:hit };
    } catch(_){}
    const prev = (typeof getPrevMonthEntry === 'function') ? getPrevMonthEntry() : null;
    if(prev && prev.key === key) return { key, incomeItems:prev.incomeItems, expenseItems:prev.expenseItems, savings:prev.savings, chained:false, entry:prev };
    const e = getEffective(y, m);
    return { key, incomeItems:e.incomeItems.slice(), expenseItems:e.expenseItems.slice(), savings:e.savings, chained:false, entry:null };
  }

  // ── The bank file, read for each plan line ────────────────────────────
  const KW = {
    groceries:['ica','willys','coop','hemköp','hemkop','lidl','city gross','mathem','netto','grocer'],
    food:['ica','willys','coop','hemköp','lidl'],
    mortgage:['bolån','bolan','mortgage','sbab','stadshypotek','landshypotek'],
    rent:['hyra','rent'],
    insurance:['försäkr','forsakr','insurance','folksam','trygg-hansa','if skadef','länsförsäkr'],
    cleaning:['hemfrid','städ','cleaning'],
    avgift:['avgift','brf '],
    electricity:['vattenfall','ellevio','e.on','tibber','elräkning'],
    akassa:['a-kassa','akassa','unionens'],
    gym:['sats','friskis','gym'],
    phone:['telia','tele2','telenor','comviq','tre '],
    transport:['sl ','sj ','uber','bolt','circle k','preem'],
  };
  const STOP = new Set(['bills','bill','allowance','other','monthly','plan','home','fund','the','and','for','costs','cost','line','extra']);
  function keywordsFor(name){
    const n = norm(name), words = n.split(/[^a-zåäöéü0-9-]+/).filter(Boolean);
    const out = new Set();
    words.forEach(w => { if(w.length >= 4 && !STOP.has(w)) out.add(w); if(KW[w]) KW[w].forEach(k => out.add(k)); });
    if(KW[n]) KW[n].forEach(k => out.add(k));
    return [...out];
  }
  const hasWord = (text, kw) => { const i = text.indexOf(kw); if(i < 0) return false; return i === 0 || /[^a-zåäöéü0-9]/.test(text[i - 1]); };
  function bankMonths(){
    const ms = [...new Set(txs().map(t => String(t.date || '').slice(0, 7)).filter(k => /^\d{4}-\d{2}$/.test(k)))].sort();
    return ms.slice(-3);
  }
  // { found, names:[bank words], avg (SEK a month), months:[keys], count }
  function bankFor(name, list){
    const all = txs(); if(!all.length) return { found:false };
    const kws = keywordsFor(name), nn = norm(name);
    const last = bankMonths(); if(!last.length) return { found:false };
    const want = list === 'income' ? (a => a > 0) : (a => a < 0);
    const hits = all.filter(t => {
      const a = Number(t.amount) || 0; if(!want(a)) return false;
      if(!last.includes(String(t.date || '').slice(0, 7))) return false;
      const cat = norm(t.category);
      if(cat && cat !== 'other' && (cat === nn || (nn.length >= 4 && cat.includes(nn)))) return true;
      const tn = norm(t.name);
      return kws.some(k => hasWord(tn, k));
    });
    if(!hits.length) return { found:false };
    const total = hits.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    const freq = {}; hits.forEach(t => { const k = String(t.name || '').trim(); if(k) freq[k] = (freq[k] || 0) + 1; });
    const names = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 2).map(s => s.length > 28 ? s.slice(0, 27) + '…' : s);
    return { found:true, names, avg:total / last.length, months:last, count:hits.length };
  }
  const rangeText = months => months.length ? (months.length === 1 ? monShort(months[0]) : `${monShort(months[0])}–${monShort(months[months.length - 1])}`) : '';
  function bankStatus(plan, b){
    if(!b.found) return { text:'Plan only', kind:'grey', key:'plan' };
    if(!(plan > 0)) return { text:'Higher at bank', kind:'amber', key:'high' };
    const r = b.avg / plan;
    if(r > 1.1) return { text:'Higher at bank', kind:'amber', key:'high', pct:Math.round((r - 1) * 100) };
    if(r < 0.9) return { text:'Lower at bank', kind:'steel', key:'low', pct:Math.round((1 - r) * 100) };
    return { text:'Matches bank', kind:'green', key:'match' };
  }
  const quotes = names => names.map(n => NLP.quote(n)).join(', ');
  const roundTo = v => Math.round(v / 100) * 100;

  // ── Suggestions from the assistant that touch a row ───────────────────
  function pendingList(){
    const p = NLP.pending(); if(!p) return [];
    return p.changes.map((c, idx) => ({ c, idx, pid:p.id, live:p.changes.filter(x => !x.dropped).length })).filter(x => !x.c.dropped);
  }
  // Does a change written at its scope reach this month?
  function scopeHits(c, field, y, m){
    const key = keyOf(y, m), ov = state.monthlyOverrides && state.monthlyOverrides[key];
    const ovHas = field === 'savings' ? !!(ov && ov.savings != null) : !!(ov && Array.isArray(ov[field]));
    const src = resolveYearBase(y).source[field];
    if(c.where === 'month') return c.month === key;
    if(c.where === 'year') return !ovHas && y >= c.year && (src == null || src <= c.year);
    if(c.where === 'plan') return !ovHas && src == null;
    return false;
  }
  function sugFor(list, name, y, m){
    return pendingList().filter(x => x.c.list === list && ['set_amount','remove_line'].includes(x.c.kind) && norm(x.c.name) === norm(name) && scopeHits(x.c, list, y, m));
  }
  const sugLinks = s => `<span class="nl-inrow">${NLP.link(s.live > 1 ? `Keep all ${s.live} changes` : 'Keep it', `nlApply('${s.pid}')`)}${NLP.link('Drop', `nlDrop('${s.pid}',${s.idx})`)}</span>`;
  const whereWords = c => c.where === 'plan' ? 'In your plan, every month.' : c.where === 'year' ? `From ${c.year} on.` : `${monLabel(c.month)} only.`;

  // ── Plan rows for the month ───────────────────────────────────────────
  function planRows(){
    const v = viewMonth(), e = monthEntry(v.y, v.m);
    const base = resolveYearBase(v.y), ov = (state.monthlyOverrides || {})[v.key];
    const rows = [];
    const sourceText = (field, item) => {
      if(ov && Array.isArray(ov[field])){
        const b = (base[field] || []).find(x => norm(x.name) === norm(item.name));
        if(!b || Math.round(b.amount) !== Math.round(item.amount)) return { only:true, text:`Changed for ${monLabel(v.key)} only` };
        return { only:false, text:`${monLabel(v.key)} has its own list` };
      }
      const src = base.source[field];
      if(src != null) return { only:false, text:src === v.y ? `From your ${src} plan` : `Follows your ${src} plan` };
      return { only:false, text:'From your plan' };
    };
    ['expenses','income'].forEach(list => {
      const items = list === 'expenses' ? e.expenseItems : e.incomeItems;
      items.forEach(it => {
        if(it.carryForward){
          rows.push({ id:'carry:' + list, kind:'carry', list, name:it.name, amount:it.amount, item:it });
          return;
        }
        if(it.fromTrip){
          rows.push({ id:'trip:' + it.id, kind:'trip', list, name:it.name.replace(/^\S+\s/, ''), amount:it.amount, item:it });
          return;
        }
        const b = bankFor(it.name, list), s = sourceText(list, it);
        rows.push({ id:(list === 'expenses' ? 'e:' : 'i:') + norm(it.name), kind:'line', list, name:it.name, amount:Number(it.amount) || 0, type:it.type === 'fixed' ? 'Fixed' : 'Variable',
          item:it, bank:b, src:s, status:bankStatus(Number(it.amount) || 0, b), sugs:sugFor(list, it.name, v.y, v.m) });
      });
    });
    // Savings target
    const savSugs = pendingList().filter(x => x.c.kind === 'set_savings' && scopeHits(x.c, 'savings', v.y, v.m));
    const savSrc = ov && ov.savings != null ? { only:Math.round(ov.savings) !== Math.round(base.savings), text:`Set for ${monLabel(v.key)} only` }
      : (base.source.savings != null ? { only:false, text:`From your ${base.source.savings} plan` } : { only:false, text:'From your plan' });
    rows.push({ id:'sav', kind:'savings', list:'savings', name:'Savings target', amount:e.savings, type:'Fixed', src:savSrc, sugs:savSugs });
    // Suggested new lines
    pendingList().filter(x => x.c.kind === 'add_line' && scopeHits(x.c, x.c.list, v.y, v.m)).forEach(x => {
      rows.push({ id:'new:' + x.idx, kind:'newsug', list:x.c.list, name:x.c.name, amount:x.c.amount, type:x.c.type === 'fixed' ? 'Fixed' : 'Variable', sugs:[x] });
    });
    return { v, e, rows };
  }
  const isSug = r => r.sugs && r.sugs.length;
  function filterRows(rows){
    const f = ui().filt || 'expenses';
    if(f === 'suggested') return rows.filter(isSug);
    if(f === 'savings') return rows.filter(r => r.list === 'savings');
    return rows.filter(r => r.list === f);
  }

  function badgeFor(r){
    if(isSug(r)) return NLP.badge('Suggested', 'amber');
    if(r.kind === 'carry') return NLP.badge(`${monShort(viewMonth().key)} only`, r.list === 'expenses' ? 'ruby' : 'green');
    if(r.kind === 'trip') return NLP.badge('Trip', 'steel');
    if(r.src && r.src.only) return NLP.badge('This month only', 'steel');
    if(r.kind === 'savings') return NLP.badge('Plan', 'grey');
    return NLP.badge(r.status.text, r.status.kind);
  }
  function detailFor(r){
    const v = viewMonth();
    if(r.kind === 'carry'){
      const from = r.item.fromKey ? monLong(r.item.fromKey) : 'last month';
      return r.list === 'expenses' ? `${from} spent more than it had, so the gap moves into ${monLong(v.key)}. Only affects ${monLong(v.key)}.`
        : `Money left over from ${from}. Only affects ${monLong(v.key)}.`;
    }
    if(r.kind === 'trip') return `From your trips in Plans. Change it there.`;
    if(r.kind === 'savings') return r.src.text + '.';
    if(r.kind === 'newsug') return 'A new line.';
    const b = r.bank;
    if(b && b.found) return `${quotes(b.names)}, about ${H(money(roundTo(b.avg)))} a month, ${H(rangeText(b.months))}`;
    return H(r.src.text) + (txs().length ? ', not seen in the bank file' : '');
  }
  function amountCell(r){
    const s = isSug(r) ? r.sugs[0].c : null;
    if(s && s.kind === 'remove_line') return `<span class="nl-was">${H(money(r.amount))}</span>Removed`;
    if(s && s.kind !== 'add_line' && s.amount != null) return `<span class="nl-was">${H(money(r.amount))}</span>${H(money(s.amount))}`;
    return H(money(r.amount));
  }

  // ── Editing a line (second press) ─────────────────────────────────────
  function yearTarget(v){ return v.y > CY ? v.y : CY + 1; }
  function defaultWhere(r, v){
    const ov = (state.monthlyOverrides || {})[v.key];
    const field = r.list;
    if(field === 'savings' ? (ov && ov.savings != null) : (ov && Array.isArray(ov[field]))) return 'month';
    if(r.list !== 'savings' && resolveYearBase(v.y).source[field] != null) return 'year';
    if(r.list === 'savings' && resolveYearBase(v.y).source.savings != null) return 'year';
    return 'plan';
  }
  function whereLabel(w, v){ return w === 'plan' ? 'Every month (your plan)' : w === 'month' ? `Only ${monLabel(v.key)}` : `From ${yearTarget(v)} on`; }
  function whereNote(w, v){
    if(w === 'plan') return 'Changes every month that follows your plan. Months and years with their own changes keep them.';
    if(w === 'month') return `Changes ${monLabel(v.key)} only. That month then keeps its own list, so later plan changes skip it.`;
    return `Changes ${yearTarget(v)} and every later year that follows it, until another change.`;
  }
  // The list a change at this scope writes to (same rules as the assistant's changes).
  function writable(st, field, where, v){
    if(where === 'plan'){ const k = LISTF[field].base; if(!Array.isArray(st[k])) st[k] = []; return st[k]; }
    if(where === 'year'){
      const Y = yearTarget(v);
      if(!st.yearlyBases) st.yearlyBases = {};
      const b = st.yearlyBases[String(Y)] || (st.yearlyBases[String(Y)] = {});
      if(!Array.isArray(b[field])) b[field] = clone(resolveYearBase(Y)[field] || []);
      b.cascade = true;
      return b[field];
    }
    if(!st.monthlyOverrides) st.monthlyOverrides = {};
    const ov = st.monthlyOverrides[v.key] || (st.monthlyOverrides[v.key] = {});
    if(!Array.isArray(ov[field])) ov[field] = clone(getEffective(v.y, v.m)[LISTF[field].eff] || []);
    return ov[field];
  }
  function writeSavings(st, where, v, amount){
    if(where === 'plan'){ st.baseSavings = amount; return; }
    if(where === 'year'){
      const Y = yearTarget(v);
      if(!st.yearlyBases) st.yearlyBases = {};
      const b = st.yearlyBases[String(Y)] || (st.yearlyBases[String(Y)] = {});
      b.savings = amount; b.cascade = true; return;
    }
    if(!st.monthlyOverrides) st.monthlyOverrides = {};
    (st.monthlyOverrides[v.key] || (st.monthlyOverrides[v.key] = {})).savings = amount;
  }
  const whereShort = (w, v) => w === 'plan' ? 'your plan' : w === 'month' ? `${monLabel(v.key)} only` : `from ${yearTarget(v)}`;

  NLM.set = function(k, val){ const st = ui(); st.edit = st.edit || {}; st.edit[k] = val; NLP.renderPage(PANEL); };
  NLM.close = function(){ const st = ui(); st.open = null; st.edit = null; NLP.renderPage(PANEL); };
  function openRow(id){
    const st = ui();
    if(st.open === id){ st.open = null; st.edit = null; }
    else { st.open = id; st.edit = null; }
    NLP.renderPage(PANEL);
    setTimeout(() => { const i = document.getElementById(id === 'add' ? 'nlm-name' : 'nlm-amt'); if(i){ i.focus(); i.select && i.select(); } }, 0);
  }
  NLM.open = openRow;
  NLM.addLine = function(){ const st = ui(); st.tab = 'plan'; if((st.filt || 'expenses') === 'savings' || st.filt === 'suggested') st.filt = 'expenses'; st.chosen = null; openRow('add'); };

  function editorHtml(r, v){
    const st = ui(), ed = st.edit || (st.edit = {});
    const isAdd = r === 'add';
    const field = isAdd ? (ed.list || (ui().filt === 'income' ? 'income' : 'expenses')) : r.list;
    if(ed.where == null) ed.where = isAdd ? 'plan' : defaultWhere(r, v);
    if(ed.type == null) ed.type = isAdd ? 'variable' : (r.type === 'Fixed' ? 'fixed' : 'variable');
    const pills = (key, opts) => `<div class="nlm-pills">${opts.map(o => `<button type="button" class="nl-gp${ed[key] === o[0] ? ' on' : ''}" aria-pressed="${ed[key] === o[0]}" onclick="NLM.set('${key}','${o[0]}')">${H(o[1])}</button>`).join('')}</div>`;
    const amt = isAdd ? '' : toShown(r.amount);
    const nm = isAdd ? 'the new line' : r.name;
    let h = `<tr class="nlm-ed"><td></td><td colspan="4"><div class="nlm-edbox">`;
    if(isAdd){
      h += `<div class="nl-field"><span class="lb">Name</span><input type="text" id="nlm-name" placeholder="For example Gym" maxlength="60"><span></span></div>`;
      h += `<div class="nl-field"><span class="lb">Kind</span>${pills('list', [['expenses','Expense'],['income','Income']])}<span></span></div>`;
    }
    h += `<div class="nl-field"><span class="lb">Amount each month</span><span class="nlm-amtw"><input type="text" inputmode="decimal" id="nlm-amt" class="nl-num-in" value="${H(amt)}" aria-label="Amount each month"> <span class="nlm-cur">${H(curSym())}</span></span><span></span></div>`;
    if(r === 'add' || r.kind !== 'savings') h += `<div class="nl-field"><span class="lb">Type</span>${pills('type', [['fixed','Fixed'],['variable','Variable']])}<span></span></div>`;
    h += `<div class="nl-field"><span class="lb">Where</span>${pills('where', [['plan', whereLabel('plan', v)], ['month', whereLabel('month', v)], ['year', whereLabel('year', v)]])}<span></span></div>`;
    h += `<p class="nl-note">${H(whereNote(ed.where, v))}</p>`;
    h += `<div class="nlm-edacts"><button type="button" class="nl-black" onclick="NLM.saveLine()">${H(isAdd ? 'Add this line' : 'Save ' + nm)}</button>`;
    if(!isAdd && r.kind === 'line') h += NLP.link('Remove this line', 'NLM.removeLine()');
    h += NLP.link('Cancel', 'NLM.close()') + `</div></div></td></tr>`;
    void field;
    return h;
  }
  NLM.saveLine = function(){
    const st = ui(), v = viewMonth(), ed = st.edit || {};
    const amtEl = document.getElementById('nlm-amt');
    const raw = amtEl ? amtEl.value.trim() : '';
    if(raw === '' || !(Number(raw.replace(/\s/g, '').replace(',', '.')) >= 0)){ NLP.toast('Type an amount of 0 or more.', 'warn'); amtEl && amtEl.focus(); return; }
    const amount = fromShown(raw);
    if(st.open === 'add'){
      const nameEl = document.getElementById('nlm-name'), name = nameEl ? nameEl.value.trim() : '';
      if(!name){ NLP.toast('Give the new line a name.', 'warn'); nameEl && nameEl.focus(); return; }
      const field = ed.list || (st.filt === 'income' ? 'income' : 'expenses');
      const exists = (getEffective(v.y, v.m)[LISTF[field].eff] || []).some(x => norm(x.name) === norm(name));
      if(exists){ NLP.toast(`There is already a line called ${name}.`, 'warn'); return; }
      const ok = NLP.record(`${name}: new ${field === 'income' ? 'income' : 'line'}, ${money(amount)} a month · ${whereShort(ed.where, v)}`, s => {
        writable(s, field, ed.where, v).push({ id:genId(), name, amount, type:ed.type === 'fixed' ? 'fixed' : 'variable' });
      });
      if(ok !== false){ st.open = null; st.edit = null; st.filt = field; st.chosen = (field === 'expenses' ? 'e:' : 'i:') + norm(name); NLP.renderPage(PANEL); }
      return;
    }
    const r = (NLM._rows || {})[st.open]; if(!r) return;
    if(r.kind === 'savings'){
      const ok = NLP.record(`Savings target: ${money(r.amount)} → ${money(amount)} a month · ${whereShort(ed.where, v)}`, s => writeSavings(s, ed.where, v, amount));
      if(ok !== false){ st.open = null; st.edit = null; NLP.renderPage(PANEL); }
      return;
    }
    const type = ed.type === 'fixed' ? 'fixed' : 'variable';
    const typeChanged = type !== (r.type === 'Fixed' ? 'fixed' : 'variable');
    const label = `${r.name}: ${money(r.amount)} → ${money(amount)} a month${typeChanged ? ', ' + type : ''} · ${whereShort(ed.where, v)}`;
    const ok = NLP.record(label, s => {
      const arr = writable(s, r.list, ed.where, v);
      let it = arr.find(x => norm(x.name) === norm(r.name));
      if(!it){ it = { id:genId(), name:r.name, amount, type }; arr.push(it); }
      it.amount = amount; it.type = type;
    });
    if(ok !== false){ st.open = null; st.edit = null; NLP.renderPage(PANEL); }
  };
  NLM.removeLine = function(){
    const st = ui(), v = viewMonth(), ed = st.edit || {};
    const r = (NLM._rows || {})[st.open]; if(!r || r.kind !== 'line') return;
    const where = ed.where || defaultWhere(r, v);
    const ok = NLP.record(`${r.name}: removed (was ${money(r.amount)} a month) · ${whereShort(where, v)}`, s => {
      const arr = writable(s, r.list, where, v);
      const i = arr.findIndex(x => norm(x.name) === norm(r.name));
      if(i < 0) throw new Error(`${r.name} is not in ${whereShort(where, v)}`);
      arr.splice(i, 1);
    });
    if(ok !== false){ st.open = null; st.edit = null; st.chosen = null; NLP.renderPage(PANEL); }
  };
  NLM.month = function(step){ const st = ui(); st.ym = Math.max(MIN_OFF, Math.min(MAX_OFF, (st.ym || 0) + step)); st.chosen = null; st.open = null; st.edit = null; NLP.renderPage(PANEL); };
  NLM.filt = function(f){ const st = ui(); st.filt = (st.filt || 'expenses') === f && f === 'suggested' ? 'expenses' : f; st.chosen = null; st.open = null; st.edit = null; NLP.renderPage(PANEL); };
  NLM.goMonth = function(key){
    const p = parseKey(key); if(!p) return;
    const st = ui(); st.ym = (p.y - CY) * 12 + (p.m - CM); st.tab = 'plan'; st.chosen = null; st.open = null; st.edit = null;
    NLP.renderPage(PANEL);
  };
  NLM.tab = function(t){ NLP.tab(PANEL, t); };

  // ── Lines where the bank file differs from the plan (for proposals) ──
  function bankDiffs(){
    if(!txs().length) return [];
    const out = [];
    (state.baseExpenses || []).forEach(it => {
      const b = bankFor(it.name, 'expenses'), s = bankStatus(Number(it.amount) || 0, b);
      if(s.key === 'high' || s.key === 'low') out.push({ name:it.name, plan:Number(it.amount) || 0, bank:b, status:s });
    });
    return out;
  }
  function proposalFor(d){
    return { kind:'set_amount', where:'plan', list:'expenses', name:d.name, amount:roundTo(d.bank.avg),
      why:`Your bank file shows ${d.bank.names.map(n => '“' + n + '”').join(', ')} at about ${money(roundTo(d.bank.avg))} a month (${rangeText(d.bank.months)}).` };
  }
  NLM.proposeBank = function(name){
    const list = bankDiffs().filter(d => !name || norm(d.name) === norm(name));
    if(!list.length){ NLP.toast('Nothing to prepare: the plan already matches the bank.', 'warn'); return; }
    const r = NLP.propose(list.length === 1 ? `Use the bank's amount for ${list[0].name}.` : `Use the bank's amounts for ${list.length} lines.`, list.map(proposalFor));
    if(r && r.error) NLP.toast('Nothing was prepared: ' + r.error, 'warn');
  };

  // ── Plan tab ──────────────────────────────────────────────────────────
  function renderPlan(){
    const st = ui(), { v, rows } = planRows();
    NLM._rows = {}; rows.forEach(r => { NLM._rows[r.id] = r; });
    const shown = filterRows(rows);
    const f = st.filt || 'expenses';
    const n = k => rows.filter(r => r.list === k && r.kind === 'line').length;
    const sugN = rows.filter(isSug).length;
    const chip = (key, label) => `<button type="button" class="nl-chip${f === key ? ' on' : ''}" aria-pressed="${f === key}" onclick="NLM.filt('${key}')">${H(label)}</button>`;
    let h = `<div class="nlm-chiprow"><div class="nl-chips">${chip('expenses', `Expenses · ${n('expenses')}`)}${chip('income', `Income · ${n('income')}`)}${chip('savings', 'Savings')}${sugN ? chip('suggested', f === 'suggested' ? `Suggested · ${sugN} ×` : `+ Suggested · ${sugN}`) : ''}</div><span class="nlm-narrow">${monthChooser()}</span></div>`;
    h += `<div class="nl-tbl-wrap" id="nlm-plan"><table class="nl-tbl nlm-plan"><thead><tr><th></th><th>Line and where the number comes from</th><th class="nlm-type">Type</th><th class="nlm-st">Status</th><th class="r">Each month</th></tr></thead><tbody>`;
    let i = 0;
    shown.forEach(r => {
      const s = isSug(r) ? r.sugs[0] : null;
      const mk = r.kind === 'carry' || r.kind === 'trip' ? '·' : String(++i);
      let sub = `<span class="sub">${detailFor(r)}</span>`;
      if(s) sub += `<span class="sub">${H(s.c.why ? s.c.why : '')}${s.c.why ? ' ' : ''}${H(whereWords(s.c))}</span>${sugLinks(s)}`;
      if(r.kind === 'trip') sub += `<span class="nl-inrow">${NLP.link('Open trips in Plans', "NLP.go('nl-plans')")}</span>`;
      h += `<tr data-nl-row="${H(r.id)}" class="${s ? 'sug' : ''}"><td class="mk">${mk}</td><td><span class="nm">${H(r.name)}</span>${sub}</td><td class="nlm-type">${H(r.kind === 'carry' || r.kind === 'trip' ? '' : (r.kind === 'savings' ? '' : r.type))}</td><td>${badgeFor(r)}</td><td class="r">${amountCell(r)}</td></tr>`;
      if(st.open === r.id && (r.kind === 'line' || r.kind === 'savings')) h += editorHtml(r, v);
    });
    if(st.open === 'add') h += editorHtml('add', v);
    if(!shown.length && st.open !== 'add') h += `<tr><td></td><td colspan="4"><span class="sub">No ${f === 'suggested' ? 'suggested' : f} lines in ${H(monLabel(v.key))}.</span></td></tr>`;
    h += `</tbody></table></div>`;
    if(f !== 'savings' && f !== 'suggested' && st.open !== 'add') h += `<p class="nlm-foot">${NLP.link(f === 'income' ? '+ Add an income line' : '+ Add a line', 'NLM.addLine()')}</p>`;
    return h;
  }
  function monthChooser(){
    const v = viewMonth();
    const prevDis = v.off <= MIN_OFF, nextDis = v.off >= MAX_OFF;
    return `<span class="nlm-mon"><button type="button" class="nl-gp" onclick="NLM.month(-1)" ${prevDis ? 'disabled title="The plan starts last month"' : ''} aria-label="Previous month">‹</button><span class="nlm-mon-l">${H(monLabel(v.key))}</span><button type="button" class="nl-gp" onclick="NLM.month(1)" ${nextDis ? 'disabled title="The chooser goes 3 years ahead"' : ''} aria-label="Next month">›</button></span>`;
  }

  // ── Forecast tab ──────────────────────────────────────────────────────
  function monthsInfo(){
    const ms = get12Months();
    return ms.map((m, i) => {
      const trips = m.expenseItems.filter(x => x.fromTrip);
      const carry = m.expenseItems.find(x => x.carryForward) || null;
      const carryIn = m.incomeItems.find(x => x.carryForward) || null;
      const short = (m.funFund || 0) < 0;
      return { i, m, key:m.key, trips, carry, carryIn, short, trip:trips.length > 0, fun:m.pureFunFund, bal:m.funFund };
    });
  }
  function whyShort(x){
    const parts = [];
    if(x.carry && x.carry.amount > 0) parts.push(`${monLong(x.carry.fromKey)} ended short and the gap carries in`);
    if(x.trip) parts.push(`${tripNames(x.trips)} is paid this month`);
    if(x.m.pureFunFund < 0 && !x.trip) parts.push('costs and saving are more than income');
    return parts.length ? parts.join('; ') : 'costs and saving are more than what comes in';
  }
  const tripNames = list => [...new Set(list.map(t => (state.trips || []).find(tr => tr.id === t.tripId)?.name || t.name.replace(/^\S+\s/, '').split(' · ')[0]))].join(' and ');
  // Lower savings in one month only, so that month's Fun Fund is not below zero.
  function savingsFix(x){
    const need = Math.ceil(-(x.bal || 0));
    if(!(need > 0) || !(x.m.savings > 0)) return null;
    const amount = Math.max(0, Math.round(x.m.savings - need));
    const res = NLP.whatIf(s => {
      if(!s.monthlyOverrides) s.monthlyOverrides = {};
      (s.monthlyOverrides[x.key] || (s.monthlyOverrides[x.key] = {})).savings = amount;
    }, () => get12Months().filter(m => (m.funFund || 0) < 0).map(m => m.key));
    return { key:x.key, amount, cut:x.m.savings - amount, still:res, fixesIt:!res.includes(x.key), full:amount === 0 && x.m.savings < need };
  }
  NLM.proposeFix = function(key){
    const x = monthsInfo().find(q => q.key === key); if(!x) return;
    const f = savingsFix(x); if(!f){ NLP.toast('There is no saving in that month to lower.', 'warn'); return; }
    const r = NLP.propose(`Save less in ${monLabel(key)} only, so it is not short.`, [{ kind:'set_savings', where:'month', month:key, amount:f.amount,
      why:`${monLabel(key)} runs short because ${whyShort(x)}. Saving ${money(f.cut)} less that month covers it${f.fixesIt ? '' : ' only partly'}.` }]);
    if(r && r.error) NLP.toast('Nothing was prepared: ' + r.error, 'warn');
  };
  function forecastChart(info){
    return NLP.chartBox((w, hgt) => {
      const tops = info.map(x => Math.max(x.m.pureIncome, x.m.pureExpenses + x.m.savings));
      const t = NLP.ticks(0, Math.max(1, ...tops), 4, NLP.moneyShort);
      return NLP.chart({ w, h:hgt, x:[-0.5, 11.5], y:[0, t.max], yt:t.ticks, xt:info.map((x, i) => [i, monShort(x.key)]), label:'Next 12 months, stacked by costs, saved and Fun Fund',
        draw:({ sx, sy }) => {
          const bw = (sx(1) - sx(0)) * 0.62; let s = '';
          info.forEach((x, i) => {
            const cost = x.m.pureExpenses, sav = x.m.savings, fun = Math.max(0, x.m.pureFunFund), x0 = (sx(i) - bw / 2).toFixed(1);
            const rect = (a, b, cls) => b > a ? `<rect class="${cls}" x="${x0}" y="${sy(b).toFixed(1)}" width="${bw.toFixed(1)}" height="${(sy(a) - sy(b)).toFixed(1)}"/>` : '';
            s += rect(0, cost, x.short ? 'nlm-short' : 'nlm-cost') + rect(cost, cost + sav, 'nlm-saved') + rect(cost + sav, cost + sav + fun, 'nlm-fun');
            s += `<title>${H(monLabel(x.key))}</title>`;
          });
          return s;
        } });
    }, 200, 'Next 12 months');
  }
  function renderForecast(){
    const info = monthsInfo(), shortM = info.filter(x => x.short);
    const title = !shortM.length ? 'Every month covers costs, saving and fun.'
      : shortM.length === 1 ? `Every month but ${monLong(shortM[0].key)} covers costs, saving and fun.`
      : `${shortM.length} of 12 months run short: ${shortM.map(x => monShort(x.key)).join(', ')}.`;
    let h = NLP.card(title, 'Next 12 months. Grey: costs. Green: saved. Light green: Fun Fund. Red: a short month.', forecastChart(info) +
      NLP.legend([{ label:'Costs', color:'var(--nlm-cost)' }, { label:'Saved', color:'var(--nl-accent)' }, { label:'Fun Fund', color:'var(--nlm-fun)' }, { label:'Short month', color:'var(--nlm-short)' }]));
    h += `<div class="nl-tbl-wrap" id="nlm-fc"><table class="nl-tbl"><thead><tr><th></th><th>Month</th><th>Status</th><th class="r">Costs</th><th class="r">Saved</th><th class="r">Fun Fund</th><th class="r">Fun balance</th></tr></thead><tbody>`;
    info.forEach((x, i) => {
      const bits = [];
      if(x.carry && x.carry.amount > 0) bits.push(`Includes ${money(x.carry.amount)} carried over from ${monLong(x.carry.fromKey)}`);
      if(x.trip) bits.push(`${tripNames(x.trips)}, ${money(x.trips.reduce((s, t) => s + t.amount, 0))}, paid from Fun Fund`);
      if(x.m.hasOverride) bits.push('This month has its own changes');
      const sub = bits.length ? bits.join('. ') : 'Same as your plan';
      const badge = x.short ? NLP.badge('Short', 'ruby') : x.trip ? NLP.badge('Trip', 'amber') : NLP.badge('OK', 'green');
      h += `<tr data-nl-row="${x.key}"><td class="mk">${i + 1}</td><td><span class="nm">${H(monLabel(x.key))}</span><span class="sub">${H(sub)}</span></td><td>${badge}</td><td class="r">${H(money(x.m.pureExpenses))}</td><td class="r">${H(money(x.m.savings))}</td><td class="r${x.fun < 0 ? ' nlm-neg' : ''}">${H(money(x.fun))}</td><td class="r${x.bal < 0 ? ' nlm-neg' : ''}">${H(money(x.bal))}</td></tr>`;
    });
    h += `</tbody></table></div><p class="nlm-foot nl-note">Press a month to choose it; press again to open its lines.</p>`;
    return h;
  }

  // ── Years ahead tab ───────────────────────────────────────────────────
  function yearSource(row){
    const s = row.source || {}, vals = ['income','expenses','savings'].map(f => s[f]);
    const word = v => v == null ? 'your plan' : v === row.year ? `changed for ${row.year}` : `follows ${v}`;
    if(vals.every(v => v === vals[0])){ const w = word(vals[0]); return { text:w[0].toUpperCase() + w.slice(1), key:String(vals[0]) }; }
    const name = { income:'Income', expenses:'Costs', savings:'Saving' };
    const own = ['income','expenses','savings'].filter(f => s[f] != null).map(f => `${name[f]} ${word(s[f])}`);
    return { text:own.join(' · ') + (own.length < 3 ? ', the rest from your plan' : ''), key:vals.join('/') };
  }
  function yearBadge(row){
    const s = row.source || {}, vals = ['income','expenses','savings'].map(f => s[f]);
    if(vals.some(v => v === row.year)) return NLP.badge(`Changed for ${row.year}`, 'amber');
    const fol = vals.filter(v => v != null);
    if(fol.length) return NLP.badge(`Follows ${Math.max(...fol)}`, 'grey');
    return NLP.badge('Your plan', 'green');
  }
  function yearSugs(y){ return pendingList().filter(x => x.c.where === 'year' && (x.c.year === y)); }
  function yearsChart(rows, retireYear){
    return NLP.chartBox((w, hgt) => {
      const tops = rows.map(r => Math.max(r.income, r.expenses + r.trips + r.savings));
      const t = NLP.ticks(0, Math.max(1, ...tops), 4, NLP.moneyShort);
      const y0 = rows[0].year, y1 = rows[rows.length - 1].year, span = y1 - y0;
      const step = span > 24 ? 5 : span > 12 ? 4 : span > 6 ? 2 : 1;
      const xt = rows.filter(r => (r.year - y0) % step === 0 && r.year !== retireYear).map(r => [r.year, String(r.year)]);
      return NLP.chart({ w, h:hgt, x:[y0 - 0.6, y1 + 0.6], y:[0, t.max], yt:t.ticks, xt, pad:{ r:44 }, label:'Each year until you retire',
        draw:({ sx, sy }) => {
          const bw = Math.max(2, (sx(1) - sx(0)) * 0.64); let s = '';
          rows.forEach(r => {
            const cost = r.expenses + r.trips, sav = r.savings, fun = Math.max(0, r.net), x0 = (sx(r.year) - bw / 2).toFixed(1);
            const rect = (a, b, cls) => b > a ? `<rect class="${cls}" x="${x0}" y="${sy(b).toFixed(1)}" width="${bw.toFixed(1)}" height="${(sy(a) - sy(b)).toFixed(1)}"/>` : '';
            s += rect(0, cost, r.net < 0 ? 'nlm-short' : 'nlm-cost') + rect(cost, cost + sav, 'nlm-saved') + rect(cost + sav, cost + sav + fun, 'nlm-fun');
          });
          const rx = sx(retireYear).toFixed(1);
          s += `<line class="nlm-retire" x1="${rx}" x2="${rx}" y1="${sy(t.max)}" y2="${sy(0)}"/><text x="${rx}" y="${hgt - 6}" text-anchor="middle" class="lab">Retire</text>`;
          return s;
        } });
    }, 210, 'Years ahead');
  }
  function yearEditor(row){
    const st = ui(), ed = st.edit || (st.edit = {});
    const base = resolveYearBase(row.year);
    const opts = [['sav', 'Savings target']].concat((base.expenses || []).map((x, i) => ['e' + i, x.name]), (base.income || []).map((x, i) => ['i' + i, x.name + ' (income)']));
    if(!ed.yLine) ed.yLine = 'sav';
    const cur = ed.yLine === 'sav' ? base.savings : ed.yLine[0] === 'e' ? (base.expenses[+ed.yLine.slice(1)] || {}).amount : (base.income[+ed.yLine.slice(1)] || {}).amount;
    const nm = opts.find(o => o[0] === ed.yLine)?.[1] || 'Savings target';
    let h = `<tr class="nlm-ed"><td></td><td colspan="6"><div class="nlm-edbox">`;
    h += `<div class="nl-field"><span class="lb">What to change</span><div class="nlm-pills">${opts.map(o => `<button type="button" class="nl-gp${ed.yLine === o[0] ? ' on' : ''}" aria-pressed="${ed.yLine === o[0]}" onclick="NLM.set('yLine','${o[0]}')">${H(o[1])}</button>`).join('')}</div><span></span></div>`;
    h += `<div class="nl-field"><span class="lb">Each month from ${row.year}</span><span class="nlm-amtw"><input type="text" inputmode="decimal" id="nlm-yamt-${H(ed.yLine)}" class="nl-num-in" value="${H(toShown(cur || 0))}" aria-label="Amount each month"> <span class="nlm-cur">${H(curSym())}</span></span><span></span></div>`;
    h += `<p class="nl-note">Changes ${row.year} and every later year that follows it, until another change.</p>`;
    h += `<div class="nlm-edacts"><button type="button" class="nl-black" onclick="NLM.saveYear(${row.year})">${H(`Change ${nm.replace(/ \(income\)$/, '')} from ${row.year}`)}</button>${NLP.link('Cancel', 'NLM.close()')}</div></div></td></tr>`;
    return h;
  }
  NLM.saveYear = function(year){
    const st = ui(), ed = st.edit || {}, line = ed.yLine || 'sav';
    const el = document.getElementById('nlm-yamt-' + line), raw = el ? el.value.trim() : '';
    if(raw === '' || !(Number(raw.replace(/\s/g, '').replace(',', '.')) >= 0)){ NLP.toast('Type an amount of 0 or more.', 'warn'); return; }
    const amount = fromShown(raw), base = resolveYearBase(year);
    let label;
    if(line === 'sav') label = `Savings target: ${money(base.savings)} → ${money(amount)} a month · from ${year}`;
    else {
      const field = line[0] === 'e' ? 'expenses' : 'income', it = (base[field] || [])[+line.slice(1)];
      if(!it) return;
      label = `${it.name}: ${money(it.amount)} → ${money(amount)} a month · from ${year}`;
    }
    const ok = NLP.record(label, s => {
      if(!s.yearlyBases) s.yearlyBases = {};
      const b = s.yearlyBases[String(year)] || (s.yearlyBases[String(year)] = {});
      if(line === 'sav') b.savings = amount;
      else {
        const field = line[0] === 'e' ? 'expenses' : 'income';
        if(!Array.isArray(b[field])) b[field] = clone(resolveYearBase(year)[field] || []);
        const it = b[field][+line.slice(1)]; if(!it) throw new Error('that line is gone');
        it.amount = amount;
      }
      b.cascade = true;
    });
    if(ok !== false){ st.open = null; st.edit = null; NLP.renderPage(PANEL); }
  };
  NLM.yearsAll = function(){ const st = ui(); st.yearsAll = !st.yearsAll; NLP.renderPage(PANEL); };
  function yearsModel(){
    const rows = getYearlyPlan();
    const retireYear = rows.length ? rows[rows.length - 1].year : CY;
    return { rows, retireYear };
  }
  function renderYears(){
    const st = ui(), { rows, retireYear } = yearsModel();
    if(!rows.length) return NLP.empty('No years to show yet. Set your age and retirement age in Settings.');
    const r0 = rows[0], ref = rows.find(r => r.year === CY + 1) || r0;
    const later = rows.find(r => r.year > ref.year && Math.round(r.net / 12) !== Math.round(ref.net / 12));
    const avg = r => r.net / 12;
    const title = later ? `From ${later.year} you keep about ${money(roundTo(Math.abs(avg(later) - avg(ref))))} ${avg(later) > avg(ref) ? 'more' : 'less'} a month for fun than in ${ref.year}.`
      : avg(ref) >= 0 ? `From ${ref.year} until you retire, every year leaves about ${money(roundTo(avg(ref)))} a month for fun.`
      : `From ${ref.year} until you retire, every year runs short.`;
    let h = NLP.card(title, `Each year from ${r0.year} to ${retireYear}, a month at a time, in today's money. No raises unless you add them.`, yearsChart(rows, retireYear) +
      NLP.legend([{ label:'Costs', color:'var(--nlm-cost)' }, { label:'Saved', color:'var(--nl-accent)' }, { label:'Fun Fund', color:'var(--nlm-fun)' }, { label:'Short year', color:'var(--nlm-short)' }]));
    h += `<div class="nl-tbl-wrap" id="nlm-yr"><table class="nl-tbl"><thead><tr><th></th><th>Year, and where its numbers come from</th><th>Status</th><th class="r">In a month</th><th class="r">Costs</th><th class="r">Saved</th><th class="r">Fun Fund</th></tr></thead><tbody>`;
    // Group long runs of identical years that follow the same source.
    const sig = r => { const s = yearSource(r); return s.key + '|' + Math.round(r.income) + '|' + Math.round(r.expenses + r.trips) + '|' + Math.round(r.savings) + '|' + r.overrideMonths; };
    const hide = new Set();
    if(!st.yearsAll){
      let i = 0;
      while(i < rows.length){
        let j = i; while(j + 1 < rows.length && sig(rows[j + 1]) === sig(rows[i]) && yearSugs(rows[j + 1].year).length === 0) j++;
        // keep the first two of a run and the retirement year
        for(let k = i + 2; k <= j; k++) if(rows[k].year !== retireYear) hide.add(rows[k].year);
        i = j + 1;
      }
    }
    const rowHtml = (r, n) => {
      const src = yearSource(r), sugs = yearSugs(r.year);
      let sub = H(src.text);
      if(r.overrideMonths) sub += ` · ${r.overrideMonths} month${r.overrideMonths > 1 ? 's' : ''} with their own changes`;
      if(r.trips) sub += ` · trips ${H(money(r.trips))}`;
      if(r.year === retireYear) sub += `. You retire this year, at ${r.age}. <span class="nl-inrow">${NLP.link('See retirement on Future', "NLP.go('nl-future')")}</span>`;
      let extra = '';
      if(sugs.length) extra = `<span class="sub">${sugs.map(x => H(x.c.label || x.c.name || '')).join('<br>')}</span>${sugLinks(sugs[0])}`;
      const badge = sugs.length ? NLP.badge('Suggested', 'amber') : r.year === retireYear ? NLP.badge('Retire', 'steel') : yearBadge(r);
      return `<tr data-nl-row="${r.year}" class="${sugs.length ? 'sug' : ''}"><td class="mk">${n}</td><td><span class="nm">${r.year}</span><span class="sub">${sub}</span>${extra}</td><td>${badge}</td><td class="r">${H(money(r.income / 12))}</td><td class="r">${H(money((r.expenses + r.trips) / 12))}</td><td class="r">${H(money(r.savings / 12))}</td><td class="r${r.net < 0 ? ' nlm-neg' : ''}">${H(money(r.net / 12))}</td></tr>`
        + (st.open === String(r.year) ? yearEditor(r) : '');
    };
    let k = 0;
    while(k < rows.length){
      const r = rows[k];
      if(hide.has(r.year)){
        let j = k; while(j + 1 < rows.length && hide.has(rows[j + 1].year)) j++;
        const first = rows[k].year, last = rows[j].year, cnt = j - k + 1, src = yearSource(r).text.toLowerCase();
        h += `<tr><td class="mk">·</td><td colspan="6"><span class="sub nlm-runs">${first} to ${last}: ${cnt} more years, ${H(src)}. ${NLP.link('Show all', 'NLM.yearsAll()')}</span></td></tr>`;
        k = j + 1; continue;
      }
      h += rowHtml(r, k + 1); k++;
    }
    h += `</tbody></table></div><p class="nlm-foot nl-note">Press a year to choose it, press again to change it. Changing a year makes every later year follow it, until another change.${st.yearsAll ? ' ' + NLP.link('Show fewer years', 'NLM.yearsAll()') : ''}</p>`;
    return h;
  }

  // ── Bank files tab ────────────────────────────────────────────────────
  const needsYou = t => (Number(t.amount) || 0) < 0 && (!t.category || norm(t.category) === 'other');
  function planLineFor(t){
    const lines = (state.baseExpenses || []);
    const tn = norm(t.name), cat = norm(t.category);
    return lines.find(l => { const nn = norm(l.name); if(cat && cat !== 'other' && (cat === nn || (nn.length >= 4 && cat.includes(nn)))) return true; return keywordsFor(l.name).some(k => hasWord(tn, k)); }) || null;
  }
  function categories(){
    const set = new Set(); txs().forEach(t => { const c = String(t.category || '').trim(); if(c && norm(c) !== 'other' && norm(c) !== 'income') set.add(c); });
    (state.baseExpenses || []).forEach(l => set.add(l.name));
    return [...set].sort((a, b) => a.localeCompare(b));
  }
  NLM.pickFile = function(){ const i = document.getElementById('nlm-file'); if(i) i.click(); };
  NLM.fileChosen = function(input){
    const f = input && input.files && input.files[0]; if(!f) return;
    if(typeof siHandleFile !== 'function'){ NLP.toast('The bank file reader is not available.', 'warn'); return; }
    siHandleFile(f); input.value = '';
    setTimeout(() => { const st = ui(); st.tab = 'bank'; st.chosen = null; st.open = null; NLP.renderPage(PANEL); if(txs().length) NLP.toast(`${txs().length} bank rows read. The file stays on this device.`); }, 400);
  };
  NLM.readPaste = function(){
    const box = document.getElementById('nlm-paste'), text = box ? box.value.trim() : '';
    if(!text){ NLP.toast('Paste some rows from your bank first.', 'warn'); box && box.focus(); return; }
    if(typeof _siIngestText !== 'function'){ NLP.toast('The bank file reader is not available.', 'warn'); return; }
    const before = txs();
    _siIngestText(text, 'pasted rows');
    if(txs() !== before){ box.value = ''; NLP.toast(`${txs().length} bank rows read. They stay on this device.`); }
    NLP.renderPage(PANEL);
  };
  NLM.bankChip = function(k){
    const st = ui();
    if(k === 'need'){ st.bNeed = !st.bNeed; st.bPick = null; }
    else if(k === 'cat'){ if(st.bCat){ st.bCat = null; st.bPick = null; } else st.bPick = st.bPick === 'cat' ? null : 'cat'; }
    else if(k === 'mon'){ if(st.bMon){ st.bMon = null; st.bPick = null; } else st.bPick = st.bPick === 'mon' ? null : 'mon'; }
    st.chosen = null; st.open = null; st.bShow = 0; NLP.renderPage(PANEL);
  };
  NLM.bankPick = function(i){
    const st = ui(), list = st.bPick === 'cat' ? NLM._bankCats : NLM._bankMons; const val = list && list[i]; if(val == null) return;
    if(st.bPick === 'cat') st.bCat = val; else st.bMon = val;
    st.bPick = null; st.chosen = null; st.open = null; NLP.renderPage(PANEL);
  };
  NLM.bankMore = function(){ const st = ui(); st.bShow = (st.bShow || 0) + 1; NLP.renderPage(PANEL); };
  NLM.setCat = function(i){
    const st = ui(), cats = NLM._editCats || [], cat = i === -1 ? (document.getElementById('nlm-newcat')?.value || '').trim() : cats[i];
    if(!cat){ NLP.toast('Type a name for the new category.', 'warn'); return; }
    const t = txs().find(x => String(x.id) === String(st.open)); if(!t) return;
    const same = txs().filter(x => x !== t && norm(x.name) === norm(t.name) && needsYou(x));
    t.category = cat; same.forEach(x => { x.category = cat; });
    state.spendInsights = null;
    st.open = null; st.edit = null;
    save();
    NLP.toast(same.length ? `${same.length + 1} rows sorted as ${cat}` : `Sorted as ${cat}`);
    NLP.renderPage(PANEL);
  };
  NLM.chooseFirstNeed = function(){
    const t = txs().filter(needsYou).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]; if(!t) return;
    const st = ui(); st.tab = 'bank'; st.bNeed = true; st.chosen = String(t.id); st.open = String(t.id); NLP.renderPage(PANEL);
  };
  function emptyBank(){
    return `<div class="nlm-emptybank">
      <h2 class="nl-ct">Add a bank file to compare your plan with what really goes out.</h2>
      <p class="nl-cs">A CSV or TSV export from your bank, or rows copied from your bank's website. The file is read on this device and stays here.</p>
      <div class="nlm-edacts"><button type="button" class="nl-black" onclick="NLM.pickFile()">Choose a bank file</button></div>
      <div class="nl-field nlm-paste"><span class="lb">Or paste rows</span><textarea id="nlm-paste" rows="4" placeholder="2026-11-14   ICA Maxi   -842,50"></textarea><span></span></div>
      <div class="nlm-edacts">${NLP.pill('Read these rows', 'NLM.readPaste()')}</div></div>`;
  }
  function catBars(){
    const all = txs(), mons = [...new Set(all.map(t => String(t.date || '').slice(0, 7)).filter(k => /^\d{4}-\d{2}$/.test(k)))].sort();
    const last = mons[mons.length - 1]; if(!last) return '';
    const by = {}; all.forEach(t => { const a = Number(t.amount) || 0; if(a >= 0 || String(t.date || '').slice(0, 7) !== last) return; const c = String(t.category || 'Other').trim() || 'Other'; by[c] = (by[c] || 0) + Math.abs(a); });
    let cats = Object.entries(by).sort((a, b) => b[1] - a[1]);
    if(!cats.length) return '';
    if(cats.length > 7){ const rest = cats.slice(6).reduce((s, c) => s + c[1], 0); cats = cats.slice(0, 6).concat([['Everything else', rest]]); }
    const total = cats.reduce((s, c) => s + c[1], 0), mx = cats[0][1];
    const top = cats.filter(c => c[0] !== 'Everything else').slice(0, 2), share = Math.round(top.reduce((s, c) => s + c[1], 0) / total * 100);
    const title = top.length === 2 ? `${monLong(last)}: ${top[0][0]} and ${top[1][0]} are ${share}% of what went out.` : `${monLong(last)}: ${top[0][0]} is ${share}% of what went out.`;
    const bars = cats.map(c => `<div class="nlm-cb"><span class="nlm-cbn">${H(c[0])}</span><span class="nlm-cbt"><i style="width:${Math.max(1, c[1] / mx * 100).toFixed(1)}%"></i></span><span class="nlm-cbv">${H(money(c[1]))}</span></div>`).join('');
    return NLP.card(title, 'Spending by category in the latest month of your bank file.', bars);
  }
  function renderBank(){
    if(!txs().length) return emptyBank();
    const st = ui(), all = txs().slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const need = all.filter(needsYou).length;
    let list = all;
    if(st.bNeed) list = list.filter(needsYou);
    if(st.bCat) list = list.filter(t => String(t.category || 'Other') === st.bCat);
    if(st.bMon) list = list.filter(t => String(t.date || '').slice(0, 7) === st.bMon);
    NLM._bankCats = [...new Set(all.filter(t => !st.bMon || String(t.date || '').slice(0, 7) === st.bMon).map(t => String(t.category || 'Other')))].sort();
    NLM._bankMons = [...new Set(all.filter(t => !st.bCat || String(t.category || 'Other') === st.bCat).map(t => String(t.date || '').slice(0, 7)).filter(k => /^\d{4}-\d{2}$/.test(k)))].sort().reverse();
    let h = catBars();
    const chip = (on, label, fn) => `<button type="button" class="nl-chip${on ? ' on' : ''}" aria-pressed="${!!on}" onclick="${fn}">${H(label)}</button>`;
    h += `<div class="nl-chips">${need || st.bNeed ? chip(st.bNeed, st.bNeed ? `Needs you · ${need} ×` : `+ Needs you · ${need}`, "NLM.bankChip('need')") : ''}${chip(st.bCat, st.bCat ? `${st.bCat} ×` : '+ Category', "NLM.bankChip('cat')")}${chip(st.bMon, st.bMon ? `${monLabel(st.bMon)} ×` : '+ Month', "NLM.bankChip('mon')")}</div>`;
    if(st.bPick){
      const vals = st.bPick === 'cat' ? NLM._bankCats : NLM._bankMons;
      h += `<div class="nlm-pills nlm-pick">${vals.map((v, i) => `<button type="button" class="nl-gp" onclick="NLM.bankPick(${i})">${H(st.bPick === 'cat' ? v : monLabel(v))}</button>`).join('')}</div>`;
    }
    const limit = 100 * ((st.bShow || 0) + 1), shown = list.slice(0, limit);
    const fileWord = state.spendMeta && state.spendMeta.accountType === 'credit' ? 'Card file' : 'Bank file';
    h += `<div class="nl-tbl-wrap" id="nlm-bank"><table class="nl-tbl"><thead><tr><th></th><th>Bank row, in the bank's own words</th><th>Sorted into</th><th>Status</th><th class="r">Amount</th></tr></thead><tbody>`;
    const cats = categories(); NLM._editCats = cats;
    shown.forEach(t => {
      const id = String(t.id != null ? t.id : (t.date + t.name + t.amount)), a = Number(t.amount) || 0, nu = needsYou(t);
      const line = !nu && a < 0 ? planLineFor(t) : null;
      const badge = nu ? NLP.badge('Needs you', 'ruby') : a > 0 ? NLP.badge('Money in', 'steel') : line ? NLP.badge('Matches plan', 'green') : NLP.badge('Sorted', 'grey');
      const d = String(t.date || ''), day = d.slice(8, 10).replace(/^0/, '');
      const sub = `${H(d ? new Date(d + 'T12:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '')} · ${fileWord}${line ? ' · plan line ' + H(line.name) : ''}`;
      h += `<tr data-nl-row="${H(id)}"><td class="mk">${H(day)}</td><td><span class="nm nlm-bw">“${H(t.name || 'Transaction')}”</span><span class="sub">${sub}</span></td><td>${nu ? '<span class="sub nlm-m0">Not sure</span>' : H(t.category || '')}</td><td>${badge}</td><td class="r${a < 0 ? '' : ' nlm-pos'}">${H(money(a))}</td></tr>`;
      if(st.open === id){
        const same = all.filter(x => x !== t && norm(x.name) === norm(t.name) && needsYou(x)).length;
        h += `<tr class="nlm-ed"><td></td><td colspan="4"><div class="nlm-edbox"><div class="nl-field"><span class="lb">Sort into</span><div class="nlm-pills">${cats.map((c, i) => `<button type="button" class="nl-gp${norm(c) === norm(t.category) ? ' on' : ''}" onclick="NLM.setCat(${i})">${H(c)}</button>`).join('')}</div><span></span></div>
          <div class="nl-field"><span class="lb">Or a new category</span><input type="text" id="nlm-newcat" maxlength="40" placeholder="For example Cleaning tip"><span>${NLP.pill('Use it', 'NLM.setCat(-1)')}</span></div>
          <p class="nl-note">${same ? `${same} more row${same > 1 ? 's' : ''} with the same words will be sorted too. ` : ''}Bank rows are not part of Undo.</p><div class="nlm-edacts">${NLP.link('Cancel', 'NLM.close()')}</div></div></td></tr>`;
      }
    });
    if(!shown.length) h += `<tr><td></td><td colspan="4"><span class="sub">No rows match these filters.</span></td></tr>`;
    h += `</tbody></table></div>`;
    if(list.length > shown.length) h += `<p class="nlm-foot">${NLP.link(`Show ${Math.min(100, list.length - shown.length)} more of ${list.length - shown.length}`, 'NLM.bankMore()')}</p>`;
    return h;
  }

  // ── History tab ───────────────────────────────────────────────────────
  const timeLabel = at => { const d = new Date(at); return new Date().toDateString() === d.toDateString() ? 'Today ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) : d.toLocaleDateString('en-GB', { day:'numeric', month:'short' }); };
  NLM.histWho = function(w){ const st = ui(); st.hWho = st.hWho === w ? null : w; st.chosen = null; NLP.renderPage(PANEL); };
  function renderHistory(){
    const st = ui(), all = nlHistory();
    if(!all.length) return NLP.empty('No changes yet. Changes you make here, and changes Horizon prepares that you apply, are listed here.');
    const u = typeof window.nlUndoState === 'function' ? window.nlUndoState() : { ok:false, why:'' };
    const nH = all.filter(e => e.by !== 'You').length, nY = all.length - nH;
    const chip = (k, label) => `<button type="button" class="nl-chip${st.hWho === k ? ' on' : ''}" aria-pressed="${st.hWho === k}" onclick="NLM.histWho('${k}')">${H(st.hWho === k ? label + ' ×' : '+ ' + label)}</button>`;
    let h = `<div class="nl-chips">${nH ? chip('Horizon', `Prepared by Horizon · ${nH}`) : ''}${nY ? chip('You', `Made by you · ${nY}`) : ''}</div>`;
    h += `<div class="nl-tbl-wrap" id="nlm-hist"><table class="nl-tbl"><thead><tr><th></th><th>What changed</th><th>Who</th><th class="r">When</th></tr></thead><tbody>`;
    all.forEach((e, i) => {
      const by = e.by === 'You' ? 'You' : 'Horizon';
      if(st.hWho && st.hWho !== by) return;
      const more = e.items.length > 1 ? `<span class="sub">${e.items.slice(1).map(H).join('<br>')}</span>` : '';
      let sub = by === 'You' ? 'Changed by you' : 'Prepared by Horizon, applied by you';
      if(e.ask) sub += ` · from your message ${NLP.quote(String(e.ask).slice(0, 80))}`;
      let act = '';
      if(i === 0 && !e.undone) act = u.ok ? `<span class="nl-inrow">${NLP.link('Undo this change', 'nlUndo()')}</span>` : `<span class="sub">${H(u.why)}</span>`;
      h += `<tr data-nl-row="${H(e.id)}"><td class="mk">${i + 1}</td><td><span class="nm">${H(e.items[0] || '')}</span>${more}<span class="sub">${sub}</span>${act}</td><td>${NLP.badge(by, by === 'You' ? 'grey' : 'steel')}${e.undone ? ' ' + NLP.badge('Undone', 'grey') : ''}</td><td class="r nlm-when">${H(timeLabel(e.at))}</td></tr>`;
    });
    h += `</tbody></table></div><p class="nlm-foot nl-note">Nothing changes without your press, so every line here was approved by you.</p>`;
    return h;
  }

  // ── The page ──────────────────────────────────────────────────────────
  function render(host){
    const st = ui(), tab = st.tab || 'plan';
    let counts = { plan:0, years:0 };
    try { const pr = planRows(); counts.plan = pr.rows.filter(r => r.kind === 'line').length; } catch(_){}
    try { counts.years = getYearlyPlan().length; } catch(_){}
    const nb = txs().length, nh = nlHistory().length;
    const tabs = [
      { key:'plan', label:'Plan', count:counts.plan, on:tab === 'plan', keep:true },
      { key:'forecast', label:'Forecast', count:12, on:tab === 'forecast' },
      { key:'years', label:'Years ahead', count:counts.years || null, on:tab === 'years' },
      { key:'bank', label:'Bank files', count:nb || null, on:tab === 'bank' },
      { key:'history', label:'History', count:nh || null, on:tab === 'history' },
    ];
    let actions = '';
    if(tab === 'plan') actions = `<span class="nlm-wide">${monthChooser()}${NLP.pill(nb ? 'Load a new bank file' : 'Add a bank file', 'NLM.pickFile()')}</span>`;
    if(tab === 'bank' && nb) actions = NLP.pill('Load a new bank file', 'NLM.pickFile()', 'title="A new file replaces the rows you have now"');
    let body = '';
    if(tab === 'plan') body = renderPlan();
    else if(tab === 'forecast') body = renderForecast();
    else if(tab === 'years') body = renderYears();
    else if(tab === 'bank') body = renderBank();
    else body = renderHistory();
    host.innerHTML = `<div class="nl-wrap">${NLP.head({ title:'Money plan', tabs, actions, panel:PANEL })}${body}<input type="file" id="nlm-file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onchange="NLM.fileChosen(this)"></div>`;
    const wrap = host.querySelector('.nl-tbl-wrap');
    if(tab === 'plan') NLP.rows(wrap, PANEL, id => { const r = NLM._rows[id]; if(!r) return; if(r.kind === 'line' || r.kind === 'savings') openRow(id); else if(r.kind === 'trip') NLP.go('nl-plans'); });
    if(tab === 'forecast') NLP.rows(wrap, PANEL, id => NLM.goMonth(id));
    if(tab === 'years') NLP.rows(wrap, PANEL, id => openRow(id));
    if(tab === 'bank' && wrap) NLP.rows(wrap, PANEL, id => openRow(id));
    if(tab === 'history' && wrap) NLP.rows(wrap, PANEL, null);
  }

  // ── The side panel's Overview (never money: counts, %, words) ─────────
  const door = (text, badge, link, why) => ({ text, badge, link, why });
  function overviewPlan(){
    const st = ui(), { v, rows } = planRows(), info = monthsInfo();
    const bal = info.map(x => x.bal);
    const graphic = `<div class="nlm-gl">Fun Fund balance, next 12 months</div>${NLP.minibars(bal, [monShort(info[0].key), monShort(info[info.length - 1].key)])}`;
    const r = st.chosen && (NLM._rows || {})[st.chosen];
    const diffs = bankDiffs();
    const me = info.find(x => x.key === v.key);
    if(r){
      const groups = [];
      let headline, button;
      if(r.kind === 'carry'){
        headline = r.list === 'expenses' ? `${monLong(v.key)} starts with a gap carried over from ${monLong(r.item.fromKey)}.` : `${monLong(v.key)} starts with money left over from ${monLong(r.item.fromKey)}.`;
        const prev = info.find(x => x.key === r.item.fromKey);
        groups.push({ title:'Why', rows:[door(H(prev ? (prev.short ? `${monLong(prev.key)} was short: ${whyShort(prev)}.` : `${monLong(prev.key)} ended with money left.`) : `It comes from ${monLong(r.item.fromKey)}.`), null, { label:'See it on Forecast', onclick:"NLM.tab('forecast')" })] });
        if(me && me.short){ const f = savingsFix(me); if(f) groups.push({ title:'A way to fix it', rows:[door(H(`Save less in ${monLong(v.key)} only`), f.fixesIt ? { text:'No short month', kind:'green' } : { text:'Helps', kind:'amber' }, { label:'Prepare this', onclick:`NLM.proposeFix('${v.key}')` })] }); button = { label:`Prepare a fix for ${monLong(v.key)}`, onclick:`NLM.proposeFix('${v.key}')` }; }
        return { headline, graphic, groups, button:button || { label:'See it on Forecast', onclick:"NLM.tab('forecast')" } };
      }
      if(r.kind === 'trip') return { headline:`${r.name} is a trip cost from Plans.`, graphic, groups:[{ title:'This line', rows:[door('Trip costs are kept with the trip, so change them there.', { text:'Trip', kind:'steel' }, { label:'Open trips in Plans', onclick:"NLP.go('nl-plans')" })] }], button:{ label:'Open trips in Plans', onclick:"NLP.go('nl-plans')" } };
      if(isSug(r)) return { headline:`${r.name} has a change waiting for you.`, graphic, groups:[], button:null };
      if(r.kind === 'savings') return { headline:`Your savings target, ${monLong(v.key)}.`, graphic, groups:[{ title:'Where it comes from', rows:[door(H(r.src.text), r.src.only ? { text:'This month only', kind:'steel' } : { text:'Plan', kind:'grey' })] }], button:{ label:'Change the savings target', onclick:`NLM.open('sav')` } };
      const b = r.bank, s = r.status;
      headline = s.key === 'high' ? `${r.name} runs about ${s.pct}% higher at the bank than in your plan.` : s.key === 'low' ? `${r.name} runs about ${s.pct}% lower at the bank than in your plan.` : s.key === 'match' ? `${r.name} matches the bank.` : txs().length ? `${r.name} is not seen in the bank file.` : `${r.name} comes from your plan.`;
      if(b && b.found) groups.push({ title:'In the bank file', rows:[door(quotes(b.names), { text:s.text, kind:s.kind }, null, H(`${b.count} row${b.count > 1 ? 's' : ''}, ${rangeText(b.months)}, averaged over ${b.months.length} month${b.months.length > 1 ? 's' : ''}.`))] });
      groups.push({ title:'Where the number comes from', rows:[door(H(r.src.text), r.src.only ? { text:'This month only', kind:'steel' } : null, { label:`Change ${r.name}`, onclick:`NLM.open(${JSON.stringify(r.id)})` })] });
      const inPlan = (state.baseExpenses || []).some(x => norm(x.name) === norm(r.name));
      if((s.key === 'high' || s.key === 'low') && r.list === 'expenses' && inPlan) button = { label:'Prepare the bank amount', onclick:`NLM.proposeBank(${JSON.stringify(r.name)})` };
      else button = { label:`Change ${r.name}`, onclick:`NLM.open(${JSON.stringify(r.id)})` };
      return { headline, graphic, groups, button };
    }
    const shorts = info.filter(x => x.short);
    const headline = me && me.short ? `${monLong(v.key)} runs short.` : diffs.length ? `${diffs.length} line${diffs.length > 1 ? 's' : ''} differ${diffs.length > 1 ? '' : 's'} from the bank.` : shorts.length ? `${monLong(v.key)} covers every line.` : `${monLong(v.key)} covers every line, and so does every month ahead.`;
    const groups = [];
    if(diffs.length) groups.push({ title:'Worth a look', rows:diffs.slice(0, 5).map(d => door(H(d.name), { text:d.status.text, kind:d.status.kind }, { label:'Prepare this change', onclick:`NLM.proposeBank(${JSON.stringify(d.name)})` }, H(`About ${d.status.pct}% ${d.status.key === 'high' ? 'more' : 'less'} at the bank than in your plan.`))) });
    if(shorts.length) groups.push({ title:'Short months', rows:shorts.slice(0, 3).map(x => door(H(`${monLong(x.key)} runs short`), { text:'Short', kind:'ruby' }, { label:'See why on Forecast', onclick:"NLM.tab('forecast')" })) });
    if(!txs().length) groups.push({ title:'Bank file', rows:[door('No bank file yet, so lines show your plan only.', { text:'Plan only', kind:'grey' }, { label:'Add a bank file', onclick:'NLM.pickFile()' })] });
    const button = diffs.length ? { label:`Prepare ${diffs.length} change${diffs.length > 1 ? 's' : ''} from the bank`, onclick:'NLM.proposeBank()' } : { label:'Add a line', onclick:'NLM.addLine()' };
    return { headline, graphic, groups, button };
  }
  function overviewForecast(){
    const st = ui(), info = monthsInfo(), shorts = info.filter(x => x.short);
    const graphic = `<div class="nlm-gl">Fun Fund balance, next 12 months</div>${NLP.minibars(info.map(x => x.bal), [monShort(info[0].key), monShort(info[11].key)])}`;
    const chosen = st.chosen && info.find(x => x.key === st.chosen);
    const fixRows = list => list.map(x => { const f = savingsFix(x); return f ? door(H(`Save less in ${monLong(x.key)} only`), f.fixesIt ? (f.still.length ? { text:`${f.still.length} still short`, kind:'amber' } : { text:'No short month', kind:'green' }) : { text:'Helps', kind:'amber' }, { label:'Prepare this', onclick:`NLM.proposeFix('${x.key}')` }) : null; }).filter(Boolean);
    if(chosen){
      const groups = [];
      if(chosen.short){
        groups.push({ title:'Why', rows:[door(H(whyShort(chosen)[0].toUpperCase() + whyShort(chosen).slice(1) + '.'), { text:'Short', kind:'ruby' })] });
        const fr = fixRows([chosen]); if(fr.length) groups.push({ title:'A way to fix it, prepared for you', rows:fr });
      } else if(chosen.trip) groups.push({ title:'This month', rows:[door(H(`${tripNames(chosen.trips)} is paid from Fun Fund.`), { text:'Trip', kind:'amber' }, { label:'Open trips in Plans', onclick:"NLP.go('nl-plans')" })] });
      else groups.push({ title:'This month', rows:[door(chosen.m.hasOverride ? 'This month has its own changes.' : 'Same as your plan.', { text:'OK', kind:'green' })] });
      return { headline:chosen.short ? `${monLong(chosen.key)} runs short.` : `${monLong(chosen.key)} covers costs, saving and fun.`, graphic, groups,
        button:chosen.short && savingsFix(chosen) ? { label:`Prepare a fix for ${monLong(chosen.key)}`, onclick:`NLM.proposeFix('${chosen.key}')` } : { label:`Open ${monLong(chosen.key)}'s lines`, onclick:`NLM.goMonth('${chosen.key}')` } };
    }
    if(!shorts.length) return { headline:'No month runs short in the next 12.', graphic, groups:[{ title:'Trips', rows:info.filter(x => x.trip).map(x => door(H(`${monLong(x.key)}: ${tripNames(x.trips)}`), { text:'Trip', kind:'amber' }, { label:'Open its lines', onclick:`NLM.goMonth('${x.key}')` })) }], button:{ label:'Plan years ahead', onclick:"NLM.tab('years')" } };
    const groups = [];
    const fr = fixRows(shorts.slice(0, 1)); if(fr.length) groups.push({ title:'A way to fix it, prepared for you', rows:fr });
    groups.push({ title:shorts.length > 3 ? `Short months, first 3 of ${shorts.length}` : 'Short months', rows:shorts.slice(0, 3).map(x => door(H(monLong(x.key)), { text:'Short', kind:'ruby' }, { label:'Open its lines', onclick:`NLM.goMonth('${x.key}')` }, H(whyShort(x)[0].toUpperCase() + whyShort(x).slice(1) + '.'))) });
    return { headline:shorts.length === 1 ? `${monLong(shorts[0].key)} is the only short month.` : `${shorts.length} months run short.`, graphic, groups,
      button:fr.length ? { label:`Prepare a fix for ${monLong(shorts[0].key)}`, onclick:`NLM.proposeFix('${shorts[0].key}')` } : { label:`Open ${monLong(shorts[0].key)}'s lines`, onclick:`NLM.goMonth('${shorts[0].key}')` } };
  }
  function overviewYears(){
    const st = ui(), { rows, retireYear } = yearsModel();
    if(!rows.length) return { headline:'No years to show yet.', groups:[] };
    const changed = rows.filter(r => Object.values(r.source || {}).some(v => v === r.year));
    const shortY = rows.filter(r => r.net < 0);
    const graphic = `<div class="nlm-gl">Fun Fund each year, ${rows[0].year} to ${retireYear}</div>${NLP.minibars(rows.map(r => r.net), [String(rows[0].year), String(retireYear)])}`;
    const chosen = st.chosen && rows.find(r => String(r.year) === String(st.chosen));
    if(chosen){
      const src = yearSource(chosen);
      return { headline:`${chosen.year}: ${src.text[0].toLowerCase() + src.text.slice(1)}.`, graphic, groups:[{ title:'This year', rows:[
        door(H(src.text), chosen.net < 0 ? { text:'Short', kind:'ruby' } : null, { label:`Change ${chosen.year}`, onclick:`NLM.open('${chosen.year}')` }, chosen.overrideMonths ? H(`${chosen.overrideMonths} month${chosen.overrideMonths > 1 ? 's have' : ' has'} its own changes.`) : ''),
        ...(chosen.year === retireYear ? [door('You retire this year. After it, your retirement budget takes over.', { text:'Retire', kind:'steel' }, { label:'Open Future', onclick:"NLP.go('nl-future')" })] : [])] }],
        button:{ label:`Change ${chosen.year} and later`, onclick:`NLM.open('${chosen.year}')` } };
    }
    const groups = [];
    if(changed.length) groups.push({ title:'Years with their own changes', rows:changed.slice(0, 5).map(r => door(String(r.year), { text:'Changed', kind:'amber' }, { label:'Show in table', onclick:`NLP.choose('${PANEL}','${r.year}')` })) });
    if(shortY.length) groups.push({ title:'Short years', rows:shortY.slice(0, 3).map(r => door(String(r.year), { text:'Short', kind:'ruby' }, { label:'Show in table', onclick:`NLP.choose('${PANEL}','${r.year}')` })) });
    groups.push({ title:'Worth a look', rows:[door(`From ${retireYear + 1} your retirement budget takes over.`, { text:'Info', kind:'steel' }, { label:'Open Future', onclick:"NLP.go('nl-future')" })] });
    const headline = shortY.length ? `${shortY.length} year${shortY.length > 1 ? 's run' : ' runs'} short before you retire.` : changed.length ? `${changed.length} year${changed.length > 1 ? 's have' : ' has'} its own changes; later years follow them.` : `Every year follows your plan until you retire in ${retireYear}.`;
    const next = rows.find(r => r.year > CY) || rows[0];
    return { headline, graphic, groups, button:{ label:`Change ${next.year} and later`, onclick:`NLP.choose('${PANEL}','${next.year}');NLM.open('${next.year}')` } };
  }
  function overviewBank(){
    const all = txs();
    if(!all.length) return { headline:'No bank file yet.', groups:[{ title:'What a bank file adds', rows:[door('Each plan line shows what the bank really took, in its own words.', { text:'Plan', kind:'grey' }), door('Lines that differ from the bank can be prepared as changes for you to apply.', { text:'Bank', kind:'steel' })] }], button:{ label:'Choose a bank file', onclick:'NLM.pickFile()' } };
    const st = ui(), need = all.filter(needsYou), debits = all.filter(t => (Number(t.amount) || 0) < 0);
    const sorted = debits.length - need.length, pct = debits.length ? Math.round(sorted / debits.length * 100) : 100;
    const graphic = `<div class="nlm-gl">Rows sorted into a category</div><div class="nlm-cap"><i style="width:${pct}%"></i></div><div class="nlm-gl">${sorted} of ${debits.length} spending rows</div>`;
    const diffs = bankDiffs(), groups = [];
    const t = st.chosen && all.find(x => String(x.id) === String(st.chosen));
    if(t){
      const line = planLineFor(t);
      groups.push({ title:'This row', rows:[door(NLP.quote(t.name || ''), needsYou(t) ? { text:'Needs you', kind:'ruby' } : { text:t.category || 'Sorted', kind:'green' }, { label:needsYou(t) ? 'Choose a category' : 'Change its category', onclick:`NLM.open(${JSON.stringify(String(t.id))})` }, line ? H(`Counts toward your plan line ${line.name}.`) : '')] });
    }
    if(diffs.length) groups.push({ title:'What the file tells your plan', rows:diffs.slice(0, 3).map(d => door(H(`${d.name} runs ${d.status.key === 'high' ? 'higher' : 'lower'} than planned`), { text:`${d.status.pct}% ${d.status.key === 'high' ? 'more' : 'less'}`, kind:d.status.kind }, { label:'Prepare this change', onclick:`NLM.proposeBank(${JSON.stringify(d.name)})` })) });
    const unseen = (state.baseExpenses || []).filter(l => !bankFor(l.name, 'expenses').found);
    if(unseen.length && !t) groups.push({ title:'Not seen in the file', rows:unseen.slice(0, 2).map(l => door(H(`${l.name} is not in this file`), { text:'Info', kind:'steel' }, null, 'Perhaps paid from another account.')) });
    const headline = need.length ? `${need.length} row${need.length > 1 ? 's need' : ' needs'} a category.${sorted ? ` The other ${sorted} ${sorted > 1 ? 'are' : 'is'} sorted.` : ''}` : diffs.length ? `${diffs.length} plan line${diffs.length > 1 ? 's differ' : ' differs'} from the bank.` : 'Every row is sorted, and the plan matches the bank.';
    const button = t && needsYou(t) ? { label:'Choose a category', onclick:`NLM.open(${JSON.stringify(String(t.id))})` } : need.length ? { label:'Sort the newest row', onclick:'NLM.chooseFirstNeed()' } : diffs.length ? { label:`Prepare ${diffs.length} change${diffs.length > 1 ? 's' : ''} from the bank`, onclick:'NLM.proposeBank()' } : { label:'Load a new bank file', onclick:'NLM.pickFile()' };
    return { headline, graphic, groups, button, links:[{ label:'Your file stays on this device', short:'On this device', onclick:"NLP.toast('The bank file is read and kept on this device only.')" }] };
  }
  function overviewHistory(){
    const st = ui(), all = nlHistory(), u = typeof window.nlUndoState === 'function' ? window.nlUndoState() : { ok:false, why:'' };
    if(!all.length) return { headline:'No changes yet.', groups:[{ title:'How changes arrive', rows:[door('You change a line yourself on Plan or Years ahead.', { text:'You', kind:'grey' }), door('Or Horizon prepares a change and you press Apply.', { text:'Horizon', kind:'steel' })] }], button:{ label:'Open the plan', onclick:"NLM.tab('plan')" } };
    const nH = all.filter(e => e.by !== 'You').length, today = all.filter(e => new Date(e.at).toDateString() === new Date().toDateString()).length;
    const graphic = NLP.counts([{ value:all.length, label:'changes' }, { value:nH, label:'by Horizon' }, { value:today, label:'today', kind:today ? 'ok' : '' }]);
    const e = st.chosen && all.find(x => String(x.id) === String(st.chosen));
    const groups = [];
    if(e){
      groups.push({ title:'Chosen change', rows:e.items.map(t => door(H(t), e.undone ? { text:'Undone', kind:'grey' } : { text:'Saved', kind:'green' }))
        .concat(e.by !== 'You' ? [door('Prepared by Horizon from your message.', { text:'Horizon', kind:'steel' }, { label:'See the conversation', onclick:"nlFlip('chat')" }, e.ask ? NLP.quote(String(e.ask).slice(0, 120)) : '')] : []) });
    }
    groups.push({ title:'Effect', rows:[door('Forecast and Years ahead already show the latest plan.', null, { label:'See it on Forecast', onclick:"NLM.tab('forecast')" })] });
    const latest = all[0];
    const button = u.ok ? { label:'Undo the latest change', onclick:'nlUndo()' } : { label:'Undo the latest change', disabledWhy:latest.undone ? 'The latest change is already undone.' : u.why };
    return { headline:`${all.length} change${all.length > 1 ? 's' : ''} so far. ${nH} ${nH === 1 ? 'was' : 'were'} prepared by Horizon.`, graphic, groups, button };
  }
  function overview(){
    const tab = ui().tab || 'plan';
    const o = tab === 'forecast' ? overviewForecast() : tab === 'years' ? overviewYears() : tab === 'bank' ? overviewBank() : tab === 'history' ? overviewHistory() : overviewPlan();
    o.links = (o.links || []).concat([{ label:'Classic Forecast & Review', short:'Classic', onclick:"nav('review')" }]);
    return o;
  }

  NLP.register({ panel:PANEL, section:'money', label:'Money plan', render, overview });

  NLP.css('nl-money-css', `
#panel-nl-money { --nlm-cost:#C9CED8; --nlm-fun:#9FD2BF; --nlm-short:#E3A49C; --nlm-retire:#8A5A0A; }
#panel-nl-money .nlm-mon { display:inline-flex; align-items:center; gap:4px; }
#panel-nl-money .nlm-mon .nl-gp { padding:6px 10px; }
#panel-nl-money .nlm-mon .nl-gp:disabled { color:var(--nl-edge); cursor:default; background:var(--nl-pill); }
#panel-nl-money .nlm-mon-l { font:500 13px var(--nl-sans); white-space:nowrap; min-width:64px; text-align:center; font-variant-numeric:tabular-nums; }
#panel-nl-money .nl-head { flex-wrap:nowrap; }
#panel-nl-money .nlm-wide { display:inline-flex; gap:8px; align-items:center; }
#panel-nl-money .nlm-chiprow { display:flex; align-items:flex-start; gap:12px; }
#panel-nl-money .nlm-chiprow .nl-chips { flex:1; min-width:0; }
#panel-nl-money .nlm-narrow { display:none; margin-top:-3px; flex-shrink:0; }
@media (max-width:1340px){ #panel-nl-money .nlm-wide { display:none; } #panel-nl-money .nlm-narrow { display:block; } }
#panel-nl-money .nl-head .nl-tabs-row { flex:1 1 auto; }
#panel-nl-money table.nl-tbl .nlm-type { width:76px; color:var(--nl-detail); font-size:13px; }
#panel-nl-money table.nl-tbl .nlm-st { width:134px; }
#panel-nl-money table.nl-tbl td.r { width:1%; }
#panel-nl-money table.nl-tbl .sub .nl-q { font-size:13.5px; }
#panel-nl-money table.nl-tbl .nl-inrow .sub { margin:0; }
#panel-nl-money .nlm-foot { margin:10px 0 0; }
#panel-nl-money .nlm-neg { color:#8F2A22; }
#panel-nl-money .nlm-pos { color:#1F4D3B; }
#panel-nl-money .nlm-m0 { margin:0; }
#panel-nl-money .nlm-bw { font-family:var(--nl-serif); font-weight:600; }
#panel-nl-money .nlm-when { color:var(--nl-detail); font-size:13px; }
#panel-nl-money tr.nlm-ed > td { background:var(--nl-ground); border-bottom:1px solid var(--nl-line); padding-top:4px; padding-bottom:12px; }
#panel-nl-money .nlm-edbox { max-width:720px; }
#panel-nl-money .nlm-edbox .nl-field { grid-template-columns:150px minmax(0,1fr) auto; }
#panel-nl-money .nlm-edbox .nl-note { margin:8px 0 0; }
#panel-nl-money .nlm-edbox input.nl-num-in { width:130px; border-bottom:1px solid var(--nl-edge); text-align:right; }
#panel-nl-money .nlm-edbox input.nl-num-in:focus { border-bottom-color:var(--nl-accent); }
#panel-nl-money .nlm-amtw { white-space:nowrap; }
#panel-nl-money .nlm-edbox input#nlm-name, #panel-nl-money .nlm-edbox input#nlm-newcat { border-bottom:1px solid var(--nl-edge); max-width:320px; }
#panel-nl-money .nlm-pills { display:flex; flex-wrap:wrap; gap:6px; min-width:0; }
#panel-nl-money .nlm-pick { margin:-2px 0 10px; }
#panel-nl-money .nlm-edacts { display:flex; align-items:center; gap:16px; margin-top:10px; flex-wrap:wrap; }
#panel-nl-money .nlm-cur { color:var(--nl-detail); font-size:13px; }
#panel-nl-money .nlm-runs { color:var(--nl-detail); }
#panel-nl-money svg .nlm-cost { fill:var(--nlm-cost); }
#panel-nl-money svg .nlm-saved { fill:var(--nl-accent); }
#panel-nl-money svg .nlm-fun { fill:var(--nlm-fun); }
#panel-nl-money svg .nlm-short { fill:var(--nlm-short); }
#panel-nl-money svg .nlm-retire { stroke:var(--nlm-retire); stroke-width:2; }
#panel-nl-money .nlm-cb { display:grid; grid-template-columns:minmax(90px,160px) minmax(0,1fr) auto; gap:12px; align-items:center; padding:3px 0; font-size:13px; }
#panel-nl-money .nlm-cbn { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#panel-nl-money .nlm-cbt { height:10px; background:var(--nl-pill); border-radius:3px; overflow:hidden; }
#panel-nl-money .nlm-cbt i { display:block; height:100%; background:var(--nl-accent); opacity:.8; }
#panel-nl-money .nlm-cbv { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; min-width:80px; }
#panel-nl-money .nlm-emptybank { max-width:640px; padding:18px 0; }
#panel-nl-money .nlm-emptybank .nl-cs { font-size:13.5px; margin:6px 0 4px; }
#panel-nl-money .nlm-paste { margin-top:18px; align-items:start; }
#panel-nl-money .nlm-paste textarea { border:0; border-bottom:1px solid var(--nl-edge); font:13px/1.5 ui-monospace,Menlo,monospace; resize:vertical; min-height:72px; }
html.nl .nl-side .nlm-gl { font-size:12.5px; color:var(--nl-detail); margin:0 0 6px; }
html.nl .nl-side .nlm-gl + .nl-minibars + .nl-mbl, html.nl .nl-side .nlm-cap + .nlm-gl { margin-top:4px; }
html.nl .nl-side .nlm-cap { height:8px; background:var(--nl-pill); border-radius:999px; overflow:hidden; margin-bottom:4px; }
html.nl .nl-side .nlm-cap i { display:block; height:100%; background:var(--nl-accent); }
`);
})();

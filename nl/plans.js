/* ══ NEW LOOK (L+S) · Plans page ═══════════════════════════════════════════
   Two tabs: Trips (the Fun Fund and the trips that use it) and Places to
   retire. Every number comes from the app's own engine:
     · Fun Fund running balance  → FE.funFund.summary().runningBalance
       (the same chained balance as the classic Fun Fund page)
     · trip fit / "Doesn't fit"   → _computeTripFit(trip, summary)
     · "ways to make it fit"      → NLP.whatIf + _get13MonthChain()
     · places                     → retirePlaces().map(scoreLocation)
     · deep dive                  → runLocAnalysis(id) (saves into state.vault)
   Nothing here shows when the new look is off: all CSS is scoped to html.nl
   or #panel-nl-plans. Design rules: docs/LS-DESIGN.md.                     */
(function(){
  'use strict';
  if(!window.NLP || !NLP.register) return;
  const PANEL = 'nl-plans';
  const H = NLP.h;
  const S = () => NLP.ui(PANEL);
  const pad2 = n => String(n).padStart(2, '0');
  const curKey = () => `${CY}-${pad2(CM + 1)}`;
  const addMonths = (key, k) => { const m = /^(\d{4})-(\d{2})/.exec(key || ''); if(!m) return key; const d = new Date(+m[1], +m[2] - 1 + k, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
  const keyOf = ex => String((ex && ex.date) || '').slice(0, 7);
  const monthLong = key => { const m = /^(\d{4})-(\d{2})/.exec(key || ''); return m ? new Date(+m[1], +m[2] - 1, 1).toLocaleString('en-GB', { month:'long', year:'numeric' }) : ''; };
  const rateNow = () => (typeof rate === 'function' ? rate() : 1) || 1;
  const symNow = () => (typeof sym === 'function' ? sym() : 'kr');
  const js = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const trips = () => (typeof state !== 'undefined' && Array.isArray(state.trips)) ? state.trips : [];
  const tripById = id => trips().find(t => String(t.id) === String(id)) || null;
  const costsOf = tr => (tr.expenses || []).filter(ex => Number(ex.amount) > 0 && keyOf(ex));
  const budgetOf = tr => (tr.expenses || []).reduce((s, ex) => s + (Number(ex.amount) || 0), 0);

  // ── Fun Fund, from the engine ────────────────────────────────────────────
  const ffSummary = () => FE.funFund.summary();
  const chainNow = () => _get13MonthChain().map(m => m.funFund || 0);
  const chainKeys = () => _get13MonthChain().map(m => m.key);

  function tripStatus(tr, ff){
    const fit = _computeTripFit(tr, ff || ffSummary());
    const c = costsOf(tr), now = curKey();
    if(c.length && c.every(ex => keyOf(ex) < now)) return { key:'done', text:'Done', kind:'green', fit };
    if(fit.overCapacity) return { key:'nofit', text:'Doesn’t fit', kind:'ruby', fit };
    if(tr.status === 'booked') return { key:'booked', text:'Booked', kind:'steel', fit };
    return { key:'planning', text:'Planning', kind:'amber', fit };
  }
  // A short line, in plain words, of what the trip does to the Fun Fund
  // (the same fit result the classic page shows on each trip card).
  function fitLine(fit){
    if(!(fit.budget > 0)) return 'no costs yet';
    if(fit.fitMessageKey === 'ff.trip.fit.pushesDeficit') return 'pushes the balance to ' + (fit.fitMessageArgs.amt || '');
    if(fit.fitMessageKey === 'ff.trip.fit.oneMonth') return 'fits in one month of Fun Fund';
    const n = fit.fitMessageArgs && fit.fitMessageArgs.n;
    return n && n !== '?' ? `about ${n} month${n > 1 ? 's' : ''} of Fun Fund` : 'more than the Fun Fund puts aside';
  }

  // Ways to make a trip fit: move its largest future cost to a later month,
  // or keep the date and save less until then. Computed on a temporary copy
  // of the plan (NLP.whatIf), so the engine does all the maths.
  let waysCache = { sig:null, val:null };
  function waysFor(tr){
    const sig = JSON.stringify([tr.id, CY, CM, state.trips, state.baseIncome, state.baseExpenses, state.baseSavings, state.monthlyOverrides, state.yearlyBases, state.carryOverrides || null]);
    if(waysCache.sig === sig) return waysCache.val;
    const val = computeWays(tr);
    waysCache = { sig, val };
    return val;
  }
  function computeWays(tr){
    const now = curKey();
    const future = costsOf(tr).filter(ex => keyOf(ex) >= now).sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
    const out = { cost:null, fits:null, short:null, saveLess:null };
    if(!future.length) return out;
    const ex = future[0], from = keyOf(ex), keys = chainKeys(), origIdx = keys.indexOf(from);
    out.cost = { id:ex.id, name:ex.name, date:ex.date, amount:ex.amount };
    if(origIdx < 0) return out;
    const okFrom = s => s.slice(origIdx).every(v => v >= -0.5);
    const series = mutate => NLP.whatIf(mutate, chainNow);
    const moveTo = to => st => { const t = (st.trips || []).find(x => String(x.id) === String(tr.id)); const e = t && (t.expenses || []).find(x => String(x.id) === String(ex.id)); if(e) e.date = to; };
    for(let k = 1; k <= 12 && origIdx + k < keys.length; k++){
      const to = addMonths(from, k);
      if(okFrom(series(moveTo(to)))){
        out.fits = { to, k };
        if(k > 1) out.short = { to:addMonths(from, k - 1) };
        break;
      }
    }
    // Keep the date, save less until the cost month.
    const base = chainNow();
    const need = Math.max(0, -Math.min(...base.slice(origIdx)));
    if(need > 0){
      const months = keys.slice(0, origIdx + 1);
      const per = Math.ceil(need / months.length / 100) * 100;
      const savingsOf = key => { const m = /^(\d{4})-(\d{2})/.exec(key); return getEffective(+m[1], +m[2] - 1).savings || 0; };
      if(months.every(k => savingsOf(k) >= per)){
        const plan = months.map(k => ({ month:k, amount:Math.max(0, Math.round(savingsOf(k) - per)) }));
        const mut = st => { st.monthlyOverrides = st.monthlyOverrides || {}; plan.forEach(p => { st.monthlyOverrides[p.month] = Object.assign({}, st.monthlyOverrides[p.month] || {}, { savings:p.amount }); }); };
        if(okFrom(series(mut))) out.saveLess = { until:from, plan, mut };
      }
    }
    return out;
  }
  // The 12-month running balance for a "what if" (dashed line on the chart).
  function previewSeries(){
    const st = S();
    const pv = st.preview;
    if(pv && String(pv.tripId) === String(st.chosen)){
      const tr = tripById(pv.tripId); if(!tr) return null;
      const w = waysFor(tr);
      if(pv.kind === 'save' && w.saveLess) return { label:'Saving less until ' + NLP.monthLabel(w.saveLess.until), s:NLP.whatIf(w.saveLess.mut, chainNow).slice(0, 12) };
      if(pv.kind === 'move' && w.cost){
        const ex = w.cost;
        const s = NLP.whatIf(stt => { const t = (stt.trips || []).find(x => String(x.id) === String(tr.id)); const e = t && t.expenses.find(x => String(x.id) === String(ex.id)); if(e) e.date = pv.to; }, chainNow).slice(0, 12);
        return { label:'Moved to ' + NLP.monthLabel(pv.to), s };
      }
    }
    // A suggestion waiting for the person's answer is drawn the same way.
    const pend = NLP.pendingChanges().filter(c => c.kind === 'set_trip_cost' || c.kind === 'set_savings');
    if(pend.length){
      const s = NLP.whatIf(stt => pend.forEach(c => {
        if(c.kind === 'set_trip_cost'){
          const t = (stt.trips || []).find(x => x.name === c.trip); const e = t && (t.expenses || []).find(x => x.name === c.cost);
          if(e){ if(c.amount != null) e.amount = c.amount; if(c.to_month) e.date = c.to_month; }
        } else if(c.where === 'month'){
          stt.monthlyOverrides = stt.monthlyOverrides || {}; stt.monthlyOverrides[c.month] = Object.assign({}, stt.monthlyOverrides[c.month] || {}, { savings:c.amount });
        }
      }), chainNow).slice(0, 12);
      return { label:'If you apply the suggestion', s };
    }
    return null;
  }
  // Which trip causes the lowest point: the largest trip cost between last
  // month (it carries into this one) and the lowest month.
  function lowCause(ff, lo){
    const upto = ff.windowMonths[lo].key, fromK = addMonths(curKey(), -1);
    let best = null;
    trips().forEach(tr => costsOf(tr).forEach(ex => { const k = keyOf(ex); if(k >= fromK && k <= upto && (!best || Number(ex.amount) > Number(best.ex.amount))) best = { tr, ex }; }));
    return best;
  }

  // ── Trips tab ────────────────────────────────────────────────────────────
  function filteredTrips(ff){
    const st = S(), f = st.filters || {};
    return trips().filter(tr => {
      if(f.status && tripStatus(tr, ff).key !== f.status) return false;
      if(f.year && !costsOf(tr).some(ex => keyOf(ex).slice(0, 4) === String(f.year))) return false;
      return true;
    });
  }
  function chartTrips(ff){
    const run = ff.runningBalance, months = ff.windowMonths;
    if(!run.length) return '';
    const lo = run.indexOf(Math.min(...run));
    let title;
    if(run[lo] < 0){
      const cause = lowCause(ff, lo);
      let back = -1; for(let i = lo + 1; i < run.length; i++){ if(run[i] >= 0){ back = i; break; } }
      const who = cause ? cause.tr.name : 'Your plan';
      title = `${who} takes the Fun Fund below zero ${back >= 0 ? 'until ' + monthLong(months[back].key) : 'for the rest of the year'}.`;
    } else {
      title = `The Fun Fund stays above zero for the next 12 months; lowest in ${monthLong(months[lo].key).split(' ')[0]}.`;
    }
    const pv = previewSeries();
    const sub = 'Fun Fund balance, next 12 months, after each month’s trips.' + (pv ? ` Dashed: ${pv.label.charAt(0).toLowerCase() + pv.label.slice(1)} (not saved).` : '');
    const box = NLP.chartBox((w, h) => drawFunChart(w, h), 210, 'Fun Fund balance, next 12 months');
    const legend = [{ label:'Your plan', color:'var(--nl-accent)' }];
    if(pv) legend.push({ label:pv.label, dash:true });
    if(run.some(v => v < 0) || (pv && pv.s.some(v => v < 0))) legend.push({ label:'Below zero', color:'#F3C9C4' });
    return `<section class="nl-cc nlp-chartcard"><h2 class="nl-ct">${H(title)}</h2><p class="nl-cs">${H(sub)}</p>${box}${NLP.legend(legend)}</section>`;
  }
  function drawFunChart(w, h){
    const ff = ffSummary(), run = ff.runningBalance, months = ff.windowMonths;
    const pv = previewSeries();
    const all = run.concat(pv ? pv.s : [], [0]);
    const tk = NLP.ticks(Math.min(...all), Math.max(...all), 4, v => v === 0 ? '0' : NLP.moneyShort(v));
    const n = run.length - 1;
    const xt = months.map((m, i) => [i, NLP.monthShort(m.key)]).filter((_, i) => w > 520 || i % 2 === 0);
    return NLP.chart({ w, h, x:[0, n], y:[tk.min, tk.max], yt:tk.ticks, xt, pad:{ l:58, r:22 }, label:'Fun Fund balance, next 12 months',
      hover:{ n:run.length, x:i => i, title:i => months[i] ? NLP.monthLabel(months[i].key) : '',
        rows:i => [{ name:'Fun Fund balance', value:NLP.money(run[i]), color:run[i] < 0 ? '#E3A89F' : 'var(--nl-accent)' }].concat(pv && pv.s[i] != null ? [{ name:pv.label + ' (not saved)', value:NLP.money(pv.s[i]), color:'#48639A' }] : []),
        y:i => [{ v:run[i], color:'var(--nl-accent)' }].concat(pv && pv.s[i] != null ? [{ v:pv.s[i], color:'#48639A' }] : []) },
      draw:({ sx, sy, line, area }) => {
        const pts = run.map((v, i) => [i, v]);
        const neg = run.map((v, i) => [i, Math.min(0, v)]);
        let s = `<line class="nlp-zero" x1="${sx(0)}" x2="${sx(n)}" y1="${sy(0)}" y2="${sy(0)}"/>`;
        if(run.some(v => v < 0)) s += `<path class="nlp-neg" d="${area(neg, 0)}"/>`;
        if(pv && pv.s.some(v => v < 0)) s += `<path class="nlp-neg soft" d="${area(pv.s.map((v, i) => [i, Math.min(0, v)]), 0)}"/>`;
        s += `<path class="nlp-run" d="${line(pts)}"/>`;
        if(pv) s += `<path class="nlp-pv" d="${line(pv.s.map((v, i) => [i, v]))}"/>`;
        const lo = run.indexOf(Math.min(...run));
        const cause = run[lo] < 0 ? lowCause(ff, lo) : null;
        const lx = sx(lo), right = lx > w * 0.62;
        const lab = (cause ? cause.tr.name + ', ' : 'Lowest, ') + NLP.money(run[lo]);
        s += `<circle class="${run[lo] < 0 ? 'nlp-dot-neg' : 'nlp-dot'}" cx="${lx.toFixed(1)}" cy="${sy(run[lo]).toFixed(1)}" r="4"/><text class="lab" x="${(lx + (right ? -8 : 8)).toFixed(1)}" y="${(sy(run[lo]) + 18).toFixed(1)}" text-anchor="${right ? 'end' : 'start'}">${H(lab)}</text>`;
        if(lo !== n) s += `<text class="lab" x="${sx(n).toFixed(1)}" y="${(sy(run[n]) - 9 < 12 ? sy(run[n]) + 18 : sy(run[n]) - 9).toFixed(1)}" text-anchor="end">${H(NLP.money(run[n]) + ' in ' + NLP.monthShort(months[n].key))}</text>`;
        return s;
      } });
  }
  function chipsTrips(ff){
    const st = S(), f = st.filters || (st.filters = {});
    const statusVals = {}, yearVals = {};
    trips().forEach(tr => { const s = tripStatus(tr, ff); statusVals[s.key] = statusVals[s.key] || { text:s.text, n:0 }; statusVals[s.key].n++; new Set(costsOf(tr).map(ex => keyOf(ex).slice(0, 4))).forEach(y => { yearVals[y] = (yearVals[y] || 0) + 1; }); });
    const chip = (key, label, val) => val
      ? `<button type="button" class="nl-chip on" data-act="chip-clear" data-k="${key}" title="Remove this filter">${H(label)}: ${H(val)} ×</button>`
      : `<button type="button" class="nl-chip" data-act="chip" data-k="${key}" aria-expanded="${st.chipOpen === key}">+ ${H(label)}</button>`;
    let html = `<div class="nl-chips nlp-chips">${chip('status', 'Status', f.status ? (statusVals[f.status] || { text:f.status }).text : '')}${chip('year', 'Year', f.year || '')}</div>`;
    if(st.chipOpen === 'status') html += `<div class="nlp-pick">${Object.keys(statusVals).map(k => `<button type="button" class="nl-gp" data-act="pick" data-k="status" data-v="${H(k)}">${H(statusVals[k].text)} <i>${statusVals[k].n}</i></button>`).join('')}</div>`;
    if(st.chipOpen === 'year') html += `<div class="nlp-pick">${Object.keys(yearVals).sort().map(y => `<button type="button" class="nl-gp" data-act="pick" data-k="year" data-v="${H(y)}">${H(y)} <i>${yearVals[y]}</i></button>`).join('')}</div>`;
    return html;
  }
  function pendingFor(tr){ return NLP.pendingChanges().filter(c => c.kind === 'set_trip_cost' && c.trip === tr.name); }
  function tripRow(tr, i, ff){
    const st = S(), s = tripStatus(tr, ff), pend = pendingFor(tr);
    const range = typeof _tripMonthRange === 'function' ? _tripMonthRange(tr) : '';
    const detail = [range, tr.country].filter(Boolean).map(H).join(' · ');
    let extra = '';
    pend.forEach(c => {
      const ex = (tr.expenses || []).find(x => x.name === c.cost);
      const bits = [];
      if(c.to_month) bits.push(`<span class="nl-was">${H(NLP.monthLabel(keyOf(ex)))}</span>${H(NLP.monthLabel(c.to_month))}`);
      if(c.amount != null) bits.push(`<span class="nl-was">${H(NLP.money(ex ? ex.amount : 0))}</span>${H(NLP.money(c.amount))}`);
      extra += `<span class="sub">${H(c.cost)}: ${bits.join(', ')}</span>`;
    });
    const badge = pend.length ? NLP.badge('Suggested', 'amber') : NLP.badge(s.text, s.kind);
    const open = String(st.open) === String(tr.id);
    let html = `<tr data-nl-row="${H(tr.id)}" class="${pend.length ? 'sug' : ''}${open ? ' nlp-isopen' : ''}"><td class="mk">${i + 1}</td><td><span class="nm">${H(tr.name || 'Untitled trip')}</span><span class="sub">${detail}${detail ? ' · ' : ''}${NLP.quote(fitLine(s.fit))}</span>${extra}</td><td>${badge}</td><td class="r">${H(NLP.money(budgetOf(tr)))}</td><td class="r">${H(NLP.money(Number(tr.spent) || 0))}</td></tr>`;
    if(open) html += `<tr class="nlp-openrow"><td></td><td colspan="4">${tripEditor(tr)}</td></tr>`;
    return html;
  }
  function tripEditor(tr){
    const r = rateNow(), id = H(tr.id);
    const lines = (tr.expenses || []).map(ex => `<div class="nlp-cost" data-ex="${H(ex.id)}">
      <input type="text" id="nlp-cn-${id}-${H(ex.id)}" data-nl-keep="no" data-act="cost" data-f="name" value="${H(ex.name || '')}" aria-label="Cost name" placeholder="Cost name">
      <input type="month" id="nlp-cm-${id}-${H(ex.id)}" data-nl-keep="no" data-act="cost" data-f="date" value="${H(keyOf(ex))}" aria-label="Month">
      <span class="nlp-amt"><input type="number" inputmode="decimal" min="0" step="100" id="nlp-ca-${id}-${H(ex.id)}" data-nl-keep="no" data-act="cost" data-f="amount" value="${Math.round((Number(ex.amount) || 0) * r)}" aria-label="Amount in ${H(symNow())}" class="nl-num-in"><i>${H(symNow())}</i></span>
      <button type="button" class="nl-link" data-act="cost-del">Remove</button></div>`).join('');
    return `<div class="nlp-editor" data-trip="${id}">
      <div class="nlp-erow"><span class="lb">Status</span><span class="nlp-pills">${['planning', 'booked'].map(k => `<button type="button" class="nl-gp" data-act="trip-status" data-v="${k}" aria-pressed="${(tr.status === 'booked' ? 'booked' : 'planning') === k}">${k === 'booked' ? 'Booked' : 'Planning'}</button>`).join('')}</span></div>
      <div class="nlp-erow"><span class="lb">Paid so far</span><span class="nlp-amt"><input type="number" inputmode="decimal" min="0" step="100" id="nlp-paid-${id}" data-nl-keep="no" data-act="trip-paid" class="nl-num-in" value="${Math.round((Number(tr.spent) || 0) * r)}" aria-label="Paid so far in ${H(symNow())}"><i>${H(symNow())}</i></span></div>
      <div class="nlp-erow top"><span class="lb">Costs</span><div class="nlp-costs">${lines || '<p class="nlp-none">No costs yet.</p>'}</div></div>
      <div class="nlp-eacts"><button type="button" class="nl-link" data-act="cost-add">+ Add a cost</button><button type="button" class="nl-link" data-act="trip-del">Delete this trip</button><button type="button" class="nl-link" data-act="close">Close</button></div>
    </div>`;
  }
  function newTripRow(){
    const st = S(), d = st.draft, tried = !!st.draftTried;
    const lines = d.costs.map((c, i) => `<div class="nlp-cost">
      <input type="text" id="nlp-dcn-${i}" data-act="d-cost" data-i="${i}" data-f="name" value="${H(c.name)}" placeholder="Cost name, e.g. Flights" aria-label="Cost name">
      <input type="month" id="nlp-dcm-${i}" data-act="d-cost" data-i="${i}" data-f="month" value="${H(c.month)}" aria-label="Month">
      <span class="nlp-amt"><input type="number" inputmode="decimal" min="0" step="100" id="nlp-dca-${i}" data-act="d-cost" data-i="${i}" data-f="amount" class="nl-num-in" value="${H(c.amount)}" aria-label="Amount in ${H(symNow())}" placeholder="0"><i>${H(symNow())}</i></span>
      ${d.costs.length > 1 ? `<button type="button" class="nl-link" data-act="d-cost-del" data-i="${i}">Remove</button>` : '<span></span>'}</div>`).join('');
    const hasCost = d.costs.some(c => Number(c.amount) > 0 && c.month);
    return `<tr class="nlp-openrow nlp-new"><td class="mk">+</td><td colspan="4"><div class="nlp-editor">
      <div class="nlp-erow${tried && !d.name.trim() ? ' need' : ''}"><span class="lb">Trip</span><input type="text" id="nlp-dname" data-act="d" data-f="name" value="${H(d.name)}" placeholder="Where to, e.g. Rome" aria-label="Trip name"></div>
      <div class="nlp-erow"><span class="lb">Country</span><input type="text" id="nlp-dcountry" data-act="d" data-f="country" value="${H(d.country)}" placeholder="Optional" aria-label="Country"></div>
      <div class="nlp-erow top${tried && !hasCost ? ' need' : ''}"><span class="lb">Costs</span><div class="nlp-costs">${lines}</div></div>
      <div class="nlp-eacts"><button type="button" class="nl-link" data-act="d-cost-add">+ Add a cost</button><span class="nlp-sp"></span><button type="button" class="nl-gp" data-act="d-cancel">Cancel</button><button type="button" class="nl-black" data-act="d-save">Save trip</button></div>
    </div></td></tr>`;
  }
  function renderTrips(){
    const ff = ffSummary(), st = S();
    const list = filteredTrips(ff);
    let rows = list.map((tr, i) => tripRow(tr, i, ff)).join('');
    if(st.adding === 'trip') rows = newTripRow() + rows;
    const empty = !trips().length && st.adding !== 'trip'
      ? NLP.empty('No trips yet. Add one to see what it does to your Fun Fund.', NLP.pill('+ New trip', "NLPplans.newTrip()"))
      : (!list.length && st.adding !== 'trip' ? NLP.empty('No trips match these filters.', NLP.link('Clear the filters', "NLPplans.clearFilters()")) : '');
    return `${chartTrips(ff)}${trips().length ? chipsTrips(ff) : ''}
      ${rows ? `<div class="nl-tbl-wrap"><table class="nl-tbl nlp-tbl"><thead><tr><th></th><th>Trip</th><th>Status</th><th class="r">Budget</th><th class="r">Paid so far</th></tr></thead><tbody id="nlp-rows">${rows}</tbody></table></div>` : ''}${empty}`;
  }

  // ── Places tab ───────────────────────────────────────────────────────────
  const VERDICT = { feasible:{ text:'Fits', kind:'green', cls:'ok' }, conditional:{ text:'Tight', kind:'amber', cls:'tight' }, infeasible:{ text:'Doesn’t fit', kind:'ruby', cls:'no' } };
  const places = () => (typeof retirePlaces === 'function' ? retirePlaces() : []).map(scoreLocation);
  const placeById = id => places().find(p => String(p.id) === String(id)) || null;
  const deepDiveOf = id => ((typeof state !== 'undefined' && state.vault) || []).find(v => v && v.type === 'deepdive' && v.locationId === id) || null;
  const isRunning = id => { try { return typeof _runningAnalysis !== 'undefined' && _runningAnalysis.has(id); } catch(_){ return false; } };
  const pct = x => Math.round(x * 100);
  function placesPicture(list){
    if(!list.length) return '';
    const fits = list.filter(p => p.verdict === 'feasible');
    const best = list.slice().sort((a, b) => a.ratio - b.ratio)[0];
    const title = fits.length === list.length
      ? `Your retirement income covers all ${list.length === 2 ? 'both' : list.length} places; ${best.name} leaves the most spare.`
      : fits.length
        ? `${fits.length} of ${list.length} places fit your retirement income; ${best.name} leaves the most spare.`
        : `None of your ${list.length} places fits comfortably yet; ${best.name} comes closest.`;
    const income = list[0].monthlyIncome || 0;
    const bars = list.map(p => {
      const v = VERDICT[p.verdict] || VERDICT.infeasible;
      return `<div class="nlp-share" data-place="${H(p.id)}"><b title="${H(p.name)}">${H(p.name)}</b><span class="nlp-track"><i class="${v.cls}" style="width:${Math.min(100, Math.max(1, p.ratio * 100)).toFixed(1)}%"></i><s style="left:70%"></s></span><span class="nlp-pct">${p.netIncome > 0 ? pct(p.ratio) + '%' : '—'}</span></div>`;
    }).join('');
    return `<section class="nl-cc"><h2 class="nl-ct">${H(title)}</h2><p class="nl-cs">Living costs each month as a share of your retirement income after each place’s tax (${H(NLP.money(income))} a month before tax, today’s money).</p>${bars}
      ${NLP.legend([{ label:'Fits: up to 70%', color:'var(--nl-accent)' }, { label:'Tight: 70 to 90%', color:'#C98A1B' }, { label:'Doesn’t fit: over 90%', color:'#B5483E' }])}</section>`;
  }
  function placeRow(p, i){
    const st = S(), v = VERDICT[p.verdict] || VERDICT.infeasible, dd = deepDiveOf(p.id);
    const bits = [p.country, p.climate].filter(Boolean).map(H);
    const note = p.notes ? NLP.quote(p.notes) : '<span>quick estimate</span>';
    const open = String(st.open) === String(p.id);
    let html = `<tr data-nl-row="${H(p.id)}" class="${open ? 'nlp-isopen' : ''}"><td class="mk">${i + 1}</td><td><span class="nm">${H(p.name || 'New place')}</span><span class="sub">${bits.join(' · ')}${bits.length ? ' · ' : ''}${note}${dd ? ' · deep dive saved' : (isRunning(p.id) ? ' · deep dive running…' : '')}</span></td><td>${NLP.badge(v.text, v.kind)}</td><td class="r">${H(NLP.money(p.effCostOfLiving))}</td><td class="r">${H(String(Math.round((p.effTaxPct || 0) * 10) / 10))}%</td></tr>`;
    if(open) html += `<tr class="nlp-openrow"><td></td><td colspan="4">${placeEditor(p)}</td></tr>`;
    return html;
  }
  function placeEditor(p){
    const r = rateNow(), id = H(p.id), raw = retirePlaces().find(x => String(x.id) === String(p.id)) || {};
    const colAi = p.colSource === 'ai', taxAi = p.taxSource === 'ai';
    return `<div class="nlp-editor" data-place="${id}">
      <div class="nlp-erow"><span class="lb">Cost a month</span>${colAi ? `<span class="nlp-ro">${H(NLP.money(p.effCostOfLiving))} <em>from the deep dive</em></span>` : `<span class="nlp-amt"><input type="number" inputmode="decimal" min="0" step="500" id="nlp-pc-${id}" data-nl-keep="no" data-act="place" data-f="costOfLiving" class="nl-num-in" value="${Math.round((Number(raw.costOfLiving) || 0) * r)}" aria-label="Cost of living a month in ${H(symNow())}"><i>${H(symNow())}</i></span>`}</div>
      <div class="nlp-erow"><span class="lb">Local tax</span>${taxAi ? `<span class="nlp-ro">${H(String(p.effTaxPct))}% <em>from the deep dive</em></span>` : `<span class="nlp-amt"><input type="number" min="0" max="80" step="1" id="nlp-pt-${id}" data-nl-keep="no" data-act="place" data-f="taxRate" class="nl-num-in" value="${H(raw.taxRate || 0)}" aria-label="Local tax in percent"><i>%</i></span>`}</div>
      <div class="nlp-erow"><span class="lb">Your note</span><input type="text" id="nlp-pn-${id}" data-nl-keep="no" data-act="place" data-f="notes" value="${H(raw.notes || '')}" placeholder="Why this place, e.g. warm winters" aria-label="Your note"></div>
      <div class="nlp-eacts"><button type="button" class="nl-link" data-act="place-del">Remove this place</button><button type="button" class="nl-link" data-act="close">Close</button></div>
    </div>`;
  }
  function addPlaceRow(){
    const st = S(), d = st.pdraft, have = new Set(retirePlaces().map(p => (p.name + '|' + (p.country || '')).toLowerCase()));
    const db = (typeof CITY_DB !== 'undefined' ? CITY_DB : []).filter(c => !have.has((c.name + '|' + c.country).toLowerCase()));
    const quick = db.slice(0, 18).map(c => `<button type="button" class="nl-gp" data-act="p-quick" data-n="${H(c.name)}" data-c="${H(c.country)}" title="${H(c.country)} · ${H(c.climate)}">${H(c.name)}</button>`).join('');
    const tried = !!st.pdraftTried;
    return `<tr class="nlp-openrow nlp-new"><td class="mk">+</td><td colspan="4"><div class="nlp-editor">
      ${quick ? `<div class="nlp-erow top"><span class="lb">Popular places</span><div class="nlp-quick">${quick}</div></div>` : ''}
      <div class="nlp-erow${tried && !d.name.trim() ? ' need' : ''}"><span class="lb">Another place</span><input type="text" id="nlp-pdname" data-act="pd" data-f="name" value="${H(d.name)}" placeholder="City or town" aria-label="Place name"></div>
      <div class="nlp-erow"><span class="lb">Country</span><input type="text" id="nlp-pdcountry" data-act="pd" data-f="country" value="${H(d.country)}" placeholder="Country" aria-label="Country"></div>
      <div class="nlp-erow${tried && !(Number(d.cost) > 0) ? ' need' : ''}"><span class="lb">Cost a month</span><span class="nlp-amt"><input type="number" inputmode="decimal" min="0" step="500" id="nlp-pdcost" data-act="pd" data-f="cost" class="nl-num-in" value="${H(d.cost)}" placeholder="0" aria-label="Cost of living a month in ${H(symNow())}"><i>${H(symNow())}</i></span></div>
      <div class="nlp-eacts"><span class="nlp-sp"></span><button type="button" class="nl-gp" data-act="p-cancel">Cancel</button><button type="button" class="nl-black" data-act="p-save">Add this place</button></div>
    </div></td></tr>`;
  }
  function renderPlaces(){
    const st = S(), list = places();
    let rows = list.map(placeRow).join('');
    if(st.adding === 'place') rows = addPlaceRow() + rows;
    return `${placesPicture(list)}${rows ? `<div class="nl-tbl-wrap"><table class="nl-tbl nlp-tbl"><thead><tr><th></th><th>Place</th><th>Verdict</th><th class="r">Cost a month</th><th class="r">Local tax</th></tr></thead><tbody id="nlp-rows">${rows}</tbody></table></div>` : NLP.empty('No places yet. Add one to see whether your retirement income covers it.', NLP.pill('+ Add a place', 'NLPplans.addPlace()'))}`;
  }

  // ── The page ─────────────────────────────────────────────────────────────
  function render(host){
    const st = S(), tab = NLP.tabOf(PANEL, 'trips');
    const nT = trips().length, nP = (typeof retirePlaces === 'function' ? retirePlaces() : []).length;
    const act = tab === 'trips'
      ? `<button type="button" class="nl-gp" onclick="NLPplans.newTrip()" aria-expanded="${st.adding === 'trip'}">+ New trip</button>`
      : `<button type="button" class="nl-gp" onclick="NLPplans.addPlace()" aria-expanded="${st.adding === 'place'}">+ Add a place</button>`;
    host.innerHTML = `<div class="nl-wrap nlp">${NLP.head({ title:'Plans', panel:PANEL, actions:act, tabs:[
      { key:'trips', label:'Trips', count:nT, on:tab === 'trips', keep:true },
      { key:'places', label:'Places to retire', count:nP, on:tab === 'places', keep:true } ] })}
      ${tab === 'trips' ? renderTrips() : renderPlaces()}</div>`;
    const tb = host.querySelector('#nlp-rows');
    NLP.rows(tb, PANEL, id => { st.open = String(st.open) === String(id) ? null : id; NLP.rerender(); });
    wire(host);
  }

  // One set of listeners on the page host (it lives across redraws).
  function wire(host){
    if(host._nlpWired) return; host._nlpWired = true;
    host.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if(!b || !host.contains(b)) return;
      const st = S(), a = b.dataset.act;
      const trEl = b.closest('[data-trip]'), plEl = b.closest('[data-place]');
      const tr = trEl ? tripById(trEl.dataset.trip) : null;
      if(a === 'chip'){ st.chipOpen = st.chipOpen === b.dataset.k ? null : b.dataset.k; NLP.rerender(); return; }
      if(a === 'chip-clear'){ (st.filters || {})[b.dataset.k] = null; st.chipOpen = null; NLP.rerender(); return; }
      if(a === 'pick'){ (st.filters || (st.filters = {}))[b.dataset.k] = b.dataset.v; st.chipOpen = null; NLP.rerender(); return; }
      if(a === 'close'){ st.open = null; NLP.rerender(); return; }
      if(a === 'trip-status' && tr){ const v = b.dataset.v; if((tr.status === 'booked' ? 'booked' : 'planning') === v) return; NLP.record(`${tr.name}: ${v === 'booked' ? 'booked' : 'back to planning'}`, s => { const t = s.trips.find(x => x.id === tr.id); t.status = v; }); return; }
      if(a === 'cost-add' && tr){ NLP.record(`${tr.name}: a cost added`, s => { const t = s.trips.find(x => x.id === tr.id); (t.expenses || (t.expenses = [])).push({ id:genId(), name:'New cost', date:addMonths(curKey(), 1), amount:0 }); }); return; }
      if(a === 'cost-del' && tr){ const exId = b.closest('[data-ex]').dataset.ex; const ex = (tr.expenses || []).find(x => String(x.id) === exId); NLP.record(`${tr.name}: ${ex && ex.name ? ex.name : 'a cost'} removed`, s => { const t = s.trips.find(x => x.id === tr.id); t.expenses = t.expenses.filter(x => String(x.id) !== exId); }); return; }
      if(a === 'trip-del' && tr){ st.open = null; st.chosen = null; NLP.record(`${tr.name} deleted`, s => { s.trips = s.trips.filter(x => x.id !== tr.id); }); return; }
      if(a === 'd-cost-add'){ st.draft.costs.push({ name:'', month:addMonths(curKey(), 1), amount:'' }); NLP.rerender(); return; }
      if(a === 'd-cost-del'){ st.draft.costs.splice(+b.dataset.i, 1); NLP.rerender(); return; }
      if(a === 'd-cancel'){ st.adding = null; NLP.rerender(); return; }
      if(a === 'd-save'){ saveDraftTrip(); return; }
      if(a === 'p-cancel'){ st.adding = null; NLP.rerender(); return; }
      if(a === 'p-quick'){ addPlaceNow({ name:b.dataset.n, country:b.dataset.c }); return; }
      if(a === 'p-save'){ const d = st.pdraft; if(!d.name.trim() || !(Number(d.cost) > 0)){ st.pdraftTried = true; NLP.rerender(); return; } addPlaceNow({ name:d.name.trim(), country:d.country.trim(), cost:Number(d.cost) / rateNow() }); return; }
      if(a === 'place-del' && plEl){ removePlace(plEl.dataset.place); return; }
    });
    host.addEventListener('input', e => {
      const el = e.target, a = el.dataset && el.dataset.act, st = S();
      if(a === 'd') st.draft[el.dataset.f] = el.value;
      if(a === 'd-cost') st.draft.costs[+el.dataset.i][el.dataset.f] = el.value;
      if(a === 'pd') st.pdraft[el.dataset.f] = el.value;
    });
    host.addEventListener('change', e => {
      const el = e.target, a = el.dataset && el.dataset.act; if(!a) return;
      const trEl = el.closest('[data-trip]'), tr = trEl ? tripById(trEl.dataset.trip) : null;
      if(a === 'trip-paid' && tr){ const v = Math.max(0, Math.round((Number(el.value) || 0) / rateNow())); if(v === (Number(tr.spent) || 0)) return; NLP.record(`${tr.name}: paid so far changed`, s => { s.trips.find(x => x.id === tr.id).spent = v; }); return; }
      if(a === 'cost' && tr){
        const exId = el.closest('[data-ex]').dataset.ex, f = el.dataset.f, ex = (tr.expenses || []).find(x => String(x.id) === exId); if(!ex) return;
        let v = el.value;
        if(f === 'amount') v = Math.max(0, Math.round((Number(v) || 0) / rateNow()));
        if(f === 'date' && !/^\d{4}-\d{2}$/.test(v)){ el.value = keyOf(ex); return; }
        if(f === 'name') v = String(v).trim() || ex.name;
        if(String(f === 'date' ? keyOf(ex) : ex[f]) === String(v)) return;
        const what = f === 'amount' ? 'amount' : f === 'date' ? 'month' : 'name';
        NLP.record(`${tr.name}, ${ex.name || 'cost'}: ${what} changed`, s => { const e2 = s.trips.find(x => x.id === tr.id).expenses.find(x => String(x.id) === exId); e2[f] = v; });
        return;
      }
      if(a === 'place'){ const pl = el.closest('[data-place]'); if(pl) editPlace(pl.dataset.place, el.dataset.f, el.value); }
    });
    host.addEventListener('keydown', e => {
      const st = S();
      if(e.key === 'Escape'){
        if(st.chipOpen){ st.chipOpen = null; e.nlDone = true; NLP.rerender(); return; }
        if(st.adding){ st.adding = null; e.nlDone = true; NLP.rerender(); return; }
      }
      if(e.key === 'Enter' && e.target.matches('.nlp-new input')){ e.preventDefault(); const go = host.querySelector('.nlp-new [data-act="d-save"],.nlp-new [data-act="p-save"]'); if(go) go.click(); }
    });
  }
  // Press outside the chip's choices closes them.
  document.addEventListener('click', e => {
    if(!NLP.isOn() || typeof state === 'undefined' || state.activePanel !== PANEL) return;
    const st = S(); if(!st.chipOpen) return;
    if(e.target.closest('.nlp-chips,.nlp-pick')) return;
    st.chipOpen = null; NLP.rerender();
  });

  function saveDraftTrip(){
    const st = S(), d = st.draft, r = rateNow();
    const costs = d.costs.filter(c => Number(c.amount) > 0 && /^\d{4}-\d{2}$/.test(c.month));
    if(!d.name.trim() || !costs.length){ st.draftTried = true; NLP.rerender(); return; }
    const id = genId();
    const trip = { id, name:d.name.trim(), country:d.country.trim(), spent:0, status:'planning', icon:'✈️',
      expenses:costs.map(c => ({ id:genId(), name:String(c.name || '').trim() || 'Cost', date:c.month, amount:Math.round(Number(c.amount) / r) })) };
    st.adding = null; st.chosen = id; st.open = null;
    NLP.record(`New trip: ${trip.name}`, s => { if(!Array.isArray(s.trips)) s.trips = []; s.trips.push(trip); });
  }
  // Places live outside the side panel's Undo list, so they carry their own
  // one-step Undo on the toast.
  function placesChanged(){ if(typeof invalidateSelectors === 'function') invalidateSelectors(); save(); }
  function addPlaceNow(o){
    const st = S();
    const dflt = (typeof _cityDbDefaults === 'function' ? _cityDbDefaults(o.name, o.country || '') : null) || {};
    if(!Array.isArray(state.places)) state.places = [];
    const id = genId();
    state.places.push({ id, kind:'retirement', name:o.name, country:o.country || dflt.country || '', flag:dflt.flag || '🌍',
      costOfLiving:o.cost != null ? Math.round(o.cost) : (dflt.costOfLiving ?? 40000), taxRate:dflt.taxRate ?? 15,
      climate:dflt.climate || 'Temperate', healthcare:dflt.healthcare || 'Good', infrastructure:dflt.infrastructure || 'Good',
      medianMonthlyIncome:dflt.medianMonthlyIncome || null, notes:'', lat:dflt.lat || 0, lng:dflt.lng || 0 });
    st.adding = null; st.pdraft = { name:'', country:'', cost:'' }; st.pdraftTried = false; st.chosen = id;
    placesChanged();
    NLP.toast(`${o.name} added`, '', { label:'Undo', fn:() => { state.places = state.places.filter(p => p.id !== id); if(String(S().chosen) === String(id)) S().chosen = null; placesChanged(); } });
  }
  function editPlace(id, f, val){
    const p = (state.places || []).find(x => String(x.id) === String(id)); if(!p) return;
    let v = val;
    if(f === 'costOfLiving') v = Math.max(0, Math.round((Number(val) || 0) / rateNow()));
    if(f === 'taxRate') v = Math.max(0, Math.min(80, Number(val) || 0));
    if(f === 'notes') v = String(val).trim();
    if(p[f] === v) return;
    const was = p[f]; p[f] = v; placesChanged();
    const what = f === 'costOfLiving' ? 'cost a month' : f === 'taxRate' ? 'local tax' : 'note';
    NLP.toast(`${p.name}: ${what} saved`, '', { label:'Undo', fn:() => { const q = (state.places || []).find(x => x.id === p.id); if(q){ q[f] = was; placesChanged(); } } });
  }
  function removePlace(id){
    const i = (state.places || []).findIndex(x => String(x.id) === String(id)); if(i < 0) return;
    const p = state.places[i], st = S();
    state.places.splice(i, 1); st.open = null; st.chosen = null; placesChanged();
    NLP.toast(`${p.name} removed`, '', { label:'Undo', fn:() => { state.places.splice(Math.min(i, state.places.length), 0, p); placesChanged(); } });
  }

  // ── Side panel: Overview ─────────────────────────────────────────────────
  function stepsGraphic(tr, focus){
    const now = curKey();
    let c = costsOf(tr).slice().sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    if(!c.length) return '';
    if(c.length > 3){ const f = focus && c.find(x => String(x.id) === String(focus.id)); const keep = [c[0], f || c[1], c[c.length - 1]]; c = c.filter(x => keep.includes(x)); }
    const steps = c.map(ex => ({ t:`${ex.name || 'Cost'}, ${NLP.monthShort(keyOf(ex))}`, cls:keyOf(ex) < now ? 'ok' : (focus && String(ex.id) === String(focus.id) ? 'now' : '') }));
    if(steps.length < 3) steps.push({ t:'Home', cls:'' });
    return `<div class="nlp-steps">${steps.map(s => `<div class="${s.cls}">${H(s.t)}</div>`).join('')}</div>`;
  }
  function wayLabel(ex, to){ return `Move ${ex.name || 'the cost'} to ${monthLong(to)}`; }
  function bestButtonLabel(ex, to){
    const l = `Move ${ex.name || 'this cost'} to ${NLP.monthLabel(to)}`;
    return l.length > 32 ? `Move this cost to ${NLP.monthLabel(to)}` : l;
  }
  function overviewTrips(){
    const st = S(), ff = ffSummary();
    const tr = st.chosen != null ? tripById(st.chosen) : null;
    if(st.preview && (!tr || String(st.preview.tripId) !== String(tr.id))){ st.preview = null; setTimeout(() => NLP.mountCharts(document.getElementById('panel-' + PANEL)), 0); }
    if(!tr){
      const all = trips().map(t => ({ t, s:tripStatus(t, ff) }));
      const bad = all.filter(x => x.s.key === 'nofit');
      const ahead = all.filter(x => x.s.key !== 'done');
      const run = ff.runningBalance;
      const headline = !all.length ? 'No trips planned yet.'
        : bad.length ? `${bad[0].t.name}${bad.length > 1 ? ` and ${bad.length - 1} more` : ''} ${bad.length > 1 ? 'don’t' : 'doesn’t'} fit the next 12 months of Fun Fund.`
        : ahead.length ? `All ${ahead.length} trip${ahead.length > 1 ? 's' : ''} ahead fit the Fun Fund.` : 'Every trip is done; nothing is planned ahead.';
      const neg = run.filter(v => v < 0).length;
      const graphic = run.length ? `<div class="nlp-small">Fun Fund at the end of each month${neg ? `, below zero in ${neg} of 12` : ''}</div>${NLP.minibars(run, [NLP.monthShort(ff.windowMonths[0].key), NLP.monthShort(ff.windowMonths[run.length - 1].key)])}` : '';
      const rows = ahead.slice(0, 6).map(x => ({ text:H(x.t.name), badge:{ text:x.s.text, kind:x.s.kind }, why:H(typeof _tripMonthRange === 'function' ? _tripMonthRange(x.t) : ''), link:{ label:x.s.key === 'nofit' ? 'See ways to make it fit' : 'Show in the table', onclick:`NLPplans.choose('${js(x.t.id)}')` } }));
      return { headline, graphic,
        groups:[{ title:'Trips ahead', rows }],
        button:bad.length ? { label:'Show ways to make it fit', onclick:`NLPplans.choose('${js(bad[0].t.id)}')` } : { label:'Plan a new trip', onclick:'NLPplans.newTrip()' },
        links:[{ label:'Ask about my trips', short:'Ask', onclick:"NLP.ask('Which of my trips fit the Fun Fund, and what would make the others fit?')" }] };
    }
    const s = tripStatus(tr, ff), name = tr.name || 'This trip';
    const future = costsOf(tr).filter(ex => keyOf(ex) >= curKey());
    const thisTrip = { title:'This trip', rows:[{ text:`${costsOf(tr).length} cost${costsOf(tr).length === 1 ? '' : 's'}, ${future.length} still ahead`, badge:{ text:s.text, kind:s.kind }, link:{ label:String(st.open) === String(tr.id) ? 'Close the costs' : 'Open its costs to edit', onclick:`NLPplans.open('${js(tr.id)}')` } }] };
    const ask = { label:`Ask about ${short(name, 16)}`, short:'Ask', onclick:`NLP.ask('${js(`How does the ${name} trip affect my Fun Fund?`)}')` };
    if(s.key === 'done') return { headline:`${name} is done: every cost is in the past.`, graphic:stepsGraphic(tr, null), groups:[thisTrip], button:{ label:'Open its costs to edit', onclick:`NLPplans.open('${js(tr.id)}')` }, links:[ask] };
    if(s.key !== 'nofit'){
      const n = s.fit.fitMessageArgs && s.fit.fitMessageArgs.n;
      const headline = !(s.fit.budget > 0) ? `${name} has no costs yet.` : `${name} fits the Fun Fund${n && n !== '?' ? `; it takes about ${n} month${n > 1 ? 's' : ''} of it` : ''}.`;
      return { headline, graphic:stepsGraphic(tr, future[0] || null), groups:[thisTrip], button:{ label:'Open its costs to edit', onclick:`NLPplans.open('${js(tr.id)}')` }, links:[ask] };
    }
    const w = waysFor(tr), ex = w.cost, pv = st.preview;
    const trF = tripById(tr.id) || tr; // whatIf swaps state.trips for a fresh copy
    const rows = [];
    const isPv = (kind, to) => pv && String(pv.tripId) === String(tr.id) && pv.kind === kind && (kind === 'save' || pv.to === to);
    const pvLink = (kind, to) => isPv(kind, to) ? { label:'Shown dashed on the chart · hide', onclick:'NLPplans.preview(null)' } : { label:'Preview on the chart', onclick:`NLPplans.preview('${kind}','${to || ''}')` };
    if(ex && w.fits) rows.push({ text:H(wayLabel(ex, w.fits.to)), badge:{ text:'Fits', kind:'green' }, link:pvLink('move', w.fits.to) });
    if(ex && w.short) rows.push({ text:H(wayLabel(ex, w.short.to)), badge:{ text:'A little short', kind:'amber' }, link:pvLink('move', w.short.to) });
    if(ex && w.saveLess) rows.push({ text:H(`Keep the date, save less until ${monthLong(w.saveLess.until)}`), badge:{ text:'Saves less', kind:'amber' }, link:pvLink('save') });
    if(!rows.length) rows.push({ text:'No later month in the next year makes it fit', badge:{ text:'Too big', kind:'ruby' }, why:'A smaller budget or fewer costs would help.' });
    let button;
    if(ex && w.fits) button = { label:bestButtonLabel(ex, w.fits.to), onclick:`NLPplans.prepare('move')` };
    else if(ex && w.saveLess) button = { label:'Save less for a while', onclick:`NLPplans.prepare('save')` };
    else button = { label:'Prepare a way to fit it', disabledWhy:'No later month or smaller saving makes it fit within a year.' };
    return { headline:`${name} doesn’t fit the next 12 months of Fun Fund.`, graphic:stepsGraphic(trF, ex),
      groups:[{ title:'Ways to make it fit, prepared by Horizon', rows }, thisTrip], button, links:[ask] };
  }
  function overviewPlaces(){
    const st = S(), list = places();
    const p = st.chosen != null ? list.find(x => String(x.id) === String(st.chosen)) : null;
    const key = typeof state !== 'undefined' && state.aiKeys && state.aiKeys.claude;
    const ctx = typeof state !== 'undefined' && state.citizenship && state.homeBase;
    const ddButton = pl => {
      const dd = deepDiveOf(pl.id), label = short(`${dd ? 'Run a new deep dive on' : 'Deep dive on'} ${pl.name}`, 30);
      if(isRunning(pl.id)) return { label, disabledWhy:`A deep dive on ${pl.name} is running. It is saved when done.` };
      if(!key) return { label, disabledWhy:'Add your Claude key in Settings to run a deep dive.' };
      if(!ctx) return { label, disabledWhy:'Set your citizenship and home country in Settings first.' };
      return { label, onclick:`NLPplans.deepDive('${js(pl.id)}')` };
    };
    if(!p){
      if(!list.length) return { headline:'No places to retire yet.', groups:[], button:{ label:'Add a place', onclick:'NLPplans.addPlace()' } };
      const c = { feasible:0, conditional:0, infeasible:0 }; list.forEach(x => { c[x.verdict] = (c[x.verdict] || 0) + 1; });
      const headline = c.feasible === list.length ? `All ${list.length} places fit your retirement income.` : `${c.feasible} of ${list.length} places fit your retirement income.`;
      const graphic = NLP.counts([{ value:c.feasible, label:'fit', kind:'ok' }, { value:c.conditional, label:'tight', kind:c.conditional ? 'on' : '' }, { value:c.infeasible, label:'don’t fit' }]);
      const rows = list.slice(0, 6).map(x => { const dd = deepDiveOf(x.id), run = isRunning(x.id); return { text:H(x.name), badge:run ? { text:'Running', kind:'steel' } : dd ? { text:'Deep dive saved', kind:'green' } : { text:'Estimate', kind:'grey' }, link:{ label:'Show in the table', onclick:`NLPplans.choose('${js(x.id)}')` } }; });
      const next = list.filter(x => !deepDiveOf(x.id)).sort((a, b) => a.ratio - b.ratio)[0];
      return { headline, graphic, groups:[{ title:'Deep dives', rows }], button:next ? ddButton(next) : { label:'Add a place', onclick:'NLPplans.addPlace()' },
        links:[{ label:'Recommend places for me', short:'Recommend', onclick:"NLP.ask('Which places would suit my retirement income best, and why?')" }] };
    }
    const best = list.slice().sort((a, b) => a.ratio - b.ratio)[0];
    const share = Math.max(0, p.ratio);
    let headline;
    if(p.verdict === 'feasible') headline = best && best.id !== p.id ? `${p.name} fits, but leaves less spare than ${best.name}.` : `${p.name} fits, and leaves the most spare of your places.`;
    else if(p.verdict === 'conditional') headline = `${p.name} is tight: living costs take most of your income there.`;
    else headline = `${p.name} costs more than your retirement income allows.`;
    const v = VERDICT[p.verdict] || VERDICT.infeasible;
    const graphic = `<div class="nlp-small">${H(p.name)}, of your income after tax</div><div class="nlp-cap"><i class="${v.cls}" style="width:${Math.min(100, share * 100).toFixed(1)}%"></i></div><div class="nlp-small">${share >= 1 ? `Living costs are ${pct(share)}% of it; nothing spare.` : `${pct(share)}% on living costs, ${100 - pct(share)}% spare.`}</div>`;
    const dd = deepDiveOf(p.id), run = isRunning(p.id);
    const rows = [];
    if(run) rows.push({ text:'Deep dive running <span class="nl-dots" aria-hidden="true"><i></i><i></i><i></i></span>', badge:{ text:'Running', kind:'steel' }, why:'It is saved to your reports when done.' });
    else if(dd) rows.push({ text:`Deep dive saved, ${H(new Date(dd.date).toLocaleDateString('en-GB', { day:'numeric', month:'short' }))}`, badge:{ text:'Deep dive', kind:'green' }, link:{ label:'Read it in Notebook', onclick:"NLP.go('nl-notebook')" } });
    else rows.push({ text:'Estimate only, no deep dive yet', badge:{ text:'Estimate', kind:'grey' }, link:{ label:'What a deep dive covers', onclick:`NLP.ask('${js(`What would a deep dive on ${p.name} cover?`)}')` } });
    if(p.notes) rows.push({ text:`Your note: ${NLP.quote(p.notes)}`, badge:{ text:'Check', kind:'steel' }, link:{ label:'Ask if it still applies', onclick:`NLP.ask('${js(`Does this still apply for retiring in ${p.name}: "${p.notes}"?`)}')` } });
    rows.push({ text:'Cost, tax and note', badge:{ text:p.colSource === 'ai' ? 'From deep dive' : 'Your estimate', kind:'grey' }, link:{ label:String(st.open) === String(p.id) ? 'Close the editor' : 'Open to edit', onclick:`NLPplans.open('${js(p.id)}')` } });
    return { headline, graphic, groups:[{ title:p.name, rows }], button:ddButton(p),
      links:[{ label:`Compare ${short(p.name, 14)} with ${best && best.id !== p.id ? short(best.name, 14) : 'the others'}`, short:'Compare', onclick:`NLP.ask('${js(`Compare retiring in ${p.name} with ${best && best.id !== p.id ? best.name : 'my other places'}.`)}')` }] };
  }
  const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

  // ── Actions called from the side panel and the head row ─────────────────
  let pollT = null;
  const poll = () => { clearInterval(pollT); pollT = setInterval(() => { const any = retirePlaces().some(p => isRunning(p.id)); if(NLP.isOn() && state.activePanel === PANEL) NLP.rerender(); if(!any) clearInterval(pollT); }, 2000); };
  window.NLPplans = {
    choose(id){ const st = S(); st.chosen = id; NLP.rerender(); const row = document.querySelector(`#panel-${PANEL} [data-nl-row="${CSS.escape(String(id))}"]`); if(row) row.scrollIntoView({ block:'nearest' }); },
    open(id){ const st = S(); st.chosen = id; st.open = String(st.open) === String(id) ? null : id; NLP.rerender(); const row = document.querySelector(`#panel-${PANEL} [data-nl-row="${CSS.escape(String(id))}"]`); if(row) row.scrollIntoView({ block:'nearest' }); },
    newTrip(){ const st = S(); if(NLP.tabOf(PANEL, 'trips') !== 'trips') st.tab = 'trips';
      if(st.adding === 'trip'){ st.adding = null; NLP.rerender(); return; }
      st.adding = 'trip'; st.draftTried = false; st.chosen = null; st.open = null;
      if(!st.draft) st.draft = { name:'', country:'', costs:[{ name:'Flights', month:addMonths(curKey(), 1), amount:'' }, { name:'Hotel & on-trip', month:addMonths(curKey(), 2), amount:'' }] };
      NLP.rerender(); setTimeout(() => { const i = document.getElementById('nlp-dname'); if(i) i.focus(); }, 0); },
    addPlace(){ const st = S(); if(NLP.tabOf(PANEL, 'trips') !== 'places') st.tab = 'places';
      if(st.adding === 'place'){ st.adding = null; NLP.rerender(); return; }
      st.adding = 'place'; st.pdraftTried = false; st.chosen = null; st.open = null; if(!st.pdraft) st.pdraft = { name:'', country:'', cost:'' };
      NLP.rerender(); },
    clearFilters(){ const st = S(); st.filters = {}; st.chipOpen = null; NLP.rerender(); },
    preview(kind, to){ const st = S(); st.preview = kind ? { tripId:st.chosen, kind, to:to || null } : null; NLP.rerender(); },
    prepare(kind){
      const st = S(), tr = tripById(st.chosen); if(!tr) return;
      const w = waysFor(tr); let r;
      if(kind === 'move' && w.cost && w.fits){
        r = NLP.propose(`Move the ${tr.name} ${w.cost.name || 'cost'} to ${monthLong(w.fits.to)}, so the Fun Fund stays above zero.`,
          [{ kind:'set_trip_cost', trip:tr.name, cost:w.cost.name, to_month:w.fits.to, why:`The first month after ${monthLong(keyOf(w.cost))} where the Fun Fund never goes below zero.` }]);
      } else if(kind === 'save' && w.saveLess){
        r = NLP.propose(`Keep the ${tr.name} dates and save less until ${monthLong(w.saveLess.until)}, so the Fun Fund stays above zero.`,
          w.saveLess.plan.map(p => ({ kind:'set_savings', where:'month', month:p.month, amount:p.amount, why:`So the ${tr.name} costs fit without moving them.` })));
      }
      if(r && r.error) NLP.toast('Couldn’t prepare it: ' + r.error, 'warn');
      else if(r){ st.preview = null; NLP.rerender(); }
    },
    deepDive(id){
      const p = retirePlaces().find(x => String(x.id) === String(id)); if(!p || typeof window.runLocAnalysis !== 'function') return;
      window.runLocAnalysis(p.id, deepDiveOf(p.id) ? { force:true } : undefined);
      NLP.rerender(); poll();
    },
  };

  NLP.register({
    panel:PANEL, section:'plans', label:'Plans',
    render,
    overview(){ return NLP.tabOf(PANEL, 'trips') === 'places' ? overviewPlaces() : overviewTrips(); },
  });

  // ── Styles (new look only; scoped to this page or the side panel) ───────
  NLP.css('nl-plans-css', `
#panel-nl-plans .nlp-chartcard .nl-chart { margin-top:4px; }
#panel-nl-plans svg.nl-svg .nlp-zero { stroke:var(--nl-quiet); stroke-width:1; }
#panel-nl-plans svg.nl-svg .nlp-neg { fill:#8F2A22; opacity:.16; }
#panel-nl-plans svg.nl-svg .nlp-neg.soft { opacity:.08; }
#panel-nl-plans svg.nl-svg .nlp-run { fill:none; stroke:var(--nl-accent); stroke-width:2.5; stroke-linejoin:round; }
#panel-nl-plans svg.nl-svg .nlp-pv { fill:none; stroke:#48639A; stroke-width:2; stroke-dasharray:5 4; }
#panel-nl-plans svg.nl-svg .nlp-dot-neg { fill:#8F2A22; }
#panel-nl-plans svg.nl-svg .nlp-dot { fill:var(--nl-accent); }
#panel-nl-plans .nlp-chips { margin-top:4px; }
#panel-nl-plans .nlp-pick { display:flex; gap:8px; flex-wrap:wrap; margin:-2px 0 10px; }
#panel-nl-plans .nlp-pick i { font-style:normal; color:var(--nl-detail); margin-left:3px; font-variant-numeric:tabular-nums; }
#panel-nl-plans .nlp-tbl th:nth-child(3), #panel-nl-plans .nlp-tbl td:nth-child(3) { width:1%; white-space:nowrap; }
#panel-nl-plans .nlp-tbl td .sub .nl-was { margin-right:4px; }
#panel-nl-plans .nlp-tbl tr.nlp-isopen td { border-bottom-color:transparent; }
#panel-nl-plans .nlp-tbl tr.nlp-openrow td { background:#FAFAFB; padding-top:4px; padding-bottom:12px; }
#panel-nl-plans .nlp-tbl tr.nlp-new td { background:var(--nl-surface); }
#panel-nl-plans .nlp-editor { max-width:720px; }
#panel-nl-plans .nlp-erow { display:grid; grid-template-columns:120px minmax(0,1fr); gap:12px; align-items:baseline; padding:8px 0; border-bottom:1px solid var(--nl-line); min-width:0; }
#panel-nl-plans .nlp-erow.top { align-items:start; }
#panel-nl-plans .nlp-erow > .lb { color:var(--nl-detail); font-size:13.5px; padding-top:2px; }
#panel-nl-plans .nlp-erow.need > .lb::after { content:' · needed'; color:#8A5A0A; }
#panel-nl-plans .nlp-editor input[type=text], #panel-nl-plans .nlp-editor input[type=month] { border:0; border-bottom:1px solid transparent; background:transparent; font:500 14px var(--nl-sans); color:var(--nl-ink); padding:2px 0; width:100%; min-width:0; outline:0; }
#panel-nl-plans .nlp-editor input:focus { border-bottom-color:var(--nl-accent); }
#panel-nl-plans .nlp-editor input::placeholder { color:var(--nl-detail); font-weight:400; }
#panel-nl-plans .nlp-costs { display:flex; flex-direction:column; min-width:0; }
#panel-nl-plans .nlp-cost { display:grid; grid-template-columns:minmax(0,1fr) 150px 150px 60px; gap:12px; align-items:baseline; padding:3px 0; min-width:0; }
#panel-nl-plans .nlp-cost .nl-link { justify-self:end; }
#panel-nl-plans .nlp-amt { display:inline-flex; align-items:baseline; gap:5px; white-space:nowrap; }
#panel-nl-plans .nlp-amt i { font-style:normal; color:var(--nl-detail); font-size:13px; }
#panel-nl-plans .nlp-amt .nl-num-in { width:110px; font:500 14px var(--nl-sans); font-variant-numeric:tabular-nums; }
#panel-nl-plans .nl-acts .nl-gp[aria-expanded="true"] { background:var(--nl-chosen); color:var(--nl-accent); }
#panel-nl-plans .nlp-ro { font-weight:500; }
#panel-nl-plans .nlp-ro em { font-style:normal; font-weight:400; color:var(--nl-detail); font-size:13px; margin-left:6px; }
#panel-nl-plans .nlp-none { margin:0; color:var(--nl-detail); }
#panel-nl-plans .nlp-pills, #panel-nl-plans .nlp-quick { display:flex; gap:8px; flex-wrap:wrap; }
#panel-nl-plans .nlp-eacts { display:flex; gap:16px; align-items:center; padding-top:10px; flex-wrap:wrap; }
#panel-nl-plans .nlp-sp { flex:1; }
#panel-nl-plans .nlp-share { display:grid; grid-template-columns:minmax(80px,150px) minmax(0,1fr) 52px; gap:12px; align-items:center; padding:5px 0; font-size:13.5px; }
#panel-nl-plans .nlp-share b { font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#panel-nl-plans .nlp-track { position:relative; height:14px; background:var(--nl-pill); border-radius:3px; overflow:hidden; }
#panel-nl-plans .nlp-track i, html.nl .nl-side .nlp-cap i { position:absolute; left:0; top:0; bottom:0; border-radius:3px; background:var(--nl-accent); opacity:.85; }
#panel-nl-plans .nlp-track i.tight, html.nl .nl-side .nlp-cap i.tight { background:#C98A1B; }
#panel-nl-plans .nlp-track i.no, html.nl .nl-side .nlp-cap i.no { background:#B5483E; }
#panel-nl-plans .nlp-track s { position:absolute; top:-2px; bottom:-2px; width:0; border-left:1px dashed var(--nl-quiet); opacity:.6; }
#panel-nl-plans .nlp-pct { text-align:right; font-variant-numeric:tabular-nums; }
@media (max-width:1240px){ #panel-nl-plans .nlp-cost { grid-template-columns:minmax(0,1fr) 140px 130px 56px; } #panel-nl-plans .nlp-amt .nl-num-in { width:90px; } }
html.nl .nl-side .nlp-small { font-size:12.5px; color:var(--nl-detail); margin:0 0 6px; }
html.nl .nl-side .nlp-small + .nl-minibars { margin-top:0; }
html.nl .nl-side .nlp-cap { position:relative; height:12px; background:var(--nl-pill); border-radius:3px; overflow:hidden; margin-bottom:6px; }
html.nl .nl-side .nlp-steps { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
html.nl .nl-side .nlp-steps div { border-top:3px solid var(--nl-edge); padding-top:5px; font-size:12.5px; color:var(--nl-detail); overflow-wrap:anywhere; }
html.nl .nl-side .nlp-steps div.ok { border-color:var(--nl-accent); color:var(--nl-ink); }
html.nl .nl-side .nlp-steps div.now { border-color:#8A5A0A; color:var(--nl-ink); font-weight:500; }
`);
})();

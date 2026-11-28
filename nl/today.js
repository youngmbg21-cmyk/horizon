/* ══ NEW LOOK (L+S) · Today ═════════════════════════════════════════════════
   "How are we doing": four status cards, money over your life (with what-ifs
   drawn dashed, never saved), the next 12 months and the Fun Fund.
   "Needs you": what waits for the person, read from their real data.
   Every number comes from the app's own engine (getProjection,
   FE.retirement.numbers, get12Months, getLifeWallData). New look only.     */
(function(){
  'use strict';
  if(!window.NLP) return;
  const NLP = window.NLP, H = NLP.h, P = 'nl-today';
  const st = () => NLP.ui(P);

  // ── Small helpers ─────────────────────────────────────────────────────
  const num = v => Number(v) || 0;
  const pct = v => Math.round(v) + '%';
  const nom = () => typeof FE !== 'undefined' && !!(FE.display && FE.display.isNominal());
  const lensWords = () => nom() ? 'future money' : 'today’s money';
  const lifeExp = () => num(state.lifeExp) || 90;
  const ageTxt = a => (Math.round(a * 10) / 10).toString();
  const plural = (n, one, many) => n === 1 ? one : many;
  // "Nov 2026 to Mar 2027" when the months follow each other, else a short list.
  const monthSpan = ms => {
    const idx = ms.map(m => { const [y, mo] = m.key.split('-').map(Number); return y * 12 + mo; });
    const run = idx.every((v, i) => !i || v === idx[i - 1] + 1);
    if(run) return `${NLP.monthLabel(ms[0].key)} to ${NLP.monthLabel(ms[ms.length - 1].key)}`;
    const n = ms.map(m => NLP.monthShort(m.key));
    return n.length > 4 ? n.slice(0, 3).join(', ') + ` and ${n.length - 3} more` : listWords(n);
  };
  const listWords = arr => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

  // ── Money over your life: accumulation joined to the retirement sim ──────
  // x = age (fractional for the projection's year-ends), y = everything you
  // own, in today's or future money as the app-wide setting says.
  function lifeSeries(){
    const isNom = nom();
    const proj = getProjection();
    const nums = FE.retirement.numbers();
    const sim = nums._simResult || { labels:[], balData:[] };
    const cur = num(state.currentAge), ret = num(state.retirementAge), L = lifeExp();
    const ytr = Math.max(0, ret - cur);
    const nowV = (typeof getInvestmentAssets === 'function' ? getInvestmentAssets() : []).reduce((s, a) => s + num(a.balance), 0);
    const pts = [[cur, nowV]];
    if(ytr > 0){
      proj.forEach((p, y) => {
        // Year 0 ends in December; middle years end in December; the
        // retirement year ends this month, ytr years from now.
        const x = (y === ytr) ? cur + ytr : cur + y + (12 - CM) / 12;
        const v = isNom ? p.total : p.realTotal;
        if(x > pts[pts.length - 1][0]) pts.push([x, v]);
      });
    }
    const atRet = ytr > 0 ? pts[pts.length - 1][1] : num(nums.nestEgg);
    if(ytr === 0) pts[0] = [cur, atRet];
    const retStart = pts.length;
    sim.labels.forEach((age, i) => {
      if(age <= pts[pts.length - 1][0]) return;
      const real = num(sim.balData[i]);
      pts.push([age, isNom ? real * FE.inflation.factor(age - cur) : real]);
    });
    const end = pts[pts.length - 1];
    return {
      pts, retStart, cur, ret, L, now:nowV, atRet, atEnd:end[1], endAge:end[0],
      // With no retirement spending there is nothing to fund, so no verdict:
      // 'empty' asks for the numbers instead of saying "Well funded".
      runout: nums.runoutAge || null, verdict: nums.verdict, verdictKey: num(nums.totalExp) > 0 ? nums.verdictKey : 'empty',
      coverage: num(nums.coveragePct),
    };
  }

  // ── What-ifs: computed on a temporary copy, never saved ───────────────
  const WI = {
    save_more:      { dflt:5000, min:100, max:1e6, chip:v => `Save ${NLP.money(v)} more a month`, short:v => `you save ${NLP.money(v)} more a month`,
                      apply:(s, v) => {
                        s.baseSavings = num(s.baseSavings) + v;
                        Object.values(s.yearlyBases || {}).forEach(b => { if(b && b.savings != null) b.savings = num(b.savings) + v; });
                        Object.values(s.monthlyOverrides || {}).forEach(o => { if(o && o.savings != null) o.savings = num(o.savings) + v; });
                      } },
    retire_earlier: { dflt:3, min:1, max:30, chip:v => `Retire ${v} ${plural(v, 'year', 'years')} earlier`, short:v => `you retire ${v} ${plural(v, 'year', 'years')} earlier, at ${num(state.retirementAge) - v}`,
                      apply:(s, v) => { s.retirementAge = num(s.retirementAge) - v; } },
    growth_lower:   { dflt:2, min:0.5, max:6, chip:v => `Markets ${ageTxt(v)}% weaker`, short:v => `markets grow ${ageTxt(v)}% a year less, before and after you retire`,
                      apply:(s, v) => {
                        s.growthRate = Math.max(0, num(s.growthRate) - v);
                        s.retirementPostGrowth = Math.max(0, (s.retirementPostGrowth == null ? 4 : num(s.retirementPostGrowth)) - v);
                        (s.externalAssets || []).forEach(a => { if(a && a.growthRate != null) a.growthRate = Math.max(0, num(a.growthRate) - v); });
                      } },
  };
  function wiLimit(kind, v){
    const d = WI[kind]; let x = v == null || v === '' || !isFinite(+v) ? d.dflt : +v;
    if(kind === 'retire_earlier') x = Math.round(x);
    x = Math.min(d.max, Math.max(d.min, x));
    if(kind === 'retire_earlier') x = Math.min(x, Math.max(0, num(state.retirementAge) - num(state.currentAge) - 1));
    return x;
  }
  const retireEarlierPossible = () => num(state.retirementAge) - num(state.currentAge) - 1 >= 1;
  // NLP.whatIf restores its own list of fields; retirementPostGrowth is put back here as well.
  function runWhatIf(kind, v){
    const keepPost = state.retirementPostGrowth;
    try { return NLP.whatIf(s => WI[kind].apply(s, v), () => lifeSeries()); }
    finally {
      if(keepPost === undefined) delete state.retirementPostGrowth; else state.retirementPostGrowth = keepPost;
      if(typeof invalidateSelectors === 'function') invalidateSelectors();
    }
  }
  function activeWI(){
    const w = st().wi; if(!w || !WI[w.kind]) return null;
    // A save-more what-if ends once the plan's savings change (for example after Apply).
    if(w.kind === 'save_more' && w.base !== state.baseSavings){ st().wi = null; return null; }
    if(w.kind === 'retire_earlier' && !retireEarlierPossible()){ st().wi = null; return null; }
    return w;
  }
  function setWI(kind, v){
    if(!kind || kind === 'off' || !WI[kind]){ st().wi = null; return null; }
    if(kind === 'retire_earlier' && !retireEarlierPossible()) return null;
    st().wi = { kind, val:wiLimit(kind, v), base:state.baseSavings };
    return st().wi;
  }

  // ── Trips that take the Fun Fund below zero ───────────────────────────
  function tripsInWindow(months){
    const keys = new Set(months.map(m => m.key)), out = [];
    (state.trips || []).forEach(t => (t.expenses || []).forEach(ex => {
      const k = String(ex.date || '').slice(0, 7);
      if(keys.has(k) && num(ex.amount) > 0) out.push({ trip:t.name || 'Trip', name:ex.name || '', key:k, amount:num(ex.amount) });
    }));
    return out;
  }

  // ── Everything the page and the panel read, from real data ────────────
  function model(){
    const nums = FE.retirement.numbers();
    const life = lifeSeries();
    const months = get12Months();
    const ti12 = months.reduce((s, m) => s + num(m.pureIncome), 0);
    const sv12 = months.reduce((s, m) => s + num(m.savings), 0);
    const savePct = ti12 > 0 ? sv12 / ti12 * 100 : 0;
    const bricks = (typeof getLifeWallData === 'function' ? getLifeWallData(2) : []) || [];
    const green = bricks.filter(b => b.verdict === 'green').length;
    const amber = bricks.filter(b => b.verdict === 'amber').length;
    const red = bricks.filter(b => b.verdict === 'red').length;
    const run = months.map(m => num(m.funFund));
    const short = months.filter(m => num(m.funFund) < 0);
    const trips = tripsInWindow(months);
    let tripCause = false;
    if(short.length && trips.length){
      const runNoTrips = NLP.whatIf(s => { s.trips = []; }, () => get12Months().map(m => num(m.funFund)));
      tripCause = Math.min(...runNoTrips) >= 0;
    }
    return { nums, life, months, ti12, sv12, savePct, bricks, green, amber, red, run, short, trips, tripCause, items:needs({ nums, life, months, short, trips, tripCause }) };
  }

  // ── Needs you: each item says what, why, and where it is fixed ────────
  // Open a page on a given tab (a link lands on ONE target, not the last tab used).
  const goTab = (panel, tab) => { const u = NLP.ui(panel); u.tab = tab; u.chosen = null; u.open = null; NLP.go(panel); };
  const GO = {
    pending:() => { if(typeof window.nlFlip === 'function') window.nlFlip('chat'); },
    short:() => goTab('nl-money', 'forecast'), trips:() => goTab('nl-plans', 'trips'),
    runout:() => goTab('nl-future', 'runway'), pension:() => goTab('nl-future', 'accounts'), profile:() => NLP.go('nl-setup'),
    rates:() => { NLP.ui('nl-settings').tab = 'general'; NLP.go('nl-settings'); setTimeout(() => document.getElementById('nlst-row-rates')?.scrollIntoView({ block:'center' }), 80); },
  };
  function needs(d){
    const out = [];
    const pend = NLP.pendingChanges();
    if(pend.length) out.push({
      id:'pending', text:`Approve ${pend.length} suggested ${plural(pend.length, 'change', 'changes')}`,
      detail:pend.slice(0, 2).map(c => c.label).join(' · ') + (pend.length > 2 ? ` · and ${pend.length - 2} more` : ''),
      why:'Horizon prepared these. Nothing changes until you press Apply.',
      badge:{ text:'Waiting for you', kind:'amber' }, act:'See them in the conversation', go:"NLP.today.go('pending')",
    });
    if(d.short.length){
      const first = d.short[0], low = d.short.reduce((a, m) => num(m.funFund) < num(a.funFund) ? m : a, first);
      const names = d.short.map(m => NLP.monthShort(m.key));
      out.push({
        id:'short', text:d.short.length === 1 ? `${NLP.monthLabel(first.key)} runs short` : `${d.short.length} months run short`,
        detail:d.short.length === 1 ? `Fun Fund ends the month at ${NLP.money(first.funFund)}` : `${monthSpan(d.short)}; lowest ${NLP.money(low.funFund)} in ${NLP.monthLabel(low.key)}`,
        why:d.short.length === 1 ? `The Fun Fund goes below zero in ${NLP.monthLabel(first.key)}.` : `The Fun Fund is below zero in ${d.short.length} of the next 12 months.`,
        badge:{ text:'Needs you now', kind:'ruby' }, act:d.short.length === 1 ? `See why ${NLP.monthShort(first.key)} is short` : 'See the short months', go:"NLP.today.go('short')",
      });
    }
    if(d.tripCause){
      const firstShort = d.short[0].key;
      const cause = [...new Set(d.trips.filter(t => t.key <= firstShort).map(t => t.trip))];
      const names = cause.length ? cause : [...new Set(d.trips.map(t => t.trip))];
      out.push({
        id:'trips', text:names.length === 1 ? `${names[0]} doesn’t fit the next 12 months` : 'Trips take the Fun Fund below zero',
        detail:`Without ${names.length === 1 ? 'this trip' : 'the trips'} the Fun Fund would stay above zero${names.length > 1 ? ': ' + listWords(names.slice(0, 3)) : ''}`,
        why:`Without ${names.length === 1 ? 'this trip' : 'these trips'} every month would stay above zero.`,
        badge:{ text:'Needs you now', kind:'ruby' }, act:'See ways to make it fit', go:"NLP.today.go('trips')",
      });
    }
    const L = lifeExp();
    if(d.life.runout && d.life.runout < L){
      out.push({
        id:'runout', text:`Your money runs out at ${d.life.runout}`,
        detail:`${L - d.life.runout} ${plural(L - d.life.runout, 'year', 'years')} before ${L}, on your ${String(state.retirementScenario || 'baseline')} retirement costs`,
        why:`On today’s plan your savings are used up ${L - d.life.runout} ${plural(L - d.life.runout, 'year', 'years')} before age ${L}.`,
        badge:{ text:'Needs you now', kind:'ruby' }, act:'Open your retirement plan', go:"NLP.today.go('runout')",
      });
    }
    const miss = [];
    if(!String(state.userName || '').trim()) miss.push('your name');
    if(!state.citizenship) miss.push('citizenship');
    if(!state.homeBase) miss.push('home base');
    if(!(state.retirementExpenses || []).some(e => num(e.amount) > 0)) miss.push('retirement costs');
    if(miss.length) out.push({
      id:'profile', text:miss.length === 1 ? `Your profile is missing ${miss[0]}` : `Your profile is missing ${miss.length} things`,
      detail:`Not filled in yet: ${listWords(miss)}`,
      why:'Horizon uses these to size taxes, places and your retirement.',
      badge:{ text:'Missing', kind:'amber' }, act:'Fill in your profile', go:"NLP.today.go('profile')",
    });
    if(state.pendingRates) out.push({
      id:'rates', text:'New exchange rates are ready',
      detail:'Your other currencies still use the rates from ' + (state.ratesUpdatedAt ? new Date(state.ratesUpdatedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : 'when you set them up'),
      why:'Nothing changes until you approve them in Settings.',
      badge:{ text:'Waiting for you', kind:'amber' }, act:'Review the rates', go:"NLP.today.go('rates')",
    });
    if(typeof getPensionAssets === 'function' && !getPensionAssets().length) out.push({
      id:'pension', text:'No pension added',
      detail:'Your retirement counts only your savings and investments',
      why:'A pension would lower what you take from savings each year.',
      badge:{ text:'Missing', kind:'amber' }, act:'Add a pension in Future', go:"NLP.today.go('pension')",
    });
    return out;
  }

  // ── Figure cards: status, not big money ────────────────────────────────
  function figureCards(m){
    const L = lifeExp(), r = m.life;
    const vWords = { wellFunded:'Well funded', fullyFunded:'Fully funded', borderline:'Nearly funded', atRisk:'At risk', underfunded:'Underfunded' }[r.verdictKey] || r.verdict;
    const cov = Math.min(100, r.coverage);
    const covKind = cov >= 100 ? 'green' : cov >= 90 ? 'amber' : 'ruby';
    const lasts = r.runout && r.runout < L ? `Until ${r.runout}` : `Past ${L}`;
    const lastsB = !r.runout || r.runout >= L ? NLP.badge('Never runs out', 'green') : NLP.badge(`${L - r.runout} ${plural(L - r.runout, 'year', 'years')} short`, L - r.runout <= 3 ? 'amber' : 'ruby');
    const sp = Math.round(m.savePct);
    const spB = m.ti12 <= 0 ? NLP.badge('No income yet', 'grey') : sp >= 20 ? NLP.badge('Strong', 'green') : sp >= 10 ? NLP.badge('Fair', 'amber') : NLP.badge('Low', 'ruby');
    const wallB = m.red ? NLP.badge(`${m.red} red`, 'ruby') : m.amber ? NLP.badge(`${m.amber} amber`, 'amber') : NLP.badge('All green', 'green');
    const card = (label, value, badge, title) => `<div title="${H(title || '')}"><span>${H(label)}</span><b>${H(value)}</b>${badge}</div>`;
    if(r.verdictKey === 'empty') return `<div class="nl-fcards tdy-fc">${
      card(`Retire at ${state.retirementAge}`, 'Not set yet', NLP.badge('Add retirement costs', 'amber'), 'Add what you will spend in retirement, in Future') +
      card('Your money lasts', '—', NLP.badge('Not worked out', 'grey'), 'Worked out once retirement costs are added') +
      card('Saving each month', m.ti12 > 0 ? `${sp}% of income` : '—', spB, 'Savings as a share of income, next 12 months') +
      card('Life wall', '—', NLP.badge('Not worked out', 'grey'), 'Worked out once retirement costs are added')
    }</div>`;
    return `<div class="nl-fcards tdy-fc">${
      card(`Retire at ${state.retirementAge}`, vWords, NLP.badge(`${pct(cov)} covered`, covKind), 'Share of retirement years your income covers, to age ' + L) +
      card('Your money lasts', lasts, lastsB, r.runout ? `Savings are used up at about ${r.runout}` : `Savings last beyond ${L}`) +
      card('Saving each month', m.ti12 > 0 ? `${sp}% of income` : '—', spB, 'Savings as a share of income, next 12 months') +
      card('Life wall', `${m.green} of ${m.bricks.length} green`, wallB, 'Each brick is 2 years of your life')
    }</div>`;
  }

  // ── Chart: money over your life ────────────────────────────────────────
  function lifeChart(m, alt){
    const r = m.life;
    return (w, h) => {
      const all = r.pts.concat(alt ? alt.life.pts : []);
      const yMax = Math.max(1, ...all.map(q => q[1])) * 1.1;
      const T = NLP.ticks(0, yMax, w < 520 ? 3 : 4, v => v === 0 ? '0' : NLP.moneyShort(v));
      const xt = [[r.cur, String(r.cur)]];
      for(let a = Math.ceil((r.cur + 1) / 10) * 10; a < r.L; a += 10) xt.push([a, String(a)]);
      xt.push([r.ret, String(r.ret)], [r.L, String(r.L)]);
      const xs = xt.sort((a, b) => a[0] - b[0]).filter((t, i, arr) => {
        if(t[0] === r.cur || t[0] === r.ret || t[0] === r.L) return arr.findIndex(u => u[0] === t[0]) === i;
        return Math.abs(t[0] - r.ret) >= 3 && Math.abs(t[0] - r.L) >= 3 && Math.abs(t[0] - r.cur) >= 3;
      });
      return NLP.chart({ w, h, x:[r.cur, r.L], y:[T.min, T.max], pad:{ l:58, r:14, t:12, b:24 }, yt:T.ticks, xt:xs,
        label:'Money over your life',
        hover:{ n:r.pts.length, x:i => r.pts[i][0],
          title:i => `Age ${Math.round(r.pts[i][0])}${r.pts[i][0] >= r.ret ? ' · retired' : ''}`,
          rows:i => { const out = [{ name:'Your plan', value:NLP.money(r.pts[i][1]), color:'var(--nl-accent)' }];
            if(alt){ const q = alt.life.pts.reduce((b, p) => Math.abs(p[0] - r.pts[i][0]) < Math.abs(b[0] - r.pts[i][0]) ? p : b, alt.life.pts[0]); if(q) out.push({ name:'What if (not saved)', value:NLP.money(q[1]), color:'#48639A' }); }
            return out; },
          y:i => { const out = [{ v:r.pts[i][1], color:'var(--nl-accent)' }]; if(alt){ const q = alt.life.pts.reduce((b, p) => Math.abs(p[0] - r.pts[i][0]) < Math.abs(b[0] - r.pts[i][0]) ? p : b, alt.life.pts[0]); if(q) out.push({ v:q[1], color:'#48639A' }); } return out; } },
        draw:({ sx, sy, line, area }) => {
          const acc = r.pts.slice(0, r.retStart), all2 = r.pts;
          let s = `<rect x="${sx(r.ret).toFixed(1)}" y="${sy(T.max).toFixed(1)}" width="${Math.max(0, sx(r.L) - sx(r.ret)).toFixed(1)}" height="${(sy(T.min) - sy(T.max)).toFixed(1)}" class="tdy-ret"/>`;
          s += `<text x="${(sx(r.ret) + 6).toFixed(1)}" y="${(sy(T.max) + 14).toFixed(1)}" class="am">Retired, from ${r.ret}</text>`;
          s += `<path d="${area(all2, 0)}" class="tdy-area"/><path d="${line(all2)}" class="tdy-line"/>`;
          if(alt){
            s += `<path d="${line(alt.life.pts)}" class="tdy-dash"/>`;
            if(alt.life.ret !== r.ret && alt.life.ret > r.cur){
              const ax = sx(alt.life.ret), ay = sy(alt.life.atRet);
              s += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3.5" class="tdy-dot-st"/><text class="lab st" x="${(ax - 8).toFixed(1)}" y="${Math.max(12, ay - 10).toFixed(1)}" text-anchor="end">${H(NLP.moneyShort(alt.life.atRet))} at ${alt.life.ret}</text>`;
            }
          }
          // Now
          s += `<circle cx="${sx(r.cur).toFixed(1)}" cy="${sy(r.now).toFixed(1)}" r="4" class="tdy-dot-ink"/>`;
          const nowAbove = sy(r.now) > h - 50;
          s += `<text class="lab" x="${(sx(r.cur) + 8).toFixed(1)}" y="${(sy(r.now) + (nowAbove ? -10 : 18)).toFixed(1)}">Now, ${H(NLP.moneyShort(r.now))}</text>`;
          // At retirement
          if(r.ret > r.cur){
            const rx = sx(r.ret), ry = sy(r.atRet);
            s += `<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="4" class="tdy-dot"/>`;
            s += `<text class="lab" x="${(rx - 8).toFixed(1)}" y="${Math.max(12, ry - 10).toFixed(1)}" text-anchor="end">${H(NLP.moneyShort(r.atRet))} at ${r.ret}</text>`;
          }
          // At the end (or where it runs out)
          const altEnd = alt ? alt.life.atEnd : null, planAbove = alt ? r.atEnd >= altEnd : false;
          if(r.runout && r.runout < r.L){
            s += `<circle cx="${sx(r.runout).toFixed(1)}" cy="${sy(0).toFixed(1)}" r="4" class="tdy-dot-rb"/><text class="lab rb" x="${(sx(r.runout) - 6).toFixed(1)}" y="${(sy(0) - 10).toFixed(1)}" text-anchor="end">Runs out at ${r.runout}</text>`;
          } else {
            const ey = sy(r.atEnd), txt = `${NLP.moneyShort(r.atEnd)} at ${r.L}`;
            let dy = alt ? (planAbove ? -12 : 18) : (ey < 40 ? 18 : -14);
            // Keep clear of the retirement label when the chart is narrow.
            if(!alt && r.ret > r.cur && sx(r.L) - 2 - txt.length * 6.6 < sx(r.ret) + 4 && Math.abs(ey + dy - (sy(r.atRet) - 10)) < 16) dy = 18;
            s += `<text class="lab" x="${(sx(r.L) - 2).toFixed(1)}" y="${Math.min(h - 30, Math.max(12, ey + dy)).toFixed(1)}" text-anchor="end">${H(txt)}</text>`;
          }
          if(alt){
            const ay = sy(altEnd), dy = planAbove ? 18 : -10;
            s += `<text class="lab st" x="${(sx(r.L) - 2).toFixed(1)}" y="${Math.min(h - 30, Math.max(12, ay + dy)).toFixed(1)}" text-anchor="end">What if: ${alt.life.runout && alt.life.runout < r.L ? 'runs out at ' + alt.life.runout : H(NLP.moneyShort(altEnd)) + ' at ' + r.L} · prepared, not saved</text>`;
          }
          return s;
        } });
    };
  }
  function lifeTitle(r){
    if(!(num(r.now) > 0) && !(num(r.atRet) > 0) && !(num(r.atEnd) > 0)) return 'Add your savings and accounts to see your money over your life.';
    const grow = r.ret > r.cur ? `Your money grows to about ${NLP.moneyShort(r.atRet)} by ${r.ret}` : `You have about ${NLP.moneyShort(r.atRet)} now`;
    if(r.runout && r.runout < r.L) return `${grow}, but runs out at ${r.runout}, ${r.L - r.runout} ${plural(r.L - r.runout, 'year', 'years')} before ${r.L}.`;
    if(r.runout) return `${grow}, and lasts until about ${r.runout}.`;
    return `${grow}, and still holds ${NLP.moneyShort(r.atEnd)} at ${r.L}.`;
  }

  // ── Chart: next 12 months ──────────────────────────────────────────────
  function nextChart(m){
    return (w, h) => {
      const ms = m.months;
      const tops = ms.map(x => Math.max(num(x.pureIncome), num(x.pureExpenses) + num(x.savings)));
      const lows = ms.map(x => Math.min(0, num(x.funFund)));
      const T = NLP.ticks(Math.min(0, ...lows), Math.max(1, ...tops), 3, v => v === 0 ? '0' : NLP.moneyShort(v));
      const every = w < 420 ? 2 : 1;
      return NLP.chart({ w, h, x:[0, 12], y:[T.min, T.max], pad:{ l:52, r:8, t:10, b:24 }, yt:T.ticks, label:'Next 12 months',
        hover:{ n:ms.length, x:i => i + .5, title:i => NLP.monthLabel(ms[i].key),
          rows:i => [{ name:'Comes in', value:NLP.money(num(ms[i].pureIncome)), color:'transparent' }, { name:'Costs', value:NLP.money(num(ms[i].pureExpenses)), color:'#C9CED8' }, { name:'Saved', value:NLP.money(num(ms[i].savings)), color:'var(--nl-accent)' }, { name:num(ms[i].funFund) < 0 ? 'Short by' : 'Fun Fund', value:NLP.money(num(ms[i].funFund) < 0 ? -num(ms[i].funFund) : num(ms[i].pureFunFund)), color:num(ms[i].funFund) < 0 ? '#E3A89F' : '#9FD2BF' }] },
        draw:({ sx, sy }) => {
          const bw = (sx(1) - sx(0)) * .62;
          let s = '';
          ms.forEach((x, i) => {
            const cx = sx(i + .5), x0 = cx - bw / 2, c = num(x.pureExpenses), sv = num(x.savings), f = num(x.pureFunFund);
            const rect = (y1, y2, cls) => { const a = sy(Math.max(y1, y2)), b = sy(Math.min(y1, y2)); return b - a > 0.2 ? `<rect x="${x0.toFixed(1)}" y="${a.toFixed(1)}" width="${bw.toFixed(1)}" height="${(b - a).toFixed(1)}" class="${cls}"/>` : ''; };
            s += rect(0, c, 'tdy-cost') + rect(c, c + sv, 'tdy-save');
            if(f > 0) s += rect(c + sv, c + sv + f, 'tdy-fun');
            const short = num(x.funFund) < 0;
            if(short){ const a = sy(0), b = Math.max(a + 3, sy(num(x.funFund))); s += `<rect x="${x0.toFixed(1)}" y="${a.toFixed(1)}" width="${bw.toFixed(1)}" height="${(b - a).toFixed(1)}" class="tdy-short"><title>${H(NLP.monthLabel(x.key))}: short by ${H(NLP.money(-x.funFund))}</title></rect>`; }
            if(i % every === 0 || short) s += `<text x="${cx.toFixed(1)}" y="${h - 6}" text-anchor="middle"${short ? ' class="rb"' : ''}>${H(NLP.monthShort(x.key))}</text>`;
          });
          if(T.min < 0) s += `<line x1="${sx(0)}" x2="${sx(12)}" y1="${sy(0).toFixed(1)}" y2="${sy(0).toFixed(1)}" class="tdy-zero"/>`;
          return s;
        } });
    };
  }
  function nextTitle(m){
    const n = m.short.length;
    if(!n) return 'Next 12 months: every month covers costs, saving and fun.';
    if(n === 1) return `Next 12 months: only ${NLP.monthLabel(m.short[0].key).replace(/ \d{4}$/, '')} is short.`;
    return `Next 12 months: ${n} months run short.`;
  }

  // ── Chart: Fun Fund running balance with trips ─────────────────────────
  function funChart(m){
    return (w, h) => {
      const ms = m.months, run = m.run, sav = savRun(m);
      const T = NLP.ticks(Math.min(0, ...run), Math.max(1, ...run, ...sav), 3, v => v === 0 ? '0' : NLP.moneyShort(v));
      const every = w < 420 ? 2 : 1;
      const xt = ms.map((x, i) => [i, NLP.monthShort(x.key)]).filter((_, i) => i % every === 0);
      return NLP.chart({ w, h, x:[0, 11], y:[T.min, T.max], pad:{ l:52, r:18, t:12, b:24 }, yt:T.ticks, xt, label:'Fun Fund balance',
        hover:{ n:ms.length, x:i => i, title:i => NLP.monthLabel(ms[i].key),
          rows:i => { const t = m.trips.filter(q => q.key === ms[i].key); return [{ name:'Fun Fund balance', value:NLP.money(run[i]), color:'var(--nl-accent)' }, { name:'Savings so far', value:NLP.money(sav[i]), color:'#48639A' }].concat(t.length ? [{ name:'Trip: ' + t.map(q => q.trip).join(', '), value:NLP.money(t.reduce((a, q) => a + q.amount, 0)), color:'#C9A56A' }] : []); },
          y:i => [{ v:run[i], color:'var(--nl-accent)' }, { v:sav[i], color:'#48639A' }] },
        draw:({ sx, sy, line, area }) => {
          const pts = run.map((v, i) => [i, v]);
          let s = `<line x1="${sx(0)}" x2="${sx(11)}" y1="${sy(0).toFixed(1)}" y2="${sy(0).toFixed(1)}" class="tdy-zero"/>`;
          if(Math.min(...run) < 0) s += `<path d="${area(run.map((v, i) => [i, Math.min(0, v)]), 0)}" class="tdy-neg"/>`;
          s += `<path d="${line(pts)}" class="tdy-line"/>`;
          // Savings adding up over the same months.
          s += `<path d="${line(sav.map((v, i) => [i, v]))}" class="tdy-sav"/>`;
          s += `<circle cx="${sx(11).toFixed(1)}" cy="${sy(sav[11]).toFixed(1)}" r="3.5" class="tdy-sav-dot"/>`;
          s += `<text class="lab" x="${(sx(11) - 8).toFixed(1)}" y="${Math.max(12, sy(sav[11]) - 9).toFixed(1)}" text-anchor="end">Saved ${H(NLP.moneyShort(sav[11]))} by ${H(NLP.monthShort(ms[11].key))}</text>`;
          // Trip costs: a steel mark on the month they are paid.
          const byMonth = {};
          m.trips.forEach(t => { (byMonth[t.key] = byMonth[t.key] || []).push(t); });
          ms.forEach((x, i) => {
            const list = byMonth[x.key]; if(!list) return;
            const tot = list.reduce((a, t) => a + t.amount, 0);
            s += `<circle cx="${sx(i).toFixed(1)}" cy="${sy(run[i]).toFixed(1)}" r="3.5" class="tdy-trip"><title>${H(list.map(t => t.trip + (t.name ? ' · ' + t.name : '')).join(', '))}: ${H(NLP.money(tot))}</title></circle>`;
          });
          const lo = run.indexOf(Math.min(...run));
          const loTrip = byMonth[ms[lo].key];
          const loTxt = `${loTrip ? H(loTrip[0].trip) + ', ' : 'Lowest, '}${H(NLP.moneyShort(run[lo]))}`;
          const left = sx(lo) > w * .6;
          s += `<circle cx="${sx(lo).toFixed(1)}" cy="${sy(run[lo]).toFixed(1)}" r="4" class="${run[lo] < 0 ? 'tdy-dot-rb' : 'tdy-dot'}"/>`;
          s += `<text class="lab${run[lo] < 0 ? ' rb' : ''}" x="${(sx(lo) + (left ? -8 : 8)).toFixed(1)}" y="${Math.min(h - 30, sy(run[lo]) + 16).toFixed(1)}" text-anchor="${left ? 'end' : 'start'}">${loTxt}</text>`;
          const funY = Math.abs(sy(run[11]) - sy(sav[11])) < 18 ? sy(run[11]) + 18 : Math.max(12, sy(run[11]) - 9);
          if(lo !== 11 && Math.abs(sx(11) - sx(lo)) > 90) s += `<text class="lab" x="${sx(11).toFixed(1)}" y="${funY.toFixed(1)}" text-anchor="end">${H(NLP.moneyShort(run[11]))} in ${H(NLP.monthShort(ms[11].key))}</text>`;
          return s;
        } });
    };
  }
  // What you save, month by month, added up over the next 12 months.
  function savRun(m){ let c = 0; return m.months.map(x => (c += num(x.savings))); }
  function funTitle(m){
    const run = m.run, neg = run.map((v, i) => v < 0 ? i : -1).filter(i => i >= 0);
    if(!neg.length){
      const lo = run.indexOf(Math.min(...run));
      return m.trips.length ? `Fun Fund pays for your trips and stays above zero, lowest in ${NLP.monthShort(m.months[lo].key)}.` : 'Fun Fund stays above zero all year.';
    }
    const first = NLP.monthShort(m.months[neg[0]].key);
    if(run[11] < 0) return `Fun Fund goes below zero in ${first} and stays there.`;
    const back = run.findIndex((v, i) => i > neg[neg.length - 1] && v >= 0);
    return `Fun Fund dips below zero in ${first}, then recovers${back > 0 ? ' by ' + NLP.monthShort(m.months[back].key) : ''}.`;
  }

  // ── The page ───────────────────────────────────────────────────────────
  function render(host){
    const m = model(), ui = st(), tab = ui.tab === 'needs' ? 'needs' : ui.tab === 'review' && NLP.review ? 'review' : 'how';
    const wi = activeWI(), alt = wi ? { w:wi, life:runWhatIf(wi.kind, wi.val) } : null;
    const isNom = nom();
    const sw = `<div class="nl-seg" role="group" aria-label="Show money as"><button type="button" aria-pressed="${!isNom}" onclick="NLP.today.mode('real')" title="Takes out ${H(state.inflationRate)}% inflation a year">Today’s money</button><button type="button" aria-pressed="${isNom}" onclick="NLP.today.mode('nominal')" title="The amounts as they will read in the future">Future money</button></div>`;
    let body = '';
    if(tab === 'how'){
      const r = m.life;
      const chips = Object.keys(WI).map(k => {
        const on = wi && wi.kind === k, v = on ? wi.val : WI[k].dflt;
        if(k === 'retire_earlier' && !retireEarlierPossible()) return `<button type="button" class="nl-chip" disabled title="You are already at or near your retirement age">${H(WI[k].chip(v))}</button>`;
        return `<button type="button" class="nl-chip${on ? ' on' : ''}" aria-pressed="${!!on}" onclick="NLP.today.wi('${k}')">${on ? '' : '+ '}${H(WI[k].chip(v))}${on ? ' ×' : ''}</button>`;
      }).join('') + `<button type="button" class="nl-chip" onclick="NLP.today.askOwn()">+ Ask your own</button>`;
      const legend = NLP.legend([{ label:'Your plan', color:'var(--nl-accent)' }].concat(alt ? [{ label:`What if ${WI[alt.w.kind].short(alt.w.val)} (prepared by Horizon, not saved)`, dash:true }] : []).concat([{ label:'Retired', color:'var(--tdy-amber-bg)' }]));
      body = figureCards(m) +
        NLP.card(lifeTitle(r), `Everything you own, age ${r.cur} to ${r.L}, in ${lensWords()}. Estimate.`,
          NLP.chartBox(lifeChart(m, alt), 250, 'Money over your life') + legend +
          `<div class="tdy-wif"><span>What if:</span>${chips}</div>`) +
        `<div class="nl-two tdy-two">` +
          NLP.card(nextTitle(m), 'Each month’s income split into costs, saving and Fun Fund.',
            NLP.chartBox(nextChart(m), 160, 'Next 12 months') + NLP.legend([{ label:'Costs', color:'var(--tdy-cost)' }, { label:'Saved', color:'var(--nl-accent)' }, { label:'Fun Fund', color:'var(--tdy-fun)' }].concat(m.short.length ? [{ label:'Short', color:'var(--tdy-ruby)' }] : []))) +
          NLP.card(funTitle(m) + ` Savings reach ${NLP.moneyShort(savRun(m)[11])}.`, m.trips.length ? 'Fun Fund balance and your savings adding up, next 12 months. Dots: trip costs.' : 'Fun Fund balance and your savings adding up, next 12 months.',
            NLP.chartBox(funChart(m), 160, 'Fun Fund balance and savings') + NLP.legend([{ label:'Fun Fund', color:'var(--nl-accent)' }, { label:'Savings', color:'#48639A' }].concat(m.trips.length ? [{ label:'Trip cost', color:'var(--tdy-steel)' }] : []).concat(Math.min(...m.run) < 0 ? [{ label:'Below zero', color:'var(--tdy-ruby-bg)' }] : []))) +
        `</div>`;
    } else if(tab === 'review'){
      body = NLP.review.body(m);
    } else {
      body = m.items.length
        ? `<div class="nl-tbl-wrap"><table class="nl-tbl tdy-needs"><thead><tr><th></th><th>What needs you</th><th>Status</th></tr></thead><tbody>${m.items.map((it, i) =>
            `<tr data-nl-row="${it.id}"><td class="mk">${i + 1}</td><td><span class="nm">${H(it.text)}</span><span class="sub">${H(it.detail)}</span></td><td class="tdy-st">${NLP.badge(it.badge.text, it.badge.kind)}</td></tr>`).join('')}</tbody></table></div>`
        : NLP.empty('Nothing needs you right now.');
    }
    host.innerHTML = `<div class="nl-wrap tdy">${NLP.head({ title:'Today', panel:P, tabs:[
      { key:'how', label:'How are we doing', on:tab === 'how' },
      { key:'needs', label:'Needs you', count:m.items.length, on:tab === 'needs' },
    ].concat(NLP.review ? [{ key:'review', label:'Full review', on:tab === 'review' }] : []), actions:tab === 'review' ? NLP.review.actions() : sw })}${body}</div>`;
    if(tab === 'review') NLP.review.wire(host);
    if(tab === 'needs') NLP.rows(host.querySelector('.tdy-needs tbody'), P, id => NLP.today.go(id));
  }

  // ── The side panel's Overview ──────────────────────────────────────────
  function wallGraphic(m){
    if(!m.bricks.length) return '';
    const L = lifeExp(), cur = num(state.currentAge);
    const odd = m.bricks.filter(b => b.verdict !== 'green');
    const ages = odd.slice(0, 3).map(b => b.isCurrent ? 'this year' : (num(b.startAge) === num(b.endAge) ? `age ${b.startAge}` : `age ${b.startAge}–${b.endAge}`));
    const note = !odd.length ? 'Every brick holds.' : `${odd.some(b => b.verdict === 'red') ? 'Not green' : 'Amber'}: ${listWords(ages)}${odd.length > 3 ? ' and more' : ''}.`;
    return `<div class="tdy-wall"><div class="tdy-cap">Your life wall, age ${cur} to ${L} · ${m.green} of ${m.bricks.length} green</div><div class="tdy-bricks">${m.bricks.map(b => `<i class="${H(b.verdict)}${b.isCurrent ? ' now' : ''}" title="Age ${H(b.startAge)}–${H(b.endAge)}: ${H(b.verdict)}"></i>`).join('')}</div><p class="tdy-cap" style="margin:6px 0 0">${H(note)}</p></div>`;
  }
  function overview(){
    if(st().tab === 'review' && NLP.review) return NLP.review.overview(model());
    const m = model(), ui = st(), r = m.life, L = lifeExp();
    const wi = activeWI();
    const items = m.items.filter(it => it.id !== 'pending');   // the panel lists suggestions itself
    const links = [{ label:'Full review', short:'Review', onclick:'NLP.today.report()' }];
    // A chosen row on the Needs you tab.
    const chosen = ui.tab === 'needs' && ui.chosen != null ? m.items.find(it => it.id === String(ui.chosen)) : null;
    if(chosen){
      return {
        headline:H(chosen.text) + '.',
        graphic:`<p class="tdy-why">${H(chosen.why)}</p>`,
        groups:[{ title:'Where it is fixed', rows:[{ text:H(chosen.text), badge:chosen.badge, why:'Press the row again, or the link, to go there.', link:{ label:chosen.act, onclick:`NLP.today.go('${chosen.id}')` } }] }],
        button:{ label:chosen.act, onclick:`NLP.today.go('${chosen.id}')` }, links,
      };
    }
    const n = items.length;
    const waits = n ? `${n} ${plural(n, 'thing waits', 'things wait')} for you.` : 'Nothing waits for you.';
    let lead;
    if(r.verdictKey === 'empty') lead = 'Add what you’ll spend in retirement, so Horizon can tell whether your plan holds.';
    else if(r.verdictKey === 'wellFunded' || r.verdictKey === 'fullyFunded') lead = 'You’re on track.';
    else if(r.verdictKey === 'borderline') lead = `You’re nearly on track: your money lasts to about ${r.runout}.`;
    else lead = `Your money runs out at ${r.runout}, before ${L}.`;
    const groups = [];
    if(n) groups.push({ title:'Needs you', rows:items.map(it => ({ text:H(it.text), badge:it.badge, link:{ label:it.act, onclick:it.go } })) });
    let button = n ? { label:items[0].act, onclick:items[0].go } : null;
    if(wi){
      const a = runWhatIf(wi.kind, wi.val);
      const lasts = a.runout && a.runout < L ? `runs out at ${a.runout}` : `lasts past ${L}`;
      const row = { text:H(WI[wi.kind].chip(wi.val)), badge:{ text:'Not saved', kind:'steel' }, why:`Drawn dashed on the chart: money ${lasts}.`, link:{ label:'Turn it off', onclick:`NLP.today.wi('${wi.kind}')` } };
      if(wi.kind === 'save_more'){
        button = { label:'Prepare it as a real change', onclick:'NLP.today.prepare()' };
      }
      groups.unshift({ title:'What if, prepared not saved', rows:[row] });
    }
    if(!button) button = { label:'Open your retirement plan', onclick:"NLP.go('nl-future')" };
    return { headline:`${lead} ${waits}`, graphic:wallGraphic(m), groups, button, links };
  }

  // ── Actions (called from the page and the panel) ──────────────────────
  NLP.today = {
    mode(m){ if(typeof window.applyDisplayMode === 'function') window.applyDisplayMode(m); else { state.displayMode = m; save(); } },
    wi(kind){
      const w = st().wi;
      if(w && w.kind === kind) st().wi = null; else setWI(kind);
      NLP.renderPage(P);
    },
    go(id){ const f = GO[String(id)]; if(f) f(); },
    prepare(){
      const w = activeWI(); if(!w || w.kind !== 'save_more') return;
      const to = Math.round(num(state.baseSavings) + w.val);
      const r = NLP.propose(`Save ${NLP.money(w.val)} more a month in your plan`, [{ kind:'set_savings', where:'plan', amount:to,
        why:`From the Today what-if “Save ${NLP.money(w.val)} more a month”. Years or months with their own savings amount keep it.` }]);
      if(r && r.error) NLP.toast('That couldn’t be prepared: ' + r.error, 'warn');
      else { NLP.toast('Prepared. Nothing is saved until you press Apply.'); NLP.refreshPanel(); }
    },
    askOwn(){
      if(typeof window.nlOpenAssistant === 'function') window.nlOpenAssistant();
      const i = document.getElementById('nl-ask-input');
      if(i && !i.value.trim()){ i.value = 'What if '; i.dispatchEvent(new Event('input')); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    },
    report(){
      st().tab = 'review'; st().chosen = null;
      if(state.activePanel !== P) NLP.go(P); else NLP.renderPage(P);
    },
    model:() => model(),
  };

  NLP.register({ panel:P, section:'today', label:'Today', render, overview });

  // ── The assistant: draw a what-if on the Today chart ───────────────────
  const keyNums = r => ({
    retire_age:r.ret, life_expectancy:r.L,
    value_at_retirement:NLP.money(r.atRet), value_at_retirement_sek:Math.round(r.atRet),
    value_at_life_expectancy:NLP.money(r.atEnd), value_at_life_expectancy_sek:Math.round(r.atEnd),
    runs_out_at_age:r.runout || null, verdict:r.verdict, coverage_pct:Math.round(Math.min(100, r.coverage)),
  });
  NLP.addTool({
    def:{ name:'show_what_if',
      description:'Draw a what-if as a dashed line on the Today page’s “money over your life” chart (opens Today) and get its key numbers next to the plan’s. Never saved. kind: save_more (amount_or_years = extra SEK saved a month, default 5000), retire_earlier (years earlier, default 3), growth_lower (percentage points less market growth every year, default 2), off (removes the line).',
      input_schema:{ type:'object', properties:{
        kind:{ type:'string', enum:['save_more','retire_earlier','growth_lower','off'] },
        amount_or_years:{ type:'number', description:'SEK a month for save_more, years for retire_earlier, percentage points for growth_lower.' },
      }, required:['kind'], additionalProperties:false } },
    label:i => i && i.kind === 'off' ? 'Removing the what-if' : 'Drawing the what-if',
    run(input){
      const kind = input && input.kind;
      if(kind !== 'off' && !WI[kind]) return { error:'kind must be save_more, retire_earlier, growth_lower or off' };
      if(kind === 'retire_earlier' && !retireEarlierPossible()) return { error:'They are already at or within a year of their retirement age, so retiring earlier cannot be shown.' };
      const w = setWI(kind, input.amount_or_years);
      if(NLP.isOn()){ if(state.activePanel !== P) NLP.go(P); else NLP.renderPage(P); }
      const plan = lifeSeries();
      if(!w) return { shown:false, note:'The what-if line is off. The chart shows the plan only.', plan:keyNums(plan) };
      const alt = runWhatIf(w.kind, w.val);
      return { shown:true, what_if:WI[w.kind].chip(w.val), money_shown_in:lensWords(), plan:keyNums(plan), what_if_result:keyNums(alt),
        note:'Not saved. Drawn dashed on the Today chart. Only saving more can be prepared as a real change (propose_changes, set_savings, where plan).' };
    },
  });
  NLP.addSystem('\n- show_what_if draws a what-if (save more, retire earlier, weaker markets) as a dashed line on the Today chart and returns its key numbers. What-ifs are never saved; say so.');

  // ── Styles (new look only, scoped to this page and its panel graphic) ──
  NLP.css('nl-today-css', `
html.nl { --tdy-steel:#48639A; --tdy-amber:#8A5A0A; --tdy-amber-bg:#FBEEDB; --tdy-ruby:#8F2A22; --tdy-ruby-bg:#FBE5E3; --tdy-cost:#C9CED8; --tdy-fun:#9FD2BF; --tdy-green:#9FD2BF; --tdy-wall-amber:#E9C38A; --tdy-wall-red:#E0A39C; }
#panel-nl-today .tdy-fc { grid-template-columns:repeat(4,minmax(0,1fr)); }
#panel-nl-today .tdy-fc .nl-b { display:inline-block; }
#panel-nl-today .tdy-fc b { font-variant-numeric:tabular-nums; }
#panel-nl-today .tdy-wif { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:10px 0 4px; font-size:12.5px; color:var(--nl-detail); }
#panel-nl-today .tdy-wif .nl-chip:disabled { opacity:.5; cursor:default; }
#panel-nl-today .nl-legend i[style*="tdy-amber-bg"] { outline:1px solid #E9D3B0; }
#panel-nl-today svg.nl-svg .tdy-line { fill:none; stroke:var(--nl-accent); stroke-width:2.5; stroke-linejoin:round; }
#panel-nl-today svg.nl-svg .tdy-sav { fill:none; stroke:#48639A; stroke-width:2.25; stroke-linejoin:round; }
#panel-nl-today svg.nl-svg .tdy-sav-dot { fill:#48639A; }
#panel-nl-today svg.nl-svg .tdy-area { fill:var(--nl-accent); opacity:.13; }
#panel-nl-today svg.nl-svg .tdy-dash { fill:none; stroke:var(--tdy-steel); stroke-width:2; stroke-dasharray:5 4; }
#panel-nl-today svg.nl-svg .tdy-ret { fill:var(--tdy-amber-bg); opacity:.6; }
#panel-nl-today svg.nl-svg .tdy-dot { fill:var(--nl-accent); }
#panel-nl-today svg.nl-svg .tdy-dot-ink { fill:var(--nl-ink); }
#panel-nl-today svg.nl-svg .tdy-dot-rb { fill:var(--tdy-ruby); }
#panel-nl-today svg.nl-svg .tdy-dot-st { fill:var(--tdy-steel); }
#panel-nl-today svg.nl-svg .tdy-trip { fill:#fff; stroke:var(--tdy-steel); stroke-width:2; }
#panel-nl-today svg.nl-svg .tdy-zero { stroke:var(--nl-quiet); stroke-width:1; }
#panel-nl-today svg.nl-svg .tdy-neg { fill:var(--tdy-ruby); opacity:.16; }
#panel-nl-today svg.nl-svg .tdy-cost { fill:var(--tdy-cost); }
#panel-nl-today svg.nl-svg .tdy-save { fill:var(--nl-accent); opacity:.85; }
#panel-nl-today svg.nl-svg .tdy-fun { fill:var(--tdy-fun); }
#panel-nl-today svg.nl-svg .tdy-short { fill:var(--tdy-ruby); opacity:.8; }
#panel-nl-today svg.nl-svg text.am { fill:var(--tdy-amber); }
#panel-nl-today svg.nl-svg text.rb { fill:var(--tdy-ruby); font-weight:500; }
#panel-nl-today svg.nl-svg text.lab.st { fill:var(--tdy-steel); }
#panel-nl-today svg.nl-svg text.lab.rb { fill:var(--tdy-ruby); }
#panel-nl-today .tdy-needs .tdy-st { width:1%; white-space:nowrap; }
#panel-nl-today .tdy-two .nl-cc { margin-bottom:0; }
@media (max-width:1000px){ #panel-nl-today .tdy-fc { grid-template-columns:repeat(2,minmax(0,1fr)); } }
html.nl.nl-phone #panel-nl-today .tdy-fc, html.nl.nl-phone #panel-nl-today .tdy-two { display:none; }
html.nl.nl-phone #panel-nl-today .nl-wrap { padding:12px 12px 24px; }
html.nl .tdy-wall .tdy-cap { font-size:12.5px; color:var(--nl-detail); margin-bottom:6px; }
html.nl .tdy-bricks { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:3px; }
html.nl .tdy-bricks i { height:12px; border-radius:2px; background:var(--tdy-green); }
html.nl .tdy-bricks i.amber { background:var(--tdy-wall-amber); }
html.nl .tdy-bricks i.red { background:var(--tdy-wall-red); }
html.nl .tdy-bricks i.now { outline:2px solid var(--nl-ink); outline-offset:1px; }
html.nl .tdy-why { margin:0; color:var(--nl-quiet); font-size:13.5px; }
`);
})();

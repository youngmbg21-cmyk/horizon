/* ══ NEW LOOK (L+S) · Future page ══════════════════════════════════════════
   Tabs: Runway · Accounts · Life wall. Every number comes from the app's own
   engine: FE.retirement.numbers() (and its _simResult), getProjection(),
   getLifeWallData(gran), FE.display (today's money / future money).
   Nothing here shows or styles anything when the new look is off.
   Design rules: docs/LS-DESIGN.md.                                          */
(function(){
  'use strict';
  if(!window.NLP) return;
  const P = 'nl-future', H = NLP.h;
  const U = () => NLP.ui(P);
  const SC = { lean:'Lean', baseline:'Baseline', comfortable:'Comfortable' };
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const M = v => NLP.money(v), MS = v => NLP.moneyShort(v);
  const pct = v => (Math.round(v * 10) / 10).toLocaleString('en-GB') + '%';
  const yrsTo = age => Math.max(0, age - (state.currentAge || 0));
  const isReal = () => !(FE.display && FE.display.isNominal && FE.display.isNominal());
  const lens = () => isReal() ? 'today’s money' : 'future money, with inflation';
  // A real (today's-money) figure at a given age, shown in the chosen lens.
  const atAge = (v, age) => FE.display.scaleReal(v, yrsTo(age));
  // A nominal projection figure y years ahead, shown in the chosen lens.
  const fromNom = (v, y) => FE.display.discount(v, y);
  const scName = () => SC[state.retirementScenario || 'baseline'] || 'Baseline';
  const investments = () => (state.externalAssets || []).filter(a => (a.assetType || 'investment') === 'investment');
  const pensions = () => (state.externalAssets || []).filter(a => a.assetType === 'pension');
  const toDisp = v => Math.round((Number(v) || 0) * rate());
  const fromDisp = v => parseNum(v) / (rate() || 1);
  const ellip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  // ── "Your plan": the saved settings what-ifs and scenario presses move away from ──
  // Kept in state.nlPlan. Set the first time this page opens; "Make this my
  // plan" moves it; "Back to my plan" restores it (with Undo).
  const PLAN_FIELDS = ['retirementAge','retirementScenario','lifeExp','growthRate','retirementPostGrowth','externalAssets'];
  function planSnap(){
    const g = {}; (state.externalAssets || []).forEach(a => { if((a.assetType || 'investment') === 'investment') g[a.id] = a.growthRate ?? null; });
    return { retirementAge:state.retirementAge, retirementScenario:state.retirementScenario || 'baseline', lifeExp:state.lifeExp || 90,
      growthRate:state.growthRate ?? null, retirementPostGrowth:state.retirementPostGrowth ?? null, assetGrowth:g };
  }
  function ensurePlan(){ if(!state.nlPlan || typeof state.nlPlan !== 'object'){ state.nlPlan = planSnap(); save(); } return state.nlPlan; }
  // What differs from the plan, in words.
  function planDiffs(){
    const p = state.nlPlan; if(!p) return [];
    const c = planSnap(), out = [];
    if(c.retirementScenario !== p.retirementScenario) out.push(`${SC[c.retirementScenario] || c.retirementScenario} (your plan: ${SC[p.retirementScenario] || p.retirementScenario})`);
    if(c.retirementAge !== p.retirementAge) out.push(`retire at ${c.retirementAge} (your plan: ${p.retirementAge})`);
    if(c.lifeExp !== p.lifeExp) out.push(`live to ${c.lifeExp} (your plan: ${p.lifeExp})`);
    const growthMoved = c.growthRate !== p.growthRate || c.retirementPostGrowth !== p.retirementPostGrowth ||
      Object.keys(p.assetGrowth || {}).some(id => id in c.assetGrowth && c.assetGrowth[id] !== p.assetGrowth[id]);
    if(growthMoved) out.push('different growth rates');
    return out;
  }
  window.NLF = window.NLF || {};
  NLF.planBack = () => {
    const p = state.nlPlan; if(!p || !planDiffs().length) return;
    U().wif = [];
    change('Back to your plan', PLAN_FIELDS, s => {
      s.retirementAge = p.retirementAge; s.retirementScenario = p.retirementScenario; s.lifeExp = p.lifeExp;
      if(p.growthRate == null) delete s.growthRate; else s.growthRate = p.growthRate;
      if(p.retirementPostGrowth == null) delete s.retirementPostGrowth; else s.retirementPostGrowth = p.retirementPostGrowth;
      (s.externalAssets || []).forEach(a => { if(a.id in (p.assetGrowth || {})){ if(p.assetGrowth[a.id] == null) delete a.growthRate; else a.growthRate = p.assetGrowth[a.id]; } });
    }, true);
  };
  NLF.planKeep = () => {
    const before = state.nlPlan;
    state.nlPlan = planSnap(); save();
    NLP.toast('This is now your plan · saved', '', { label:'Undo', fn:() => { state.nlPlan = before; save(); NLP.toast('Change undone'); } });
  };

  // ── Saving a change the person makes here ───────────────────────────────
  // Retirement fields are not in the shared Undo snapshot (core only keeps
  // the budget), so this page keeps its own one-step Undo in the toast.
  function change(label, fields, mutate, isPlanReset){
    if(!isPlanReset && fields.some(f => PLAN_FIELDS.includes(f))) ensurePlan();
    const before = {}; fields.forEach(f => { before[f] = clone(state[f]); });
    try { mutate(state); }
    catch(err){ fields.forEach(f => { if(before[f] === undefined) delete state[f]; else state[f] = before[f]; }); NLP.toast('Nothing was saved: ' + err.message, 'warn'); return false; }
    if(typeof invalidateSelectors === 'function') invalidateSelectors();
    save();
    NLP.toast(label + ' · saved', '', { label:'Undo', fn:() => {
      fields.forEach(f => { if(before[f] === undefined) delete state[f]; else state[f] = before[f]; });
      // Forget what was typed so the redraw shows the restored values.
      document.querySelectorAll('#panel-' + P + ' input[id]').forEach(i => i.removeAttribute('id'));
      if(typeof invalidateSelectors === 'function') invalidateSelectors();
      save(); NLP.toast('Change undone');
    } });
    return true;
  }

  // ── What-ifs: drawn on a copy of the plan, never saved ──────────────────
  function wifDefs(){
    const ra = state.retirementAge, sc = state.retirementScenario || 'baseline', le = state.lifeExp || 90, list = [];
    if(ra - 3 > (state.currentAge || 0)) list.push({ key:'earlier', label:`Retire at ${ra - 3}`, long:`Retire 3 years earlier, at ${ra - 3}`, fields:['retirementAge'], mut:s => { s.retirementAge = ra - 3; } });
    if(sc !== 'comfortable') list.push({ key:'comfy', label:'Comfortable lifestyle', long:'Comfortable lifestyle (×1.3)', fields:['retirementScenario'], mut:s => { s.retirementScenario = 'comfortable'; } });
    list.push({ key:'weak', label:'Markets 2% weaker', long:'Markets grow 2% a year less', fields:['growthRate','retirementPostGrowth','externalAssets'], mut:s => {
      s.growthRate = Math.max(0, (s.growthRate || 0) - 2);
      s.retirementPostGrowth = (s.retirementPostGrowth ?? 4) - 2;
      (s.externalAssets || []).forEach(a => { if((a.assetType || 'investment') === 'investment' && a.growthRate != null) a.growthRate = Math.max(0, a.growthRate - 2); });
    } });
    if(le < 95) list.push({ key:'live95', label:'Live to 95', long:'Live to 95', fields:['lifeExp'], mut:s => { s.lifeExp = 95; } });
    return list;
  }
  const activeWifs = () => { const on = U().wif || []; return wifDefs().filter(d => on.includes(d.key)); };
  // NLP.whatIf restores its own list of fields; lifeExp and
  // retirementPostGrowth are kept and put back here as well.
  function whatIf(mutate){
    const extra = ['lifeExp','retirementPostGrowth'], keep = {};
    extra.forEach(f => { keep[f] = clone(state[f]); });
    try {
      return NLP.whatIf(mutate, () => {
        const n = FE.retirement.numbers();
        return { n, sim:n._simResult, retAge:state.retirementAge, lifeExp:state.lifeExp || 90 };
      });
    } finally {
      extra.forEach(f => { if(keep[f] === undefined) delete state[f]; else state[f] = keep[f]; });
      if(typeof invalidateSelectors === 'function') invalidateSelectors();
    }
  }
  window.NLF = window.NLF || {};
  NLF.wif = key => {
    const st = U(); const on = new Set(st.wif || []);
    if(on.has(key)) on.delete(key); else on.add(key);
    st.wif = [...on]; NLP.renderPage(P);
  };
  NLF.wifClear = () => { U().wif = []; NLP.renderPage(P); };
  NLF.wifKeep = () => {
    const defs = activeWifs(); if(!defs.length) return;
    const fields = [...new Set(defs.flatMap(d => d.fields))];
    if(change('Now using: ' + defs.map(d => d.label).join(' + '), fields, s => defs.forEach(d => d.mut(s)))) U().wif = [];
  };
  NLF.scen = sc => {
    if(!SC[sc] || (state.retirementScenario || 'baseline') === sc) return;
    ensurePlan();
    state.retirementScenario = sc;               // same path as the classic Retirement Plan page
    U().wif = (U().wif || []).filter(k => k !== 'comfy');
    save();
  };

  // ── Pensions: the classic page's data shape ─────────────────────────────
  function addPension(p, label){
    const ra = state.retirementAge;
    const item = { id:genId(), name:String(p.name || 'Pension').trim() || 'Pension', monthlyPayout:Math.max(0, Math.round(Number(p.monthlyPayout) || 0)),
      startAge:Math.round(Number(p.startAge) || ra), endAge:p.endAge ? Math.round(Number(p.endAge)) : null, assetType:'pension' };
    if(change(label || (item.name + ' added'), ['externalAssets'], s => { if(!Array.isArray(s.externalAssets)) s.externalAssets = []; s.externalAssets.push(item); })){
      U().penSug = null; U().penForm = false; U().open = null;
      return item;
    }
    return null;
  }
  NLF.penAddForm = () => {
    const v = id => (document.getElementById(id) || {}).value;
    const payout = fromDisp(v('nlf-pn-pay'));
    const age = Math.round(parseNum(v('nlf-pn-age')));
    if(!(payout > 0)){ NLP.toast('Type how much the pension pays a month first.', 'warn'); document.getElementById('nlf-pn-pay')?.focus(); return; }
    if(!(age >= 40 && age <= 100)){ NLP.toast('Type the age it starts paying, between 40 and 100.', 'warn'); document.getElementById('nlf-pn-age')?.focus(); return; }
    const name = String(v('nlf-pn-name') || '').trim() || 'Pension';
    ['nlf-pn-name','nlf-pn-pay','nlf-pn-age'].forEach(id => document.getElementById(id)?.removeAttribute('id'));
    addPension({ name, monthlyPayout:payout, startAge:age }, name + ' added');
  };
  NLF.penShowForm = () => { const st = U(); st.penForm = !st.penForm; st.chosen = 'pen-none'; st.open = st.penForm ? 'pen-none' : null; NLP.renderPage(P); };
  NLF.penOpen = () => {
    const st = U(); st.penForm = true; st.chosen = 'pen-none'; st.open = 'pen-none'; NLP.renderPage(P);
    setTimeout(() => { const el = document.getElementById('nlf-pn-name'); if(el){ el.scrollIntoView({ block:'center' }); el.focus(); } }, 120);
  };
  NLF.penSugAdd = () => { const s = U().penSug; if(s) addPension(s, s.name + ' added to your plan'); };
  NLF.penSugDrop = () => { U().penSug = null; NLP.renderPage(P); NLP.toast('Suggested pension dropped'); };
  NLF.askPension = () => NLP.ask('I want to add my pension');

  // ── What if one of us dies (asked of the assistant, never a page) ─────
  // Two steps, both drawn in the conversation only:
  //   1. survivor_picture reads the plan (next 12 months, not just today),
  //      ALWAYS searches every Notebook file for cover, and returns what it
  //      found, the answers saved before and the questions that must be asked.
  //      show_survivor_questions then shows those questions as a small form.
  //   2. With the answers, survivor_picture works out the money over time
  //      (each payment for as many years as it pays, payouts that clear the
  //      mortgage or a debt) and show_survivor_card draws the answer. The card
  //      is refused until every payout found in the files is counted or
  //      listed as not counted, with the reason.
  // Nothing is ever saved to the plan.
  let lastSurv = null;
  const SV = () => { if(!state.nlSurvivor || typeof state.nlSurvivor !== 'object') state.nlSurvivor = {}; const s = state.nlSurvivor; s.answers = s.answers || {}; return s; };
  const COVER_QUERIES = ['life insurance livförsäkring', 'efterlevandeskydd familjeskydd survivor', 'tgl grupplivförsäkring group life', 'förmånstagare beneficiary', 'återbetalningsskydd refund', 'inkomstförsäkring income insurance', 'family protection familjeskydd per month', 'barnpension child', 'försäkring insurance cover one time payment', 'pension pensionsbesked', 'bolån låneskydd mortgage insurance', 'testamente will äktenskapsförord'];
  async function notebookCover(){
    const tools = window.NL_EXTRA_TOOLS || [], sf = tools.find(t => t.def.name === 'search_files'), lf = tools.find(t => t.def.name === 'list_files');
    let list = null; try { list = lf ? await lf.run({}) : null; } catch(_){}
    const names = list && Array.isArray(list.files) ? list.files.map(f => f.file) : [];
    if(!sf || !names.length) return { files_checked:0, file_names:[], passages:[] };
    const seen = new Map();
    for(const q of COVER_QUERIES){
      let r = null; try { r = await sf.run({ query:q }); } catch(_){}
      ((r && r.results) || []).forEach((x, i) => { if(!seen.has(x.ref)) seen.set(x.ref, Object.assign({ hits:0, rank:99 }, x)); const e = seen.get(x.ref); e.hits++; e.rank = Math.min(e.rank, i); });
    }
    const passages = [...seen.values()].sort((a, b) => strongAmt(b.text) - strongAmt(a.text) || b.hits - a.hits || a.rank - b.rank).slice(0, 24)
      .map(x => ({ ref:x.ref, file:x.file, where:x.where, text:String(x.text || '').slice(0, 320), states_an_amount:!!strongAmt(x.text) }));
    return { files_checked:names.length, file_names:names, passages };
  }
  // A passage that states a payout: an amount next to cover words.
  const strongAmt = t => { t = String(t || ''); return /\d[\d\s.,]{3,}\s?(kr|sek|:-)|\bsek\s?\d|price base amount|prisbasbelopp/i.test(t) && /insur|försäkr|cover|skydd|protection|pension|tgl|payment|utbetal|lump|engångs/i.test(t) && !/\[number hidden\]/.test(t) ? 1 : 0; };
  const refsIn = t => (String(t || '').match(/\[(\d+)\]|\bref\s*(\d+)/gi) || []).map(x => +x.replace(/\D/g, ''));
  const wordIn = (name, who) => { const w = String(who || '').trim().toLowerCase(); return !!w && new RegExp('(^|[^\\p{L}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\p{L}]|$)', 'iu').test(String(name || '')); };
  const isMortgage = n => /mortgage|bolån|huslån|bostadslån|\blån\b/i.test(String(n || ''));
  // Each budget line's average over the next 12 months of the plan (not just today).
  function planLines(){
    const inc = new Map(), exp = new Map(), now = new Map(), months = new Map(), max = new Map(); let sav = 0;
    for(let i = 0; i < 12; i++){
      const d = new Date(CY, CM + i, 1), e = getEffective(d.getFullYear(), d.getMonth());
      (e.incomeItems || []).forEach(x => { inc.set(x.name, (inc.get(x.name) || 0) + (Number(x.amount) || 0)); if(i === 0) now.set('i:' + x.name, Number(x.amount) || 0); });
      (e.expenseItems || []).forEach(x => { const v = Number(x.amount) || 0; exp.set(x.name, (exp.get(x.name) || 0) + v); if(v){ months.set(x.name, (months.get(x.name) || 0) + 1); max.set(x.name, Math.max(max.get(x.name) || 0, v)); } });
      sav += Number(e.savings) || 0;
    }
    const avg = m => [...m.entries()].map(([name, t]) => ({ name, amount:t / 12 })).filter(x => x.amount > 0 || true);
    return { inc:avg(inc).map(x => Object.assign(x, { thisMonth:now.get('i:' + x.name) ?? 0 })), exp:avg(exp).map(x => Object.assign(x, { months:months.get(x.name) || 0, max:max.get(x.name) || 0 })), sav:sav / 12 };
  }
  const r0 = v => Math.round(Number(v) || 0);
  const ownerOf = a => a.owner === 'spouse' ? 'spouse' : 'me';

  NLP.addTool({
    def:{ name:'survivor_picture',
      description:'Work out what happens to the household if one partner dies. Read-only; nothing is saved. Call it FIRST with only person_name, owner and survivor_name: it reads the plan (12-month averages), searches every Notebook file for cover and returns the passages, saved_answers and must_ask. Then ask with show_survivor_questions. Once answered, call it again with every payout from the files (payments, lump_sums), costs that end and not_counted, then call show_survivor_card. Amounts are SEK.',
      input_schema:{ type:'object', properties:{
        person_name:{ type:'string', description:'The partner who dies, as named in the budget lines.' },
        owner:{ type:'string', enum:['me','spouse'], description:'Owner their accounts and pensions are filed under.' },
        survivor_name:{ type:'string', description:'The partner who is left, as named in the budget lines.' },
        survivor_income_monthly:{ type:'number', description:'Survivor\'s own income, SEK a month after tax, only if the person answered it. Otherwise the plan\'s 12-month average is used.' },
        payments:{ type:'array', description:'Every monthly payment to the survivor found in the files or given by the person.', items:{ type:'object', properties:{
          name:{ type:'string' }, monthly:{ type:'number', description:'SEK a month.' }, years:{ type:'number', description:'How many years it pays; leave out for life.' },
          before_tax:{ type:'boolean', description:'true if the amount is before tax; leave out if unknown (then it is treated as before tax).' },
          source:{ type:'string', description:'The file and [ref], or "your answer".' } }, required:['name','monthly','source'], additionalProperties:false } },
        lump_sums:{ type:'array', description:'Every one-off payout found in the files or given by the person.', items:{ type:'object', properties:{
          name:{ type:'string' }, amount:{ type:'number', description:'SEK.' },
          pays:{ type:'string', enum:['survivor','mortgage','debt'], description:'Who gets it: the survivor, the mortgage lender (the mortgage cost stops), or a debt (that cost stops).' },
          debt_line:{ type:'string', description:'For pays=debt: the budget line it clears, e.g. "Chase".' },
          source:{ type:'string', description:'The file and [ref], or "your answer".' } }, required:['name','amount','pays','source'], additionalProperties:false } },
        costs_that_end:{ type:'array', items:{ type:'string' }, description:'Budget lines that would end for another reason the person gave (e.g. a debt they said is paid off).' },
        not_counted:{ type:'array', description:'Cover found in the files that is NOT counted, with why (e.g. no amount stated).', items:{ type:'object', properties:{ what:{ type:'string' }, why:{ type:'string' }, source:{ type:'string' } }, required:['what','why','source'], additionalProperties:false } },
        retirement_spending_share:{ type:'number', description:'Share of the couple\'s retirement spending one person needs. Default 0.65.' },
        pause_saving:{ type:'boolean', description:'Default true.' },
        survivor_age:{ type:'integer' }
      }, required:['person_name','owner','survivor_name'], additionalProperties:false } },
    label:() => 'Reading your plan and files',
    async run(input){
      const who = String(input.person_name || '').trim(), surv = String(input.survivor_name || '').trim();
      if(!who || !surv) return { error:'person_name and survivor_name are needed' };
      const own = input.owner === 'spouse' ? 'spouse' : 'me';
      const share = Number.isFinite(+input.retirement_spending_share) && +input.retirement_spending_share > 0 && +input.retirement_spending_share <= 1.2 ? +input.retirement_spending_share : 0.65;
      const pause = input.pause_saving !== false;
      const payments = (input.payments || []).filter(p => Number(p.monthly) > 0);
      const lumps = (input.lump_sums || []).filter(l => Number(l.amount) > 0);
      for(const x of payments.concat(lumps)) if(!String(x.source || '').trim()) return { error:`Say where "${x.name}" comes from (a file and [ref], or "your answer"). Never estimate cover.` };
      const files = await notebookCover();
      const pl = planLines();
      const incStops = pl.inc.filter(i => wordIn(i.name, who)), survLines = pl.inc.filter(i => wordIn(i.name, surv)), incOther = pl.inc.filter(i => !wordIn(i.name, who) && !wordIn(i.name, surv) && i.amount > 0);
      const survPlan = survLines.reduce((t, x) => t + x.amount, 0), survNow = survLines.reduce((t, x) => t + x.thisMonth, 0);
      const survIncome = Number.isFinite(+input.survivor_income_monthly) && +input.survivor_income_monthly >= 0 ? +input.survivor_income_monthly : survPlan;
      // Costs: the person's own lines end; a mortgage or debt paid off by a payout ends; lines the person said end.
      const ptax = typeof getPensionTaxRate === 'function' ? getPensionTaxRate() : 0.25;
      const paysMortgage = lumps.some(l => l.pays === 'mortgage');
      const debtLines = lumps.filter(l => l.pays === 'debt' && l.debt_line).map(l => l.debt_line.toLowerCase());
      const endNames = (input.costs_that_end || []).map(x => String(x).toLowerCase());
      const ends = [], stays = [];
      pl.exp.forEach(x => {
        const why = wordIn(x.name, who) ? 'their own cost' : (paysMortgage && isMortgage(x.name)) ? 'paid off by the mortgage insurance' : debtLines.some(d => x.name.toLowerCase().includes(d)) ? 'paid off by insurance' : endNames.some(d => x.name.toLowerCase().includes(d)) ? 'your answer' : '';
        (why ? ends : stays).push(Object.assign({ why }, x));
      });
      const expAfter = stays.reduce((t, x) => t + x.amount, 0), expNow = pl.exp.reduce((t, x) => t + x.amount, 0);
      const incNow = pl.inc.reduce((t, x) => t + x.amount, 0);
      const leftNow = incNow - expNow - pl.sav;
      const net = p => (Number(p.monthly) || 0) * (p.before_tax === false ? 1 : 1 - ptax);
      // Year by year until the last payment ends (at least 1 year, at most 30).
      const lastYear = Math.min(30, Math.max(1, ...payments.map(p => Number(p.years) > 0 ? Math.ceil(+p.years) : 1)));
      const yearLeft = y => survIncome + incOther.reduce((t, x) => t + x.amount, 0) + payments.filter(p => !(Number(p.years) > 0) || y <= +p.years).reduce((t, p) => t + net(p), 0) - expAfter - (pause ? 0 : pl.sav);
      const phases = []; for(let y = 1; y <= lastYear + 1; y++){ const v = yearLeft(y), last = phases[phases.length - 1]; if(last && Math.round(last.left) === Math.round(v)) last.to = y; else phases.push({ from:y, to:y, left:v }); }
      if(phases.length) phases[phases.length - 1].open = true;
      const accounts = (getInvestmentAssets() || []).map(a => ({ name:a.name, owner:ownerOf(a), balance:r0(a.balance) }));
      const toSurvivor = lumps.filter(l => l.pays === 'survivor').reduce((t, l) => t + (+l.amount), 0);
      let cash = accounts.reduce((t, a) => t + a.balance, 0) + toSurvivor, months = 0, short = false;
      for(let m = 0; m < 12 * 60; m++){ const v = yearLeft(Math.floor(m / 12) + 1); if(v < 0){ short = true; cash += v; if(cash < 0) break; } months++; }
      const monthsCover = short ? (cash < 0 ? months : null) : null;
      const pens = getPensionAssets() || [];
      const pensStop = pens.filter(p => ownerOf(p) === own);
      const before = getRetirementNumbers();
      const after = NLP.whatIf(st => {
        st.externalAssets = (st.externalAssets || []).filter(a => !(a.assetType === 'pension' && ownerOf(a) === own));
        if(toSurvivor > 0) st.externalAssets.push({ id:'whatif-lumps', name:'Insurance payouts', assetType:'investment', accountType:'standard', taxRate:0, balance:toSurvivor, monthlyContribution:0, growthRate:st.growthRate });
        payments.filter(p => !(Number(p.years) > 0)).forEach((p, i) => st.externalAssets.push({ id:'whatif-pay-' + i, name:p.name, assetType:'pension', monthlyPayout:Number(p.monthly) || 0, startAge:st.currentAge }));
        st.baseIncome = (st.baseIncome || []).filter(i => !wordIn(i.name, who));
        st.baseExpenses = (st.baseExpenses || []).filter(x => !ends.some(e => e.name === x.name));
        if(pause){ st.baseSavings = 0; Object.values(st.yearlyBases || {}).forEach(b => { if(b && b.savings != null) b.savings = 0; }); Object.values(st.monthlyOverrides || {}).forEach(o => { if(o && o.savings != null) o.savings = 0; }); }
        st.retirementExpenses = (st.retirementExpenses || []).map(x => Object.assign({}, x, { amount:(Number(x.amount) || 0) * share }));
        if(Number.isFinite(+input.survivor_age) && +input.survivor_age >= 18 && +input.survivor_age < (st.retirementAge || 65)) st.currentAge = Math.round(+input.survivor_age);
      }, () => { const n = getRetirementNumbers(); return { runout:n.runoutAge || null, verdict:n.verdict }; });
      // What must be asked before the answer (unless already answered).
      const sv = SV(), must = [];
      if(survLines.length && Math.round(survNow) !== Math.round(survPlan) && !sv.answers['survivor_income'])
        must.push({ id:'survivor_income', why:`${surv}'s income is ${r0(survNow)} SEK this month but ${r0(survPlan)} SEK a month on average over the next 12 months`, suggest:{ kind:'amount', prefill_sek:r0(survPlan) } });
      if(!survLines.length && !sv.answers['survivor_income'])
        must.push({ id:'survivor_income', why:`No income line named "${surv}"`, suggest:{ kind:'amount' } });
      const cited = new Set(payments.concat(lumps).map(x => refsIn(x.source)).flat().concat((input.not_counted || []).map(x => refsIn(x.source + ' ' + x.what)).flat()));
      const amountPassages = files.passages.filter(p => p.states_an_amount);
      const uncounted = amountPassages.filter(p => !cited.has(+p.ref));
      lastSurv = { who, surv, own, share, pause, sav:pl.sav, leftNow, phases, monthsCover, files, uncounted:uncounted.map(p => p.ref), mustOpen:must.map(m => m.id), asked:false,
        incStops:incStops.filter(i => i.amount > 0), survIncome, survSource:Number.isFinite(+input.survivor_income_monthly) ? 'Your answer' : (survLines.length ? 'Average of the next 12 months in your plan' : ''), incOther,
        payments:payments.map(p => ({ name:p.name, monthly:+p.monthly, years:Number(p.years) > 0 ? +p.years : null, before_tax:p.before_tax, source:String(p.source).slice(0, 140) })),
        lumps:lumps.map(l => ({ name:l.name, amount:+l.amount, pays:l.pays, debt_line:l.debt_line || '', source:String(l.source).slice(0, 140) })),
        ends:ends.map(x => ({ name:x.name, amount:x.amount, why:x.why })), contSum:expAfter, contNames:stays.slice().sort((a, b) => b.amount - a.amount).slice(0, 2).map(x => x.name),
        notCounted:(input.not_counted || []).map(x => ({ what:String(x.what).slice(0, 100), why:String(x.why).slice(0, 160), source:String(x.source).slice(0, 120) })),
        pensStop:pensStop.length, lastsTo:after.runout || null, lifeExp:state.lifeExp || 90 };
      return {
        currency_note:'All amounts SEK; convert to the display currency before quoting.',
        plan_basis:'12-month averages of the plan, not only this month',
        income_stops:incStops.map(i => ({ line:i.name, monthly:r0(i.amount) })),
        survivor_income:{ used:r0(survIncome), plan_average:r0(survPlan), this_month:r0(survNow), source:lastSurv.survSource },
        costs_end:ends.map(x => ({ line:x.name, monthly:r0(x.amount), why:x.why })), costs_continue_total:r0(expAfter),
        // Every cost line in the next 12 months, including one-month lines (e.g. a card bill in one month only), so nothing is called "not in the budget" by mistake.
        all_cost_lines:pl.exp.map(x => ({ line:x.name, average_a_month:r0(x.amount), months_with_it:x.months, biggest_month:r0(x.max) })),
        left_each_month_now:r0(leftNow), phases:phases.map(p => ({ years:p.open ? `${p.from}+` : (p.from === p.to ? String(p.from) : `${p.from}-${p.to}`), left_each_month:r0(p.left) })),
        months_savings_cover_gap:monthsCover, savings_available:r0(accounts.reduce((t, a) => t + a.balance, 0) + toSurvivor),
        pension_tax_rate_used_for_before_tax_payments:Math.round(ptax * 100) + '%',
        retirement:{ couple_now:before.runoutAge || 'past ' + (state.lifeExp || 90), survivor_alone:after.runout || 'past ' + (state.lifeExp || 90) },
        from_your_files:files,
        saved_answers:sv.answers,
        must_ask:must,
        payouts_not_yet_counted:uncounted.map(p => ({ ref:p.ref, file:p.file, text:p.text })),
        next:must.length || !Object.keys(sv.answers).length
          ? 'STEP 1: call show_survivor_questions now. Put must_ask first, then only questions that change the numbers and that neither the files nor saved_answers already answer (who receives each payout, whether a cost such as a debt would end, whether payments are before or after tax). Use choices where you can. Then reply with ONE short sentence and stop.'
          : (uncounted.length ? 'Count every payout in payouts_not_yet_counted: run survivor_picture again with each one in payments or lump_sums (source with its [ref]) or in not_counted with why. Then call show_survivor_card.' : 'Call show_survivor_card, then reply with at most two short sentences.'),
      };
    }
  });

  NLP.addTool({
    def:{ name:'show_survivor_questions',
      description:'Step 1 of "if one of us dies": show the questions as a small form in the conversation, BEFORE the answer. Each question has choices or a box for an amount or words. Answers are saved and come back in survivor_picture.saved_answers. Ask at most 6. Never ask for ID, account or policy numbers.',
      input_schema:{ type:'object', properties:{
        intro:{ type:'string', description:'One sentence, e.g. "Before I work it out, 4 quick questions."' },
        found:{ type:'array', items:{ type:'string' }, description:'Short names of the cover found in the files, e.g. "Nordea life cover".' },
        questions:{ type:'array', maxItems:6, items:{ type:'object', properties:{
          id:{ type:'string', description:'Short stable id, e.g. "survivor_income", "nordea_payee", "chase".' },
          text:{ type:'string' }, kind:{ type:'string', enum:['choice','amount','text'] },
          options:{ type:'array', items:{ type:'string' }, description:'For choice: 2 to 4 options; add "Not sure" when useful.' },
          prefill_sek:{ type:'number', description:'For amount: a suggested value in SEK (e.g. the plan average).' },
          hint:{ type:'string', description:'Where the suggestion comes from.' },
          quote:{ type:'string', description:'The file passage the question is about, with its [ref].' }
        }, required:['id','text','kind'], additionalProperties:false } }
      }, required:['questions'], additionalProperties:false } },
    label:() => 'Preparing a few questions',
    run(input){
      const clean = t => (typeof window.hzMaskIds === 'function' ? window.hzMaskIds(String(t || '')) : String(t || '')).slice(0, 240);
      const qs = (input.questions || []).slice(0, 6).map(q => ({ id:String(q.id || '').replace(/[^\w-]/g, '').slice(0, 40) || 'q', text:clean(q.text), kind:['choice','amount','text'].includes(q.kind) ? q.kind : 'text',
        options:(q.options || []).slice(0, 5).map(o => clean(o).slice(0, 60)), prefill:Number.isFinite(+q.prefill_sek) ? +q.prefill_sek : null, hint:clean(q.hint).slice(0, 100), quote:clean(q.quote).slice(0, 200) }));
      if(lastSurv) lastSurv.asked = true;
      window.__nlCard = { type:'survivorQ', intro:clean(input.intro) || `Before I work it out, ${qs.length} quick ${qs.length === 1 ? 'question' : 'questions'}.`, files:lastSurv ? lastSurv.files.files_checked : 0, found:(input.found || []).slice(0, 8).map(f => clean(f).slice(0, 60)), questions:qs };
      return { ok:true, note:'The questions are shown as a form above your reply. Reply with ONE short sentence and stop; the person answers in the form and Horizon sends you the answers.' };
    }
  });

  NLP.addTool({
    def:{ name:'show_survivor_card',
      description:'Step 2: draw the answer card from the last survivor_picture. Call it only after the questions are answered and every payout in the files is counted or listed as not counted. You give only names and words: who to contact with the exact question for each.',
      input_schema:{ type:'object', properties:{
        contacts:{ type:'array', maxItems:6, items:{ type:'object', properties:{ institution:{ type:'string' }, question:{ type:'string' } }, required:['institution','question'], additionalProperties:false } }
      }, required:['contacts'], additionalProperties:false } },
    label:() => 'Drawing the picture',
    run(input){
      if(!lastSurv) return { error:'Call survivor_picture first.' };
      const open = lastSurv.mustOpen.filter(id => !SV().answers[id]);
      if(open.length) return { error:`Ask first: call show_survivor_questions with ${open.join(', ')}, then wait for the answers.` };
      if(lastSurv.uncounted.length) return { error:`Not every payout in the files is counted. For each of these refs, add it to payments or lump_sums (with the [ref] in source) or to not_counted with why, by calling survivor_picture again: ${lastSurv.uncounted.join(', ')}.` };
      const clean = t => (typeof window.hzMaskIds === 'function' ? window.hzMaskIds(String(t || '')) : String(t || '')).slice(0, 220);
      window.__nlCard = Object.assign({ type:'survivor2' }, lastSurv, { contacts:(input.contacts || []).slice(0, 6).map(c => ({ institution:clean(c.institution).slice(0, 80), question:clean(c.question) })) });
      return { ok:true, note:'The card is shown above your reply. Write at most two short, gentle sentences. Do not repeat numbers.' };
    }
  });
  window.nlTakeCard = () => { const c = window.__nlCard || null; window.__nlCard = null; return c; };

  // The questions form: choices are buttons, amounts and words are boxes.
  window.nlSvPick = btn => { const q = btn.closest('.nl-svq-q'); q.querySelectorAll('.nl-svq-chip').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false')); };
  window.nlSvSave = btn => {
    const box = btn.closest('.nl-svq'), sv = SV(), lines = [];
    box.querySelectorAll('.nl-svq-q').forEach((q, i) => {
      const id = q.dataset.id, text = q.dataset.text;
      const pick = q.querySelector('.nl-svq-chip[aria-pressed="true"]'), inp = q.querySelector('input');
      const v = pick ? pick.textContent.trim() : inp ? inp.value.trim() : '';
      if(!v) return;
      const shown = inp && q.dataset.kind === 'amount' ? `${v} a month` : v;
      sv.answers[id] = { q:text, a:shown, at:new Date().toISOString() };
      lines.push(`${i + 1}. ${text} ${shown}`);
    });
    if(!lines.length){ NLP.toast('Answer at least one question first.', 'warn'); return; }
    save();
    NLP.ask('My answers:\n' + lines.join('\n') + '\nPlease work it out.');
  };
  function questionsHtml(c){
    const sv = SV().answers;
    const qh = (q, i) => {
      const saved = sv[q.id] ? sv[q.id].a : '';
      let ctl = '';
      if(q.kind === 'choice' && q.options.length) ctl = `<div class="nl-svq-chips">${q.options.map(o => `<button type="button" class="nl-svq-chip" aria-pressed="${saved === o}" onclick="nlSvPick(this)">${H(o)}</button>`).join('')}</div>`;
      else if(q.kind === 'amount') ctl = `<div class="nl-svq-in"><input type="text" inputmode="decimal" value="${H(saved ? saved.replace(/ a month$/, '') : (q.prefill != null ? NLP.money(q.prefill) : ''))}" aria-label="${H(q.text)}">${q.hint ? `<span>${H(q.hint)}</span>` : ''}</div>`;
      else ctl = `<div class="nl-svq-in"><input type="text" value="${H(saved)}" aria-label="${H(q.text)}"></div>`;
      return `<div class="nl-svq-q" data-id="${H(q.id)}" data-kind="${H(q.kind)}" data-text="${H(q.text)}"><span class="t">${i + 1}. ${H(q.text)}</span>${q.quote ? `<span class="w">${H(q.quote)}</span>` : ''}${ctl}</div>`;
    };
    return `<div class="nl-svq"><p class="nl-sv-hl">${H(c.intro)}${c.files ? ` I read your ${c.files} Notebook file${c.files > 1 ? 's' : ''} first.` : ''}</p>
      ${c.found && c.found.length ? `<div class="nl-svq-found">Found in your files: ${H(c.found.join(', '))}.</div>` : ''}
      ${c.questions.map(qh).join('')}
      <button type="button" class="nl-black nl-svq-go" onclick="nlSvSave(this)">Save answers and work it out</button>
      <p class="nl-sv-small">Answers are saved. Next time I only ask what is new.</p></div>`;
  }
  function answerHtml(c){
    const Mo = v => NLP.money(Math.abs(v)), sg = v => (v < 0 ? '−' : '+'), b = (t, k) => `<span class="nl-svb ${k}">${H(t)}</span>`;
    const yrs = m => m < 24 ? `${m} months` : (() => { const y = Math.round(m / 6) / 2; return `${Math.floor(y)}${y % 1 ? '½' : ''} years`; })();
    const ph = c.phases || [], label = p => p.open ? (p.from === 1 ? 'Each month' : `After ${p.from - 1} years`) : p.from === p.to ? `Year ${p.from}` : `Years ${p.from}–${p.to}`;
    const first = ph[0] || { left:0 };
    let head;
    if(ph.length > 1) head = `${H(c.surv)} would be ${first.left < 0 ? `about ${Mo(first.left)} short` : `about ${Mo(first.left)} ahead`} each month in the first ${first.to === 1 ? 'year' : first.to + ' years'}, then ${ph[1].left < 0 ? `about ${Mo(ph[1].left)} short` : `about ${Mo(ph[1].left)} ahead`}.`;
    else head = first.left < 0 ? `${H(c.surv)} would be about ${Mo(first.left)} short each month${c.pause ? ', with saving paused' : ''}.` : `${H(c.surv)} would still have about ${Mo(first.left)} left each month${c.pause ? ' with saving paused' : ''}.`;
    head += c.monthsCover != null ? ` Your savings${c.lumps.some(l => l.pays === 'survivor') ? ' and the payouts' : ''} cover that for about ${yrs(c.monthsCover)}.` : ph.some(p => p.left < 0) ? ' Your savings cover the gap for good.' : '';
    const row = (name, sub, badge, amt) => `<tr><td>${name}${sub ? `<span class="sub">${sub}</span>` : ''}</td><td>${badge}</td><td class="r">${amt}</td></tr>`;
    const lasts = c.lastsTo && c.lastsTo < c.lifeExp ? `runs out at about ${c.lastsTo}` : `still lasts past ${c.lifeExp}`;
    const otherEnds = c.ends.filter(e => e.why !== 'their own cost'), ownEnds = c.ends.filter(e => e.why === 'their own cost');
    return `<div class="nl-sv">
      <p class="nl-sv-hl">${head}</p>
      <div class="nl-sv-ph">${ph.slice(0, 3).map(p => `<div><span>${H(label(p))}</span><b class="${p.left < 0 ? 'neg' : 'pos'}">${sg(p.left)}${Mo(p.left)}</b></div>`).join('')}</div>
      <table><tbody>
        ${c.incStops.map(i => row(`${H(i.name)}’s income`, `Money plan line “${H(i.name)}”`, b('Stops', 'r'), '−' + Mo(i.amount))).join('')}
        ${row(`${H(c.surv)}’s income`, H(c.survSource || ''), b('Continues', 'g'), Mo(c.survIncome))}
        ${c.incOther.map(i => row(H(i.name), 'Money plan', b('Continues', 'g'), Mo(i.amount))).join('')}
        ${c.payments.map(p => row(H(p.name) + (p.years ? `, ${p.years} years` : ', for life'), `${H(p.source)} · ${p.before_tax === false ? 'after tax' : p.before_tax === true ? 'before tax' : 'tax not stated, counted as before tax'}`, b('Pays', 'g'), Mo(p.monthly))).join('')}
        ${ownEnds.length ? row(H(ownEnds.map(x => x.name).join(', ')), `${H(c.who)}’s own costs`, b('End', 'q'), '−' + Mo(ownEnds.reduce((t, x) => t + x.amount, 0))) : ''}
        ${otherEnds.map(e => row(H(e.name), H(e.why[0].toUpperCase() + e.why.slice(1)), b('Ends', 'q'), '−' + Mo(e.amount))).join('')}
        ${row(H(c.contNames.length ? c.contNames.join(', ') + ' and other costs' : 'Other costs'), '', b('Continue', 'g'), Mo(c.contSum))}
        ${row('Monthly saving', '', c.pause ? b('Paused', 'q') : b('Continues', 'g'), c.pause ? Mo(0) : Mo(c.sav))}
      </tbody></table>
      ${c.lumps.length ? `<p><b>Paid once:</b> ${c.lumps.map(l => `${H(l.name)}, about ${Mo(l.amount)}, ${l.pays === 'mortgage' ? 'pays off the mortgage' : l.pays === 'debt' ? `pays off ${H(l.debt_line || 'a debt')}` : `to ${H(c.surv)}, added to savings`} (${H(l.source)})`).join('; ')}.</p>` : ''}
      ${c.notCounted.length ? `<p><b>Not counted, and why:</b> ${c.notCounted.map(n => `${H(n.what)}: ${H(n.why)} (${H(n.source)})`).join('; ')}.</p>` : ''}
      <p><b>Retirement for ${H(c.surv)} alone:</b> with ${c.pensStop ? `${H(c.who)}’s pension${c.pensStop > 1 ? 's' : ''} stopped` : 'the pensions you have'} and spending at ${Math.round(c.share * 100)}% of what you planned together, the money ${lasts}.</p>
      ${c.contacts.length ? `<p class="nl-sv-sec">Who to contact, and what to ask</p>${c.contacts.map(x => `<div class="nl-sv-call">${H(x.institution)} ${b('Ask', 'a')}<br><span class="q">“${H(x.question.replace(/^["“]|["”]$/g, ''))}”</span></div>`).join('')}` : ''}
      <p class="nl-sv-small">I read ${c.files && c.files.files_checked ? `all ${c.files.files_checked} Notebook file${c.files.files_checked > 1 ? 's' : ''}` : 'your Notebook (it has no files yet)'}. A planning picture from your numbers, not legal advice. No ID, account or policy numbers are shown.</p>
    </div>`;
  }
  window.nlCardHtml = function(c){
    if(!c) return '';
    if(c.type === 'survivorQ') return questionsHtml(c);
    if(c.type === 'survivor2') return answerHtml(c);
    return '';
  };

  // The assistant may PREPARE a pension; the person adds it with one press.
  NLP.addTool({
    def:{ name:'prepare_pension',
      description:'Prepare a pension for the person to add to their retirement plan. Nothing is saved: it shows on the Future page (Runway and Accounts) marked Suggested, with an Add button. Use it when they tell you about a pension, or when a pension statement in their files states one. Amounts are SEK a month before tax.',
      input_schema:{ type:'object', properties:{
        name:{ type:'string', description:'Short name, e.g. "Allmän pension" or the provider.' },
        monthly_payout:{ type:'number', description:'SEK a month before tax.' },
        start_age:{ type:'integer', description:'Age it starts paying.' },
        end_age:{ type:'integer', description:'Only if it stops paying at an age; leave out for a lifelong pension.' },
        quote:{ type:'string', description:'The source’s own words the numbers came from, if any.' },
        source:{ type:'string', description:'Where the quote is from, e.g. the file name and page.' }
      }, required:['name','monthly_payout','start_age'], additionalProperties:false } },
    label:() => 'Preparing the pension',
    run(input){
      const pay = Math.round(Number(input.monthly_payout)), age = Math.round(Number(input.start_age));
      if(!(pay > 0)) return { error:'monthly_payout must be more than 0 (SEK a month before tax)' };
      if(!(age >= 40 && age <= 100)) return { error:'start_age must be between 40 and 100' };
      const end = input.end_age ? Math.round(Number(input.end_age)) : null;
      if(end != null && !(end > age)) return { error:'end_age must be after start_age' };
      U().penSug = { name:String(input.name || 'Pension').slice(0, 60), monthlyPayout:pay, startAge:age, endAge:end,
        quote:String(input.quote || '').slice(0, 240), source:String(input.source || '').slice(0, 120) };
      setTimeout(() => { if(NLP.isOn() && state.activePanel === P) NLP.renderPage(P); else NLP.refreshPanel(); }, 0);
      return { ok:true, note:'Shown on the Future page (Runway and Accounts) marked Suggested, with an "Add this pension to my plan" button. Nothing is saved until they press it. Do not say it is saved or added.' };
    }
  });
  NLP.addSystem(`
- Pensions: you CAN prepare a pension with prepare_pension (name, SEK a month before tax, start age). It is shown on the Future page marked Suggested and the person presses Add. If you do not know the amount or the start age, ask, or look in their files and quote the words.`);

  // ── Shared reads ────────────────────────────────────────────────────────
  function runwayRows(n){
    const rx = state.retirementExpenses || [];
    const mult = n.mult || 1, taxPct = Math.round((n.taxRate || 0) * 100);
    const drawPct = n.nestEgg > 0 ? n.grossNeeded * 12 / n.nestEgg * 100 : null;
    const pens = pensions();
    return { rx, mult, taxPct, drawPct, pens };
  }
  function brickWhy(b){
    const ra = state.retirementAge;
    const trips = b.events.filter(e => e.type === 'trip'), pens = b.events.filter(e => e.type === 'pension');
    const isRet = (b.years || []).some(y => y.age === ra - 1 || y.age === ra);
    let key = 'ok';
    if(b.anyShortfall) key = 'short';
    else if(b.anyDepleted) key = b.verdict === 'amber' ? 'penfund' : 'depleted';
    else if(isRet) key = 'ret';
    else if(pens.length) key = 'pension';
    else if(b.verdict === 'amber') key = 'spend';
    return { key, trips, pens, isRet };
  }
  const yrLabel = b => b.startYear === b.endYear ? String(b.startYear) : `${b.startYear}–${String(b.endYear).slice(2)}`;
  const ageLabel = b => b.startAge === b.endAge ? `Age ${b.startAge}` : `Age ${b.startAge}–${b.endAge}`;
  const gran = () => U().gran || 2;

  // ── Drawing ─────────────────────────────────────────────────────────────
  function render(host){
    ensurePlan();
    const tab = NLP.tabOf(P, 'runway');
    const inv = investments(), pens = pensions();
    const bricks = getLifeWallData(gran());
    const sc = state.retirementScenario || 'baseline';
    let actions = '';
    if(tab === 'runway') actions = `<div class="nl-seg" role="group" aria-label="Lifestyle">${Object.keys(SC).map(k => `<button type="button" aria-pressed="${k === sc}" onclick="NLF.scen('${k}')">${SC[k]}</button>`).join('')}</div>`;
    else if(tab === 'accounts') actions = NLP.pill('+ Account that grows', 'NLF.accAdd()') + NLP.pill('+ Pension that pays', 'NLF.penOpen()');
    else actions = `<div class="nl-seg" role="group" aria-label="Years in a brick">${[1,2,5].map(g => `<button type="button" aria-pressed="${g === gran()}" onclick="NLF.gran(${g})">${g} yr</button>`).join('')}</div>`;
    const head = NLP.head({ title:'Future', panel:P, actions, tabs:[
      { key:'runway', label:'Runway', on:tab === 'runway' },
      { key:'accounts', label:'Accounts', count:inv.length + 1 + pens.length, on:tab === 'accounts', keep:true },
      { key:'wall', label:'Life wall', count:bricks.length, on:tab === 'wall', keep:true },
    ] });
    let body = '';
    if(tab === 'accounts') body = accountsHtml();
    else if(tab === 'wall') body = wallHtml(bricks);
    else body = planBar() + runwayHtml();
    host.innerHTML = `<div class="nl-wrap nlf">${head}${body}</div>`;
    const tb = host.querySelector('#nlf-tbl'), wall = host.querySelector('#nlf-wall');
    if(tab === 'runway' && tb) NLP.rows(tb, P, id => { const st = U(); if(id === 'spend'){ st.open = st.open === 'spend' ? null : 'spend'; NLP.renderPage(P); } else if(id === 'pension'){ NLP.tab(P, 'accounts'); NLP.ui(P).chosen = pens.length ? pens[0].id : 'pen-none'; NLP.renderPage(P); } });
    if(tab === 'accounts' && tb) NLP.rows(tb, P, id => {
      const st = U();
      if(id === 'sav'){ st.open = st.open === 'sav' ? null : 'sav'; NLP.renderPage(P); if(st.open) setTimeout(() => document.getElementById('nlf-sv-g')?.focus(), 60); return; }
      if(id === 'pen-sug') return;
      if(id === 'pen-none'){ st.penForm = !st.penForm; st.open = st.penForm ? id : null; NLP.renderPage(P); return; }
      st.open = st.open === id ? null : id; NLP.renderPage(P);
    });
    if(tab === 'wall' && wall) NLP.rows(wall, P, id => openBrick(id));
  }

  function planBar(){
    const d = planDiffs(); if(!d.length) return '';
    const txt = d.join(', ');
    return `<div class="nlf-planbar" role="status"><div><b>You’ve moved away from your plan</b><span>Now: ${H(txt.charAt(0).toUpperCase() + txt.slice(1))}.</span></div><div class="nl-inrow"><button type="button" class="nl-black nlf-pb" onclick="NLF.planBack()">Back to my plan</button>${NLP.link('Make this my plan', 'NLF.planKeep()')}</div></div>`;
  }

  // ── Runway ──────────────────────────────────────────────────────────────
  function runwayHtml(){
    const n = FE.retirement.numbers(), s = n._simResult, st = U();
    const ra = state.retirementAge, le = state.lifeExp || 90;
    const { rx, mult, taxPct, drawPct, pens } = runwayRows(n);
    const defs = wifDefs(), on = activeWifs();
    st.wif = on.map(d => d.key);
    const wif = on.length ? whatIf(stt => on.forEach(d => d.mut(stt))) : null;
    const sug = st.penSug;
    const sugRes = sug ? whatIf(stt => { stt.externalAssets = (stt.externalAssets || []).concat([{ id:'nlf-sug', name:sug.name, monthlyPayout:sug.monthlyPayout, startAge:sug.startAge, endAge:sug.endAge, assetType:'pension' }]); }) : null;
    st.wifRes = wif ? { runoutAge:wif.n.runoutAge, lifeExp:wif.lifeExp } : null;
    const last = s.balData.length ? s.balData[s.balData.length - 1] : 0;
    let title;
    if(!rx.length || !n.totalExp) title = 'Add what you’ll spend in retirement to see how long your money lasts.';
    else if(!n.runoutAge) title = `On ${scName()} your money never runs out: ${MS(atAge(last, le))} left at ${le}.`;
    else if(n.runoutAge >= le) title = `On ${scName()} your money lasts to ${le}, with nothing to spare.`;
    else title = `On ${scName()} your money runs out at ${n.runoutAge}, ${le - n.runoutAge} year${le - n.runoutAge === 1 ? '' : 's'} before ${le}.`;
    if(sug && !pens.length) title = n.runoutAge && n.runoutAge < le ? title + ' Your pension would change that.' : `Your money lasts past ${le} already. Your pension would mean taking out less each year.`;
    let wifLine = '';
    if(wif){
      const w = wif.n, wl = wif.sim.balData.length ? wif.sim.balData[wif.sim.balData.length - 1] : 0;
      const what = on.map(d => d.label.toLowerCase()).join(' + ');
      const res = !w.runoutAge ? `money never runs out, ${MS(atAge(wl, wif.lifeExp))} left at ${wif.lifeExp}` : (w.runoutAge >= wif.lifeExp ? `money lasts to ${wif.lifeExp}, with nothing to spare` : `money runs out at ${w.runoutAge}`);
      wifLine = `<p class="nlf-wifres"><i class="dash"></i>With ${H(what)}: ${H(res)}. Prepared, not saved. ${NLP.link('Use this in my plan', 'NLF.wifKeep()')} ${NLP.link('Take it off', 'NLF.wifClear()')}</p>`;
    }
    const chips = `<div class="nl-chips nlf-wif"><span class="nlf-wl">What if:</span>${defs.map(d => `<button type="button" class="nl-chip${st.wif.includes(d.key) ? ' on' : ''}" aria-pressed="${st.wif.includes(d.key)}" onclick="NLF.wif('${d.key}')">${st.wif.includes(d.key) ? '✓ ' : '+ '}${H(d.label)}</button>`).join('')}</div>`;
    const hasPenBars = s.pensionData.some(v => v > 0);
    const legend = NLP.legend([{ label:'Money left', color:'var(--nl-accent)' }, { label:'Taken out each year', color:'var(--nlf-amber)' }].concat(hasPenBars ? [{ label:'From pensions', color:'var(--nlf-steel)' }] : []).concat(wif ? [{ label:'What-if', dash:true }] : []).concat(sug && !wif ? [{ label:'With the pension', dash:true }] : []));
    const chartBox = (rx.length && n.totalExp) ? NLP.chartBox((w, h) => runwayChart(w, h, n, wif, sugRes), 250, 'Money in retirement, by age') : NLP.empty('No retirement spending yet.', NLP.link('Add your first spending line', "NLF.rxOpen()"));
    const card = NLP.card(null, null, `<h2 class="nl-ct">${H(title)}</h2><p class="nl-cs">Everything you own from retirement at ${ra}, ${lens()}. Amber bars: what you take out each year.</p>${chartBox}${(rx.length && n.totalExp) ? legend : ''}${chips}${wifLine}`);

    // The sum, step by step (each month, at retirement).
    const sv = v => atAge(v, ra);
    const lines = rx.map(e => `${H(e.name)} ${H(MS(e.amount * mult))}`).join(' · ');
    const open = st.open === 'spend';
    const editor = open ? rxEditor(rx, mult) : '';
    const penNow = n.pensionAvgMonthly || 0;
    const sugRow = sug ? sugRes.n : null;
    const drawBadge = drawPct == null ? '' : drawPct <= 4 ? NLP.badge('Under 4%', 'green') : drawPct <= 5 ? NLP.badge('Above 4%', 'amber') : NLP.badge('Well above 4%', 'ruby');
    const rows = [
      `<tr data-nl-row="spend"><td class="mk">1</td><td><span class="nm">What you’ll spend, after tax</span><span class="sub">${lines || 'No lines yet'}${mult !== 1 ? ` · ${scName()} is Baseline ×${String(mult).replace('.', '.')}` : ''}</span>${open ? '' : `<span class="nl-inrow">${NLP.link(rx.length ? `Change ${rx.length} line${rx.length > 1 ? 's' : ''}` : 'Add spending lines', 'NLF.rxOpen()')}</span>`}${editor}</td><td></td><td class="r">${M(sv(n.totalExp))}</td></tr>`,
      `<tr data-nl-row="gross"><td class="mk">2</td><td><span class="nm">Before tax</span><span class="sub">${H(MS(sv(n.totalExp)))} ÷ ${(1 - (n.taxRate || 0)).toFixed(2)}, about ${taxPct}% tax on what you take out</span></td><td></td><td class="r">${M(sv(n.totalGross))}</td></tr>`,
      sug
        ? `<tr data-nl-row="pension" class="sug"><td class="mk">3</td><td><span class="nm">From pensions</span><span class="sub">${sug.quote ? `${NLP.quote(sug.quote)}${sug.source ? ' · ' + H(sug.source) : ''}` : `${H(sug.name)}, from age ${sug.startAge}`}</span><span class="nl-inrow">${NLP.link('Add this pension', 'NLF.penSugAdd()')}${NLP.link('Drop', 'NLF.penSugDrop()')}</span></td><td>${NLP.badge('Suggested', 'amber')}</td><td class="r"><span class="nl-was">${M(sv(penNow))}</span>${M(sv(sugRow.pensionAvgMonthly))}</td></tr>`
        : `<tr data-nl-row="pension"><td class="mk">3</td><td><span class="nm">From pensions</span><span class="sub">${pens.length ? `${pens.length} pension${pens.length > 1 ? 's' : ''}, averaged over your retirement` : 'None added yet'}</span>${pens.length ? '' : `<span class="nl-inrow">${NLP.link('Tell Horizon about your pension', 'NLF.askPension()')}</span>`}</td><td>${pens.length ? '' : NLP.badge('Missing', 'amber')}</td><td class="r">${M(sv(penNow))}</td></tr>`,
      sug
        ? `<tr data-nl-row="draw" class="sug"><td class="mk">4</td><td><span class="nm">Taken from your savings</span><span class="sub">Less needed once the pension pays</span></td><td>${NLP.badge('Suggested', 'amber')}</td><td class="r"><span class="nl-was">${M(sv(n.grossNeeded))}</span>${M(sv(sugRow.grossNeeded))}</td></tr>`
        : `<tr data-nl-row="draw"><td class="mk">4</td><td><span class="nm">Taken from your savings</span><span class="sub">${drawPct == null ? 'No savings counted yet' : `${pct(drawPct)} of ${H(MS(sv(n.nestEgg)))} a year, ${drawPct <= 4 ? 'under' : 'over'} the 4% rule of thumb`}</span></td><td>${drawBadge}</td><td class="r">${M(sv(n.grossNeeded))}</td></tr>`,
    ];
    const table = `<div class="nl-tbl-wrap"><table class="nl-tbl" id="nlf-tbl"><thead><tr><th></th><th>The sum, step by step</th><th></th><th class="r">Each month</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    return card + table;
  }
  function rxEditor(rx, mult){
    const r = rx.map((e, i) => `<div class="nlf-rx"><input type="text" id="nlf-rx-n-${i}" value="${H(e.name)}" aria-label="Line name" onchange="NLF.rxSet(${i},'name',this.value)"><input type="text" inputmode="decimal" class="nl-num-in" id="nlf-rx-a-${i}" value="${toDisp(e.amount)}" aria-label="${H(e.name)}, ${H(sym())} a month" onchange="NLF.rxSet(${i},'amount',this.value)"><span class="nlf-u">${H(sym())} a month</span>${NLP.link('Remove', `NLF.rxDel(${i})`)}</div>`).join('');
    return `<div class="nlf-ed"><p class="nlf-edh">Baseline amounts, after tax, in today’s money.${mult !== 1 ? ` ${scName()} uses them ×${mult}.` : ''}</p>${r}<div class="nl-inrow">${NLP.link('+ Add a line', 'NLF.rxAdd()')}${NLP.link('Done', 'NLF.rxClose()')}</div></div>`;
  }
  NLF.rxOpen = () => { const st = U(); NLP.tab(P, 'runway'); st.chosen = 'spend'; st.open = 'spend'; NLP.renderPage(P); };
  NLF.rxClose = () => { U().open = null; NLP.renderPage(P); };
  NLF.rxSet = (i, f, v) => {
    const e = (state.retirementExpenses || [])[i]; if(!e) return;
    if(f === 'name'){ const nv = String(v || '').trim(); if(!nv || nv === e.name) return; const old = e.name; change(`${old} renamed to ${nv}`, ['retirementExpenses'], s => { s.retirementExpenses[i].name = nv; }); return; }
    const amt = Math.max(0, Math.round(fromDisp(v)));
    if(amt === Math.round(e.amount)) return;
    change(`${e.name}: ${M(e.amount)} → ${M(amt)} a month`, ['retirementExpenses'], s => { s.retirementExpenses[i].amount = amt; });
  };
  NLF.rxDel = i => { const e = (state.retirementExpenses || [])[i]; if(!e) return; document.querySelectorAll('#panel-' + P + ' .nlf-rx input[id]').forEach(x => x.removeAttribute('id')); change(`${e.name} removed`, ['retirementExpenses'], s => { s.retirementExpenses.splice(i, 1); }); };
  NLF.rxAdd = () => {
    change('New spending line added', ['retirementExpenses'], s => { if(!Array.isArray(s.retirementExpenses)) s.retirementExpenses = []; s.retirementExpenses.push({ id:genId(), name:'New line', amount:0, type:'variable', icon:'💸' }); });
    const st = U(); st.chosen = 'spend'; st.open = 'spend';
    setTimeout(() => { const i = (state.retirementExpenses || []).length - 1; const el = document.getElementById('nlf-rx-n-' + i); if(el){ el.focus(); el.select(); } }, 120);
  };

  function runwayChart(w, h, n, wif, sugRes){
    const s = n._simResult, ages = s.labels;
    if(!ages.length) return '';
    const sc = (v, a) => atAge(v, a);
    const bal = ages.map((a, i) => [a, sc(s.balData[i], a)]);
    const wd = ages.map((a, i) => [a, sc(s.portWithdrawal[i], a)]);
    const pen = ages.map((a, i) => [a, sc(s.pensionData[i], a)]);
    const wb = wif ? wif.sim.labels.map((a, i) => [a, sc(wif.sim.balData[i], a)]) : null;
    const sb = sugRes ? sugRes.sim.labels.map((a, i) => [a, sc(sugRes.sim.balData[i], a)]) : null;
    const x0 = Math.min(ages[0], wb ? wb[0][0] : Infinity), x1 = Math.max(ages[ages.length - 1], wb ? wb[wb.length - 1][0] : -Infinity);
    const ymax = Math.max(1, ...bal.map(q => q[1]), ...(wb || []).map(q => q[1]), ...(sb || []).map(q => q[1]), ...wd.map((q, i) => q[1] + pen[i][1]));
    const tk = NLP.ticks(0, ymax * 1.08, 4, v => v ? MS(v) : '0');
    const span = x1 - x0, step = span > 30 ? 5 : span > 14 ? (w < 520 ? 4 : 2) : (w < 420 ? 2 : 1);
    const xt = []; for(let a = x0; a <= x1; a++) if((a - x0) % step === 0 || a === x1) xt.push([a, String(a)]);
    if(xt.length > 1 && xt[xt.length - 1][0] - xt[xt.length - 2][0] < step / 2) xt.splice(xt.length - 2, 1);
    return NLP.chart({ w, h, x:[x0 - 0.6, x1 + 0.6], y:[tk.min, tk.max], yt:tk.ticks, xt, pad:{ l:58, r:14, t:16, b:24 }, label:'Money in retirement, by age',
      hover:{ n:ages.length, x:i => ages[i], title:i => `Age ${ages[i]}`,
        rows:i => [{ name:'Money left', value:M(bal[i][1]), color:'var(--nl-accent)' }, { name:'Taken out this year', value:M(wd[i][1]), color:'var(--nlf-amber)' }].concat(pen[i][1] > 0 ? [{ name:'From pensions this year', value:M(pen[i][1]), color:'var(--nlf-steel)' }] : []).concat(wb && wb[i] ? [{ name:'What if (not saved)', value:M(wb[i][1]), color:'var(--nlf-steel)' }] : []).concat(sb && sb[i] ? [{ name:'With the suggested pension', value:M(sb[i][1]), color:'var(--nlf-steel)' }] : []),
        y:i => [{ v:bal[i][1], color:'var(--nl-accent)' }].concat(wb && wb[i] ? [{ v:wb[i][1], color:'var(--nlf-steel)' }] : []) },
      draw:({ sx, sy, line, area }) => {
        const bw = Math.max(2, Math.min(12, (sx(1) - sx(0)) * 0.55));
        let g = `<path d="${area(bal, 0)}" fill="var(--nl-accent)" opacity=".13"/>`;
        g += wd.map((q, i) => { const p = pen[i][1], x = sx(q[0]) - bw / 2; let r = '';
          if(q[1] > 0) r += `<rect x="${x.toFixed(1)}" y="${sy(q[1]).toFixed(1)}" width="${bw.toFixed(1)}" height="${(sy(0) - sy(q[1])).toFixed(1)}" fill="var(--nlf-amber)" opacity=".6"/>`;
          if(p > 0) r += `<rect x="${x.toFixed(1)}" y="${sy(q[1] + p).toFixed(1)}" width="${bw.toFixed(1)}" height="${(sy(q[1]) - sy(q[1] + p)).toFixed(1)}" fill="var(--nlf-steel)" opacity=".55"/>`;
          return r; }).join('');
        g += `<path d="${line(bal)}" fill="none" stroke="var(--nl-accent)" stroke-width="2.5"/>`;
        if(sb) g += `<path d="${line(sb)}" fill="none" stroke="var(--nlf-steel)" stroke-width="2" stroke-dasharray="5 4"/>`;
        if(wb) g += `<path d="${line(wb)}" fill="none" stroke="var(--nlf-steel)" stroke-width="2" stroke-dasharray="5 4"/>`;
        // Labels: start, end (or run-out), and the yearly draw.
        const first = bal[0], lastP = bal[bal.length - 1];
        g += `<circle cx="${sx(first[0]).toFixed(1)}" cy="${sy(first[1]).toFixed(1)}" r="4" fill="var(--nl-accent)"/>`;
        g += `<text class="lab" x="${(sx(first[0]) + 8).toFixed(1)}" y="${Math.max(14, sy(first[1]) - 9).toFixed(1)}">${H(MS(first[1]))} at ${first[0]}</text>`;
        if(n.runoutAge){
          const xr = sx(n.runoutAge);
          g += `<line x1="${xr.toFixed(1)}" x2="${xr.toFixed(1)}" y1="${sy(tk.max).toFixed(1)}" y2="${sy(0).toFixed(1)}" stroke="var(--nlf-ruby)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
          g += `<text class="lab" x="${(xr + (xr > w * 0.7 ? -6 : 6)).toFixed(1)}" y="${(sy(tk.max) + 12).toFixed(1)}" text-anchor="${xr > w * 0.7 ? 'end' : 'start'}" style="fill:var(--nlf-ruby)">Runs out at ${n.runoutAge}</text>`;
        } else if(w > 360){
          g += `<text class="lab" x="${sx(lastP[0]).toFixed(1)}" y="${Math.max(28, sy(lastP[1]) - 10).toFixed(1)}" text-anchor="end">${H(MS(lastP[1]))} at ${lastP[0]}, never runs out</text>`;
        }
        const avgW = wd.filter(q => q[1] > 0);
        if(avgW.length && w > 420){
          const top = Math.max(...wd.map((q, i) => q[1] + pen[i][1]));
          const yy = sy(top) - 7;
          if(sy(0) - yy < (sy(0) - sy(tk.max)) * 0.6) g += `<text class="lab" x="${(sx(ages[0]) + 14).toFixed(1)}" y="${yy.toFixed(1)}" style="fill:var(--nlf-amber)">Taken out each year: about ${H(MS(avgW[0][1]))} before tax</text>`;
        }
        return g;
      } });
  }

  // ── Accounts ────────────────────────────────────────────────────────────

  // ── Net worth over time ────────────────────────────────────────────────
  // state.home = { value, mortgage } in SEK (what the home is worth, what is
  // still owed). state.nwHistory = [{ m:'YYYY-MM', total, savings, invest,
  // home, mortgage, parts:{ id: balance } }]: the current month's entry
  // follows the latest values; once the month is over it stays as it was.
  // Months added by hand carry manual:true and only a total.
  const homeOf = () => { const h = state.home && typeof state.home === 'object' ? state.home : {}; return { value:Math.max(0, Number(h.value) || 0), mortgage:Math.max(0, Number(h.mortgage) || 0) }; };
  const ymOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const monthWords = m => { const [y, mo] = String(m).split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month:'short', year:'numeric' }); };
  function nwNow(){
    const parts = {}, inv = investments();
    const savings = Math.max(0, Number(FE.projection.savingsYearToDate()) || 0);
    parts.sav = savings;
    inv.forEach(a => { parts[a.id] = Math.max(0, Number(a.balance) || 0); });
    const invest = inv.reduce((t, a) => t + parts[a.id], 0), h = homeOf();
    if(h.value) parts.home = h.value; if(h.mortgage) parts.mortgage = -h.mortgage;
    return { total:Math.round(savings + invest + h.value - h.mortgage), savings:Math.round(savings), invest:Math.round(invest), home:Math.round(h.value), mortgage:Math.round(h.mortgage), parts };
  }
  function nwHist(){ return (Array.isArray(state.nwHistory) ? state.nwHistory : []).filter(e => e && /^\d{4}-\d{2}$/.test(e.m) && Number.isFinite(+e.total)).sort((a, b) => a.m.localeCompare(b.m)); }
  // Write this month's entry (only if something changed, so a save is not needed every time).
  function nwSnapshot(){
    if(typeof FE === 'undefined' || !FE.projection) return;
    const m = ymOf(new Date()), now = nwNow();
    if(!Array.isArray(state.nwHistory)) state.nwHistory = [];
    const i = state.nwHistory.findIndex(e => e && e.m === m && !e.manual);
    const entry = Object.assign({ m }, now);
    if(i >= 0){ if(JSON.stringify(state.nwHistory[i]) === JSON.stringify(entry)) return; state.nwHistory[i] = entry; }
    else { state.nwHistory = state.nwHistory.filter(e => !(e && e.m === m)); state.nwHistory.push(entry); }
    state.nwHistory.sort((a, b) => a.m.localeCompare(b.m));
    save();
  }
  setTimeout(() => { try { nwSnapshot(); } catch(_){} }, 3000);
  // The entry to compare with: the earliest one in the last 12 months, before this month.
  function nwBase(){
    const h = nwHist(), cut = ymOf(new Date(new Date().getFullYear(), new Date().getMonth() - 12, 1)), cur = ymOf(new Date());
    return h.find(e => e.m >= cut && e.m < cur) || null;
  }
  function nwChart(w, h, hist){
    const pts = hist.map((e, i) => [i, +e.total]);
    const lo = Math.min(0, ...pts.map(p => p[1])), hi = Math.max(1, ...pts.map(p => p[1]));
    const tk = NLP.ticks(lo >= 0 ? Math.max(0, lo - (hi - lo) * 0.15) : lo, hi * 1.06, 3, v => v ? MS(v) : '0');
    const n = pts.length, step = n > 18 ? 6 : n > 8 ? 3 : 1;
    // Month names only; the first label also says the year. The right margin holds the latest value.
    const xt = hist.map((e, i) => (i % step === 0 && n - 1 - i >= Math.max(1, step / 2)) || i === n - 1 ? [i, i === 0 ? monthWords(e.m) : monthWords(e.m).replace(/ \d{4}$/, '')] : null).filter(Boolean);
    return NLP.chart({ w, h, x:[0, Math.max(1, n - 1)], y:[tk.min, tk.max], yt:tk.ticks, xt, pad:{ l:58, r:64, t:12, b:24 }, label:'Net worth, month by month',
      hover:{ n, x:i => i, title:i => monthWords(hist[i].m) + (hist[i].manual ? ' (added by hand)' : ''), rows:i => [{ name:'Net worth', value:M(hist[i].total), color:'var(--nl-accent)' }], y:i => [{ v:hist[i].total, color:'var(--nl-accent)' }] },
      draw:k => (n > 1 ? `<path d="${k.area(pts, tk.min)}" fill="var(--nl-accent)" fill-opacity=".10"/><path d="${k.line(pts)}" fill="none" stroke="var(--nl-accent)" stroke-width="2.2"/>` : '')
        + pts.map((p, i) => `<circle cx="${k.sx(p[0]).toFixed(1)}" cy="${k.sy(p[1]).toFixed(1)}" r="3.2" fill="#fff" stroke="var(--nl-accent)" stroke-width="2"${hist[i].manual ? ' stroke-dasharray="2 2"' : ''}/>`).join('')
        + `<text class="lab" x="${(k.sx(pts[n - 1][0]) + 8).toFixed(1)}" y="${(k.sy(pts[n - 1][1]) + 4).toFixed(1)}">${H(MS(pts[n - 1][1]))}</text>` });
  }
  function nwCard(){
    const hist = nwHist(), st = U();
    const first = hist[0], last = hist[hist.length - 1];
    let title = 'Where you’ve been: the line starts this month.';
    if(hist.length > 1){ const d = last.total - first.total; title = `Where you’ve been: ${d >= 0 ? 'up' : 'down'} ${MS(Math.abs(d))} since ${monthWords(first.m)}.`; }
    const h = homeOf();
    const what = h.value || h.mortgage ? 'Savings, investments and your home, minus the mortgage' : 'Savings and investments (add your home and mortgage below)';
    const form = st.nwAdd ? `<div class="nlf-ed nlf-acc nlf-nwadd">
        <label>Month<input type="month" id="nlf-nw-m" max="${ymOf(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1))}"></label>
        <label>Net worth then<input type="text" inputmode="decimal" class="nl-num-in" id="nlf-nw-v"><span class="nlf-u">${H(sym())}</span></label>
        <div class="nl-inrow">${NLP.pill('Add this month', 'NLF.nwAdd()')}${NLP.link('Cancel', 'NLF.nwForm()')}</div></div>` : '';
    return NLP.card(null, null, `<h2 class="nl-ct">${H(title)}</h2><p class="nl-cs">${H(what)}, kept each month. ${hist.length ? `${hist.length} month${hist.length > 1 ? 's' : ''} so far.` : ''}</p>${hist.length ? NLP.chartBox((w, hh) => nwChart(w, hh, hist), 240, 'Net worth, month by month') : NLP.empty('The first month is kept a few seconds after Horizon opens.')}<div class="nl-inrow nlf-nw-links">${st.nwAdd ? '' : NLP.link('Add an earlier month', 'NLF.nwForm()')}</div>${form}`);
  }

  function accountsHtml(){
    const st = U(), inv = investments(), pens = pensions(), proj = getProjection();
    const base = nwBase(), nowNw = nwNow();
    const chg = id => { if(!base) return ''; const was = base.parts && base.parts[id]; if(was == null) return '<td class="r nlf-chg">—</td>'; const d = (nowNw.parts[id] || 0) - was; return `<td class="r nlf-chg ${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '+' : '−'}${M(Math.abs(d))}<span class="sub">since ${H(monthWords(base.m))}</span></td>`; };
    const ra = state.retirementAge, last = proj[proj.length - 1] || null, ytr = proj.length ? proj.length - 1 : 0;
    const colours = ['var(--nlf-c1)','var(--nlf-c2)','var(--nlf-c3)','var(--nlf-c4)','var(--nlf-c5)','var(--nlf-c6)','var(--nlf-c7)'];
    const series = [{ id:'sav', name:'Savings', col:colours[1], vals:proj.map((p, y) => fromNom(p.appSavings, y)) }]
      .concat(inv.map((a, i) => ({ id:a.id, name:a.name, col:colours[i === 0 ? 0 : (i + 1) % colours.length], vals:proj.map((p, y) => fromNom((p.perAccount || {})[a.id] || 0, y)) })));
    const atRet = id => { const s = series.find(x => x.id === id); return s && s.vals.length ? s.vals[s.vals.length - 1] : 0; };
    const ranked = series.slice().sort((a, b) => atRet(b.id) - atRet(a.id)).filter(s => atRet(s.id) > 0);
    let title = 'Add an account to see how your money grows to retirement.';
    if(ranked.length >= 2) title = `Your ${ranked[0].name === 'Savings' ? 'savings' : ranked[0].name} and ${ranked[1].name === 'Savings' ? 'savings' : ranked[1].name} grow into the two biggest pots by ${ra}.`;
    else if(ranked.length === 1) title = `${ranked[0].name === 'Savings' ? 'Your savings are' : ranked[0].name + ' is'} your one pot, growing to ${MS(atRet(ranked[0].id))} by ${ra}.`;
    const chart = proj.length > 1 ? NLP.chartBox((w, h) => accChart(w, h, proj, series), 240, 'Accounts growing to retirement') : '';
    const card = NLP.card(null, null, `<h2 class="nl-ct">${H(title)}</h2><p class="nl-cs">Each account from today to ${ra}, stacked. ${lens().charAt(0).toUpperCase() + lens().slice(1)}, estimate.</p>${chart || NLP.empty('You are at your retirement age already, so nothing grows here.')}`);
    const sw = c => `<i class="nlf-sw" style="background:${c}"></i>`;
    const kindOf = a => a.accountType === 'isk' ? 'ISK' : a.accountType === 'notax' ? 'No tax' : 'Investment';
    const savMonthly = (FE.months && FE.months.current && FE.months.current() && FE.months.current().savings) || state.baseSavings || 0;
    const rows = [];
    series.forEach((s, i) => {
      if(s.id === 'sav'){
        const edS = st.open === 'sav' ? `<div class="nlf-ed nlf-acc">
        <label>Growth<input type="text" inputmode="decimal" class="nl-num-in nlf-short" id="nlf-sv-g" value="${state.growthRate ?? 0}" onchange="NLF.savGrowth(this.value)"><span class="nlf-u">% a year</span></label>
        <p class="nlf-sv-note">What you save each month comes from your Money plan.</p>
        <div class="nl-inrow">${NLP.link('Done', 'NLF.accClose()')}</div></div>` : '';
        rows.push(`<tr data-nl-row="sav"><td class="mk">${sw(s.col)}</td><td><span class="nm">Savings from Money plan</span><span class="sub">Read from your Money plan savings target</span>${edS}</td><td class="k">Savings</td><td class="r">${M(FE.projection.savingsYearToDate())}</td><td class="r">${M(savMonthly)}</td><td class="r">${pct(state.growthRate || 0)}</td>${chg('sav')}<td class="r">${M(atRet('sav'))}</td></tr>`);
        return;
      }
      const a = inv.find(x => x.id === s.id); if(!a) return;
      const open = st.open === a.id;
      const ed = open ? `<div class="nlf-ed nlf-acc">
        <label class="nlf-wide">Name<input type="text" id="nlf-ac-n-${H(a.id)}" value="${H(a.name)}" onchange="NLF.accSet('${H(a.id)}','name',this.value)"></label>
        <label>Balance now<input type="text" inputmode="decimal" class="nl-num-in" id="nlf-ac-b-${H(a.id)}" value="${toDisp(a.balance)}" onchange="NLF.accSet('${H(a.id)}','balance',this.value)"><span class="nlf-u">${H(sym())}</span></label>
        <label>Added a month<input type="text" inputmode="decimal" class="nl-num-in" id="nlf-ac-c-${H(a.id)}" value="${toDisp(a.monthlyContribution)}" onchange="NLF.accSet('${H(a.id)}','monthlyContribution',this.value)"><span class="nlf-u">${H(sym())}</span></label>
        <label>Growth<input type="text" inputmode="decimal" class="nl-num-in nlf-short" id="nlf-ac-g-${H(a.id)}" value="${a.growthRate ?? state.growthRate}" onchange="NLF.accSet('${H(a.id)}','growthRate',this.value)"><span class="nlf-u">% a year</span></label>
        <div class="nl-inrow">${NLP.link('Remove this account', `NLF.accDel('${H(a.id)}')`)}${NLP.link('Done', 'NLF.accClose()')}</div></div>` : '';
      rows.push(`<tr data-nl-row="${H(a.id)}"><td class="mk">${sw(s.col)}</td><td><span class="nm">${H(a.name)}</span><span class="sub">${a.accountType === 'isk' ? 'Investment, taxed each year as ISK' : `Investment, ${Math.round(a.taxRate ?? 30)}% tax when taken out`}</span>${ed}</td><td class="k">${kindOf(a)}</td><td class="r">${M(a.balance)}</td><td class="r">${M(a.monthlyContribution)}</td><td class="r">${pct(a.growthRate ?? state.growthRate)}</td>${chg(a.id)}<td class="r">${M(atRet(a.id))}</td></tr>`);
    });
    // Home and mortgage: part of net worth, not of the money for retirement.
    const hm = homeOf(), blank = base ? '<td class="r"></td>' : '';
    [['home', 'Home', 'What it is worth today', hm.value, 'Home', 'value'], ['mortgage', 'Mortgage', 'Still owed', hm.mortgage, 'Debt', 'mortgage']].forEach(([id, name, label, v, kind, field]) => {
      const open = st.open === id;
      const ed = open ? `<div class="nlf-ed nlf-acc">
        <label>${label}<input type="text" inputmode="decimal" class="nl-num-in" id="nlf-hm-${id}" value="${v ? toDisp(v) : ''}" onchange="NLF.homeSet('${field}',this.value)"><span class="nlf-u">${H(sym())}</span></label>
        <p class="nlf-sv-note">${id === 'home' ? 'Counts in net worth only, not in the money for retirement.' : 'What is left to pay on the loan, from your bank.'}</p>
        <div class="nl-inrow">${NLP.link('Done', 'NLF.accClose()')}</div></div>` : '';
      const now = v ? (id === 'mortgage' ? '−' : '') + M(v) : '<span class="nlf-na">Not set</span>';
      rows.push(`<tr data-nl-row="${id}"><td class="mk">${sw(id === 'home' ? '#B9A77E' : '#C77B70')}</td><td><span class="nm">${name}</span><span class="sub">${id === 'home' ? 'Net worth only' : 'Taken off net worth'}</span>${v || open ? '' : `<span class="nl-inrow">${NLP.link(id === 'home' ? 'Add what your home is worth' : 'Add what is still owed', `NLF.accOpen('${id}')`)}</span>`}${ed}</td><td class="k">${kind}</td><td class="r">${now}</td><td class="r">—</td><td class="r">—</td>${base ? chg(id).replace('<td class="r nlf-chg', '<td class="r nlf-chg' + (id === 'mortgage' ? ' inv' : '')) || blank : ''}<td class="r">—</td></tr>`);
    });
    pens.forEach(p => {
      const open = st.open === p.id;
      const ed = open ? `<div class="nlf-ed nlf-acc">
        <label class="nlf-wide">Name<input type="text" id="nlf-pe-n-${H(p.id)}" value="${H(p.name)}" onchange="NLF.accSet('${H(p.id)}','name',this.value)"></label>
        <label>Pays a month<input type="text" inputmode="decimal" class="nl-num-in" id="nlf-pe-p-${H(p.id)}" value="${toDisp(p.monthlyPayout)}" onchange="NLF.accSet('${H(p.id)}','monthlyPayout',this.value)"><span class="nlf-u">${H(sym())} before tax</span></label>
        <label>From age<input type="text" inputmode="numeric" class="nl-num-in nlf-short" id="nlf-pe-a-${H(p.id)}" value="${p.startAge ?? ra}" onchange="NLF.accSet('${H(p.id)}','startAge',this.value)"></label>
        <label>Income tax<input type="text" inputmode="decimal" class="nl-num-in nlf-short" id="nlf-pe-t-${H(p.id)}" value="${state.pensionTaxRate ?? 25}" onchange="NLF.penTax(this.value)"><span class="nlf-u">% on all pensions</span></label>
        <div class="nl-inrow">${NLP.link('Remove this pension', `NLF.accDel('${H(p.id)}')`)}${NLP.link('Done', 'NLF.accClose()')}</div></div>` : '';
      rows.push(`<tr data-nl-row="${H(p.id)}"><td class="mk">${sw('var(--nlf-amber)')}</td><td><span class="nm">${H(p.name)}</span><span class="sub">Pays from age ${p.startAge ?? ra}${p.endAge ? ` to ${p.endAge}` : ', for life'}, about ${pct(state.pensionTaxRate ?? 25)} income tax</span>${ed}</td><td class="k">Pension</td><td class="r">—</td><td class="r">—</td><td class="r">—</td>${base ? '<td class="r"></td>' : ''}<td class="r">${M(p.monthlyPayout)}<span class="sub">a month</span></td></tr>`);
    });
    if(st.penSug){
      const s = st.penSug;
      rows.push(`<tr data-nl-row="pen-sug" class="sug"><td class="mk">·</td><td><span class="nm">${H(s.name)}</span><span class="sub">${s.quote ? NLP.quote(s.quote) + (s.source ? ' · ' + H(s.source) : '') : `Pays from age ${s.startAge}`}</span><span class="nl-inrow">${NLP.link('Add this pension', 'NLF.penSugAdd()')}${NLP.link('Drop', 'NLF.penSugDrop()')}</span></td><td class="k">${NLP.badge('Suggested', 'amber')}</td><td class="r">—</td><td class="r">—</td><td class="r">—</td>${base ? '<td class="r"></td>' : ''}<td class="r">${M(s.monthlyPayout)}<span class="sub">a month</span></td></tr>`);
    }
    if((!pens.length && !st.penSug) || st.penForm){
      const form = st.penForm ? `<div class="nlf-ed nlf-acc">
        <label class="nlf-wide">Name<input type="text" id="nlf-pn-name" placeholder="e.g. Allmän pension" value=""></label>
        <label>Pays a month<input type="text" inputmode="decimal" class="nl-num-in" id="nlf-pn-pay" value=""><span class="nlf-u">${H(sym())} before tax</span></label>
        <label>From age<input type="text" inputmode="numeric" class="nl-num-in nlf-short" id="nlf-pn-age" value="${ra}"></label>
        <div class="nl-inrow">${NLP.pill('Add this pension', 'NLF.penAddForm()')}${NLP.link('Cancel', 'NLF.penShowForm()')}</div></div>` : '';
      rows.push(`<tr data-nl-row="pen-none"><td class="mk">·</td><td><span class="nm">${pens.length ? 'New pension' : 'Pensions'}</span><span class="sub">${pens.length ? 'Type what it pays you each month once you retire' : 'None added yet'}</span>${form}${st.penForm ? '' : `<span class="nl-inrow">${NLP.link('Add a pension', 'NLF.penShowForm()')}${NLP.link('Tell Horizon about your pension', 'NLF.askPension()')}</span>`}</td><td class="k">${pens.length ? 'Pension' : NLP.badge('Missing', 'amber')}</td><td class="r"></td><td class="r"></td><td class="r"></td>${base ? '<td class="r"></td>' : ''}<td class="r"></td></tr>`);
    }
    const table = `<div class="nl-tbl-wrap"><table class="nl-tbl nlf-acct" id="nlf-tbl"><thead><tr><th></th><th>Account</th><th>Kind</th><th class="r">Now</th><th class="r">Added a month</th><th class="r">Growth</th>${base ? `<th class="r" title="Since ${H(monthWords(base.m))}">Change</th>` : ''}<th class="r">At ${ra}</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    return `<div class="nl-two nlf-two">${nwCard()}${card}</div>` + table;
  }
  function accChart(w, h, proj, series){
    const n = proj.length, ages = proj.map(p => p.age);
    const totals = ages.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.vals[i]), 0));
    const tk = NLP.ticks(0, Math.max(1, ...totals) * 1.05, 4, v => v ? MS(v) : '0');
    const wide = w > 560, padR = wide ? 160 : 14;
    const a0 = ages[0], a1 = ages[n - 1], span = a1 - a0;
    const step = span > 30 ? 10 : span > 12 ? 5 : span > 6 ? 2 : 1;
    const xt = [[a0, String(a0)]]; for(let a = Math.ceil((a0 + 1) / step) * step; a < a1; a += step) if(a - a0 >= step * 0.6 && a1 - a >= step * 0.6) xt.push([a, String(a)]); xt.push([a1, String(a1)]);
    return NLP.chart({ w, h, x:[a0, a1], y:[tk.min, tk.max], yt:tk.ticks, xt, pad:{ l:58, r:padR, t:12, b:24 }, label:'Accounts growing to retirement',
      hover:{ n, x:i => ages[i], title:i => `Age ${ages[i]} · ${M(totals[i])} in all`,
        rows:i => series.map(x => ({ name:x.name, value:M(Math.max(0, x.vals[i])), color:x.col })).reverse() },
      draw:({ sx, sy }) => {
        let lower = ages.map(() => 0), g = '', labs = [];
        series.forEach(s => {
          const upper = ages.map((_, i) => lower[i] + Math.max(0, s.vals[i]));
          const d = ages.map((a, i) => (i ? 'L' : 'M') + sx(a).toFixed(1) + ' ' + sy(upper[i]).toFixed(1)).join('') + ages.slice().reverse().map((a, j) => 'L' + sx(a).toFixed(1) + ' ' + sy(lower[n - 1 - j]).toFixed(1)).join('') + 'Z';
          g += `<path d="${d}" fill="${s.col}" opacity=".85"/>`;
          const end = upper[n - 1] - lower[n - 1];
          if(end > 0) labs.push({ y:sy((upper[n - 1] + lower[n - 1]) / 2) + 4, t:`${ellip(s.name, 14)} ${MS(end)}` });
          lower = upper;
        });
        if(wide && labs.length){
          // Keep the end labels apart (at least 15px), inside the chart.
          labs.sort((a, b) => b.y - a.y);
          const bottom = sy(0) - 2, top = 14;
          for(let i = 0; i < labs.length; i++){ if(i === 0) labs[i].y = Math.min(labs[i].y, bottom); else labs[i].y = Math.min(labs[i].y, labs[i - 1].y - 15); }
          if(labs[labs.length - 1].y < top){ const shift = top - labs[labs.length - 1].y; labs.forEach(l => { l.y += shift; }); }
          g += labs.map(l => `<text class="lab" x="${(sx(a1) + 8).toFixed(1)}" y="${l.y.toFixed(1)}">${H(l.t)}</text>`).join('');
        }
        return g;
      } });
  }
  NLF.accAdd = () => {
    const id = genId();
    if(change('New account added', ['externalAssets'], s => { if(!Array.isArray(s.externalAssets)) s.externalAssets = []; s.externalAssets.push({ id, name:'New account', balance:0, monthlyContribution:0, growthRate:7, accountType:'standard', taxRate:30, assetType:'investment' }); })){
      const st = U(); st.chosen = id; st.open = id;
      setTimeout(() => { const el = document.getElementById('nlf-ac-n-' + id); if(el){ el.focus(); el.select(); } }, 120);
    }
  };
  NLF.savGrowth = v => {
    const nv = Math.round(parseNum(v) * 10) / 10;
    if(!(nv >= 0 && nv <= 30)){ NLP.toast('Growth must be between 0% and 30% a year.', 'warn'); return; }
    if(nv === Number(state.growthRate)) return;
    change(`Savings growth ${pct(state.growthRate || 0)} → ${pct(nv)}`, ['growthRate'], s => { s.growthRate = nv; });
  };
  NLF.penTax = v => {
    const nv = Math.round(parseNum(v) * 10) / 10;
    if(!(nv >= 0 && nv <= 90)){ NLP.toast('Pension tax must be between 0% and 90%.', 'warn'); return; }
    if(nv === Number(state.pensionTaxRate ?? 25)) return;
    change(`Income tax on pensions ${pct(state.pensionTaxRate ?? 25)} → ${pct(nv)}`, ['pensionTaxRate'], s => { s.pensionTaxRate = nv; });
  };
  NLF.accClose = () => { U().open = null; NLP.renderPage(P); };
  NLF.accSet = (id, f, v) => {
    const a = (state.externalAssets || []).find(x => x.id === id); if(!a) return;
    const idx = state.externalAssets.indexOf(a);
    let nv, label;
    if(f === 'name'){ nv = String(v || '').trim(); if(!nv || nv === a.name) return; label = `${a.name} renamed to ${nv}`; }
    else if(f === 'growthRate'){ nv = Math.round(parseNum(v) * 10) / 10; if(!(nv >= -10 && nv <= 30)){ NLP.toast('Growth must be between −10% and 30% a year.', 'warn'); return; } if(nv === (a.growthRate ?? state.growthRate)) return; label = `${a.name}: growth ${pct(a.growthRate ?? state.growthRate)} → ${pct(nv)}`; }
    else if(f === 'startAge'){ nv = Math.round(parseNum(v)); if(!(nv >= 40 && nv <= 100)){ NLP.toast('The start age must be between 40 and 100.', 'warn'); return; } if(nv === a.startAge) return; label = `${a.name}: pays from age ${nv}`; }
    else { nv = Math.max(0, Math.round(fromDisp(v))); if(nv === Math.round(a[f] || 0)) return;
      const what = { balance:'balance', monthlyContribution:'added a month', monthlyPayout:'pays a month' }[f] || f;
      label = `${a.name}: ${what} ${M(a[f] || 0)} → ${M(nv)}`; }
    change(label, ['externalAssets'], s => { s.externalAssets[idx][f] = nv; });
  };
  NLF.accDel = id => {
    const a = (state.externalAssets || []).find(x => x.id === id); if(!a) return;
    document.querySelectorAll('#panel-' + P + ' .nlf-ed input[id]').forEach(x => x.removeAttribute('id'));
    if(change(`${a.name} removed`, ['externalAssets'], s => { s.externalAssets = s.externalAssets.filter(x => x.id !== id); })){ const st = U(); st.chosen = null; st.open = null; }
  };

  // ── Life wall ───────────────────────────────────────────────────────────
  function wallHtml(bricks){
    const g = gran();
    const cnt = { green:0, amber:0, red:0 }; bricks.forEach(b => { cnt[b.verdict] = (cnt[b.verdict] || 0) + 1; });
    const firstRed = bricks.find(b => b.verdict === 'red');
    const title = !bricks.length ? 'Nothing to show yet.' : `${cnt.green} of ${bricks.length} bricks hold. ${cnt.red ? `${cnt.red} crack${cnt.red === 1 ? 's' : ''}, from age ${firstRed.startAge}.` : 'None crack.'}`;
    const cells = bricks.map(b => {
      const v = FE.display.pick(b.realEndNetWorth, b.endNetWorth);
      const tag = b.isCurrent ? '<em>Now</em>' : (brickWhy(b).isRet ? '<em>Retire</em>' : '');
      return `<div class="nlf-brick ${b.verdict}" data-nl-row="${b.startYear}" aria-label="${H(yrLabel(b))}, ${H(b.verdict)}"><b>${H(yrLabel(b))}${tag}</b><span>${H(ageLabel(b))}</span><span class="v">${H(MS(v))}</span></div>`;
    }).join('');
    return NLP.card(null, null, `<h2 class="nl-ct">${H(title)}</h2><p class="nl-cs">Each brick is ${g === 1 ? 'one year' : g + ' years'} of your life: green holds, amber wobbles, red would mean a shortfall. Money at the end of each brick, ${lens()}.</p><div class="nlf-wall g${g}" id="nlf-wall">${cells}</div>`);
  }
  NLF.gran = g => { const st = U(); if(st.gran === g) return; st.gran = g; st.chosen = null; NLP.renderPage(P); };
  NLF.chooseBrick = id => { NLP.ui(P).tab = 'wall'; NLP.choose(P, String(id)); };
  function openBrick(id){
    const b = getLifeWallData(gran()).find(x => String(x.startYear) === String(id)); if(!b) return;
    if(b.inRetirement || brickWhy(b).isRet){ NLP.tab(P, 'runway'); }
    else NLP.go('nl-money');
  }
  NLF.openBrick = openBrick;

  // ── Overview (side panel): words, counts and small graphics, no money ──
  function capbar(pctv, label, note){
    const p = Math.max(0, Math.min(100, Math.round(pctv)));
    const col = p >= 100 ? 'var(--nl-accent)' : p >= 80 ? 'var(--nlf-amber)' : 'var(--nlf-ruby)';
    return `<div class="nlf-cap-l">${H(label)}</div><div class="nlf-cap"><i style="width:${p}%;background:${col}"></i></div><p class="nlf-cap-s">${H(note)}</p>`;
  }
  const steps = items => `<div class="nl-counts nlf-steps">${items.map(i => `<div class="${i.kind || ''}">${H(i.label)}</div>`).join('')}</div>`;
  const pageLinks = extra => (extra || []);

  function overview(){
    const tab = NLP.tabOf(P, 'runway');
    if(tab === 'accounts') return ovAccounts();
    if(tab === 'wall') return ovWall();
    return ovRunway();
  }
  function ovRunway(){
    const n = FE.retirement.numbers(), st = U(), le = state.lifeExp || 90, ra = state.retirementAge;
    const { rx, taxPct, drawPct, pens } = runwayRows(n);
    const sug = st.penSug;
    if(sug){
      return {
        headline: sug.quote ? 'Your pension statement fills the gap on this page.' : 'A pension is ready to add to your plan.',
        graphic: steps([{ label:sug.quote ? 'In your files' : 'Told to Horizon', kind:'ok' }, { label:'Suggested', kind:'on' }, { label:'Added' }]),
        groups:[{ title:'Waiting for you', rows:[{ text:`${H(sug.name)}, from age ${sug.startAge}`, badge:{ text:'Suggested', kind:'amber' }, why:sug.quote ? NLP.quote(sug.quote) + (sug.source ? ' · ' + H(sug.source) : '') : '', link:{ label:'Drop it', onclick:'NLF.penSugDrop()' } }] }],
        button:{ label:'Add this pension to my plan', onclick:'NLF.penSugAdd()' },
        links:pageLinks([{ label:'Accounts', short:'Accounts', onclick:"NLP.tab('nl-future','accounts')" }]),
      };
    }
    let headline;
    if(!rx.length || !n.totalExp) headline = 'Add what you’ll spend in retirement to see your runway.';
    else if(!n.runoutAge) headline = n.coveragePct >= 100 && (n.gap || 0) > 0 ? 'Well funded, with plenty of room to spare.' : 'Well funded: your money never runs out.';
    else if(n.runoutAge >= le) headline = `Funded to ${le}, with nothing to spare.`;
    else headline = `Your money runs out at ${n.runoutAge}, ${le - n.runoutAge} years early.`;
    const graphic = capbar(n.coveragePct, 'Covered', `${Math.round(n.coveragePct)}% of ${scName()} years, to age ${le}`);
    const groups = [];
    const chosen = NLP.chosen(P);
    if(chosen){
      const r = {
        spend:{ text:`${rx.length} spending line${rx.length === 1 ? '' : 's'} on ${scName()}`, badge:{ text:'After tax', kind:'steel' }, why:'Press the row again to change the lines.', link:{ label:U().open === 'spend' ? 'Close the lines' : 'Change the lines', onclick:U().open === 'spend' ? 'NLF.rxClose()' : 'NLF.rxOpen()' } },
        gross:{ text:`About ${taxPct}% tax on what you take out`, badge:{ text:'Estimate', kind:'steel' }, why:'A blend of each account’s tax, weighted by size.', link:{ label:'Ask how tax is worked out', onclick:"NLP.ask('How is the tax on my retirement withdrawals worked out?')" } },
        pension:pens.length ? { text:`${pens.length} pension${pens.length > 1 ? 's' : ''} counted`, badge:{ text:'Counted', kind:'green' }, link:{ label:'Open Accounts', onclick:"NLP.tab('nl-future','accounts')" } } : { text:'No pension added', badge:{ text:'Missing', kind:'amber' }, link:{ label:'Tell Horizon about your pension', onclick:'NLF.askPension()' } },
        draw:drawPct == null ? { text:'No savings counted yet', badge:{ text:'Missing', kind:'amber' }, link:{ label:'Open Accounts', onclick:"NLP.tab('nl-future','accounts')" } } : { text:`${pct(drawPct)} of your savings a year`, badge:drawPct <= 4 ? { text:'Under 4%', kind:'green' } : { text:'Above 4%', kind:'amber' }, why:'The 4% rule of thumb: taking out up to 4% a year usually lasts 30 years.', link:{ label:'Ask what this means', onclick:"NLP.ask('What does my withdrawal rate mean compared with the 4% rule?')" } },
      }[chosen];
      if(r) groups.push({ title:'This line', rows:[r] });
    }
    const defs = wifDefs(), on = U().wif || [];
    groups.push({ title:'Try a what-if, prepared not saved', rows:defs.slice(0, chosen ? 2 : 4).map(d => {
      const isOn = on.includes(d.key);
      return { text:H(d.long), badge:isOn ? { text:'On the chart', kind:'green' } : { text:'Preview', kind:'steel' }, link:{ label:isOn ? 'Take it off the chart' : 'Draw it on the chart', onclick:`NLF.wif('${d.key}')` } };
    }) });
    const miss = [];
    if(!pens.length) miss.push({ text:'No pension added', badge:{ text:'Missing', kind:'amber' }, link:{ label:'Tell Horizon about your pension', onclick:'NLF.askPension()' } });
    if(!rx.length) miss.push({ text:'No retirement spending yet', badge:{ text:'Missing', kind:'amber' }, link:{ label:'Add spending lines', onclick:'NLF.rxOpen()' } });
    if(miss.length && chosen !== 'pension') groups.push({ title:'Missing', rows:miss });
    let button;
    const act = activeWifs(), moved = planDiffs();
    if(moved.length) groups.unshift({ title:'Away from your plan', rows:[{ text:`${moved.length} setting${moved.length === 1 ? '' : 's'} changed from your plan`, badge:{ text:'Changed', kind:'amber' }, link:{ label:'Make this my plan', onclick:'NLF.planKeep()' } }] });
    if(act.length) button = { label:'Use this in my plan', onclick:'NLF.wifKeep()' };
    else if(moved.length) button = { label:'Back to my plan', onclick:'NLF.planBack()' };
    else if(defs.length) button = { label:`Preview: ${defs[0].label.toLowerCase()}`, onclick:`NLF.wif('${defs[0].key}')` };
    return { headline, graphic, groups, button,
      links:pageLinks([{ label:'Change expenses', short:'Expenses', onclick:'NLF.rxOpen()' }]) };
  }
  function ovAccounts(){
    const inv = investments(), pens = pensions(), st = U(), ra = state.retirementAge;
    const nAcc = inv.length + 1;
    const headline = `${nAcc} account${nAcc > 1 ? 's' : ''} grow${nAcc > 1 ? '' : 's'} steadily to ${ra}. ${pens.length ? `${pens.length} pension${pens.length > 1 ? 's are' : ' is'} counted.` : 'No pension is counted yet.'}`;
    const top = inv.slice().sort((a, b) => (b.balance || 0) - (a.balance || 0))[0];
    // Net worth over time leads the panel once there are two months to compare.
    const hist = nwHist(), first = hist[0], last = hist[hist.length - 1];
    if(hist.length > 1 && !NLP.chosen(P)){
      const d = last.total - first.total, pc = first.total ? Math.round(d / Math.abs(first.total) * 100) : null;
      const ch = hist.slice(-13).map((e, i, a) => i ? e.total - a[i - 1].total : null).slice(1);
      const mx = Math.max(1, ...ch.map(Math.abs));
      const bars = `<div class="nlf-nwbars" aria-label="Change each month">${ch.map(c => `<i class="${c < 0 ? 'd' : ''}" style="height:${Math.max(3, Math.round(Math.abs(c) / mx * 52))}px" title="${H((c < 0 ? '−' : '+') + MS(Math.abs(c)))}"></i>`).join('')}</div><div class="nlp-small">Change each month. Red: a month that went down.</div>`;
      const groups = [{ title:'Going further back', rows:[{ text:`History starts ${H(monthWords(first.m))}`, badge:{ text:`${hist.length} months`, kind:'grey' }, link:{ label:'Add an earlier month', onclick:'NLF.nwForm()' } }] }];
      const h = homeOf();
      if(!h.value) groups.push({ title:'Missing', rows:[{ text:'Your home is not counted yet', badge:{ text:'Missing', kind:'amber' }, why:'Add what it is worth and what is still owed, for your full net worth.', link:{ label:'Add your home', onclick:"NLF.accOpen('home')" } }] });
      return { headline:`Your net worth ${d >= 0 ? 'grew' : 'fell'} by about ${MS(Math.abs(d))}${pc != null ? ` (${d >= 0 ? '+' : '−'}${Math.abs(pc)}%)` : ''} since ${monthWords(first.m)}.`, graphic:bars, groups,
        button:{ label:'Add an earlier month', onclick:'NLF.nwForm()' }, links:[{ label:'Runway', onclick:"NLP.tab('nl-future','runway')" }] };
    }
    const graphic = steps([{ label:top ? ellip(top.name, 14) : 'Accounts', kind:inv.length ? 'ok' : 'on' }, { label:'Savings', kind:'ok' }, { label:pens.length ? 'Pension' : 'Pension', kind:pens.length ? 'ok' : 'on' }]);
    const groups = [];
    const chosen = NLP.chosen(P);
    const a = chosen && (state.externalAssets || []).find(x => x.id === chosen);
    if(a && (a.assetType || 'investment') === 'investment'){
      const g = a.growthRate ?? state.growthRate, others = inv.filter(x => x !== a).map(x => x.growthRate ?? state.growthRate);
      const avg = others.length ? others.reduce((s, x) => s + x, 0) / others.length : g;
      const rows = [];
      rows.push({ text:`Grows at ${pct(g)}${others.length ? (g < avg - 0.5 ? ', lower than the others' : g > avg + 0.5 ? ', higher than the others' : ', like the others') : ''}`, badge:{ text:'Info', kind:'steel' }, link:{ label:'Ask why and what it means', onclick:`NLP.ask(${JSON.stringify('Why does ' + a.name + ' grow at ' + g + '% and what does that mean for my retirement?')})` } });
      rows.push(a.monthlyContribution > 0 ? { text:'Topped up every month', badge:{ text:'Steady', kind:'green' }, link:{ label:'Change contribution', onclick:`NLF.accOpen('${H(a.id)}')` } } : { text:'Nothing added each month', badge:{ text:'Not topped up', kind:'grey' }, link:{ label:'Change contribution', onclick:`NLF.accOpen('${H(a.id)}')` } });
      groups.push({ title:a.name, rows });
    } else if(a && a.assetType === 'pension'){
      groups.push({ title:a.name, rows:[{ text:`Pays from age ${a.startAge ?? ra}${a.endAge ? ' to ' + a.endAge : ', for life'}`, badge:{ text:'Counted', kind:'green' }, link:{ label:'Change it', onclick:`NLF.accOpen('${H(a.id)}')` } }] });
    } else if(chosen === 'sav'){
      groups.push({ title:'Savings from Money plan', rows:[
        { text:`Grows at ${pct(state.growthRate || 0)} a year`, badge:{ text:'Info', kind:'steel' }, why:'Press the row again to change the growth.', link:{ label:'Change growth', onclick:"NLF.accOpen('sav')" } },
        { text:'What you save each month comes from your Money plan', badge:{ text:'From Money plan', kind:'steel' }, link:{ label:'Open the Money plan', onclick:"NLP.go('nl-money')" } }] });
    }
    if(!pens.length && !st.penSug) groups.push({ title:'Missing', rows:[{ text:'No pension added', badge:{ text:'Missing', kind:'amber' }, why:'Your state or work pension lowers what you take from savings.', link:{ label:'Add a pension here', onclick:'NLF.penShowForm()' } }] });
    if(!st.penSug) groups.push({ title:'Two kinds of account', rows:[
      { text:'Grows: what it holds now, what you add each month, and a % growth a year', badge:{ text:'Grows', kind:'green' }, link:{ label:'Add one', onclick:'NLF.accAdd()' } },
      { text:'Pension: pays you a set amount each month from an age', badge:{ text:'Pays', kind:'steel' }, link:{ label:'Add one', onclick:'NLF.penOpen()' } }] });
    if(st.penSug) groups.push({ title:'Waiting for you', rows:[{ text:`${H(st.penSug.name)}, from age ${st.penSug.startAge}`, badge:{ text:'Suggested', kind:'amber' }, link:{ label:'Drop it', onclick:'NLF.penSugDrop()' } }] });
    const button = st.penSug ? { label:'Add this pension to my plan', onclick:'NLF.penSugAdd()' } : (!pens.length ? { label:'Add a pension by chat', onclick:'NLF.askPension()' } : { label:'Add an account that grows', onclick:'NLF.accAdd()' });
    return { headline, graphic, groups, button, links:pageLinks([{ label:'Runway', short:'Runway', onclick:"NLP.tab('nl-future','runway')" }]) };
  }
  NLF.homeSet = (field, v) => {
    const nv = Math.max(0, Math.round(fromDisp(v)));
    const was = homeOf()[field];
    if(nv === was) return;
    change(`${field === 'value' ? 'Home value' : 'Mortgage still owed'} ${was ? M(was) + ' → ' : ''}${M(nv)}`, ['home'], s => { s.home = Object.assign({}, homeOf(), { [field]:nv }); });
    setTimeout(() => { try { nwSnapshot(); } catch(_){} }, 0);
  };
  NLF.nwForm = () => { const st = U(); st.nwAdd = !st.nwAdd; NLP.renderPage(P); if(st.nwAdd) setTimeout(() => document.getElementById('nlf-nw-m')?.focus(), 60); };
  NLF.nwAdd = () => {
    const m = (document.getElementById('nlf-nw-m') || {}).value || '', v = (document.getElementById('nlf-nw-v') || {}).value || '';
    if(!/^\d{4}-\d{2}$/.test(m) || m >= ymOf(new Date())){ NLP.toast('Choose a month before this one.', 'warn'); return; }
    if(!/\d/.test(v)){ NLP.toast('Type what you had then.', 'warn'); return; }
    const total = Math.round(fromDisp(v));
    U().nwAdd = false;
    change(`Net worth for ${monthWords(m)}: ${M(total)}`, ['nwHistory'], s => { s.nwHistory = (Array.isArray(s.nwHistory) ? s.nwHistory : []).filter(e => !(e && e.m === m)).concat([{ m, total, manual:true }]).sort((a, b) => a.m.localeCompare(b.m)); });
  };
  NLF.accOpen = id => { const st = U(); NLP.ui(P).tab = 'accounts'; st.chosen = id; st.open = id; NLP.renderPage(P); };
  function ovWall(){
    const bricks = getLifeWallData(gran()), chosen = NLP.chosen(P);
    const b = chosen && bricks.find(x => String(x.startYear) === String(chosen));
    const cnt = { green:0, amber:0, red:0 }; bricks.forEach(x => { cnt[x.verdict] = (cnt[x.verdict] || 0) + 1; });
    const colourWord = v => v === 'red' ? 'red' : v === 'amber' ? 'amber' : 'green';
    const links = pageLinks([{ label:'How bricks are scored', short:'Scoring', onclick:"NLP.ask('How are the bricks on my life wall scored: green, amber and red?')" }]);
    if(!b){
      const look = bricks.filter(x => x.verdict !== 'green');
      return {
        headline: !bricks.length ? 'Nothing to show yet.' : `${cnt.green} of ${bricks.length} bricks hold.${cnt.red ? ` ${cnt.red} crack.` : ' None crack.'}`,
        graphic: NLP.counts([{ value:cnt.green, label:'hold', kind:'ok' }, { value:cnt.amber, label:'wobble', kind:cnt.amber ? 'on' : '' }, { value:cnt.red, label:'crack', kind:cnt.red ? 'on' : '' }]),
        groups: look.length ? [{ title:'Bricks to look at', rows:look.slice(0, 5).map(x => { const w = brickWhy(x); return { text:`${H(yrLabel(x))}, ${H(whyShort(w, x))}`, badge:badgeFor(w, x), link:{ label:'Choose it', onclick:`NLF.chooseBrick(${x.startYear})` } }; }) }] : [{ title:'All bricks', rows:[{ text:'Every brick holds', badge:{ text:'On track', kind:'green' } }] }],
        button: look.length ? { label:'See ways to make it green', onclick:"NLP.ask('Some bricks on my life wall are not green. What could I change to make them green?')" } : { label:'Open Runway', onclick:"NLP.tab('nl-future','runway')" },
        links,
      };
    }
    const w = brickWhy(b), y = yrLabel(b);
    const head = {
      ok:`${y} holds. You are on track.`,
      spend:`${y} is amber because of high trip spending.`,
      ret:`${y} is amber: it is the change-over to retirement.`,
      pension:`${y} is amber: a pension starts.`,
      penfund:`${y} is amber: savings run out, but pensions cover your spending.`,
      depleted:`${y} is red: your savings run out.`,
      short:`${y} is red: your income falls short.`,
    }[w.key];
    const graphic = steps([
      b.inRetirement ? { label:`Covered ${b.totalCoversPct}%`, kind:b.totalCoversPct >= 100 ? 'ok' : 'on' } : { label:`Saving ${b.savingsRate}%`, kind:b.savingsRate > 0 ? 'ok' : 'on' },
      { label:w.trips.length ? `${w.trips.length} trip${w.trips.length > 1 ? 's' : ''}` : `${b.events.length} event${b.events.length === 1 ? '' : 's'}`, kind:w.key === 'spend' ? 'on' : 'ok' },
      { label:ageLabel(b), kind:b.verdict === 'green' ? 'ok' : 'on' },
    ]);
    const rows = [];
    if(w.key === 'spend' || w.trips.length) rows.push({ text:`Trips: ${H(ellip(w.trips.map(t => t.title).join(', '), 80))}`, badge:{ text:w.key === 'spend' ? 'Wobble' : 'Planned', kind:w.key === 'spend' ? 'amber' : 'grey' }, link:{ label:'Open Plans', onclick:"NLP.go('nl-plans')" } });
    if(w.isRet) rows.push({ text:'The years you stop working and start taking from savings', badge:{ text:'Change-over', kind:'amber' }, link:{ label:'Open Runway', onclick:"NLP.tab('nl-future','runway')" } });
    if(w.pens.length) rows.push({ text:`Pension starts: ${H(w.pens.map(p => p.name).join(', '))}`, badge:{ text:'Info', kind:'steel' }, link:{ label:'Open Accounts', onclick:"NLP.tab('nl-future','accounts')" } });
    if(w.key === 'depleted' || w.key === 'short') rows.push({ text:'Your savings can’t cover your spending here', badge:{ text:'Shortfall', kind:'ruby' }, link:{ label:'Open Runway', onclick:"NLP.tab('nl-future','runway')" } });
    if(w.key === 'penfund') rows.push({ text:'Savings run out, pensions cover the spending', badge:{ text:'Pension-funded', kind:'amber' }, link:{ label:'Open Runway', onclick:"NLP.tab('nl-future','runway')" } });
    if(w.key === 'ok') rows.push(b.inRetirement ? { text:'Withdrawals stay within what your savings can carry', badge:{ text:'Holds', kind:'green' }, link:{ label:'Open Runway', onclick:"NLP.tab('nl-future','runway')" } } : { text:`Saving ${b.savingsRate}% of income, growing about ${pct(state.growthRate || 0)} a year`, badge:{ text:'Steady', kind:'green' }, link:{ label:'Open the Money plan', onclick:"NLP.go('nl-money')" } });
    if(b.isCurrent) rows.push({ text:'You are in this brick now', badge:{ text:'Now', kind:'steel' } });
    const groups = [{ title:b.verdict === 'green' ? 'Why it holds' : `Why ${colourWord(b.verdict)}`, rows }];
    const other = bricks.filter(x => x !== b && x.verdict !== 'green').slice(0, 2);
    if(other.length) groups.push({ title:other.length > 1 ? 'Other bricks to look at' : `The other ${colourWord(other[0].verdict)} brick`, rows:other.map(x => { const ww = brickWhy(x); return { text:`${H(yrLabel(x))}, ${H(whyShort(ww, x))}`, badge:badgeFor(ww, x), link:{ label:'Choose it', onclick:`NLF.chooseBrick(${x.startYear})` } }; }) });
    const button = b.verdict !== 'green'
      ? { label:'See ways to make it green', onclick:`NLP.ask(${JSON.stringify('How could I make ' + y + ' green on my life wall? It is ' + b.verdict + '.')})` }
      : (b.inRetirement || w.isRet ? { label:'Open Runway', onclick:"NLP.tab('nl-future','runway')" } : { label:'Open the Money plan', onclick:"NLP.go('nl-money')" });
    return { headline:head, graphic, groups, button, links };
  }
  function whyShort(w, b){
    return { spend:'high trip spending', ret:'the year you retire', pension:'a pension starts', penfund:'pensions carry it', depleted:'savings run out', short:'income falls short', ok:'on track' }[w.key];
  }
  function badgeFor(w, b){
    return { spend:{ text:'Wobble', kind:'amber' }, ret:{ text:'Change-over', kind:'amber' }, pension:{ text:'Pension', kind:'amber' }, penfund:{ text:'Pension-funded', kind:'amber' }, depleted:{ text:'Shortfall', kind:'ruby' }, short:{ text:'Shortfall', kind:'ruby' }, ok:{ text:'Holds', kind:'green' } }[w.key];
  }

  // ── Styles (new look only, scoped to this page or html.nl) ─────────────
  NLP.css('nl-future-css', `
html.nl { --nlf-amber:#8A5A0A; --nlf-steel:#48639A; --nlf-ruby:#8F2A22; --nlf-c1:#087363; --nlf-c2:#5FA898; --nlf-c3:#48639A; --nlf-c4:#9DB0D3; --nlf-c5:#B7892F; --nlf-c6:#7C8FB8; --nlf-c7:#A9D3C4;
  --nlf-green-bg:#DFF2E7; --nlf-green-tx:#1F4D3B; --nlf-amber-bg:#FBEEDB; --nlf-ruby-bg:#FBE5E3; }
#panel-nl-future .nlf .nl-cc { padding-bottom:12px; }
#panel-nl-future .nlf-wif { margin:10px 0 0; align-items:center; }
#panel-nl-future .nlf-wl { font-size:13px; color:var(--nl-detail); }
#panel-nl-future .nlf-planbar { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin:0 0 16px; padding:14px 18px; border:1px solid var(--nl-line); border-left:3px solid var(--nlf-amber); border-radius:12px; background:var(--nl-surface); }
#panel-nl-future .nlf-planbar b { display:block; font-weight:600; font-size:14px; }
#panel-nl-future .nlf-planbar span { display:block; font-size:13px; color:var(--nl-quiet); margin-top:2px; }
#panel-nl-future .nlf-planbar .nl-inrow { display:flex; align-items:center; gap:16px; margin:0; }
#panel-nl-future .nlf-planbar .nlf-pb { width:auto; padding:9px 18px; margin:0; }
#panel-nl-future .nlf-sv-note { grid-column:1/-1; margin:6px 0 0; font-size:13px; color:var(--nl-quiet); }
#panel-nl-future .nlf-wifres { margin:8px 0 0; font-size:13px; color:var(--nl-quiet); }
#panel-nl-future .nlf-wifres i.dash { display:inline-block; width:14px; height:0; border-top:2px dashed var(--nlf-steel); vertical-align:3px; margin-right:6px; }
#panel-nl-future .nlf-wifres .nl-link { margin-left:8px; }
#panel-nl-future table.nl-tbl td .nl-b { white-space:nowrap; }
#panel-nl-future table.nl-tbl .r .sub { text-align:right; }
#panel-nl-future table.nl-tbl td.k { color:var(--nl-detail); font-size:13px; white-space:nowrap; }
#panel-nl-future .nlf-sw { display:inline-block; width:9px; height:9px; border-radius:2px; margin-top:6px; }
#panel-nl-future .nlf-ed { margin-top:8px; padding-top:4px; border-top:1px solid var(--nl-line); cursor:default; }
#panel-nl-future .nlf-edh { margin:0 0 2px; font-size:12.5px; color:var(--nl-detail); }
#panel-nl-future .nlf-rx { display:grid; grid-template-columns:minmax(0,1fr) 110px auto auto; gap:10px; align-items:baseline; padding:6px 0; border-bottom:1px solid var(--nl-line); }
#panel-nl-future .nlf-rx input[type=text]:not(.nl-num-in), #panel-nl-future .nlf-acc input[type=text]:not(.nl-num-in) { border:0; border-bottom:1px solid var(--nl-edge); background:transparent; font:500 14px var(--nl-sans); color:var(--nl-ink); padding:2px 0; width:100%; min-width:0; outline:0; }
#panel-nl-future .nlf-ed input:focus { border-bottom-color:var(--nl-accent) !important; }
#panel-nl-future .nlf-u { font-size:12.5px; color:var(--nl-detail); white-space:nowrap; }
#panel-nl-future .nlf-acc label { display:grid; grid-template-columns:120px minmax(0,150px) auto; justify-content:start; gap:10px; align-items:baseline; padding:6px 0; border-bottom:1px solid var(--nl-line); font-size:13px; color:var(--nl-detail); font-weight:400; }
#panel-nl-future .nlf-acc .nl-num-in { width:100%; }
#panel-nl-future .nlf-acc label.nlf-wide { grid-template-columns:120px minmax(0,1fr); justify-content:stretch; }
#panel-nl-future .nlf-acc .nl-num-in.nlf-short { max-width:70px; }
#panel-nl-future .nlf-chg .sub { display:block; color:var(--nl-detail); font-size:12px; }
#panel-nl-future .nlf-chg.up { color:#1F4D3B; } #panel-nl-future .nlf-chg.dn { color:#8F2A22; }
#panel-nl-future .nlf-na { color:var(--nl-detail); }
#panel-nl-future .nlf-two { margin-bottom:12px; } #panel-nl-future .nlf-two .nl-cc { margin:0; min-width:0; }
#panel-nl-future .nlf-nw-links { margin-top:6px; }
#panel-nl-future .nlf-nwadd { margin-top:8px; }
html.nl .nlf-nwbars { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(0,1fr); gap:3px; align-items:end; height:56px; margin:4px 0 4px; }
html.nl .nlf-nwbars i { display:block; border-radius:2px 2px 0 0; background:var(--nl-accent); }
html.nl .nlf-nwbars i.d { background:#C77B70; }
#panel-nl-future .nlf-ed .nl-inrow { margin-top:8px; align-items:center; }
#panel-nl-future .nlf-wall { display:grid; grid-template-columns:repeat(auto-fill,minmax(122px,1fr)); gap:8px; margin-top:8px; }
#panel-nl-future .nlf-wall.g1 { grid-template-columns:repeat(auto-fill,minmax(98px,1fr)); gap:6px; }
#panel-nl-future .nlf-brick { border-radius:8px; padding:8px 10px; background:var(--nlf-green-bg); color:var(--nlf-green-tx); cursor:pointer; min-width:0; font-size:12.5px; line-height:1.45; outline:0; }
#panel-nl-future .nlf-brick.amber { background:var(--nlf-amber-bg); color:var(--nlf-amber); }
#panel-nl-future .nlf-brick.red { background:var(--nlf-ruby-bg); color:var(--nlf-ruby); }
#panel-nl-future .nlf-brick b { display:flex; justify-content:space-between; gap:4px; font-size:13px; font-weight:600; white-space:nowrap; }
#panel-nl-future .nlf-brick b em { font-style:normal; font-weight:500; font-size:11.5px; opacity:.85; }
#panel-nl-future .nlf-brick span { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#panel-nl-future .nlf-brick .v { font-variant-numeric:tabular-nums; }
#panel-nl-future .nlf-brick:hover { box-shadow:inset 0 0 0 1px currentColor; }
#panel-nl-future .nlf-brick.on { box-shadow:inset 0 0 0 2px var(--nl-ink); }
#panel-nl-future .nlf-brick:focus-visible { box-shadow:inset 0 0 0 2px var(--nl-accent); }
html.nl .nl-side .nlf-cap-l { font-size:12.5px; color:var(--nl-detail); margin-bottom:6px; }
html.nl .nl-side .nlf-cap { height:8px; border-radius:999px; background:var(--nl-pill); overflow:hidden; }
html.nl .nl-side .nlf-cap i { display:block; height:100%; border-radius:999px; }
html.nl .nl-side .nlf-cap-s { font-size:12.5px; color:var(--nl-detail); margin:6px 0 0; }
html.nl .nl-side .nlf-steps div { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
`);

  NLP.register({ panel:P, section:'future', label:'Future', render, overview });
})();

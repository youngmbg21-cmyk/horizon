/* Horizon · new look · "Walk me through": short animated lessons in the assistant panel.
   The assistant only writes the plan (what to say, which drawing). Every number in a
   drawing is read from Horizon itself when the lesson is made. A lesson only shows;
   it never changes the plan. */
(function(){
  if(!window.NLP) return;
  const H = NLP.h, M = v => NLP.money(v);

  // ── When each step was revealed (not saved: after a reload lessons show still) ──
  const shownAt = new Map();
  const key = (id, k) => id + ':' + k;
  function since(id, k){ const t = shownAt.get(key(id, k)); if(t == null) return null; const e = Date.now() - t; return e > 9000 ? null : e; }
  // Animation attributes for something revealed by step k, starting `delay` ms into that step.
  function an(id, k, delay, cls){ const e = since(id, k); return e == null ? '' : ` data-a="${cls}" style="animation-delay:${Math.round(delay - e)}ms"`; }

  const chat = () => (state.nl && Array.isArray(state.nl.chat)) ? state.nl.chat : [];
  const findMsg = id => chat().find(m => m.kind === 'lesson' && m.id === id);

  // ── Reading the numbers from Horizon ─────────────────────────────────────
  const months = () => (typeof get12Months === 'function' ? get12Months() : []);
  const monthOf = k => { const ms = months(); return ms.find(m => m.key === k) || ms[0] || null; };
  const clean = s => String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const sum = (a, f) => a.reduce((s, x) => s + (Number(f ? f(x) : x) || 0), 0);
  function monthLines(m){
    const by = new Map(); let trips = 0;
    (m.expenseItems || []).forEach(x => { const v = Number(x.amount) || 0; if(!(v > 0) || x.carryForward) return; if(x.fromTrip){ trips += v; return; } const n = clean(x.name) || 'Other'; by.set(n, (by.get(n) || 0) + v); });
    if(trips > 0) by.set('Trips', trips);
    let rows = [...by].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    if(rows.length > 8){ const rest = rows.slice(7); rows = rows.slice(0, 7).concat([{ name:`${rest.length} others`, value:sum(rest, r => r.value) }]); }
    return rows;
  }
  function flowItems(m){
    const trips = sum((m.expenseItems || []).filter(x => x.fromTrip && !x.carryForward), x => x.amount);
    const items = [{ id:'income', name:'In', value:m.pureIncome || 0, k:'in' },
      { id:'costs', name:'Costs', value:-((m.pureExpenses || 0) - trips), k:'out' },
      { id:'saved', name:'Saved', value:-(m.savings || 0), k:'out' }];
    if(trips > 0) items.push({ id:'trips', name:'Trips', value:-trips, k:'trip' });
    const carry = (m.funFund || 0) - (m.pureFunFund || 0);
    if(Math.abs(carry) >= 1) items.push({ id:'carry', name:carry < 0 ? 'Last month' : 'From before', value:carry, k:carry < 0 ? 'trip' : 'in' });
    const end = sum(items, x => x.value);
    items.push({ id:'end', name:end < 0 ? 'Short' : 'Left', value:end, k:end < 0 ? 'neg' : 'end' });
    return items;
  }
  const UPTO = { income:1, costs:2, saved:3, trips:4, end:99 };
  function runway(){
    const n = FE.retirement.numbers(), s = n._simResult || {}, ages = s.labels || [];
    const sc = (v, a) => FE.display.scaleReal(Number(v) || 0, Math.max(0, a - (state.currentAge || 0)));
    return { ages, bal:ages.map((a, i) => sc(s.balData[i], a)), wd:ages.map((a, i) => sc(s.portWithdrawal[i], a)), pen:ages.map((a, i) => sc(s.pensionData[i], a)),
      penAge:s.earliestPension || null, runout:n.runoutAge || null };
  }
  const short = k => { const m = /^(\d{4})-(\d{2})$/.exec(k || ''); return m ? new Date(+m[1], +m[2] - 1, 1).toLocaleDateString('en-GB', { month:'short' }) : k; };

  // Turn the assistant's plan into steps with Horizon's numbers in them.
  function build(input){
    const steps = [], errs = [];
    let lastBoard = null;
    (Array.isArray(input.steps) ? input.steps : []).slice(0, 8).forEach((st, i) => {
      const say = String(st.say || '').trim().slice(0, 400); const sh = st.show || {}; const t = sh.type || 'none';
      const out = { say };
      if(t === 'month_lines'){
        const m = monthOf(sh.month); if(!m){ errs.push(`step ${i + 1}: no month`); return; }
        out.board = lastBoard = { kind:'bars', label:`Costs in ${m.label || short(m.key)}`, rows:monthLines(m) };
      } else if(t === 'savings_growth'){
        let c = 0; out.board = lastBoard = { kind:'bars', label:'Savings adding up, next 12 months', rows:months().map(m => ({ name:short(m.key), value:(c += Number(m.savings) || 0) })), accentLast:true };
      } else if(t === 'highlight'){
        if(!lastBoard || lastBoard.kind !== 'bars'){ errs.push(`step ${i + 1}: highlight needs bars before it`); return; }
        const want = (sh.names || []).map(x => String(x).toLowerCase());
        const hit = lastBoard.rows.filter(r => want.some(w => r.name.toLowerCase().includes(w) || w.includes(r.name.toLowerCase()))).map(r => r.name);
        if(!hit.length){ errs.push(`step ${i + 1}: none of ${JSON.stringify(sh.names)} is on the chart (it shows ${lastBoard.rows.map(r => r.name).join(', ')})`); return; }
        out.op = { kind:'hi', names:hit };
      } else if(t === 'month_flow'){
        const m = monthOf(sh.month); if(!m){ errs.push(`step ${i + 1}: no month`); return; }
        const upto = UPTO[sh.upto] || 99;
        if(lastBoard && lastBoard.kind === 'flow' && lastBoard.month === m.key) out.op = { kind:'upto', n:upto };
        else out.board = lastBoard = { kind:'flow', month:m.key, label:`${m.label || short(m.key)}, from what comes in to what is left`, items:flowItems(m), n:upto };
      } else if(t === 'line_by_month'){
        const q = String(sh.name || '').toLowerCase(); const trips = /trip|travel/.test(q);
        const rows = months().map(m => { const v = sum((m.expenseItems || []).filter(x => !x.carryForward && (trips ? x.fromTrip : clean(x.name).toLowerCase().includes(q))), x => x.amount); return [short(m.key), v]; });
        if(!q || !rows.some(r => r[1] > 0)){ errs.push(`step ${i + 1}: no expense line matches "${sh.name}"`); return; }
        const mx = Math.max(...rows.map(r => r[1]));
        out.board = lastBoard = { kind:'table', label:`${trips ? 'Trips' : clean(sh.name)}, month by month`, head:['Month', 'Amount'], rows:rows.map(r => ({ c:[r[0], r[1]], money:[false, true], hot:r[1] === mx && mx > 0 })) };
      } else if(t === 'share'){
        const m = monthOf(sh.month); if(!m){ errs.push(`step ${i + 1}: no month`); return; }
        const want = (sh.names || []).map(x => String(x).toLowerCase()).slice(0, 3);
        let slices;
        if((sh.of || 'income') === 'costs'){
          const lines = monthLines(m), total = sum(lines, r => r.value);
          const pick = want.length ? lines.filter(r => want.some(w => r.name.toLowerCase().includes(w))) : lines.slice(0, 3);
          if(want.length && !pick.length){ errs.push(`step ${i + 1}: none of ${JSON.stringify(sh.names)} is a cost line (lines: ${lines.map(r => r.name).join(', ')})`); return; }
          slices = pick.slice(0, 4).map(r => ({ name:r.name, value:r.value })); slices.push({ name:'Other costs', value:total - sum(slices, x => x.value), rest:true });
          out.board = lastBoard = { kind:'donut', label:`Share of costs, ${m.label || short(m.key)}`, total, slices };
        } else {
          const inc = m.pureIncome || 0, lines = monthLines(m), costs = m.pureExpenses || 0, sav = m.savings || 0;
          if(!(inc > 0)){ errs.push(`step ${i + 1}: no income this month`); return; }
          const pick = want.length ? lines.filter(r => want.some(w => r.name.toLowerCase().includes(w))).slice(0, 3) : [];
          if(want.length && !pick.length){ errs.push(`step ${i + 1}: none of ${JSON.stringify(sh.names)} is a cost line`); return; }
          slices = pick.map(r => ({ name:r.name, value:r.value }));
          slices.push({ name:pick.length ? 'Other costs' : 'Costs', value:costs - sum(pick, r => r.value) });
          slices.push({ name:'Saved', value:sav });
          const left = inc - costs - sav; if(left > 0) slices.push({ name:'Fun Fund', value:left, rest:true });
          out.board = lastBoard = { kind:'donut', label:`Where your income goes, ${m.label || short(m.key)}`, total:Math.max(inc, costs + sav), over:left < 0 ? -left : 0, slices };
        }
        out.board.slices = out.board.slices.filter(x => x.value > 0);
      } else if(t === 'months_overview'){
        out.board = lastBoard = { kind:'table', label:'The next 12 months', head:['Month', 'Costs', 'Fun balance'], rows:months().map(m => ({ c:[short(m.key), m.pureExpenses || 0, m.funFund || 0], money:[false, true, true], hot:(m.funFund || 0) < 0 })) };
      } else if(t === 'runway'){
        const part = ['balance','withdrawals','pensions'].includes(sh.part) ? sh.part : 'balance';
        if(lastBoard && lastBoard.kind === 'runway') out.op = { kind:'part', part };
        else { const r = runway(); if(r.ages.length < 2){ errs.push(`step ${i + 1}: no retirement years to draw`); return; } out.board = lastBoard = Object.assign({ kind:'runway', label:`Money left, ${r.ages[0]} to ${r.ages[r.ages.length - 1]}`, parts:[part] }, r); }
      } else if(t === 'runway_checkpoints'){
        const r = runway(); if(!r.ages.length){ errs.push(`step ${i + 1}: no retirement years`); return; }
        const pick = r.ages.map((a, j) => j).filter(j => j === 0 || r.ages[j] % 5 === 0 || j === r.ages.length - 1);
        out.board = lastBoard = { kind:'table', label:'Checkpoints', head:['Age', 'Money left'], rows:pick.map(j => ({ c:[String(r.ages[j]), r.bal[j]], money:[false, true], hot:r.bal[j] <= 0 })) };
      }
      if(say || out.board || out.op) steps.push(out);
    });
    return { steps, errs };
  }

  // ── Drawing ─────────────────────────────────────────────────────────────
  const words = (id, k, text) => { const w = String(text).split(/\s+/).filter(Boolean); return { html:w.map((x, j) => `<span${an(id, k, j * 45, 'fade')}>${H(x)}</span>`).join(' '), ms:w.length * 45 + 150 }; };
  function boardHtml(id, b, k0, base, ops){
    const head = `<div class="nlw-bl">${H(b.label)}</div>`;
    if(b.kind === 'bars'){
      const hi = new Map(); ops.filter(o => o.kind === 'hi').forEach(o => o.names.forEach(nm => { if(!hi.has(nm)) hi.set(nm, o); }));
      const mx = Math.max(1, ...b.rows.map(r => r.value));
      return head + `<div class="nlw-bars">${b.rows.map((r, j) => { const o = hi.get(r.name), on = !!o || (b.accentLast && j === b.rows.length - 1);
        return `<div class="nlw-br${on ? ' hi' : ''}"><span class="nm">${H(r.name)}</span><span class="tr"><i style="width:${(r.value / mx * 100).toFixed(1)}%"${o && since(id, o.at) != null ? an(id, o.at, o.base, 'hi') : an(id, k0, base + j * 110, 'grow')}></i></span><span class="v">${H(M(r.value))}</span></div>`; }).join('')}</div>`;
    }
    if(b.kind === 'table'){
      return head + `<div class="nlw-tw"><table class="nlw-t"><thead><tr>${b.head.map((x, j) => `<th${j ? ' class="r"' : ''}>${H(x)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r, j) => `<tr class="${r.hot ? 'hot' : ''}"${an(id, k0, base + j * 70, 'rise')}>${r.c.map((c, q) => `<td${q ? ' class="r"' : ''}>${H(r.money[q] ? M(c) : c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if(b.kind === 'donut'){
      const cols = ['var(--nl-accent)', '#B7791F', '#5B6B8C', '#6FBFAE', '#C9CED8'];
      let acc = 0; const tot = b.total || 1;
      const segs = b.slices.map((x, j) => { const p = Math.max(0, x.value / tot * 100); const seg = { x, p, start:acc, col:x.rest ? '#C9CED8' : cols[j % 4] }; acc += p; return seg; });
      const arcs = segs.map((g, j) => `<circle r="15.915" cx="18" cy="18" fill="none" stroke="${g.col}" stroke-width="5.2" stroke-dasharray="${g.p.toFixed(3)} ${(100 - g.p).toFixed(3)}" stroke-dashoffset="${(25 - g.start).toFixed(3)}"/>`).join('')
        + `<circle r="15.915" cx="18" cy="18" fill="none" stroke="#fff" stroke-width="6.4" class="nlw-cover" stroke-dasharray="0 100" stroke-dashoffset="25"${an(id, k0, base, 'sweep')}/>`;
      const big = segs[0] ? Math.round(segs[0].p) + '%' : '';
      const legend = segs.map(g => `<div class="nlw-dl"><i style="background:${g.col}"></i><span class="nm">${H(g.x.name)}</span><span class="v">${Math.round(g.p)}%</span><span class="m">${H(M(g.x.value))}</span></div>`).join('') + (b.over ? `<div class="nlw-dl over"><i></i><span class="nm">Over by</span><span class="v"></span><span class="m">${H(M(b.over))}</span></div>` : '');
      return head + `<div class="nlw-donut"><div class="nlw-dw"><svg viewBox="0 0 36 36" aria-hidden="true"><circle r="15.915" cx="18" cy="18" fill="none" stroke="#EDEDF0" stroke-width="5.2"/>${arcs}</svg><span class="nlw-dc"${an(id, k0, base + 300, 'fade')}>${big}<small>${H(segs[0] ? segs[0].x.name : '')}</small></span></div><div class="nlw-dlg">${legend}</div></div>`;
    }
    if(b.kind === 'flow'){
      // Reveal: the board's own n, raised by later "upto" steps.
      let shown = Math.min(b.n, b.items.length);
      const at = b.items.map((_, j) => ({ k:k0, d:base + j * 160 }));
      ops.filter(o => o.kind === 'upto').forEach(o => { const before = shown; shown = Math.max(shown, Math.min(o.n, b.items.length)); for(let j = before; j < shown; j++) at[j] = { k:o.at, d:o.base + (j - before) * 160 }; });
      let run = 0; const spans = b.items.map(x => { let a, c; if(x.id === 'end' || x.id === 'income'){ a = 0; c = x.value; if(x.id === 'income') run = c; } else { a = run; c = run + x.value; run = c; } return [Math.min(a, c), Math.max(a, c)]; });
      const hiV = Math.max(0, ...spans.map(s => s[1])), loV = Math.min(0, ...spans.map(s => s[0])), rng = (hiV - loV) || 1;
      const y = v => (hiV - v) / rng * 100;
      const cols = b.items.map((x, j) => { const on = j < shown; const [a, c] = spans[j];
        return `<div class="nlw-fc${on ? '' : ' off'}"><div class="nlw-fp"><i class="${x.k}" style="top:${y(c).toFixed(2)}%;height:max(2px, ${((c - a) / rng * 100).toFixed(2)}%)"${on ? an(id, at[j].k, at[j].d, 'col') : ''}></i></div><span class="nm">${H(x.name)}</span><span class="v">${on ? H(NLP.moneyShort(x.value)) : ''}</span></div>`; }).join('');
      return head + `<div class="nlw-flow" style="--zero:${y(0).toFixed(2)}%">${cols}</div>`;
    }
    if(b.kind === 'runway'){
      const parts = new Map([[b.parts[0], { k:k0, d:base }]]); ops.filter(o => o.kind === 'part').forEach(o => { if(!parts.has(o.part)) parts.set(o.part, { k:o.at, d:o.base }); });
      if(!parts.has('balance')) parts.set('balance', { k:k0, d:base });
      const n = b.ages.length, mx = Math.max(1, ...b.bal) * 1.08, mx2 = Math.max(1, ...b.wd.map((w, i) => w + (parts.has('pensions') ? b.pen[i] : 0)));
      const X = i => (i / (n - 1)) * 100, Y = v => 100 - (Math.max(0, v) / mx) * 100, Y2 = v => 100 - (Math.max(0, v) / mx2) * 100;
      const d = b.bal.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(2) + ' ' + Y(v).toFixed(2)).join('');
      const p = parts.get('balance');
      const g = `<path d="${d}" class="ln"${an(id, p.k, p.d, 'wipe')}/>`;
      const bw = Math.max(0.6, 70 / n);
      let g2 = '';
      if(parts.has('withdrawals')){ const q = parts.get('withdrawals'); g2 += b.wd.map((w, i) => `<rect x="${(X(i) - bw / 2).toFixed(2)}" y="${Y2(w).toFixed(2)}" width="${bw.toFixed(2)}" height="${(100 - Y2(w)).toFixed(2)}" class="wd"${an(id, q.k, q.d + i * 25, 'col')}/>`).join(''); }
      if(parts.has('pensions')){ const q = parts.get('pensions'); g2 += b.pen.map((v, i) => v > 0 ? `<rect x="${(X(i) - bw / 2).toFixed(2)}" y="${Y2(v + b.wd[i]).toFixed(2)}" width="${bw.toFixed(2)}" height="${(Y2(b.wd[i]) - Y2(v + b.wd[i])).toFixed(2)}" class="pn"${an(id, q.k, q.d + i * 25, 'col')}/>` : '').join(''); }
      const lastV = b.bal[n - 1], ro = b.runout && b.ages.indexOf(b.runout);
      const marks = `<span class="nlw-rl tl">${H(NLP.moneyShort(b.bal[0]))} at ${b.ages[0]}</span><span class="nlw-rl tr">${lastV > 0 ? H(NLP.moneyShort(lastV)) + ' at ' + b.ages[n - 1] : (ro > 0 ? 'Runs out at ' + b.runout : '')}</span>`;
      const strip = g2 ? `<div class="nlw-strip"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${g2}</svg><span class="nlw-rl sl">${H(NLP.moneyShort(b.wd[0] + (parts.has('pensions') ? b.pen[0] : 0)))} a year</span></div>` : '';
      const key = `<div class="nlw-key"><span><i class="ln"></i>Money left</span>${parts.has('withdrawals') ? '<span><i class="wd"></i>Taken out each year</span>' : ''}${parts.has('pensions') ? '<span><i class="pn"></i>From pensions</span>' : ''}</div>`;
      return head + `<div class="nlw-run"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${g}</svg>${marks}</div>${strip}<div class="nlw-ax"><span>${b.ages[0]}</span><span>${b.ages[n - 1]}</span></div>` + key;
    }
    return '';
  }
  function lessonHtml(m){
    const L = m.lesson, id = m.id, cur = Math.min(m.step || 0, L.steps.length - 1);
    // Fold the steps into boards, each with the later steps that change it.
    const items = [], boards = [];
    for(let k = 0; k <= cur; k++){
      const st = L.steps[k], w = words(id, k, st.say), base = w.ms;
      items.push({ type:'say', html:w.html });
      if(st.board){ const b = { b:st.board, k0:k, base, ops:[] }; boards.push(b); items.push({ type:'board', ref:b }); }
      else if(st.op && boards.length) boards[boards.length - 1].ops.push(Object.assign({ at:k, base }, st.op));
    }
    const body = items.map(it => it.type === 'say' ? `<p class="nlw-say">${it.html}</p>` : `<div class="nlw-card">${boardHtml(id, it.ref.b, it.ref.k0, it.ref.base, it.ref.ops)}</div>`).join('');
    const done = cur >= L.steps.length - 1;
    const dots = `<span class="nlw-dots" aria-hidden="true">${L.steps.map((_, k) => `<i class="${k <= cur ? 'on' : ''}"></i>`).join('')}</span>`;
    const acts = done
      ? `<button class="nl-link" type="button" onclick="NLW.replay('${id}')">Replay</button><button class="nl-link" type="button" onclick="NLW.save('${id}')">Save to Notebook</button>`
      : `<button class="nlw-next" type="button" onclick="NLW.next('${id}')">Next</button><button class="nl-link" type="button" onclick="NLW.all('${id}')">Show it all</button>`;
    return `<div class="nl-msg nlw" data-nlw="${id}"><p class="nlw-ttl">${H(L.title)}</p>${body}<div class="nlw-foot"><span class="nlw-acts">${acts}</span><span class="nlw-prog">${dots}<span class="nlw-n">${cur + 1} of ${L.steps.length}</span></span></div></div>`;
  }
  window.NL_MSG_RENDER = window.NL_MSG_RENDER || [];
  window.NL_MSG_RENDER.push(m => (m && m.kind === 'lesson' && m.lesson) ? lessonHtml(m) : null);

  // ── Moving through a lesson ──────────────────────────────────────────────
  const redraw = () => NLP.refreshPanel();
  const scrollToLesson = id => setTimeout(() => { const el = document.querySelector(`#nl-chat [data-nlw="${id}"] .nlw-foot`); if(el && el.scrollIntoView) el.scrollIntoView({ block:'nearest' }); }, 30);
  window.NLW = {
    next(id){ const m = findMsg(id); if(!m) return; if((m.step || 0) >= m.lesson.steps.length - 1) return; m.step = (m.step || 0) + 1; shownAt.set(key(id, m.step), Date.now()); save(); redraw(); scrollToLesson(id); },
    all(id){ const m = findMsg(id); if(!m) return; const from = (m.step || 0) + 1, now = Date.now(); for(let k = from; k < m.lesson.steps.length; k++) shownAt.set(key(id, k), now + (k - from) * 1600); m.step = m.lesson.steps.length - 1; save(); redraw(); scrollToLesson(id); },
    replay(id){ const m = findMsg(id); if(!m) return; m.step = 0; for(let k = 0; k < m.lesson.steps.length; k++) shownAt.delete(key(id, k)); shownAt.set(key(id, 0), Date.now()); save(); redraw(); scrollToLesson(id); },
    save(id){
      const m = findMsg(id); if(!m) return; const L = m.lesson;
      const md = `# ${L.title}\n\n` + L.steps.map((s, k) => `${k + 1}. ${s.say}` + (s.board ? `\n\n   ${s.board.label}:\n` + (s.board.rows ? s.board.rows.slice(0, 12).map(r => `   - ${r.name != null ? r.name + ': ' + M(r.value) : r.c.map((c, q) => r.money[q] ? M(c) : c).join(' · ')}`).join('\n') : '') : '')).join('\n\n');
      if(!Array.isArray(state.vault)) state.vault = [];
      const vid = 'wt' + Date.now().toString(36);
      state.vault.unshift({ id:vid, type:'analysis', category:'walk-through', title:L.title, generatedAt:Date.now(), markdown:md });
      if(typeof saveVault === 'function') saveVault(); save();
      NLP.toast('Saved to Notebook → Reports', '', { label:'Undo', fn:() => { state.vault = state.vault.filter(v => v.id !== vid); if(typeof saveVault === 'function') saveVault(); save(); } });
    },
  };

  // ── The assistant's tool ─────────────────────────────────────────────────
  NLP.addTool({
    def:{ name:'walk_through',
      description:'Show a short step-by-step lesson in the panel: each step is one sentence plus (optionally) a drawing that Horizon builds from the person\'s real numbers. ONLY use this when the person asks to be walked through something, taught, or shown step by step ("walk me through", "teach me", "explain step by step", "show me how"). Never use it for ordinary questions. 3 to 6 steps. Drawings: month_lines (a month\'s costs as bars), highlight (light up named bars from the bars just before), share (a donut: what share of the month\'s income or costs goes where; names can pull out up to 3 cost lines, e.g. ["Mortgage"]), month_flow (a month from income to what is left; repeat it with a bigger "upto" to build it block by block), line_by_month (one expense line across the next 12 months; name "trips" for travel), months_overview (12 months: costs and Fun Fund balance), savings_growth (savings adding up over 12 months), runway (retirement money left by age; repeat with part "withdrawals" then "pensions" to add layers), runway_checkpoints (money left every 5 years), none.',
      input_schema:{ type:'object', properties:{
        title:{ type:'string', description:'Short lesson title, e.g. "Your expenses, step by step".' },
        steps:{ type:'array', minItems:2, maxItems:8, items:{ type:'object', properties:{
          say:{ type:'string', description:'One or two short plain sentences for this step. Use the person\'s real figures from the context.' },
          show:{ type:'object', properties:{
            type:{ type:'string', enum:['none','month_lines','highlight','share','month_flow','line_by_month','months_overview','savings_growth','runway','runway_checkpoints'] },
            month:{ type:'string', description:'YYYY-MM, for month_lines and month_flow. Leave out for the current month.' },
            names:{ type:'array', items:{ type:'string' }, description:'For highlight: names of bars to light up. For share: cost lines to show as their own slices.' },
            name:{ type:'string', description:'For line_by_month: the expense line, e.g. "Groceries", or "trips".' },
            of:{ type:'string', enum:['income','costs'], description:'For share (a donut): split of the month\'s income (costs, saved, Fun Fund) or of its costs.' },
            upto:{ type:'string', enum:['income','costs','saved','trips','end'], description:'For month_flow: how far to build.' },
            part:{ type:'string', enum:['balance','withdrawals','pensions'], description:'For runway: the layer this step adds.' }
          }, required:['type'], additionalProperties:false }
        }, required:['say','show'], additionalProperties:false } }
      }, required:['title','steps'], additionalProperties:false } },
    label:() => 'Drawing a walk-through',
    run(input){
      const { steps, errs } = build(input || {});
      if(steps.length < 2) return { error:'Not enough steps could be drawn. ' + errs.join('; ') };
      const n = state.nl; if(!n || !Array.isArray(n.chat)) return { error:'Chat not ready.' };
      const id = 'w' + Date.now().toString(36);
      const title = String(input.title || 'Walk-through').slice(0, 80);
      n.chat.push({ role:'assistant', kind:'lesson', id, at:Date.now(), step:0, lesson:{ title, steps },
        content:`[Walk-through shown, step by step: ${title}. ${steps.map((s, k) => `${k + 1}) ${s.say}`).join(' ')}]` });
      shownAt.set(key(id, 0), Date.now());
      save(); redraw();
      return { ok:true, shown:steps.length + ' steps', skipped:errs, note:'The lesson is on screen; the person moves through it with Next. Do not repeat it. End your turn with nothing, or one short sentence (for example an offer to prepare a change).' };
    }
  });
  NLP.addSystem(`
- Walk-throughs: when the person asks to be walked through something, taught, or shown step by step, use walk_through to build a short animated lesson (3 to 6 steps, one sentence each, each with a drawing where it helps). Horizon fills the drawings with their real numbers. For any other question, answer normally without it.`);

  // ── Look ────────────────────────────────────────────────────────────────
  const css = `
html.nl .nl-msg.nlw { background:#fff; border:1px solid var(--nl-line); padding:12px 13px; }
html.nl .nlw-ttl { font:600 16px/1.3 var(--nl-serif); margin:0 0 8px; color:var(--nl-ink); }
html.nl .nlw-say { margin:0 0 8px; font-size:13.5px; line-height:1.5; }
html.nl .nlw-card { border:1px solid var(--nl-line); border-radius:10px; padding:10px 11px; margin:0 0 10px; }
html.nl .nlw-bl { font-size:12px; color:var(--nl-detail); margin:0 0 6px; }
html.nl .nlw-br { display:grid; grid-template-columns:minmax(0,96px) minmax(0,1fr) auto; gap:8px; align-items:center; font-size:12.5px; margin:4px 0; }
html.nl .nlw-br .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
html.nl .nlw-br .tr { display:block; height:10px; border-radius:3px; background:#EDEDF0; overflow:hidden; }
html.nl .nlw-br .tr i { display:block; height:100%; background:#C9CED8; border-radius:3px; transform-origin:left center; }
html.nl .nlw-br.hi .nm { font-weight:600; } html.nl .nlw-br.hi .tr i { background:var(--nl-accent); }
html.nl .nlw-br .v { font-variant-numeric:tabular-nums; white-space:nowrap; text-align:right; }
html.nl .nlw-tw { overflow-x:auto; }
html.nl .nlw-t { width:100%; border-collapse:collapse; font-size:12.5px; }
html.nl .nlw-t th { font-weight:500; color:var(--nl-detail); text-align:left; padding:3px 0; border-bottom:1px solid var(--nl-line); }
html.nl .nlw-t td { padding:5px 0; border-bottom:1px solid var(--nl-line); font-variant-numeric:tabular-nums; white-space:nowrap; }
html.nl .nlw-t .r { text-align:right; padding-left:10px; }
html.nl .nlw-t tr.hot td { color:#B4412F; font-weight:600; }
html.nl .nlw-flow { position:relative; display:grid; grid-auto-flow:column; grid-auto-columns:minmax(0,1fr); gap:3px; }
html.nl .nlw-fp::before { content:''; position:absolute; left:-3px; right:-3px; top:var(--zero); height:1px; background:var(--nl-edge); }
html.nl .nlw-fc { display:flex; flex-direction:column; align-items:center; gap:2px; font-size:11.5px; text-align:center; }
html.nl .nlw-fc .nlw-fp { position:relative; width:100%; height:120px; }
html.nl .nlw-fc .nlw-fp i { position:absolute; left:12%; right:12%; border-radius:3px; transform-origin:center bottom; }
html.nl .nlw-fc i.in { background:var(--nl-accent); } html.nl .nlw-fc i.out { background:#C9CED8; } html.nl .nlw-fc i.trip { background:#B7791F; }
html.nl .nlw-fc i.end { background:#6FBFAE; } html.nl .nlw-fc i.neg { background:#B4412F; }
html.nl .nlw-fc.off i { visibility:hidden; } html.nl .nlw-fc.off .nm { color:var(--nl-edge); }
html.nl .nlw-fc .nm { color:var(--nl-detail); line-height:1.2; overflow-wrap:normal; word-break:normal; font-size:11px; } html.nl .nlw-fc .v { font-variant-numeric:tabular-nums; min-height:1.3em; white-space:nowrap; font-size:11px; letter-spacing:-.01em; }
html.nl .nlw-donut { display:grid; grid-template-columns:104px minmax(0,1fr); gap:12px; align-items:center; }
html.nl .nlw-dw { position:relative; width:104px; height:104px; } html.nl .nlw-dw svg { width:100%; height:100%; transform:none; }
html.nl .nlw-dc { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; font:600 18px/1 var(--nl-sans); }
html.nl .nlw-dc small { font:400 10.5px/1.2 var(--nl-sans); color:var(--nl-detail); margin-top:3px; max-width:62px; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
html.nl .nlw-dl { display:grid; grid-template-columns:9px minmax(0,1fr) auto; column-gap:6px; align-items:center; font-size:12px; margin:3px 0; }
html.nl .nlw-dl i { width:9px; height:9px; border-radius:2px; } html.nl .nlw-dl .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } html.nl .nlw-dl .v { font-weight:600; font-variant-numeric:tabular-nums; }
html.nl .nlw-dl .m { grid-column:2 / 4; color:var(--nl-detail); font-size:11.5px; font-variant-numeric:tabular-nums; margin-top:-1px; }
html.nl .nlw-dl.over .nm, html.nl .nlw-dl.over .m { color:#B4412F; }
html.nl [data-a="sweep"] { animation-name:nlwSweep; animation-duration:1.1s; animation-timing-function:ease-in-out; }
@keyframes nlwSweep { from { stroke-dasharray:100 0; stroke-dashoffset:25; } to { stroke-dasharray:0 100; stroke-dashoffset:-75; } }
html.nl .nlw-run { position:relative; height:110px; margin:16px 0 0; }
html.nl .nlw-run svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
html.nl .nlw-run .ln { fill:none; stroke:var(--nl-accent); stroke-width:2.2; vector-effect:non-scaling-stroke; }
html.nl .nlw-strip { position:relative; height:34px; margin-top:6px; } html.nl .nlw-strip svg { position:absolute; inset:0; width:100%; height:100%; }
html.nl .nlw-strip .wd { fill:#B7791F; transform-box:fill-box; transform-origin:center bottom; }
html.nl .nlw-strip .pn { fill:#5B6B8C; transform-box:fill-box; transform-origin:center bottom; }
html.nl .nlw-rl { position:absolute; font-size:11.5px; color:var(--nl-ink); background:rgba(255,255,255,.85); padding:0 3px; border-radius:3px; white-space:nowrap; }
html.nl .nlw-rl.tl { left:0; top:-14px; } html.nl .nlw-rl.tr { right:0; top:-14px; } html.nl .nlw-rl.sl { right:0; top:-15px; color:var(--nl-detail); }
html.nl .nlw-ax { display:flex; justify-content:space-between; font-size:11.5px; color:var(--nl-detail); margin-top:3px; border-top:1px solid var(--nl-edge); padding-top:2px; }
html.nl .nlw-key { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:11.5px; color:var(--nl-quiet); margin-top:6px; }
html.nl .nlw-key i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; vertical-align:-1px; }
html.nl .nlw-key i.ln { height:2px; vertical-align:3px; background:var(--nl-accent); } html.nl .nlw-key i.wd { background:#B7791F; } html.nl .nlw-key i.pn { background:#5B6B8C; }
html.nl .nlw-foot { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 12px; margin-top:4px; }
html.nl .nlw-acts { display:flex; align-items:center; gap:14px; flex-wrap:wrap; } html.nl .nlw-prog { display:flex; align-items:center; gap:8px; }
html.nl .nlw-dots { display:flex; gap:3px; flex:0 0 auto; } html.nl .nlw-dots i { width:14px; height:3px; border-radius:2px; background:var(--nl-line); } html.nl .nlw-dots i.on { background:var(--nl-accent); }
html.nl .nlw-n { font-size:12px; color:var(--nl-detail); white-space:nowrap; }
html.nl .nlw-next { border:0; background:var(--nl-black); color:#fff; border-radius:999px; padding:7px 16px; font:600 13px var(--nl-sans); cursor:pointer; }
html.nl .nlw-next:focus-visible, html.nl .nlw .nl-link:focus-visible { outline:2px solid var(--nl-accent); outline-offset:2px; }
html.nl [data-a] { animation-duration:.5s; animation-timing-function:cubic-bezier(.2,.7,.2,1); animation-fill-mode:both; }
html.nl [data-a="fade"] { animation-name:nlwFade; animation-duration:.2s; }
html.nl [data-a="grow"] { animation-name:nlwGrowX; animation-duration:.7s; }
html.nl [data-a="col"] { animation-name:nlwGrowY; }
html.nl [data-a="rise"] { animation-name:nlwRise; animation-duration:.35s; }
html.nl [data-a="wipe"] { animation-name:nlwWipe; animation-duration:1.4s; animation-timing-function:ease; }
html.nl [data-a="hi"] { animation-name:nlwHi; animation-duration:.6s; }
@keyframes nlwFade { from { opacity:0; } to { opacity:1; } }
@keyframes nlwGrowX { from { transform:scaleX(0); } to { transform:scaleX(1); } }
@keyframes nlwGrowY { from { transform:scaleY(0); } to { transform:scaleY(1); } }
@keyframes nlwRise { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
@keyframes nlwWipe { from { clip-path:inset(0 100% 0 0); } to { clip-path:inset(0 0 0 0); } }
@keyframes nlwHi { from { background:#C9CED8; } to { background:var(--nl-accent); } }
@media (prefers-reduced-motion: reduce){ html.nl [data-a] { animation:none !important; } }
`;
  const st = document.createElement('style'); st.id = 'nl-lesson-css'; st.textContent = css; document.head.appendChild(st);
})();

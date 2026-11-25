/* ══ NEW LOOK (L+S) · Notebook ═══════════════════════════════════════════
   The fifth top-bar page. Three tabs: Files · Notes · Reports.
   - Files: the person's own documents (PDF, Word, Excel, CSV, text, pictures).
     Each file is kept on this device in IndexedDB ('horizon-notebook'), with
     the words read from it (page / row references per passage). A small
     list of the files (state.nlFiles) syncs with the rest of the data; when
     cloud sync is on, the file itself goes to the person's own Supabase
     Storage (bucket 'horizon-files') and other devices fetch it on demand.
     Readers for PDF / Word / Excel load from cdnjs only when needed.
   - Notes: the classic Journal's entries (state.journal).
   - Reports: saved deep dives and analyses (state.vault).
   The assistant can list, search and read the files, quote them with
   numbered references, and fill a spreadsheet/CSV template (a copy).
   Nothing here shows when the new look is off: CSS is scoped under
   #panel-nl-notebook and the side panel's html.nl.
   Design rules: docs/LS-DESIGN.md.                                       */
(function(){
  'use strict';
  if(!window.NLP) return;
  const P = 'nl-notebook', H = NLP.h;
  const LIB = {
    xlsx:'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    pdf:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    mammoth:'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  };
  const BUCKET = 'horizon-files';
  const DB_NAME = 'horizon-notebook';
  const LS_SYNC = 'horizon-notebook:sync';
  const LS_SEEN = 'horizon-notebook:seen-reports';
  const ACCEPT = '.pdf,.docx,.doc,.xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.md,.markdown,image/*';
  const KIND_LABEL = { pdf:'PDF', word:'Word', sheet:'Spreadsheet', csv:'CSV', text:'Text', image:'Picture', olddoc:'Old Word file', other:'File' };
  const dots = '<span class="nl-dots" aria-hidden="true"><i></i><i></i><i></i></span>';

  // ── Small helpers ────────────────────────────────────────────────────────
  const files = () => { if(typeof state === 'undefined') return []; if(!Array.isArray(state.nlFiles)) state.nlFiles = []; return state.nlFiles; };
  const fileById = id => files().find(f => f.id === id) || null;
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const dayLabel = when => {
    const d = new Date(typeof when === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(when) ? when + 'T12:00:00' : when);
    if(isNaN(d)) return '';
    const t = new Date(); const diff = Math.round((new Date(t.toDateString()) - new Date(d.toDateString())) / 864e5);
    if(diff === 0) return 'Today';
    if(diff === 1) return 'Yesterday';
    return d.toLocaleDateString('en-GB', d.getFullYear() === t.getFullYear() ? { day:'numeric', month:'short' } : { day:'numeric', month:'short', year:'numeric' });
  };
  const monthName = (d) => (d || new Date()).toLocaleString('en-GB', { month:'long', year:'numeric' });
  const sizeLabel = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
  const short = (n, k) => cut(String(n || '').replace(/\.[a-z0-9]{2,5}$/i, ''), k);
  const persist = () => { if(typeof save === 'function') save(); };
  const ui = () => NLP.ui(P);
  const isHere = () => NLP.isOn() && typeof state !== 'undefined' && state.activePanel === P;
  const redraw = () => { if(isHere()) NLP.renderPage(P); else NLP.refreshPanel(); };
  const lsGet = k => { try { return localStorage.getItem(k); } catch(_){ return null; } };
  const lsSet = (k, v) => { try { if(v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch(_){} };

  // One-step undo for changes the person makes here (notes, removing files).
  // The shared History/Undo only covers the plan's numbers, so this page
  // keeps its own copy of what it changes.
  function change(label, mutate, after){
    const before = { journal:clone(state.journal), nlFiles:clone(state.nlFiles), nlNoteDraft:clone(state.nlNoteDraft) };
    mutate(state); persist(); redraw();
    NLP.toast(label + ' · saved', '', { label:'Undo', fn:() => {
      Object.keys(before).forEach(k => { if(before[k] === undefined) delete state[k]; else state[k] = before[k]; });
      persist(); redraw(); NLP.toast('Undone');
    } });
    if(after) after();
  }

  // ── IndexedDB: the files themselves and the words read from them ─────────
  let dbP = null;
  function db(){
    if(dbP) return dbP;
    dbP = new Promise((res, rej) => {
      if(!window.indexedDB) return rej(new Error('This browser can’t keep files.'));
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { const d = r.result; if(!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath:'id' }); if(!d.objectStoreNames.contains('filled')) d.createObjectStore('filled', { keyPath:'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }).catch(e => { dbP = null; throw e; });
    return dbP;
  }
  const tx = (store, mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }));
  const idbGet = (store, id) => tx(store, 'readonly', s => s.get(id));
  const idbPut = (store, v) => tx(store, 'readwrite', s => s.put(v));
  const idbDel = (store, id) => tx(store, 'readwrite', s => s.delete(id));
  const idbAll = store => tx(store, 'readonly', s => s.getAll());

  // In memory: what this device holds. local[id] = { chunks, sheets }
  const local = {};
  const filled = {};        // filled copies on this device: id → { name, at, count }
  const fetching = {};      // id → true while downloading from the cloud
  let ready = false;        // IndexedDB has been read once

  // ── Loading the readers on demand ─────────────────────────────────────────
  const libP = {};
  function loadScript(url){
    if(libP[url]) return libP[url];
    libP[url] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = url; s.async = true; s.crossOrigin = 'anonymous';
      const timer = setTimeout(() => rej(new Error('timeout')), 25000);
      s.onload = () => { clearTimeout(timer); res(); };
      s.onerror = () => { clearTimeout(timer); rej(new Error('could not load')); };
      document.head.appendChild(s);
    }).catch(e => { delete libP[url]; throw e; });
    return libP[url];
  }
  async function needXLSX(){ if(!window.XLSX) await loadScript(LIB.xlsx); if(!window.XLSX) throw new Error('no reader'); return window.XLSX; }
  async function needPDF(){ if(!window.pdfjsLib) await loadScript(LIB.pdf); const L = window.pdfjsLib; if(!L) throw new Error('no reader'); L.GlobalWorkerOptions.workerSrc = LIB.pdfWorker; return L; }
  async function needMammoth(){ if(!window.mammoth) await loadScript(LIB.mammoth); if(!window.mammoth) throw new Error('no reader'); return window.mammoth; }

  // ── Reading a file into passages, each with its place ─────────────────────
  // chunk = { t:text, w:'page 2' | 'row 4' | 'paragraph 3' | 'line 7', n:number, s?:sheet, cells?:[] }
  function kindOf(name, type){
    const n = String(name || '').toLowerCase(), t = String(type || '');
    if(/\.pdf$/.test(n) || t === 'application/pdf') return 'pdf';
    if(/\.docx$/.test(n)) return 'word';
    if(/\.(xlsx|xls|xlsm|ods)$/.test(n)) return 'sheet';
    if(/\.(csv|tsv)$/.test(n) || t === 'text/csv') return 'csv';
    if(/\.(txt|md|markdown)$/.test(n) || t.startsWith('text/')) return 'text';
    if(t.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/.test(n)) return 'image';
    if(/\.doc$/.test(n)) return 'olddoc';
    return 'other';
  }
  function parseCSV(text){
    const first = (text.split(/\r?\n/).find(l => l.trim()) || '');
    const cnt = c => (first.match(new RegExp('\\' + c, 'g')) || []).length;
    const d = cnt('\t') > cnt(',') && cnt('\t') >= cnt(';') ? '\t' : (cnt(';') > cnt(',') ? ';' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for(let i = 0; i < text.length; i++){
      const ch = text[i];
      if(q){ if(ch === '"'){ if(text[i+1] === '"'){ cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if(ch === '"' && cell === '') { q = true; continue; }
      if(ch === d){ row.push(cell); cell = ''; continue; }
      if(ch === '\n' || ch === '\r'){ if(ch === '\r' && text[i+1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; continue; }
      cell += ch;
    }
    if(cell !== '' || row.length){ row.push(cell); rows.push(row); }
    return { rows, delim:d };
  }
  const csvOut = (rows, d) => rows.map(r => r.map(c => { c = c == null ? '' : String(c); return /["\n\r]/.test(c) || c.includes(d) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(d)).join('\n');
  const rowText = cells => cells.map(c => String(c == null ? '' : c).trim()).filter(Boolean).join(' · ');
  function rowsToChunks(rows, sheet, startRow){
    const out = [];
    rows.forEach((cells, i) => { const t = rowText(cells); if(t) out.push({ t, w:(sheet ? sheet + ', ' : '') + 'row ' + (startRow + i), n:startRow + i, s:sheet || undefined, cells:cells.map(c => c == null ? '' : String(c)) }); });
    return out;
  }
  function linesToChunks(text, unit){
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n'), out = [];
    if(unit === 'paragraph'){ let n = 0; text.split(/\n\s*\n|\n/).forEach(p => { const t = p.replace(/\s+/g, ' ').trim(); if(t){ n++; out.push({ t, w:'paragraph ' + n, n }); } }); return out; }
    lines.forEach((l, i) => { const t = l.replace(/\s+/g, ' ').trim(); if(t) out.push({ t, w:'line ' + (i + 1), n:i + 1 }); });
    return out;
  }
  async function extract(kind, blob){
    if(kind === 'text') return { chunks:linesToChunks(await blob.text(), 'line') };
    if(kind === 'csv'){ const { rows } = parseCSV(await blob.text()); return { chunks:rowsToChunks(rows, '', 1), rows:rows.length }; }
    if(kind === 'sheet'){
      const X = await needXLSX();
      const wb = X.read(new Uint8Array(await blob.arrayBuffer()), { type:'array' });
      let chunks = [], rows = 0; const sheets = [];
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name]; if(!ws || !ws['!ref']) return;
        const r = X.utils.decode_range(ws['!ref']);
        const aoa = X.utils.sheet_to_json(ws, { header:1, raw:false, defval:'', blankrows:true });
        const c = rowsToChunks(aoa, wb.SheetNames.length > 1 ? name : '', r.s.r + 1);
        if(c.length){ sheets.push({ name, rows:c.length }); chunks = chunks.concat(c.map(x => Object.assign(x, { s:name }))); rows += c.length; }
      });
      return { chunks, rows, sheets };
    }
    if(kind === 'pdf'){
      const L = await needPDF();
      const doc = await L.getDocument({ data:new Uint8Array(await blob.arrayBuffer()) }).promise;
      const chunks = [];
      for(let p = 1; p <= doc.numPages; p++){
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        let text = '', lastY = null;
        tc.items.forEach(it => { const y = it.transform ? it.transform[5] : null; if(lastY != null && y != null && Math.abs(y - lastY) > 2 && !/\n$/.test(text)) text += '\n'; text += (it.str || '') + (it.hasEOL ? '\n' : ' '); if(y != null) lastY = y; });
        let buf = '';
        const flush = () => { const t = buf.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(); if(t) chunks.push({ t, w:'page ' + p, n:p }); buf = ''; };
        text.split('\n').forEach(line => { if(!line.trim()){ if(buf.length > 80) flush(); return; } buf += (buf ? '\n' : '') + line.trim(); if(buf.length > 320) flush(); });
        flush();
      }
      return { chunks, pages:doc.numPages };
    }
    if(kind === 'word'){
      const M = await needMammoth();
      const r = await M.extractRawText({ arrayBuffer:await blob.arrayBuffer() });
      const chunks = linesToChunks(r.value || '', 'paragraph');
      return { chunks, paras:chunks.length };
    }
    return { chunks:[] };
  }
  // The key line: the most informative short line (numbers, money words, dates).
  function lineScore(s){
    s = s.trim(); if(s.length < 12) return -9;
    let k = 0;
    if(/\d/.test(s)) k += 2;
    if(/\d[\d\s.,]{2,}/.test(s)) k += 2;
    if(/(\bkr\b|\bsek\b|\beur\b|\busd\b|€|\$|%|a month|per month|\/mån|månad)/i.test(s)) k += 2;
    if(/\b(total|pension|interest|rate|fixed|monthly|amount|budget|balance|salary|income|rent|due|until|expire|expires|deadline|premium|loan|mortgage|summa|ränta|lön|avgift|skatt|tax)\b/i.test(s)) k += 3;
    if(s.length >= 25 && s.length <= 160) k += 2;
    if(s.length > 220) k -= 2;
    if(s === s.toUpperCase() && /[A-Z]/.test(s)) k -= 2;
    return k;
  }
  const bestLine = t => String(t || '').split('\n').reduce((b, l) => lineScore(l) > lineScore(b) ? l : b, String(t || '').split('\n')[0] || '');
  function keyOf(chunks){
    let best = null;
    chunks.slice(0, 4000).forEach((c, i) => {
      const parts = c.t.split('\n').flatMap(l => l.length > 180 ? l.split(/(?<=[.!?])\s+/) : [l]);
      parts.forEach(p => { const sc = lineScore(p) - i * 0.002; if(!best || sc > best.sc) best = { sc, line:p, c:i }; });
    });
    return best && best.sc > 0 ? { keyLine:cut(best.line, 140), keyChunk:best.c } : (chunks[0] ? { keyLine:cut(chunks[0].t, 140), keyChunk:0 } : { keyLine:'', keyChunk:null });
  }
  // A template: a sheet whose label rows leave cells to fill.
  function looksLikeTemplate(name, chunks){
    if(/template|mall|blank|form|blankett/i.test(name)) return true;
    const rows = chunks.filter(c => c.cells); if(rows.length < 4) return false;
    const width = Math.max(...rows.slice(0, 3).map(r => r.cells.length));
    const open = rows.slice(1).filter(r => r.cells[0] && String(r.cells[0]).trim() && r.cells.slice(1, Math.max(2, width)).some(c => !String(c || '').trim())).length;
    return width >= 2 && open >= 3 && open / (rows.length - 1) >= 0.4;
  }

  const busyRead = {};
  async function readFile(meta, blob){
    if(busyRead[meta.id]) return; busyRead[meta.id] = true;
    try { await readFile2(meta, blob); } finally { delete busyRead[meta.id]; }
  }
  async function readFile2(meta, blob){
    meta.status = 'reading'; delete meta.why; delete meta.libFail;
    redraw();
    let r;
    try {
      if(meta.kind === 'image'){ r = { chunks:[] }; meta.status = 'cant'; meta.why = 'A picture is kept safe, but Horizon can’t read words in pictures yet.'; }
      else if(meta.kind === 'olddoc' || meta.kind === 'other'){ r = { chunks:[] }; meta.status = 'cant'; meta.why = meta.kind === 'olddoc' ? 'Old Word files (.doc) can’t be read yet. Save it as .docx or PDF and add it again.' : 'Horizon can’t read this kind of file yet.'; }
      else {
        r = await extract(meta.kind, blob);
        if(!r.chunks.length){ meta.status = 'cant'; meta.why = meta.kind === 'pdf' ? 'This PDF looks like a picture of text. Horizon can’t read pictures yet.' : 'No words were found in this file.'; }
        else meta.status = 'read';
      }
    } catch(err){
      r = { chunks:[] };
      meta.status = 'cant';
      const lib = /no reader|could not load|timeout/i.test(err && err.message || '');
      meta.libFail = lib;
      meta.why = lib ? 'The reader for this kind of file couldn’t load (no internet?). The file is kept; try again later.' : 'This file couldn’t be read. It may be damaged or protected by a password.';
    }
    const chunks = r.chunks || [];
    local[meta.id] = { chunks, sheets:r.sheets || null };
    const firstSheet = r.sheets && r.sheets[0] ? chunks.filter(c => c.s === r.sheets[0].name) : chunks;
    const k0 = keyOf(firstSheet), k = { keyLine:k0.keyLine, keyChunk:k0.keyChunk == null ? null : chunks.indexOf(firstSheet[k0.keyChunk]) };
    meta.keyLine = k.keyLine; meta.keyChunk = k.keyChunk;
    meta.pages = r.pages || undefined; meta.rows = r.rows || undefined; meta.paras = r.paras || (meta.kind === 'text' ? chunks.length : undefined);
    meta.sheets = r.sheets ? r.sheets.length : undefined;
    meta.template = (meta.kind === 'sheet' || meta.kind === 'csv') && looksLikeTemplate(meta.name, firstSheet);
    meta.blanks = meta.template ? firstSheet.filter((c, i) => i > 0 && c.cells && String(c.cells[0] || '').trim() && !String(c.cells[1] || '').trim()).length : undefined;
    try { const rec = await idbGet('files', meta.id); if(rec){ rec.chunks = chunks; rec.sheets = r.sheets || null; await idbPut('files', rec); } } catch(_){}
    persist(); redraw();
  }

  async function addFiles(list){
    const arr = Array.from(list || []).filter(f => f && f.size >= 0);
    if(!arr.length) return;
    for(const f of arr){
      const meta = { id:newId(), name:f.name || 'File', kind:kindOf(f.name, f.type), size:f.size, addedAt:Date.now(), status:'reading' };
      files().unshift(meta);
      let kept = true;
      try { await idbPut('files', { id:meta.id, blob:f, name:meta.name, type:f.type || '', chunks:[] }); local[meta.id] = { chunks:[] }; }
      catch(_){ kept = false; meta.status = 'cant'; meta.why = 'This browser couldn’t keep the file.'; }
      ui().tab = 'files'; ui().chosen = meta.id; ui().open = null;
      persist(); redraw();
      if(kept){ readFile(meta, f); upload(meta, f); }
    }
    NLP.toast(arr.length === 1 ? 'Added ' + cut(arr[0].name, 40) : 'Added ' + arr.length + ' files');
  }

  // ── Sync through the person's own Supabase project (never blocks) ───────
  let syncIssue = lsGet(LS_SYNC) || null;   // null | 'nobucket' | 'policy' | 'network'
  const setIssue = v => { if(syncIssue === v) return; syncIssue = v; lsSet(LS_SYNC, v); NLP.refreshPanel(); };
  const syncOn = () => { try { return typeof syncConfigured === 'function' && syncConfigured() && typeof HZCloud !== 'undefined'; } catch(_){ return false; } };
  async function cloud(){
    if(!syncOn()) return null;
    try { const u = await HZCloud.user(); if(!u) return null; const c = await HZCloud.client(); return c && c.storage ? { c, u } : null; }
    catch(_){ return null; }
  }
  const safeName = n => String(n || 'file').replace(/[^\w.\- ()]+/g, '_').slice(0, 120);
  const classify = err => { const m = String(err && (err.message || err.error || err.statusCode) || err || ''); if(/bucket not found|not.?found|404/i.test(m)) return 'nobucket'; if(/row-level|policy|unauthori[sz]ed|403|permission/i.test(m)) return 'policy'; return 'network'; };
  async function upload(meta, blob){
    if(!meta || meta.remotePath) return;
    const cl = await cloud(); if(!cl) return;
    const path = `${cl.u.id}/${meta.id}/${safeName(meta.name)}`;
    try {
      const { error } = await cl.c.storage.from(BUCKET).upload(path, blob, { upsert:true, contentType:blob.type || 'application/octet-stream' });
      if(error) throw error;
      const m = fileById(meta.id); if(m){ m.remotePath = path; persist(); }
      setIssue(null);
    } catch(err){ setIssue(classify(err)); }
  }
  let backfilling = false;
  async function backfill(){
    if(backfilling || !ready || !syncOn()) return;
    backfilling = true;
    try {
      for(const m of files().filter(f => !f.remotePath && local[f.id])){
        const rec = await idbGet('files', m.id).catch(() => null);
        if(rec && rec.blob){ await upload(m, rec.blob); if(syncIssue && syncIssue !== 'network') break; }
      }
    } finally { backfilling = false; }
  }
  async function fetchRemote(id){
    const m = fileById(id); if(!m || !m.remotePath || fetching[id]) return false;
    fetching[id] = true; redraw();
    let ok = false;
    try {
      const cl = await cloud();
      if(!cl) throw new Error(syncOn() ? 'Sign in to sync to fetch this file.' : 'Turn on sync in Settings to fetch this file.');
      const { data, error } = await cl.c.storage.from(BUCKET).download(m.remotePath);
      if(error || !data) throw error || new Error('empty');
      await idbPut('files', { id:m.id, blob:data, name:m.name, type:data.type || '', chunks:[] }).catch(() => {});
      local[m.id] = { chunks:[] };
      const r = await extract(m.kind, data).catch(() => ({ chunks:[] }));
      local[m.id] = { chunks:r.chunks || [], sheets:r.sheets || null };
      const rec = await idbGet('files', m.id).catch(() => null);
      if(rec){ rec.chunks = local[m.id].chunks; rec.sheets = local[m.id].sheets; await idbPut('files', rec).catch(() => {}); }
      setIssue(null); ok = true;
    } catch(err){
      NLP.toast('Couldn’t fetch ' + cut(m.name, 40) + ': ' + (err && err.message && err.message.length < 80 ? err.message : 'the file isn’t reachable right now.'), 'warn');
    }
    delete fetching[id]; redraw();
    return ok;
  }
  async function blobOf(id){
    const rec = await idbGet('files', id).catch(() => null);
    if(rec && rec.blob) return rec.blob;
    if(await fetchRemote(id)){ const r2 = await idbGet('files', id).catch(() => null); return r2 && r2.blob; }
    return null;
  }

  // ── What a row is, in one word ────────────────────────────────────────────
  function usedInPlan(m){
    const props = state.nl && state.nl.proposals ? Object.values(state.nl.proposals) : [];
    const nm = String(m.name || '').toLowerCase(), base = nm.replace(/\.[a-z0-9]+$/, '');
    return props.some(p => p.status === 'applied' && [p.summary, p.ask].concat((p.changes || []).map(c => c.why)).some(t => { t = String(t || '').toLowerCase(); return t && (t.includes(nm) || (base.length > 4 && t.includes(base))); }));
  }
  function statusOf(m){
    if(fetching[m.id]) return { key:'fetching', text:'Fetching', kind:'grey', moving:true };
    const here = !ready || !!local[m.id];
    if(!here){
      if(m.remotePath) return { key:'elsewhere', text:'On another device', kind:'steel', hint:'press it again to fetch' };
      return { key:'notsynced', text:'Not synced', kind:'amber', hint:'kept on the device it was added on' };
    }
    if(m.status === 'reading') return { key:'reading', text:'Reading', kind:'grey', moving:true };
    if(m.status === 'cant') return { key:'cant', text:'Can’t read yet', kind:'amber' };
    if(usedInPlan(m)) return { key:'used', text:'Used in your plan', kind:'green' };
    if(m.template) return { key:'template', text:'Template', kind:'steel' };
    return { key:'read', text:'Read', kind:'grey' };
  }
  const badgeHtml = s => `<span class="nl-b ${s.kind}">${H(s.text)}${s.moving ? dots : ''}</span>`;
  function sizeWords(m){
    if(m.pages) return plural(m.pages, 'page');
    if(m.rows) return plural(m.rows, 'row') + (m.sheets > 1 ? ' in ' + m.sheets + ' sheets' : '');
    if(m.paras) return plural(m.paras, m.kind === 'text' ? 'line' : 'paragraph');
    return sizeLabel(m.size || 0);
  }
  // The side panel never shows money: amounts inside quotes are left out with “…”.
  const MONEY = /(?:(?:kr|sek|eur|usd|kes|€|\$|£)\s?\d[\d\s.,]*\d|\d(?:[\d\s.,]*\d)?\s?(?:kr|sek|eur|usd|kes|kronor|euro|€|\$|£|k\b|m\b))/gi;
  const noMoney = (s, sheet) => { let t = String(s || '').replace(MONEY, '…'); if(sheet) t = t.replace(/\b(?!(?:19|20)\d\d\b)\d[\d\s.,]{2,}\d\b|\b\d{3,}\b/g, m => /^(19|20)\d\d$/.test(m) ? m : '…'); return t.replace(/…(\s*…)+/g, '…'); };
  const pq = (s, n, sheet) => NLP.quote(cut(noMoney(s, sheet), n));
  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const chunkAt = (id, i) => { const L = local[id]; return L && L.chunks && i != null ? L.chunks[i] : null; };

  // ── Reference numbers the assistant quotes: [n] → file + passage ─────────
  function refs(){ if(!state.nlRefs || typeof state.nlRefs !== 'object' || !state.nlRefs.map) state.nlRefs = { next:1, map:{}, key:{} }; return state.nlRefs; }
  function refFor(fid, ci){
    const R = refs(), k = fid + ':' + ci;
    if(R.key[k]) return R.key[k];
    const n = R.next++; R.key[k] = n;
    const c = chunkAt(fid, ci);
    R.map[n] = { f:fid, c:ci, w:c ? c.w : '' };
    const nums = Object.keys(R.map).map(Number).sort((a, b) => a - b);
    while(nums.length > 400){ const old = nums.shift(); const o = R.map[old]; if(o) delete R.key[o.f + ':' + o.c]; delete R.map[old]; }
    return n;
  }
  const refInfo = n => { const R = state.nlRefs; return R && R.map ? R.map[n] || null : null; };
  // Passages the assistant cited in its latest answer, per file.
  function citedLast(){
    const chat = state.nl && Array.isArray(state.nl.chat) ? state.nl.chat : [];
    const last = [...chat].reverse().find(m => m.role === 'assistant' && !m.kind);
    const out = {};
    if(!last) return out;
    // Remember the quoted words just before each [n], to mark only those lines.
    String(last.content || '').replace(/(?:[“"]([^”"]{3,400})[”"]\s*)?\[(\d{1,4})\]/g, (_, q, n) => { const r = refInfo(+n); if(r){ const m = out[r.f] = out[r.f] || new Map(); m.set(r.c, q || m.get(r.c) || null); } return ''; });
    return out;
  }

  // ── Actions (global for onclick) ──────────────────────────────────────────
  const NBK = window.NBK = {};
  NBK.pick = function(){
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = ACCEPT; i.style.display = 'none';
    i.addEventListener('change', () => { addFiles(i.files); i.remove(); });
    document.body.appendChild(i); i.click();
    setTimeout(() => { if(document.body.contains(i) && !i.files.length) i.remove(); }, 60000);
  };
  NBK.openFile = function(id, chunk){
    const m = fileById(id); if(!m) return;
    const st = ui(); st.tab = 'files'; st.chosen = id; st.open = id; st.focus = chunk != null ? +chunk : null; st.scroll = true;
    const L = local[id];
    st.focusQuote = chunk != null && L && L.chunks[chunk] ? bestLine(L.chunks[chunk].t) : null; st.sheet = (chunk != null && L && L.chunks[chunk] && L.chunks[chunk].s) || (L && L.sheets && L.sheets[0] && L.sheets[0].name) || null;
    if(state.activePanel !== P) NLP.go(P); else NLP.renderPage(P);
    if(ready && !local[id] && m.remotePath) fetchRemote(id);
  };
  NBK.cite = function(n){ const r = refInfo(+n); if(!r || !fileById(r.f)){ NLP.toast('That file is no longer in your Notebook.', 'warn'); return; } NBK.openFile(r.f, r.c); };
  NBK.back = function(){ const st = ui(); st.open = null; st.focus = null; NLP.renderPage(P); };
  NBK.sheet = function(name){ const st = ui(); st.sheet = name; st.scroll = true; NLP.renderPage(P); };
  NBK.retry = async function(id){ const m = fileById(id); if(!m) return; const b = await blobOf(id); if(b) readFile(m, b); };
  NBK.fetch = id => fetchRemote(id);
  NBK.download = async function(id){
    const m = fileById(id); if(!m) return;
    const b = await blobOf(id); if(!b){ NLP.toast('The file isn’t on this device.', 'warn'); return; }
    saveBlob(b, m.name);
  };
  function saveBlob(b, name){
    const url = URL.createObjectURL(b), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  NBK.downloadFilled = async function(id){
    id = id || Object.keys(filled).sort((a, b) => filled[b].at - filled[a].at)[0];
    const rec = id && await idbGet('filled', id).catch(() => null);
    if(!rec || !rec.blob){ NLP.toast('No filled copy on this device yet.', 'warn'); return; }
    saveBlob(rec.blob, rec.name);
  };
  NBK.remove = function(id){
    const m = fileById(id); if(!m) return;
    const st = ui(); if(st.chosen === id) st.chosen = null; if(st.open === id) st.open = null;
    change('Removed ' + cut(m.name, 36), s => { s.nlFiles = files().filter(f => f.id !== id); });
    // The file itself goes once the Undo moment has passed.
    setTimeout(async () => {
      if(fileById(id)) return;
      try { await idbDel('files', id); await idbDel('filled', id); } catch(_){}
      delete local[id]; delete filled[id];
      if(m.remotePath){ const cl = await cloud(); if(cl) try { await cl.c.storage.from(BUCKET).remove([m.remotePath]); } catch(_){} }
    }, 9000);
  };
  NBK.fill = id => { const m = fileById(id); if(m) NLP.ask('Fill ' + m.name + ' with my plan'); };
  NBK.fillAny = () => { const t = files().find(f => f.template && local[f.id] && f.status === 'read') || files().find(f => (f.kind === 'sheet' || f.kind === 'csv')); if(t) NBK.fill(t.id); };
  NBK.askAbout = id => { const m = fileById(id); if(m) NLP.ask('What does ' + m.name + ' say that matters for my plan?'); };
  NBK.filter = function(k){ const st = ui(); st.filter = st.filter === k ? null : k; st.chosen = null; NLP.renderPage(P); };
  NBK.setupHelp = () => NLP.toast('Run the short SQL in SYNC-SETUP.md, “Notebook files”, once in Supabase.');

  // Notes
  NBK.newNote = function(){ const st = ui(); st.tab = 'notes'; st.open = 'new'; st.chosen = 'new'; st.editTag = ''; st.editFor = 'new'; st.scroll = true; clearEditor(); NLP.renderPage(P); setTimeout(() => document.getElementById('nb-n-body')?.focus(), 30); };
  function clearEditor(){ ['nb-n-title','nb-n-body','nb-n-date'].forEach(id => { const e = document.getElementById(id); if(e) e.remove(); }); }
  NBK.openNote = function(id){ const st = ui(); st.tab = 'notes'; st.open = id; st.chosen = id; st.scroll = true; const e = noteById(id); st.editTag = e ? (e.tag || '') : ''; st.editFor = id; clearEditor(); if(state.activePanel !== P) NLP.go(P); else NLP.renderPage(P); };
  NBK.tag = function(t){ ui().editTag = t; NLP.renderPage(P); };
  NBK.saveNote = function(){
    const st = ui(), id = st.open; if(!id) return;
    const v = k => (document.getElementById(k) || {}).value || '';
    const title = v('nb-n-title').trim(), content = v('nb-n-body').trim(), date = /^\d{4}-\d{2}-\d{2}$/.test(v('nb-n-date')) ? v('nb-n-date') : todayIso();
    if(!content && !title){ NLP.toast('Write something first.', 'warn'); return; }
    const now = Date.now();
    let newId2 = null;
    change(id === 'new' || id === 'draft' ? 'Note saved' : 'Note changed', s => {
      if(!Array.isArray(s.journal)) s.journal = [];
      if(id === 'new' || id === 'draft'){
        newId2 = (typeof genId === 'function' ? genId() : 'n' + now.toString(36));
        const e = { id:newId2, date, tag:st.editTag || '', content:content || title, createdAt:now, updatedAt:now };
        if(title) e.title = title;
        s.journal.push(e);
        if(id === 'draft') delete s.nlNoteDraft;
      } else {
        const e = s.journal.find(x => x.id === id); if(!e) return;
        e.date = date; e.tag = st.editTag || ''; e.content = content || title; e.updatedAt = now;
        if(title) e.title = title; else delete e.title;
      }
    });
    st.open = null; st.chosen = newId2 || id; clearEditor(); NLP.renderPage(P);
  };
  NBK.deleteNote = function(id){
    const st = ui(); st.open = null; st.chosen = null; clearEditor();
    if(id === 'draft'){ change('Draft dropped', s => { delete s.nlNoteDraft; }); return; }
    change('Note deleted', s => { s.journal = (s.journal || []).filter(x => x.id !== id); });
  };
  NBK.draftMonth = () => NLP.ask('Draft a short journal note for ' + monthName() + ' from my numbers');

  // Reports
  NBK.openReport = function(id, sec){ const st = ui(); st.tab = 'reports'; st.open = id; st.chosen = id; st.section = sec == null ? null : +sec; st.scroll = true; markSeen(id); if(state.activePanel !== P) NLP.go(P); else NLP.renderPage(P); };
  const seen = () => { try { return JSON.parse(lsGet(LS_SEEN) || '[]'); } catch(_){ return []; } };
  const markSeen = id => { const s = seen(); if(!s.includes(id)){ s.push(id); lsSet(LS_SEEN, JSON.stringify(s.slice(-300))); } };

  // ── Data for Notes and Reports ────────────────────────────────────────────
  const notes = () => (Array.isArray(state.journal) ? state.journal.slice() : []).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || 0) - (a.updatedAt || 0));
  const noteById = id => id === 'draft' ? (state.nlNoteDraft || null) : (state.journal || []).find(x => x.id === id) || null;
  const TAGS = { '':'None', event:'Event', decision:'Decision', reflection:'Reflection' };
  const firstLine = s => (String(s || '').split('\n').find(l => l.trim()) || '').trim();
  const noteName = e => e.title ? e.title : 'Note, ' + dayLabel(e.date || Date.now()).replace(/^Today$/, 'today').replace(/^Yesterday$/, 'yesterday');
  const noteQuote = e => { const lines = String(e.content || '').split('\n').map(l => l.trim()).filter(Boolean); return e.title ? lines[0] || '' : (lines[0] || ''); };

  function reports(){
    const raw = Array.isArray(state.vault) ? state.vault : [];
    return raw.map(v => {
      const n = typeof _vaultNormalise === 'function' ? _vaultNormalise(v) : { id:v.id, kind:v.type, title:v.title || v.location || 'Report', when:v.date || v.generatedAt, markdown:v.markdown || '', category:v.category };
      const kind = n.kind === 'deepdive' ? 'Deep dive' : n.kind === 'piq' ? 'Property report' : n.category === 'spend-insights' ? 'Spend insights' : n.kind === 'analysis' ? 'Monthly analysis' : 'Report';
      const when = typeof n.when === 'number' ? n.when : Date.parse(n.when) || 0;
      return { id:String(n.id), title:n.title || 'Report', kind, when, md:String(n.markdown || ''), raw:v };
    }).filter(r => !/^transient-/.test(r.id)).sort((a, b) => b.when - a.when);
  }
  const stripMd = s => String(s || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#>|~]/g, '').replace(/\s+/g, ' ').trim();
  const mdLines = md => String(md || '').split('\n').map(l => l.trim()).filter(l => l && !/^```/.test(l) && !/^[-*_]{3,}$/.test(l) && !/^\|?[\s:\-|]+\|?$/.test(l));
  const reportFirst = r => { const l = mdLines(r.md).find(x => !/^#/.test(x) && stripMd(x).length > 20); return l ? cut(stripMd(l), 120) : ''; };
  const reportHeads = r => mdLines(r.md).filter(l => /^#{1,4}\s/.test(l)).map(l => stripMd(l));
  function reportKeyLines(r){
    const ls = mdLines(r.md).filter(l => !/^#/.test(l));
    const strong = ls.filter(l => /\*\*[^*]{6,}\*\*/.test(l) || /^[-*•]\s/.test(l)).map(stripMd).filter(s => s.length > 20);
    const pool = strong.length >= 2 ? strong : ls.map(stripMd).filter(s => s.length > 30);
    return pool.slice(0, 3).map(s => cut(s.replace(/^[-•]\s*/, ''), 110));
  }

  // ── Drawing the page ──────────────────────────────────────────────────────
  function tabs(tab){
    const n = notes().length + (state.nlNoteDraft ? 1 : 0);
    return [
      { key:'files', label:'Files', count:files().length, on:tab === 'files', keep:true },
      { key:'notes', label:'Notes', count:n, on:tab === 'notes', keep:true },
      { key:'reports', label:'Reports', count:reports().length, on:tab === 'reports' },
    ];
  }
  function render(host){
    const st = ui(), tab = NLP.tabOf(P, 'files');
    if(!['files','notes','reports'].includes(tab)) st.tab = 'files';
    let html;
    if(tab === 'files') html = st.open && fileById(st.open) ? fileView(fileById(st.open)) : filesList();
    else if(tab === 'notes') html = st.open && (st.open === 'new' || noteById(st.open)) ? noteEditor(st.open) : notesList();
    else html = st.open && reports().find(r => r.id === st.open) ? reportView(reports().find(r => r.id === st.open)) : reportsList();
    host.innerHTML = `<div class="nl-wrap nb-wrap">${html}</div>`;
    const tbl = host.querySelector('[data-nb-rows]');
    if(tbl) NLP.rows(tbl, P, id => {
      if(tab === 'files') NBK.openFile(id);
      else if(tab === 'notes') NBK.openNote(id);
      else NBK.openReport(id);
    });
    host.querySelectorAll('[data-nb-cite]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); NBK.openFile(b.dataset.nbCite, b.dataset.c === '' ? null : +b.dataset.c); }));
    const drop = host.querySelector('.nb-drop');
    if(drop && !host._nbDrop){
      host._nbDrop = true;
      host.addEventListener('dragover', e => { if(NLP.tabOf(P, 'files') !== 'files' || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); host.querySelector('.nb-drop')?.classList.add('over'); });
      host.addEventListener('dragleave', e => { if(e.target === host || !host.contains(e.relatedTarget)) host.querySelector('.nb-drop')?.classList.remove('over'); });
      host.addEventListener('drop', e => { if(NLP.tabOf(P, 'files') !== 'files' || !e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); host.querySelector('.nb-drop')?.classList.remove('over'); addFiles(e.dataTransfer.files); });
    }
    if(st.scroll){
      st.scroll = false;
      setTimeout(() => {
        const content = document.querySelector('#app .content');
        const target = host.querySelector('mark.focus, tr.focus') || (st.section != null && host.querySelector('#nb-h-' + st.section));
        if(target) target.scrollIntoView({ block:'center' }); else if(content) content.scrollTop = 0;
      }, 20);
    }
  }

  // Files list
  function filesList(){
    const st = ui(), all = files();
    const kinds = {}; all.forEach(f => { kinds[f.kind] = (kinds[f.kind] || 0) + 1; });
    const nTpl = all.filter(f => f.template).length;
    const filt = st.filter && (st.filter === 'template' ? nTpl : kinds[st.filter]) ? st.filter : null;
    const list = all.filter(f => !filt || (filt === 'template' ? f.template : f.kind === filt));
    const chips = (Object.keys(kinds).length > 1 || nTpl) && all.length > 1
      ? `<div class="nl-chips">${Object.keys(kinds).map(k => `<button type="button" class="nl-chip${filt === k ? ' on' : ''}" onclick="NBK.filter('${k}')">${filt === k ? '' : '+ '}${H(KIND_LABEL[k])} ${kinds[k]}</button>`).join('')}${nTpl ? `<button type="button" class="nl-chip${filt === 'template' ? ' on' : ''}" onclick="NBK.filter('template')">${filt === 'template' ? '' : '+ '}Templates ${nTpl}</button>` : ''}</div>` : '';
    const anyTpl = all.some(f => f.kind === 'sheet' || f.kind === 'csv');
    const actions = (anyTpl ? NLP.pill('Fill a template', 'NBK.fillAny()') : `<button type="button" class="nl-gp" disabled title="Add a spreadsheet or CSV template first">Fill a template</button>`) + NLP.pill('+ Upload', 'NBK.pick()');
    const drop = `<div class="nb-drop"><span>Drop files here: PDF, Word, Excel, CSV, text, photos of letters</span><button type="button" class="nl-link" onclick="NBK.pick()">Choose files</button></div>`;
    const rows = list.map((m, i) => {
      const s = statusOf(m);
      const quote = m.keyLine && s.key !== 'elsewhere' && s.key !== 'notsynced' ? ` · ${NLP.quote(m.keyLine)}<button type="button" class="nl-cite" data-nb-cite="${m.id}" data-c="${m.keyChunk == null ? '' : m.keyChunk}" title="${H(chunkAt(m.id, m.keyChunk) ? 'Open at ' + chunkAt(m.id, m.keyChunk).w : 'Open the file')}">${all.indexOf(m) + 1}</button>`
        : (m.keyLine ? ` · ${NLP.quote(m.keyLine)}` : '');
      const hint = s.hint ? ` · ${H(s.hint)}` : '';
      return `<tr data-nl-row="${m.id}"><td class="mk">${all.indexOf(m) + 1}</td><td><span class="nm">${H(m.name)}</span><span class="sub">${H(KIND_LABEL[m.kind] || 'File')}${m.template ? ' template' : ''} · ${H(sizeWords(m))}${quote}${hint}</span></td><td>${badgeHtml(s)}</td><td class="r nb-when">${H(dayLabel(m.addedAt))}</td></tr>`;
    }).join('');
    const table = all.length
      ? `<div class="nl-tbl-wrap"><table class="nl-tbl nb-tbl" data-nb-rows><thead><tr><th></th><th>File, and the key words Horizon read in it</th><th>Status</th><th class="r">Added</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : NLP.empty('No files yet. Add a statement, a letter or a budget template, and Horizon reads it for you.', NLP.pill('Choose files', 'NBK.pick()'));
    return NLP.head({ title:'Notebook', tabs:tabs('files'), actions, panel:P }) + drop + chips + table;
  }

  // Files: the reading view (paper sheet)
  function fileView(m){
    const st = ui(), s = statusOf(m), L = local[m.id];
    const cited = citedLast()[m.id] || new Map();
    const isMarked = i => cited.has(i) || st.focus === i;
    let tabsH = [], body = '';
    const acts = NLP.pill('‹ Files', 'NBK.back()') + ((L || m.remotePath) ? NLP.pill('Download', `NBK.download('${m.id}')`) : '') + ((m.kind === 'sheet' || m.kind === 'csv') && L ? NLP.pill('Fill with my plan', `NBK.fill('${m.id}')`) : '');
    if(s.key === 'fetching') body = `<p class="nb-wait">Fetching ${H(m.name)} from your account ${dots}</p>`;
    else if(s.key === 'elsewhere') body = `<p class="nb-wait">This file was added on another device. ${NLP.link('Fetch it now', `NBK.fetch('${m.id}')`)}</p>`;
    else if(s.key === 'notsynced') body = `<p class="nb-wait">This file was added on another device and hasn’t synced yet. Open Horizon on that device with sync turned on, and it will follow.</p>`;
    else if(s.key === 'reading') body = `<p class="nb-wait">Reading ${H(m.name)} ${dots}</p>`;
    else if(m.kind === 'image') body = `<p class="nb-why">${H(m.why || 'A picture.')}</p><div class="nb-img" id="nb-img-${m.id}"></div>`;
    else if(!L || !L.chunks.length) body = `<p class="nb-why">${H(m.why || 'No words were read from this file.')}</p>${m.libFail ? NLP.link('Try reading it again', `NBK.retry('${m.id}')`) : ''}`;
    else if(m.kind === 'sheet' || m.kind === 'csv'){
      const sheets = L.sheets && L.sheets.length ? L.sheets : null;
      const cur = sheets ? (sheets.find(x => x.name === st.sheet) || sheets[0]).name : null;
      if(sheets && sheets.length > 1) tabsH = sheets.map(x => ({ key:x.name, label:'Sheet “' + x.name + '”', count:x.rows, on:x.name === cur, onclick:`NBK.sheet(${JSON.stringify(x.name)})` }));
      const rows = L.chunks.map((c, i) => ({ c, i })).filter(x => !cur || !sheets || x.c.s === cur);
      const width = Math.min(8, Math.max(1, ...rows.slice(0, 200).map(x => x.c.cells.length)));
      const shown = rows.slice(0, 1500);
      body = `<h5 class="nb-ph">${H(cur && sheets && sheets.length > 1 ? 'Sheet “' + cur + '”' : m.name)}</h5><table class="nb-sheet"><tbody>${shown.map(x => {
        const mk = isMarked(x.i);
        return `<tr id="nb-c-${x.i}" class="${mk ? 'hl' : ''}${st.focus === x.i ? ' focus' : ''}"><td class="rn">${x.c.n}</td>${Array.from({ length:width }, (_, k) => { const v = H(x.c.cells[k] || ''); return `<td${/^[-\d\s.,:%kr€$]+$/.test(x.c.cells[k] || '') ? ' class="r"' : ''}>${mk && v ? '<mark>' + v + '</mark>' : v}</td>`; }).join('')}</tr>`;
      }).join('')}</tbody></table>${rows.length > shown.length ? `<p class="nb-more">…${rows.length - shown.length} more rows</p>` : ''}${Math.max(...rows.slice(0, 200).map(x => x.c.cells.length)) > width ? `<p class="nb-more">Only the first ${width} columns are shown here.</p>` : ''}`;
    } else {
      let lastW = null;
      const shown = L.chunks.slice(0, 4000);
      body = shown.map((c, i) => {
        const pageHead = m.kind === 'pdf' && c.w !== lastW ? `<h5 class="nb-ph">${H(c.w.replace(/^page/, 'Page'))}</h5>` : '';
        lastW = c.w;
        const lines = c.t.split('\n');
        let on = null;
        if(isMarked(i)){
          const q = norm(cited.get(i) || (st.focus === i && st.focusQuote) || '');
          on = lines.map(l => { const n = norm(l); return !!q && !!n && (q.includes(n) || n.includes(q)); });
          if(!on.some(Boolean)) on = lines.map(() => true);
        }
        const t = lines.map((l, k) => on && on[k] ? `<mark class="${st.focus === i ? 'focus' : ''}">${H(l)}</mark>` : H(l)).join('<br>');
        return `${pageHead}<p id="nb-c-${i}">${t}</p>`;
      }).join('') + (L.chunks.length > shown.length ? `<p class="nb-more">…${L.chunks.length - shown.length} more passages</p>` : '');
    }
    if(m.kind === 'image') setTimeout(async () => { const box = document.getElementById('nb-img-' + m.id); if(!box || box.firstChild) return; const b = await blobOf(m.id); if(b && document.getElementById('nb-img-' + m.id)){ const u = URL.createObjectURL(b); box.innerHTML = `<img alt="${H(m.name)}" src="${u}">`; } }, 0);
    return NLP.head({ title:m.name, tabs:tabsH, actions:acts }) + `<div class="nl-sheet-page"><div class="nl-paper">${body}</div></div>`;
  }

  // Notes
  function notesList(){
    const list = notes(), d = state.nlNoteDraft;
    const rows = (d ? [`<tr data-nl-row="draft"><td class="mk">·</td><td><span class="nm">${H(d.title || 'Draft note')}</span><span class="sub">${NLP.quote(cut(firstLine(d.content), 150))}</span></td><td>${NLP.badge('Draft', 'amber')}</td><td class="r nb-when">${H(dayLabel(d.date || Date.now()))}</td></tr>`] : [])
      .concat(list.map((e, i) => `<tr data-nl-row="${H(e.id)}"><td class="mk">${i + 1}</td><td><span class="nm">${H(noteName(e))}</span><span class="sub">${noteQuote(e) ? NLP.quote(cut(noteQuote(e), 150)) : 'Empty note'}</span></td><td>${e.tag && TAGS[e.tag] ? NLP.badge(TAGS[e.tag], 'steel') : ''}</td><td class="r nb-when">${H(dayLabel(e.date))}</td></tr>`)).join('');
    const table = rows ? `<div class="nl-tbl-wrap"><table class="nl-tbl nb-tbl" data-nb-rows><thead><tr><th></th><th>Note</th><th>Tag</th><th class="r">Date</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : NLP.empty('No notes yet. Write down what you decided and why; it helps later.', NLP.pill('+ New note', 'NBK.newNote()'));
    return NLP.head({ title:'Notebook', tabs:tabs('notes'), actions:NLP.pill('+ New note', 'NBK.newNote()'), panel:P }) + table;
  }
  function noteEditor(id){
    const st = ui(), e = id === 'new' ? null : noteById(id);
    if(st.editFor !== id){ st.editFor = id; st.editTag = e ? (e.tag || '') : ''; }
    const title = id === 'new' ? 'New note' : id === 'draft' ? 'Draft note' : noteName(e);
    const acts = NLP.pill('‹ Notes', 'NBK.back()') + (id !== 'new' ? NLP.pill(id === 'draft' ? 'Drop draft' : 'Delete note', `NBK.deleteNote('${H(id)}')`) : '');
    const tagPills = Object.keys(TAGS).map(k => `<button type="button" class="nl-gp${(st.editTag || '') === k ? ' on' : ''}" aria-pressed="${(st.editTag || '') === k}" onclick="NBK.tag('${k}')">${TAGS[k]}</button>`).join('');
    return NLP.head({ title, tabs:[], actions:acts }) + `<div class="nb-editor">
      <div class="nl-field"><span class="lb">Date</span><input type="date" id="nb-n-date" value="${H(e && e.date || todayIso())}"><span></span></div>
      <div class="nl-field"><span class="lb">Title</span><input type="text" id="nb-n-title" placeholder="Optional, e.g. “Decided on Cape Town”" value="${H(e && e.title || '')}"><span></span></div>
      <div class="nl-field"><span class="lb">Tag</span><span class="nb-pills">${tagPills}</span><span></span></div>
      <div class="nl-field nb-body"><span class="lb">Note</span><textarea id="nb-n-body" rows="9" placeholder="What happened, what you decided, and why.">${H(e && e.content || '')}</textarea><span></span></div>
    </div>`;
  }

  // Reports
  function reportsList(){
    const list = reports(), s = seen(), wk = Date.now() - 14 * 864e5;
    const rows = list.map((r, i) => {
      const isNew = !s.includes(r.id) && r.when > wk;
      const q = reportFirst(r);
      return `<tr data-nl-row="${H(r.id)}"><td class="mk">${i + 1}</td><td><span class="nm">${H(r.title)}</span><span class="sub">${H(r.kind)}${q ? ' · ' + NLP.quote(q) : ''}</span></td><td>${NLP.badge(isNew ? 'New' : 'Read', isNew ? 'amber' : 'grey')}</td><td class="r nb-when">${H(dayLabel(r.when))}</td></tr>`;
    }).join('');
    const table = list.length ? `<div class="nl-tbl-wrap"><table class="nl-tbl nb-tbl" data-nb-rows><thead><tr><th></th><th>Report</th><th>Status</th><th class="r">Saved</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : NLP.empty('No saved reports yet. Deep dives on places and analyses of your plan are kept here when you save them.');
    return NLP.head({ title:'Notebook', tabs:tabs('reports'), panel:P }) + table;
  }
  function reportView(r){
    let body = typeof mdParse === 'function' ? mdParse(r.md) : r.md.split('\n').map(l => `<p>${H(l)}</p>`).join('');
    let k = 0; body = body.replace(/<h([1-4])(\s[^>]*)?>/g, (_, n, a) => `<h${n}${a || ''} id="nb-h-${k++}">`);
    return NLP.head({ title:r.title, tabs:[], actions:NLP.pill('‹ Reports', 'NBK.back()') }) + `<div class="nl-sheet-page"><div class="nl-paper nb-report"><p class="nb-meta">${H(r.kind)} · saved ${H(dayLabel(r.when))}</p>${body || '<p>This report is empty.</p>'}</div></div>`;
  }

  // ── The side panel's Overview ─────────────────────────────────────────────
  const cite = (fid, ci, n) => `<button type="button" class="nl-cite" onclick="NBK.openFile('${fid}',${ci == null ? 'null' : ci})" title="Open at these words">${n}</button>`;
  function syncRow(){
    const anyLocal = files().some(f => local[f.id]);
    if(!files().length) return null;
    if(!syncOn()) return { text:'Files stay on this device', badge:{ text:'Not synced', kind:'grey' }, why:'Turn on sync in Settings to see them on your other devices.' };
    if(syncIssue === 'nobucket' || syncIssue === 'policy') return { text:'Files can’t sync yet: file storage isn’t set up in your Supabase project', badge:{ text:'Needs setup', kind:'amber' }, why:'Your files are kept on this device. Follow SYNC-SETUP.md, “Notebook files”, once.', link:{ label:'What to do', onclick:'NBK.setupHelp()' } };
    if(syncIssue === 'network') return { text:'Files will sync when you’re back online', badge:{ text:'Waiting', kind:'amber' } };
    const up = files().filter(f => f.remotePath).length;
    return anyLocal || up ? { text:`${plural(up, 'file')} of ${files().length} synced to your account`, badge:{ text:up === files().length ? 'Synced' : 'Syncing', kind:up === files().length ? 'green' : 'grey' } } : null;
  }
  function filesOverview(){
    const st = ui(), all = files(), m = st.chosen ? fileById(st.chosen) : null;
    if(m) return fileOverview(m);
    const S = all.map(statusOf);
    const nRead = S.filter(s => ['read','template','used'].includes(s.key)).length, nWait = S.filter(s => ['reading','fetching'].includes(s.key)).length, nCant = S.filter(s => ['cant','notsynced'].includes(s.key)).length;
    const tpl = all.find(f => f.template && local[f.id] && f.status === 'read');
    const sr = syncRow();
    if(!all.length) return {
      headline:'Add a file and Horizon reads it for you.',
      graphic:NLP.counts([{ value:0, label:'files' }, { value:notes().length, label:'notes' }, { value:reports().length, label:'reports' }]),
      groups:[{ title:'Good files to add', rows:[
        { text:'A budget template (Excel or CSV)', badge:{ text:'Fills from your plan', kind:'steel' } },
        { text:'A pension or salary statement (PDF)', badge:{ text:'Quoted by Horizon', kind:'steel' } },
        { text:'Loan or mortgage terms', badge:{ text:'Dates and rates', kind:'steel' } } ] }],
      button:{ label:'Choose files to add', onclick:'NBK.pick()' },
      links:[{ label:'Choose files', short:'Choose', onclick:'NBK.pick()' }],
    };
    const ready2 = all.filter(f => f.keyLine && local[f.id] && f.status !== 'cant').slice(0, Object.keys(filled).length ? 2 : 3);
    const fillRows = Object.keys(filled).filter(id => fileById(id)).map(id => ({ text:'Filled copy of ' + H(cut(fileById(id).name, 50)), badge:{ text:'Ready', kind:'green' }, why:plural(filled[id].count || 0, 'cell') + ' filled from your plan. The original is unchanged.', link:{ label:'Download the filled copy', onclick:`NBK.downloadFilled('${id}')` } }));
    const head = nWait ? `Reading ${plural(nWait, 'file')} now.` : tpl ? `Your template ${H(cut(tpl.name, 40))} can be filled from your plan.` : nCant ? `${plural(nRead, 'file')} read; ${nCant} can’t be read yet.` : `${plural(nRead, 'file')} read. Ask about any of them below.`;
    return {
      headline:head,
      graphic:NLP.counts([{ value:nRead, label:'read', kind:nRead ? 'ok' : '' }, { value:nWait, label:'reading' }, { value:nCant, label:'can’t read yet', kind:nCant ? 'on' : '' }]),
      groups:[
        { title:'Filled copies', rows:fillRows },
        { title:'Key words read', rows:ready2.map(f => ({ text:`${pq(f.keyLine, 90, f.kind === 'sheet' || f.kind === 'csv')}${cite(f.id, f.keyChunk, all.indexOf(f) + 1)}`, badge:statusOf(f).key === 'read' ? null : { text:statusOf(f).text, kind:statusOf(f).kind }, why:H(cut(f.name, 60)) + (chunkAt(f.id, f.keyChunk) ? ', ' + H(chunkAt(f.id, f.keyChunk).w) : ''), link:{ label:'Open at these words', onclick:`NBK.openFile('${f.id}',${f.keyChunk == null ? 'null' : f.keyChunk})` } })) },
        { title:'Sync', rows:sr ? [sr] : [] },
      ],
      button:tpl ? { label:'Fill ' + short(tpl.name, 22) + ' from my plan', onclick:`NBK.fill('${tpl.id}')` } : { label:'Choose files to add', onclick:'NBK.pick()' },
      links:[{ label:'Choose files', short:'Add', onclick:'NBK.pick()' }].concat(all.some(f => f.kind === 'sheet' || f.kind === 'csv') ? [{ label:'Fill a template', short:'Fill', onclick:'NBK.fillAny()' }] : []),
    };
  }
  function fileOverview(m){
    const s = statusOf(m), L = local[m.id], all = files();
    const n = all.indexOf(m) + 1;
    const cited = citedLast()[m.id];
    const name = H(cut(m.name, 60));
    const heads = { reading:`Reading ${name} now.`, fetching:`Fetching ${name} from your account.`, elsewhere:`${name} is on another device.`, notsynced:`${name} was added on another device and hasn’t synced.`, cant:`${name} can’t be read yet.`, used:`${name} is used in your plan.`, template:`${name} is a template with ${plural(m.blanks || m.rows || 0, 'line')} to fill.`, read:`${name} is read: ${H(sizeWords(m))}.` };
    // A few telling passages (best scores), each with its place.
    const blanks = m.template && L ? L.chunks.map((c, i) => ({ c, i })).filter(x => x.c.cells && x.c.n > (L.chunks[0] ? L.chunks[0].n : 0) && (!L.sheets || x.c.s === L.sheets[0].name) && String(x.c.cells[0] || '').trim() && !String(x.c.cells[1] || '').trim()) : [];
    const top = blanks.length ? blanks.slice(0, 3) : L && L.chunks.length ? L.chunks.map((c, i) => ({ c, i, sc:lineScore(bestLine(c.t)) })).sort((a, b) => b.sc - a.sc || a.i - b.i).slice(0, 3).sort((a, b) => a.i - b.i) : [];
    const fillRow = filled[m.id] ? [{ text:'Filled copy, ' + plural(filled[m.id].count || 0, 'cell'), badge:{ text:'Ready', kind:'green' }, why:'Filled from your plan. The original file is unchanged.', link:{ label:'Download the filled copy', onclick:`NBK.downloadFilled('${m.id}')` } }] : [];
    let button;
    if(s.key === 'elsewhere') button = { label:'Fetch this file now', onclick:`NBK.fetch('${m.id}')` };
    else if(s.key === 'notsynced') button = { label:'Open this file', disabledWhy:'It’s only on the device it was added on, until that device syncs.' };
    else if(s.key === 'fetching' || s.key === 'reading') button = { label:'Open this file', disabledWhy:'Wait a moment: it’s still ' + (s.key === 'reading' ? 'being read.' : 'on its way.') };
    else if(s.key === 'cant' && m.libFail) button = { label:'Try reading it again', onclick:`NBK.retry('${m.id}')` };
    else if(m.template) button = { label:'Fill this template from my plan', onclick:`NBK.fill('${m.id}')` };
    else button = { label:'Open ' + short(m.name, 24), onclick:`NBK.openFile('${m.id}')` };
    return {
      headline:heads[s.key] || name,
      graphic:NLP.counts([{ value:m.pages || m.rows || m.paras || 0, label:{ pdf:'pages', sheet:'rows', csv:'rows', text:'lines', word:'paragraphs' }[m.kind] || 'pages read', kind:'ok' }, { value:L ? L.chunks.length : 0, label:'passages read' }, { value:cited ? cited.size : 0, label:'quoted last', kind:cited && cited.size ? 'on' : '' }]),
      groups:[
        { title:blanks.length ? 'Lines to fill' : 'Key words', rows:top.map(x => ({ text:`${pq(blanks.length ? x.c.cells[0] : bestLine(x.c.t), 90, m.kind === 'sheet' || m.kind === 'csv')}${cite(m.id, x.i, n)}`, badge:blanks.length ? { text:'Empty', kind:'amber' } : x.i === m.keyChunk ? { text:'Key line', kind:'steel' } : null, why:H(x.c.w) + (blanks.length && x.c.cells[2] ? ' · ' + pq(x.c.cells[2], 50, true) : ''), link:{ label:'Open at these words', onclick:`NBK.openFile('${m.id}',${x.i})` } })) },
        { title:'Why it can’t be read', rows:s.key === 'cant' ? [{ text:H(m.why || 'Horizon couldn’t read it.'), badge:{ text:'Kept', kind:'grey' }, why:'The file is kept safe here either way.' }] : [] },
        { title:'Filled copy', rows:fillRow },
        { title:'About the file', rows:[{ text:`${H(KIND_LABEL[m.kind] || 'File')}, ${H(sizeLabel(m.size || 0))}, added ${H(dayLabel(m.addedAt).toLowerCase())}`, badge:m.remotePath ? { text:'Synced', kind:'green' } : { text:'This device', kind:'grey' }, link:L && L.chunks.length ? { label:'Ask Horizon about this file', onclick:`NBK.askAbout('${m.id}')` } : null }] },
      ],
      button,
      links:[{ label:'Remove file', short:'Remove', onclick:`NBK.remove('${m.id}')` }].concat(L || m.remotePath ? [{ label:'Download original', short:'Download', onclick:`NBK.download('${m.id}')` }] : []),
    };
  }
  function notesOverview(){
    const st = ui(), list = notes(), d = state.nlNoteDraft;
    const ym = todayIso().slice(0, 7), month = monthName();
    const thisMonth = list.filter(e => (e.date || '').startsWith(ym)).length;
    if(st.open){
      const id = st.open, e = id === 'new' ? null : noteById(id);
      return {
        headline:id === 'new' ? 'A new note, saved when you press the button.' : id === 'draft' ? 'Horizon drafted this note. Change anything, then save it.' : 'Change this note, then save it.',
        graphic:NLP.counts([{ value:list.length, label:'notes' }, { value:thisMonth, label:'this month', kind:thisMonth ? 'ok' : '' }, { value:d ? 1 : 0, label:'draft', kind:d ? 'on' : '' }]),
        groups:[{ title:'Good to write down', rows:[{ text:'What you decided, and why', badge:{ text:'Decision', kind:'steel' } }, { text:'Something that happened to your money', badge:{ text:'Event', kind:'steel' } }] }],
        button:{ label:id === 'draft' ? 'Save ' + month.split(' ')[0] + '’s note' : 'Save note', onclick:'NBK.saveNote()' },
        links:[{ label:'Back to notes', short:'Back', onclick:'NBK.back()' }],
      };
    }
    const chosen = st.chosen ? noteById(st.chosen) : null;
    if(chosen){
      const e = chosen, isDraft = st.chosen === 'draft';
      const lines = String(e.content || '').split('\n').map(l => l.trim()).filter(Boolean);
      return {
        headline:H(isDraft ? (e.title || 'Draft note') : noteName(e)) + (isDraft ? ', not saved yet.' : '.'),
        graphic:NLP.counts([{ value:lines.length, label:'lines' }, { value:String(e.content || '').split(/\s+/).filter(Boolean).length, label:'words' }, { value:e.tag && TAGS[e.tag] ? TAGS[e.tag] : '–', label:'tag' }]),
        groups:[{ title:isDraft ? 'Draft' : 'From the note', rows:lines.slice(0, 3).map(l => ({ text:pq(l, 120) })) }],
        button:isDraft ? { label:'Save ' + month.split(' ')[0] + '’s note', onclick:'NBK.saveDraft()' } : { label:'Open this note', onclick:`NBK.openNote('${H(st.chosen)}')` },
        links:isDraft ? [{ label:'Edit draft', short:'Edit', onclick:"NBK.openNote('draft')" }, { label:'Drop draft', short:'Drop', onclick:"NBK.deleteNote('draft')" }] : [{ label:'Delete note', short:'Delete', onclick:`NBK.deleteNote('${H(st.chosen)}')` }],
      };
    }
    // Nothing chosen: the month at a glance.
    const now = new Date(), months = [], counts = [];
    for(let i = 11; i >= 0; i--){ const dt = new Date(now.getFullYear(), now.getMonth() - i, 1); const k = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; months.push(k); counts.push(list.filter(e => (e.date || '').startsWith(k)).length); }
    const tagCount = {}; list.filter(e => (e.date || '').slice(0, 4) === ym.slice(0, 4)).forEach(e => { if(e.tag) tagCount[e.tag] = (tagCount[e.tag] || 0) + 1; });
    const draftRows = d ? [{ text:pq(firstLine(d.content), 110), badge:{ text:'Draft', kind:'amber' }, why:'Drafted by Horizon. Not saved until you press Save.', link:{ label:'Edit draft', onclick:"NBK.openNote('draft')" } }] : [];
    return {
      headline:d ? `Horizon drafted ${month.split(' ')[0]}’s note from your numbers.` : list.length ? `${plural(list.length, 'note')}; ${thisMonth ? plural(thisMonth, 'note') + ' this month' : 'none yet this month'}.` : 'No notes yet. A short note each month helps later.',
      graphic:list.length ? `<div class="nb-g-cap">Notes a month, last 12 months</div>` + NLP.minibars(counts, [NLP.monthShort(months[0]), NLP.monthShort(months[11])]) : NLP.counts([{ value:0, label:'notes' }, { value:0, label:'this month' }, { value:d ? 1 : 0, label:'draft' }]),
      groups:[
        { title:'Draft', rows:draftRows },
        { title:'Noticed in your notes', rows:Object.keys(tagCount).map(t => ({ text:`${plural(tagCount[t], TAGS[t].toLowerCase())} this year`, badge:{ text:'Pattern', kind:'steel' } })) },
        { title:'Latest', rows:(d ? [] : list.slice(0, 2)).map(e => ({ text:pq(noteQuote(e) || noteName(e), 90), why:H(dayLabel(e.date)), link:{ label:'Open this note', onclick:`NBK.openNote('${H(e.id)}')` } })) },
      ],
      button:d ? { label:'Save ' + month.split(' ')[0] + '’s note', onclick:'NBK.saveDraft()' } : { label:'Draft ' + month.split(' ')[0] + '’s note', onclick:'NBK.draftMonth()' },
      links:[{ label:'+ New note', short:'New', onclick:'NBK.newNote()' }].concat(d ? [{ label:'Edit draft', short:'Edit', onclick:"NBK.openNote('draft')" }] : []),
    };
  }
  // Save the draft straight from the panel (same as opening it and saving).
  NBK.saveDraft = function(){
    const d = state.nlNoteDraft; if(!d) return;
    const now = Date.now();
    let nid = null;
    change('Note saved', s => {
      if(!Array.isArray(s.journal)) s.journal = [];
      nid = (typeof genId === 'function' ? genId() : 'n' + now.toString(36));
      const e = { id:nid, date:d.date || todayIso(), tag:d.tag || '', content:d.content || d.title || '', createdAt:now, updatedAt:now };
      if(d.title) e.title = d.title;
      s.journal.push(e); delete s.nlNoteDraft;
    });
    const st = ui(); st.chosen = nid; st.open = null; NLP.renderPage(P);
  };
  function reportsOverview(){
    const st = ui(), list = reports();
    const r = st.chosen ? list.find(x => x.id === st.chosen) : (st.open ? list.find(x => x.id === st.open) : null);
    if(r){
      const heads = reportHeads(r), keys = reportKeyLines(r), words = stripMd(r.md).split(/\s+/).filter(Boolean).length;
      const days = Math.max(0, Math.round((Date.now() - r.when) / 864e5));
      const first = reportFirst(r);
      return {
        headline:H(r.title) + (first ? ': ' + pq(first, 90) : '.'),
        graphic:NLP.counts([{ value:heads.length, label:'sections' }, { value:Math.max(1, Math.round(words / 220)), label:'min to read' }, { value:days, label:days === 1 ? 'day old' : 'days old', kind:days > 90 ? 'on' : 'ok' }]),
        groups:[
          { title:'From the report', rows:keys.map(k => ({ text:pq(k, 110) })) },
          { title:'Sections', rows:heads.slice(0, 4).map((h2, i) => ({ text:H(cut(h2, 70)), link:{ label:'Go to that section', onclick:`NBK.openReport('${H(r.id)}',${i})` } })) },
        ],
        button:st.open === r.id ? { label:'Back to reports', onclick:'NBK.back()' } : { label:'Open ' + short(r.title, 24), onclick:`NBK.openReport('${H(r.id)}')` },
        links:[{ label:'Classic Vault', short:'Vault', onclick:"nav('vault')" }],
      };
    }
    const byKind = {}; list.forEach(x => { byKind[x.kind] = (byKind[x.kind] || 0) + 1; });
    const kinds = Object.keys(byKind).sort((a, b) => byKind[b] - byKind[a]);
    const s = seen(), wk = Date.now() - 14 * 864e5, fresh = list.filter(x => !s.includes(x.id) && x.when > wk);
    return {
      headline:list.length ? (fresh.length ? `${plural(fresh.length, 'new report')} to read.` : `${plural(list.length, 'saved report')}; the latest is ${H(cut(list[0].title, 40))}.`) : 'No saved reports yet.',
      graphic:list.length ? NLP.counts(kinds.slice(0, 3).map(k => ({ value:byKind[k], label:k.toLowerCase() + (byKind[k] === 1 ? '' : 's') }))) : NLP.counts([{ value:0, label:'deep dives' }, { value:0, label:'analyses' }, { value:0, label:'other' }]),
      groups:[{ title:'Latest', rows:list.slice(0, 3).map(x => ({ text:H(cut(x.title, 60)) + (reportFirst(x) ? `<span class="nb-pq">${pq(reportFirst(x), 80)}</span>` : ''), badge:fresh.includes(x) ? { text:'New', kind:'amber' } : null, why:H(x.kind + ', ' + dayLabel(x.when).toLowerCase()), link:{ label:'Open this report', onclick:`NBK.openReport('${H(x.id)}')` } })) }],
      button:list.length ? { label:'Open ' + short((fresh[0] || list[0]).title, 24), onclick:`NBK.openReport('${H((fresh[0] || list[0]).id)}')` } : { label:'Open Places to retire', onclick:"NLP.go('nl-plans')" },
      links:[{ label:'Classic Vault', short:'Vault', onclick:"nav('vault')" }],
    };
  }

  // ── The assistant: tools, instructions, reference chips ───────────────────
  function findFile(q){
    const s = String(q || '').trim().toLowerCase(); if(!s) return null;
    const all = files();
    return all.find(f => f.id === q) || all.find(f => f.name.toLowerCase() === s) || all.find(f => f.name.toLowerCase().replace(/\.[a-z0-9]+$/, '') === s.replace(/\.[a-z0-9]+$/, '')) || all.find(f => f.name.toLowerCase().includes(s)) || all.find(f => s.includes(f.name.toLowerCase().replace(/\.[a-z0-9]+$/, ''))) || null;
  }
  async function ensureLocal(m){
    if(local[m.id]) return true;
    if(m.remotePath) return fetchRemote(m.id);
    return false;
  }
  const STOP = new Set('the a an and or of to in on for is are was be my me i it at by with from this that what how much does do our we your you any about there which'.split(' '));
  NLP.addTool({
    def:{ name:'list_files', description:'List the files the person keeps in Horizon’s Notebook (statements, letters, budget templates), with their kind, size, status and the key words read in each.', input_schema:{ type:'object', properties:{}, additionalProperties:false } },
    label:() => 'Looking at your files',
    run:() => ({ files:files().map(m => { const s = statusOf(m); return { file:m.name, kind:KIND_LABEL[m.kind] || 'File', size:sizeWords(m), status:s.text + (m.why && s.key === 'cant' ? ' (' + m.why + ')' : ''), template:!!m.template, key_words:m.keyLine || '', added:new Date(m.addedAt).toISOString().slice(0, 10), on_this_device:!!local[m.id] }; }), note:files().length ? 'Use search_files or read_file to read them. Quote the words with their [ref].' : 'The Notebook has no files yet. The person can add files on the Notebook page.' }),
  });
  NLP.addTool({
    def:{ name:'search_files', description:'Search the words read from the person’s Notebook files. Returns matching passages, each with a ref number, the file name and where it is (page or row). Quote the passage’s own words and add [ref].', input_schema:{ type:'object', properties:{ query:{ type:'string', description:'Words to look for, e.g. "pension from 65" or "interest rate".' } }, required:['query'], additionalProperties:false } },
    label:i => 'Searching your files' + (i && i.query ? ' for “' + cut(i.query, 30) + '”' : ''),
    run:async (input) => {
      const q = String(input.query || '').toLowerCase().trim();
      if(!q) return { error:'Give some words to search for.' };
      const terms = q.split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1 && !STOP.has(w));
      if(!terms.length) terms.push(q);
      const hits = [];
      for(const m of files()){
        if(!local[m.id] && m.remotePath && files().length <= 12) await ensureLocal(m);
        const L = local[m.id]; if(!L) continue;
        const nameHit = terms.filter(t => m.name.toLowerCase().includes(t)).length;
        L.chunks.forEach((c, i) => {
          const tl = c.t.toLowerCase();
          let sc = terms.filter(t => tl.includes(t)).length * 2 + nameHit * 0.5;
          if(tl.includes(q)) sc += 3;
          if(sc >= 2) hits.push({ m, c, i, sc:sc + lineScore(c.t.slice(0, 200)) * 0.1 });
        });
      }
      hits.sort((a, b) => b.sc - a.sc);
      const out = hits.slice(0, 10).map(x => ({ ref:refFor(x.m.id, x.i), file:x.m.name, where:x.c.w, text:cut(x.c.t, 420) }));
      const away = files().filter(m => !local[m.id]).map(m => m.name);
      return { results:out, ...(out.length ? {} : { note:'Nothing matched. Try other words, or list_files.' }), ...(away.length ? { not_on_this_device:away } : {}) };
    },
  });
  NLP.addTool({
    def:{ name:'read_file', description:'Read a Notebook file’s passages in order, each with a ref number and where it is. from/to are page numbers for PDFs, row numbers for spreadsheets and CSV, paragraph or line numbers for Word and text files. Spreadsheet rows include cells by column letter, so templates can be filled.', input_schema:{ type:'object', properties:{ file:{ type:'string', description:'The file name (or part of it).' }, from:{ type:'integer' }, to:{ type:'integer' }, sheet:{ type:'string', description:'Sheet name, for spreadsheets with several sheets.' } }, required:['file'], additionalProperties:false } },
    label:i => 'Reading ' + cut(i && i.file || 'a file', 40),
    run:async (input) => {
      const m = findFile(input.file);
      if(!m) return { error:'No file called “' + input.file + '”. Files: ' + files().map(f => f.name).join(', ') };
      if(!await ensureLocal(m)) return { error:m.name + ' is on another device and couldn’t be fetched here.' };
      const L = local[m.id];
      if(!L.chunks.length) return { file:m.name, error:'No words could be read from this file. ' + (m.why || '') };
      const from = Number.isFinite(+input.from) ? +input.from : -Infinity, to = Number.isFinite(+input.to) ? +input.to : Infinity;
      const sel = L.chunks.map((c, i) => ({ c, i })).filter(x => x.c.n >= from && x.c.n <= to && (!input.sheet || String(x.c.s || '').toLowerCase() === String(input.sheet).toLowerCase()));
      const out = []; let size = 0, more = null;
      for(const x of sel){
        const p = { ref:refFor(m.id, x.i), where:x.c.w, text:cut(x.c.t, 600) };
        if(x.c.cells){ p.row = x.c.n; p.cells = {}; x.c.cells.forEach((v, k) => { p.cells[colLetter(k)] = v; }); if(x.c.s && L.sheets && L.sheets.length > 1) p.sheet = x.c.s; }
        size += JSON.stringify(p).length;
        if(size > 26000 || out.length >= 160){ more = x.c.n; break; }
        out.push(p);
      }
      return { file:m.name, kind:KIND_LABEL[m.kind], size:sizeWords(m), template:!!m.template, passages:out, ...(more != null ? { more:true, next_from:more } : {}) };
    },
  });
  const colLetter = k => { let s = ''; k++; while(k > 0){ const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); } return s; };
  const colIndex = s => { let n = 0; for(const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  NLP.addTool({
    def:{ name:'fill_template', description:'Make a filled COPY of a spreadsheet or CSV template from the Notebook, with the values given. The original file is never changed, and nothing is downloaded: the person gets a "Download the filled copy" link and presses it. Read the template first with read_file to know its rows and columns.', input_schema:{ type:'object', properties:{ file:{ type:'string' }, values:{ type:'array', minItems:1, items:{ type:'object', properties:{ row:{ type:'integer', description:'The row number, as read_file gave it.' }, column:{ type:'string', description:'Column letter (e.g. B) or the column’s header words.' }, value:{ description:'Text or number to put in the cell.', type:['string','number'] }, sheet:{ type:'string' } }, required:['row','column','value'] } } }, required:['file','values'], additionalProperties:false } },
    label:i => 'Filling ' + cut(i && i.file || 'the template', 40),
    run:async (input) => {
      const m = findFile(input.file);
      if(!m) return { error:'No file called “' + input.file + '”.' };
      if(m.kind !== 'sheet' && m.kind !== 'csv') return { error:'Only spreadsheet (Excel) or CSV templates can be filled.' };
      const blob = await blobOf(m.id); if(!blob) return { error:m.name + ' is not on this device.' };
      const vals = Array.isArray(input.values) ? input.values : [];
      const skipped = []; let count = 0, out, name;
      const headerCol = (rows, col) => {
        if(/^[A-Z]{1,2}$/.test(String(col).trim())) return colIndex(String(col).trim());
        const want = String(col).trim().toLowerCase();
        for(const r of rows.slice(0, 10)){ const k = (r || []).findIndex(c => String(c == null ? '' : c).trim().toLowerCase() === want); if(k >= 0) return k; }
        for(const r of rows.slice(0, 10)){ const k = (r || []).findIndex(c => String(c == null ? '' : c).toLowerCase().includes(want)); if(k >= 0) return k; }
        return -1;
      };
      const asVal = v => (typeof v === 'number' || /^-?\d+([.,]\d+)?$/.test(String(v).replace(/\s/g, ''))) ? Number(String(v).replace(/\s/g, '').replace(',', '.')) : String(v);
      const base = m.name.replace(/\.[a-z0-9]+$/i, '');
      if(m.kind === 'csv'){
        const { rows, delim } = parseCSV(await blob.text());
        vals.forEach(v => { const c = headerCol(rows, v.column), r = (+v.row) - 1; if(c < 0 || r < 0){ skipped.push(v); return; } while(rows.length <= r) rows.push([]); while(rows[r].length <= c) rows[r].push(''); rows[r][c] = String(v.value); count++; });
        out = new Blob([csvOut(rows, delim)], { type:'text/csv' }); name = base + ' (filled).csv';
      } else {
        let X; try { X = await needXLSX(); } catch(_){ return { error:'The spreadsheet tool couldn’t load (no internet?), so the copy can’t be made right now.' }; }
        const wb = X.read(new Uint8Array(await blob.arrayBuffer()), { type:'array', cellStyles:true });
        vals.forEach(v => {
          const sn = v.sheet && wb.SheetNames.find(n => n.toLowerCase() === String(v.sheet).toLowerCase()) || wb.SheetNames[0];
          const ws = wb.Sheets[sn]; if(!ws){ skipped.push(v); return; }
          const aoa = X.utils.sheet_to_json(ws, { header:1, raw:false, defval:'', blankrows:true });
          const off = ws['!ref'] ? X.utils.decode_range(ws['!ref']).s.r : 0;
          const c = headerCol(aoa, v.column), r = (+v.row) - 1;
          if(c < 0 || r < 0){ skipped.push(v); return; }
          const val = asVal(v.value);
          ws[X.utils.encode_cell({ r, c })] = typeof val === 'number' ? { t:'n', v:val } : { t:'s', v:val };
          const rg = ws['!ref'] ? X.utils.decode_range(ws['!ref']) : { s:{ r:off, c:0 }, e:{ r:0, c:0 } };
          rg.e.r = Math.max(rg.e.r, r); rg.e.c = Math.max(rg.e.c, c); rg.s.r = Math.min(rg.s.r, r); ws['!ref'] = X.utils.encode_range(rg);
          count++;
        });
        const arr = X.write(wb, { bookType:'xlsx', type:'array' });
        out = new Blob([arr], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); name = base + ' (filled).xlsx';
      }
      if(!count) return { error:'No cell could be matched. Use the row numbers and column letters from read_file.', skipped };
      const at = Date.now();
      try { await idbPut('filled', { id:m.id, blob:out, name, at, count }); } catch(_){}
      filled[m.id] = { name, at, count };
      setTimeout(() => NLP.refreshPanel(), 0);
      return { ok:true, filled_cells:count, copy:name, ...(skipped.length ? { skipped } : {}), note:'A filled copy is ready on this device. The original file is unchanged and nothing was downloaded. Tell the person, and end your answer with the words: Download the filled copy' };
    },
  });
  NLP.addTool({
    def:{ name:'draft_note', description:'Prepare a short journal note for the person’s Notebook (for example this month’s note from their numbers). It is NOT saved: it appears in Notebook › Notes marked Draft, and the person saves or changes it.', input_schema:{ type:'object', properties:{ title:{ type:'string', description:'A short title, e.g. "November: on track, trips pinch".' }, content:{ type:'string', description:'The note, a few short plain lines in the first person.' }, tag:{ type:'string', enum:['', 'event', 'decision', 'reflection'] } }, required:['title','content'], additionalProperties:false } },
    label:() => 'Drafting your note',
    run:(input) => {
      state.nlNoteDraft = { title:cut(input.title || 'Draft note', 80), content:String(input.content || '').slice(0, 4000), tag:TAGS[input.tag] ? input.tag : 'reflection', date:todayIso(), at:Date.now() };
      setTimeout(() => { persist(); redraw(); }, 0);
      return { ok:true, note:'Shown as a Draft in Notebook › Notes. Not saved: the person presses Save. Say so in one short line, and do not repeat the whole note.' };
    },
  });
  NLP.addSystem(`

## The Notebook: the person's own files, notes and reports
- The person can keep files in Horizon's Notebook (statements, letters, loan terms, budget templates). Use list_files, search_files and read_file to read them when a question may be answered by them.
- When you use something from a file, quote the file's own words in quotes and put its reference number in square brackets right after, like: “Total expected pension from age 65: 21 400 kr a month” [3]. Use only ref numbers the tools gave you, and say which file it is from.
- A template (a spreadsheet or CSV with lines to fill) can be used to prepare plan changes with propose_changes (quote the template's words in each change's why), or filled from the plan with fill_template. After fill_template, say a filled copy is ready and end with the words: Download the filled copy
- Never claim a file was changed, saved, sent or downloaded. Files are only read; a filled copy is a new file the person downloads.
- To draft a journal note, call draft_note; it is only a draft until the person saves it.`);
  NLP.addMdHook(html => {
    let out = html.replace(/\[(\d{1,4})\]/g, (all, n) => {
      const r = refInfo(+n); if(!r) return all;
      const m = fileById(r.f);
      return `<button type="button" class="nl-cite" onclick="NBK.cite(${+n})" title="${H((m ? m.name : 'File') + (r.w ? ', ' + r.w : ''))}">${+n}</button>`;
    });
    if(Object.keys(filled).length) out = out.replace(/Download the filled copy\.?/g, () => `<button type="button" class="nl-link" onclick="NBK.downloadFilled()">Download the filled copy</button>`);
    return out;
  });

  // ── Register ──────────────────────────────────────────────────────────────
  NLP.css('nl-notebook-css', `
#panel-nl-notebook .nb-drop { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px dashed var(--nl-edge); border-radius:10px; padding:10px 14px; margin:0 0 12px; color:var(--nl-detail); font-size:13.5px; min-width:0; }
#panel-nl-notebook .nb-drop > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#panel-nl-notebook .nb-drop.over { border-color:var(--nl-accent); background:var(--nl-chosen); color:var(--nl-ink); }
#panel-nl-notebook .nb-tbl td:nth-child(3) { width:1%; white-space:nowrap; }
#panel-nl-notebook .nb-when { color:var(--nl-detail); font-size:13px; width:1%; }
#panel-nl-notebook .nb-tbl .sub { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
#panel-nl-notebook .nl-acts .nl-gp:disabled { color:var(--nl-detail); cursor:default; background:var(--nl-pill); opacity:.7; }
#panel-nl-notebook .nl-head .nl-title { max-width:min(560px, 52vw); overflow:hidden; text-overflow:ellipsis; }
#panel-nl-notebook .nl-sheet-page { margin:0 -24px -40px; min-height:calc(100vh - 110px); }
#panel-nl-notebook .nl-paper { overflow-wrap:anywhere; }
#panel-nl-notebook .nl-paper p { margin:0 0 10px; }
#panel-nl-notebook .nl-paper mark { -webkit-box-decoration-break:clone; box-decoration-break:clone; }
#panel-nl-notebook .nl-paper mark.focus, #panel-nl-notebook .nb-sheet tr.focus mark { background:#FCE3A0; }
#panel-nl-notebook .nb-ph { font:600 12px/1.3 var(--nl-sans); letter-spacing:.06em; text-transform:uppercase; color:var(--nl-detail); margin:18px 0 8px; }
#panel-nl-notebook .nb-ph:first-child { margin-top:0; }
#panel-nl-notebook .nb-wait, #panel-nl-notebook .nb-why { font-family:var(--nl-sans); color:var(--nl-quiet); font-size:14px; }
#panel-nl-notebook .nb-more { font:13px var(--nl-sans); color:var(--nl-detail); margin-top:8px; }
#panel-nl-notebook .nb-meta { font:13px var(--nl-sans); color:var(--nl-detail); margin:0 0 14px; }
#panel-nl-notebook table.nb-sheet { width:100%; border-collapse:collapse; font-size:14px; table-layout:auto; }
#panel-nl-notebook table.nb-sheet td { border-bottom:1px solid var(--nl-line); padding:5px 8px 5px 0; vertical-align:top; overflow-wrap:anywhere; }
#panel-nl-notebook table.nb-sheet td.r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
#panel-nl-notebook table.nb-sheet td.rn { width:34px; color:var(--nl-detail); font:12px var(--nl-sans); font-variant-numeric:tabular-nums; }
#panel-nl-notebook table.nb-sheet tr.hl td { background:#FFF8E4; }
#panel-nl-notebook .nb-img img { max-width:100%; height:auto; display:block; margin:8px auto 0; }
#panel-nl-notebook .nb-report h1, #panel-nl-notebook .nb-report h2, #panel-nl-notebook .nb-report h3, #panel-nl-notebook .nb-report h4 { font-family:var(--nl-serif); line-height:1.3; margin:18px 0 8px; color:var(--nl-ink); }
#panel-nl-notebook .nb-report h1 { font-size:22px; } #panel-nl-notebook .nb-report h2 { font-size:19px; } #panel-nl-notebook .nb-report h3, #panel-nl-notebook .nb-report h4 { font-size:16px; }
#panel-nl-notebook .nb-report table { width:100%; border-collapse:collapse; font-size:14px; margin:0 0 12px; }
#panel-nl-notebook .nb-report th, #panel-nl-notebook .nb-report td { border-bottom:1px solid var(--nl-line); padding:4px 6px; text-align:left; overflow-wrap:anywhere; }
#panel-nl-notebook .nb-report pre { white-space:pre-wrap; font-size:13px; }
#panel-nl-notebook .nb-report a { color:var(--nl-accent); }
#panel-nl-notebook .nb-editor { max-width:760px; }
#panel-nl-notebook .nb-editor .nl-field textarea { resize:vertical; font:400 15px/1.6 var(--nl-serif); min-height:180px; }
#panel-nl-notebook .nb-editor .nl-field input[type=date] { border:0; background:transparent; font:500 14px var(--nl-sans); color:var(--nl-ink); outline:0; padding:2px 0; }
#panel-nl-notebook .nb-pills { display:flex; gap:6px; flex-wrap:wrap; }
html.nl .nl-side .nb-g-cap { font-size:12.5px; color:var(--nl-detail); margin-bottom:6px; }
html.nl .nl-side .nb-pq { display:block; font-weight:400; font-size:13px; margin-top:1px; }
@media (max-width:1300px){ #panel-nl-notebook .nl-wrap { padding-left:18px; padding-right:18px; } #panel-nl-notebook .nl-sheet-page { margin:0 -18px -40px; } #panel-nl-notebook .nl-paper { padding:22px 24px; } }
`);
  NLP.register({
    panel:P, section:'notebook', label:'Notebook',
    render,
    overview(){
      const tab = NLP.tabOf(P, 'files');
      if(tab === 'notes') return notesOverview();
      if(tab === 'reports') return reportsOverview();
      return filesOverview();
    },
  });

  // ── Start: read what this device holds, finish any interrupted reading ───
  let idbLoaded = false;
  async function boot(){
    // No files yet: nothing to open (the file store is made on the first upload).
    if(typeof state === 'undefined' || !files().length){ ready = true; return; }
    if(idbLoaded) return; idbLoaded = true; ready = false;
    try {
      const recs = await idbAll('files');
      recs.forEach(r => { if(!local[r.id] || !local[r.id].chunks.length) local[r.id] = { chunks:Array.isArray(r.chunks) ? r.chunks : [], sheets:r.sheets || null }; });
      const fl = await idbAll('filled');
      fl.forEach(r => { filled[r.id] = { name:r.name, at:r.at, count:r.count }; });
    } catch(_){}
    ready = true;
    // A reading cut short (the tab closed): read it again.
    for(const m of files()){
      if(local[m.id] && (m.status === 'reading' || (m.status === 'read' && !local[m.id].chunks.length && m.kind !== 'image'))){
        const rec = await idbGet('files', m.id).catch(() => null);
        if(rec && rec.blob) readFile(m, rec.blob);
      }
    }
    if(isHere()) NLP.renderPage(P);
    setTimeout(backfill, 4000);
  }
  setTimeout(boot, 0);
  if(typeof bus !== 'undefined') bus.on('panel:changed', ({ panel }) => { if(panel !== P) return; if(!idbLoaded && files().length) boot(); setTimeout(backfill, 500); });
})();

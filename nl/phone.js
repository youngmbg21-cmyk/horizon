/* ══ NEW LOOK (L+S) · Phase 8: phones ══════════════════════════════════════
   The same new-look pages on a phone. Only acts when <html> has BOTH .nl and
   .nl-phone (set by the Phase 0 switch code on phone-sized screens).
   - The five pages move to a tab bar at the bottom, where the thumb is.
   - The side panel becomes a sheet at the bottom: closed, it shows the
     headline and the ask box; a press opens it (Overview or the conversation).
   - Wide rows stack: name first, then badges and amounts on one line.      */
(function(){
  'use strict';
  if(!window.NLP) return;
  const NLP = window.NLP;
  const isPhone = () => document.documentElement.classList.contains('nl') && document.documentElement.classList.contains('nl-phone');
  const SECTIONS = [['today','Today'],['money','Money'],['plans','Plans'],['future','Future'],['notebook','Notebook']];

  NLP.css('nl-phone-css', `
html.nl.nl-phone body > .app { display:flex !important; height:100%; }
html.nl.nl-phone #hzApp { display:none !important; }
html.nl.nl-phone .nl-row { padding:calc(6px + env(safe-area-inset-top,0px)) 12px 6px; min-height:46px; gap:6px; }
html.nl.nl-phone .nl-nav, html.nl.nl-phone #nl-right .cur-toggle, html.nl.nl-phone #nl-right .mode-toggle, html.nl.nl-phone #nl-right .nl-pill:not(#nl-menu-btn) { display:none !important; }
html.nl.nl-phone .nl-logo { margin-right:4px; }
html.nl.nl-phone .nl-where { display:inline; font-size:14px; color:var(--nl-detail); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.nl-where { display:none; }
html.nl.nl-phone .nl-menu { right:12px; width:min(300px, calc(100vw - 24px)); }
html.nl.nl-phone .nl-tabs { padding:0 12px; }
html.nl.nl-phone .main-row { flex-direction:column; position:relative; }
html.nl.nl-phone .content { padding-bottom:calc(var(--nl-sheet-closed, 132px) + 60px + env(safe-area-inset-bottom,0px)); scrollbar-gutter:auto; }
/* The tab bar */
#nl-tabbar { display:none; }
html.nl.nl-phone #nl-tabbar { display:grid; grid-template-columns:repeat(5,1fr); position:fixed; left:0; right:0; bottom:0; z-index:60; background:var(--nl-surface); border-top:1px solid var(--nl-line); padding:6px 4px calc(8px + env(safe-area-inset-bottom,0px)); font:500 11.5px/1.2 var(--nl-sans); }
#nl-tabbar button { border:0; background:transparent; color:var(--nl-detail); padding:6px 2px; border-radius:10px; font:inherit; white-space:nowrap; min-height:44px; }
#nl-tabbar button[aria-current="page"] { color:var(--nl-ink); font-weight:600; background:var(--nl-pill); }
/* The side panel as a bottom sheet */
html.nl.nl-phone .nl-side { position:fixed; left:0; right:0; bottom:calc(58px + env(safe-area-inset-bottom,0px)); width:auto; z-index:55; border-left:0; border-top:1px solid var(--nl-line); border-radius:14px 14px 0 0; box-shadow:0 -8px 24px rgba(0,0,0,.08); max-height:calc(100% - 120px); transition:transform .2s ease; }
html.nl.nl-phone .nl-side:not(.open) .nl-face { display:none !important; }
html.nl.nl-phone .nl-side:not(.open) .nl-links { display:none; }
html.nl.nl-phone .nl-side.open { height:calc(100% - 120px); }
html.nl.nl-phone .nl-face-hd { cursor:pointer; padding-top:18px; position:relative; }
html.nl.nl-phone .nl-face-hd::before { content:''; position:absolute; left:50%; top:7px; width:36px; height:4px; margin-left:-18px; border-radius:4px; background:var(--nl-edge); }
html.nl.nl-phone .nl-sheet-peek { display:block; font:600 15px/1.3 var(--nl-serif); color:var(--nl-ink); margin:8px 16px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
.nl-sheet-peek { display:none; }
html.nl.nl-phone .nl-side.open .nl-sheet-peek { display:none; }
html.nl.nl-phone .nl-ask textarea { font-size:16px; }
@media (prefers-reduced-motion:reduce){ html.nl.nl-phone .nl-side { transition:none; } }
/* Pages on a phone */
html.nl.nl-phone .nl-page .nl-wrap { padding:12px 16px 24px; }
html.nl.nl-phone .nl-head { flex-wrap:wrap; gap:6px 16px; }
html.nl.nl-phone .nl-title { font-size:22px; padding-bottom:4px; }
html.nl.nl-phone .nl-head .nl-tabs-row { order:3; flex-basis:100%; }
html.nl.nl-phone .nl-acts { padding-bottom:4px; }
html.nl.nl-phone .nl-two { grid-template-columns:minmax(0,1fr); }
html.nl.nl-phone .nl-fcards { grid-template-columns:repeat(2,minmax(0,1fr)); }
html.nl.nl-phone .nl-field { grid-template-columns:minmax(0,1fr) auto; }
html.nl.nl-phone .nl-field > .lb { grid-column:1 / -1; }
html.nl.nl-phone .nl-paper { padding:18px 16px; }
/* Table rows stack: name on its own line, then badges and numbers. */
html.nl.nl-phone table.nl-tbl thead { display:none; }
html.nl.nl-phone table.nl-tbl, html.nl.nl-phone table.nl-tbl tbody { display:block; width:100%; }
html.nl.nl-phone table.nl-tbl tr { display:flex; flex-wrap:wrap; align-items:center; gap:4px 10px; padding:10px 4px; border-bottom:1px solid var(--nl-line); }
html.nl.nl-phone table.nl-tbl td { display:block; padding:0; border:0; background:transparent !important; }
html.nl.nl-phone table.nl-tbl td.mk { display:none; }
html.nl.nl-phone table.nl-tbl td:not(.r):not(.mk):first-of-type, html.nl.nl-phone table.nl-tbl tr > td:nth-child(2):not(.r) { flex:1 1 100%; min-width:0; }
html.nl.nl-phone table.nl-tbl td.r { margin-left:auto; }
html.nl.nl-phone table.nl-tbl tbody tr.on { background:var(--nl-chosen); }
html.nl.nl-phone table.nl-tbl tbody tr.sug { background:#F3FAF7; }
html.nl.nl-phone table.nl-tbl td[colspan] { flex:1 1 100%; }
`);

  function ensureChrome(){
    if(!document.getElementById('nl-tabbar')){
      const bar = document.createElement('nav');
      bar.id = 'nl-tabbar'; bar.setAttribute('aria-label', 'Pages');
      bar.innerHTML = SECTIONS.map(s => `<button type="button" data-nl-sec="${s[0]}">${s[1]}</button>`).join('');
      bar.addEventListener('click', e => {
        const b = e.target.closest('button[data-nl-sec]'); if(!b) return;
        const top = document.querySelector(`#nl-nav button[data-nl-sec="${b.dataset.nlSec}"]`);
        if(top) top.click(); else { const t = NLP.sectionTarget(b.dataset.nlSec); if(t) nav(t); }
        closeSheet();
      });
      document.body.appendChild(bar);
    }
    const logo = document.querySelector('#nl-bar .nl-logo');
    if(logo && !document.getElementById('nl-where')){
      const w = document.createElement('span'); w.id = 'nl-where'; w.className = 'nl-where';
      logo.insertAdjacentElement('afterend', w);
    }
    const side = document.getElementById('nl-side'), hd = document.getElementById('nl-face-hd');
    if(side && hd && !document.getElementById('nl-sheet-peek')){
      const peek = document.createElement('div'); peek.id = 'nl-sheet-peek'; peek.className = 'nl-sheet-peek';
      hd.insertAdjacentElement('afterend', peek);
      peek.addEventListener('click', () => openSheet());
      hd.addEventListener('click', () => { if(isPhone()) side.classList.toggle('open'); });
    }
  }
  function openSheet(){ if(isPhone()) document.getElementById('nl-side')?.classList.add('open'); }
  function closeSheet(){ document.getElementById('nl-side')?.classList.remove('open'); }
  NLP.openSheet = openSheet; NLP.closeSheet = closeSheet;

  function sync(){
    if(!isPhone()) return;
    ensureChrome();
    const cur = document.querySelector('#nl-nav button[aria-current="page"]');
    const sec = cur ? cur.dataset.nlSec : null;
    document.querySelectorAll('#nl-tabbar button').forEach(b => { if(b.dataset.nlSec === sec) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const where = document.getElementById('nl-where');
    if(where){ const p = NLP.activePage(); where.textContent = p ? (p.label || '') : (cur ? cur.textContent : ''); }
    const peek = document.getElementById('nl-sheet-peek'), hl = document.querySelector('#nl-ov .nl-hl');
    if(peek) peek.textContent = (window.nlFace && window.nlFace() === 'chat') ? 'Conversation with Horizon' : (hl ? hl.textContent : 'Overview');
  }
  // The conversation always opens the sheet; the ask box is one tap away.
  const flip = window.nlFlip;
  if(typeof flip === 'function'){
    window.nlFlip = function(to){ flip(to); if(isPhone() && to === 'chat') openSheet(); sync(); };
  }
  document.addEventListener('focusin', e => { if(isPhone() && e.target && e.target.id === 'nl-ask-input') openSheet(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && isPhone() && !e.nlDone){ const s = document.getElementById('nl-side'); if(s && s.classList.contains('open') && !(window.nlFace && window.nlFace() === 'chat')){ closeSheet(); e.nlDone = true; } } });
  if(typeof bus !== 'undefined'){ bus.on('panel:changed', () => setTimeout(sync, 0)); bus.on('state:changed', () => setTimeout(sync, 80)); }
  new MutationObserver(() => setTimeout(sync, 0)).observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
  const ov = document.getElementById('nl-ov');
  if(ov) new MutationObserver(() => sync()).observe(ov, { childList:true });
  setTimeout(sync, 0);
})();

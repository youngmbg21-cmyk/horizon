/* Horizon · new look · Directions: the assistant takes people around the app.
   Everything typed in the Ask box goes through ONE reader first, cheapest step first:
     a) place words ("settings", "runway")      → that page and tab
     b) things inside pages ("December", "Vanguard", "2031", "the Paris trip") → that thing, chosen
     c) everyday words for ~50 tasks (fuzzy)    → one clear winner goes; 2–3 close ones become buttons
     d) "how do I …"                            → the Handbook chapter (nl/handbook.js)
     e) nothing matched                         → the AI answers; it may add buttons to places on a fixed list
   None of a–d calls the AI. A direction only MOVES: it never presses, saves or deletes.
   Every direction uses the app's existing way in (nav, tabs, choosing a row). */
(function(){
  if(!window.NLP) return;
  const H = NLP.h;
  const onboardOK = () => !!(state.citizenship && state.homeBase);

  // ── Words ────────────────────────────────────────────────────────────────
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/&/g, ' and ');
  const STOP = new Set(('a an the my me i im to of for in on at and or is it this that with from please pls just some any your you we our up there here page tab section screen ' +
    'want like would could can will let lets need get got thing things go goto open opening show showing see find take bring where wheres whats which ' +
    'en ett den det de min mitt mina jag till av for i pa och eller ar att med fran vill kan ga gaa visa oppna var hitta sidan fliken mig du snalla').split(' '));
  const stem = w => w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
  const toks = (s, keepStop) => fold(s).split(/[^a-z0-9+]+/).filter(Boolean).filter(w => keepStop || !STOP.has(w)).map(stem);
  function lev(a, b, max){
    if(Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length:b.length + 1 }, (_, j) => j);
    for(let i = 1; i <= a.length; i++){
      const cur = [i]; let best = i;
      for(let j = 1; j <= b.length; j++){ cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
      if(best > max) return max + 1; prev = cur;
    }
    return prev[b.length];
  }
  function sim(a, b){
    if(a === b) return 1;
    const sh = Math.min(a.length, b.length), lo = Math.max(a.length, b.length);
    if(sh >= 4 && (a.startsWith(b) || b.startsWith(a)) && (sh >= 5 || lo - sh <= 2)) return 0.85;
    const L = Math.min(a.length, b.length);
    if(L >= 4 && lev(a, b, 1) <= 1) return 0.8;
    if(L >= 7 && lev(a, b, 2) <= 2) return 0.6;
    return 0;
  }
  // Same word with a typo (not a longer or shorter word).
  const typo = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && lev(a, b, 1) <= 1) || (Math.min(a.length, b.length) >= 8 && lev(a, b, 2) <= 2);
  // How well a phrasing (list of tokens) covers the query tokens.
  function score(phr, q){
    if(!phr.length || !q.length) return 0;
    let m = 0; const used = new Set();
    phr.forEach(pt => { let best = 0, bi = -1; q.forEach((qt, i) => { const s = sim(pt, qt); if(s > best){ best = s; bi = i; } }); m += best; if(best >= 0.6) used.add(bi); });
    const cov = m / phr.length; if(cov < 0.6) return 0;
    return 0.75 * cov + 0.25 * (used.size / q.length);
  }

  // ── Places (pages and tabs) ──────────────────────────────────────────────
  const PAGE = { 'nl-today':'Today', 'nl-money':'Money plan', 'nl-plans':'Plans', 'nl-future':'Future', 'nl-notebook':'Notebook', 'nl-setup':'Set up', 'nl-settings':'Settings' };
  const TAB = { 'nl-today':{ how:'How are we doing', needs:'Needs you', review:'Full review' }, 'nl-money':{ plan:'Plan', forecast:'Forecast', years:'Years ahead', bank:'Bank files', history:'History' },
    'nl-plans':{ trips:'Trips', places:'Places to retire' }, 'nl-future':{ runway:'Runway', accounts:'Accounts', wall:'Life wall' }, 'nl-notebook':{ files:'Files', notes:'Notes', reports:'Reports' },
    'nl-setup':{ all:'All', filled:'Filled', needed:'Needed', optional:'Optional' }, 'nl-settings':{ general:'General', assistant:'Assistant', sync:'Sync and backup' } };
  const SEC = { 'nl-today':'today', 'nl-money':'money', 'nl-plans':'plans', 'nl-future':'future', 'nl-notebook':'notebook' };
  const placeName = pl => pl.label || (PAGE[pl.p] + (pl.tab && TAB[pl.p][pl.tab] && TAB[pl.p][pl.tab] !== PAGE[pl.p] ? ' → ' + TAB[pl.p][pl.tab] : ''));

  // Every page and tab, with the words for it (English and Swedish).
  const PLACES = [
    { id:'today', p:'nl-today', tab:'how', words:['today','home','dashboard','overview','start','front page','how are we doing','idag','hem','oversikt','startsida'] },
    { id:'needs', p:'nl-today', tab:'needs', words:['needs you','to do','todo','alerts','warnings','att gora','varningar'] },
    { id:'review', p:'nl-today', tab:'review', words:['full review','review','financial analysis','ai analysis','analysis','report card','checkup','health check','granskning','analys'] },
    { id:'money', p:'nl-money', tab:'plan', words:['money plan','money','budget','monthly budget','pengar','manadsbudget','budgeten'] },
    { id:'forecast', p:'nl-money', tab:'forecast', words:['forecast','cash flow','cashflow','12 months','next 12 months','twelve months','prognos','kassaflode'] },
    { id:'years', p:'nl-money', tab:'years', words:['years ahead','future budgets','future years','yearly budget','years','arsbudget','kommande ar'] },
    { id:'bank', p:'nl-money', tab:'bank', words:['bank files','bank file','bank','transactions','statements','bank statement','imports','bankfiler','transaktioner','kontoutdrag'] },
    { id:'history', p:'nl-money', tab:'history', words:['history','change history','changes','log','audit','historik','andringar'] },
    { id:'plans', p:'nl-plans', tab:'trips', words:['plans','planer'] },
    { id:'trips', p:'nl-plans', tab:'trips', words:['trips','travel','holidays','vacations','fun fund','resor','semester','resa'] },
    { id:'places', p:'nl-plans', tab:'places', words:['places to retire','places','retire abroad','cities','where to retire','compare cities','platser','pensionsort'] },
    { id:'future', p:'nl-future', tab:'runway', words:['future','framtid','framtiden'] },
    { id:'runway', p:'nl-future', tab:'runway', words:['runway','retirement','retirement plan','nest egg','drawdown','fire','pensionering','pensionsplan'] },
    { id:'accounts', p:'nl-future', tab:'accounts', words:['accounts','investments','portfolio','net worth','net worth history','home value','house value','mortgage balance','assets','pensions','konton','investeringar','tillgangar','pensioner','nettoformogenhet','bostadens varde'] },
    { id:'wall', p:'nl-future', tab:'wall', words:['life wall','wall','bricks','livsvagg','vaggen'] },
    { id:'notebook', p:'nl-notebook', tab:'files', words:['notebook','anteckningsbok'] },
    { id:'files', p:'nl-notebook', tab:'files', words:['files','documents','uploads','docs','filer','dokument'] },
    { id:'notes', p:'nl-notebook', tab:'notes', words:['notes','journal','diary','anteckningar','dagbok'] },
    { id:'reports', p:'nl-notebook', tab:'reports', words:['reports','saved reports','rapporter'] },
    { id:'setup', p:'nl-setup', tab:'all', words:['setup','set up','profile','about me','my details','onboarding','profil','mina uppgifter'] },
    { id:'setup-needed', p:'nl-setup', tab:'needed', words:['needed details','missing details','what setup needs','saknade uppgifter'] },
    { id:'setup-filled', p:'nl-setup', tab:'filled', words:['filled in details','what i filled in','ifyllda uppgifter'] },
    { id:'setup-optional', p:'nl-setup', tab:'optional', words:['optional details','valfria uppgifter'] },
    { id:'settings', p:'nl-settings', tab:'general', words:['settings','preferences','options','installningar'] },
    { id:'settings-assistant', p:'nl-settings', tab:'assistant', words:['assistant settings','ai settings','assistentinstallningar'] },
    { id:'sync', p:'nl-settings', tab:'sync', words:['sync','sync and backup','backup','synk','sakerhetskopia'] },
  ];

  // ── Tasks: everyday words → a place (and a Handbook chapter with the same id) ──
  // words: many ways people ask, incl. other apps' words, short forms and Swedish.
  const T = (id, label, place, words) => ({ id, label, place, words });
  const TASKS = [
    T('today', 'See how you are doing', { p:'nl-today', tab:'how' }, ['how am i doing','am i on track','my situation','big picture','summary','overview of my money','hur gar det','sammanfattning']),
    T('needs', 'See what needs you', { p:'nl-today', tab:'needs' }, ['what needs attention','what should i fix','problems','warnings','things to do','what needs me','vad behover goras']),
    T('review', 'Read the full review', { p:'nl-today', tab:'review' }, ['full review','financial review','analyse my finances','ai financial analysis','health check','review my plan','granska min ekonomi']),
    T('expenses', 'Change a monthly expense', { p:'nl-money', tab:'plan', filt:'expenses' }, ['change an expense','edit expenses','my expenses','costs','spending','bills','budget lines','monthly costs','categories','groceries budget','utgifter','kostnader','andra utgift']),
    T('income', 'Change your income', { p:'nl-money', tab:'plan', filt:'income' }, ['change my income','edit income','salary','pay','wages','earnings','paycheck','inkomst','lon','andra inkomst']),
    T('savings-target', 'Change how much you save each month', { p:'nl-money', tab:'plan', filt:'savings', row:'sav' }, ['savings target','savings','my savings','monthly savings','save more','save less','how much i save','savings goal','sparmal','spara mer','manadssparande']),
    T('add-line', 'Add a new expense or income line', { p:'nl-money', tab:'plan' }, ['add an expense','new expense','add a cost','add a bill','add a line','new budget line','add income line','add subscription','lagg till utgift','ny kostnad']),
    T('month', 'Look at or change one month', { p:'nl-money', tab:'plan' }, ['change one month','just one month','this month only','a single month','next month','month by month','en manad','bara en manad']),
    T('forecast', 'See the next 12 months', { p:'nl-money', tab:'forecast' }, ['forecast','cash flow','next 12 months','coming months','short months','which months are short','projection by month','prognos','kassaflode']),
    T('years', 'Plan future years', { p:'nl-money', tab:'years' }, ['future years','years ahead','future budgets','next year budget','change for one year','yearly plan','long term budget','kommande ar','nasta ar']),
    T('bank', 'Add a bank file', { p:'nl-money', tab:'bank' }, ['import bank file','upload bank statement','upload csv','upload statement','bank csv','add transactions','import csv','connect my bank','bank export','import transactions','ladda upp kontoutdrag','importera bankfil']),
    T('sort-bank', 'Sort bank rows into categories', { p:'nl-money', tab:'bank' }, ['categorise transactions','categorize transactions','sort transactions','uncategorised','tag transactions','label spending','kategorisera','sortera transaktioner']),
    T('history', 'See and undo changes', { p:'nl-money', tab:'history' }, ['undo a change','what changed','change log','history of changes','revert','go back a change','angra','vad har andrats']),
    T('trips', 'See your trips', { p:'nl-plans', tab:'trips' }, ['my trips','holidays','travel plans','vacations','fun fund','resor','semestrar']),
    T('add-trip', 'Add a trip', { p:'nl-plans', tab:'trips' }, ['add a trip','new trip','plan a trip','book a holiday','add a vacation','add travel','ny resa','lagg till resa','planera resa']),
    T('edit-trip', 'Change a trip’s costs or dates', { p:'nl-plans', tab:'trips' }, ['change a trip','edit trip','trip costs','move a trip','trip dates','andra resa','resekostnad']),
    T('places', 'Compare places to retire', { p:'nl-plans', tab:'places' }, ['places to retire','retire abroad','compare cities','where should i retire','cost of living','move abroad','deep dive','platser','flytta utomlands']),
    T('add-place', 'Add a place to retire', { p:'nl-plans', tab:'places' }, ['add a place','add a city','new place','add a country','lagg till plats','ny stad']),
    T('runway', 'See how long your money lasts', { p:'nl-future', tab:'runway' }, ['retirement','runway','how long will my money last','will my money last','run out of money','nest egg','drawdown','withdrawal rate','4% rule','fire','pension plan','pensionering','racker pengarna']),
    T('retire-spend', 'Change what you’ll spend in retirement', { p:'nl-future', tab:'runway', row:'spend' }, ['retirement expenses','retirement spending','spend in retirement','retirement budget','cost in retirement','utgifter som pensionar']),
    T('lifestyle', 'Switch between Lean, Baseline and Comfortable', { p:'nl-future', tab:'runway' }, ['lean','baseline','comfortable','lifestyle','scenario','livsstil','scenario']),
    T('back-to-plan', 'Go back to your plan', { p:'nl-future', tab:'runway' }, ['back to my plan','original plan','reset my plan','undo scenario','reset scenario','tillbaka till min plan','aterstall']),
    T('accounts', 'See your accounts and pensions', { p:'nl-future', tab:'accounts' }, ['my accounts','investments','portfolio','net worth','assets','pensions','isk','401k','pension pots','konton','tillgangar']),
    T('add-account', 'Add an account that grows', { p:'nl-future', tab:'accounts' }, ['add an account','new account','add investment','add savings account','add isk','add brokerage','add stocks','add a fund','nytt konto','lagg till konto']),
    T('add-pension', 'Add a pension', { p:'nl-future', tab:'accounts' }, ['add a pension','new pension','state pension','work pension','itp','allman pension','tjanstepension','lagg till pension']),
    T('growth', 'Change how fast your savings grow', { p:'nl-future', tab:'accounts', row:'sav' }, ['savings growth','growth rate','return rate','expected return','interest rate on savings','change growth','avkastning','tillvaxt']),
    T('edit-account', 'Change an account', { p:'nl-future', tab:'accounts' }, ['change an account','edit account','account balance','monthly contribution','contribution','andra konto','insattning']),
    T('wall', 'Read your life wall', { p:'nl-future', tab:'wall' }, ['life wall','bricks','my whole life','year by year life','livsvagg']),
    T('files', 'Add a document', { p:'nl-notebook', tab:'files' }, ['upload a file','add a document','upload document','my documents','pdf','attach','ladda upp fil','dokument']),
    T('template', 'Fill a template with your plan', { p:'nl-notebook', tab:'files' }, ['fill a template','template','fill in a form','fill excel','mall','fyll i mall']),
    T('notes', 'Write a note', { p:'nl-notebook', tab:'notes' }, ['write a note','new note','journal entry','diary','notes','skriv anteckning','dagbok']),
    T('reports', 'Find a saved report', { p:'nl-notebook', tab:'reports' }, ['saved reports','my reports','saved analysis','old reviews','rapporter']),
    T('profile', 'Change your details', { p:'nl-setup', tab:'all' }, ['my profile','my details','change my name','citizenship','home base','household','my age','about me','profil','medborgarskap']),
    T('retire-age', 'Change your retirement age', { p:'nl-setup', tab:'all', setup:'retire' }, ['retirement age','retire at','when i retire','retire earlier','retire later','pensionsalder','ga i pension']),
    T('currency', 'Change the currency', { p:'nl-settings', tab:'general', set:'currency' }, ['currency','change currency','show in dollars','show in euros','show in kronor','sek','usd','eur','kes','valuta','byt valuta']),
    T('rates', 'Update exchange rates', { p:'nl-settings', tab:'general', set:'rates' }, ['exchange rates','conversion rates','fx rates','currency rates','update rates','vaxelkurs','valutakurs']),
    T('money-view', 'Show today’s money or future money', { p:'nl-settings', tab:'general', set:'displayMode' }, ['todays money','future money','nominal','real terms','inflation adjusted','dagens pengar','nominellt']),
    T('language', 'Change the language', { p:'nl-settings', tab:'general', set:'lang' }, ['language','swedish','english','svenska','engelska','sprak','byt sprak']),
    T('inflation', 'Change inflation', { p:'nl-settings', tab:'general', set:'inflationRate' }, ['inflation','inflation rate','price rises','inflationen']),
    T('life-exp', 'Change how long the plan runs', { p:'nl-settings', tab:'general', set:'lifeExp' }, ['life expectancy','plan until age','how long i live','live to','livslangd','planera till']),
    T('post-growth', 'Change growth after you retire', { p:'nl-settings', tab:'general', set:'retirementPostGrowth' }, ['growth after retiring','growth in retirement','return after retirement','avkastning efter pension']),
    T('claude-key', 'Add your Claude key', { p:'nl-settings', tab:'assistant', set:'key' }, ['claude key','api key','ai key','anthropic key','add my key','ai nyckel','api nyckel']),
    T('sync', 'Sync between devices', { p:'nl-settings', tab:'sync', set:'sync' }, ['sync','sync my devices','other devices','connect supabase','cloud','sign in','log in','synka','logga in']),
    T('backup', 'Download a backup', { p:'nl-settings', tab:'sync', set:'backup' }, ['backup','download a copy','export my data','export','sakerhetskopia','exportera']),
    T('restore', 'Restore the backup from before the new look', { menu:true, label:'the New look menu' }, ['restore backup','restore my data','get my old data back','aterstall sakerhetskopia']),
    T('old-look', 'Go back to the old look', { menu:true, label:'the New look menu' }, ['old look','classic look','old version','old design','switch back','gamla utseendet','gamla versionen']),
    T('assistant', 'Talk to Horizon', { chat:true, label:'the conversation' }, ['assistant','chat','ask horizon','talk to the ai','ai','assistenten','chatt']),
    T('how-assistant', 'How the assistant works', { info:'how', label:'How the assistant works' }, ['how does the assistant work','what can the assistant do','is it safe','help','hjalp']),
    T('changes', 'See what the assistant changed', { info:'history', label:'the assistant’s History' }, ['assistant history','what did the assistant change','undo assistant','applied changes','historik assistent']),
  ];
  const TASK = Object.fromEntries(TASKS.map(t => [t.id, t]));
  const BOOK = () => Object.fromEntries((window.NL_HANDBOOK || []).map(c => [c.id, c]));
  const prepared = TASKS.map(t => ({ t, phr:t.words.concat([t.label]).map(w => toks(w)).filter(x => x.length) }));
  const placePhr = PLACES.map(pl => ({ pl, phr:pl.words.map(w => toks(w).join(' ')).filter(Boolean) }));

  // ── Moving: the app's own ways in ────────────────────────────────────────
  const isPhone = () => document.documentElement.classList.contains('nl-phone');
  function land(pl, opts){
    opts = opts || {};
    if(pl.chat){ if(typeof window.nlFlip === 'function') nlFlip('chat'); setTimeout(() => document.getElementById('nl-ask-input')?.focus(), 60); return { ok:true }; }
    if(pl.info === 'how'){ nlShowHow(); return { ok:true }; }
    if(pl.info === 'history'){ nlShowHistory(); return { ok:true }; }
    if(pl.menu){ const m = document.getElementById('nl-menu'); if(m && m.hidden) nlMenu(); return { ok:true }; }
    if(pl.p !== 'nl-setup' && pl.p !== 'nl-settings' && !onboardOK()) return { blocked:'setup' };
    const ui = NLP.ui(pl.p);
    if(pl.tab) ui.tab = pl.tab;
    ui.chosen = pl.row != null ? pl.row : null; ui.open = null;
    if(pl.filt) ui.filt = pl.filt;
    if(pl.p === 'nl-money' && pl.tab === 'years' && pl.row != null) ui.yearsAll = true;
    if(state.activePanel !== pl.p) nav(pl.p); else NLP.renderPage(pl.p);
    if(pl.month && window.NLM){ NLM.goMonth(pl.month); if(pl.row != null){ NLP.ui(pl.p).chosen = pl.row; NLP.renderPage(pl.p); } }
    if(pl.p === 'nl-plans' && pl.row != null && window.NLPplans) NLPplans.choose(pl.row);
    if(pl.note && window.NBK) NBK.openNote(pl.note);
    if(pl.file && window.NBK) NBK.openFile(pl.file);
    if(pl.report && window.NBK) NBK.openReport(pl.report);
    if(pl.setup && window.nlSetupFocus) setTimeout(() => nlSetupFocus(pl.setup), 80);
    if(pl.set) setTimeout(() => document.getElementById('nlst-row-' + pl.set)?.scrollIntoView({ block:'center' }), 80);
    if(pl.row != null) setTimeout(() => { const r = document.querySelector(`#panel-${pl.p} [data-nl-row="${CSS.escape(String(pl.row))}"]`); if(r) r.scrollIntoView({ block:'center' }); }, 80);
    if(isPhone() && NLP.closeSheet && !opts.keepSheet) NLP.closeSheet();
    return { ok:true };
  }

  // ── Things inside pages ──────────────────────────────────────────────────
  const MONTHS = [['january','jan','januari'],['february','feb','februari'],['march','mar','mars'],['april','apr'],['may','maj'],['june','jun','juni'],['july','jul','juli'],['august','aug','augusti'],['september','sep','sept'],['october','oct','okt','oktober'],['november','nov'],['december','dec']];
  const monIdx = w => MONTHS.findIndex(a => a.includes(w));
  const now = () => { const d = new Date(); return { y:d.getFullYear(), m:d.getMonth() + 1 }; };
  const keyOf = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const monLabel = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month:'long', year:'numeric' }); };
  const HINT = { trip:'trips', resa:'trips', resor:'trips', holiday:'trips', place:'places', city:'places', plat:'places', stad:'places', account:'accounts', konto:'accounts', pension:'accounts',
    note:'notes', anteckning:'notes', file:'files', document:'files', fil:'files', dokument:'files', report:'reports', rapport:'reports', forecast:'forecast', prognos:'forecast', wall:'wall', brick:'wall',
    year:'years', budget:'plan', plan:'plan', expense:'plan', cost:'plan', line:'plan', income:'plan', month:'plan' };
  const hintOf = w => HINT[w] || (w.length > 4 && Object.keys(HINT).find(k => k.length > 4 && sim(k, w) >= 0.8) ? HINT[Object.keys(HINT).find(k => k.length > 4 && sim(k, w) >= 0.8)] : null);
  function entities(){
    const out = [];
    (state.trips || []).forEach(t => t && t.name && out.push({ kind:'trips', name:t.name, pl:{ p:'nl-plans', tab:'trips', row:t.id } }));
    (typeof retirePlaces === 'function' ? retirePlaces() : []).forEach(x => x && x.name && out.push({ kind:'places', name:x.name, pl:{ p:'nl-plans', tab:'places', row:x.id } }));
    (state.externalAssets || []).forEach(a => a && a.name && out.push({ kind:'accounts', name:a.name, pl:{ p:'nl-future', tab:'accounts', row:a.id } }));
    (state.journal || []).forEach(j => j && (j.title || '').trim() && out.push({ kind:'notes', name:j.title, pl:{ p:'nl-notebook', tab:'notes', note:j.id } }));
    (state.nlFiles || []).forEach(f => f && f.name && out.push({ kind:'files', name:f.name.replace(/\.[a-z0-9]{2,5}$/i, ''), pl:{ p:'nl-notebook', tab:'files', file:f.id } }));
    (state.vault || []).forEach(v => v && v.title && out.push({ kind:'reports', name:v.title, pl:{ p:'nl-notebook', tab:'reports', report:v.id } }));
    try {
      const m = (typeof get12Months === 'function' ? get12Months() : [])[0];
      if(m){
        (m.expenseItems || []).filter(x => !x.fromTrip && !x.carryForward).forEach(x => out.push({ kind:'plan', name:x.name, pl:{ p:'nl-money', tab:'plan', filt:'expenses', row:'e:' + String(x.name).trim().toLowerCase() } }));
        (m.incomeItems || []).filter(x => !x.carryForward).forEach(x => out.push({ kind:'plan', name:x.name, pl:{ p:'nl-money', tab:'plan', filt:'income', row:'i:' + String(x.name).trim().toLowerCase() } }));
      }
    } catch(_){}
    return out;
  }
  const KIND = { trips:'trip', places:'place to retire', accounts:'account or pension', notes:'note', files:'file', reports:'report', plan:'line in your Money plan' };
  // Returns a decision, or null.
  function things(qAll, qContent){
    // Months
    let mi = -1, mWord = null, year = null, age = null;
    qAll.forEach((w, i) => {
      if(/^20\d\d$/.test(w)) year = +w;
      if(mi < 0 && monIdx(w) >= 0 && !(w === 'may' && qAll[i + 1] === 'i') && !(w === 'mar' && false)){ mi = monIdx(w); mWord = w; }
      if((w === 'age' || w === 'alder') && /^\d{2}$/.test(qAll[i + 1] || '')) age = +qAll[i + 1];
    });
    const hints = new Set(qContent.map(hintOf).filter(Boolean));
    const known = w => monIdx(w) >= 0 || /^\d+$/.test(w) || hintOf(w) || ['this','next','last','month','manad','age','alder','life','liv'].includes(w);
    const left = qContent.filter(w => !known(w));
    if(mi >= 0 && !left.length){
      const n = now(); let y = year || (mi + 1 >= n.m ? n.y : n.y + 1);
      const key = keyOf(y, mi + 1), off = (y - n.y) * 12 + (mi + 1 - n.m);
      if(hints.has('forecast')){
        if(off < 0 || off > 11) return { kind:'say', text:`The forecast shows the next 12 months, from ${monLabel(keyOf(n.y, n.m))}. ${monLabel(key)} is not in it.`, buttons:[{ label:'Open the forecast', go:{ p:'nl-money', tab:'forecast' } }] };
        return { kind:'go', pl:{ p:'nl-money', tab:'forecast', row:key }, what:monLabel(key) };
      }
      if(off < -1 || off > 35) return { kind:'say', text:`The Money plan goes from last month to 3 years ahead. ${monLabel(key)} is outside that.${off > 35 ? ' For later years, use Years ahead.' : ''}`, buttons:[{ label:'Open Years ahead', go:{ p:'nl-money', tab:'years' } }] };
      return { kind:'go', pl:{ p:'nl-money', tab:'plan', month:key }, what:monLabel(key) };
    }
    if(year && mi < 0 && !left.length){
      if(hints.has('wall')) return brick(year);
      const n = now(), last = n.y + Math.max(0, (state.retirementAge || 67) - (state.currentAge || 40));
      if(year < n.y || year > last) return { kind:'say', text:`Years ahead runs from ${n.y} to ${last}, the year you retire. ${year} is outside that.`, buttons:[{ label:'Open Years ahead', go:{ p:'nl-money', tab:'years' } }, { label:'Open your life wall', go:{ p:'nl-future', tab:'wall' } }] };
      return { kind:'go', pl:{ p:'nl-money', tab:'years', row:year }, what:String(year) };
    }
    if(age && !left.length){ const y = now().y + (age - (state.currentAge || 0)); return brick(y, age); }
    // Named things
    const ents = entities(), qs = fold(qContent.join(' '));
    const hits = ents.map(e => { const nt = toks(e.name); if(!nt.length) return null;
      const all = nt.every(t => qContent.some(q => sim(t, q) >= 0.8));
      const inside = fold(e.name).length >= 3 && qs.includes(toks(e.name).join(' '));
      const qn = qContent.filter(q => !hintOf(q) && !DOING.has(q) && !VERB.has(q));
      const part = nt.length > 1 && qn.length && qn.join('').length >= 5 && qn.every(q => nt.some(t => sim(t, q) >= 0.8));
      return all || inside ? { e, n:nt.length + 1 } : part ? { e, n:qn.length / nt.length } : null; }).filter(Boolean)
      .filter(h => !hints.size || hints.has(h.e.kind) || (h.e.kind === 'plan' && [...hints].every(k => k === 'plan')));
    if(hits.length){
      const used = new Set(); hits.forEach(h => toks(h.e.name).forEach(t => qContent.forEach(q => { if(sim(t, q) >= 0.8) used.add(q); })));
      const rest = qContent.filter(w => !used.has(w) && !hintOf(w) && !DOING.has(w) && !VERB.has(w));
      if(rest.length > 1) return null;
      const best = Math.max(...hits.map(h => h.n)), top = hits.filter(h => h.n === best);
      if(top.length === 1){
        // A name that is also an everyday word (an account called "Savings"): offer both.
        const tm = taskMatch(qContent)[0];
        if(tm && tm.s >= 0.72 && toks(top[0].e.name).join(' ') === qContent.join(' ')) return { kind:'choose', text:'Which one do you mean?', options:[{ label:`${top[0].e.name} (${KIND[top[0].e.kind]})`, go:top[0].e.pl }, { label:tm.t.label, go:tm.t.place, task:tm.t.id }] };
        return { kind:'go', pl:top[0].e.pl, what:top[0].e.name };
      }
      return { kind:'choose', text:'Which one do you mean?', options:top.slice(0, 3).map(h => ({ label:`${h.e.name} (${KIND[h.e.kind]})`, go:h.e.pl })) };
    }
    // A kind word plus a name that doesn't exist → say why.
    const kinds = [...hints].filter(k => ['trips','places','accounts','notes','files','reports'].includes(k));
    const name = left.filter(w => !DOING.has(w) && !VERB.has(w));
    const tm0 = taskMatch(qContent)[0];
    if(kinds.length === 1 && name.length && name.length <= 3 && !(tm0 && tm0.s >= 0.95)){
      const k = kinds[0], have = ents.filter(e => e.kind === k).map(e => e.name);
      const raw = name.join(' ');
      const pl = PLACES.find(p => p.id === k);
      return { kind:'say', missed:true, text:`There is no ${KIND[k]} called “${raw}”.${have.length ? ` You have: ${have.slice(0, 5).join(', ')}${have.length > 5 ? '…' : ''}.` : ` You have none yet.`}`,
        buttons:[{ label:'Open ' + placeName(pl), go:{ p:pl.p, tab:pl.tab } }] };
    }
    return null;
  }
  function brick(y, age){
    const bricks = typeof getLifeWallData === 'function' ? getLifeWallData(NLP.ui('nl-future').gran || 2) : [];
    const b = bricks.find(x => y >= x.startYear && y <= x.endYear);
    if(!b) return { kind:'say', text:`Your life wall runs from ${bricks[0] ? bricks[0].startYear : 'now'} to ${bricks.length ? bricks[bricks.length - 1].endYear : 'the end of your plan'}. ${age ? 'Age ' + age : y} is outside it.`, buttons:[{ label:'Open your life wall', go:{ p:'nl-future', tab:'wall' } }] };
    return { kind:'go', pl:{ p:'nl-future', tab:'wall', row:b.startYear }, what:age ? `age ${age} (${y})` : String(y) };
  }

  // ── The reader ───────────────────────────────────────────────────────────
  const DOING = new Set(['delete','remove','erase','apply','submit','send','sign','press','click','confirm','disconnect','radera','skicka','bekrafta'].map(stem));
  const VERB = new Set(['add','new','change','edit','set','update','make','create','upload','import','connect','switch','use','fill','sort','write','plan','book','compare','move','adjust','modify','lagg','andra','byt','skapa','ny','nytt'].map(stem));
  const RX = {
    how:/^(how (do|can|should|would) (i|we|you)|how to|how does one|where (do|can) i (change|set|add|edit|find|update)|hur (gor|kan|ska) (jag|man)|var (andrar|hittar|lagger) jag)\b/,
    howSv:/^(hur|var) (\w+) (jag|man)\b/,
    walk:/^(walk me through|walk through|guide me( through)?|show me how( to)?|teach me how( to)?|take me through|visa mig hur|guida mig( genom)?)\b/,
    question:/^(why|what|whats|when|which|who|should|would|will|is|are|am|was|were|does|did|do i have|have i|can i afford|could i|explain|tell me|describe|varfor|vad|nar|vilken|ska|borde|racker|har jag|forklara|hur mycket|how much|how many|how long|how is|how are|hows)\b/,
    polite:/^(could|can|would|will) you (please )?|^please |^kan du |^skulle du /,
    navverb:/\b(take me|go to|goto|open|show me|show|find|where|bring me|navigate|jump to|ga till|oppna|visa|var ar|var finns|hitta)\b/,
    changeNum:/\b(change|set|raise|lower|increase|reduce|cut|make|move|add|put|put|andra|hoj|sank|lagg|minska|oka)\b/,
  };
  const strip = (s, rx) => s.replace(rx, '').trim();
  function taskMatch(qTok){
    const sc = prepared.map(({ t, phr }) => ({ t, s:Math.max(0, ...phr.map(p => score(p, qTok))) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    return sc;
  }
  // Decide (no side effects). Exposed for the tests as NLD.read(text).
  function read(text){
    let s = fold(String(text || '').trim()).replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if(!s || s.length > 160) return null;
    s = strip(s, RX.polite);
    const hasNav = RX.navverb.test(s);
    // d) How do I … → the Handbook chapter
    if(RX.how.test(s) || RX.howSv.test(s)){
      const q = toks(RX.how.test(s) && !/^(hur|var) /.test(s) ? strip(s, RX.how) : s.replace(RX.howSv, '$2')); const m = taskMatch(q);
      if(m.length && m[0].s >= 0.62 && (!m[1] || m[0].s - m[1].s >= 0.06)) return { kind:'chapter', task:m[0].t.id };
      if(m.length && m[0].s >= 0.55) return { kind:'choose', text:'Which of these do you mean?', options:m.filter(x => x.s >= m[0].s - 0.12).slice(0, 3).map(x => ({ label:BOOK()[x.t.id] ? BOOK()[x.t.id].title : x.t.label, chapter:x.t.id })) };
      return { kind:'miss' };
    }
    // Walk me through it (app steps) — only when it names a task with an action; money lessons stay with the AI.
    if(RX.walk.test(s)){
      const rest = strip(s, RX.walk), q = toks(rest);
      if(!q.some(w => VERB.has(w) || [...VERB].some(v => v.length > 3 && sim(v, w) >= 0.85))) return null;
      const m = taskMatch(q);
      if(m.length && m[0].s >= 0.62 && (!m[1] || m[0].s - m[1].s >= 0.06)) return { kind:'guide', task:m[0].t.id };
      return null;
    }
    if(RX.question.test(s) && !hasNav){ const m = taskMatch(toks(s)); if(m.length && m[0].s >= 0.95 && (!m[1] || m[1].s < 0.95)) return { kind:'go', pl:m[0].t.place, task:m[0].t.id }; return null; }
    const all = toks(s, true), content = toks(s);
    // A change with a number is doing, not moving: the AI prepares it.
    if(RX.changeNum.test(s) && all.some(w => /^\d/.test(w) && !/^20\d\d$/.test(w))) return null;
    const doing = content.some(w => DOING.has(w));
    const q = content.filter(w => !DOING.has(w));
    if(!q.length) return null;
    // a) place words: the whole request is a place
    const joined = q.join(' ');
    const pw = placePhr.find(x => x.phr.includes(joined)) || placePhr.find(x => x.phr.some(p => p.split(' ').length === q.length && p.split(' ').every((t, i) => typo(t, q[i]))));
    if(pw) return { kind:'go', pl:pw.pl, doing };
    // b) things inside pages
    const th = things(all, q); if(th) return Object.assign(th, { doing });
    // c) everyday words for tasks
    const m = taskMatch(q);
    const looksNav = hasNav || q.length <= 4 || doing;
    if(m.length && looksNav){
      const top = m[0], close = m.filter(x => x.s >= Math.max(0.55, top.s - 0.1));
      const samePlace = close.every(x => JSON.stringify(x.t.place) === JSON.stringify(top.t.place));
      if((top.s >= 0.72 || (top.s >= 0.6 && close.length === 1)) && (close.length === 1 || samePlace)) return { kind:'go', pl:top.t.place, task:top.t.id, doing };
      if(top.s >= 0.55) return { kind:'choose', text:'Which of these do you mean?', options:close.slice(0, 3).map(x => ({ label:x.t.label, go:x.t.place, task:x.t.id })), doing };
    }
    return looksNav ? { kind:'miss' } : null;
  }

  // ── Talking back (messages in the conversation) ──────────────────────────
  const chat = () => (state.nl && Array.isArray(state.nl.chat)) ? state.nl.chat : null;
  function say(text, buttons, extra){
    const c = chat(); if(!c) return;
    const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    c.push(Object.assign({ role:'assistant', kind:'dir', id, at:Date.now(), content:text, buttons:buttons || [] }, extra || {}));
    return id;
  }
  const RULE_SETUP = 'Horizon needs your citizenship and home base before it can open that page, because taxes and pensions depend on them. You can lift this yourself by finishing Setup.';
  // Act on a decision. Returns true when handled (the AI is not called).
  function act(d, text){
    if(!d) return false;
    if(d.kind === 'miss'){ remember(text); return false; }
    const doingNote = d.doing ? ' I only take you there: pressing the button is yours to do.' : '';
    if(d.kind === 'go'){
      const r = land(d.pl);
      if(r.blocked === 'setup'){ say(RULE_SETUP, [{ label:'Finish setup', go:{ p:'nl-setup' } }]); return true; }
      const where = d.what ? `**${d.what}** in ${placeName(d.pl)}` : `**${placeName(d.pl)}**`;
      const book = d.task && BOOK()[d.task] ? [{ label:'How do I do it?', chapter:d.task }] : [];
      say(`Here is ${where}.${syncNote(d.pl)}${doingNote}`, book);
      return true;
    }
    if(d.kind === 'choose'){ say(d.text + doingNote, d.options.concat([{ label:'None of these: ask Horizon', ask:text }])); return true; }
    if(d.kind === 'say'){ if(d.missed) remember(text); say(d.text, d.buttons || []); return true; }
    if(d.kind === 'chapter'){ chapterMsg(d.task); return true; }
    if(d.kind === 'guide'){ say(`Let’s do it together: **${(BOOK()[d.task] || {}).title || TASK[d.task].label}**. Press the outlined part each time. I never press anything for you.`, [{ label:'Stop', stop:true }]); guide(d.task); return true; }
    return false;
  }
  function syncNote(pl){
    if(pl.p === 'nl-settings' && pl.set === 'sync'){ const on = typeof HZCloud !== 'undefined' && HZCloud && HZCloud.isConfigured && HZCloud.isConfigured(); return on ? '' : ' Sync is not connected on this device yet: **Connect and sign in** starts it.'; }
    return '';
  }
  function chapterMsg(id){
    const ch = BOOK()[id], t = TASK[id]; if(!ch) return;
    const steps = stepsText(ch, t);
    say(`**${ch.title}**\n` + steps.map((x, i) => `${i + 1}. ${x}`).join('\n'),
      [{ label:'Take me there', go:t.place, task:id }, { label:'Walk me through it', guide:id }, { label:'Open the chapter', book:id }], { chapter:id });
  }
  function stepsText(ch, t){ return ch.steps.map(st => st === '@go' ? `Open **${placeName(t.place)}**.` : Array.isArray(st) ? st[0] : st); }
  const mdLite = s => H(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  window.NL_MSG_RENDER = window.NL_MSG_RENDER || [];
  window.NL_MSG_RENDER.push((m, i) => {
    if(!m || m.kind !== 'dir') return null;
    const b = (m.buttons || []).map((x, j) => `<button type="button" class="${j === 0 && !x.ask && !x.stop ? 'nld-b main' : 'nld-b'}" onclick="NLD.press('${m.id}',${j})">${H(x.label)}</button>`).join('');
    return `<div class="nl-msg ai nld">${mdLite(m.content)}${b ? `<div class="nld-bs">${b}</div>` : ''}</div>`;
  });
  function press(id, j){
    const c = chat() || []; const m = c.find(x => x.id === id); const b = m && m.buttons && m.buttons[j]; if(!b) return;
    if(b.go){ const r = land(b.go); if(r.blocked === 'setup'){ say(RULE_SETUP, [{ label:'Finish setup', go:{ p:'nl-setup' } }]); save(); NLP.refreshPanel(); } return; }
    if(b.chapter){ chapterMsg(b.chapter); save(); NLP.refreshPanel(); return; }
    if(b.guide){ guide(b.guide); return; }
    if(b.book){ openBook(b.book); return; }
    if(b.stop){ stopGuide(); return; }
    if(b.ask){ window.__nlSkipReader = true; NLP.ask(b.ask); return; }
  }

  // ── The Handbook view ────────────────────────────────────────────────────
  function openBook(focus){
    const book = window.NL_HANDBOOK || [];
    const groups = {}; book.forEach(c => { const t = TASK[c.id]; const g = t && t.place.p ? PAGE[t.place.p] : 'The assistant and the app'; (groups[g] = groups[g] || []).push(c); });
    const html = `<h2 id="nl-info-title">Handbook</h2><p class="nld-bk-l">How to do things in Horizon, step by step. Ask “how do I …” and Horizon opens the right chapter.</p>` +
      Object.entries(groups).map(([g, cs]) => `<h3 class="nld-bk-g">${H(g)}</h3>` + cs.map(c => { const t = TASK[c.id];
        return `<details class="nld-bk-c" id="nld-ch-${H(c.id)}"${c.id === focus ? ' open' : ''}><summary>${H(c.title)}</summary><ol>${stepsText(c, t).map(x => `<li>${mdLite(x)}</li>`).join('')}</ol><div class="nld-bs"><button type="button" class="nld-b main" onclick="nlCloseInfo();NLD.go('${H(c.id)}')">Take me there</button><button type="button" class="nld-b" onclick="nlCloseInfo();NLD.guide('${H(c.id)}')">Walk me through it</button></div></details>`; }).join('')).join('') +
      `<p><button class="nl-black" type="button" onclick="nlCloseInfo()">Close</button></p>`;
    if(typeof window.nlOpenInfo === 'function') window.nlOpenInfo(html);
    if(focus) setTimeout(() => document.getElementById('nld-ch-' + focus)?.scrollIntoView({ block:'start' }), 60);
  }

  // ── Walk me through it: outline the next part to press; the person presses ──
  let G = null, gTimer = null;
  const SCOPES = ['.panel.active', '#nl-side', '#nl-bar', '#nl-menu', '#nl-tabbar', '#nl-info'];
  const visible = el => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  function findTarget(sel){
    if(!sel) return null;
    if(/^[#\[.]/.test(sel)){ for(const sc of SCOPES){ const root = document.querySelector(sc); const el = root && root.querySelector(sel); if(visible(el)) return el; } const el = document.querySelector(sel); return visible(el) ? el : null; }
    const want = fold(sel).replace(/\s+/g, ' ').trim(); let best = null;
    for(const sc of SCOPES){ const root = document.querySelector(sc); if(!root) continue;
      root.querySelectorAll('button,a,[role=tab],summary').forEach(el => { if(!visible(el)) return; const t = fold(el.textContent).replace(/\s+/g, ' ').trim();
        if(t === want || t.startsWith(want)){ if(!best || t.length < best.t.length) best = { el, t }; } });
      if(best) break; }
    return best ? best.el : null;
  }
  function guideSteps(id){
    const ch = BOOK()[id], t = TASK[id]; if(!ch || !t) return [];
    const out = [];
    ch.steps.forEach(st => {
      if(st === '@go'){ out.push(...navSteps(t.place)); return; }
      if(Array.isArray(st)) out.push({ t:st[0], target:st[1] }); else out.push({ t:st });
    });
    return out;
  }
  // The clicks a person makes to reach a place: top bar (or gear, or menu), then the tab.
  function navSteps(pl){
    const s = [];
    if(pl.menu){ s.push({ t:'Press **New look ▾** in the black bar.', target:'#nl-menu-btn', done:() => !document.getElementById('nl-menu')?.hidden }); return s; }
    if(pl.chat || pl.info) return s;
    const at = () => state.activePanel;
    if(SEC[pl.p]) s.push({ t:`Press **${PAGE[pl.p]}**${isPhone() ? "" : " at the top"}.`, target:`[data-nl-sec="${SEC[pl.p]}"]`, done:() => at() === pl.p });
    else if(pl.p === 'nl-settings') s.push({ t:'Press the gear (**Settings**) at the top right.', target:'#nl-gear', done:() => at() === 'nl-settings' });
    else if(pl.p === 'nl-setup'){ s.push({ t:'Press the gear (**Settings**) at the top right.', target:'#nl-gear', done:() => at() === 'nl-settings' || at() === 'nl-setup' });
      s.push({ t:'Press the **General** tab.', target:`.panel.active button[role=tab][onclick*="'general')"]`, done:() => at() === 'nl-setup' || (at() === 'nl-settings' && NLP.tabOf('nl-settings', 'general') === 'general') });
      s.push({ t:'Press **Change in Setup** (or **Finish setup**).', target:'#nlst-row-about button', done:() => at() === 'nl-setup' }); }
    if(pl.tab && TAB[pl.p][pl.tab]) s.push({ t:`Press the **${TAB[pl.p][pl.tab]}** tab.`, target:`.panel.active button[role=tab][onclick*="'${pl.tab}')"]`, done:() => at() === pl.p && NLP.tabOf(pl.p, Object.keys(TAB[pl.p])[0]) === pl.tab });
    return s;
  }
  function guide(id){
    stopGuide(true);
    const steps = guideSteps(id); if(!steps.length) return;
    if(TASK[id].place.p && TASK[id].place.p !== 'nl-setup' && TASK[id].place.p !== 'nl-settings' && !onboardOK()){ say(RULE_SETUP, [{ label:'Finish setup', go:{ p:'nl-setup' } }]); save(); NLP.refreshPanel(); return; }
    G = { id, steps, i:0, el:null };
    if(isPhone() && NLP.closeSheet) NLP.closeSheet();
    advanceDone(); paint();
    gTimer = setInterval(paint, 400);
  }
  function advanceDone(){ while(G && G.i < G.steps.length && G.steps[G.i].done && G.steps[G.i].done()) G.i++; }
  function paint(){
    if(!G) return;
    advanceDone();
    if(G.i >= G.steps.length){ finishGuide(); return; }
    const st = G.steps[G.i], el = findTarget(st.target);
    if(G.el !== el){ if(G.el) G.el.classList.remove('nld-ring'); G.el = el; if(el){ el.classList.add('nld-ring'); if(!G.scrolled){ el.scrollIntoView({ block:'nearest' }); } } }
    else if(el && !el.classList.contains('nld-ring')) el.classList.add('nld-ring');
    let bar = document.getElementById('nld-guide');
    // In the side panel, above the conversation, so it never covers the page; on a phone, above the tab bar.
    const home = !isPhone() && document.getElementById('nl-face-hd');
    if(!bar){ bar = document.createElement('div'); bar.id = 'nld-guide'; bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite'); }
    if(home && bar.previousElementSibling !== home) home.after(bar); else if(!home && bar.parentNode !== document.body) document.body.appendChild(bar);
    const html = `<span class="nld-gn">Step ${G.i + 1} of ${G.steps.length}</span><span class="nld-gt">${mdLite(st.t)}</span><span class="nld-ga">${!el ? '<button type="button" class="nld-b main" onclick="NLD.next()">Next</button>' : ''}<button type="button" class="nld-b" onclick="NLD.stop()">Stop</button></span>`;
    if(bar.dataset.k !== G.id + ':' + G.i + ':' + !!el){ bar.innerHTML = html; bar.dataset.k = G.id + ':' + G.i + ':' + !!el; }
  }
  function next(){ if(!G) return; if(G.el) G.el.classList.remove('nld-ring'); G.el = null; G.i++; paint(); }
  function finishGuide(){
    const bar = document.getElementById('nld-guide'); if(G && G.el) G.el.classList.remove('nld-ring');
    clearInterval(gTimer); G = null;
    if(bar){ bar.innerHTML = '<span class="nld-gt">Done. That’s all the steps.</span><span class="nld-ga"><button type="button" class="nld-b" onclick="NLD.stop()">Close</button></span>'; bar.dataset.k = 'done'; setTimeout(() => { if(!G && bar.dataset.k === 'done') bar.remove(); }, 4000); }
  }
  function stopGuide(quiet){ if(G && G.el) G.el.classList.remove('nld-ring'); clearInterval(gTimer); G = null; document.querySelectorAll('.nld-ring').forEach(x => x.classList.remove('nld-ring')); const bar = document.getElementById('nld-guide'); if(bar) bar.remove(); void quiet; }
  // The person's own press on the outlined part moves the guide on.
  document.addEventListener('click', e => { if(!G || !G.el) return; if(G.el === e.target || G.el.contains(e.target)){ const at = G.i; setTimeout(() => { if(G && G.i === at) next(); }, 350); } }, true);
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && G){ stopGuide(); } });

  // ── Misses: words the reader could not place (kept 90 days, no name) ──────
  const DAY = 864e5;
  function remember(text){
    try {
      if(!Array.isArray(state.nlMisses)) state.nlMisses = [];
      const cut = Date.now() - 90 * DAY;
      state.nlMisses = state.nlMisses.filter(x => x && x.at > cut);
      state.nlMisses.push({ t:String(text).slice(0, 160), at:Date.now(), page:state.activePanel || '' });
      state.nlMisses = state.nlMisses.slice(-300);
    } catch(_){}
  }
  const misses = () => { const cut = Date.now() - 90 * DAY; return (Array.isArray(state.nlMisses) ? state.nlMisses : []).filter(x => x && x.at > cut); };

  // ── Hooks used by the Ask box (index.html) ───────────────────────────────
  // Returns { handled:true } when a direction answered, so the AI is not called.
  window.nlReader = function(text){
    if(window.__nlSkipReader){ window.__nlSkipReader = false; return null; }
    let d = null; try { d = read(text); } catch(err){ console.warn('[nl] reader', err); return null; }
    return act(d, text) ? { handled:true } : null;
  };
  // The AI may add buttons to places on this fixed list (it can never invent one).
  let pendingLinks = [];
  window.nlTakeLinks = () => { const l = pendingLinks; pendingLinks = []; return l.length ? l : null; };
  window.nlLinksHtml = links => `<div class="nld-bs">${links.map(l => { const t = TASK[l] || null, p = PLACES.find(x => x.id === l);
    const label = t ? t.label : p ? 'Open ' + placeName(p) : null; return label ? `<button type="button" class="nld-b" onclick="NLD.go('${H(l)}')">${H(label)}</button>` : ''; }).join('')}</div>`;
  const LINK_IDS = PLACES.map(p => p.id).concat(TASKS.map(t => t.id)).filter((v, i, a) => a.indexOf(v) === i);
  NLP.addTool({
    def:{ name:'add_place_button', description:'Put a button under your answer that takes the person to a place in Horizon. Use it whenever your answer names a page, tab or task in the app. You cannot open pages yourself; the person presses the button. Only these ids exist.',
      input_schema:{ type:'object', properties:{ to:{ type:'string', enum:LINK_IDS } }, required:['to'], additionalProperties:false } },
    label:() => 'Adding a button',
    run(input){ const to = String(input.to || ''); if(!LINK_IDS.includes(to)) return { error:'Unknown place.' }; if(!pendingLinks.includes(to)) pendingLinks.push(to); return { ok:true, note:'A button will appear under your answer.' }; }
  });
  NLP.addSystem(`
- Places in Horizon (for directions): ${PLACES.map(p => `${p.id} = ${placeName(p)}`).join('; ')}. Tasks: ${TASKS.map(t => `${t.id} = ${t.label}`).join('; ')}. When your answer names one of these, call add_place_button so a button appears. Never describe a page or button that is not on this list.`);

  // ── For other files and the tests ────────────────────────────────────────
  window.NLD = {
    read, PLACES, TASKS, press, openBook, guide:id => guide(id), next, stop:() => stopGuide(),
    go(id){ const t = TASK[id], p = PLACES.find(x => x.id === id); const pl = t ? t.place : p; if(!pl) return; const r = land(pl); if(r.blocked === 'setup'){ say(RULE_SETUP, [{ label:'Finish setup', go:{ p:'nl-setup' } }]); save(); NLP.refreshPanel(); } },
    guideState:() => G ? { id:G.id, i:G.i, n:G.steps.length, step:G.steps[G.i] && G.steps[G.i].t, target:!!G.el } : null,
    guideSteps, findTarget, placeName, misses,
    missesHtml(){ const m = misses(); if(!m.length) return '<div class="nls-val">None yet</div><p class="nl-cs">When Horizon cannot place what you typed, the words are kept here for 90 days, so the task list can learn them.</p>';
      const top = {}; m.forEach(x => { const k = fold(x.t).trim(); top[k] = (top[k] || 0) + 1; });
      const list = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 8);
      return `<div class="nls-val">${m.length} in the last 90 days</div><ul class="nld-miss">${list.map(([t, n]) => `<li>“${H(t)}”${n > 1 ? ` ×${n}` : ''}</li>`).join('')}</ul>`; },
    missesActs(){ return misses().length ? `<span class="nls-acts">${NLP.link('Copy the list', 'NLD.copyMisses()')}${NLP.link('Clear', 'NLD.clearMisses()')}</span>` : ''; },
    copyMisses(){ const txt = misses().map(x => `${new Date(x.at).toISOString().slice(0, 10)}\t${x.page}\t${x.t}`).join('\n'); try { navigator.clipboard.writeText(txt).then(() => NLP.toast('Copied. Paste it to whoever looks after Horizon.'), () => NLP.toast('Copy didn’t work on this device.', 'warn')); } catch(_){ NLP.toast('Copy didn’t work on this device.', 'warn'); } },
    clearMisses(){ const before = state.nlMisses; state.nlMisses = []; save(); NLP.rerender(); NLP.toast('List cleared', '', { label:'Undo', fn:() => { state.nlMisses = before; save(); NLP.rerender(); } }); },
  };

  // ── Look ────────────────────────────────────────────────────────────────
  const css = `
html.nl .nl-msg.nld b { font-weight:600; }
html.nl .nld-bs { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
html.nl .nld-b { border:1px solid var(--nl-edge); background:var(--nl-surface); color:var(--nl-ink); border-radius:999px; padding:6px 12px; font:500 12.5px var(--nl-sans); cursor:pointer; min-height:32px; }
html.nl .nld-b.main { background:var(--nl-black); color:#fff; border-color:var(--nl-black); }
html.nl .nld-b:focus-visible { outline:2px solid var(--nl-accent); outline-offset:2px; }
html.nl .nld-ring { outline:2px solid var(--nl-accent) !important; outline-offset:3px !important; }
html.nl #nld-guide { display:flex; align-items:center; flex-wrap:wrap; gap:6px 12px; margin:12px 16px 0; background:var(--nl-surface); color:var(--nl-ink); border:1px solid var(--nl-line); border-left:3px solid var(--nl-accent); border-radius:10px; padding:10px 12px; font:13.5px/1.45 var(--nl-sans); flex:0 0 auto; }
html.nl.nl-phone #nld-guide { position:fixed; left:12px; right:12px; bottom:calc(76px + env(safe-area-inset-bottom,0px)); z-index:1100; margin:0; box-shadow:0 6px 20px rgba(17,17,19,.12); }
html.nl #nld-guide .nld-gn { flex:1 0 100%; }
html.nl .nld-gn { font-size:12px; color:var(--nl-detail); white-space:nowrap; }
html.nl .nld-gt { flex:1 1 220px; min-width:0; } html.nl .nld-gt b { font-weight:600; }
html.nl .nld-ga { display:flex; gap:6px; }
html.nl .nld-bk-l { color:var(--nl-quiet); margin:0 0 10px; }
html.nl .nld-bk-g { font:600 13px var(--nl-sans); color:var(--nl-detail); margin:14px 0 4px; }
html.nl .nld-bk-c { border-top:1px solid var(--nl-line); padding:8px 0; } html.nl .nld-bk-c summary { cursor:pointer; font-weight:500; }
html.nl .nld-bk-c ol { margin:8px 0 4px; padding-left:20px; } html.nl .nld-bk-c li { margin:0 0 4px; }
html.nl .nld-miss { margin:6px 0 0; padding-left:18px; font-size:13px; color:var(--nl-quiet); }
`;
  const st = document.createElement('style'); st.id = 'nl-directions-css'; st.textContent = css; document.head.appendChild(st);
})();

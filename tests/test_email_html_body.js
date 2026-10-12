/* v4.20 regression test — the email dialog must open DIRECTLY on the styled
   HTML preview, and every send path must deliver that HTML:
   1. modal opens with fmt = 'html' (HTML Preview tab active, body shows markup)
   2. "✉ Send Email" triggers a mailto AND downloads deep-honey-contract.html
   3. "📤 Open Gmail (HTML in body)" copies the HTML to clipboard + opens draft
   4. "⬇ Save .html" downloads the styled file */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
let src = fs.readFileSync('js/app.js', 'utf8');
src = src.replace('renderModal(); openModal();', 'window.__out = out; renderModal(); openModal();');

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.confirm = () => true; w.alert = () => {};
w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
w.CloudStore = { ready: true, load: async () => null, refresh: async () => {}, saveFields: async () => {}, saveAccepts: async () => {},
  saveDays: async () => {}, fields: () => ({}), accepts: () => ({}), wiped: () => false,
  days: () => [{ id: 'day1', html: '<section class="page" id="day1"><h3>Day 1 test page</h3><select class="day-finished-select" id="df-day1" data-day="day1"><option value="">—</option><option value="yes">Yes</option></select></section>' }] };
/* localStorage stub so restoreDays() can re-attach Day 1 on unlock */
const LS = {};
Object.defineProperty(w, 'localStorage', { value: {
  getItem: k => (k in LS ? LS[k] : null),
  setItem: (k, v) => { LS[k] = String(v); },
  removeItem: k => { delete LS[k]; },
}, configurable: true });
LS['dhContract.days.v1'] = JSON.stringify({ list: [{ id: 'day1', html: w.CloudStore.days()[0].html }] });
w.fetch = async () => ({ ok: true, blob: async () => ({ size: 10, type: 'image/png' }) });
w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, fillRect() {} });
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,TINYEMBED';
class FakeImg { constructor(){ this._s=''; } set src(v){ this._s=v; setTimeout(()=>this.onload&&this.onload(),0);} get src(){return this._s;} }
w.Image = FakeImg;

/* capture side effects */
const log = { mails: [], downloads: [], clips: [], opened: [] };
/* app.js runs inside w.eval → its bare `window` resolves to w, so patching the
   window object's own props lets us observe navigation & popups. jsdom's
   location.href setter throws "not implemented" — that error is our mailto signal. */
w.addEventListener('jsdomError', () => {});
/* jsdom's Location object is unforgeable on window — patch the Location
   INSTANCE instead so `window.location.href = 'mailto:…'` is captured. */
try {
  Object.defineProperty(w.location, 'href', {
    configurable: true,
    get() { return ''; },
    set(v) { log.mails.push(v); },
  });
} catch { /* keep native location */ }
w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
const realCreate = w.document.createElement.bind(w.document);
w.document.createElement = tag => { const el = realCreate(tag);
  if (tag === 'a') { el.click = () => log.downloads.push(el.download); }
  return el; };
w.navigator.clipboard = { writeText: async t => { log.clips.push(t); } };
w.open = url => { log.opened.push(url); return {}; };

try { w.eval(src); } catch (e) { console.log('EVAL ERR:', e.message); process.exit(1); }

(async () => {
  await new Promise(r => setTimeout(r, 300));
  /* unlock via the login gate so app handlers are live */
  const pw = w.document.getElementById('password-input');
  const overlay = w.document.getElementById('login-overlay');
  if (pw && overlay && !overlay.classList.contains('hidden')) {
    pw.value = 'Deepnectar@1612@';
    w.document.getElementById('login-btn').click();
    await new Promise(r => setTimeout(r, 500));
  }
  /* mark Day 1 finished */
  const fin = w.document.getElementById('df-day1');
  if (fin) { fin.value = 'yes'; fin.dispatchEvent(new w.Event('change', { bubbles: true })); }

  w.document.getElementById('email-contract').click();
  await new Promise(r => setTimeout(r, 800));

  const checks = [];
  const modalBody = w.document.getElementById('modal-body');
  const activeTab = w.document.querySelector('.modal-tabs button.active');
  checks.push(['modal is open', w.document.getElementById('email-modal').classList.contains('active')]);
  checks.push(['opens directly on HTML Preview tab', !!activeTab && activeTab.dataset.format === 'html']);
  checks.push(['modal body renders styled HTML markup', /<table|<div/.test(modalBody.innerHTML) && modalBody.className.includes('html-body')]);
  checks.push(['buildEmail produced HTML', !!w.__out && (w.__out.html || '').includes('Contract Overview')]);

  /* ✉ Send Email → mailto + HTML download */
  w.document.getElementById('modal-email-btn').click();
  /* v4.35: the mailto flow is async (ensureEmailContent awaits buildEmail) */
  await new Promise(r => setTimeout(r, 600));
  checks.push(['Send Email opens mailto', log.mails.some(m => m.startsWith('mailto:'))]);
  checks.push(['Send Email also downloads styled contract.html', log.downloads.includes('deep-honey-contract.html')]);

  /* 📤 Gmail button → clipboard HTML + compose URL */
  const gmail = w.document.getElementById('modal-gmail-btn');
  checks.push(['Gmail (HTML in body) button exists', !!gmail]);
  if (gmail) { gmail.click(); await new Promise(r => setTimeout(r, 600)); }
  checks.push(['Gmail flow copies full HTML to clipboard', log.clips.some(c => c.includes('Contract Overview'))]);
  checks.push(['Gmail compose window opened', log.opened.some(u => u.includes('mail.google.com/mail/?view=cm'))]);

  /* ⬇ Save .html button */
  w.document.getElementById('email-contract').click();
  await new Promise(r => setTimeout(r, 400));
  const dl = w.document.getElementById('modal-download-btn');
  checks.push(['Save .html button exists', !!dl]);
  if (dl) { dl.click(); await new Promise(r => setTimeout(r, 50)); }
  checks.push(['Save .html downloads the file', log.downloads.filter(d => d === 'deep-honey-contract.html').length >= 2]);

  let fail = 0;
  checks.forEach(([n, ok]) => { if (!ok) fail++; console.log((ok ? 'PASS' : 'FAIL') + ' · ' + n); });
  console.log(fail ? 'RESULT: FAIL (' + fail + ')' : 'RESULT: ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('RUN ERR:', e.stack); process.exit(1); });

/* v4.26 regression test (updated for v4.38) — 🚀 Send now must deliver
   PHOTOS inside the email: every exported <img> (base64 embed + onerror
   chain) is swapped for its public Google Drive pixel link, the payload
   stays well under the size limit, and the Web3Forms POST receives the
   clean HTML document as `message` (the rendered email body). */
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
const LS = {};
Object.defineProperty(w, 'localStorage', { value: {
  getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; },
}, configurable: true });
LS['dhContract.days.v1'] = JSON.stringify({ list: [{ id: 'day1', html: w.CloudStore.days()[0].html }] });
/* v4.38 — sending goes through web3forms.com ONLY; seed a valid access key
   in the new settings key so the 🚀 button is enabled. */
LS['dh_mail_v2'] = JSON.stringify({ publicKey: 'TESTKEY12345678' });
w.fetch = async () => ({ ok: true, blob: async () => ({ size: 10, type: 'image/png' }) });
w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, fillRect() {} });
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,' + 'A'.repeat(30000); /* heavy embed like real photos */
class FakeImg { constructor(){ this._s=''; } set src(v){ this._s=v; setTimeout(()=>this.onload&&this.onload(),0);} get src(){return this._s;} }
w.Image = FakeImg;
w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
w.addEventListener('jsdomError', () => {});

/* fake fetch — capture the single Web3Forms POST */
const sent = [];
w.fetch = async (url, opts) => {
  if (/api\.web3forms\.com/.test(url) || /web3forms/.test(String(url))) {
    const body = JSON.parse(opts.body);
    sent.push({ kind: 'send', url, body });
  }
  return { ok: true, status: 200, json: async () => ({ success: true, message: 'ok' }), text: async () => 'ok' };
};

try { w.eval(src); } catch (e) { console.log('EVAL ERR:', e.message); process.exit(1); }

(async () => {
  await new Promise(r => setTimeout(r, 300));
  const pw = w.document.getElementById('password-input');
  const overlay = w.document.getElementById('login-overlay');
  if (pw && overlay && !overlay.classList.contains('hidden')) {
    pw.value = 'Deepnectar@1612@';
    w.document.getElementById('login-btn').click();
    await new Promise(r => setTimeout(r, 500));
  }
  const fin = w.document.getElementById('df-day1');
  if (fin) { fin.value = 'yes'; fin.dispatchEvent(new w.Event('change', { bubbles: true })); }

  w.document.getElementById('email-contract').click();
  await new Promise(r => setTimeout(r, 800));

  /* typed recipient (manual, per user requirement) */
  const to = w.document.getElementById('ejs-send-to');
  to.value = 'honey@example.com';
  w.document.getElementById('modal-sendjs-btn').click();
  await new Promise(r => setTimeout(r, 600));

  const sendCall = sent.find(s => s.kind === 'send');
  const msg = sendCall ? sendCall.body.message : '';
  const checks = [];
  checks.push(['🚀 button POSTed to https://api.web3forms.com/submit', !!sendCall && /api\.web3forms\.com\/submit/.test(sendCall.url)]);
  checks.push(['access_key from ⚙ settings rides along', !!sendCall && sendCall.body.access_key === 'TESTKEY12345678']);
  checks.push(['recipient passed as email/replyto (typed manually)', !!sendCall && sendCall.body.email === 'honey@example.com' && sendCall.body.replyto === 'honey@example.com']);
  checks.push(['subject sent', !!sendCall && /Contract Data/.test(sendCall.body.subject || '')]);
  checks.push(['HTML lands directly in message (rendered email body)', /^<!DOCTYPE html>/i.test(msg.trim())]);
  checks.push(['NO iframe-srcdoc wrapper left in the payload', !/<iframe/.test(msg)]);
  checks.push(['payload carries INLINE styles (renders in Gmail)', /style=\"[^\"]*(color|background|font)/.test(msg)]);
  checks.push(['PHOTOS: all 4 images point at Drive pixel links lh3.googleusercontent.com/d/',
    ['1KnoE8uWAwugB0PRMiPmq32eCW-ZxMasj','1HRoqjVvSDswlROnookv0ykGagHwLQ6FI','1xT4SnUR8dtEHP14MUMFZnYZnumAS96Fw','17_Wt5nHtKbuDc7DiynDexI-l-GY8RpgS']
      .every(id => msg.includes('lh3.googleusercontent.com/d/' + id))]);
  checks.push(['payload comfortably under the 45 KB safety cap', Buffer.byteLength(msg) < 45 * 1024]);
  checks.push(['no base64 embeds left in the emailed copy', !msg.includes(';base64,')]);
  checks.push(['no JS onerror handlers leaked into emailed HTML', !/onerror=/.test(msg)]);

  let fail = 0;
  checks.forEach(([n, ok]) => { if (!ok) fail++; console.log((ok ? 'PASS' : 'FAIL') + ' · ' + n); });
  console.log(fail ? 'RESULT: FAIL (' + fail + ')' : 'RESULT: ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('RUN ERR:', e.stack); process.exit(1); });

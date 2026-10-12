/* v4.26 regression test — 🚀 Send now must deliver PHOTOS inside the email:
   every exported <img> (base64 embed + onerror chain) is swapped for its
   public Google Drive pixel link, the payload stays under EmailJS's 50 KB
   variable limit, and emailjs.send receives to_email/subject/{{message}}. */
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
/* v4.36 — app now defaults to FormSubmit; this test verifies the EmailJS
   path (fake SDK below), so pin the provider in the saved config. */
LS['dh_emailjs_v1'] = JSON.stringify({ provider: 'emailjs' });
w.fetch = async () => ({ ok: true, blob: async () => ({ size: 10, type: 'image/png' }) });
w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, fillRect() {} });
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,' + 'A'.repeat(30000); /* heavy embed like real photos */
class FakeImg { constructor(){ this._s=''; } set src(v){ this._s=v; setTimeout(()=>this.onload&&this.onload(),0);} get src(){return this._s;} }
w.Image = FakeImg;
w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
w.addEventListener('jsdomError', () => {});

/* fake EmailJS SDK v4 — capture init + send */
const sent = [];
w.emailjs = {
  init: o => { sent.push({ kind: 'init', publicKey: o.publicKey }); },
  send: async (svc, tpl, params) => { sent.push({ kind: 'send', svc, tpl, params }); return { text: 'OK' }; },
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
  const msg = sendCall ? sendCall.params.message : '';
  const checks = [];
  checks.push(['🚀 button triggered emailjs.init with pre-configured Public Key', sent.some(s => s.kind === 'init' && s.publicKey === 'gDRCzC6V8qn70e7mj')]);
  checks.push(['sent via Service ID service_a5vpbye / Template ID template_obq7xfj', !!sendCall && sendCall.svc === 'service_a5vpbye' && sendCall.tpl === 'template_obq7xfj']);
  checks.push(['recipient passed as to_email (typed manually)', !!sendCall && sendCall.params.to_email === 'honey@example.com']);
  checks.push(['subject passed to {{subject}}', !!sendCall && /Contract Data/.test(sendCall.params.subject || '')]);
  checks.push(['HTML lands directly in {{message}} (email body)', /^<!DOCTYPE html>/i.test(msg.trim())]);
  checks.push(['PHOTOS: all 4 images point at Drive pixel links lh3.googleusercontent.com/d/',
    ['1KnoE8uWAwugB0PRMiPmq32eCW-ZxMasj','1HRoqjVvSDswlROnookv0ykGagHwLQ6FI','1xT4SnUR8dtEHP14MUMFZnYZnumAS96Fw','17_Wt5nHtKbuDc7DiynDexI-l-GY8RpgS']
      .every(id => msg.includes('lh3.googleusercontent.com/d/' + id))]);
  checks.push(['payload far below EmailJS 50 KB limit', Buffer.byteLength(msg) < 48 * 1024]);
  checks.push(['no base64 embeds left in the emailed copy', !msg.includes(';base64,')]);
  checks.push(['no JS onerror handlers leaked into emailed HTML', !/onerror=/.test(msg)]);

  let fail = 0;
  checks.forEach(([n, ok]) => { if (!ok) fail++; console.log((ok ? 'PASS' : 'FAIL') + ' · ' + n); });
  console.log(fail ? 'RESULT: FAIL (' + fail + ')' : 'RESULT: ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('RUN ERR:', e.stack); process.exit(1); });

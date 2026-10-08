/* Headless test v2: minimal DOM via jsdom, but load app.js AFTER stubbing globals. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/' });
const win = dom.window;

win.fetch = p => {
  const fp = path.join('/workspace', String(p).replace(/^\.\//,''));
  try {
    const buf = fs.readFileSync(fp);
    return Promise.resolve({ ok: true, blob: () => Promise.resolve(buf) });
  } catch { return Promise.resolve({ ok: false }); }
};
const csStub = new Proxy({}, { get: (t, p) => {
  if (p === 'load') return async () => null;
  if (p === 'ready') return Promise.resolve(true);
  if (typeof p === 'string') return (...a) => ((p==='fields'||p==='accepts'||p==='days') ? {} : undefined);
}, set: () => true });
win.CloudStore = csStub;

// Mark Day 1 finished so export proceeds
const sel = dom.window.document.querySelector('.day-finished-select');
if (sel) sel.value = 'yes';

let src = fs.readFileSync('js/app.js','utf8');
// expose internals: app.js is an IIFE? check tail
const iifeEnd = src.lastIndexOf('})();');
src = src.slice(0, iifeEnd) + '\n  window.__test = { buildEmail };\n' + src.slice(iifeEnd);
const ctx = vm.createContext(Object.assign(win, { console, setTimeout, setInterval: () => 0, clearTimeout(){}, clearInterval(){} }));
try {
  vm.runInContext(src, ctx, { filename: 'app.js' });
} catch (e) {
  console.log('LOAD ERROR:', String(e.message).split('\n')[0]);
  process.exit(1);
}
const be = globalThis.__test ? globalThis.__test.buildEmail : dom.window.__test && dom.window.__test.buildEmail;
const target = be || (dom.window.eval('typeof buildEmail'));
(async () => {
  let out;
  try {
    out = await dom.window.__test.buildEmail();
  } catch(e){ console.log('buildEmail error:', e.message); process.exit(1); }
  if (!out) { console.log('NO OUTPUT'); process.exit(1); }
  fs.writeFileSync('/tmp/export.html', out.html);
  fs.writeFileSync('/tmp/export.txt', out.plain);
  const imgs = [...out.html.matchAll(/<img[^>]*>/g)];
  console.log('HTML size KB:', (out.html.length/1024).toFixed(1));
  console.log('img count:', imgs.length);
  imgs.forEach(m => console.log('  src head:', m[0].slice(0, 95)));
  console.log('has Contract Overview:', out.html.includes('Contract Overview'));
  console.log('has Always do (should be false):', out.html.includes('Always do'));
  console.log('sig rows Deep/Honey:', /Deep/.test(out.html), /Honey/.test(out.html));
  console.log('drive links:', (out.html.match(/drive\.google\.com\/file\/d/g)||[]).length);
})();

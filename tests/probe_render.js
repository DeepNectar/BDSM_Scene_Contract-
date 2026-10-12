/* Probe: does the app boot and render day pages + email modal in jsdom? */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.confirm = () => true;
w.alert = () => {};
w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));

let F = {}, D = [], A = {};
w.CloudStore = {
  ready: true,
  fields: () => F, saveFields(f) { F = f; return Promise.resolve(true); },
  days: () => D, saveDays(l) { D = l; return Promise.resolve(true); },
  accepts: () => A, saveAccepts(a) { A = a; return Promise.resolve(true); },
  load: async () => ({}), refresh: async () => ({ fields: F, accepts: A, days: D }),
};

w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, fillRect() {} });
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,TINYEMBED';
class FakeImg { constructor() { this._s = ''; } set src(v) { this._s = v; setTimeout(() => this.onload && this.onload(), 0); } get src() { return this._s; } }
w.Image = FakeImg;
w.fetch = async () => ({ ok: true, blob: async () => ({ size: 10, type: 'image/png' }) });

const srcTxt = fs.readFileSync('js/app.js', 'utf8');
try {
  w.eval(srcTxt);
} catch (e) {
  const m = /<anonymous>:(\d+):(\d+)/.exec(e.stack || '');
  console.log('EVAL FAIL at top-level:', e.message);
  if (m) {
    const ln = +m[1];
    console.log('app.js line ~' + ln + ':', srcTxt.split('\n')[ln - 1]);
  }
  process.exit(1);
}

setTimeout(() => {
  const d = w.document;
  console.log('pages:', Array.from(d.querySelectorAll('.page')).map(p => p.id).join(','));
  console.log('df-day1 exists:', !!d.getElementById('df-day1'));
  d.getElementById('email-contract').click();
  setTimeout(() => {
    console.log('modal active:', d.getElementById('email-modal').classList.contains('active'));
    console.log('body len:', (d.getElementById('modal-body') || {}).innerHTML ? d.getElementById('modal-body').innerHTML.length : 0);
    process.exit(0);
  }, 1500);
}, 600);

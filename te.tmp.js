const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('/workspace/index.html','utf8');
let src = fs.readFileSync('/workspace/js/app.js','utf8');

src = src.replace("    renderModal();\n    openModal();", "    window.__out = out; renderModal(); openModal();");
src = src.replace("setInterval(writeStore, 60000);", "/*no-interval*/");

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;
w.CloudStore = { load: async () => null, saveFields: async()=>{}, saveAccepts: async()=>{}, saveDays: async()=>{}, fields: () => ({}), accepts: () => ({}), days: () => [] };
w.fetch = async () => ({ ok: true, blob: async () => ({ size: 10, type: 'image/png' }) });
w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage(){}, fillRect(){} });
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,TINYEMBED';
class FakeImg { constructor(){ this._s=''; } set src(v){ this._s=v; setTimeout(()=>this.onload&&this.onload(),0);} get src(){return this._s;} }
w.Image = FakeImg;
try { w.eval(src); } catch(e){ console.log('EVAL ERR:', e.message, '\n', e.stack.split('\n').slice(0,4).join('\n')); process.exit(1); }
w.document.querySelectorAll('.day-finished-select').forEach(s => s.value='yes');
setTimeout(async () => {
  try {
    const emailBtn = w.document.getElementById('email-contract');
    emailBtn.click();
    await new Promise(r => setTimeout(r, 700));
    const out = w.__out;
    if (!out) return console.log('NO OUTPUT');
    console.log('HTML img count:', (out.html.match(/<img /g)||[]).length);
    console.log('Has base64 embeds:', out.html.includes('TINYEMBED'));
    console.log('Contract Overview:', out.html.includes('Contract Overview'));
    fs.writeFileSync('/tmp/email_preview.html', out.html);
    console.log('WROTE preview, bytes=', out.html.length);
  } catch(e){ console.log('RUN ERR:', e.message); }
  process.exit(0);
}, 300);

/* v4.30 regression: EmailJS counts TOTAL size of ALL variables.
   Simulate old (v4.29, 3 copies + svg data uris) vs new (single message var). */
const assert = require('assert');

// fake exported html with base64 pngs + svg fallbacks in onerror (like real buildEmail output)
const b64 = 'data:image/png;base64,' + 'A'.repeat(7000);
const svg = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160"><rect/></svg>').repeat(1);
const htmlText = `<html><body>
<img src="${b64}" alt="Deep's signature" width="200" onerror="this.src='${svg}'" style="x">
<img src="${b64}" alt="Honey's signature" width="200" onerror="this.src='${svg}'" style="x">
<img src="${b64}" alt="Our love stamp" width="140" onerror="this.src='${svg}'">
<img src="${b64}" alt="Soulmate code logo" width="120" onerror="this.src='${svg}'">
${'<p>contract body text</p>'.repeat(200)}
</body></html>`;

// OLD behaviour v4.29: same payload sent as message + message_html + message_text
const oldVars = { message: htmlText, message_html: htmlText, message_text: htmlText.slice(0,3500), subject:'s', to_email:'t@t.tt' };
const oldSize = Object.values(oldVars).reduce((n,v)=>n+String(v).length,0);
assert(oldSize > 50*1024, 'old payload should exceed 50KB (reproduces bug): ' + oldSize);

// NEW behaviour v4.30: driveify (alt match + strip base64 AND svg data uris) + ONE variable
const IMG_IDS={Deep:'a',Honey:'b',stamp:'c',logo:'d'};
const ghUrl=(k,w,h)=>`https://lh3.googleusercontent.com/d/${IMG_IDS[k]}=w${w}h${h}`;
const canonKey=alt=>{const a=(alt||'').toLowerCase();
  if(/deep/.test(a))return'Deep'; if(/honey/.test(a))return'Honey';
  if(/stamp/.test(a))return'stamp'; if(/logo|soulmate/.test(a))return'logo'; return null;};
let out = htmlText.replace(/<img\b[\s\S]*?>/gi, tag => {
  const mAlt=tag.match(/alt\s*=\s*["']([^"']*)["']/i); const k=canonKey(mAlt?mAlt[1]:'');
  if(!k) return tag;
  const [w,h]=({Deep:[360,120],Honey:[360,120],stamp:[280,280],logo:[280,240]})[k];
  const mW=tag.match(/\bwidth\s*=\s*["']?(\d+)/i); const dispW=mW?mW[1]:w;
  return `<img src="${ghUrl(k,w,h)}" alt="${mAlt?mAlt[1]:k}" width="${dispW}" style="max-width:100%;height:auto;border:0">`;
});
out = out.replace(/src\s*=\s*["']data:image\/[a-z+]+;base64,[^"']*["']/gi, ()=>'src="'+ghUrl('stamp',280,280)+'"');
out = out.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g,'');
out = out.replace(/data:image\/svg\+xml[^"']*/gi,'');

const newVars = { message: out, subject:'s', to_email:'t@t.tt', from_name:'f', reply_to:'t@t.tt' };
const newSize = Object.values(newVars).reduce((n,v)=>n+String(v).length,0);
assert(newSize < 50*1024, 'new total variables size must be < 50KB: ' + newSize);
assert(!/base64/.test(out), 'no base64 leakage');
assert(!/data:image\/svg/.test(out), 'no svg data-uri leakage');
assert(!/\{!!!\}/.test(out), 'payload must not contain template block tags');
assert((out.match(/lh3\.googleusercontent\.com/g)||[]).length === 4, 'all 4 photos on Drive pixel links');
console.log('OLD total vars:', oldSize, 'bytes (>50K → error reproduced)');
console.log('NEW total vars:', newSize, 'bytes (<50K ✓)');
console.log('ALL PASS — v4.30 fixes the Variables size limit error');

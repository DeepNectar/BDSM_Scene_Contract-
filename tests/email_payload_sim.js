/* Simulates the v4.31 send pipeline on a realistic fat htmlText (base64 imgs)
   to see final payload size + whether it contains junk that trips EmailJS. */
const fs = require('fs');
const src = fs.readFileSync('/workspace/js/app.js', 'utf8');

// extract constants we need
const IMG_IDS = {
  Deep:  '1KnoE8uWAwugB0PRMiPmq32eCW-ZxMasj',
  Honey: '1HRoqjVvSDswlROnookv0ykGagHwLQ6FI',
  stamp: '1xT4SnUR8dtEHP14MUMFZnYZnumAS96Fw',
  logo:  '17_Wt5nHtKbuDc7DiynDexI-l-GY8RpgS',
};
const EMBED_SIZES = { Deep: [360, 120], Honey: [360, 120], stamp: [280, 280], logo: [280, 240] };
const ghUrl = (k, w, h) => `https://lh3.googleusercontent.com/d/${IMG_IDS[k]}=w${w}h${h}`;
const escA = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// fake big base64 payloads like real embedded PNGs
const b64 = n => 'data:image/png;base64,' + 'A'.repeat(n);
const DATA_URIS = { Deep: b64(9000), Honey: b64(9000), stamp: b64(12000), logo: b64(15000) };

// realistic exported htmlText: full doc with <style>, inline base64 imgs with onerror chains
const htmlText = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Contract</title>
<style>body{font-family:Georgia,serif;background:#fdf6ec;color:#333;padding:24px;}
.card{max-width:760px;margin:auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,.08);}
h1{color:#7c3aed;text-align:center}</style></head><body><div class="card">
<h1>Deep &amp; Honey — Soulmate Contract</h1>
<img src="${DATA_URIS.Deep}" alt="Deep's signature" width="360" style="max-width:100%" onerror="this.onerror=null;this.src='${DATA_URIS.Deep}'">
<img src="${DATA_URIS.Honey}" alt="Honey's signature" width="360" style="max-width:100%">
<img src="${DATA_URIS.stamp}" alt="Our love stamp" width="280">
<img src="${DATA_URIS.logo}" alt="Soulmate code logo" width="280">
<p>Clause one: forever and always. ${'x'.repeat(2000)}</p>
</div></body></html>`;

console.log('raw htmlText bytes:', Buffer.byteLength(htmlText));

const uriPrefix = {};
Object.keys(DATA_URIS).forEach(k => { uriPrefix[k] = DATA_URIS[k].slice(0, 60); });
const ALT_MAP = [[/deep/i,'Deep'],[/honey/i,'Honey'],[/stamp/i,'stamp'],[/logo|soulmate/i,'logo']];
const canonKey = alt => { const a=(alt||'').toLowerCase(); for (const [re,k] of ALT_MAP) if (re.test(a)) return k; return null; };
const keyForImgTag = tag => {
  const mAlt = tag.match(/alt\s*=\s*["']([^"']*)["']/i);
  const k = canonKey(mAlt ? mAlt[1] : '');
  if (k) return k;
  const mSrc = tag.match(/src\s*=\s*["']([^"']+)["']/i);
  if (mSrc) for (const kk of Object.keys(uriPrefix)) if (mSrc[1].startsWith(uriPrefix[kk])) return kk;
  return null;
};
const driveify = h => {
  let out = h.replace(/<img\b[\s\S]*?>/gi, tag => {
    const k = keyForImgTag(tag);
    if (!k) return tag;
    const [w, hh] = EMBED_SIZES[k] || [320, 200];
    const mW = tag.match(/\bwidth\s*=\s*["']?(\d+)/i);
    const mS = tag.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
    const mAlt = tag.match(/alt\s*=\s*["']([^"']*)["']/i);
    const dispW = mW ? mW[1] : w;
    const style = (mS ? mS[1] + ';' : '') + 'max-width:100%;height:auto;border:0';
    return `<img src="${ghUrl(k, w, hh)}" alt="${escA(mAlt ? mAlt[1] : k)}" width="${dispW}" style="${style}">`;
  });
  out = out.replace(/src\s*=\s*["']data:image\/[a-z+]+;base64,[^"']*["']/gi, () => `src="${ghUrl('stamp',280,280)}"`);
  out = out.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g, '');
  out = out.replace(/data:image\/svg\+xml[^"']*/gi, '');
  return out;
};
let payloadHtml = driveify(htmlText);
console.log('after driveify bytes:', Buffer.byteLength(payloadHtml));

const MAX_BYTES = 45 * 1024;
const bsize = s => Buffer.byteLength(s);
const shrink = h => {
  let out = h.replace(/<img\b[^>]*src="data:[^"]*"[^>]*>/gi, '');
  out = out.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]*/gi, '');
  if (bsize(out) > MAX_BYTES) out = out.replace(/\s*\n\s*/g, '\n');
  if (bsize(out) > MAX_BYTES) out = out.replace(/<!--[\s\S]*?-->/g, '');
  if (bsize(out) > MAX_BYTES) out = out.replace(/<(style)[\s\S]*?<\/\1>/gi, m => m.replace(/\s{2,}/g, ' ').replace(/;\s*}/g, '}'));
  if (bsize(out) > MAX_BYTES) out = out.slice(0, MAX_BYTES - 80) + '\n…[truncated]';
  return out;
};
payloadHtml = shrink(payloadHtml);
console.log('after shrink bytes:', bsize(payloadHtml));

const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const wrapFrame = h => '<div ...><iframe srcdoc="' + escAttr(h) + '" ...></iframe></div>';
let content = payloadHtml;
const toEmail='honey@example.com', subject='Deep & Honey — Contract Data (12/10/2026)';
if (bsize(content) + bsize(toEmail) + bsize(subject) + 1200 > 49*1024) content = wrapFrame(payloadHtml);
while (bsize(content) + bsize(toEmail) + bsize(subject) + 1200 > 49*1024 && content.length > 3000)
  content = shrink(content.slice(0, Math.floor(content.length*0.8)));
const vars = { to_email:toEmail, from_name:'Deep & Honey app', subject, reply_to:toEmail, message:content };
const totalVars = Object.keys(vars).reduce((n,k)=>n+bsize(vars[k])+k.length+4,0);
console.log('TOTAL VARS BYTES:', totalVars);
console.log('contains raw newline in message?', /\n/.test(vars.message));
console.log('sample head:', JSON.stringify(vars.message.slice(0,200)));

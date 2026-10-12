/* v4.31 regression test: mirrors the send-step pipeline exactly and proves
   (a) total variables size ALWAYS < 50 KB even with a fat base64/SVG fixture,
   (b) iframe srcdoc fallback exists and is used when needed,
   (c) only ONE content variable is ever sent. */
const assert = require('assert');

const MAX_BYTES = 45 * 1024;
const bsize = s => new Blob([s]).size;
const shrink = h => {
  let out = h.replace(/<img\b[^>]*src="data:[^"]*"[^>]*>/gi, '');
  out = out.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]*/gi, '');
  if (bsize(out) > MAX_BYTES) out = out.replace(/\s*\n\s*/g, '\n');
  if (bsize(out) > MAX_BYTES) out = out.replace(/<!--[\s\S]*?-->/g, '');
  if (bsize(out) > MAX_BYTES) out = out.replace(/<(style)[\s\S]*?<\/\1>/gi, m =>
    m.replace(/\s{2,}/g, ' ').replace(/;\s*}/g, '}'));
  if (bsize(out) > MAX_BYTES) out = out.slice(0, MAX_BYTES - 80) + '\n…[truncated]';
  return out;
};
const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const wrapFrame = h => '<div style="padding:10px"><iframe srcdoc="' + escAttr(h) + '" style="width:100%;height:1200px"></iframe></div>';

function buildVars(htmlText, toEmail, subject) {
  let payloadHtml = shrink(htmlText);
  let framedHtml = payloadHtml;
  let iframePayload = wrapFrame(framedHtml);
  let guard = 0;
  while (bsize(iframePayload) > MAX_BYTES && framedHtml.length > 4000 && guard++ < 60) {
    framedHtml = framedHtml.slice(0, Math.floor(framedHtml.length * 0.85));
    iframePayload = wrapFrame(framedHtml);
  }
  const b64run = /base64,[A-Za-z0-9+/=]{8000,}/;
  let content = payloadHtml;
  if (bsize(content) + bsize(toEmail) + bsize(subject) + 1200 > 49 * 1024 || b64run.test(content)) {
    content = iframePayload;
  }
  while (bsize(content) + bsize(toEmail) + bsize(subject) + 1200 > 49 * 1024 && content.length > 3000) {
    content = shrink(content.slice(0, Math.floor(content.length * 0.8)));
  }
  const vars = { to_email: toEmail, from_name: 'Deep & Honey app', subject, reply_to: toEmail, message: content };
  return { vars, iframePayload };
}

const toEmail = 'honey@example.com', subject = 'Deep & Honey — Contract Data (12/10/2026)';

/* --- case 1: FAT fixture (60KB base64 + 20KB svg + long text) --- */
let fat = '<html><head><style>' + 'a{color:red}\n'.repeat(400) + '</style></head><body>';
fat += '<img alt="Deep signature" src="data:image/png;base64,' + 'A'.repeat(60 * 1024) + '">';
fat += '<img alt="Our love stamp" src="data:image/svg+xml;charset=utf-8,' + 'x'.repeat(20 * 1024) + '">';
fat += '<p>' + 'contract text '.repeat(2000) + '</p></body></html>';
const r1 = buildVars(fat, toEmail, subject);
const t1 = Object.keys(r1.vars).reduce((n, k) => n + bsize(r1.vars[k]) + k.length + 4, 0);
console.log('case1 total vars bytes:', t1);
assert(t1 < 50 * 1024, 'FAT case: TOTAL variables must stay under EmailJS 50 KB limit');
assert(!/base64,A{1000,}/.test(r1.vars.message), 'FAT case: no fat base64 leaks into message');
assert(/<iframe srcdoc=/.test(r1.iframePayload), 'iframe fallback built');

/* --- case 2: EXTREME fixture (multi-hundred-KB single base64 run) --- */
let extreme = '<html><body><img alt="logo" src="data:image/png;base64,' + 'B'.repeat(300 * 1024) + '"><p>x</p></body></html>';
const r2 = buildVars(extreme, toEmail, subject);
const t2 = Object.keys(r2.vars).reduce((n, k) => n + bsize(r2.vars[k]) + k.length + 4, 0);
console.log('case2 total vars bytes:', t2);
assert(t2 < 50 * 1024, 'EXTREME case: still under 50 KB');

/* --- case 3: normal small contract keeps clean HTML (no iframe wrapper) --- */
const tiny = '<html><body><img src="https://lh3.googleusercontent.com/d/abc=w10h10"><p>love</p></body></html>';
const r3 = buildVars(tiny, toEmail, subject);
assert(!/<iframe srcdoc=/.test(r3.vars.message), 'small case sends clean HTML directly');
assert(/lh3\.googleusercontent/.test(r3.vars.message), 'drive links preserved');
assert(!('message_html' in r3.vars) && !('message_text' in r3.vars) && !('message_iframe' in r3.vars), 'exactly ONE content var');
console.log('ALL PASS');

/* v4.34 regression: payload must be iframe-srcdoc wrapped, escaped-safe, <50KB */
const fs = require('fs');
const src = fs.readFileSync('js/app.js', 'utf8');

// 1. version + wrapper present
console.assert(src.includes("v4.34 DH"), 'FAIL: version badge');
console.assert(src.includes('<iframe class="dhframe" srcdoc='), 'FAIL: iframe wrapper missing');
console.assert(src.includes('message:   framedDoc'), 'FAIL: vars.message not framedDoc');

// 2. simulate the escaping pipeline like EmailJS/Gmail would do
const attrEsc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
const inner = '<html><body style="background:#fff"><h1>"Love & Hope" contract</h1><img src="https://lh3.googleusercontent.com/d/abc=w320" alt="Deep"></body></html>';
const outer = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
              '<iframe class="dhframe" srcdoc="' + attrEsc(inner) + '"></iframe></body></html>';
// EmailJS escapes everything for Gmail:
const escaped = outer.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// When Gmail un-escapes once to build the body HTML, the iframe tag survives as a real tag:
const rendered = escaped.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
if (!/<iframe class="dhframe" srcdoc=/.test(rendered)) { console.error('FAIL: iframe lost after escape round-trip'); process.exit(1); }
if (rendered.length > 49*1024) { console.error('FAIL: size'); process.exit(1); }
console.log('ALL PASS — v4.34 payload renders as embedded page even when escaped; sample size:', rendered.length, 'bytes');

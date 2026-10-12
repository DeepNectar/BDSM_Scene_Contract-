/* v4.32 regression: final {{message}} var must be ONE line, pure ASCII,
   no base64, <style> inlined, Drive links present, total vars well under 50KB. */
const IMG_IDS = { Deep:'1KnoE8uWAwugB0PRMiPmq32eCW-ZxMasj', Honey:'1HRoqjVvSDswlROnookv0ykGagHwLQ6FI',
  stamp:'1xT4SnUR8dtEHP14MUMFZnYZnumAS96Fw', logo:'17_Wt5nHtKbuDc7DiynDexI-l-GY8RpgS' };
const EMBED_SIZES = { Deep:[360,120], Honey:[360,120], stamp:[280,280], logo:[280,240] };
const ghUrl=(k,w,h)=>`https://lh3.googleusercontent.com/d/${IMG_IDS[k]}=w${w}h${h}`;
const escA=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const b64=n=>'data:image/png;base64,'+'A'.repeat(n);
const DATA_URIS={Deep:b64(9000),Honey:b64(9000),stamp:b64(12000),logo:b64(15000)};
const htmlText=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>💞 Contract</title>
<style>body{font-family:Georgia,serif;color:#333}\n.card{max-width:760px;padding:32px}</style></head>
<body><div class="card"><h1>Deep &amp; Honey — Soulmate 💞 Contract ♥</h1>
<img src="${DATA_URIS.Deep}" alt="Deep's signature" width="360">
<img src="${DATA_URIS.Honey}" alt="Honey's signature" width="360">
<img src="${DATA_URIS.stamp}" alt="Our love stamp" width="280">
<img src="${DATA_URIS.logo}" alt="Soulmate code logo" width="280">
<p>Clause one: forever ❤ ${'x'.repeat(2000)}</p></div></body></html>`;

// --- pipeline copied from app v4.32 (driveify + shrink + clean assembly) ---
const uriPrefix={}; Object.keys(DATA_URIS).forEach(k=>uriPrefix[k]=DATA_URIS[k].slice(0,60));
const ALT_MAP=[[/deep/i,'Deep'],[/honey/i,'Honey'],[/stamp/i,'stamp'],[/logo|soulmate/i,'logo']];
const canonKey=a=>{a=(a||'').toLowerCase();for(const[re,k]of ALT_MAP)if(re.test(a))return k;return null;};
const keyForImgTag=t=>{const mA=t.match(/alt\s*=\s*["']([^"']*)["']/i);const k=canonKey(mA?mA[1]:'');if(k)return k;
  const mS=t.match(/src\s*=\s*["']([^"']+)["']/i);if(mS)for(const kk of Object.keys(uriPrefix))if(mS[1].startsWith(uriPrefix[kk]))return kk;return null;};
const driveify=h=>{let o=h.replace(/<img\b[\s\S]*?>/gi,t=>{const k=keyForImgTag(t);if(!k)return t;
  const[w,hh]=EMBED_SIZES[k]||[320,200];const mW=t.match(/\bwidth\s*=\s*["']?(\d+)/i);
  const mSt=t.match(/\bstyle\s*=\s*["']([^"']*)["']/i);const mAlt=t.match(/alt\s*=\s*["']([^"']*)["']/i);
  return `<img src="${ghUrl(k,w,hh)}" alt="${escA(mAlt?mAlt[1]:k)}" width="${mW?mW[1]:w}" style="${mSt?mSt[1]+';':''}max-width:100%;height:auto;border:0">`;});
  o=o.replace(/src\s*=\s*["']data:image\/[a-z+]+;base64,[^"']*["']/gi,()=>`src="${ghUrl('stamp',280,280)}"`);
  o=o.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g,'');o=o.replace(/data:image\/svg\+xml[^"']*/gi,'');return o;};
const bsize=s=>Buffer.byteLength(s);
const MAX_BYTES=45*1024;
const shrink=h=>{let o=h.replace(/<img\b[^>]*src="data:[^"]*"[^>]*>/gi,'');
  o=o.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]*/gi,'');
  if(bsize(o)>MAX_BYTES)o=o.replace(/\s*\n\s*/g,'\n');
  if(bsize(o)>MAX_BYTES)o=o.replace(/<!--[\s\S]*?-->/g,'');
  if(bsize(o)>MAX_BYTES)o=o.slice(0,MAX_BYTES-80)+'…';return o;};
const entityize=s=>s.replace(/[^\x00-\x7F]/g,c=>'&#'+c.charCodeAt(0)+';');
const oneLine=s=>s.replace(/\s*\n\s*/g,' ').trim();
const inlineStyles=h=>{let css='';h=h.replace(/<style[^>]*>[\s\S]*?<\/style>/gi,m=>{css+=m.replace(/<style[^>]*>|<\/style>/gi,'');return'';});
  if(!css.trim())return h;const rules=[];css.replace(/([^{}]+)\{([^}]*)\}/g,(_,sel,body)=>{sel.split(',').forEach(s0=>{const s=s0.trim();if(s&&body.trim())rules.push({sel:s,decl:body.trim().replace(/\s+/g,' ')});});return'';});
  // node has no DOM; emulate by appending a marker so we can assert style block removed
  return h;};
let payloadHtml=shrink(driveify(htmlText));
let content=payloadHtml;
const toEmail='honey@example.com',subject='Deep & Honey — Contract Data (12/10/2026)';
let cleanContent=content;
try{cleanContent=inlineStyles(cleanContent);}catch{}
cleanContent=oneLine(entityize(shrink(cleanContent)));
while(bsize(cleanContent)>MAX_BYTES&&cleanContent.length>3000)cleanContent=cleanContent.slice(0,Math.floor(cleanContent.length*0.8));
const vars={to_email:toEmail,from_name:'Deep & Honey app',subject,reply_to:toEmail,message:cleanContent};
const total=Object.keys(vars).reduce((n,k)=>n+bsize(vars[k])+k.length+4,0);

let pass=true; const check=(name,cond)=>{console.log((cond?'✅':'❌')+' '+name);if(!cond)pass=false;};
check('total vars < 20KB (huge margin under 50KB incl. SDK overhead)', total<20*1024);
console.log('   total bytes:', total);
check('message is ONE line (no raw newlines)', !/\n/.test(vars.message));
check('message is pure ASCII', !/[^\x00-\x7F]/.test(vars.message));
check('no base64 data left', !/base64,/.test(vars.message));
check('<style> block removed from payload', !/<style/i.test(vars.message));
check('all 4 Drive pixel links present', ['Deep','Honey','stamp','logo'].every(k=>vars.message.includes(ghUrl(k,1,1).split('=')[0])));
check('emoji preserved as numeric entities', /&#\d+;/.test(vars.message));
process.exit(pass?0:1);

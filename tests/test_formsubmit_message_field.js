/* v4.37 — proves the FormSubmit adapter posts the contract in the official
   MESSAGE field (rendered body) and does NOT leak escaped `message` /
   plain_text_version rows, and that the default provider is formsubmit. */
const fs = require('fs');
const src = fs.readFileSync('js/app.js', 'utf8');

let fails = 0;
const check = (name, ok) => { console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name); if (!ok) fails++; };

check('default provider upgraded to formsubmit', /ejsCfg\.provider = 'formsubmit'/.test(src));
check('dispatcher defaults to formsubmit when unset', /ejsCfg\.provider \|\| 'formsubmit'/.test(src));
check('_template raw_html removed (never a real option)', !/raw_html'\)/.test(src) && /_template', 'default'/.test(src));
check("MESSAGE field carries the HTML body", /fd\.append\('MESSAGE', html\)/.test(src));
check("no escaped lowercase message row for formsubmit", !/fd\.append\('message', html\)/.test(src));
check("no plain_text_version row for formsubmit", !/fd\.append\('plain_text_version'/.test(src));
check('endpoint auto-seeded from last recipient', /dh_email_to_last.*ejsCfg\.endpoint|if \(!ejsCfg\.endpoint\)/.test(src));
check('non-emailjs providers get clean docHtml', /ejsCfg\.provider !== 'emailjs'\) \? docHtml : framedDoc/.test(src));
check('cache-busting bumped app.js to v63', fs.readFileSync('index.html','utf8').includes('app.js?v=63'));
check('sw cache name bumped', fs.readFileSync('sw.js','utf8').includes('dh-contract-v70'));
check('sw precaches app.js?v=63', fs.readFileSync('sw.js','utf8').includes('./js/app.js?v=63'));
check('forced SW update + auto reload wired', /DH_SKIP_WAITING/.test(src) && /setTimeout\(\(\) => location\.reload\(\), 900\)/.test(src));
check('duplicate sections.js script removed', (fs.readFileSync('index.html','utf8').match(/sections\.js/g)||[]).length === 2 /* tag+comment */ || !(fs.readFileSync('index.html','utf8').match(/src="js\/sections\.js/g)||[]).length > 1);
check('version is v4.37 DH', /APP_VERSION = 'v4\.37 DH'/.test(src));

process.exit(fails ? 1 : 0);

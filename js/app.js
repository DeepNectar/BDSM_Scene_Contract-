/* ============================================================
   Deep & Honey · Eternal Contract — app logic
   Fixes vs. previous version:
   • Save/load keyed by stable element ids (was placeholder-based,
     which collided across the 4 identical day pages and scrambled data)
   • Real "Clear this day" buttons wired to each page's clear control
   • Auto-advance between DD/MM/YYYY and HH:MM fields
   • Toasts instead of blocking alerts; login shake feedback
   • Email export rebuilt from actual DOM structure (labels + fieldsets),
     replacing fragile sibling-traversal heuristics that silently dropped data
   • Particles use transform-only animation (GPU friendly)
   ============================================================ */
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- toast ---------- */
  const toastEl = $('#toast');
  let toastTimer;
  const toast = (msg, ms = 2600) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  };

  /* ---------- v2.4 DH — app version + "What's new in this version" ----------
     APP_VERSION is the single source of truth: it drives the badge shown on
     the home screen (header) so the version always stays in sync. When you
     bump a release here, also prepend one WHATS_NEW line describing it. */
  const APP_VERSION = 'v3.0 DH';
  const WHATS_NEW = [
    '✨ AI day-writer upgraded: pick MOOD (romantic / spicy / playful / intense / tender / slow burn), INTENSITY, WHO LEADS, VENUE, aftercare focus, special requests per partner, extra limits — plus a huge BDSM category & subcategory menu (sensory, bondage & rope, impact, sensation, power exchange, protocol, edging & denial, worship, roleplay, fetish, ritual, scene extras, aftercare & drop care) with safety rules baked into every choice.',
    '🗑 Delete a day manually: every day page now has a “✖ Delete day” button (the permanent Day 1 is protected). Deleted days vanish from the contract AND from the cloud sync.',
    '💌 HTML email completely restyled: romantic gradient banner, gold-rose dividers, labelled data cards, zebra-striped tables with wine headers, ✓ confirmed / ○ pending chips, RED-YELLOW-GREEN safeword pills, numbered day badges, signature panels and an elegant framed love-stamp footer — formatted data, not plain label dumps.',
    '♥ HTML email still carries EVERY important field from the Day section and the Pre-Scene Execution Affidavit: execution date & time, all checklist items, safeword verification, non-verbal signal, consent declarations, full toy inventory, debrief scores/notes/safeword-used, signature dates — plus Contract Overview and both signatures.',
    'Sign, stamp & logo preview everywhere — compressed base64 embeds with pixel-link and SVG fallbacks; no “View on Google Drive” text or links anywhere.'
  ];
  const versionBadge = $('#version-badge');
  if (versionBadge) {
    versionBadge.textContent = APP_VERSION + ' ♥';   // keep header text in sync automatically
    versionBadge.addEventListener('click', () => {
      toast('✨ What\'s new in ' + APP_VERSION + ':\n• ' + WHATS_NEW.join('\n• '), 12000);
    });
  }

  /* ---------- floating hearts (transform/opacity only → cheap) ---------- */
  const particleHost = document.createDocumentFragment();
  const SYMS = ['♥', '♡', '✦', '❥'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    p.textContent = SYMS[i % SYMS.length];
    p.style.left = Math.random() * 96 + 'vw';
    p.style.fontSize = (12 + Math.random() * 22) + 'px';
    p.style.setProperty('--dur', (16 + Math.random() * 18) + 's');
    p.style.setProperty('--delay', (-Math.random() * 30) + 's');
    p.style.setProperty('--dx', (Math.random() * 16 - 8) + 'vw');
    p.style.opacity = (0.05 + Math.random() * 0.08).toFixed(2);
    particleHost.appendChild(p);
  }
  document.body.appendChild(particleHost);

  /* ---------- login ---------- */
  const overlay  = $('#login-overlay');
  const pwInput  = $('#password-input');
  const pwToggle = $('#toggle-password');
  const errEl    = $('#login-error');
  const SECRET   = 'Deepnectar@1612@';

  const unlock = () => {
    overlay.classList.add('hidden');
    /* cloud state was already pulled at DOMContentLoaded — replay it after the gate opens */
    restoreDays(window.CloudStore.days());   // re-attach AI-created day pages first…
    loadSaved(window.CloudStore.fields());
    applySignatures();   // re-restore accepted signatures after the gate opens
    setTimeout(() => pwInput.blur(), 300);
  };

  const tryLogin = () => {
    if (pwInput.value.trim() === SECRET) {
      errEl.textContent = '';
      unlock();
    } else {
      errEl.textContent = 'Not our secret word… try again, my love.';
      pwInput.value = '';
      const card = $('.login-card');
      card.classList.remove('shake');
      void card.offsetWidth;            // restart animation
      card.classList.add('shake');
      pwInput.focus();
    }
  };

  $('#login-btn').addEventListener('click', tryLogin);
  pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  pwToggle.addEventListener('click', () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    pwToggle.textContent = show ? '🙈' : '👁';
  });

  /* ---------- value accessors (stable per-page keys → no collisions) ---------- */

  /* unique key for any field: page id + element id, or a structural DOM path */
  const keyFor = el => {
    const page = el.closest('.page');
    const pid  = page ? page.id : 'head';
    if (el.id) return `${pid}#${el.id}`;
    const path = [];
    for (let n = el; n && n !== page && n.id !== 'main-contract'; n = n.parentElement) {
      path.push(Array.from(n.parentElement.children).indexOf(n));
    }
    return `${pid}>${path.reverse().join('.')}`;
  };

  const collectState = () => {
    const data = {};
    $$('#main-contract input:not([type="checkbox"]):not([type="password"]), #main-contract textarea, #main-contract select')
      .forEach(el => { data[keyFor(el)] = el.value; });
    $$('#main-contract input[type="checkbox"]')
      .forEach(el => { data[keyFor(el)] = el.checked; });
    return data;
  };

  /* ---------- cloud save (Supabase only — never local storage) ---------- */
  let saveTimer;
  const writeStore = () => {                       // debounced autosave → cloud
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      window.CloudStore.saveFields(collectState())
        .then(ok => { if (!ok && !window.CloudStore.ready) softWarn(); });
    }, 1200);
  };
  const softWarn = () => {
    const t = $('#cloud-status');
    if (t) { t.textContent = '☁️ Cloud offline — set js/supabase-config.js'; t.title = 'Not saved to cloud; entries live in this session only.'; }
  };

  const save = () => {
    window.CloudStore.saveFields(collectState()).then(ok => {
      if (ok) toast('☁️ Saved to Supabase cloud — synced on every device.');
      else if (!window.CloudStore.ready) { softWarn(); toast('⚠️ Cloud not configured — entries kept in this session only. Add your Supabase keys in js/supabase-config.js.', 4200); }
      else toast('⚠️ Cloud save failed — check connection & retry.', 3600);
    });
  };

  const loadSaved = (data) => {
    if (!data) return;
    $$('#main-contract input, #main-contract textarea, #main-contract select').forEach(el => {
      const slot = el.closest('.initials-slot');
      if (slot?.classList.contains('slot-filled')) return;   // sealed signature owns this field
      if (el.readOnly) return;                               // accept-date pills own their value
      const k = keyFor(el);
      if (!(k in data)) return;
      if (el.type === 'checkbox') el.checked = !!data[k];
      else el.value = data[k];
      if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text' && el.maxLength === -1)) growInput(el);
    });
    autoGrowAll();
  };

  /* restore AI-created day pages (innerHTML kept verbatim → DOM paths stay stable),
     then replay saved values on top of them — all from the Supabase cloud */
  const restoreDays = (list) => {
    if (!list || !list.length) return;
    const summary = $('#summary');
    if (!summary) return;
    list.forEach(d => {
      if ($('#' + d.id)) return;                       // already present
      const tpl = document.createElement('template');
      tpl.innerHTML = d.html.trim();
      const section = tpl.content.firstElementChild;
      if (!section || section.tagName !== 'SECTION') return;
      $('#main-contract').insertBefore(section, summary);
      if (typeof wireNewDay === 'function') wireNewDay(section);
    });
    loadSaved(window.CloudStore.fields());             // replay field values into restored days
    syncAllLocks();
  };

  $('#save-contract').addEventListener('click', save);
  $('#print-pdf').addEventListener('click', () => window.print());
  setInterval(writeStore, 60000);          // gentle cloud autosave
  document.addEventListener('input', writeStore);   // live cloud sync as you type
  window.addEventListener('beforeunload', () => {
    if (window.CloudStore.ready) window.CloudStore.saveFields(collectState());
  });

  /* ============================================================
     PHOTO SIGNATURES ON ACCEPT
     Local images only — never hotlink Google Drive /view URLs
     (blocked by browsers & print/email contexts).
       Deep  ref: https://drive.google.com/file/d/1KnoE8uWAwugB0PRMiPmq32eCW-ZxMasj/view?usp=sharing → img/signature-deep.png
       Honey ref: https://drive.google.com/file/d/1HRoqjVvSDswlROnookv0ykGagHwLQ6FI/view?usp=sharing → img/signature-honey.png
     ============================================================ */
  const SIG_CONFIG = {
    Deep:  'img/signature-deep.png',
    Honey: 'img/signature-honey.png',
  };

  /* v2.1/v2.2 DH — PUBLIC image URLs for the HTML email export.
     base64 data URIs are blocked by many HTML-preview tools and email clients,
     and uc?export=view often returns an HTML warning page instead of image
     bytes, so exported <img src> use lh3.googleusercontent.com/d/<ID>=w<h>h<h>
     (always serves real pixels) while clickable links use /file/d/<ID>/view. */
  const IMG_IDS = {
    Deep:  '1KnoE8uWAwugB0PRMiPmq32eCW-ZxMasj',
    Honey: '1HRoqjVvSDswlROnookv0ykGagHwLQ6FI',
    stamp: '1xT4SnUR8dtEHP14MUMFZnYZnumAS96Fw',
    logo:  '17_Wt5nHtKbuDc7DiynDexI-l-GY8RpgS',
  };
  /* v2.4 DH — CRITICAL: the lh3.googleusercontent.com/d/<ID> endpoint only serves
     image bytes for files shared "Anyone with the link". For PRIVATE files it
     answers with an HTML sign-in page, so <img> silently fails in every preview.
     To make the export bullet-proof we ALSO embed each local img/ copy as a
     base64 data URI (works offline / in any viewer). If a previewer strips data
     URIs, the inline SVG fallback still draws the mark. */
  const ghUrl   = (k, w, h) => `https://lh3.googleusercontent.com/d/${IMG_IDS[k]}=w${w}h${h}`;
  const viewUrl = k => `https://drive.google.com/file/d/${IMG_IDS[k]}/view?usp=sharing`;

  const IMG_FILES = { Deep: 'img/signature-deep.png', Honey: 'img/signature-honey.png', stamp: 'img/love-stamp.png', logo: 'img/soulmate-logo.png' };
  let DATA_URIS = {};                       // key -> compressed base64 data URI (filled async before export)
  /* v2.5 DH — ROOT CAUSE of "images not previewing": the raw PNGs are 115–575 KB,
     so every exported <img src> carried a huge base64 string (multi-MB HTML).
     Many HTML previewers/email clients silently DROP oversized data URIs → blank.
     Fix: downscale each image on a canvas and re-encode as compact JPEG (~10–30 KB),
     which every viewer renders. If compression fails we still fall back to the
     plain lh3 Drive link + clickable /view anchor + SVG onerror mark. */
  const EMBED_SIZES = { Deep: [360, 120], Honey: [360, 120], stamp: [280, 280], logo: [280, 240] };
  const compressImg = (key, path) => new Promise(resolve => {
    fetch(path).then(r => (r && r.ok) ? r.blob() : null).then(blob => {
      if (!blob) return resolve('');
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const [w, h] = EMBED_SIZES[key] || [320, 200];
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#ffffff';               // white matte so transparent PNGs stay crisp
          ctx.fillRect(0, 0, w, h);
          const ar = Math.min(w / img.width, h / img.height);
          const dw = Math.round(img.width * ar), dh = Math.round(img.height * ar);
          ctx.drawImage(img, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
          resolve(cv.toDataURL('image/jpeg', 0.85));   // small, universally rendered
        } catch (_) { resolve(''); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
    }).catch(() => resolve(''));
  });
  const loadImageUris = () => Promise.all(Object.entries(IMG_FILES).map(([k, p]) =>
    compressImg(k, p).then(uri => { if (uri) DATA_URIS[k] = uri; })));

  /* v2.3 DH — inline SVG fallbacks drawn directly into the HTML so the sign and
     brand marks are ALWAYS visible in any previewer, even ones that block all
     remote images. The <img> still tries the Drive https link first; if it
     fails to load, onerror swaps in the matching SVG placeholder. */
  const escA = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/'/g,'&#39;');
  const wrapSvg = inner => 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160" viewBox="0 0 480 160">` +
    `<rect width="480" height="160" rx="14" fill="#fdf6f0" stroke="#c98a97" stroke-width="3"/>${inner}</svg>`);
  /* v2.6 DH — per-key canvas sizes so each SVG fallback keeps its true aspect
     ratio (the old fixed 480x160 viewBox squashed the square stamp/logo). */
  const SVG_SIZE = { Deep: [480, 160], Honey: [480, 160], stamp: [300, 300], logo: [300, 260] };
  const wrapSvgFor = (k, inner) => {
    const [w, h] = SVG_SIZE[k] || [480, 160];
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<rect width="${w}" height="${h}" rx="14" fill="#fdf6f0" stroke="#c98a97" stroke-width="3"/>${inner}</svg>`);
  };
  const SIG_SVG = {
    Deep:  wrapSvgFor('Deep',  `<text x="240" y="86" font-family="Georgia,serif" font-style="italic" font-size="52" fill="#7b2d3b" text-anchor="middle">&#10022; Deep &#9829;</text><text x="240" y="128" font-family="Arial,sans-serif" font-size="16" letter-spacing="4" fill="#a04b5c" text-anchor="middle">DOMINANT / TOP &#8212; SEALED</text>`),
    Honey: wrapSvgFor('Honey', `<text x="240" y="86" font-family="Georgia,serif" font-style="italic" font-size="52" fill="#a04b5c" text-anchor="middle">&#10022; Honey &#9829;</text><text x="240" y="128" font-family="Arial,sans-serif" font-size="16" letter-spacing="4" fill="#7b2d3b" text-anchor="middle">SUBMISSIVE / BOTTOM &#8212; SEALED</text>`),
    stamp: (() => { const c = wrapSvgFor('stamp', `<circle cx="150" cy="150" r="105" fill="none" stroke="#7b2d3b" stroke-width="3" stroke-dasharray="6 4"/><text x="150" y="140" font-family="Georgia,serif" font-style="italic" font-size="30" fill="#7b2d3b" text-anchor="middle">Our love</text><text x="150" y="178" font-family="Georgia,serif" font-size="24" fill="#a04b5c" text-anchor="middle">&#9829; stamp &#9829;</text>`); return c; })(),
    logo:  (() => { const c = wrapSvgFor('logo', `<text x="150" y="110" font-family="Georgia,serif" font-size="32" letter-spacing="4" fill="#7b2d3b" text-anchor="middle">SOULMATE</text><text x="150" y="150" font-family="Georgia,serif" font-size="26" letter-spacing="8" fill="#a04b5c" text-anchor="middle">CODE</text><text x="150" y="190" font-family="Georgia,serif" font-style="italic" font-size="13" fill="#5b4437" text-anchor="middle">&#9829; two hearts, one covenant &#9829;</text>`); return c; })(),
  };
  const UNDO_MS   = Infinity;              // v1.9 DH: undo is ALWAYS allowed — no sealing window

  /* ---------- per-area signature state (cloud-backed, in-memory mirror) ---------- */
  const BASE_AREAS = ['seal', 'signatories', 'debrief'];   // every area accepts independently
  let AREAS = [...BASE_AREAS];   // grows dynamically when the AI creates new day areas

  /* v1.9 DH — legacy fix: older builds stored Day-1 signatory/debrief accepts under
     the generic areas but showed Day-1 buttons without data-area (they fell back to
     'seal'), and Deep's Day-1 accepts were sometimes saved only under 'seal'.
     Once, on load, merge any seal-only accept into the signatories & debrief areas
     for the static pages (day1 / summary) so those Accept buttons show
     "Signed ✓ · Undo" instead of looking dead for Deep. Runs BEFORE syncAreas(). */
  const migrateLegacyAccepts = () => {
    const a = window.CloudStore.accepts();
    if (!a || typeof a !== 'object') return;
    let changed = false;
    const hasGeneric = !!(a['signatories'] || a['debrief']);
    if (!hasGeneric && a.seal) {
      ['signatories', 'debrief'].forEach(area => {
        if (!a[area]) { a[area] = JSON.parse(JSON.stringify(a.seal)); changed = true; }
      });
    }
    if (changed) window.CloudStore.saveAccepts(a);
  };
  /* discover any data-area present in the DOM (e.g. signatories-day2 / debrief-day2) */
  const syncAreas = () => {
    $$('#main-contract [data-area]').forEach(el => {
      const a = el.dataset.area;
      if (a && !AREAS.includes(a)) AREAS.push(a);
    });
  };
  const readAccepts = () => {
    const a = window.CloudStore.accepts() || {};
    // migrate legacy global format {Deep:{ts}} -> per-area {seal:{Deep:{ts}}, ...}
    if (a.Deep && typeof a.Deep.ts === 'number') {
      const migrated = {};
      BASE_AREAS.forEach(area => { migrated[area] = { Deep: a.Deep, Honey: a.Honey }; });
      window.CloudStore.saveAccepts(migrated);
      return migrated;
    }
    return a;
  };
  const writeAccepts = a => {
    window.CloudStore.saveAccepts(a)
      .then(ok => { if (!ok && !window.CloudStore.ready) toast('⚠️ Signature kept in this session only — cloud not configured.', 3400); });
  };

  /* v1.9 DH — normalise legacy buttons: any .accept-btn / .sig-card / .initials-slot
     without data-area inherits from its closest [data-area] ancestor, defaulting to
     'seal'. This makes every Accept/Undo button genuinely functional (previously a
     missing data-area could make Day-1 signs look dead for one party). */
  const normaliseAreas = (root = document) => {
    $$('[data-area]', root).forEach(hostEl => {
      const area = hostEl.dataset.area;
      $$('.accept-btn:not([data-area]), .initials-slot:not([data-area])', hostEl).forEach(el => {
        el.dataset.area = area;
      });
    });
    $$('.accept-btn:not([data-area])', root).forEach(b => { b.dataset.area = 'seal'; });
    $$('.initials-slot:not([data-area])', root).forEach(s => { s.dataset.area = 'seal'; });
  };

  /* overlay the signature image onto every slot of one party IN ONE AREA ONLY */
  const fillSlots = (party, area) => {
    $$(`.initials-slot[data-party="${party}"][data-area="${area}"]`).forEach(slot => {
      if (slot.classList.contains('slot-filled')) return;   // prevent duplicates
      const inp = $('input.editable-field', slot) || $('input', slot);
      const img = document.createElement('img');
      img.className = 'slot-sig';
      img.src = SIG_CONFIG[party] || '';
      img.alt = party + '\u2019s signature';
      img.loading = 'lazy';
      img.onerror = () => { img.remove(); if (inp) { inp.readOnly = false; slot.classList.remove('slot-filled'); } };
      slot.appendChild(img);
      if (inp && !inp.value.trim()) inp.value = party;      // prefill ONLY if empty
      if (inp) inp.readOnly = true;
      slot.classList.add('slot-filled');
    });
    /* signatory / debrief date pills in this area: auto-fill today's date when empty */
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const dmy = [pad(now.getDate()), pad(now.getMonth() + 1), String(now.getFullYear())];
    $$('.sign-row').forEach(row => {
      if (!$(`.initials-slot[data-party="${party}"][data-area="${area}"]`, row)) return;
      const pill = $('.datetime-group', row);
      if (!pill) return;
      $$('input', pill).forEach((inp, i) => { if (!inp.value.trim()) inp.value = dmy[i] || ''; });
    });
  };

  /* undo: remove image, unlock input, clear only our auto-filled name/date — THIS AREA ONLY */
  const clearSlots = (party, area) => {
    $$(`.initials-slot[data-party="${party}"][data-area="${area}"]`).forEach(slot => {
      const img = $('.slot-sig', slot);
      if (img) img.remove();
      const inp = $('input.editable-field', slot) || $('input', slot);
      if (inp) {
        inp.readOnly = false;
        if (inp.value.trim() === party) inp.value = '';     // never delete user-typed text
      }
      slot.classList.remove('slot-filled');
    });
    /* clear only the dates we auto-filled (still matching today) in this area */
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const dmy = [pad(now.getDate()), pad(now.getMonth() + 1), String(now.getFullYear())];
    $$('.sign-row').forEach(row => {
      if (!$(`.initials-slot[data-party="${party}"][data-area="${area}"]`, row)) return;
      const pill = $('.datetime-group', row);
      if (!pill) return;
      $$('input', pill).forEach((inp, i) => { if (inp.value.trim() === (dmy[i] || '')) inp.value = ''; });
    });
  };

  const syncAreaUI = (party, area, accepted) => {
    $$(`.accept-btn[data-party="${party}"][data-area="${area}"]`).forEach(b => {
      /* compact labels — the full "tap to undo" hint lives in the tooltip */
      b.textContent = accepted ? 'Signed ✓ · Undo' : 'Accept';
      b.title = accepted
        ? `Signed by ${party} — tap to undo any time`
        : `Accept & sign as ${party} (undo available any time)`;
      /* Accept stays undoable inside a finished day: keep the Signed/Undo button live */
      b.classList.toggle('undoable', !!accepted);
    });
    $$(`.sig-card[data-party="${party}"][data-area="${area}"]`).forEach(card => {
      card.classList.toggle('signed', !!accepted);
      const st = $('.sig-status', card);
      if (st) st.textContent = accepted ? 'Accepted & signed' : 'Awaiting acceptance\u2026';
    });
  };

  const applySignatures = () => {
    migrateLegacyAccepts();   // v1.9 DH: heal old seal-only accept records first
    normaliseAreas(document); // v1.9 DH: guarantee every button/slot has a data-area
    syncAreas();   // include any AI-created day areas (signatories-day2, debrief-day2, …)
    const accepts = readAccepts();
    AREAS.forEach(area => {
      const byParty = accepts[area] || {};
      Object.keys(SIG_CONFIG).forEach(party => {
        const acc = byParty[party];
        if (acc) { fillSlots(party, area); syncAreaUI(party, area, true); }
        else     { clearSlots(party, area); syncAreaUI(party, area, false); }
      });
    });
    ensureSignAccepts(document);   // v1.9 DH: Accept option everywhere a sign is required
  };

  /* event delegation on document — each area is independent */
  document.addEventListener('click', e => {
    const btn = e.target.closest('.accept-btn');
    if (!btn) return;
    const party = btn.dataset.party;
    const area  = btn.dataset.area || 'seal';
    /* v1.9 DH — normalise on click too: a button that never got a data-area
       (e.g. witness / legacy markup) now works for BOTH parties, including Deep */
    btn.dataset.area = area;
    if (!SIG_CONFIG[party]) return;
    const accepts = readAccepts();
    const byParty = accepts[area] || (accepts[area] = {});
    const acc = byParty[party];
    if (acc) {
      /* v1.9 DH: undo is allowed ANY time, for BOTH parties — no sealing window */
      delete byParty[party];
      writeAccepts(accepts);
      clearSlots(party, area);
      syncAreaUI(party, area, false);
      /* day fields may be locked (finished day) — re-open the day so the
         restored sign input is genuinely editable after an undo */
      const slotEl = $(`.initials-slot[data-party="${party}"][data-area="${area}"]`);
      const lockedPage = slotEl && slotEl.closest('.page.day-locked');
      if (lockedPage) {
        lockedPage.classList.remove('day-locked');
        const sel = $('.day-finished-select', lockedPage);   // keep the control in sync
        if (sel) sel.value = 'no';
      }
      const slotInput = slotEl && $('input', slotEl);
      if (slotInput && !slotInput.value.trim()) slotInput.focus();
      toast(`↩ ${party}'s signature withdrawn here — other areas are untouched.`);
    } else {
      byParty[party] = { ts: Date.now() };
      writeAccepts(accepts);
      fillSlots(party, area);
      syncAreaUI(party, area, true);
      toast(`❤ ${party} accepted & signed here — tap “Signed ✓ · Undo” any time to withdraw.`);
    }
    save();
  });

  /* boot flow: pull everything from Supabase → rebuild days → replay values →
     overlay sealed signatures. Nothing is read from local storage. */
  document.addEventListener('DOMContentLoaded', async () => {
    const state = await window.CloudStore.load();
    restoreDays(state ? state.days : []);
    loadSaved(window.CloudStore.fields());
    applySignatures();
    const cs = $('#cloud-status');
    if (cs && window.CloudStore.ready) cs.textContent = '☁️ Synced with Supabase';
  });

  /* ---------- clear a day ---------- */
  const clearDay = btn => {
    const dayId = btn.dataset.day;
    const page  = $('#' + dayId);
    if (!page) return;
    if (!confirm(`Clear ALL entries for ${dayId.toUpperCase()}? This cannot be undone.`)) return;
    $$('input:not([type="password"]), textarea, select', page).forEach(el => {
      const slot = el.closest('.initials-slot');
      if (slot?.classList.contains('slot-filled')) return;   // keep sealed signatures intact
      if (el.type === 'checkbox') el.checked = false;
      else if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
    $$('textarea', page).forEach(ta => { ta.style.height = ''; });
    save();
    toast(`🗑 ${dayId.toUpperCase()} cleared.`);
  };
  $$('.clear-day-btn').forEach(btn => btn.addEventListener('click', () => clearDay(btn)));

  /* ---------- v3.0 DH — delete a whole day (manual removal) ----------
     Every AI-created / restored day carries a ✖ Delete day button. Day 1 is the
     permanent founding page of the contract and can only be CLEARED, never
     deleted. Deleting removes the page from the DOM, drops its per-day
     signature areas, prunes its saved field values and re-syncs the cloud day
     list so it stays gone on every device. */
  const STATIC_DAY_IDS = new Set(['day1']);
  const deleteDay = btn => {
    const dayId = btn.dataset.day;
    const page  = $('#' + dayId);
    if (!page) return;
    if (STATIC_DAY_IDS.has(dayId)) {
      toast('💍 Day 1 is our founding page — it can be cleared, but never deleted.', 3600);
      return;
    }
    const title = $('h2', page)?.textContent.trim() || dayId.toUpperCase();
    if (!confirm(`Delete “${title}” completely?\nAll its entries, checks and signatures are removed from the contract and the cloud. This cannot be undone.`)) return;
    /* drop per-day signature state (signatories-dayN / debrief-dayN) */
    const accepts = readAccepts();
    let accChanged = false;
    Object.keys(accepts).forEach(area => {
      if (area.endsWith('-' + dayId)) { delete accepts[area]; accChanged = true; }
    });
    if (accChanged) writeAccepts(accepts);
    AREAS = AREAS.filter(a => !(a.endsWith('-' + dayId) && !BASE_AREAS.includes(a)));
    /* prune saved field values belonging to this page */
    const fields = window.CloudStore.fields();
    Object.keys(fields).forEach(k => { if (k.startsWith(dayId + '#') || k.startsWith(dayId + '>')) delete fields[k]; });
    window.CloudStore.saveFields(fields);
    collapsedOverride.delete(page.id);
    page.remove();
    persistDays();                       // cloud day list no longer contains it
    save();
    refreshAiDayOptions();               // keep the AI target list in sync
    toast(`🗑 ${title} deleted — the contract and the cloud are updated.`, 3400);
  };
  document.addEventListener('click', e => {
    const btn = e.target.closest('.delete-day-btn');
    if (btn) deleteDay(btn);
  });

  /* ============================================================
     DAY LOCK — a day is editable (its fields AND its signature
     accept buttons) until it is marked as finished.
     Once "Day finished = ✅ Yes": fields & fresh accepts seal.
     EXCEPTION: an already-accepted sign stays UNDOABLE in the
     day section (tap "Signed ✓ · Undo") for the five-minute window,
     even after the day is marked finished.
     Switching back to ❌ No re-opens every sign for editing.
     ============================================================ */
  const dayLocked = page => {
    const sel = $('.day-finished-select', page);
    return !!sel && sel.value === 'yes';
  };
  /* ---------- v2.0 DH — collapsible days ----------
     Marking a day finished collapses it automatically; ▾/▸ keeps it
     collapsible/expandable by hand for any day. The collapse state is
     derived from "Day finished" + an optional manual override, so it
     survives cloud save/load (the select value itself is persisted). */
  const collapsedOverride = new Map();          // page.id -> true/false (manual only)
  const isCollapsed = page => {
    const o = collapsedOverride.get(page.id);
    return o === undefined ? dayLocked(page) : o;   // finished ⇒ collapsed by default
  };
  const updateToggleBtn = page => {
    const btn = $('.collapse-toggle', page);
    if (!btn) return;
    const col = page.classList.contains('day-collapsed');
    btn.textContent = col ? '▸ Expand' : '▾ Collapse';
    btn.setAttribute('aria-expanded', String(!col));
  };
  const applyCollapse = page => {
    page.classList.toggle('day-collapsed', isCollapsed(page));
    updateToggleBtn(page);
  };
  const syncLockUI = page => {
    page.classList.toggle('day-locked', dayLocked(page));
    applyCollapse(page);                        // v2.0 DH — finished ⇒ auto-collapse
  };
  const syncAllLocks = () => $$('.page').forEach(syncLockUI);
  /* wire the ▾/▸ buttons (static markup + event delegation → AI days too) */
  document.addEventListener('click', e => {
    const btn = e.target.closest('.collapse-toggle');
    if (!btn) return;
    const page = btn.closest('.page');
    if (!page) return;
    collapsedOverride.set(page.id, !isCollapsed(page));
    applyCollapse(page);
  });
  $$('.day-finished-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const page = sel.closest('.page');
      collapsedOverride.delete(page.id);   // v2.0 DH — fresh choice re-derives the collapse
      syncLockUI(page);
      writeStore();
      toast(dayLocked(page)
        ? `🔒 ${sel.dataset.day.toUpperCase()} marked finished — sealed & collapsed. Tap ▸ Expand to peek inside ♥`
        : `🔓 ${sel.dataset.day.toUpperCase()} is open again — expanded, every sign and field is editable.`);
    });
  });
  /* guard: clicks on accept-buttons / filled signature slots inside a locked day.
     Signed/Undo buttons (.undoable) stay live — Accept is undoable in the day
     section even after the day is marked finished. */
  document.addEventListener('click', e => {
    const target = e.target.closest('.accept-btn, .initials-slot');
    if (!target) return;
    if (target.classList.contains('undoable')) return;   // undo remains available
    const page = target.closest('.page');
    if (page && dayLocked(page)) {
      e.stopPropagation();
      toast('🔒 This day is marked finished — set “Day finished” to ❌ No to edit its signs.', 3200);
    }
  }, true);

  /* ============================================================
     ✨ AI ASSISTANT — create a new BDSM-sequence day OR write
     generated content into an existing (not-yet-finished) day.
     Runs fully offline with a consent-first scene template engine.
     ============================================================ */
  const aiModal    = $('#ai-modal');
  const aiDaySel   = $('#ai-day-select');
  const aiChipsM   = $$('#ai-mode-chips .ai-chip');
  const aiPreview  = $('#ai-preview');
  const aiApplyBtn = $('#ai-apply-btn');
  const openAi  = () => { refreshAiDayOptions(); aiModal.classList.add('active'); };
  const closeAi = () => aiModal.classList.remove('active');
  $('#ai-assistant').addEventListener('click', openAi);
  $('#ai-close-btn').addEventListener('click', closeAi);
  $('#ai-close-footer-btn').addEventListener('click', closeAi);
  aiModal.addEventListener('click', e => { if (e.target === aiModal) closeAi(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAi(); });

  let aiMode = 'create';           // 'create' | 'write'
  let aiDraft = null;              // last generated plan, applied on demand

  aiChipsM.forEach(b => b.addEventListener('click', () => {
    aiChipsM.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    aiMode = b.dataset.mode;
    aiApplyBtn.textContent = aiMode === 'create' ? '✨ Create day' : '✍️ Write into day';
    aiApplyBtn.disabled = true;
    aiDraft = null;
    refreshAiDayOptions();
  }));

  /* single-select chip groups (mood / intensity / lead / venue) */
  const wireSingle = containerId => {
    const c = $('#' + containerId);
    if (!c) return;
    c.addEventListener('click', e => {
      const chip = e.target.closest('.ai-chip');
      if (!chip) return;
      $$('.ai-chip', c).forEach(x => x.classList.remove('active'));
      chip.classList.add('active');
    });
  };
  ['ai-mood-chips', 'ai-intensity-chips', 'ai-lead-chips', 'ai-venue-chips'].forEach(wireSingle);
  /* multi-select groups (subcategory rows + aftercare focus) */
  document.addEventListener('click', e => {
    const chip = e.target.closest('.ai-subchips .ai-chip, #ai-aftercare-chips .ai-chip');
    if (chip) chip.classList.toggle('active');
  });
  const pickedChip = (sel, attr) => { const el = $(sel); return el && el.classList.contains('active') ? el.dataset[attr] : ''; };
  $('#ai-select-all')?.addEventListener('click', () => {
    const mood = pickedChip('#ai-mood-chips .ai-chip.active', 'mood') || 'romantic';
    $$('.ai-subchips .ai-chip').forEach(c => c.classList.remove('active'));
    (MOOD_PRESETS[mood] || MOOD_PRESETS.romantic).forEach(k => {
      const el = $(`.ai-subchips [data-seq="${k}"]`);
      if (el) el.classList.add('active');
    });
    toast('🪄 Curated full scene selected — tweak any chip you like.');
  });
  $('#ai-clear-all')?.addEventListener('click', () => {
    $$('.ai-subchips .ai-chip').forEach(c => c.classList.remove('active'));
  });

  const dayNumber = id => { const m = /^day(\d+)$/.exec(id); return m ? +m[1] : null; };
  const existingDayIds = () => $$('.page').map(p => p.id).filter(id => dayNumber(id));

  const refreshAiDayOptions = () => {
    const ids = existingDayIds();
    aiDaySel.innerHTML = '';
    if (aiMode === 'create') {
      const opt = document.createElement('option');
      const nextN = ids.reduce((mx, id) => Math.max(mx, dayNumber(id)), 0) + 1;
      opt.value = `new:day${nextN}`;
      opt.textContent = `New Day ${nextN} (appended at the end)`;
      aiDaySel.appendChild(opt);
    } else {
      const editable = ids.filter(id => !dayLocked($('#' + id)));
      if (!editable.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(no open days — mark a day ❌ Not finished first)';
        aiDaySel.appendChild(opt);
      } else {
        editable.forEach(id => {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = $(`#${id} h2`)?.textContent.trim() || id.toUpperCase();
          aiDaySel.appendChild(opt);
        });
      }
    }
  };

  /* ---------- v3.0 DH — build the category/subcategory chip menu from CAT_LIB ----------
     Each play category becomes a labelled row of toggleable subcategory chips, so
     every corner of BDSM play & scene-building is selectable for the AI writer.
     NOTE: this function is only *called* further below, after CAT_LIB has been
     initialised — calling it earlier throws a TDZ ReferenceError and kills the
     whole script (which is what silently broke the "✉ Email data" and
     "✨ AI write a day" buttons). */
  const CHIP_ICONS = { senses:'🌗', bondage:'⛓️', sensation:'🔥', power:'👑', intimacy:'💞', roleplay:'🎭', service:'🕯️', extras:'📸', care:'🤍' };
  const buildSubchips = () => {
    $$('.ai-subchips').forEach(row => {
      const cat = CAT_LIB[row.dataset.cat];
      if (!cat) return;
      row.innerHTML = Object.entries(cat.items)
        .map(([k, it]) => `<button class="ai-chip" data-seq="${k}" title="${escA(it.hard)}">${escH(it.name)}</button>`)
        .join('');
    });
  };

  /* ---- sequence knowledge base (everything stays SSC/RACK-safe) ----
     v3.0 DH — massively expanded: every entry is a BDSM play SUBCATEGORY grouped
     under a CATEGORY. Each subcategory carries its name, implements/toys, hard
     safety rules and chronological scene steps, so any pick produces a complete,
     consent-first day. */
  const CAT_LIB = {
    senses: { label: 'Mind & senses', items: {
      sensory:   { name: 'Sensory deprivation', toy: 'Silk blindfold / noise-reducing headphones',
        hard: 'Blindfold removed instantly on RED or any non-verbal signal; never combined with positional restraint that hides distress.',
        step: ['blindfold on, narrate every touch before it lands', 'build anticipation through sound & silence'] },
      overstim:  { name: 'Overstimulation / stimulation flood', toy: 'Soft-bristle brushes, flogger fringe, dual vibrators',
        hard: 'Flood scenes capped at agreed minutes; constant check-ins; stop on YELLOW without question.',
        step: ['gentle brush warming of skin', 'rising layers of touch until overwhelmed, then sudden stillness'] },
      quietroom: { name: 'Quiet room / stillness play', toy: 'Mat, eye mask, timed silence card',
        hard: 'Time limit agreed beforehand; dominant present in the room at all times.',
        step: ['settled on the mat, one instruction, then held silence', 'soft verbal return and grounding at timer end'] },
      anticipation:{ name: 'Anticipation & waiting rituals', toy: 'Timer, candle, agreed posture',
        hard: 'Waiting time negotiated, never extended punitively beyond agreement.',
        step: ['positioned to wait, told only "soon"', 'reward the patience with full attention'] },
    }},
    bondage: { label: 'Bondage & restraint', items: {
      restraint: { name: 'Restraint (upper body)', toy: 'Silk ties / scarves and/or metal handcuffs — never simultaneously on the same limb',
        hard: 'Circulation & comfort check every 10 minutes; key visible and within reach at all times.',
        step: ['wrists bound softly, padding under every knot', 'reassurance check-in before leaving her still'] },
      bondage:   { name: 'Bondage / rope', toy: 'Soft cotton rope — single-column wraps, quick-release safety knots',
        hard: 'Every tie carries a quick-release; safety shears beside the mat; no rope on the neck.',
        step: ['rope dressing at a slow, deliberate pace', 'single-column tie with constant verbal check-ins'] },
      spreader:  { name: 'Spreaders & position holding', toy: 'Padded wooden/metal spreader bar, ankle cuffs',
        hard: 'Joints never hyperextended; positions changed at least every 15 minutes; quick-release on every cuff.',
        step: ['ankles gently spaced, weight checked', 'held open pose for a short agreed count, then released and rubbed'] },
      stocks:    { name: 'Stocks / frame play', toy: 'Padded stocks or doorframe cuffs with spotters',
        hard: 'Never leave the restrained partner alone in stocks; head and neck always free; exit path clear.',
        step: ['wrists settled into padded stocks', 'slow orbit of attention, release after agreed interval'] },
      selfbond:  { name: 'Self-bondage (supervised)', toy: 'Mitts, soft wrist straps worn by the submissive herself',
        hard: 'Dominant holds the master release at all times; no keys around the neck; she can always call RED.',
        step: ['she binds her own wrists while he narrates', 'held, admired, then freed with praise'] },
      suspension:{ name: 'Partial suspension / hoisting', toy: 'Ceiling-rated rig, overhead anchor, professional rope',
        hard: 'Only with trained partners and rated hardware; feet stay near the floor; circulation checks every few minutes; never unsupervised.',
        step: ['test-hang at low height, breathing checked', 'brief lift, slow descent, immediate release and rub-down'] },
    }},
    sensation: { label: 'Sensation & impact', items: {
      sensation: { name: 'Temperature / sensation', toy: 'Ice cubes + warm breath contrast, feathers, clothespins/clamps',
        hard: 'Ice never contacts neck, face, or mucosa and never rests longer than 5 seconds; clamps max 10 consecutive minutes with a timer.',
        step: ['ice trails across shoulders and spine', 'clamps applied + 10-minute timer set', 'alternating warm breath after each trail'] },
      wax:       { name: 'Low-temperature candle wax', toy: 'SOY/paraffin massage candles rated for skin (low-temp only)',
        hard: 'Only low-temperature play candles; test drip on inner wrist first; never on face, breasts nipples direct, or broken skin; hair kept covered or tied back.',
        step: ['first warm drip traced down the spine', 'slow pools on the back, cooled with breath before brushing off'] },
      impact:    { name: 'Impact play', toy: 'Soft flogger / leather paddle',
        hard: 'Strikes only over muscle or flesh-safe zones — never kidneys, spine, or joints; warm-up strokes first.',
        step: ['warm-up taps, rising rhythm', 'steady strokes with afterglow rub between sets'] },
      spanking:  { name: 'Spanking / hand impact', toy: 'Open hand, optional padded hairbrush (agreed only)',
        hard: 'Cheek of buttocks only; hand never strikes harder than a firm slap; count and intensity pre-agreed.',
        step: ['hand-positioning and warning counts', 'rising sets with rub-out between rounds'] },
      edgingtool:{ name: 'Vibe-on-skin sensation', toy: 'Wand / bullet vibrator on lowest setting',
        hard: 'Lowest setting through early phases unless requested; never pressed to throat; battery checked pre-scene.',
        step: ['broad circles far from the peak', 'narrowing patterns as permission is given'] },
      electro:   { name: 'Electrostimulation (TENS/violet wand)', toy: 'Body-safe TENS unit with padded electrodes ONLY',
        hard: 'Strictly OFF-LIMITS for anyone with a pacemaker/heart condition, pregnancy, epilepsy; electrodes never on neck, head, chest across the heart, or genitals; lowest power first; hard-limit friendly — many couples keep this out entirely.',
        step: ['pads placed on thigh/shoulder muscle, level 1 test', 'short agreed bursts, always ending on a low'] },
      scratch:   { name: 'Nail tracing / light marking', toy: 'Manicured nails, gentle fingertip pressure',
        hard: 'Skin is never broken; marks only where she has said yes; pressure stays at tracing level.',
        step: ['slow nail trails down the back', 'light press-and-hold on approved spots'] },
    }},
    power: { label: 'Power & protocol', items: {
      powerexchange: { name: 'Power exchange / orders', toy: 'Voice, posture, ritual of address ("Sir" / "Ma’am")',
        hard: 'Orders stop instantly on YELLOW; negotiation of scenes-of-authority happens pre-scene, never mid-play.',
        step: ['kneeling check-in, three simple escalating orders', 'praise woven between commands'] },
      protocol:  { name: 'Protocol & etiquette training', toy: 'Posture cues, greeting ritual, permitted-speech rules',
        hard: 'Rules stated clearly before scene start; correction stays inside the negotiated range; safe word overrides all protocol.',
        step: ['greeting posture rehearsed slowly', 'a short evening under agreed etiquette, debrief after'] },
      collar:    { name: 'Collaring / ownership ritual', toy: 'The collar, a locked moment, spoken vows',
        hard: 'Collar symbolises trust, never trap — removal is always available to her; ceremony negotiated in advance.',
        step: ['kneel, spoken intention, collar placed', 'first command is always "you may rise"'] },
      obedience: { name: 'Obedience drills & tasks', toy: 'Written task card, timer, posture holds',
        hard: 'Tasks are achievable and pre-agreed; failure triggers kindness and re-teaching, not escalation.',
        step: ['one clear instruction, repeated once', 'hold completed, acknowledged with praise'] },
      denial:    { name: 'Orgasm control / denial & ruin', toy: 'Hands, voice, timing',
        hard: 'Edge/denial count agreed beforehand; denial ends immediately on request; afterglow never withheld as punishment.',
        step: ['approach the edge, hold, step back with praise', 'final release granted or lovingly ruined per prior agreement'] },
      tease:     { name: 'Teasing & edging', toy: 'Hands, lips, vibrator on lowest setting',
        hard: 'Edge count agreed beforehand; GREEN/YELLOW governs pace; orgasm denial ends on request.',
        step: ['slow tease, drawn-out anticipation', 'first edge held, then released with praise'] },
      chastity:  { name: 'Chastity device play', toy: 'Properly-fitted cage/belt with hygiene breaks',
        hard: 'Correct sizing checked pre-scene; skin inspected daily; emergency key always accessible; remove on any pain or numbness.',
        step: ['device locked with ceremony, ownership words spoken', 'release at agreed time with care and inspection'] },
      servitude: { name: 'Total-service weekend style authority', toy: 'Agreed rule list for the day',
        hard: 'Rules limited to what was written and initialled beforehand; renegotiation allowed at any hour.',
        step: ['morning briefing of the day’s rules', 'evening accounting, gratitude, rules lifted'] },
    }},
    intimacy: { label: 'Intimacy & pleasure', items: {
      worship:   { name: 'Body worship / devotion', toy: 'Oil, warm hands, unhurried mouth',
        hard: 'Worship follows her stated yes-list; no touching past a boundary even mid-bliss; check-in between zones.',
        step: ['feet-to-spine slow adoration', 'paused eye-contact gratitude before continuing'] },
      oral:      { name: 'Oral attention & service', toy: 'Nothing but tongue, hands and eye contact',
        hard: 'Barrier methods if agreed; direction and pace governed by YELLOW/GREEN; stops instantly on request.',
        step: ['slow build with feedback invited', 'finish exactly how she asked to be finished'] },
      rough:     { name: 'Rough consensual lovemaking', toy: 'Gripping hands, hair hold (scalp only), pinned wrists',
        hard: 'Hair pulled at the scalp never the strands; choking is a hard limit — pinning replaces it; intensity ramps only with verbal yes.',
        step: ['pinned, paced, loud consent checked', 'peak, then immediate softening and embrace'] },
      ponyplay:  { name: 'Pony play / training', toy: 'Long reins, riding crop as pointer only, soft collar',
        hard: 'Reins steer, never yank; gait changes on voice; rest and water every 10 minutes; no jumps.',
        step: ['tack-up ritual and posture drill', 'walk-trot patterns, trotting toward praise'] },
      age:       { name: 'Age-regression D/s (little space)', toy: 'Comfort objects, onesie, bottle, colouring pages',
        hard: 'Strictly non-sexual little-space care; adult decisions stay with the caregiver; drop-care planned ahead.',
        step: ['transition ritual into little space', 'nurture, play, gentle transition out with cuddles'] },
      hz:        { name: 'Hypno / deep-trance play', toy: 'Induction script, fixation pendant, countdown out',
        hard: 'No post-hypnotic suggestions beyond negotiated scene window; nothing degrading implanted; explicit wake-out count every session.',
        step: ['progressive relaxation induction', 'agreed trance scenes, full alert count-back and grounding'] },
    }},
    roleplay: { label: 'Roleplay & fetish', items: {
      rpauthority:{ name: 'Authority roleplay (officer/teacher/boss)', toy: 'Costume pieces, written "citations", desk',
        hard: 'Real-world threats (job, legal trouble) are fiction only — announced as such pre-scene; safewords run the scene.',
        step: ['character entrance and "inspection"', 'sentencing playful, served with winks and aftercare'] },
      rpstruggle:{ name: 'Consensual-non-consent fantasy', toy: 'Scripted scenario agreed line-by-line beforehand',
        hard: 'Detailed negotiation, explicit green-light list, safeword rehearsal mandatory; scene never starts without a fresh GREEN.',
        step: ['scripted "capture" beat by beat', 'break-character check-ins, warm re-embrace at the end'] },
      rpservant: { name: 'Maid / servant roleplay', toy: 'Apron, checklist, silver tray',
        hard: 'Tasks pre-listed and doable; humiliation limited to agreed playful register.',
        step: ['uniform donned, duties read aloud', 'service rewarded with recognition and rest'] },
      petplay:   { name: 'Pet play (puppy/kitten)', toy: 'Ears/tail, soft bed, treat pouch',
        hard: 'Commands stay playful; no real degradation; physical handling gentle; hydration nearby.',
        step: ['collar-up transformation ritual', 'tricks, affection, settle command at the end'] },
      lingerie:  { name: 'Clothing & lingerie control', toy: 'Chosen outfits, "dress-for-me" rules, wardrobe commands',
        hard: 'Anything she has vetoed stays vetoed; outfit reveals negotiated; modesty breaks always allowed.',
        step: ['outfit selection by the Dominant', 'slow reveal, admiration, photo only if she asks'] },
      foot:      { name: 'Foot & shoe fetish', toy: 'Heels, stockings, foot bench, massage oil',
        hard: 'Stepping on partner only with agreed weight, never on spine/ribs/throat; nails filed smooth.',
        step: ['worship and massage of feet', 'light trampling pass with balance held'] },
      latex:     { name: 'Latex / rubber / PVC', toy: 'Suit, gloves, polish, tape-on boots',
        hard: 'Dressing watched for overheating; powder/lubricant for fitting; never sealed over head; breaks for water.',
        step: ['slow dressing ritual with polish', 'squeak-and-shine showcase, careful undressing'] },
      tabu:      { name: 'Exhibitionism / voyeurism (risk-aware)', toy: 'Balcony curtain, "almost-seen" scenarios',
        hard: 'STRICTLY consensual-partners-only and private-property-only — no non-consenting public exposure (illegal); camera use requires explicit ongoing consent.',
        step: ['dressed-to-impress behind closed curtains', "thrill of 'almost caught', safely home"] },
    }},
    service: { label: 'Service & ritual', items: {
      service:   { name: 'Service submission', toy: 'Small rituals — pouring tea, offering slippers, attentive tasks',
        hard: 'Service tasks are framed as gifts, never tests; correction stays gentle and in-negotiation.',
        step: ['tea ceremony performed slowly, eyes lowered', 'task list read aloud, one graceful act at a time'] },
      ritual:    { name: 'Scene ritual & altar', toy: 'Candles, sigil cloth, spoken invocation',
        hard: 'Fire never left unattended and always in a holder; ritual content pre-agreed; flame kept away from bindings and hair.',
        step: ['candles lit, threshold words spoken', 'scene closes with the same words, flames snuffed together'] },
      grooming:  { name: 'Grooming & dressing rituals', toy: 'Brush, oils, hair pins, chosen outfit',
        hard: 'Skin checks during grooming; anything painful stops immediately.',
        step: ['hair-brushing counted strokes', 'dressing ceremony, final look admired'] },
      devotions: { name: 'Daily-devonment ledger', toy: 'Shared notebook, stamps, tally marks',
        hard: 'Ledger reflects negotiated goals only; missing entries never cost affection.',
        step: ['morning entry written together', 'evening stamp and one line of gratitude'] },
    }},
    extras: { label: 'Scene extras', items: {
      mirror:    { name: 'Mirror & observation play', toy: 'Standing mirror, angled lighting',
        hard: 'Appearance talk restricted to agreed compliments; no forced self-viewing if it causes distress.',
        step: ['posed before the mirror, narrated admiration', 'watched together through one chosen scene beat'] },
      photo:     { name: 'Photo / film keepsakes', toy: 'Camera on tripod, agreed shot list',
        hard: 'Explicit consent before recording, again before keeping, again before ANY sharing; deletion honoured instantly; faces/identifiers excluded unless she says otherwise.',
        step: ['three agreed shots, reviewed together', 'kept in the private vault or deleted by her choice'] },
      foodplay:  { name: 'Food & body play', toy: 'Chocolate, whipped cream, strawberries, honey',
        hard: 'Allergy list checked pre-scene; nothing on broken skin; temperature of food checked; clean-up part of aftercare.',
        step: ['blind-tasting game', 'slow edible trail across the agreed zones'] },
      thrills:   { name: 'Risk-aware "getaway" thrill', toy: 'Locked-door scenario, whispered escape plan',
        hard: 'Purely fictional stakes, announced as fiction; real exits always unlocked and known; no actual being trapped.',
        step: ['pretend curfew and stolen moments', 'safe return home, debrief over tea'] },
      treasure:  { name: 'Toy box roulette', toy: 'Bagged implements chosen by touch',
        hard: 'Anything pulled must already be on the yes-list; veto-without-question on every draw.',
        step: ['blind draw of tonight’s implement', 'negotiated use, then boxed back together'] },
    }},
    care: { label: 'Care & closure', items: {
      aftercare: { name: 'Aftercare', toy: 'Warm blanket, herbal tea, moisturiser, massage, unhurried cuddles',
        hard: 'Aftercare is mandatory and never shortened; debrief begins only once both are warm, hydrated and settled.',
        step: ['blanket wrap + hydration immediately at scene end', 'massage, debrief and ≥20 minutes of undistracted cuddling'] },
      dropprotection:{ name: 'Sub-drop / dom-drop watch', toy: 'Check-in texts, comfort list, next-day plan',
        hard: 'Drop can arrive 1–3 days later; promises made in scene are honoured after; professional help sought if low mood persists.',
        step: ['next-morning message and coffee ritual agreed', 'two-day gentle check-ins logged in the debrief'] },
      debrief:   { name: 'Structured debrief', toy: 'Score sheets, notes page, tea',
        hard: 'Both voices heard fully before any adjustment is decided; nothing raised in debrief is punished.',
        step: ['scores exchanged, one pride and one wish each', 'adjustments written into the next day draft'] },
    }},
  };

  /* flat order + lookup used everywhere */
  const SEQ_ORDER = Object.values(CAT_LIB).flatMap(c => Object.keys(c.items));
  const SEQ_LIB   = Object.assign({}, ...Object.values(CAT_LIB).map(c => c.items));
  const catOfKey  = k => { for (const [ck, c] of Object.entries(CAT_LIB)) if (c.items[k]) return ck; return null; };

  /* curated defaults per mood — used when nothing is picked */
  const MOOD_PRESETS = {
    romantic:  ['sensory', 'worship', 'tease', 'aftercare'],
    spicy:     ['restraint', 'spanking', 'rough', 'edgingtool', 'aftercare'],
    playful:   ['petplay', 'treasure', 'foodplay', 'tease', 'aftercare'],
    intense:   ['bondage', 'impact', 'protocol', 'denial', 'dropprotection'],
    tender:    ['quietroom', 'worship', 'grooming', 'dropprotection'],
    slowburn:  ['anticipation', 'sensory', 'tease', 'worship', 'aftercare'],
  };
  const MOOD_LABELS = { romantic:'🌹 Romantic', spicy:'🌶️ Spicy', playful:'😈 Playful', intense:'⛓️ Intense', tender:'🕊️ Tender', slowburn:'🔥 Slow burn' };
  const INTENSITY_LABELS = { soft:'Soft & gentle', medium:'Medium', firm:'Firm', deepend:'Deep end' };
  const VENUE_LABELS = { bedroom:'Private Bedroom / Play Space', playroom:'Play Room / Dungeon Corner', bathroom:'Bath & Shower Suite', outdoor:'Balcony / Secluded Outdoor Nook', anywhere:'A Surprise Venue (TBA together)' };
  const CARE_LABELS = { cuddle:'Warm blanket wrap + ≥20 minutes of unhurried cuddles', massage:'Gentle massage of bound / played areas — 5 min per limb', praise:'Verbal praise, reassurance and eye contact throughout cool-down', treats:'Hydration — warm herbal tea, water and a light sweet snack', quiet:'Quiet presence: same room, no demands, soft company', words:'Talk-it-through debrief: scores, feelings, one pride and one wish' };
  const BASE_AFTERCARE = [['Warm blanket wrap (thermal regulation)','Immediate'],['Hydration — warm herbal tea or still water','Upon request'],['Light snack — chocolate or fruit','Upon request']];

  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

  const buildPlan = () => {
    /* v3.0 DH — read every selectable option: mood, intensity, lead, venue,
       the full BDSM category/subcategory chip menu, aftercare focus, special
       requests per partner and extra limits, so the written day truly matches
       what the two of you picked. */
    const pickedSeq = k => { const el = $(`.ai-subchips [data-seq="${k}"]`); return !!el && el.classList.contains('active'); };
    const picked = SEQ_ORDER.filter(pickedSeq);
    const mood      = $('#ai-mood-chips .ai-chip.active')?.dataset.mood      || 'romantic';
    const intensity = $('#ai-intensity-chips .ai-chip.active')?.dataset.intensity || 'medium';
    const lead      = $('#ai-lead-chips .ai-chip.active')?.dataset.lead      || 'Deep';
    const venue     = $('#ai-venue-chips .ai-chip.active')?.dataset.venue    || 'bedroom';
    const care      = $$('#ai-aftercare-chips .ai-chip.active').map(b => CARE_LABELS[b.dataset.care]).filter(Boolean);
    const specialSub = $('#ai-special-sub') ? $('#ai-special-sub').value.trim() : '';
    const specialDom = $('#ai-special-dom') ? $('#ai-special-dom').value.trim() : '';
    const extraLimits = $('#ai-limits') ? $('#ai-limits').value.trim() : '';
    let seqs = picked.length ? picked : (MOOD_PRESETS[mood] || MOOD_PRESETS.romantic).slice();
    if (!seqs.includes('aftercare') && !seqs.some(k => CAT_LIB.care && CAT_LIB.care.items[k])) seqs = seqs.concat(['aftercare']);
    const duration = $('#ai-duration').value.trim() || 'Seventy-five (75) minutes of active scene play, plus generous aftercare';
    const notes    = $('#ai-notes').value.trim();
    const target   = aiDaySel.value;
    const n        = dayNumber(target.startsWith('new:') ? target.slice(4) : target) || 99;
    const dateStr  = n === 1 ? '30 July 2026' : 'to be filled in ✍️';
    const protocol = seqs.map(k => SEQ_LIB[k].name).join(' → ');
    return { n, seqs, duration, notes, target, dateStr, protocol,
             mood, intensity, lead, venue, care, specialSub, specialDom, extraLimits };
  };

  const renderPreview = p => {
    const acts = p.seqs.map(k => `<li><strong>${escH(SEQ_LIB[k].name)}</strong> — ${escH(SEQ_LIB[k].toy)}</li>`).join('');
    const lims = p.seqs.map(k => `<li>${escH(SEQ_LIB[k].hard)}</li>`).join('')
      + (p.extraLimits ? `<li><em>Your extra limits:</em> ${escH(p.extraLimits)}</li>` : '');
    const steps = p.seqs.map((k, i) => `<li>T+${i * 10} · <strong>${escH(SEQ_LIB[k].name)}</strong>: ${escH(SEQ_LIB[k].step.join('; '))}</li>`).join('');
    const care = (p.care && p.care.length)
      ? `<p><em>Aftercare focus:</em></p><ul>${p.care.map(c => `<li>${escH(c)}</li>`).join('')}</ul>` : '';
    const specials = (p.specialSub || p.specialDom)
      ? `<p><em>Special requests:</em></p><ul>` +
        (p.specialSub ? `<li><strong>Honey:</strong> ${escH(p.specialSub)}</li>` : '') +
        (p.specialDom ? `<li><strong>Deep:</strong> ${escH(p.specialDom)}</li>` : '') + `</ul>` : '';
    aiPreview.innerHTML =
      `<p><strong>Day ${p.n} · ${escH(p.dateStr)} — ${escH(VENUE_LABELS[p.venue] || 'Private Bedroom / Play Space')}</strong></p>` +
      `<p><em>Mood:</em> ${escH(MOOD_LABELS[p.mood] || p.mood)} · <em>Intensity:</em> ${escH(INTENSITY_LABELS[p.intensity] || p.intensity)} · <em>Lead:</em> ${escH(p.lead)}</p>` +
      `<p><em>Duration:</em> ${escH(p.duration)}</p>` +
      `<p><em>Protocol:</em> ${escH(p.protocol)}</p>` +
      (p.notes ? `<p><em>Your notes:</em> ${escH(p.notes)}</p>` : '') +
      `<p><em>Play bill:</em></p><ul>${acts}</ul>` + care + specials +
      `<p><em>Hard limits generated:</em></p><ul>${lims}</ul>` +
      `<p><em>Chronological guide:</em></p><ol>${steps}</ol>` +
      `<p class="muted">Everything above is drafted with consent-first safeguards — review, tweak, then apply.</p>`;
  };

  $('#ai-generate-btn').addEventListener('click', () => {
    if (aiMode === 'write' && !aiDaySel.value) { toast('⚠️ No open day to write into — mark a day ❌ Not finished first.', 3400); return; }
    aiDraft = buildPlan();
    renderPreview(aiDraft);
    aiApplyBtn.disabled = false;
    toast('🪄 Draft ready — press ' + (aiMode === 'create' ? '“Create day”' : '“Write into day”') + ' to apply it.');
  });

  /* ---------- HTML builders for a brand-new day page ---------- */
  const dmyPill = () =>
    `<span class="datetime-group"><input type="text" inputmode="numeric" maxlength="2" placeholder="DD"><i>/</i><input type="text" inputmode="numeric" maxlength="2" placeholder="MM"><i>/</i><input type="text" inputmode="numeric" maxlength="4" placeholder="YYYY"></span>`;
  const ynPair  = (a, b) => `<label class="yn"><input type="checkbox"> ${a}</label><label class="yn"><input type="checkbox"> ${b}</label>`;

  const dayPageHTML = p => {
    const N = p.n, low = 'd' + N;
    const acts = p.seqs.map(k => `<tr><td>${escH(SEQ_LIB[k].name)}</td><td>${escH(SEQ_LIB[k].toy)}</td></tr>`).join('');
    const lims = p.seqs.map((k, i) => `<tr><td>5.${i + 1}</td><td>${escH(SEQ_LIB[k].hard)}</td></tr>`).join('')
      + (p.extraLimits ? `<tr><td>5.x</td><td>${escH(p.extraLimits)}</td></tr>` : '');
    const steps = p.seqs.map((k, i) =>
      `<tr><td>T+${i * 10}</td><td>${escH(SEQ_LIB[k].step.join(' — '))}</td><td>${i % 2 ? 'Both' : escH(p.lead || 'Deep')}</td><td>Consent checks throughout</td></tr>`).join('');
    return `
    <section class="page" id="day${N}">
      <div class="page-head">
        <h2>Day ${N} · ${escH(p.dateStr)} — ${escH(VENUE_LABELS[p.venue] || 'Private Bedroom / Play Space')}</h2>
        <span class="day-badge">✨ AI-drafted · ${escH(MOOD_LABELS[p.mood] || '♥ Consent first')} · ${escH(INTENSITY_LABELS[p.intensity] || 'Medium')}</span>
      </div>
      <div class="day-finished">
        <label for="df-day${N}">📌 Day finished:</label>
        <select class="day-finished-select" id="df-day${N}" data-day="day${N}">
          <option value="no">❌ No</option>
          <option value="yes">✅ Yes</option>
        </select>
        <button class="collapse-toggle" type="button" aria-expanded="true" title="Collapse / expand this day">▾ Collapse</button>
        <button class="clear-day-btn" type="button" data-day="day${N}">🗑 Clear this day</button>
        <button class="delete-day-btn danger" type="button" data-day="day${N}" title="Permanently remove Day ${N} from the contract and the cloud">✖ Delete day</button>
      </div>
      <p class="lock-note">🔒 This day is marked as finished — everything (signatures included) is sealed. Set “Day finished” to ❌ No to edit again.</p>

      <p><strong>Between:</strong> Deep (the Dominant) &amp; Honey (the Submissive)</p>

      <h3 class="section-title">Article 1 · Preamble &amp; Scope</h3>
      <p>Wherefore both parties enter this agreement freely, willingly, and with full capacity to consent; this scene-specific accord is effective only on the dates stated herein, operating alongside — and superseding only where explicitly stated — the standing D/s agreement. Lovingly, cautiously, and without exception.</p>

      <h3 class="section-title">Article 2 · Session Parameters</h3>
      <table>
        <tr><th>Clause</th><th>Specification</th></tr>
        <tr><td>2.1 Date of scene</td><td>${dmyPill()}</td></tr>
        <tr><td>2.2 Planned duration</td><td><input class="inline-input editable-field" style="width:100%" value="${escH(p.duration)}"></td></tr>
        <tr><td>2.3 Venue</td><td>${escH(VENUE_LABELS[p.venue] || 'Private bedroom / play space')}. No third parties present.</td></tr>
      </table>

      <h3 class="section-title">Article 3 · Scheduled Activities (The Play Bill)</h3>
      <table>
        <tr><th>Category</th><th>Specific implement / toy</th></tr>
        ${acts}
      </table>
      <p><strong>3.2 Protocol:</strong> ${escH(p.protocol)}.</p>

      <h3 class="section-title">Article 4 · New Activities Clause</h3>
      <div class="checklist-item"><input type="checkbox" id="${low}-new"><label for="${low}-new">4.1 Are any NEW activities being introduced today?</label></div>
      <p>4.2 No unvetted activity shall be introduced during this session without a fresh, sober, out-of-scene negotiation.</p>

      <h3 class="section-title">Article 5 · Hard Limits — Session Specific</h3>
      <table>
        <tr><th>Clause</th><th>Prohibition</th></tr>
        ${lims}
      </table>

      <h3 class="section-title">Article 6 · Aftercare Provision</h3>
      <table>
        <tr><th>Aftercare deliverable</th><th>Duration</th></tr>
        ${p.care && p.care.length
          ? p.care.map(c => `<tr><td>${escH(c)}</td><td>Throughout cool-down</td></tr>`).join('')
          : `<tr><td>Warm blanket wrap (thermal regulation)</td><td>Immediate</td></tr>
             <tr><td>Hydration — warm herbal tea or still water</td><td>Upon request</td></tr>
             <tr><td>Gentle massage of bound / played areas</td><td>5 minutes per limb</td></tr>
             <tr><td>Undistracted cuddling, verbal debrief, emotional reconnection</td><td>Minimum 20 minutes</td></tr>
             <tr><td>Light snack — chocolate or fruit</td><td>Upon request</td></tr>`}
      </table>

      <h3 class="section-title">Article 7 · Special Requests &amp; Desires</h3>
      <p class="quote"><strong>Submissive:</strong> <input class="inline-input editable-field" style="width:80%" placeholder="${escA(p.specialSub || "Type Honey's request…")}" value="${escA(p.specialSub || '')}"></p>
      <p class="quote"><strong>Dominant:</strong> <input class="inline-input editable-field" style="width:80%" placeholder="${escA(p.specialDom || "Type Deep's wish…")}" value="${escA(p.specialDom || '')}"></p>
      ${p.notes ? `<p class="quote"><strong>AI note carried over:</strong> “${escH(p.notes)}”</p>` : ''}

      <h3 class="section-title">Article 8 · Safewords &amp; Withdrawal of Consent</h3>
      <table>
        <tr><th>Safeword</th><th>Meaning</th><th>Action required</th></tr>
        <tr><td><em>“RED”</em></td><td>Full stop — withdrawal of consent.</td><td>Scene ends immediately; all restraints removed; aftercare begins.</td></tr>
        <tr><td><em>“YELLOW”</em></td><td>Pause — check-in required.</td><td>Dominant pauses, checks in verbally, adjusts as needed.</td></tr>
        <tr><td><em>“GREEN”</em></td><td>All good — continue.</td><td>Dominant proceeds.</td></tr>
      </table>

      <h3 class="section-title">Signatories</h3>
      <div class="sig-cards sign-cards">
        <div class="sig-card" data-area="signatories-day${N}" data-party="Honey">
          <img class="sig-photo" src="img/signature-honey.png" alt="Honey's signature" loading="lazy">
          <span class="sig-name">Honey · Submissive</span>
          <span class="sig-status">Awaiting acceptance…</span>
          <button class="accept-btn" data-area="signatories-day${N}" data-party="Honey" type="button">Accept</button>
        </div>
        <div class="sig-card" data-area="signatories-day${N}" data-party="Deep">
          <img class="sig-photo" src="img/signature-deep.png" alt="Deep's signature" loading="lazy">
          <span class="sig-name">Deep · Dominant</span>
          <span class="sig-status">Awaiting acceptance…</span>
          <button class="accept-btn" data-area="signatories-day${N}" data-party="Deep" type="button">Accept</button>
        </div>
      </div>
      <div class="sign-row">
        <div class="sign-field"><label>Submissive / Bottom — signature</label><span class="initials-slot" data-area="signatories-day${N}" data-party="Honey"><input type="text" class="editable-field" placeholder="Signature"></span></div>
        <div class="sign-field"><label>Printed name</label><input class="editable-field" placeholder="Type printed name"></div>
        <div class="sign-field"><label>Date</label>${dmyPill()}</div>
      </div>
      <div class="sign-row">
        <div class="sign-field"><label>Dominant / Top — signature</label><span class="initials-slot" data-area="signatories-day${N}" data-party="Deep"><input type="text" class="editable-field" placeholder="Signature"></span></div>
        <div class="sign-field"><label>Printed name</label><input class="editable-field" placeholder="Type printed name"></div>
        <div class="sign-field"><label>Date</label>${dmyPill()}</div>
      </div>

      <h3 class="section-title">Pre-Scene Execution Affidavit — Day ${N}</h3>
      <p class="exec-line"><strong>Date of execution:</strong> ${dmyPill()} <strong>Time:</strong> <span class="datetime-group time-group"><input type="text" inputmode="numeric" maxlength="2" placeholder="HH"><i>:</i><input type="text" inputmode="numeric" maxlength="2" placeholder="MM" aria-label="Minutes"></span></p>
      <div class="checklist-item"><input type="checkbox" id="${low}-a1"><label for="${low}-a1">We have BOTH read and understood this Scene Contract.</label></div>
      <div class="checklist-item"><input type="checkbox" id="${low}-a2"><label for="${low}-a2">We have BOTH used the bathroom and are physically comfortable.</label></div>
      <div class="checklist-item"><input type="checkbox" id="${low}-a3"><label for="${low}-a3">We have BOTH had water within the last 30 minutes.</label></div>
      <div class="checklist-item"><input type="checkbox" id="${low}-a4"><label for="${low}-a4">All toys and props are clean, safe, and positioned within arm's reach.</label></div>
      <div class="checklist-item"><input type="checkbox" id="${low}-a5"><label for="${low}-a5">We have agreed on the specific activities for today (Article 3).</label></div>
      <div class="checklist-item"><input type="checkbox" id="${low}-a6"><label for="${low}-a6">We have BOTH said our safewords out loud to confirm we remember them.</label></div>

      <h4>Scene Debrief — Day ${N} (after scene)</h4>
      <div class="debrief-grid">
        <div><label>Overall satisfaction</label> <input class="inline-input score" inputmode="numeric" maxlength="2" placeholder="x/10"></div>
        <div><label>Aftercare effectiveness</label> <input class="inline-input score" inputmode="numeric" maxlength="2" placeholder="x/10"></div>
        <div><label>Safeword used?</label> ${ynPair('Yes', 'No')} If yes, which? <input class="inline-input sw" placeholder="RED / YELLOW"></div>
        <div><label>Adjustments for next time?</label> <input class="inline-input adj editable-field" placeholder="Type adjustments…"></div>
        <div class="full"><label>Debrief notes</label> <textarea class="note-box" placeholder="Write any observations, incidents, or adjustments…"></textarea></div>
      </div>
      <div class="sign-row">
        <div class="sign-field"><label>Deep's signature (debrief)</label><span class="initials-slot" data-area="debrief-day${N}" data-party="Deep"><input type="text" class="editable-field" placeholder="Signature"></span></div>
        <div class="sign-field"><label>Date</label>${dmyPill()}</div>
      </div>
      <div class="sign-row">
        <div class="sign-field"><label>Honey's signature (debrief)</label><span class="initials-slot" data-area="debrief-day${N}" data-party="Honey"><input type="text" class="editable-field" placeholder="Signature"></span></div>
        <div class="sign-field"><label>Date</label>${dmyPill()}</div>
      </div>

      <!-- Our love stamp — Drive ref: https://drive.google.com/file/d/1xT4SnUR8dtEHP14MUMFZnYZnumAS96Fw/view?usp=sharing (local copy) -->
      <div class="love-stamp">
        <img src="img/love-stamp.png" alt="Our love stamp" loading="lazy">
        <span class="stamp-caption">✦ Our love stamp ✦</span>
      </div>
    </section>`;
  };

  /* ---------- append a freshly created day ---------- */
  const STATIC_IDS = new Set(['day1']);   // days shipped in index.html — never persisted
  const persistDays = () => {
    const list = $$('.page')
      .filter(p => dayNumber(p.id) && !STATIC_IDS.has(p.id))
      .map(p => ({ id: p.id, html: p.outerHTML }));
    window.CloudStore.saveDays(list)
      .then(ok => { if (!ok && !window.CloudStore.ready) toast('⚠️ Cloud not configured — this day lives in the page only.', 3200); });
  };
  const addDayPage = p => {
    const tpl = document.createElement('template');
    tpl.innerHTML = dayPageHTML(p).trim();
    const section = tpl.content.firstElementChild;
    const summary = $('#summary');
    $('#main-contract').insertBefore(section, summary);
    wireNewDay(section);
    ensureSignAccepts(section);   // v1.9 DH: an Accept option beside every signature row
    syncLockUI(section);
    return section;
  };

  /* ---------- v1.9 DH: guarantee an Accept button wherever a sign is required ----------
     Any .sign-row containing an initials-slot without its own accept button gets a
     compact inline "Accept / Signed ✓ · Undo" control wired into the same area. */
  const ensureSignAccepts = (root = document) => {
    normaliseAreas(root);   // v1.9 DH: every slot/button gets a valid data-area first
    /* accept buttons that live OUTSIDE any .sign-row (e.g. the witness line) */
    $$('.accept-btn[data-party]:not([data-area])', root).forEach(b => { b.dataset.area = 'seal'; });
    $$('.sign-row', root).forEach(row => {
      $$('.initials-slot[data-party][data-area]', row).forEach(slot => {
        const party = slot.dataset.party;
        const area  = slot.dataset.area;
        if ($(`.accept-btn[data-party="${party}"][data-area="${area}"]`, row)) return;
        const label = slot.closest('.sign-field')?.querySelector('label')?.textContent || 'Signature';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'accept-btn accept-inline';
        btn.dataset.party = party;
        btn.dataset.area  = area;
        btn.title = `Accept & sign as ${party} (${label.trim()}) — undo available any time`;
        row.appendChild(btn);
        syncAreaUI(party, area, !!(readAccepts()[area] || {})[party]);
      });
    });
  };

  /* wire behaviours that static markup relies on (auto-grow, date pills, clear, lock) */
  const wireNewDay = page => {
    wireTextareas(page);
    wirePills(page);
    const clearBtn = $('.clear-day-btn', page);
    if (clearBtn) clearBtn.addEventListener('click', () => clearDay(clearBtn));
    const dfSel = $('.day-finished-select', page);
    if (dfSel) dfSel.addEventListener('change', () => {
      syncLockUI(page);
      writeStore();
      toast(dayLocked(page)
        ? `🔒 ${page.id.toUpperCase()} marked finished — signatures & fields are sealed.`
        : `🔓 ${page.id.toUpperCase()} is open again — every sign and field is editable.`);
    });
  };

  /* ---------- "write into day": fill Article 3 table of an open day ---------- */
  const writeIntoDay = p => {
    const page = $('#' + p.target);
    if (!page || dayLocked(page)) { toast('🔒 That day is marked finished — unlock it first.', 3200); return false; }
    const bill = $$('table', page)[1];               // Article 3 · Play Bill
    if (!bill) return false;
    p.seqs.forEach(k => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escH(SEQ_LIB[k].name)}</td><td>${escH(SEQ_LIB[k].toy)}</td>`;
      bill.appendChild(tr);
    });
    if (p.notes) {
      const quotes = $$('.quote', page);
      if (quotes.length) quotes[quotes.length - 1].insertAdjacentHTML('afterend',
        `<p class="quote"><strong>AI note:</strong> “${escH(p.notes)}”</p>`);
    }
    return true;
  };

  aiApplyBtn.addEventListener('click', () => {
    if (!aiDraft) return;
    if (aiMode === 'create') {
      const created = `✨ Day ${aiDraft.n} created by the AI — review it together before signing ♥`;
      const section = addDayPage(aiDraft);
      persistDays();
      aiDraft = null;
      aiApplyBtn.disabled = true;
      closeAi();
      save();
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast(created, 3400);
    } else {
      const targetName = String(aiDraft.target).toUpperCase();
      if (writeIntoDay(aiDraft)) {
        persistDays();                       // keep the written rows across reloads
        toast(`✍️ AI wrote the chosen sequence into ${targetName}.`, 3200);
        aiDraft = null;
        aiApplyBtn.disabled = true;
        closeAi();
        save();
      }
    }
  });

  /* ---------- textareas: auto-adjust height with content (compact by default) ---------- */
  const autoGrow = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  const autoGrowAll = () => $$('textarea').forEach(autoGrow);
  const wireTextareas = root => $$('textarea', root).forEach(ta => ta.addEventListener('input', () => autoGrow(ta)));

  /* ---------- inline text inputs: grow to fit their text, stay compact ---------- */
  const GROW_FONT = '15px "Cormorant Garamond", Georgia, serif';
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  const growInput = inp => {
    if (inp.dataset.pill === '1') return;                 // DD/MM/YYYY pills keep fixed size
    const min = parseFloat(getComputedStyle(inp).minWidth) || 70;
    const max = parseFloat(inp.dataset.growMax || '340');
    mctx.font = getComputedStyle(inp).font || GROW_FONT;
    const w = Math.ceil(mctx.measureText(inp.value || inp.placeholder || '').width) + 26;
    inp.style.width = Math.min(Math.max(w, min), max) + 'px';
  };
  const growInputsIn = root => $$('input[type="text"]', root).forEach(growInput);
  document.addEventListener('input', e => {
    const inp = e.target;
    if (inp.matches && inp.matches('#main-contract input[type="text"]:not([maxlength])')) growInput(inp);
  }, true);

  /* ---------- date/time pills: auto-advance + digits only ---------- */
  const wirePills = root => $$('.datetime-group', root).forEach(group => {
    const inputs = $$('input', group);
    inputs.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '');
        if (inp.value.length >= +inp.maxLength && i < inputs.length - 1) inputs[i + 1].focus();
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
      });
    });
  });
  wireTextareas(document);
  wirePills(document);
  $$('.datetime-group').forEach(() => {});   // keep grouping explicit for readability

  /* ============================================================
     EMAIL EXPORT
     ============================================================ */
  const modal      = $('#email-modal');
  const modalBody  = $('#modal-body');
  const tabButtons = $$('.modal-tabs button');
  let fmt  = 'plain';
  let plainText = '', htmlText = '';

  const openModal  = () => { modal.classList.add('active'); $( '.modal-close', modal ).focus(); };
  const closeModal = () => modal.classList.remove('active');

  $('#modal-close-btn').addEventListener('click', closeModal);
  $('#modal-close-footer-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  tabButtons.forEach(b => b.addEventListener('click', () => {
    tabButtons.forEach(x => { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
    b.classList.add('active');
    b.setAttribute('aria-selected', 'true');
    fmt = b.dataset.format;
    renderModal();
  }));

  const renderModal = () => {
    if (fmt === 'plain') {
      modalBody.textContent = plainText;
      modalBody.classList.remove('html-body');
    } else {
      modalBody.innerHTML = htmlText;
      modalBody.classList.add('html-body');
    }
  };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

  /* read a DD/MM/YYYY or HH:MM pill into a display string */
  const pillText = group => {
    const vals = $$('input', group).map(i => i.value.trim());
    if (vals.some(v => v)) {
      const sep = $('i', group)?.textContent || '/';
      return vals.map(v => v || '?').join(sep);
    }
    return '';
  };

  /* collect meaningful entries from one day page */
  const collectDay = page => {
    const rows = [];
    const add = (label, value) => { value = String(value ?? '').trim(); if (value) rows.push({ label, value }); };

    /* every labelled text-ish input inside tables & sign fields */
    $$('.sign-field', page).forEach(f => {
      const label = $('label', f)?.textContent.trim() || 'Field';
      const slot  = $('.initials-slot', f);
      if (slot) {
        const party = slot.dataset.party;
        const area  = slot.dataset.area || 'signatories';
        const acc   = (readAccepts()[area] || {})[party];
        const inp   = $('input', slot);
        add(label, acc ? `Signed by ${party} \u2014 accepted ${new Date(acc.ts).toLocaleString()}` : (inp?.value.trim() || '(awaiting signature)'));
        return;
      }
      const inp   = $('input:not([type="checkbox"])', f);
      const pill  = $('.datetime-group', f);
      if (pill) add(label, pillText(pill));
      else if (inp && inp.value.trim()) add(label, inp.value);
    });

    /* Article 2 style tables containing pills */
    $$('table tr', page).forEach(tr => {
      const cells = $$('td', tr);
      if (cells.length >= 2) {
        const pill = $('.datetime-group', cells[1]);
        if (pill) add(cells[0].textContent.trim(), pillText(pill));
      }
    });

    /* special requests */
    $$('.quote', page).forEach(q => {
      const who = $('strong', q)?.textContent.trim();
      if (who) add(who, q.textContent.replace(/^\s*\S+:/, '').replace(/[“”]/g, '').trim());
    });

    /* v2.7 DH — ALL important data must reach the HTML email, so every section of
       the Day page AND the Pre-Scene Execution Affidavit is collected below. */

    /* checklist items — ticked ones are CONFIRMED; unticked ones are still shown
       as pending so the affidavit status is complete in the export */
    $$('.checklist-item', page).forEach(item => {
      const cb = $('input[type="checkbox"]', item);
      if (cb?.checked) add('✓ Confirmed', item.textContent.trim());
      else             add('○ Pending',  item.textContent.trim());
    });

    /* safeword verification table */
    const verify = $('.verify-table', page);
    if (verify) $$('tr', verify).slice(1).forEach(tr => {
      const tds = $$('td', tr);
      if (tds.length < 3) return;
      const word = tds[0].textContent.trim().replace(/[“”]/g, '');
      const state = cell => {
        const boxes = $$('input[type="checkbox"]', cell);
        if (boxes[0]?.checked) return 'Yes';
        if (boxes[1]?.checked) return 'No';
        return '—';
      };
      add(`Safeword "${word}" — spoken by Submissive`, state(tds[1]));
      add(`Safeword "${word}" — spoken by Dominant`,  state(tds[2]));
    });

    /* toy inventory — report every listed item, even un-checked ones */
    const toys = $('.toy-table', page);
    if (toys) $$('tr', toys).slice(1).forEach(tr => {
      const tds = $$('td', tr);
      if (tds.length < 3) return;
      const conds = $$('label.yn', tds[1]).filter(l => $('input', l).checked).map(l => l.textContent.trim());
      const loc   = $('input', tds[2])?.value.trim() || '';
      add(`Toy · ${tds[0].textContent.trim()}`,
          [conds.length ? conds.join(', ') : 'not confirmed', loc && `→ ${loc}`].filter(Boolean).join('  '));
    });

    /* debrief — capture score/notes AND every checkbox + extra input (e.g.
       "Safeword used? Yes → which one") so nothing important is lost */
    $$('.debrief-grid > div', page).forEach(cell => {
      const label = $('label:not(.yn)', cell)?.textContent.trim() || 'Debrief';
      const parts = [];
      const ta = $('textarea', cell);
      if (ta?.value.trim()) parts.push(ta.value.trim());
      $$('input:not([type="checkbox"])', cell).forEach(inp => {
        if (inp !== ta && inp.value.trim()) parts.push(inp.value.trim());
      });
      const yn = $$('label.yn', cell).find(l => $('input', l).checked);
      if (yn) parts.unshift(yn.textContent.trim());
      if (parts.length) add(label, parts.join(' · '));
    });

    /* execution date/time line */
    $$('.exec-line', page).forEach(line => {
      const parts = $$('.datetime-group', line);
      const labels = $$('strong', line).map(s => s.textContent.replace(/[:*]/g, '').trim());
      parts.forEach((p, i) => add(labels[i] || 'Exec date', pillText(p)));
    });

    return rows;
  };

  /* v2.1 DH — base64 data-URI embedding was retired for the HTML email (previews
     and many email clients block data: URIs); the export now uses the public
     https links (ghUrl / viewUrl). fileToDataUri is kept only as a helper/fallback. */
  /* contract-level "important data" — header fields + rules/pledges that are not
     per-day inputs; collected live from the page so exports always match what
     the couple actually filled in. */
  const collectGlobalRows = () => {
    const rows = [];
    const add = (label, value) => { value = String(value ?? '').trim(); if (value) rows.push({ label, value }); };
    const doc = document;
    /* header: contract no + effective date pills */
    const head = $('.contract-header');
    if (head) {
      const no = $('strong', head.querySelector('.sub span'))?.textContent.trim();
      if (no) add('Contract No.', no);
      const effPill = $('.datetime-group', head.querySelector('.sub'));
      if (effPill) add('Effective date', pillText(effPill));
    }
    /* printed names from the signatories block */
    $$('.sign-field', doc).forEach(f => {
      const label = $('label', f)?.textContent.trim() || '';
      const inp = $('input:not([type="checkbox"])', f);
      if (/printed name/i.test(label) && inp?.value.trim()) add(label, inp.value.trim());
    });
    /* special requests quotes (Submissive / Dominant wishes) */
    $$('.quote', doc).forEach(q => {
      const who = $('strong', q)?.textContent.trim();
      if (who) add(who, q.textContent.replace(/^\s*\S+:/, '').replace(/[“”]/g, '').trim());
    });
    const heads = $$('h2', doc).map(h => h.textContent.trim()).filter(t => /Day\s*\d/i.test(t));
    if (heads.length) add('Days covered', heads.join('  ·  '));
    /* safewords from the verification table(s) */
    const words = [];
    $$('.verify-table tr', doc).slice(1).forEach(tr => {
      const word = $('td', tr)?.textContent.trim();
      if (word) words.push(word);
    });
    if (words.length) add('Safeword' + (words.length > 1 ? 's' : ''), words.join(' / '));
    /* v2.5 DH — MAIN THINGS ONLY: consent declaration kept (core), but the long
       Always-do / Never-do rule lists are intentionally EXCLUDED from the email —
       they live in the contract itself; the export stays short and readable. */
    const consent = [...$$('.quote', doc)].map(q => q.textContent.trim())
      .find(t => /consent to this scene/i.test(t));
    if (consent) add('Consent declaration', consent.replace(/[“”]/g, ''));
    return rows;
  };
  const uriCache = {};
  const fileToDataUri = async path => {
    if (uriCache[path]) return uriCache[path];
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(res.status);
      const blob = await res.blob();
      uriCache[path] = await new Promise((res2, rej) => {
        const r = new FileReader();
        r.onload = () => res2(r.result);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      return uriCache[path];
    } catch { return ''; }   // offline / missing file → caller degrades to text link
  };

  const buildEmail = async () => {
    const done = $$('.day-finished-select').filter(s => s.value === 'yes');
    if (!done.length) {
      toast('⚠️ Mark at least one day as finished before exporting.', 3200);
      return null;
    }
    await loadImageUris();   // v2.4 DH: embed base64 copies so images preview even offline / when Drive links are blocked
    const now = new Date().toLocaleString();
    /* v2.6 DH — ALL IMPORTANT DATA MUST EXPORT: finished days auto-collapse and
       collapsed fields keep their values (CSS display:none only), but to be 100%
       safe we temporarily reveal each collapsed day while collecting, then restore. */
    const days = done.map(s => {
      const page = $('#' + s.dataset.day);
      const wasCollapsed = page?.classList.contains('day-collapsed');
      if (wasCollapsed) page.classList.remove('day-collapsed');
      const rows = collectDay(page);
      if (wasCollapsed) page.classList.add('day-collapsed');
      return { id: s.dataset.day, rows };
    });

    /* signature status block for the export — per AREA: accepted there → embed img; else awaiting */
    const accepts = readAccepts();
    let sigPlain = '';
    let sigHtml  = '';
    const AREA_NAMES = { seal: 'Seal', signatories: 'Signatories', debrief: 'Debrief' };
    const nameOf = a => AREA_NAMES[a] || a.replace(/-/g, ' · ').replace(/^(.)/, m => m.toUpperCase());
    /* v2.2 DH — images referenced by PUBLIC https links so the copied HTML
       previews correctly everywhere: <img src> uses lh3.googleusercontent.com
       (always serves real image pixels — uc?export=view often returns an HTML
       warning page instead), and every image is ALSO a clickable anchor to its
       Drive /view link, with a text fallback if the preview blocks remote imgs. */
    const partyImg = p => ghUrl(p, 480, 160);          // embed-safe direct pixel URL
    /* v2.6 DH — user request: NO "View on Google Drive" text/links anywhere inside
       the HTML email. The exported HTML now uses ONLY self-contained images:
       src = compact base64 embed (renders in every HTML previewer, even offline);
       onerror chain: public lh3 pixel link → inline SVG mark. Never blank. */
    const imgTag = (k, w, h, alt, style) => {
      const main = DATA_URIS[k] || ghUrl(k, w, h);     // compressed embed, else plain pixel link
      return `<img src="${escA(main)}" alt="${esc(alt)}" width="${w}" onerror="this.onerror=null;this.src='${ghUrl(k, w, h)}';this.onerror=function(){this.onerror=null;this.src='${SIG_SVG[k]}'}" style="${style}">`;
    };
    /* v2.6 DH — MAIN THINGS ONLY: one clean row per person (not per area), with the
       real sign image and its accepted status. No Drive links shown. */
    Object.keys(SIG_CONFIG).forEach(party => {
      const acceptedAreas = AREAS.filter(a => (accepts[a] || {})[party]);
      const status = acceptedAreas.length === AREAS.length ? 'Accepted &amp; signed'
                   : acceptedAreas.length ? `Accepted: ${acceptedAreas.map(nameOf).join(', ')}`
                   : 'Awaiting in-app accept';
      sigPlain += `  ${party}: ${status.replace(/&amp;/g, '&')}\n`;
      sigHtml += `<tr>` +
        `<td style="padding:12px 0;border-bottom:1px solid #f3e6da;font-size:14px;color:#4a362c;width:46%"><strong style="color:#7b2d3b">${esc(party)}</strong><br><span style="font-size:12px;color:#5b4437">${status}</span></td>` +
        `<td align="right" style="padding:12px 0;border-bottom:1px solid #f3e6da">` +
        imgTag(party, 200, 56, `${party} signature`, 'height:56px;width:auto;max-width:220px;display:inline-block;vertical-align:middle;border:0') +
        `</td></tr>`;
    });
    sigHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${sigHtml}</table>`;

    /* v2.6 DH — header banner + footer branding: NO Google Drive links/anchors
       anywhere in the HTML email (user request). Images are self-contained
       base64 embeds with pixel-link → SVG fallback chain only. */
    const headHtml =
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fdf6f0;border-left:4px solid #c98a97;border-right:4px solid #c98a97;border-top:4px solid #c98a97">` +
      `<tr><td align="center" style="padding:30px 20px 10px">` +
      imgTag('logo', 120, 104, 'Soulmate code logo', 'height:104px;width:auto;max-width:120px;display:block;margin:0 auto;border:0') +
      `<div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#7b2d3b;margin-top:12px">Soulmate&nbsp;Code</div>` +
      `<div style="font-family:Georgia,serif;font-style:italic;font-size:14px;color:#a04b5c;margin-top:6px">&#9829; Two hearts, one covenant &#9829;</div>` +
      `<div style="width:80px;height:2px;background:#c98a97;margin:16px auto"></div>` +
      `<div style="font-family:Georgia,serif;font-size:20px;color:#4a362c">&#9829; Deep &amp; Honey &mdash; Scene Contract Export &#9829;</div>` +
      `<div style="font-size:13px;color:#5b4437;margin-top:12px">Exported: ${esc(now)}<br>Completed: <strong>${days.map(d => esc(d.id.toUpperCase())).join(', ')}</strong></div>` +
      `</td></tr></table>`;
    const footHtml =
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:30px">` +
      `<tr><td align="center" style="padding:26px 20px;background:#faf1ea;border:1px solid #e7d6c8;border-top:3px double #c98a97">` +
      imgTag('stamp', 140, 116, 'Our love stamp', 'height:116px;width:auto;max-width:140px;display:block;margin:0 auto;border:0') +
      `<div style="font-size:13px;color:#7b2d3b;letter-spacing:.12em;margin-top:8px">&#10022; OUR LOVE STAMP &#10022;</div>` +
      `<p style="margin:16px 0 4px;font-style:italic;font-size:14px;color:#5b4437;font-family:Georgia,serif">&ldquo;Every scene a promise, every promise kept &mdash; with all our love, Deep &amp; Honey &#9829;&rdquo;</p>` +
      `<p style="margin:0;font-size:12px;color:#8a6f5f">Confidentiality notice: strictly private between Deep &amp; Honey.</p>` +
      `</td></tr></table>`;

    let plain = `\u2665 DEEP & HONEY \u2014 SCENE CONTRACT EXPORT \u2665\nExported: ${now}\nCompleted: ${days.map(d => d.id.toUpperCase()).join(', ')}\n${'='.repeat(52)}\n\nSignatures:\n${sigPlain.replace(/<\/?[^>]+>/g, '')}`;
    /* v2.6 DH — plain text export: no Drive links, main things only */

    /* contract-level important data block (names/dates/pledge/rules) */
    const globalRows = collectGlobalRows();
    let globalHtml = '';
    globalRows.forEach(r => {
      plain += `\n${r.label}: ${r.value}`;
      globalHtml += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:6px 0;border-bottom:1px solid #f3e6da;font-size:14px;color:#4a362c"><strong style="color:#7b2d3b">${esc(r.label)}:</strong> ${esc(r.value)}</td></tr></table>`;
    });

    /* full standalone HTML document — pastes into any HTML preview and renders with images */
    const sectionH3 = t => `<h3 style="font-family:Georgia,serif;color:#7b2d3b;border-bottom:2px solid #dccdbd;padding-bottom:4px;margin:24px 0 10px;font-size:16px;letter-spacing:.08em;text-transform:uppercase">${t}</h3>`;
    /* v2.7 DH — sub-heading used to split each day's export into its two big blocks */
    const sectionH4 = t => `<h4 style="font-family:Georgia,serif;color:#a04b5c;margin:18px 0 6px;font-size:14px;letter-spacing:.06em">&#9825; ${t}</h4>`;
    const rowHtml = r => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:6px 0;border-bottom:1px solid #f3e6da;font-size:14px;color:#4a362c"><strong style="color:#7b2d3b">${esc(r.label)}:</strong> ${esc(r.value)}</td></tr></table>`;
    let bodyHtml =
      headHtml +
      (globalHtml ? sectionH3('Contract Overview') + globalHtml : '') +
      sectionH3('Signatures') + sigHtml;

    days.forEach(({ id, rows }) => {
      const title = $(`#${id} h2`)?.textContent.trim() || id.toUpperCase();
      plain += `\n── ${title} ──\n`;
      bodyHtml += sectionH3(esc(title));
      if (!rows.length) { plain += '  (no entries recorded)\n'; bodyHtml += '<p style="color:#5b4437;font-size:14px;margin:0 0 10px">(no entries recorded)</p>'; }

      /* v2.7 DH — the collected rows are grouped so the HTML email clearly shows
         both big blocks the couple asked for:
         1) "Day Section"        → activities, timings, requests, signatures …
         2) "Pre-Scene Execution Affidavit" → exec date/time, checklist confirmations,
            safeword verification, toy inventory, debrief, debrief signatures.
         Rows carrying an affidavit marker go to block 2; everything else to block 1. */
      const AFFIDAVIT_MARKERS = [
        '✓ Confirmed', '○ Pending',
        'Date of execution', 'Time',
        /^Safeword "/i, /^Toy · /i,
        /signature \(debrief\)/i,
        /Overall satisfaction|Aftercare effectiveness|Safeword used|Adjustments for next time|Debrief notes/i
      ];
      const isAffidavit = r => AFFIDAVIT_MARKERS.some(m => typeof m === 'string' ? r.label.startsWith(m) : m.test(r.label));
      const dayRows = rows.filter(r => !isAffidavit(r));
      const affRows = rows.filter(isAffidavit);

      const renderGroup = list => list.forEach(r => {
        plain += `  ${r.label}: ${r.value}\n`;
        bodyHtml += rowHtml(r);
      });

      if (dayRows.length) { bodyHtml += sectionH4('Day Section'); renderGroup(dayRows); }
      if (affRows.length) { bodyHtml += sectionH4(`Pre-Scene Execution Affidavit — ${esc(title)}`); renderGroup(affRows); }
    });
    bodyHtml += footHtml;

    plain += `\n${'='.repeat(52)}\nCONFIDENTIAL — private between Deep & Honey.\n`;
    const html =
`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Deep &amp; Honey — Scene Contract Export</title>
</head>
<body style="margin:0;padding:0;background:#f6ede6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f6ede6">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;border-collapse:collapse;background:#ffffff;border:1px solid #e7d6c8;border-radius:10px;box-shadow:0 2px 8px rgba(90,50,40,.08);font-family:Georgia,'Times New Roman',serif;color:#2a1c16">
<tr><td style="padding:26px 28px">
${bodyHtml}
</td></tr></table>
</td></tr></table>
</body>
</html>`;

    return { plain, html };
  };

  $('#email-contract').addEventListener('click', async () => {
    const out = await buildEmail();
    if (!out) return;
    plainText = out.plain; htmlText = out.html;
    renderModal();
    openModal();
  });

  $('#modal-copy-btn').addEventListener('click', async () => {
    const text = fmt === 'plain' ? plainText : htmlText;
    try { await navigator.clipboard.writeText(text); toast('📋 Copied to clipboard.'); }
    catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('📋 Copied to clipboard.'); }
      catch { toast('Copy failed — please select the text manually.', 3200); }
      ta.remove();
    }
  });

  $('#modal-email-btn').addEventListener('click', () => {
    const subject = encodeURIComponent('Deep & Honey — Contract Data (' + new Date().toLocaleDateString() + ')');
    const body = encodeURIComponent(plainText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  });
})();

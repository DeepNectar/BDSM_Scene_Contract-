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
  const aiChipsS   = $$('#ai-seq-chips .ai-chip');
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
  aiChipsS.forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));

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

  /* ---- sequence knowledge base (everything stays SSC/RACK-safe) ---- */
  const SEQ_LIB = {
    sensory: {
      name: 'Sensory deprivation', toy: 'Silk blindfold / noise-reducing headphones',
      hard: 'Blindfold removed instantly on RED or any non-verbal signal; never combined with positional restraint that hides distress.',
      step: ['blindfold on, narrate every touch before it lands', 'build anticipation through sound & silence']
    },
    restraint: {
      name: 'Restraint (upper body)', toy: 'Silk ties / scarves and/or metal handcuffs — never simultaneously on the same limb',
      hard: 'Circulation & comfort check every 10 minutes; key visible and within reach at all times.',
      step: ['wrists bound softly, padding under every knot', 'reassurance check-in before leaving her still']
    },
    bondage: {
      name: 'Bondage / rope', toy: 'Soft cotton rope — single-column wraps, quick-release safety knots',
      hard: 'Every tie carries a quick-release; safety shears beside the mat; no rope on the neck.',
      step: ['rope dressing at a slow, deliberate pace', 'single-column tie with constant verbal check-ins']
    },
    impact: {
      name: 'Impact play', toy: 'Soft flogger / leather paddle',
      hard: 'Strikes only over muscle or flesh-safe zones — never kidneys, spine, or joints; warm-up strokes first.',
      step: ['warm-up taps, rising rhythm', 'steady strokes with afterglow rub between sets']
    },
    sensation: {
      name: 'Temperature / sensation', toy: 'Ice cubes + warm breath contrast, feathers, clothespins/clamps',
      hard: 'Ice never contacts neck, face, or mucosa and never rests longer than 5 seconds; clamps max 10 consecutive minutes with a timer.',
      step: ['ice trails across shoulders and spine', 'clamps applied + 10-minute timer set', 'alternating warm breath after each trail']
    },
    powerexchange: {
      name: 'Power exchange / orders', toy: 'Voice, posture, ritual of address ("Sir" / "Ma’am")',
      hard: 'Orders stop instantly on YELLOW; negotiation of scenes-of-authority happens pre-scene, never mid-play.',
      step: ['kneeling check-in, three simple escalating orders', 'praise woven between commands']
    },
    service: {
      name: 'Service submission', toy: 'Small rituals — pouring tea, offering slippers, attentive tasks',
      hard: 'Service tasks are framed as gifts, never tests; correction stays gentle and in-negotiation.',
      step: ['tea ceremony performed slowly, eyes lowered', 'task list read aloud, one graceful act at a time']
    },
    edging: {
      name: 'Teasing & edging', toy: 'Hands, lips, vibrator on lowest setting',
      hard: 'Edge count agreed beforehand; GREEN/YELLOW governs pace; orgasm denial ends on request.',
      step: ['slow tease, drawn-out anticipation', 'first edge held, then released with praise']
    },
    aftercare: {
      name: 'Aftercare', toy: 'Warm blanket, herbal tea, moisturiser, massage, unhurried cuddles',
      hard: 'Aftercare is mandatory and never shortened; debrief begins only once both are warm, hydrated and settled.',
      step: ['blanket wrap + hydration immediately at scene end', 'massage, debrief and ≥20 minutes of undistracted cuddling']
    }
  };
  const SEQ_ORDER = Object.keys(SEQ_LIB);

  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

  const buildPlan = () => {
    const picked = SEQ_ORDER.filter(k => $(`#ai-seq-chips [data-seq="${k}"]`).classList.contains('active'));
    const seqs = picked.length ? picked : ['sensory', 'restraint', 'sensation', 'edging', 'aftercare'];
    const duration = $('#ai-duration').value.trim() || 'Seventy-five (75) minutes of active scene play, plus generous aftercare';
    const notes    = $('#ai-notes').value.trim();
    const target   = aiDaySel.value;
    const n        = dayNumber(target.startsWith('new:') ? target.slice(4) : target) || 99;
    const dateStr  = n === 1 ? '30 July 2026' : 'to be filled in ✍️';
    const protocol = seqs.map(k => SEQ_LIB[k].name).join(' → ');
    return { n, seqs, duration, notes, target, dateStr, protocol };
  };

  const renderPreview = p => {
    const acts = p.seqs.map(k => `<li><strong>${escH(SEQ_LIB[k].name)}</strong> — ${escH(SEQ_LIB[k].toy)}</li>`).join('');
    const lims = p.seqs.map(k => `<li>${escH(SEQ_LIB[k].hard)}</li>`).join('');
    const steps = p.seqs.map((k, i) => `<li>T+${i * 10} · <strong>${escH(SEQ_LIB[k].name)}</strong>: ${escH(SEQ_LIB[k].step.join('; '))}</li>`).join('');
    aiPreview.innerHTML =
      `<p><strong>Day ${p.n} · ${escH(p.dateStr)} — Private Bedroom / Play Space</strong></p>` +
      `<p><em>Duration:</em> ${escH(p.duration)}</p>` +
      `<p><em>Protocol:</em> ${escH(p.protocol)}</p>` +
      (p.notes ? `<p><em>Your notes:</em> ${escH(p.notes)}</p>` : '') +
      `<p><em>Play bill:</em></p><ul>${acts}</ul>` +
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
    const lims = p.seqs.map((k, i) => `<tr><td>5.${i + 1}</td><td>${escH(SEQ_LIB[k].hard)}</td></tr>`).join('');
    const steps = p.seqs.map((k, i) =>
      `<tr><td>T+${i * 10}</td><td>${escH(SEQ_LIB[k].step.join(' — '))}</td><td>${i % 2 ? 'Both' : 'Deep'}</td><td>Consent checks throughout</td></tr>`).join('');
    return `
    <section class="page" id="day${N}">
      <div class="page-head">
        <h2>Day ${N} · ${escH(p.dateStr)} — Private Bedroom / Play Space</h2>
        <span class="day-badge">✨ AI-drafted · ♥ Consent first</span>
      </div>
      <div class="day-finished">
        <label for="df-day${N}">📌 Day finished:</label>
        <select class="day-finished-select" id="df-day${N}" data-day="day${N}">
          <option value="no">❌ No</option>
          <option value="yes">✅ Yes</option>
        </select>
        <button class="collapse-toggle" type="button" aria-expanded="true" title="Collapse / expand this day">▾ Collapse</button>
        <button class="clear-day-btn" type="button" data-day="day${N}">🗑 Clear this day</button>
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
        <tr><td>2.3 Venue</td><td>Private bedroom / play space. No third parties present.</td></tr>
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
        <tr><td>Warm blanket wrap (thermal regulation)</td><td>Immediate</td></tr>
        <tr><td>Hydration — warm herbal tea or still water</td><td>Upon request</td></tr>
        <tr><td>Gentle massage of bound / played areas</td><td>5 minutes per limb</td></tr>
        <tr><td>Undistracted cuddling, verbal debrief, emotional reconnection</td><td>Minimum 20 minutes</td></tr>
        <tr><td>Light snack — chocolate or fruit</td><td>Upon request</td></tr>
      </table>

      <h3 class="section-title">Article 7 · Special Requests &amp; Desires</h3>
      <p class="quote"><strong>Submissive:</strong> <input class="inline-input editable-field" style="width:80%" placeholder="Type Honey's request…"></p>
      <p class="quote"><strong>Dominant:</strong> <input class="inline-input editable-field" style="width:80%" placeholder="Type Deep's wish…"></p>
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

    /* checklist items ticked */
    $$('.checklist-item', page).forEach(item => {
      const cb = $('input[type="checkbox"]', item);
      if (cb?.checked) add('Confirmed', item.textContent.trim());
    });

    /* safeword verification table */
    const verify = $('.verify-table', page);
    if (verify) $$('tr', verify).slice(1).forEach(tr => {
      const tds = $$('td', tr);
      if (tds.length < 3) return;
      const word = tds[0].textContent.trim();
      const state = cell => {
        const boxes = $$('input[type="checkbox"]', cell);
        if (boxes[0]?.checked) return 'Yes';
        if (boxes[1]?.checked) return 'No';
        return '';
      };
      add(`${word} — spoken by Sub`, state(tds[1]));
      add(`${word} — spoken by Dom`, state(tds[2]));
    });

    /* toy inventory */
    const toys = $('.toy-table', page);
    if (toys) $$('tr', toys).slice(1).forEach(tr => {
      const tds = $$('td', tr);
      if (tds.length < 3) return;
      const conds = $$('label.yn', tds[1]).filter(l => $('input', l).checked).map(l => l.textContent.trim());
      const loc   = $('input', tds[2])?.value.trim() || '';
      if (conds.length || loc) add(tds[0].textContent.trim(), [conds.join(', '), loc && `→ ${loc}`].filter(Boolean).join(' '));
    });

    /* debrief */
    $$('.debrief-grid > div', page).forEach(cell => {
      const label = $('label:not(.yn)', cell)?.textContent.trim() || 'Debrief';
      const inp   = $('input:not([type="checkbox"])', cell);
      const ta    = $('textarea', cell);
      if (ta?.value.trim()) add(label, ta.value.trim());
      else if (inp?.value.trim()) add(label, inp.value.trim());
      const yn = $$('label.yn', cell).find(l => $('input', l).checked);
      if (yn && !inp?.value.trim() && !ta) add(label, yn.textContent.trim());
    });

    /* execution date/time line */
    $$('.exec-line', page).forEach(line => {
      const parts = $$('.datetime-group', line);
      const labels = $$('strong', line).map(s => s.textContent.replace(/[:*]/g, '').trim());
      parts.forEach((p, i) => add(labels[i] || 'Exec date', pillText(p)));
    });

    return rows;
  };

  /* v1.9 DH — load a project image as a base64 data URI so the email HTML export
     shows real images (relative paths & Drive /view links both break in email). */
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
    const now = new Date().toLocaleString();
    const days = done.map(s => ({ id: s.dataset.day, rows: collectDay($('#' + s.dataset.day)) }));

    /* signature status block for the export — per AREA: accepted there → embed img; else awaiting */
    const accepts = readAccepts();
    let sigPlain = '';
    let sigHtml  = '<div style="margin:0 0 14px">';
    const AREA_NAMES = { seal: 'Seal', signatories: 'Signatories', debrief: 'Debrief' };
    const nameOf = a => AREA_NAMES[a] || a.replace(/-/g, ' · ').replace(/^(.)/, m => m.toUpperCase());
    /* v2.0 DH — ALL signature images (Deep & Honey PNGs, love stamp, Soulmate code logo)
       embedded as base64 data URIs so they render inside the HTML email itself. */
    const [deepUri, honeyUri, stampUri, logoUri] = await Promise.all([
      fileToDataUri(SIG_CONFIG.Deep),
      fileToDataUri(SIG_CONFIG.Honey),
      fileToDataUri('img/love-stamp.png'),
      fileToDataUri('img/soulmate-logo.png'),
    ]);
    const partyUri = p => (p === 'Deep' ? deepUri : honeyUri) || SIG_CONFIG[p];
    AREAS.forEach(area => {
      const byParty = accepts[area] || {};
      Object.keys(SIG_CONFIG).forEach(party => {
        const acc = byParty[party];
        const tag = `${nameOf(area)} — ${party}`;
        if (acc) {
          sigPlain += `  ${tag}: signed (${new Date(acc.ts).toLocaleString()})\n`;
          sigHtml += `<div style="padding:6px 0;border-bottom:1px solid #efe3d4"><strong>${esc(tag)}:</strong> accepted &amp; signed ` +
                     `<img src="${partyUri(party)}" alt="${esc(party)} signature" width="150" height="48" style="height:48px;width:auto;max-width:200px;vertical-align:middle;margin-left:10px;display:inline-block;border:none"></div>`;
        } else {
          sigPlain += `  ${tag}: (awaiting signature)\n`;
          sigHtml += `<div style="padding:6px 0;border-bottom:1px solid #efe3d4"><strong>${esc(tag)}:</strong> <em>(awaiting signature)</em></div>`;
        }
      });
    });
    sigHtml += '</div>';

    /* Our love stamp + Soulmate code logo — embedded as data URIs in the HTML email;
       plain-text version carries the Drive links (in-app previews use local copies).
       v2.0 DH — bigger sizes + explicit width/height attrs (email clients honour them). */
    const brandHtml =
      (logoUri  ? `<div style="text-align:center;padding:10px 0"><img src="${logoUri}" alt="Soulmate code logo" width="220" height="220" style="height:110px;width:auto;max-width:220px;display:inline-block;border:none"><div style="font-family:Georgia,serif;font-size:26px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#7b2d3b;margin-top:6px">Soulmate Code</div></div>` : '') +
      (stampUri ? `<div style="text-align:center;padding:10px 0"><img src="${stampUri}" alt="Our love stamp" width="160" height="160" style="height:120px;width:auto;max-width:160px;display:inline-block;border:none"><div style="font-size:13px;color:#5b4437">\u2726 Our love stamp \u2726</div></div>` : '');

    let plain = `\u2665 DEEP & HONEY \u2014 SCENE CONTRACT EXPORT \u2665\nExported: ${now}\nCompleted: ${days.map(d => d.id.toUpperCase()).join(', ')}\n${'='.repeat(52)}\n\nSignatures:\n${sigPlain}`;
    plain += `\nOur love stamp: https://drive.google.com/file/d/1xT4SnUR8dtEHP14MUMFZnYZnumAS96Fw/view?usp=sharing\nSoulmate code logo: https://drive.google.com/file/d/17_Wt5nHtKbuDc7DiynDexI-l-GY8RpgS/view?usp=sharing\nDeep's signature: https://drive.google.com/file/d/1KnoE8uWAwugB0PRMiPmq32eCW-ZxMasj/view?usp=sharing\nHoney's signature: https://drive.google.com/file/d/1HRoqjVvSDswlROnookv0ykGagHwLQ6FI/view?usp=sharing\n`;
    let html  = `<div style="font-family:Georgia,serif;color:#2a1c16">` +
                (logoUri ? `<div style="text-align:center;padding:0 0 8px"><img src="${logoUri}" alt="Soulmate code logo" width="220" height="220" style="height:96px;width:auto;max-width:220px;display:inline-block;border:none"></div>` : '') +
                `<h2 style="letter-spacing:.05em;margin:0 0 4px">\u2665 Deep &amp; Honey \u2014 Scene Contract Export</h2>` +
                `<p style="margin:0 0 4px;color:#5b4437">Exported: ${esc(now)}</p>` +
                `<p style="margin:0 0 8px;color:#5b4437">Completed: <strong>${days.map(d => esc(d.id.toUpperCase())).join(', ')}</strong></p>` +
                `<h3 style="border-bottom:2px solid #dccdbd;padding-bottom:4px;margin:14px 0 8px">Signatures</h3>` + sigHtml;

    days.forEach(({ id, rows }) => {
      const title = $(`#${id} h2`)?.textContent.trim() || id.toUpperCase();
      plain += `\n── ${title} ──\n`;
      html  += `<h3 style="border-bottom:2px solid #dccdbd;padding-bottom:4px;margin:18px 0 8px">${esc(title)}</h3>`;
      if (!rows.length) { plain += '  (no entries recorded)\n'; html += '<p style="color:#5b4437">(no entries recorded)</p>'; }
      rows.forEach(r => {
        plain += `  ${r.label}: ${r.value}\n`;
        html  += `<div style="padding:3px 0;border-bottom:1px solid #efe3d4"><strong>${esc(r.label)}:</strong> ${esc(r.value)}</div>`;
      });
    });

    plain += `\n${'='.repeat(52)}\nCONFIDENTIAL — private between Deep & Honey.\n`;
    html  += brandHtml +
             `<p style="margin-top:18px;font-style:italic;color:#5b4437">Confidentiality notice: strictly private between Deep &amp; Honey.</p></div>`;

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

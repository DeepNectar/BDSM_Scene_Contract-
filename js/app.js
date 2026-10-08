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
    loadSaved();
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
  const STORE_KEY = 'dhContract.v2';

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

  const writeStore = () => localStorage.setItem(STORE_KEY, JSON.stringify(collectState()));

  const save = () => { writeStore(); toast('💾 Saved — our contract is kept safe on this device.'); };

  const loadSaved = () => {
    let data;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return; }
    if (!data) return;
    $$('#main-contract input, #main-contract textarea, #main-contract select').forEach(el => {
      const slot = el.closest('.initials-slot');
      if (slot?.classList.contains('slot-filled')) return;   // sealed signature owns this field
      if (el.readOnly) return;                               // accept-date pills own their value
      const k = keyFor(el);
      if (!(k in data)) return;
      if (el.type === 'checkbox') el.checked = !!data[k];
      else el.value = data[k];
    });
    autoGrowAll();
  };

  $('#save-contract').addEventListener('click', save);
  $('#print-pdf').addEventListener('click', () => window.print());
  setInterval(writeStore, 60000);          // gentle autosave
  window.addEventListener('beforeunload', writeStore);

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
  const SIG_KEY   = 'signAccepted';
  const UNDO_MS   = 5 * 60 * 1000;         // undo window: 5 minutes

  const readAccepts = () => {
    try { return JSON.parse(localStorage.getItem(SIG_KEY)) || {}; }
    catch { return {}; }
  };
  const writeAccepts = a => localStorage.setItem(SIG_KEY, JSON.stringify(a));

  /* overlay the signature image onto every slot of one party */
  const fillSlots = party => {
    $$('.initials-slot[data-party="' + party + '"]').forEach(slot => {
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
    /* debrief / signatory date pills: auto-fill today's date when empty */
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const dmy = [pad(now.getDate()), pad(now.getMonth() + 1), String(now.getFullYear())];
    $$('.page').forEach(page => {
      $$('.sign-row', page).forEach(row => {
        if (!$(`.initials-slot[data-party="${party}"]`, row)) return;
        const pill = $('.datetime-group', row);
        if (!pill) return;
        $$('input', pill).forEach((inp, i) => { if (!inp.value.trim()) inp.value = dmy[i] || ''; });
      });
    });
  };

  /* undo: remove image, unlock input, clear only our auto-filled name/date */
  const clearSlots = party => {
    $$('.initials-slot[data-party="' + party + '"]').forEach(slot => {
      const img = $('.slot-sig', slot);
      if (img) img.remove();
      const inp = $('input.editable-field', slot) || $('input', slot);
      if (inp) {
        inp.readOnly = false;
        if (inp.value.trim() === party) inp.value = '';     // never delete user-typed text
      }
      slot.classList.remove('slot-filled');
    });
    /* clear only the dates we auto-filled (still matching today) */
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const dmy = [pad(now.getDate()), pad(now.getMonth() + 1), String(now.getFullYear())];
    $$('.page').forEach(page => {
      $$('.sign-row', page).forEach(row => {
        if (!$(`.initials-slot[data-party="${party}"]`, row)) return;
        const pill = $('.datetime-group', row);
        if (!pill) return;
        $$('input', pill).forEach((inp, i) => { if (inp.value.trim() === (dmy[i] || '')) inp.value = ''; });
      });
    });
  };

  const syncPartyUI = (party, accepted) => {
    $$('.accept-btn[data-party="' + party + '"]').forEach(b => {
      b.textContent = accepted ? 'Signed \u2014 tap to undo' : 'Accept as ' + party;
    });
    $$('.sig-card[data-party="' + party + '"]').forEach(card => {
      card.classList.toggle('signed', !!accepted);
      const st = $('.sig-status', card);
      if (st) st.textContent = accepted ? 'Accepted & signed' : 'Awaiting acceptance\u2026';
    });
  };

  const applySignatures = () => {
    const accepts = readAccepts();
    Object.keys(SIG_CONFIG).forEach(party => {
      const acc = accepts[party];
      if (acc) { fillSlots(party); syncPartyUI(party, true); }
      else     { clearSlots(party); syncPartyUI(party, false); }
    });
  };

  /* event delegation on document */
  document.addEventListener('click', e => {
    const btn = e.target.closest('.accept-btn');
    if (!btn) return;
    const party = btn.dataset.party;
    if (!SIG_CONFIG[party]) return;
    const accepts = readAccepts();
    const acc = accepts[party];
    if (acc) {
      if (Date.now() - acc.ts > UNDO_MS) { toast('\ud83d\udd12 Sealed \u2014 the undo window has closed. Signed with love.', 3200); return; }
      delete accepts[party];
      writeAccepts(accepts);
      clearSlots(party);
      syncPartyUI(party, false);
      toast(`\u21a9 ${party}'s signature withdrawn.`);
    } else {
      accepts[party] = { ts: Date.now() };
      writeAccepts(accepts);
      fillSlots(party);
      syncPartyUI(party, true);
      toast(`\u2764 ${party} accepted & signed \u2014 sealed in five minutes.`);
    }
    save();
  });

  /* re-apply on initial page load too — AFTER restoring saved values so that
     sealed slots/dates take ownership instead of being overwritten by old data */
  document.addEventListener('DOMContentLoaded', () => { loadSaved(); applySignatures(); });

  /* ---------- clear a day ---------- */
  $$('.clear-day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
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
    });
  });

  /* ---------- textareas: grow with content ---------- */
  const autoGrow = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  $$('textarea').forEach(ta => ta.addEventListener('input', () => autoGrow(ta)));
  const autoGrowAll = () => $$('textarea').forEach(autoGrow);

  /* ---------- date/time pills: auto-advance + digits only ---------- */
  $$('.datetime-group').forEach(group => {
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
        const acc   = readAccepts()[party];
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

  const buildEmail = () => {
    const done = $$('.day-finished-select').filter(s => s.value === 'yes');
    if (!done.length) {
      toast('⚠️ Mark at least one day as finished before exporting.', 3200);
      return null;
    }
    const now = new Date().toLocaleString();
    const days = done.map(s => ({ id: s.dataset.day, rows: collectDay($('#' + s.dataset.day)) }));

    /* signature status block for the export (accepted → embed img; else awaiting) */
    const accepts = readAccepts();
    let sigPlain = '';
    let sigHtml  = '<div style="margin:0 0 14px">';
    Object.keys(SIG_CONFIG).forEach(party => {
      const acc = accepts[party];
      if (acc) {
        sigPlain += `  ${party}: signed (${new Date(acc.ts).toLocaleString()})\n`;
        sigHtml += `<div style="padding:4px 0"><strong>${esc(party)}:</strong> accepted &amp; signed ` +
                   `<img src="${SIG_CONFIG[party]}" alt="${esc(party)} signature" style="height:40px;vertical-align:middle;margin-left:8px"></div>`;
      } else {
        sigPlain += `  ${party}: (awaiting signature)\n`;
        sigHtml += `<div style="padding:4px 0"><strong>${esc(party)}:</strong> <em>(awaiting signature)</em></div>`;
      }
    });
    sigHtml += '</div>';

    let plain = `♥ DEEP & HONEY — SCENE CONTRACT EXPORT ♥\nExported: ${now}\nCompleted: ${days.map(d => d.id.toUpperCase()).join(', ')}\n${'='.repeat(52)}\n\nSignatures:\n${sigPlain}`;
    let html  = `<div style="font-family:Georgia,serif;color:#2a1c16">` +
                `<h2 style="letter-spacing:.05em;margin:0 0 4px">♥ Deep &amp; Honey — Scene Contract Export</h2>` +
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
    html  += `<p style="margin-top:18px;font-style:italic;color:#5b4437">Confidentiality notice: strictly private between Deep &amp; Honey.</p></div>`;

    return { plain, html };
  };

  $('#email-contract').addEventListener('click', () => {
    const out = buildEmail();
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

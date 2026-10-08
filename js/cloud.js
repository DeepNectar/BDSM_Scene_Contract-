/* ============================================================
   Cloud store — v1.9 DH
   ALL state lives in Supabase (table `contract_state`).
   NOTHING is persisted to localStorage / sessionStorage / IndexedDB.
   In-memory cache only for the current session.
   Keys stored in the cloud:
     fields        → every input/textarea/select value (incl. login pw field)
     accepts       → per-area signature acceptances {area:{party:{ts}}}
     days          → AI-created day pages [{id, html}]
   ============================================================ */
(() => {
  'use strict';

  const cfg = window.SUPABASE_CONFIG || {};
  let sb = null;
  let cloudReady = false;
  let warned = false;

  try {
    if (window.supabase && window.supabase.createClient && cfg.url && cfg.anonKey
        && !cfg.url.includes('YOUR-PROJECT-REF')) {
      sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    }
  } catch (e) { console.warn('[cloud] init failed:', e); }

  const warn = () => {
    if (warned) return;
    warned = true;
    try {
      const t = document.getElementById('cloud-status');
      if (t) { t.textContent = '☁️ Cloud offline — set js/supabase-config.js'; t.title = 'Supabase not configured; entries exist in this session only.'; }
    } catch {}
  };

  /* ---------- in-memory mirror (never written to disk) ---------- */
  const mem = { fields: {}, accepts: {}, days: [] };

  const upsert = async (k, v) => {
    if (!sb) return false;
    const { error } = await sb.from('contract_state').upsert({ k, v });
    if (error) { console.warn('[cloud] upsert failed', k, error); warn(); return false; }
    return true;
  };

  const cloud = {
    get ready() { return cloudReady; },

    /* pull everything from Supabase; returns the state object */
    async load() {
      if (!sb) { warn(); return null; }
      try {
        const { data, error } = await sb.from('contract_state').select('k,v');
        if (error) throw error;
        (data || []).forEach(r => {
          if (r.k === 'fields')  Object.assign(mem.fields, r.v || {});
          if (r.k === 'accepts') Object.assign(mem.accepts, r.v || {});
          if (r.k === 'days' && Array.isArray(r.v)) mem.days = r.v;
        });
        cloudReady = true;
        return { fields: mem.fields, accepts: mem.accepts, days: mem.days };
      } catch (e) {
        console.warn('[cloud] load failed:', e);
        warn();
        return null;
      }
    },

    saveFields(fields) { mem.fields = fields; return sb ? upsert('fields', fields) : Promise.resolve(false); },
    saveAccepts(a)     { mem.accepts = a;    return sb ? upsert('accepts', a)    : Promise.resolve(false); },
    saveDays(list)     { mem.days = list;    return sb ? upsert('days', list)    : Promise.resolve(false); },

    /* synchronous accessors used by the UI between saves */
    fields()  { return mem.fields; },
    accepts() { return mem.accepts; },
    days()    { return mem.days; },
  };

  window.CloudStore = cloud;
})();

# Deep & Honey · Eternal Contract (v1.9 DH)

A private, password-gated scene contract web app. **All state lives in Supabase cloud** (`contract_state` table) — nothing is saved to localStorage/sessionStorage/IndexedDB.

## Files
- `index.html` — contract page (header now shows the **Soulmate code logo** + cloud-status pill; Day 1 carries **Our love stamp**)
- `css/styles.css` — compact theme, auto-adjusting text boxes, stamp/logo styles
- `js/app.js` — app logic (Accept/Undo everywhere, legacy accept migration, email export with embedded images)
- `js/cloud.js` — Supabase store (fields / accepts / days)
- `js/supabase-config.js` — ← put your Supabase URL + anon key here
- `img/love-stamp.png`, `img/soulmate-logo.png` — local copies of the Drive assets (Drive `/view` links are blocked in browsers/email/print, so they ship in the repo; originals: [love stamp](https://drive.google.com/file/d/1xT4SnUR8dtEHP14MUMFZnYZnumAS96Fw/view?usp=sharing) · [soulmate logo](https://drive.google.com/file/d/17_Wt5nHtKbuDc7DiynDexI-l-GY8RpgS/view?usp=sharing))
- `img/signature-deep.png`, `img/signature-honey.png` — signature images shown on Accept

## Setup
1. Create a Supabase project, paste URL + anon key into `js/supabase-config.js`.
2. Run in the SQL Editor:
```sql
create table if not exists contract_state (k text primary key, v jsonb not null, updated_at timestamptz default now());
alter table contract_state enable row level security;
create policy "contract rw" on contract_state for all using (true) with check (true);
```
3. Host anywhere static (GitHub Pages works). Signatures, fields and AI days sync through the cloud on every device.

## Notes
- Accept → signs as that party; **Signed ✓ · Undo** stays available even inside a finished day (fresh accepts remain locked).
- Text inputs/textareas are compact and auto-grow to their content.
- ✉ Email data → HTML tab embeds signatures, Our love stamp and the Soulmate code logo as data URIs (survives copy/paste into email).

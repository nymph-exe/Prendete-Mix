/* MIXER (internally the Préndete app) — shared UI: icons, helpers, storage, the single mutation path, sheets, rows, player. */
"use strict";
const IC = {play:"M8 5v14l11-7z",pause:"M6 19h4V5H6v14zm8-14v14h4V5h-4z",next:"M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",prev:"M6 6h2v12H6zm3.5 6l8.5 6V6z",
check:"M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",x:"M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
plus:"M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",search:"M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
back:"M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",aup:"M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z",adn:"M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z",
dl:"M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",spark:"M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z",
edit:"M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
trash:"M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
gear:"M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.03 7.03 0 00-1.62-.94l-.36-2.54A.5.5 0 0013.9 2h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.67 8.48a.5.5 0 00.12.64l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z",
shuffle:"M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
cards:"M7 19h10V4H7v15zm-5-2h4V6H2v11zM18 6v11h4V6h-4z",list:"M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
select:"M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
done:"M12 2a10 10 0 100 20 10 10 0 000-20zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
undo:"M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z",
image:"M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
reorder:"M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z",updown:"M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z",tune:"M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",open:"M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"};
const I = (p, c) => `<svg viewBox="0 0 24 24" aria-hidden="true"${c ? ` class="${c}"` : ""}><path d="${IC[p]}"/></svg>`;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue;
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k === "icon") e.innerHTML = I(v); else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "value") e.value = v; else e.setAttribute(k, v === true ? "" : v); }
  for (const c of kids.flat(9)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const btn = (label, cls, onclick, o = {}) => { const b = h("button", Object.assign({ class: "btn " + (cls || ""), type: "button", onclick }, o)); if (o.ic) b.innerHTML = I(o.ic); b.append(label); return b; };
const ibtn = (ic, label, onclick, cls = "", o = {}) => h("button", Object.assign({ class: "ib " + cls, type: "button", "aria-label": label, title: label, icon: ic, onclick }, o));
const sleep = Core.sleep;
const fmt = t => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
const https = u => (typeof u === "string" && /^(https:\/\/|data:image\/)/.test(u) ? u : null);
const artistsOf = a => String(a || "").split(/;\s*/).join(", ");
const plural = (n, w, p) => `${n} ${n === 1 ? w : p || w + "s"}`;
/* a song's reason for being suggested; older saves can hold "null" where a reason was missing */
const whyText = w => String(w || "").replace(/^(null|undefined)(,\s*|$)/, "").trim() || null;
const meta = t => [artistsOf(t.a), t.al, t.y].filter(Boolean).join(" · ");
const spLink = t => (t.f && t.f.sp) || "https://open.spotify.com/search/" + encodeURIComponent((t.t + " " + Core.firstArtist(t.a)).trim());
let toastT = 0;
function toast(msg, ms = 4200, action) {
  const t = $("#toast"); t.replaceChildren(h("span", { text: msg })); if (action) t.append(btn(action.label, "sm", () => { t.hidden = true; clearTimeout(toastT); action.fn(); }));
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), action ? Math.max(ms, 6500) : ms);
}
const langName = t => (t && t.lang && t.lang.src === "lyrics" && t.lang.langs.length ? t.lang.langs.map(l => (Catalog.LANG_NAMES || {})[l] || l).join(" + ") : t && t.lang && t.lang.src === "instrumental" ? "Instrumental" : "");
function hue(s) { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % 360; }
function placeholder(t) { const d = h("div", { class: "ph", "aria-hidden": "true", text: (t.t || "♪").replace(/^[^A-Za-z0-9À-ÿ]+/, "").charAt(0).toUpperCase() || "♪" }); const a = hue(t.id || t.t); d.style.background = `linear-gradient(135deg,hsl(${a} 70% 42%),hsl(${(a + 40) % 360} 80% 28%))`; return d; }
function coverEl(t) { const src = https(t.cov); if (!src) return placeholder(t); const im = h("img", { src, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }); im.addEventListener("error", () => im.replaceWith(placeholder(t)), { once: true }); return im; }
function download(name, data, type) { const b = new Blob([data], { type }); const u = URL.createObjectURL(b); const a = h("a", { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
const clone = o => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/* ---------- storage: IndexedDB (atomic transactions), localStorage fallback ---------- */
const DB = (() => {
  let db = null, mode = "idb"; const LP = "pmx:";
  function open() {
    return new Promise(res => {
      if (!("indexedDB" in window)) { mode = "ls"; return res(); }
      let req; try { req = indexedDB.open("prendete-mix", 1); } catch { mode = "ls"; return res(); }
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); if (!d.objectStoreNames.contains("tracks")) d.createObjectStore("tracks", { keyPath: "id" }); };
      req.onsuccess = () => { db = req.result; db.onversionchange = () => { db.close(); db = null; }; res(); }; req.onerror = () => { mode = "ls"; res(); }; req.onblocked = () => { mode = "ls"; res(); };
    });
  }
  function all(store) {
    if (mode === "ls") { const out = []; const p = LP + store + ":"; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(p)) { try { out.push([k.slice(p.length), JSON.parse(localStorage.getItem(k))]); } catch {} } } return Promise.resolve(out); }
    return new Promise((res, rej) => { const out = []; const tx = db.transaction(store, "readonly"); const st = tx.objectStore(store); const rq = st.openCursor();
      rq.onsuccess = () => { const c = rq.result; if (c) { out.push([c.key, c.value]); c.continue(); } }; tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); });
  }
  function tx(ops) {
    if (!ops.length) return Promise.resolve();
    if (mode === "ls") { try { for (const o of ops) { const k = LP + o.store + ":" + (o.key != null ? o.key : o.value.id); if (o.del) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(o.value)); } return Promise.resolve(); } catch (e) { return Promise.reject(new Core.OpError("SAVE", "This browser is out of space, so the change wasn't saved. Save a backup in Settings and free some space.")); } }
    return new Promise((res, rej) => {
      let t; try { if (!db) throw new Error("closed"); t = db.transaction(["kv", "tracks"], "readwrite"); } catch (e) { return rej(new Core.OpError("SAVE", "Couldn't save. Reload the page and try again.")); }
      for (const o of ops) { const st = t.objectStore(o.store); if (o.del) st.delete(o.key); else if (o.store === "tracks") st.put(o.value); else st.put(o.value, o.key); }
      t.oncomplete = () => res(); t.onerror = () => rej(new Core.OpError("SAVE", "Couldn't save the change" + (t.error && /quota/i.test(t.error.name) ? ": this browser is out of space." : ". Try again."))); t.onabort = t.onerror;
    });
  }
  /* one record: { found, value }; a read that fails counts as "not known" rather than "deleted" */
  function get(store, key) {
    if (mode === "ls") { try { const v = localStorage.getItem(LP + store + ":" + key); return Promise.resolve(v == null ? { found: false } : { found: true, value: JSON.parse(v) }); } catch { return Promise.resolve({ found: true, value: undefined, failed: true }); } }
    return new Promise(res => { try { if (!db) return res({ found: true, failed: true }); const rq = db.transaction(store, "readonly").objectStore(store).get(key); rq.onsuccess = () => res(rq.result === undefined ? { found: false } : { found: true, value: rq.result }); rq.onerror = () => res({ found: true, failed: true }); } catch { res({ found: true, failed: true }); } });
  }
  /* the open connection has to be closed or deleting the database waits forever */
  function close() { if (db) { try { db.close(); } catch {} db = null; } }
  return { open, all, get, tx, close, get mode() { return mode; } };
})();

/* ---------- state ---------- */
const S = { meta: null, pls: new Map(), tr: new Map(), tmp: new Map(), jobs: new Map(), reports: new Map(), genres: null, route: { v: "home" }, ui: { view: {}, sel: new Map(), sort: {}, card: {}, scroll: {} } };
const getTrack = id => S.tr.get(id) || S.tmp.get(id) || null;
function slimTrack(t) { const c = Object.assign({}, t); delete c._why; return c; }
/* other open tabs of the app hear about every saved change, so a stale tab can't overwrite a newer one */
const BC = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("mixer") : null;
function announce(m) { try { if (BC) BC.postMessage(m); } catch {} }
function saveMeta() { return DB.tx([{ store: "kv", key: "meta", value: S.meta }]).then(r => { announce({ t: "meta" }); return r; }); }
function saveTracks(list) { list.forEach(t => S.tr.set(t.id, t)); DB.tx(list.map(t => ({ store: "tracks", value: slimTrack(t) }))).catch(() => {}); }
/* Every playlist change goes through mutate(): clone → apply → validate invariants → persist atomically → swap in.
   A failed save leaves the previous state untouched (OPS-003, OPS-015). Calls run one at a time. */
let chain = Promise.resolve();
function mutate(id, fn, opt = {}) {
  const run = async () => {
    let cur = S.pls.get(id); if (!cur) throw new Core.OpError("GONE", "This playlist no longer exists.");
    /* start from the newest saved copy: another tab may have changed or deleted this playlist */
    const saved = await DB.get("kv", "pl:" + id);
    if (!saved.found) { S.pls.delete(id); throw new Core.OpError("GONE", "This playlist was deleted in another tab."); }
    if (saved.value && (saved.value.updatedAt || 0) > (cur.updatedAt || 0)) { try { cur = Core.checkShape(saved.value); S.pls.set(id, cur); } catch {} }
    if (opt.epoch != null && cur.epoch !== opt.epoch) throw new Core.OpError("STALE", "This playlist was reset while that was running, so the results were dropped.");
    const next = clone(cur); const result = fn(next); Core.validate(next); next.updatedAt = Date.now();
    const tr = (typeof opt.tracks === "function" ? opt.tracks(result, next) : opt.tracks || []).filter(Boolean);
    await DB.tx([{ store: "kv", key: "pl:" + id, value: next }, ...tr.map(t => ({ store: "tracks", value: slimTrack(t) }))]);
    tr.forEach(t => { S.tr.set(t.id, t); S.tmp.delete(t.id); }); S.pls.set(id, next); announce({ t: "pl", id });
    if (!opt.quiet) refresh(id);
    return result;
  };
  const p = chain.then(run); chain = p.catch(() => {}); return p;
}
async function act(fn, okMsg) { try { const r = await fn(); if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg); return r === undefined ? true : r; } catch (e) { toast(e && e.message ? e.message : "Something went wrong. Nothing was changed."); return undefined; } }

/* ---------- sheets ---------- */
const sheetStack = [];
function sheet({ title, cls = "", label, build, onClose }) {
  const wrap = h("div", { class: "sheetwrap" }); const sc = h("div", { class: "scrim" });
  const box = h("div", { class: "sheet " + cls, role: "dialog", "aria-modal": "true", "aria-label": label || title || "Dialog" });
  const last = document.activeElement; let closed = false;
  const close = v => { if (closed) return; closed = true; wrap.remove(); sheetStack.splice(sheetStack.indexOf(api), 1); if (last && last.focus && document.contains(last)) last.focus(); onClose && onClose(v); };
  const api = { close, box };
  box.append(ibtn("x", "Close", () => close(null), "x")); if (title) box.append(h("h2", { text: title }));
  wrap.append(sc, box); sc.onclick = () => close(null); $("#sheets").append(wrap); sheetStack.push(api);
  const kids = build(close, box); box.append(...[].concat(kids).flat(9).filter(Boolean));
  setTimeout(() => { const f = box.querySelector("[autofocus]") || box.querySelector(".x"); f && f.focus(); }, 30);
  return api;
}
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (sheetStack.length) sheetStack[sheetStack.length - 1].close(null); else if (!$("#npw").hidden) closeNp(); } });
function confirmSheet({ title, text, ok = "OK", cls = "red", cancel = "Cancel", extra }) {
  return new Promise(res => sheet({ title, onClose: v => res(!!v), build: close => [
    text ? (typeof text === "string" ? h("p", { class: "lede", text }) : text) : null, extra || null,
    h("div", { class: "foot" }, btn(cancel, "ghost", () => close(false)), btn(ok, cls, () => close(true), { autofocus: true }))] }));
}
/* Optional rejection feedback (FB-001..012): a reason is never required. */
function feedbackSheet({ title, lede, verb = "Reject", count = 1 }) {
  return new Promise(res => {
    let reason = null;
    sheet({ title, onClose: v => res(v || null), build: close => {
      const ta = h("textarea", { maxlength: "1000", placeholder: "Anything to add? (optional)", "aria-label": "Written feedback (optional)", rows: "3" });
      const groups = Core.REASONS.map(([g, list]) => h("div", { class: "rgrp" }, h("p", { class: "lbl", text: g }),
        h("div", { class: "chips wrapc", role: "group", "aria-label": g }, list.map(r => h("button", { class: "chip", type: "button", "aria-pressed": "false", onclick: e => {
          const on = reason !== r; reason = on ? r : null; $$(".rgrp .chip", e.target.closest(".sheet")).forEach(c => c.setAttribute("aria-pressed", String(c.textContent === reason))); go.textContent = reason ? `${verb} · ${reason}` : `${verb} without a reason`; } }, r)))));
      const go = btn(`${verb} without a reason`, "red", () => close({ reason, text: ta.value.trim() || null }));
      return [h("p", { class: "lede", text: lede || (count > 1 ? `Why? Optional. One reason applies to all ${count} songs.` : "Why? Optional, and it only applies to this playlist.") }), groups,
        h("div", { class: "field" }, ta), h("div", { class: "foot" }, btn("Cancel", "ghost", () => close(null)), go)];
    } });
  });
}

/* ---------- rows ---------- */
const Q = {};
/* a song's cover is its play button, everywhere a song is listed */
function coverBtn(t, q, ctx) { const cv = h("button", { class: "cov", type: "button", "aria-label": "Play sample of " + t.t, onclick: () => togglePlay(t, q, ctx) }, coverEl(t));
  const ov = h("span", { class: "ov" }); ov.innerHTML = I("play", "pi") + '<span class="eq"><i></i><i></i><i></i></span>'; cv.append(ov); return cv; }
function trackRow(t, o = {}) {
  const row = h("div", { class: "row" + (o.sel ? " sel" : ""), "data-k": t.id });
  if (o.sel) { const cb = h("input", { type: "checkbox", class: "ckb", "aria-label": "Select " + t.t }); cb.checked = !!o.sel.checked; cb.onchange = () => o.sel.onchange(cb.checked); row.append(cb); }
  const cv = coverBtn(t, o.q, o.ctx);
  const tx = h("div", {}, h("div", { class: "t", text: t.t }), h("div", { class: "m", text: artistsOf(t.a) }));
  if (whyText(o.why)) tx.append(h("div", { class: "why", text: whyText(o.why) }));
  if (o.fb) tx.append(h("div", { class: "fb", text: o.fb }));
  const tags = h("div", { class: "tags" }); (o.tags || []).forEach(x => tags.append(x.nodeType ? x : h("span", { class: "tag " + (x.c || ""), text: x.t })));
  if (t.y) tags.append(h("span", { class: "tag", text: String(t.y) })); const ln = langName(t); if (ln) tags.append(h("span", { class: "tag", text: ln }));
  if (t.exp) tags.append(h("span", { class: "tag", text: t.exp === "explicit" ? "Explicit" : "Clean" }));
  tags.append(h("a", { class: "lnk", href: spLink(t), target: "_blank", rel: "noopener noreferrer", text: "Spotify ↗" })); tx.append(tags);
  if (o.below) tx.append(h("div", { class: "btns", style: "margin:8px 0 0" }, o.below));
  row.append(cv, tx, h("div", { class: "acts" }, o.acts || []));
  if (P.k === t.id) { row.classList.add("cur"); if (!A.paused && !P.loading) row.classList.add("playing"); }
  return row;
}
function rowsInto(el, list, q, f, ctx) { Q[q] = list.map(t => t.id); const fr = document.createDocumentFragment(); list.forEach((t, i) => fr.append(trackRow(t, Object.assign({ q, ctx }, f(t, i))))); el.append(fr); }
/* a cell that a spreadsheet would run as a formula (starts with =, @, or +/- followed by a function call) gets a leading ' */
const csvSafe = v => (/^[=@\t\r]/.test(v) || /^[+-].*[(!]/.test(v) ? "'" + v : v);
function toCsv(list) { const rows = [["Position", "Track Name", "Artist Name", "Album"]]; list.forEach((t, i) => rows.push([i + 1, t.t, t.a, t.al])); return rows.map(r => r.map(v => { v = csvSafe(String(v ?? "")); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",")).join("\r\n") + "\r\n"; }

/* ---------- player (30-second samples) ---------- */
const A = new Audio(); A.preload = "none";
const P = { q: [], i: -1, k: null, loading: false, seq: 0, retried: null, ctx: null, scope: null };
/* samples belong to the screen they were started on (a playlist's songs, recommendations and rejected count as one screen):
   leaving it stops the sample and hides the player */
const scopeOf = r => (r.v === "pl" ? (r.tab === "settings" ? "pls:" : "pl:") + r.id : r.v);
function stopPlayer() { P.seq++; P.k = null; P.q = []; P.i = -1; P.loading = false; P.scope = null; try { A.pause(); A.removeAttribute("src"); A.load(); } catch {}
  $("#player").hidden = true; if (!$("#npw").hidden) closeNp(); markRows(); }
async function sampleUrl(t) {
  if (t.dz) { const fresh = t.prev && t.prevAt && Date.now() - t.prevAt < 3 * 3600e3; if (!fresh) { const n = await Catalog.Deezer.track(t.dz); if (n) { t.prev = n.prev; t.prevAt = Date.now(); if (!t.cov) t.cov = n.cov; } } return t.prev; }
  if (t.prev) return t.prev;
  const r = await Catalog.resolve(t.t, t.a); if (r) { t.prev = r.prev; t.prevAt = Date.now(); if (r.dz && !t.dz) t.dz = r.dz; if (!t.cov) t.cov = r.cov; } return r && r.prev;
}
function togglePlay(t, q, ctx) { if (P.k === t.id && !P.loading) { if (A.paused) A.play().catch(playErr); else A.pause(); return; } P.q = (Q[q] || [t.id]).slice(); P.i = Math.max(0, P.q.indexOf(t.id)); if (P.q[P.i] !== t.id) { P.q = [t.id]; P.i = 0; } P.ctx = ctx || null; P.qk = q || null; P.scope = scopeOf(S.route); start(); }
/* playing, or about to: a recommendation card that changes while its sample plays hands the sample to the new card */
const playing = () => !!P.k && (P.loading || !A.paused);
function start() {
  const t = getTrack(P.q[P.i]); if (!t) return; if (P.retried && P.retried !== t.id) P.retried = null; P.k = t.id; const seq = ++P.seq; showPlayer(); markRows(); media(t); P.loading = true; A.loop = !S.meta.autoNext; /* a sample repeats until you move on, unless "play the next one" is on */
  try { A.src = SILENT; A.play().catch(() => {}); } catch {}
  sampleUrl(t).then(u => { if (seq !== P.seq) return; P.loading = false; if (!u) { A.pause(); toast("No sample found for this one. Try Spotify ↗"); markRows(); updatePlayBtns(); if (S.meta.autoNext) setTimeout(() => { if (seq === P.seq) next(); }, 1200); return; } A.src = u; A.play().catch(playErr); })
    .catch(() => { if (seq !== P.seq) return; P.loading = false; A.pause(); toast("Couldn't reach the sample. Check your connection."); markRows(); updatePlayBtns(); });
}
function playErr(e) { if (e && e.name === "NotAllowedError") toast("Tap play to start the sample."); }
/* next/previous from the player while reviewing recommendation cards turns the card too, so the card and the sample match */
function cardFollows() { const pid = P.qk && P.qk.startsWith("rec:") ? P.qk.slice(4) : null; if (!pid || !(pid in S.ui.card)) return;
  S.ui.card[pid] = P.k; const r = S.route; if (r.v === "pl" && r.id === pid && r.tab === "recs" && (S.ui.view[pid] || {}).recView !== "list") render(); }
function next() { if (P.i < P.q.length - 1) { P.i++; start(); cardFollows(); } else { A.pause(); toast("End of this list."); } }
function prev() { if (A.currentTime > 3 || P.i <= 0) { A.currentTime = 0; return; } P.i--; start(); cardFollows(); }
A.addEventListener("ended", () => { if (P.loading) return; if (S.meta.autoNext) next(); else { A.currentTime = 0; A.play().catch(() => markRows()); } });
A.addEventListener("error", () => { if (P.loading || !A.src || A.src.startsWith("data:")) return; const t = getTrack(P.k); if (t && t.dz && P.retried !== t.id) { P.retried = t.id; t.prevAt = 0; start(); return; } toast("This sample couldn't load."); markRows(); updatePlayBtns(); });
A.addEventListener("play", () => { markRows(); updatePlayBtns(); }); A.addEventListener("pause", () => { markRows(); updatePlayBtns(); });
let seeking = false;
A.addEventListener("timeupdate", () => { if (P.loading) return; const d = A.duration || 30, c = A.currentTime || 0; $("#pfill").style.width = Math.min(100, (c / d) * 100) + "%"; if (!$("#npw").hidden && !seeking) { const sk = $("#seek"); sk.max = d; sk.value = c; $("#tcur").textContent = fmt(c); $("#tdur").textContent = fmt(d); } });
function markRows() { $$(".row.cur,.rcard.cur").forEach(r => r.classList.remove("cur", "playing")); if (!P.k) return; $$(`[data-k="${CSS.escape(P.k)}"]`).forEach(r => { r.classList.add("cur"); r.classList.toggle("playing", !A.paused && !P.loading); }); }
function showPlayer() { const t = getTrack(P.k); if (!t) return; $("#player").hidden = false; $("#pcov").replaceChildren(h("div", { class: "cov" }, coverEl(t))); $("#pt").textContent = t.t; $("#pm").textContent = artistsOf(t.a); updatePlayBtns(); if (!$("#npw").hidden) renderNp(); }
function updatePlayBtns() { const paused = A.paused || P.loading; for (const id of ["#pplay", "#nplay"]) { const b = $(id); b.innerHTML = I(paused ? "play" : "pause"); b.setAttribute("aria-label", paused ? "Play" : "Pause"); } }
function media(t) { if (!("mediaSession" in navigator)) return; try { navigator.mediaSession.metadata = new MediaMetadata({ title: t.t, artist: artistsOf(t.a), album: t.al || "MIXER", artwork: https(t.cov) && !/^data:/.test(t.cov) ? [{ src: t.cov, sizes: "250x250" }] : [] });
  navigator.mediaSession.setActionHandler("play", () => A.play().catch(playErr)); navigator.mediaSession.setActionHandler("pause", () => A.pause()); navigator.mediaSession.setActionHandler("nexttrack", next); navigator.mediaSession.setActionHandler("previoustrack", prev); } catch {} }
let npLast = null;
function openNp() { npLast = document.activeElement; renderNp(); $("#npw").hidden = false; $("#npw .x").focus(); }
function closeNp() { $("#npw").hidden = true; if (npLast && npLast.focus) npLast.focus(); }
function renderNp() {
  const t = getTrack(P.k); if (!t) return; $("#npcov").replaceChildren(coverEl(t)); $("#npt").textContent = t.t; $("#npm").textContent = meta(t);
  const c = P.ctx && S.pls.get(P.ctx); const r = c && c.rels[t.id];
  $("#npwhy").textContent = (r && whyText(r.why)) || ""; $("#npctx").textContent = c ? `${c.name} · ${r ? { APPROVED: "On the playlist", PENDING: "Recommendation", REJECTED: "Rejected" }[r.state] : "Not in this playlist"}` : "";
  const acts = $("#npacts"); acts.replaceChildren();
  if (c && r && r.state === "PENDING") acts.append(btn("Reject", "ghost sm", () => { closeNp(); rejectFlow(c.id, [t.id]); }), btn("Approve", "ok sm", () => approveFlow(c.id, [t.id]), { ic: "check" }));
  acts.append(h("a", { class: "lnk", href: spLink(t), target: "_blank", rel: "noopener noreferrer", text: "Open in Spotify ↗", style: "align-self:center" }));
  updatePlayBtns(); const d = A.duration || 30; $("#seek").max = d; $("#seek").value = A.currentTime || 0; $("#tcur").textContent = fmt(A.currentTime); $("#tdur").textContent = fmt(d); $("#autonext").checked = !!S.meta.autoNext;
}
function initPlayer() {
  $("#pplay").onclick = () => { if (A.paused) A.play().catch(playErr); else A.pause(); }; $("#pnext").innerHTML = I("next"); $("#pnext").onclick = next;
  $("#popen").onclick = openNp; $("#npw .x").innerHTML = I("x"); $("#npw").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeNp(); });
  $("#nprev").innerHTML = I("prev"); $("#nnext").innerHTML = I("next"); $("#nprev").onclick = prev; $("#nnext").onclick = next; $("#nplay").onclick = () => { if (A.paused) A.play().catch(playErr); else A.pause(); };
  $("#seek").addEventListener("input", e => { seeking = true; $("#tcur").textContent = fmt(+e.target.value); }); $("#seek").addEventListener("change", e => { A.currentTime = +e.target.value; seeking = false; });
  $("#autonext").onchange = e => { S.meta.autoNext = e.target.checked; A.loop = !S.meta.autoNext; saveMeta().catch(() => {}); };
}

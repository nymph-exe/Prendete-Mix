/* MIXER (internally the Préndete app) — core playlist rules.
   Pure logic (no DOM), shared by the app and the tests. Implements the Master Ruleset:
   playlist isolation, three song states, capacity as a ceiling, additive recalibration,
   delegated random fill, rejection = removal, explicit completion, preserve/reset edits. */
(function (G) {
"use strict";

/* ---------- configuration (CAP-002 / DATA-001) ---------- */
const CONFIG = { maxConfirmed: 250, minCapacity: 10, capacityStep: 10 };
function capacityOptions(cfg = CONFIG) { const o = []; for (let c = cfg.minCapacity; c <= cfg.maxConfirmed; c += cfg.capacityStep) o.push(c); return o; }

const S = { P: "PENDING", A: "APPROVED", R: "REJECTED" };
const ORIGIN = {
  MANDATORY: "MANDATORY_INCLUSION", MANUAL: "MANUAL_INDIVIDUAL", BATCH: "MANUAL_BATCH",
  RESTORE: "MANUAL_RESTORATION", FILL: "DELEGATED_RANDOM_FILL", MIGRATED: "MIGRATED_CONFIRMED",
  CONFIRMED: "MANUAL_CONFIRMED"
};
const MANUAL_ORIGINS = new Set([ORIGIN.MANDATORY, ORIGIN.MANUAL, ORIGIN.BATCH, ORIGIN.RESTORE, ORIGIN.MIGRATED, ORIGIN.CONFIRMED]);
const REASONS = [
  ["Energy and rhythm", ["Too mellow", "Too energetic", "Too slow", "Too fast", "Incorrect rhythm", "Insufficient momentum"]],
  ["Musical compatibility", ["Incorrect mood", "Incorrect genre", "Incorrect atmosphere", "Unsuitable vocals", "Unsuitable production", "Doesn't match the playlist's identity"]],
  ["Curation balance", ["Excessive artist repetition", "Too similar to existing songs", "Overplayed", "Excessively niche", "Redundant selection", "Prefer another song"]],
  ["Other", ["Other reason"]]
];

class OpError extends Error { constructor(code, message, info) { super(message); this.code = code; this.info = info || {}; } }
const now = () => Date.now();
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const uniq = a => [...new Set(a)];

/* ---------- track identity (QUAL-019, user policy) ----------
   Same recording = same song (single / album / remaster / deluxe merge).
   Clean and explicit are separate songs and labelled.
   Remix, live, acoustic, sped-up and similar versions are separate songs. */
function norm(s) {
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}
function firstArtist(a) { return String(a || "").split(/;|,|&| x | feat\.? | ft\.? /i)[0].trim(); }
const VTAGS = [
  ["remix", /\bre-?mix(ed)?\b|\brmx\b/], ["live", /\blive\b|\ben vivo\b|\bao vivo\b/], ["acoustic", /\bacoustic\b|\bac[uú]stic[oa]\b|\bunplugged\b/],
  ["sped up", /\bsped[ -]?up\b|\bspeed[ -]?up\b/], ["slowed", /\bslowed\b/], ["instrumental", /\binstrumental\b/], ["karaoke", /\bkaraoke\b/],
  ["a cappella", /\ba ?cap+el+a\b/], ["language version", /\b(japanese|korean|english|chinese|spanish|portuguese|french|german|thai|mandarin|cantonese) ?ver(\.|sion)?(?=[\s\)\]-]|$)/], ["demo", /\bdemo\b/], ["extended", /\bextended\b/], ["cover", /\bcover\b/], ["nightcore", /\bnightcore\b/],
  ["8d", /\b8d\b/], ["edit", /\b(tiktok|clean) edit\b/]
];
function versionTags(t) { const s = String(t || "").toLowerCase(); return VTAGS.filter(([, re]) => re.test(s)).map(([n]) => n).sort(); }
function baseTitle(t) {
  return norm(String(t || "").replace(/\s*[\(\[][^\)\]]*[\)\]]/g, " ").replace(/\s+-\s+.*$/, "").replace(/\s(feat|ft|with)\.?\s.*$/i, ""));
}
function explicitClass(m) { return m && (m.exp === "explicit" || m.exp === "clean") ? m.exp : ""; }
function sameRecording(a, b) {
  if (!a || !b) return false;
  if (a.id && a.id === b.id) return true;
  if (a.isrc && b.isrc && a.isrc === b.isrc) return true;
  const ea = explicitClass(a), eb = explicitClass(b);
  if (ea && eb && ea !== eb) return false;
  if (versionTags(a.t).join() !== versionTags(b.t).join()) return false;
  if (!baseTitle(a.t) || baseTitle(a.t) !== baseTitle(b.t)) return false;
  const aa = String(a.a || "").split(/;\s*/).map(norm).filter(Boolean), bb = String(b.a || "").split(/;\s*/).map(norm).filter(Boolean);
  if (!aa.some(x => bb.includes(x)) && norm(firstArtist(a.a)) !== norm(firstArtist(b.a))) return false;
  if (a.dur && b.dur && Math.abs(a.dur - b.dur) > 6) return false;
  return true;
}
function isrcYear(c) {
  const m = /^[A-Z]{2}[A-Z0-9]{3}(\d{2})[A-Z0-9]{5}$/.exec(String(c || "").toUpperCase().replace(/-/g, ""));
  if (!m) return null; const yy = +m[1], cur = new Date().getFullYear() % 100; return yy <= cur + 1 ? 2000 + yy : 1900 + yy;
}

/* ---------- playlist model (DATA-003..009) ---------- */
function createPlaylist({ name, method, direction, capacity, engine, artwork }) {
  if (!capacityOptions().includes(capacity)) throw new OpError("CAPACITY_VALUE", `Capacity must be one of ${CONFIG.minCapacity}–${CONFIG.maxConfirmed} in steps of ${CONFIG.capacityStep}.`);
  const nm = String(name || "").trim().slice(0, 100);
  if (!nm) throw new OpError("NAME", "Give the playlist a name.");
  const t = now();
  return { id: uid("p"), name: nm, artwork: artwork || null, method: method || "ARTISTS_AND_SONGS", direction: direction || {},
    capacity, engine: engine || { mode: "classic" }, status: "IN_PROGRESS", completedAt: null, createdAt: t, updatedAt: t,
    epoch: 1, rels: {}, order: [], history: [], batches: [] };
}
function counts(pl) {
  let approved = 0, pending = 0, rejected = 0;
  for (const k in pl.rels) { const s = pl.rels[k].state; if (s === S.A) approved++; else if (s === S.P) pending++; else if (s === S.R) rejected++; }
  return { approved, pending, rejected, available: pl.capacity - approved };
}
const stateOf = (pl, id) => (pl.rels[id] ? pl.rels[id].state : null);
const idsIn = (pl, st) => Object.keys(pl.rels).filter(k => pl.rels[k].state === st);
function log(pl, type, detail) { pl.history.push(Object.assign({ at: now(), type }, detail || {})); pl.updatedAt = now(); }

function findDuplicate(pl, track, getTrack) {
  if (pl.rels[track.id]) return track.id;
  for (const k in pl.rels) { const t = getTrack(k); if (t && sameRecording(t, track)) return k; }
  return null;
}

/* ---------- operations (Section 22 contract) ---------- */
function addMandatory(pl, ids, getTrack) {
  ids = uniq(ids);
  const fresh = ids.filter(id => stateOf(pl, id) !== S.A);
  const c = counts(pl);
  if (fresh.length > c.available) throw new OpError("CAPACITY", `Only ${c.available} open spot${c.available === 1 ? "" : "s"}, but ${fresh.length} must-include song${fresh.length === 1 ? "" : "s"} selected.`, { needed: fresh.length, available: c.available });
  for (const id of ids) {
    if (getTrack) { const t = getTrack(id); const dup = t && findDuplicate(pl, t, getTrack); if (dup && dup !== id && stateOf(pl, dup) === S.A) { pl.rels[dup].mandatory = true; continue; } }
    const r = pl.rels[id] || {};
    if (r.state === S.A) { r.mandatory = true; continue; }
    pl.rels[id] = { state: S.A, mandatory: true, origin: ORIGIN.MANDATORY, recAt: r.recAt || now(), changedAt: now() };
    pl.order.push(id);
  }
  log(pl, "mandatory", { ids });
}
function approve(pl, ids, origin = ORIGIN.MANUAL) {
  ids = uniq(ids);
  const pend = ids.filter(id => stateOf(pl, id) === S.P);
  const blocked = ids.filter(id => stateOf(pl, id) === S.R);
  if (blocked.length) throw new OpError("REJECTED", "Rejected songs have to be restored before they can be approved.", { ids: blocked });
  const c = counts(pl);
  if (pend.length > c.available) throw new OpError("CAPACITY", `Only ${c.available} open spot${c.available === 1 ? "" : "s"} for ${pend.length} selected song${pend.length === 1 ? "" : "s"}.`, { needed: pend.length, available: c.available });
  for (const id of pend) { const r = pl.rels[id]; r.state = S.A; r.origin = origin; r.changedAt = now(); delete r.reason; delete r.text; pl.order.push(id); }
  if (pend.length) log(pl, "approve", { ids: pend, origin });
  return pend;
}
function reject(pl, ids, fb = {}) {
  ids = uniq(ids).filter(id => stateOf(pl, id) === S.P || stateOf(pl, id) === S.A);
  for (const id of ids) {
    const r = pl.rels[id]; const was = r.state;
    if (was === S.A) pl.order = pl.order.filter(x => x !== id);
    r.state = S.R; r.from = was; r.mandatory = false; delete r.origin; r.changedAt = now();
    if (fb.reason) r.reason = fb.reason; else delete r.reason;
    if (fb.text) r.text = String(fb.text).slice(0, 1000); else delete r.text;
  }
  if (ids.length) log(pl, "reject", { ids, reason: fb.reason || null, text: fb.text || null });
  return ids;
}
function restore(pl, id, dest) {
  const r = pl.rels[id];
  if (!r || r.state !== S.R) throw new OpError("STATE", "Only rejected songs can be restored.");
  if (dest === S.A) {
    const c = counts(pl);
    if (c.available < 1) throw new OpError("CAPACITY", "The playlist is full. Raise its capacity or remove a song first.", { needed: 1, available: 0 });
    r.state = S.A; r.origin = ORIGIN.RESTORE; pl.order.push(id);
  } else { r.state = S.P; r.restoredAt = now(); }
  delete r.reason; delete r.text; delete r.from; r.changedAt = now();
  log(pl, "restore", { ids: [id], dest });
}
function confirmKeep(pl, id) { const r = pl.rels[id]; if (r && r.state === S.A && r.origin === ORIGIN.FILL) { r.origin = ORIGIN.CONFIRMED; r.changedAt = now(); log(pl, "confirm", { ids: [id] }); } }

/* Recalibration / initial generation: append unique, eligible candidates only (REC-005..011) */
function appendCandidates(pl, tracks, { batchId, source }, getTrack) {
  const added = []; let dupes = 0, rejectedSkip = 0;
  for (const t of tracks) {
    const dup = findDuplicate(pl, t, getTrack);
    if (dup) { if (stateOf(pl, dup) === S.R) rejectedSkip++; else dupes++; continue; }
    if (added.some(x => sameRecording(getTrack(x) || { id: x }, t))) { dupes++; continue; }
    pl.rels[t.id] = { state: S.P, batch: batchId, source: source || "recalibrate", recAt: now(), changedAt: now() };
    added.push(t.id);
  }
  if (batchId) { const b = pl.batches.find(x => x.id === batchId); if (b) b.count += added.length; else pl.batches.push({ id: batchId, at: now(), source: source || "recalibrate", count: added.length }); }
  log(pl, "candidates", { batchId, added: added.length, dupes, rejectedSkip });
  return { added, dupes, rejectedSkip };
}
/* Random fill commit: delegated approval, capped at open spots at commit time (FILL-011..023, OPS-009..011) */
function fillCommit(pl, picks, getTrack) {
  let room = counts(pl).available; const approved = [];
  for (const p of picks) {
    if (room <= 0) break;
    const st = stateOf(pl, p.id);
    if (st === S.P) { const r = pl.rels[p.id]; r.state = S.A; r.origin = ORIGIN.FILL; r.changedAt = now(); pl.order.push(p.id); approved.push(p.id); room--; continue; }
    if (st) continue;
    const t = getTrack(p.id); if (t && findDuplicate(pl, t, getTrack)) continue;
    pl.rels[p.id] = { state: S.A, origin: ORIGIN.FILL, source: "fill", recAt: now(), changedAt: now() };
    pl.order.push(p.id); approved.push(p.id); room--;
  }
  log(pl, "fill", { ids: approved, remaining: counts(pl).available });
  return approved;
}
function setCapacity(pl, cap, removeIds = [], fb = {}) {
  if (!capacityOptions().includes(cap)) throw new OpError("CAPACITY_VALUE", "Pick a capacity from the list.");
  const c = counts(pl);
  if (cap < c.approved) {
    const excess = c.approved - cap;
    const valid = uniq(removeIds).filter(id => stateOf(pl, id) === S.A);
    if (valid.length < excess) throw new OpError("EXCESS", `Remove at least ${excess} song${excess === 1 ? "" : "s"} to lower the capacity to ${cap}.`, { excess });
    reject(pl, valid, fb);
  }
  const old = pl.capacity; pl.capacity = cap; delete pl.legacyOver;
  log(pl, "capacity", { from: old, to: cap });
}
function setStatus(pl, status) {
  if (status !== "COMPLETED" && status !== "IN_PROGRESS") throw new OpError("STATUS", "Unknown status.");
  pl.status = status; pl.completedAt = status === "COMPLETED" ? now() : null; log(pl, "status", { status });
}
function reorder(pl, id, toIndex) {
  const i = pl.order.indexOf(id); if (i < 0) throw new OpError("STATE", "Only songs on the playlist can be moved.");
  pl.order.splice(i, 1); pl.order.splice(Math.max(0, Math.min(toIndex, pl.order.length)), 0, id); pl.updatedAt = now();
}
function editDirection(pl, direction, { reset = false } = {}) {
  pl.direction = direction;
  if (reset) {
    const keep = {}; const keepOrder = [];
    for (const id of pl.order) { const r = pl.rels[id]; if (r && r.mandatory) { keep[id] = { state: S.A, mandatory: true, origin: ORIGIN.MANDATORY, recAt: r.recAt, changedAt: now() }; keepOrder.push(id); } }
    const before = counts(pl);
    pl.rels = keep; pl.order = keepOrder; pl.status = "IN_PROGRESS"; pl.completedAt = null; pl.epoch++; pl.resetAt = now(); pl.batches = [];
    log(pl, "reset", { before });
  } else log(pl, "direction", {});
}

/* ---------- invariants (Section 23) ---------- */
function validate(pl) {
  const approved = idsIn(pl, S.A);
  const ord = pl.order;
  if (new Set(ord).size !== ord.length) throw new OpError("INVARIANT", "Duplicate position in the playlist order.");
  if (ord.length !== approved.length || ord.some(id => stateOf(pl, id) !== S.A)) throw new OpError("INVARIANT", "Playlist order doesn't match approved songs.");
  if (!pl.legacyOver && approved.length > pl.capacity) throw new OpError("INVARIANT", "More approved songs than the capacity allows.");
  for (const k in pl.rels) { const r = pl.rels[k]; if (![S.A, S.P, S.R].includes(r.state)) throw new OpError("INVARIANT", "Unknown song state."); if (r.mandatory && r.state !== S.A) throw new OpError("INVARIANT", "A must-include song isn't approved."); }
  if (pl.status !== "COMPLETED" && pl.status !== "IN_PROGRESS") throw new OpError("INVARIANT", "Unknown playlist status.");
  return true;
}

/* ---------- shape check for data from outside this session (a backup file, a damaged saved record) ----------
   Repairs what can be repaired without guessing (empty history, missing direction) and refuses the rest
   with a plain reason. Then the usual invariants. */
const isObj = x => !!x && typeof x === "object" && !Array.isArray(x);
const strs = x => (Array.isArray(x) ? x.filter(v => typeof v === "string" && v) : []);
function checkShape(pl) {
  const bad = m => { throw new OpError("SHAPE", m); };
  if (!isObj(pl)) bad("a playlist entry is empty");
  if (typeof pl.id !== "string" || !pl.id) bad("a playlist has no ID");
  if (typeof pl.name !== "string" || !pl.name.trim()) bad(`playlist ${pl.id} has no name`);
  const nm = `“${pl.name.slice(0, 40)}”`;
  if (!isObj(pl.rels)) bad(`${nm} is missing its songs`);
  for (const k in pl.rels) if (!isObj(pl.rels[k])) bad(`${nm} has a damaged song entry`);
  if (!Array.isArray(pl.order) || pl.order.some(x => typeof x !== "string")) bad(`${nm} has a damaged song order`);
  if (!Number.isFinite(pl.capacity) || pl.capacity < 1) bad(`${nm} has no capacity`);
  if (!Array.isArray(pl.history)) pl.history = []; else pl.history = pl.history.filter(isObj);
  if (!Array.isArray(pl.batches)) pl.batches = []; else pl.batches = pl.batches.filter(isObj);
  if (!isObj(pl.engine) || (pl.engine.mode !== "ai" && pl.engine.mode !== "classic")) pl.engine = { mode: "classic" };
  if (!Number.isFinite(pl.epoch)) pl.epoch = 1;
  if (pl.artwork != null && !(typeof pl.artwork === "string" && /^(data:image\/(png|jpe?g|webp|gif);|https:\/\/)/.test(pl.artwork))) pl.artwork = null;
  const d = isObj(pl.direction) ? pl.direction : (pl.direction = {});
  if (typeof d.text !== "string") d.text = ""; d.refs = strs(d.refs);
  d.artists = Array.isArray(d.artists) ? d.artists.filter(a => isObj(a) && typeof a.name === "string") : [];
  d.exclude = isObj(d.exclude) ? d.exclude : {}; d.exclude.songs = strs(d.exclude.songs);
  d.exclude.artists = Array.isArray(d.exclude.artists) ? d.exclude.artists.filter(e => (typeof e === "string" && e.trim()) || (isObj(e) && typeof e.name === "string")) : [];
  if (!isObj(d.form)) d.form = {};
  for (const k of ["genres", "moods", "keywords", "notStyles", "langs", "notLangs"]) if (d.form[k] != null && !Array.isArray(d.form[k])) delete d.form[k];
  if (!Number.isFinite(pl.createdAt)) pl.createdAt = Date.now(); if (!Number.isFinite(pl.updatedAt)) pl.updatedAt = pl.createdAt;
  validate(pl); return pl;
}
/* a saved song must at least have an ID and a title */
function checkTrack(t) { if (!isObj(t) || typeof t.id !== "string" || !t.id || typeof t.t !== "string") return null; if (typeof t.a !== "string") t.a = String(t.a == null ? "" : t.a); if (!Array.isArray(t.aid)) t.aid = []; return t; }

/* ---------- evidence for engines (Section 16.3) ---------- */
function evidence(pl, getTrack) {
  const e = { manual: [], delegated: [], rejected: [], pending: [], mandatory: [] };
  for (const id of pl.order) { const r = pl.rels[id], t = getTrack(id); if (!t) continue; (MANUAL_ORIGINS.has(r.origin) ? e.manual : e.delegated).push(t); if (r.mandatory) e.mandatory.push(t); }
  for (const k in pl.rels) { const r = pl.rels[k], t = getTrack(k); if (!t) continue; if (r.state === S.R) e.rejected.push({ t, reason: r.reason || null, text: r.text || null, from: r.from || null }); else if (r.state === S.P) e.pending.push(t); }
  return e;
}

const API = { checkShape, checkTrack, CONFIG, capacityOptions, S, ORIGIN, MANUAL_ORIGINS, REASONS, OpError, uid, norm, firstArtist, versionTags, baseTitle, explicitClass, sameRecording, isrcYear,
  createPlaylist, counts, stateOf, idsIn, findDuplicate, addMandatory, approve, reject, restore, confirmKeep, appendCandidates, fillCommit, setCapacity, setStatus, reorder, editDirection, validate, evidence, log };
G.Core = API;
if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

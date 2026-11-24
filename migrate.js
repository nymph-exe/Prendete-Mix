/* MIXER (internally the Préndete app) — migration from the single-playlist app (Section 19). Pure: takes the seed file and the old
   app's saved data (if this browser has it) and returns playlists + tracks. Nothing is approved that wasn't,
   nothing pending is approved, nothing is truncated, and records with no clear home are kept aside. */
(function (G) {
"use strict";
const Core = G.Core || require("./core.js");
const expOf = ex => (ex === 1 || ex === 4 ? "explicit" : ex === 3 ? "clean" : "");
function seedTrack(m) {
  const y = +m.y || null, iy = Core.isrcYear(m.isrc);
  return { id: m.id, dz: m.dz || (/^dz:/.test(m.id) ? +m.id.slice(3) : undefined), t: m.t, a: m.a, aid: m.aid || [], al: m.al || "", y: y && iy ? Math.min(y, iy) : y || iy,
    isrc: m.isrc || null, ex: m.ex, exp: expOf(m.ex), dur: m.dur || 0, rank: m.rank || 0, cov: m.cov || null, full: !!m.isrc };
}
function legacyTrack(s) {
  const t = { id: s.k, t: s.t, a: s.a, aid: s.aid || [], al: s.al || "", y: +s.y || null, isrc: s.isrc || null, exp: "", dur: s.dur || 0, rank: s.rank || 0, cov: s.cov || null, prev: s.prev || null, prevAt: s.prevAt || 0, link: s.link || null };
  if (s.dz) t.dz = +s.dz; if (s.it) t.it = s.it; if (s.mb) t.mb = s.mb; return t;
}
const PRENDETE_TEXT = "Upbeat party songs I'd enjoy any time, in any language. Mellow is fine if it still works as a party song. No overplayed hits, TikTok/snippet songs, joke songs or throwback anthems. 2017–2026 is a rough guide for release years.";
function prendeteDirection(refs) {
  return { text: PRENDETE_TEXT, refs: refs.slice(), artists: [], exclude: { artists: ["DaBaby"], songs: [] },
    form: { genres: [], keywords: [], moods: ["Party"], energy: "", tempo: "", bpm: null, era: [2017, 2026], langs: [], notLangs: [], explicit: "any", versions: false, avoidHits: true, preferHits: false } };
}
const capFor = n => Core.capacityOptions().find(c => c >= n) || Core.CONFIG.maxConfirmed;

/* the old app's saved data may be partly damaged: keep the parts that have the expected shape, and treat it
   as absent when no usable song is left (so Préndete still comes from the seed instead of an empty list) */
const obj = x => !!x && typeof x === "object" && !Array.isArray(x);
function cleanLegacy(l) {
  if (!obj(l) || !obj(l.songs)) return null;
  const songs = {};
  for (const [k0, s] of Object.entries(l.songs)) { if (!obj(s)) continue; const k = typeof s.k === "string" && s.k ? s.k : k0; if (typeof s.t !== "string" || !s.t.trim()) continue;
    songs[k] = Object.assign({}, s, { k, a: typeof s.a === "string" ? s.a : String(s.a == null ? "" : s.a), o: Number.isFinite(+s.o) && s.o !== null && s.o !== "" ? +s.o : null, aid: Array.isArray(s.aid) ? s.aid : [] }); }
  if (!Object.keys(songs).length) return null;
  const lists = (Array.isArray(l.lists) ? l.lists : []).filter(obj).map(x => ({ name: typeof x.name === "string" && x.name.trim() ? x.name.slice(0, 100) : "Playlist", created: Number.isFinite(x.created) ? x.created : null, songs: Array.isArray(x.songs) ? x.songs.filter(id => typeof id === "string") : [] }));
  return { songs, lists, ov: obj(l.ov) ? l.ov : {}, ts: obj(l.ts) ? l.ts : {}, reconf: { picks: obj(l.reconf) && Array.isArray(l.reconf.picks) ? l.reconf.picks : [] }, prefs: obj(l.prefs) ? l.prefs : null };
}
function build(seed, legacy, now = Date.now()) {
  legacy = cleanLegacy(legacy);
  const tracks = new Map(); const get = id => tracks.get(id);
  const put = t => { if (!t || !t.id) return null; const old = tracks.get(t.id); tracks.set(t.id, old ? Object.assign({}, t, old, { prev: t.prev || old.prev }) : t); return t.id; };
  seed.approved.forEach(m => put(seedTrack(m))); seed.rejected.forEach(m => put(seedTrack(m)));
  const report = { source: legacy ? "browser" : "seed", approved: 0, pending: 0, rejected: 0, merged: 0, lists: 0, unsorted: 0, listOver: [] };
  let approved = [], pending = [], rejected = [], unsorted = [], lists = [];
  if (legacy && legacy.songs && Object.keys(legacy.songs).length) {
    const songs = legacy.songs, ov = legacy.ov || {}, ts = legacy.ts || {};
    const rating = k => (ov[k] === 1 || ov[k] === -1 ? ov[k] : 0);
    Object.values(songs).forEach(s => put(legacyTrack(s)));
    const inList = new Set((legacy.lists || []).flatMap(l => l.songs || []));
    const picks = new Set((legacy.reconf && legacy.reconf.picks) || []);
    const all = Object.values(songs);
    const liked = all.filter(s => rating(s.k) === 1);
    approved = liked.filter(s => s.o != null).sort((a, b) => a.o - b.o).concat(liked.filter(s => s.o == null).sort((a, b) => (ts[a.k] || 0) - (ts[b.k] || 0))).map(s => s.k);
    rejected = all.filter(s => rating(s.k) === -1).map(s => s.k).concat(seed.rejected.map(m => m.id));
    for (const s of all) if (rating(s.k) === 0) { if (s.via || picks.has(s.k) || s.o != null) pending.push(s.k); else if (!inList.has(s.k)) unsorted.push(s.k); }
    lists = legacy.lists || [];
  } else { approved = seed.approved.map(m => m.id); rejected = seed.rejected.map(m => m.id); }

  const pl = Core.createPlaylist({ name: "Préndete 🔥", method: "ARTISTS_AND_SONGS", direction: prendeteDirection(seed.refs || []), capacity: 250, engine: { mode: "classic" } });
  pl.createdAt = now; pl.migrated = { at: now, from: report.source };
  const placed = [];
  const clash = id => { const t = get(id); return placed.find(p => p === id || (t && get(p) && Core.sameRecording(get(p), t))); };
  for (const id of [...new Set(approved)]) { if (!get(id)) continue; if (clash(id)) { report.merged++; continue; } pl.rels[id] = { state: "APPROVED", origin: Core.ORIGIN.MIGRATED, recAt: 0, changedAt: now }; pl.order.push(id); placed.push(id); }
  if (pl.order.length > pl.capacity) pl.legacyOver = true;
  for (const id of [...new Set(rejected)]) { if (!get(id)) continue; if (clash(id)) { report.merged++; continue; } pl.rels[id] = { state: "REJECTED", migrated: true, recAt: 0, changedAt: now }; placed.push(id); }
  for (const id of [...new Set(pending)]) { if (!get(id)) continue; if (clash(id)) { report.merged++; continue; } pl.rels[id] = { state: "PENDING", source: "migrated", recAt: now, changedAt: now }; placed.push(id); }
  pl.status = "COMPLETED"; pl.completedAt = now;
  pl.history.push({ at: now, type: "migrated", from: report.source });
  const c = Core.counts(pl); report.approved = c.approved; report.pending = c.pending; report.rejected = c.rejected;
  const playlists = [pl];
  for (const l of lists) {
    const ids = [...new Set(l.songs || [])].filter(get); const p = Core.createPlaylist({ name: l.name || "Playlist", method: "ARTISTS_AND_SONGS", direction: { text: "", refs: [], artists: [], exclude: { artists: [], songs: [] }, form: {} }, capacity: capFor(ids.length), engine: { mode: "classic" } });
    p.createdAt = l.created || now; p.migrated = { at: now, from: "list" };
    const seen = [];
    for (const id of ids) { const t = get(id); if (seen.some(x => x === id || Core.sameRecording(get(x), t))) continue; p.rels[id] = { state: "APPROVED", origin: Core.ORIGIN.MIGRATED, recAt: 0, changedAt: now }; p.order.push(id); seen.push(id); }
    if (p.order.length > p.capacity) { p.legacyOver = true; report.listOver.push(p.name); }
    p.history.push({ at: now, type: "migrated", from: "list" });
    playlists.push(p); report.lists++;
  }
  report.unsorted = unsorted.length;
  playlists.forEach(Core.validate);
  const used = new Set(playlists.flatMap(p => Object.keys(p.rels)).concat(unsorted));
  return { playlists, tracks: [...tracks.values()].filter(t => used.has(t.id)), unsorted, never: ["DaBaby"], prefs: legacy && legacy.prefs ? { country: typeof legacy.prefs.itc === "string" && /^[a-z]{2}$/.test(legacy.prefs.itc) ? legacy.prefs.itc : "us", autoNext: legacy.prefs.auto !== false } : {}, report };
}
const API = { build, seedTrack, legacyTrack, prendeteDirection, PRENDETE_TEXT, capFor };
G.Migrate = API;
if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

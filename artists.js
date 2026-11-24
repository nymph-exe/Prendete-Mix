/* MIXER (internally the Préndete app) — who exactly "Never suggest" means.
   A ban names one real artist, not a piece of text:
     { name, about, dz: [Deezer artist IDs], it: [Apple Music artist IDs], mb: MusicBrainz ID }
   The same artist is linked across services by the IDs the services publish about each other
   (Wikidata and MusicBrainz list an artist's Deezer and Apple Music pages). Extra Deezer profiles
   with the same name are only joined when MusicBrainz confirms, through a song's recording code
   (ISRC), that it's the same person; Apple Music profiles only when their songs are that artist's
   songs on Deezer. Anything unconfirmed stays a different artist and isn't blocked.
   Matching a song: IDs from the same service decide. The exact full name is used only where there
   is no ID to compare: a "feat." in a title, a song from a service that gave no artist ID, or an old
   name-only entry. Partial names never match ("car" doesn't block Carla Morrison). */
(function (G) {
"use strict";
const Core = G.Core || require("./core.js");
const Cat = G.Catalog || require("./catalog.js");
const { Deezer, ITunes, MusicBrainz, Wikidata } = Cat;
const nn = s => Core.norm(s).replace(/\s+/g, "");
const uniq = a => [...new Set(a.filter(x => x != null && x !== "" && x !== 0))];

/* ---------- entries ---------- */
function entry(e) {
  if (!e) return null;
  if (typeof e === "string") { const name = e.trim(); return name ? { name, about: "", dz: [], it: [], mb: null, plain: true } : null; }
  const name = String(e.name || "").trim(); if (!name) return null;
  const dz = uniq((e.dz || []).map(Number).filter(Number.isFinite)), it = uniq((e.it || []).map(Number).filter(Number.isFinite));
  const mb = /^[0-9a-f-]{36}$/.test(e.mb || "") ? e.mb : null;
  const pic = typeof e.pic === "string" && /^https:\/\//.test(e.pic) ? e.pic : null;
  return { name, about: e.about ? String(e.about).slice(0, 140) : "", dz, it, mb, pic, plain: !dz.length && !it.length && !mb };
}
/* what gets saved: plain names stay plain strings (old lists keep working) */
function store(e) { const o = entry(e); if (!o) return null; if (o.plain) return o.name; const out = { name: o.name, dz: o.dz, it: o.it }; if (o.mb) out.mb = o.mb; if (o.about) out.about = o.about; if (o.pic) out.pic = o.pic; return out; }
const nameOf = e => (typeof e === "string" ? e : (e && e.name) || "");
const isLinked = e => { const o = entry(e); return !!o && !o.plain; };
/* the same ban? Linked entries compare by IDs; a plain name equals anything with that exact name */
function same(a, b) {
  const x = entry(a), y = entry(b); if (!x || !y) return false;
  if (x.mb && y.mb) return x.mb === y.mb;
  if (x.dz.some(i => y.dz.includes(i)) || x.it.some(i => y.it.includes(i))) return true;
  return (x.plain || y.plain) && nn(x.name) === nn(y.name);
}
function add(list, e) { const o = store(e); if (!o) return false; const i = list.findIndex(x => same(x, o)); if (i >= 0) { if (!isLinked(list[i]) && isLinked(o)) { list[i] = o; return true; } return false; } list.push(o); return true; }

/* ---------- matching songs ---------- */
function banSet(list) {
  const ids = new Set(), names = new Map();
  for (const e of list || []) {
    const o = entry(e); if (!o) continue; const k = nn(o.name); if (!k) continue;
    o.dz.forEach(i => ids.add("dz:" + i)); o.it.forEach(i => ids.add("it:" + i)); if (o.mb) ids.add("mb:" + o.mb);
    const c = names.get(k) || { dz: false, it: false, mb: false, plain: false };
    c.plain = c.plain || o.plain; c.dz = c.dz || o.dz.length > 0; c.it = c.it || o.it.length > 0; c.mb = c.mb || !!o.mb; names.set(k, c);
  }
  return { ids, names, n: names.size };
}
const FEAT = /[\(\[]\s*(?:feat\.?|ft\.?|featuring|with|con|part\.?)\s+([^\)\]]+)[\)\]]|\s[-–]?\s*(?:feat\.?|ft\.?|featuring)\s+(.+)$/i;
function featNames(title) {
  const m = String(title || "").match(FEAT); if (!m) return [];
  const all = String(m[1] || m[2]).trim();
  return uniq([all, ...all.split(/\s*(?:,|&|\+|\band\b|\by\b|\be\b|\bx\b)\s*/i)].map(s => s.trim()));
}
function banned(t, B) {
  if (!t || !B || !B.n) return false;
  const names = String(t.a || "").split(/;\s*/).map(s => s.trim()).filter(Boolean), aid = t.aid || [], mbA = t.mbA || [];
  if (aid.some(i => B.ids.has("dz:" + i)) || (t.itA && B.ids.has("it:" + t.itA)) || mbA.some(i => i && B.ids.has("mb:" + i))) return true;
  const dzAligned = aid.length > 0 && aid.length === names.length, mbAligned = mbA.length === names.length;
  const credited = new Set();
  const byName = (k, idFrom) => { const b = B.names.get(k); if (!b) return false; if (b.plain) return true; return !(idFrom && b[idFrom]); };
  for (let i = 0; i < names.length; i++) {
    const k = nn(names[i]); credited.add(k);
    const idFrom = dzAligned && aid[i] ? "dz" : mbAligned && mbA[i] ? "mb" : t.itA && i === 0 ? "it" : null;
    if (byName(k, idFrom)) return true;
    /* a credit like "A & B" is one profile: its parts have no IDs of their own, so they match by exact name */
    if (/\s(&|x|and|y|e)\s|,/i.test(names[i])) for (const p of names[i].split(/\s*(?:,|&|\band\b|\by\b|\be\b|\bx\b)\s*/i)) { const pk = nn(p); if (pk && pk !== k) { credited.add(pk); if (byName(pk, null)) return true; } }
  }
  for (const f of featNames(t.t)) { const k = nn(f); if (k && !credited.has(k) && byName(k, null)) return true; }
  return false;
}

/* ---------- looking artists up ---------- */
const fmtFans = n => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n || 0));
const luc = s => String(s).replace(/([+\-&|!(){}\[\]^"~*?:\\\/])/g, "\\$1");
async function mbArtists(q) {
  const d = await MusicBrainz.get(`artist/?query=${encodeURIComponent(luc(q))}&limit=8`);
  return ((d && d.artists) || []).filter(a => (a.score || 0) >= 60).map(a => ({ mb: a.id, name: a.name, score: a.score || 0, dis: a.disambiguation || "",
    country: a.country || (a.area && a.area.name) || "", begin: String((a["life-span"] || {}).begin || "").slice(0, 4), type: a.type || "" }));
}
async function wdLinks(mbids) {
  const out = new Map(); const list = uniq(mbids.filter(x => /^[0-9a-f-]{36}$/.test(x || ""))); if (!list.length) return out;
  const rows = await Wikidata.query(`SELECT ?mb ?dz ?am ?d WHERE { VALUES ?mb { ${list.map(x => `"${x}"`).join(" ")} } ?a wdt:P434 ?mb. OPTIONAL{?a wdt:P2722 ?dz} OPTIONAL{?a wdt:P2850 ?am} OPTIONAL{?a schema:description ?d FILTER(lang(?d)="en")} }`);
  for (const b of rows) { const k = b.mb.value, o = out.get(k) || { dz: [], it: [], about: "" };
    if (b.dz && /^\d+$/.test(b.dz.value)) o.dz.push(+b.dz.value); if (b.am && /^\d+$/.test(b.am.value)) o.it.push(+b.am.value); if (b.d && !o.about) o.about = b.d.value; out.set(k, o); }
  for (const o of out.values()) { o.dz = uniq(o.dz); o.it = uniq(o.it); }
  return out;
}
async function mbUrls(mbid) {
  const d = await MusicBrainz.get(`artist/${mbid}?inc=url-rels`); const o = { dz: [], it: [] };
  for (const r of (d && d.relations) || []) { const u = (r.url && r.url.resource) || ""; let m;
    if ((m = u.match(/deezer\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/))) o.dz.push(+m[1]);
    else if ((m = u.match(/(?:music|itunes)\.apple\.com\/.*?artist\/(?:[^\/?]+\/)?(?:id)?(\d+)/))) o.it.push(+m[1]); }
  o.dz = uniq(o.dz); o.it = uniq(o.it); return o;
}
async function mbFromDeezer(id) {
  const d = await MusicBrainz.get("url?resource=" + encodeURIComponent("https://www.deezer.com/artist/" + id) + "&inc=artist-rels");
  const a = ((d && d.relations) || []).map(r => r.artist).find(Boolean); return a ? { mb: a.id, name: a.name, dis: a.disambiguation || "" } : null;
}
/* Who is Deezer profile `id`, according to MusicBrainz? The MusicBrainz IDs credited under that name on the
   profile's own songs (found by recording code), [] when MusicBrainz knows the song but not under that name,
   null when it can't tell. Songs the known profiles are also on prove nothing and are skipped. */
async function whoOnDeezer(id, name, known) {
  const k = nn(name);
  for (const t0 of (await Deezer.top(id, 3)).slice(0, 2)) {
    if ((t0.aid || []).some(i => known.includes(i))) continue;
    const t = await Deezer.track(t0.dz); if (!t || !t.isrc) continue;
    const d = await MusicBrainz.get(`isrc/${encodeURIComponent(t.isrc)}?inc=artist-credits`); if (!d) continue;
    return uniq(((d.recordings) || []).flatMap(r => (r["artist-credit"] || []).filter(c => c.artist && nn(c.name || c.artist.name) === k).map(c => c.artist.id)));
  }
  return null;
}
/* Who is Apple Music profile `id` on Deezer? The Deezer IDs credited under that name on every one of its
   checked songs, [] when the songs belong to someone else there, null when they can't be found. */
async function whoOnApple(id, name) {
  const k = nn(name), songs = (await ITunes.songsOf(id, 3)).slice(0, 2); if (!songs.length) return null; let common = null;
  for (const s of songs) { const t = await Deezer.find(s.t, s.a); if (!t) return null;
    const ns = String(t.a || "").split(/;\s*/), ids = (t.aid || []).filter((x, i) => ns.length !== t.aid.length || nn(ns[i]) === k);
    common = common ? common.filter(x => ids.includes(x)) : ids; if (!common.length) return []; }
  return common;
}
const sourcesOf = g => [g.dz.length ? "Deezer" : null, g.mb ? "MusicBrainz" : null, g.it.length ? "Apple Music" : null].filter(Boolean);
function aboutOf(g) {
  if (g.about) return g.about;
  const bits = [g.type === "Group" ? "Group" : g.type === "Person" ? "" : "", g.country, g.begin ? "since " + g.begin : ""].filter(Boolean);
  return bits.join(", ");
}
/* Search Deezer, MusicBrainz and Apple Music together and return one row per real artist. */
async function find(q, o = {}) {
  const say = o.say || (() => {}); q = String(q || "").trim(); const failed = [];
  if (!q) return { groups: [], failed, exact: false };
  const k = nn(q);
  say("Looking on Deezer, MusicBrainz and Apple Music…");
  const [dzR, itR, mbR] = await Promise.allSettled([Deezer.artists(q, 10), ITunes.artists(q, 10), mbArtists(q)]);
  const dzA = dzR.status === "fulfilled" ? dzR.value : (failed.push("Deezer"), []);
  const itA = itR.status === "fulfilled" ? itR.value : (failed.push("Apple Music"), []);
  const mbA = mbR.status === "fulfilled" ? mbR.value : (failed.push("MusicBrainz"), []);
  let links = new Map(); if (mbA.length) { try { links = await wdLinks(mbA.map(a => a.mb)); } catch { failed.push("Wikidata"); } }
  const groups = mbA.map(a => { const l = links.get(a.mb) || { dz: [], it: [], about: "" };
    return { name: a.name, mb: a.mb, about: l.about || a.dis, country: a.country, begin: a.begin, type: a.type, dz: l.dz.slice(), it: l.it.slice(), score: a.score, pic: null, fans: 0, genre: "", dupes: 0 }; });
  const exact = g => nn(g.name) === k;
  /* exact names Wikidata didn't link: read MusicBrainz's own links */
  for (const g of groups.filter(g => exact(g) && (!g.dz.length || !g.it.length)).slice(0, 2)) { say(`Checking ${g.name}'s pages…`); try { const u = await mbUrls(g.mb); g.dz = uniq(g.dz.concat(u.dz)); g.it = uniq(g.it.concat(u.it)); } catch {} }
  const left = [];
  for (const a of dzA) { const g = groups.find(g => g.dz.includes(a.id)); if (g) { if (a.fans >= g.fans) { g.fans = a.fans; g.pic = a.pic || g.pic; } } else left.push(a); }
  for (const g of groups.filter(g => exact(g) && g.dz.length && !g.fans).slice(0, 2)) { try { const a = await Deezer.artist(g.dz[0]); if (a) { g.fans = a.fans; g.pic = a.pic; } } catch {} }
  /* other Deezer profiles with exactly this name: a duplicate profile of an artist MusicBrainz knows, or someone else? */
  const anchors = groups.filter(g => exact(g)), known = uniq(anchors.flatMap(g => g.dz));
  if (anchors.length) for (const a of left.filter(a => nn(a.name) === k).slice(0, 3)) {
    say(`Checking who the “${a.name}” profile on Deezer is…`);
    let who = null; try { who = await whoOnDeezer(a.id, a.name, known); } catch {}
    const g = who && anchors.find(g => who.includes(g.mb));
    if (g) { g.dz.push(a.id); if (g.dz.length > 1) g.dupes++; if (a.fans >= g.fans) { g.fans = a.fans; g.pic = a.pic || g.pic; } a.used = true; }
  }
  for (const a of left) if (!a.used) groups.push({ name: a.name, mb: null, about: "", dz: [a.id], it: [], fans: a.fans, pic: a.pic, score: 0, genre: "", dupes: 0 });
  const itLeft = [];
  for (const a of itA) { const g = groups.find(g => g.it.includes(a.id)); if (g) g.genre = g.genre || a.genre; else itLeft.push(a); }
  const dzAnchors = groups.filter(g => exact(g) && g.dz.length);
  if (dzAnchors.length) for (const a of itLeft.filter(a => nn(a.name) === k).slice(0, 3)) {
    say(`Checking who “${a.name}” on Apple Music is…`);
    let who = null; try { who = await whoOnApple(a.id, a.name); } catch {}
    const g = who && who.length && dzAnchors.find(g => g.dz.some(i => who.includes(i)));
    if (g) { g.it.push(a.id); g.genre = g.genre || a.genre; a.used = true; }
  }
  for (const a of itLeft) if (!a.used) groups.push({ name: a.name, mb: null, about: "", dz: [], it: [a.id], fans: 0, pic: null, score: 0, genre: a.genre, dupes: 0 });
  const rank = (a, b) => b.fans - a.fans || (b.mb ? 1 : 0) - (a.mb ? 1 : 0) || (b.dz.length + b.it.length) - (a.dz.length + a.it.length) || b.score - a.score;
  const ex = groups.filter(exact).sort(rank), near = groups.filter(g => !exact(g) && (g.fans >= 1000 || (g.mb && (g.about || g.dz.length || g.it.length)))).sort(rank);
  const lim = o.limit || 10, nEx = Math.min(ex.length, Math.max(lim - Math.min(near.length, 4), 1));
  const keep = ex.slice(0, nEx).concat(near.slice(0, lim - nEx));
  return { groups: keep.map(g => ({ name: g.name, about: aboutOf(g), dz: g.dz, it: g.it, mb: g.mb, pic: g.pic, fans: g.fans, genre: g.genre, dupes: g.dupes, sources: sourcesOf(g), exact: exact(g) })), failed, exact: keep.some(exact) };
}
const toEntry = g => store({ name: g.name, about: g.about, dz: g.dz, it: g.it, mb: g.mb, pic: g.pic });
/* An old name-only entry: link it only when one artist is the clear answer */
async function link(name, o = {}) {
  const r = await find(name, o); const ex = r.groups.filter(g => g.exact); if (!ex.length) return null;
  const strong = ex.filter(g => g.mb && g.dz.length);
  if (strong.length === 1) return toEntry(strong[0]);
  const pool = strong.length ? strong : ex, top = pool.slice().sort((a, b) => b.fans - a.fans);
  if (top[0].fans >= 10000 && top[0].fans >= 10 * ((top[1] && top[1].fans) || 0)) return toEntry(top[0]);
  return null;
}
/* An entry that came from one service (a Deezer result, a reading): add its IDs from the others */
async function complete(e0, o = {}) {
  const e = entry(e0); if (!e || e.plain) return store(e0);
  try {
    if (!e.mb && e.dz.length) { const m = await mbFromDeezer(e.dz[0]).catch(() => null); if (m) { e.mb = m.mb; e.about = e.about || m.dis; } }
    const r = await find(e.name, o);
    const g = r.groups.find(g => (e.mb && g.mb === e.mb) || g.dz.some(i => e.dz.includes(i)) || g.it.some(i => e.it.includes(i)));
    if (g) { e.dz = uniq(e.dz.concat(g.dz)); e.it = uniq(e.it.concat(g.it)); e.mb = e.mb || g.mb; e.about = g.about || e.about; e.pic = e.pic || g.pic; }
  } catch {}
  return store(e);
}
const describe = e => { const o = entry(e); return o ? (o.plain ? "" : o.about) : ""; };
const sourcesOfEntry = e => { const o = entry(e); return o ? sourcesOf(o) : []; };

const API = { entry, store, nameOf, isLinked, same, add, banSet, banned, featNames, find, link, complete, toEntry, describe, sourcesOf: sourcesOfEntry, fmtFans, _: { whoOnDeezer, whoOnApple, wdLinks, mbUrls, mbFromDeezer } };
G.Artists = API;
if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

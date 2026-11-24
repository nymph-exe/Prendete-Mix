/* Préndete Mix — catalog sources (Lucida-style: each source has its own transport and parser,
   all produce one Track shape). Works in the browser (Deezer via JSONP) and in Node (fetch) for tests.
   Track: {id, dz?, it?, t, a ('A; B'), aid[], al, y, isrc, ex, exp ('explicit'|'clean'|''), dur, rank, cov, prev, prevAt, link, sp, f?} */
(function (G) {
"use strict";
const Core = G.Core || (typeof require !== "undefined" ? require("./core.js") : null);
const BROWSER = typeof document !== "undefined";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const https = u => (typeof u === "string" && /^https:\/\//.test(u) ? u : null);
function limiter(perSec) { let q = Promise.resolve(), last = 0; const gap = 1000 / perSec; return fn => { const p = q.then(async () => { const w = last + gap - Date.now(); if (w > 0) await sleep(w); last = Date.now(); return fn(); }); q = p.catch(() => {}); return p; }; }
async function getJSON(url, opt = {}, timeout = 15000) {
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null; const t = ac && setTimeout(() => ac.abort(), timeout);
  try { const r = await fetch(url, Object.assign({ signal: ac && ac.signal }, opt)); if (!r.ok) { const e = new Error(url.split("?")[0] + " " + r.status); e.status = r.status; throw e; } return await r.json(); }
  finally { if (t) clearTimeout(t); }
}
const SETTINGS = { country: "us" };

/* ---------- matching ---------- */
const mnorm = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\((feat|ft|with)[^)]*\)|\[[^\]]*\]/g, " ").replace(/\s(feat|ft)\.?\s.*$/, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
function match(title, artist, x) {
  const nt = mnorm(title), ng = mnorm(x.t); if (!nt || !ng) return false;
  const tOk = nt === ng || ng.startsWith(nt + " ") || nt.startsWith(ng + " ") || Core.baseTitle(title) === Core.baseTitle(x.t);
  const want = String(artist || "").split(/;|,|&| x | feat\.? | ft\.? /i).map(mnorm).filter(Boolean);
  const got = String(x.a || "").split(/;\s*/).map(mnorm).filter(Boolean);
  const aOk = want.some(w => got.some(g => g === w || g.includes(w) || w.includes(g)));
  return tOk && aOk;
}
const expOf = ex => (ex === 1 || ex === 4 ? "explicit" : ex === 3 ? "clean" : "");

/* ---------- Deezer ---------- */
let jpN = 0; const dzLimit = limiter(7);
function jsonp(url, timeout = 12000) {
  return new Promise((res, rej) => {
    const cb = "__pj" + (++jpN) + "_" + Math.random().toString(36).slice(2, 7); const s = document.createElement("script"); let t = 0;
    const fin = () => { clearTimeout(t); try { delete window[cb]; } catch { window[cb] = undefined; } s.remove(); };
    t = setTimeout(() => { fin(); rej(new Error("timeout")); }, timeout); window[cb] = d => { fin(); res(d); }; s.onerror = () => { fin(); rej(new Error("network")); };
    s.src = url + (url.includes("?") ? "&" : "?") + "output=jsonp&callback=" + cb; document.head.append(s);
  });
}
async function dz(path) {
  for (let i = 0; i < 3; i++) {
    const url = "https://api.deezer.com" + path;
    const d = await dzLimit(() => (BROWSER ? jsonp(url) : getJSON(url)));
    if (d && d.error) { if (d.error.code === 4) { await sleep(1500 * (i + 1)); continue; } if (d.error.code === 800) return null; throw new Error(d.error.message || "deezer"); }
    return d;
  }
  throw new Error("Deezer is busy");
}
const Deezer = {
  id: "deezer", label: "Deezer",
  parse(t) {
    const al = t.album || {}; const cs = t.contributors && t.contributors.length ? t.contributors : [t.artist].filter(Boolean);
    const y1 = +(t.release_date || al.release_date || "").slice(0, 4) || null, y2 = Core.isrcYear(t.isrc);
    const y = y1 && y2 ? Math.min(y1, y2) : y1 || y2 || null;
    return { id: "dz:" + t.id, dz: t.id, t: t.title, a: cs.map(c => c.name).filter(Boolean).join("; "), aid: cs.map(c => c.id).filter(Boolean),
      al: al.title || "", y, isrc: typeof t.isrc === "string" ? t.isrc : null, ex: t.explicit_content_lyrics, exp: expOf(t.explicit_content_lyrics),
      dur: t.duration || 0, rank: t.rank || 0, cov: https(al.cover_medium) || null, prev: https(t.preview), prevAt: Date.now(), link: https(t.link), full: !!t.isrc };
  },
  async search(q, limit = 20) { const d = await dz("/search?q=" + encodeURIComponent(q) + "&limit=" + limit); return ((d && d.data) || []).filter(t => t && t.readable !== false).map(t => this.parse(t)); },
  async artists(q, limit = 6) { const d = await dz("/search/artist?q=" + encodeURIComponent(q) + "&limit=" + limit); return ((d && d.data) || []).map(a => ({ id: a.id, name: a.name, pic: https(a.picture_medium), fans: a.nb_fan || 0 })); },
  async track(id) { const t = await dz("/track/" + id); return t && t.id ? this.parse(t) : null; },
  async byIsrc(isrc) { try { const t = await dz("/track/isrc:" + encodeURIComponent(isrc)); return t && t.id ? this.parse(t) : null; } catch { return null; } },
  async related(id, limit = 20) { const d = await dz(`/artist/${id}/related?limit=${limit}`); return ((d && d.data) || []).map(a => ({ id: a.id, name: a.name, fans: a.nb_fan || 0 })); },
  async top(id, limit = 10) { const d = await dz(`/artist/${id}/top?limit=${limit}`); return ((d && d.data) || []).filter(t => t && t.readable !== false).map(t => this.parse(t)); },
  async genres() { const d = await dz("/genre"); return ((d && d.data) || []).filter(g => g.id).map(g => ({ id: g.id, name: g.name })); },
  async chart(gid, limit = 50) { const d = await dz(`/chart/${gid}/tracks?limit=${limit}`); return ((d && d.data) || []).map(t => this.parse(t)); },
  async artistByName(name) { const r = await this.artists(name, 3); return r.find(a => mnorm(a.name) === mnorm(name)) || null; },
  async find(title, artist) {
    const core = String(title).split(/\s[\(\[]/)[0], fa = Core.firstArtist(artist);
    const extra = t => /[\[(]|\s-\s/.test(String(t).replace(/\((feat|ft|with)[^)]*\)/ig, ""));
    const ek = t => Core.norm(String(t).replace(/\s*[\(\[](feat|ft|with)\.?\s[^\)\]]*[\)\]]/ig, ""));
    const score = x => (ek(x.t) === ek(title) ? 3 : 0) + (Core.versionTags(x.t).join() === Core.versionTags(title).join() ? 2 : -3) + (extra(x.t) && !extra(title) ? -1 : 0) + Math.min(1, (x.rank || 0) / 1e6);
    const pick = list => { const c = list.filter(x => match(title, artist, x)); return c.length ? c.sort((a, b) => score(b) - score(a))[0] : null; };
    const good = x => x && score(x) >= 4;
    let best = null;
    for (const q of [`${core} ${fa}`, `${fa} ${core}`]) { const hit = pick(await this.search(q, 25)); if (good(hit)) return hit; if (hit && (!best || score(hit) > score(best))) best = hit; }
    try { const a = await this.artistByName(fa); if (a) { const hit = pick(await this.top(a.id, 100)); if (hit && (!best || score(hit) > score(best))) best = hit; } } catch {}
    return best;
  }
};

/* ---------- Apple Music (iTunes Search) ---------- */
const itLimit = limiter(3);
const ITunes = {
  id: "itunes", label: "Apple Music",
  parse(r) {
    return { id: "it:" + r.trackId, it: r.trackId, t: r.trackName, a: r.artistName, aid: [], al: r.collectionName || "", y: +(r.releaseDate || "").slice(0, 4) || null,
      isrc: null, exp: r.trackExplicitness === "explicit" ? "explicit" : r.trackExplicitness === "cleaned" ? "clean" : "", dur: Math.round((r.trackTimeMillis || 0) / 1000),
      rank: 0, cov: https((r.artworkUrl100 || "").replace("100x100bb", "300x300bb")), prev: https(r.previewUrl), link: https(r.trackViewUrl), full: true };
  },
  async search(q, limit = 20) { const d = await itLimit(() => getJSON(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=${limit}&country=${encodeURIComponent(SETTINGS.country || "us")}`)); return (d.results || []).filter(x => x.kind === "song").map(x => this.parse(x)); },
  async find(title, artist) { const r = await this.search(`${title} ${Core.firstArtist(artist)}`, 10); return r.find(x => match(title, artist, x)) || null; }
};

/* ---------- MusicBrainz / Cover Art Archive / ListenBrainz ---------- */
const mbLimit = limiter(1);
const MB = { headers: { Accept: "application/json" } };
const MusicBrainz = {
  async artistMbid(name) {
    try { const d = await mbLimit(() => getJSON(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent('artist:"' + name.replace(/"/g, "") + '"')}&fmt=json&limit=3`, MB));
      const a = (d.artists || []).find(x => mnorm(x.name) === mnorm(name) && (x.score || 0) >= 90); return a ? a.id : null; } catch { return null; }
  },
  async firstYear(t, a) {
    try { const q = `recording:"${String(t).split(/\s[\(\[]/)[0].replace(/"/g, "")}" AND artist:"${Core.firstArtist(a).replace(/"/g, "")}"`;
      const d = await mbLimit(() => getJSON(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=8`, MB));
      const ys = (d.recordings || []).filter(x => match(t, a, { t: x.title, a: (x["artist-credit"] || []).map(c => c.name).join("; ") })).map(x => +String(x["first-release-date"] || "").slice(0, 4)).filter(Boolean);
      return ys.length ? Math.min(...ys) : null; } catch { return null; }
  },
  async search(q, limit = 10) {
    const d = await mbLimit(() => getJSON(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=${limit}`, MB));
    return (d.recordings || []).map(r => { const rel = (r.releases || [])[0] || {}; const rg = (rel["release-group"] || {}).id;
      return { id: "mb:" + r.id, t: r.title, a: (r["artist-credit"] || []).map(c => c && c.name).filter(Boolean).join("; "), aid: [], al: rel.title || "", y: +String(r["first-release-date"] || "").slice(0, 4) || null,
        isrc: (r.isrcs || [])[0] || null, exp: "", dur: Math.round((r.length || 0) / 1000), rank: 0, cov: rg ? `https://coverartarchive.org/release-group/${rg}/front-250` : null, prev: null, link: `https://musicbrainz.org/recording/${r.id}` }; });
  }
};
const lbLimit = limiter(2);
const ListenBrainz = {
  ALG: "session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30",
  async similar(mbid, limit = 12) {
    try { const d = await lbLimit(() => getJSON(`https://labs.api.listenbrainz.org/similar-artists/json?artist_mbids=${mbid}&algorithm=${this.ALG}`));
      const arr = Array.isArray(d) ? d : (d && d[3] && d[3].data) || []; return arr.slice(0, limit).map(x => ({ name: x.name, score: x.score || 0 })); } catch { return []; }
  }
};

/* ---------- ReccoBeats (audio features + popularity, by ISRC) ---------- */
const rbLimit = limiter(4);
const ReccoBeats = {
  async features(isrcs) {
    const out = new Map(); const list = [...new Set(isrcs.filter(Boolean))];
    for (let i = 0; i < list.length; i += 40) {
      const ids = list.slice(i, i + 40).join(",");
      const [f, t] = await Promise.all([
        rbLimit(() => getJSON(`https://api.reccobeats.com/v1/audio-features?ids=${ids}`)).catch(() => null),
        rbLimit(() => getJSON(`https://api.reccobeats.com/v1/track?ids=${ids}`)).catch(() => null)]);
      for (const x of (f && f.content) || []) if (x.isrc) out.set(x.isrc, Object.assign(out.get(x.isrc) || {}, { e: x.energy, d: x.danceability, v: x.valence, bpm: x.tempo, ac: x.acousticness, sp: https(x.href) }));
      for (const x of (t && t.content) || []) if (x.isrc) out.set(x.isrc, Object.assign(out.get(x.isrc) || {}, { pop: x.popularity, sp: https(x.href) || (out.get(x.isrc) || {}).sp }));
    }
    return out;
  }
};

/* ---------- verification: AI/pasted picks must map to a real catalog track ---------- */
async function resolve(title, artist) {
  let r = null;
  try { r = await Deezer.find(title, artist); } catch {}
  if (r) { try { const full = await Deezer.track(r.dz); if (full) r = full; } catch {} return r; }
  try { r = await ITunes.find(title, artist); } catch {}
  return r;
}
async function complete(t) { if (t.dz && !t.full) { try { const f = await Deezer.track(t.dz); if (f) return Object.assign(t, f, { full: true }); } catch {} } return t; }

/* ---------- rough language guess from a title (Classic only) ---------- */
const LW = {
  es: "el la los las de del que mi tu te me se yo amor corazon noche baila bailar perreo quiero dime sin con por para como eres vida dale mami papi bebe nena loco loca solo una uno otra vez todo nada fuego calor besos beso cuerpo luna cielo hoy ahora siempre nunca mas tiempo pa ella el".split(" "),
  en: "the you me my your i im love baby girl boy night dance it is on in of to and we all up down get got like just dont cant wanna gonna feel time back go no yeah oh".split(" "),
  pt: "voce nao eu meu minha amor coracao beijo saudade danca vai com sem pra tudo nada agora sempre".split(" "),
  fr: "je tu le les des une pas moi toi mon ma amour coeur nuit danse".split(" ")
};
function guessLang(title) {
  const raw = String(title || ""); if (/[ñ¿¡]/i.test(raw)) return "es";
  const toks = mnorm(raw).split(" ").filter(Boolean); if (!toks.length) return null;
  const sc = {}; for (const [l, ws] of Object.entries(LW)) sc[l] = toks.filter(w => ws.includes(w)).length;
  const best = Object.entries(sc).sort((a, b) => b[1] - a[1]); if (!best[0][1] || best[0][1] === best[1][1]) return null; return best[0][0];
}

const API = { SETTINGS, limiter, sleep, https, getJSON, mnorm, match, expOf, dz, Deezer, ITunes, MusicBrainz, ListenBrainz, ReccoBeats, resolve, complete, guessLang };
G.Catalog = API;
if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

/* MIXER (internally the Préndete app) — catalog sources (Lucida-style: each source has its own transport and parser,
   all produce one Track shape). Works in the browser (Deezer via JSONP) and in Node (fetch) for tests.
   Track: {id, dz?, it?, t, a ('A; B'), aid[], al, y, isrc, ex, exp ('explicit'|'clean'|''), dur, rank, cov, prev, prevAt, link, sp, f?} */
(function (G) {
"use strict";
const Core = G.Core || (typeof require !== "undefined" ? require("./core.js") : null);
const BROWSER = typeof document !== "undefined";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const https = u => (typeof u === "string" && /^https:\/\//.test(u) ? u : null);
function pacer(perSec) { let next = 0; const gap = 1000 / perSec; return async fn => { const now = Date.now(); const at = Math.max(now, next); next = at + gap; if (at > now) await sleep(at - now); return fn(); }; }
function limiter(perSec) { let q = Promise.resolve(), last = 0; const gap = 1000 / perSec; return fn => { const p = q.then(async () => { const w = last + gap - Date.now(); if (w > 0) await sleep(w); last = Date.now(); return fn(); }); q = p.catch(() => {}); return p; }; }
async function getJSON(url, opt = {}, timeout = 15000) {
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null; const t = ac && setTimeout(() => ac.abort(), timeout);
  try { const r = await fetch(url, Object.assign({ signal: ac && ac.signal }, opt)); if (!r.ok) { const e = new Error(url.split("?")[0] + " " + r.status); e.status = r.status; e.retryAfter = +(r.headers.get("retry-after") || 0); throw e; } return await r.json(); }
  finally { if (t) clearTimeout(t); }
}
const SETTINGS = { country: "us" };

/* ---------- matching ---------- */
const mnorm = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\((feat|ft|with)[^)]*\)|\[[^\]]*\]/g, " ").replace(/\s(feat|ft)\.?\s.*$/, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
function lev(a, b) { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } } return d[b.length]; }
/* Same song: title equal after normalizing (spacing/punctuation ignored), or a one-letter typo (two for long titles)
   when the artist matches exactly. The result is always a real catalog track, never a made-up one. */
function match(title, artist, x) {
  const nt = mnorm(title), ng = mnorm(x.t); if (!nt || !ng) return false;
  const want = String(artist || "").split(/;|,|&| x | feat\.? | ft\.? | and | y /i).map(mnorm).filter(Boolean);
  const got = String(x.a || "").split(/;\s*/).map(mnorm).filter(Boolean);
  const exactA = want.some(w => got.includes(w));
  const aOk = exactA || want.some(w => got.some(g => (g.includes(w) || w.includes(g)) && Math.min(g.length, w.length) >= 3));
  if (!aOk) return false;
  const sq = s => s.replace(/\s+/g, ""), bt = s => sq(mnorm(Core.baseTitle(s)));
  if (nt === ng || sq(nt) === sq(ng) || ng.startsWith(nt + " ") || nt.startsWith(ng + " ") || (Core.baseTitle(title) && Core.baseTitle(title) === Core.baseTitle(x.t)) || (bt(title) && bt(title) === bt(x.t))) return true;
  if (exactA) { const a = sq(nt), b = sq(ng); const L = Math.min(a.length, b.length); if (L >= 5 && lev(a, b) <= (L >= 11 ? 2 : 1)) return true; }
  return false;
}
const expOf = ex => (ex === 1 || ex === 4 ? "explicit" : ex === 3 ? "clean" : "");

/* ---------- Deezer ---------- */
let jpN = 0; const dzLimit = pacer(8); /* Deezer allows 50 requests per 5 s */
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
    const al = t.album || {}; const cs0 = t.contributors && t.contributors.length ? t.contributors : [t.artist].filter(Boolean);
    const cs = cs0.filter((c, i) => c && c.name && cs0.findIndex(x => x && (x.id && c.id ? x.id === c.id : mnorm(x.name) === mnorm(c.name))) === i);
    const y1 = +(t.release_date || al.release_date || "").slice(0, 4) || null, y2 = Core.isrcYear(t.isrc);
    const y = y1 && y2 ? Math.min(y1, y2) : y1 || y2 || null;
    return { id: "dz:" + t.id, dz: t.id, t: t.title, a: cs.map(c => c.name).filter(Boolean).join("; "), aid: cs.map(c => c.id).filter(Boolean),
      al: al.title || "", y, isrc: typeof t.isrc === "string" ? t.isrc : null, ex: t.explicit_content_lyrics, exp: expOf(t.explicit_content_lyrics),
      dur: t.duration || 0, rank: t.rank || 0, cov: https(al.cover_medium) || null, prev: https(t.preview), prevAt: Date.now(), link: https(t.link), full: !!t.isrc };
  },
  async search(q, limit = 20) { const d = await dz("/search?q=" + encodeURIComponent(q) + "&limit=" + limit); return ((d && d.data) || []).filter(t => t && t.readable !== false).map(t => this.parse(t)); },
  async artists(q, limit = 6) { const d = await dz("/search/artist?q=" + encodeURIComponent(q) + "&limit=" + limit); return ((d && d.data) || []).map(a => ({ id: a.id, name: a.name, pic: https(a.picture_medium), fans: a.nb_fan || 0, albums: a.nb_album || 0 })); },
  async artist(id) { const a = await dz("/artist/" + id); return a && a.id ? { id: a.id, name: a.name, pic: https(a.picture_medium), fans: a.nb_fan || 0, albums: a.nb_album || 0 } : null; },
  async track(id) { const t = await dz("/track/" + id); return t && t.id ? this.parse(t) : null; },
  async byIsrc(isrc) { try { const t = await dz("/track/isrc:" + encodeURIComponent(isrc)); return t && t.id ? this.parse(t) : null; } catch { return null; } },
  async related(id, limit = 20) { const d = await dz(`/artist/${id}/related?limit=${limit}`); return ((d && d.data) || []).map(a => ({ id: a.id, name: a.name, fans: a.nb_fan || 0 })); },
  async radio(id, limit = 25) { const d = await dz(`/artist/${id}/radio?limit=${limit}`); return ((d && d.data) || []).filter(t => t && t.readable !== false).map(t => this.parse(t)); },
  async top(id, limit = 10) { const d = await dz(`/artist/${id}/top?limit=${limit}`); return ((d && d.data) || []).filter(t => t && t.readable !== false).map(t => this.parse(t)); },
  async genres() { const d = await dz("/genre"); return ((d && d.data) || []).filter(g => g.id).map(g => ({ id: g.id, name: g.name })); },
  async chart(gid, limit = 50) { const d = await dz(`/chart/${gid}/tracks?limit=${limit}`); return ((d && d.data) || []).map(t => this.parse(t)); },
  async artistByName(name, minFans = 0) { const r = await this.artists(name, 6); const ex = r.filter(a => mnorm(a.name) === mnorm(name) && a.fans >= minFans).sort((a, b) => b.fans - a.fans); return ex[0] || null; },
  async playlists(q, limit = 4) { const d = await dz("/search/playlist?q=" + encodeURIComponent(q) + "&limit=" + limit); return ((d && d.data) || []).map(p => ({ id: p.id, title: p.title, n: p.nb_tracks || 0, editor: /deezer/i.test((p.user && p.user.name) || "") })); },
  async playlistTracks(id, limit = 100) { const d = await dz(`/playlist/${id}/tracks?limit=${limit}`); return ((d && d.data) || []).filter(t => t && t.readable !== false).map(t => this.parse(t)); },
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
    return { id: "it:" + r.trackId, it: r.trackId, t: r.trackName, a: r.artistName, aid: [], itA: r.artistId || null, al: r.collectionName || "", y: +(r.releaseDate || "").slice(0, 4) || null,
      isrc: null, exp: r.trackExplicitness === "explicit" ? "explicit" : r.trackExplicitness === "cleaned" ? "clean" : "", dur: Math.round((r.trackTimeMillis || 0) / 1000),
      rank: 0, cov: https((r.artworkUrl100 || "").replace("100x100bb", "300x300bb")), prev: https(r.previewUrl), link: https(r.trackViewUrl), full: true };
  },
  async search(q, limit = 20) { const d = await itLimit(() => getJSON(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=${limit}&country=${encodeURIComponent(SETTINGS.country || "us")}`)); return (d.results || []).filter(x => x.kind === "song").map(x => this.parse(x)); },
  async find(title, artist) { const r = await this.search(`${title} ${Core.firstArtist(artist)}`, 10); return r.find(x => match(title, artist, x)) || null; },
  async artists(q, limit = 10) { const d = await itLimit(() => getJSON(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=${limit}&country=${encodeURIComponent(SETTINGS.country || "us")}`)); return (d.results || []).filter(x => x.artistId && x.artistName).map(x => ({ id: x.artistId, name: x.artistName, genre: x.primaryGenreName || "" })); },
  async songsOf(id, limit = 3) { const d = await itLimit(() => getJSON(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song&limit=${limit}&country=${encodeURIComponent(SETTINGS.country || "us")}`)); return (d.results || []).filter(x => x.kind === "song").map(x => this.parse(x)); }
};

/* ---------- MusicBrainz / Cover Art Archive / ListenBrainz ---------- */
const mbLimit = limiter(1);
const MB = { headers: BROWSER ? { Accept: "application/json" } : { Accept: "application/json", "User-Agent": "MIXER/3 (github.com/nymph-exe/Prendete-Mix)" } }; /* browsers send their own User-Agent */
const MusicBrainz = {
  /* MusicBrainz answers 503 when it's busy: wait and try again twice; 404 means "doesn't know it" */
  async get(path) { for (let i = 0; ; i++) { try { return await mbLimit(() => getJSON("https://musicbrainz.org/ws/2/" + path + (path.includes("?") ? "&" : "?") + "fmt=json", MB)); } catch (e) { if (e.status === 404) return null; if (e.status !== 503 || i >= 2) throw e; await sleep(1500 * (i + 1)); } } },
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
      return { id: "mb:" + r.id, t: r.title, a: (r["artist-credit"] || []).map(c => c && c.name).filter(Boolean).join("; "), aid: [], mbA: (r["artist-credit"] || []).filter(c => c && c.name).map(c => (c.artist && c.artist.id) || ""), al: rel.title || "", y: +String(r["first-release-date"] || "").slice(0, 4) || null,
        isrc: (r.isrcs || [])[0] || null, exp: "", dur: Math.round((r.length || 0) / 1000), rank: 0, cov: rg ? `https://coverartarchive.org/release-group/${rg}/front-250` : null, prev: null, link: `https://musicbrainz.org/recording/${r.id}` }; });
  }
};
const lbLimit = pacer(3);
const ListenBrainz = {
  ALG: "session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30",
  async similar(mbid, limit = 12) {
    try { const d = await lbLimit(() => getJSON(`https://labs.api.listenbrainz.org/similar-artists/json?artist_mbids=${mbid}&algorithm=${this.ALG}`));
      const arr = Array.isArray(d) ? d : (d && d[3] && d[3].data) || []; return arr.slice(0, limit).map(x => ({ name: x.name, score: x.score || 0 })); } catch { return []; }
  }
};

/* ---------- ListenBrainz labs: name→ID lookup, song-to-song similarity, tags, songs by tag ----------
   All keyless with CORS. Similarity comes from real listening sessions ("people who play X also play Y"). */
/* api.listenbrainz.org allows 30 per 10 s, labs has no stated limit */
const paced = lim => fn => lim(fn).catch(async e => { if (e && e.status === 429) { await sleep(Math.min(12, +e.retryAfter || 6) * 1000); return lim(fn); } throw e; });
const lbxLimit = paced(pacer(6)), lbaLimit = paced(pacer(2.6));
const postJSON = (url, body, timeout = 20000) => getJSON(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, timeout);
const LBX = "https://labs.api.listenbrainz.org";
const LB = {
  ALG: ["session_based_days_7500_session_300_contribution_5_threshold_15_limit_50_skip_30_top_n_listeners_1000", "session_based_days_1500_session_300_contribution_5_threshold_15_limit_50_skip_30_top_n_listeners_1000"],
  key: t => Core.norm(Core.baseTitle(t.t) || t.t) + "|" + Core.norm(Core.firstArtist(t.a)),
  /* tracks → Map(track.id → {rec, artists}) ; tries the first artist, then the full credit */
  async lookup(tracks) {
    const out = new Map(); const todo = tracks.filter(t => t && t.t && t.a && !t.mbid);
    for (const t of tracks) if (t && t.mbid) out.set(t.id, { rec: t.mbid, artists: t.ambids || [] });
    const title = t => String(t.t).replace(/\s*[\(\[](feat|ft|with)\.?\s[^\)\]]*[\)\]]/ig, "").trim();
    for (const pass of [t => Core.firstArtist(t.a), t => String(t.a).split(/;\s*/).join(" & ")]) {
      const left = todo.filter(t => !out.has(t.id)); if (!left.length) break;
      for (let i = 0; i < left.length; i += 40) {
        const chunk = left.slice(i, i + 40);
        let res = []; try { res = await lbxLimit(() => postJSON(`${LBX}/acr-lookup/json`, chunk.map(t => ({ artist_credit_name: pass(t), recording_name: title(t) })))); } catch { continue; }
        for (const r of res || []) { const t = chunk[r.index]; if (t && r.recording_mbid) { out.set(t.id, { rec: r.recording_mbid, artists: r.artist_mbids || [] }); t.mbid = r.recording_mbid; t.ambids = r.artist_mbids || []; } }
      }
      if (pass === undefined) break;
    }
    return out;
  },
  /* one seed recording → similar recordings [{rec, t, a, score}] */
  async similar(rec, alg = this.ALG[0]) {
    try { const d = await lbxLimit(() => getJSON(`${LBX}/similar-recordings/json?recording_mbids=${rec}&algorithm=${alg}`, {}, 25000));
      return (Array.isArray(d) ? d : []).map(x => ({ rec: x.recording_mbid, t: x.recording_name, a: x.artist_credit_name, score: x.score || 0 })); } catch { return []; }
  },
  /* recordings → Map(rec → {tag: weight}) ; weights mix recording-, release- and artist-level tags */
  async tags(recs, { own = false } = {}) {
    const out = new Map(); const list = [...new Set(recs.filter(Boolean))];
    for (let i = 0; i < list.length; i += 50) {
      let res = []; try { res = await lbxLimit(() => postJSON(`${LBX}/bulk-tag-lookup/json`, list.slice(i, i + 50).map(r => ({ recording_mbid: r })))); } catch { continue; }
      for (const r of res || []) { if (own && r.source === "artist") continue; const m = out.get(r.recording_mbid) || {}; const w = (r.source === "recording" ? 1.5 : r.source === "release-group" ? 1.2 : 1) * Math.log2(1 + (r.tag_count || 1)); const tg = String(r.tag || "").toLowerCase().trim(); if (tg) m[tg] = (m[tg] || 0) + w; out.set(r.recording_mbid, m); }
    }
    for (const r of list) if (!out.has(r)) out.set(r, {});
    return out;
  },
  /* songs carrying a tag; popularity percentile window controls hits vs deep cuts */
  async byTag(tags, { popBegin = 0, popEnd = 100, count = 100, operator = "OR" } = {}) {
    const q = tags.map(t => "tag=" + encodeURIComponent(t)).join("&");
    try { const d = await lbaLimit(() => getJSON(`https://api.listenbrainz.org/1/lb-radio/tags?${q}&operator=${operator}&pop_begin=${popBegin}&pop_end=${popEnd}&count=${count}`, {}, 25000));
      return (Array.isArray(d) ? d : []).map(x => ({ rec: x.recording_mbid, w: (x.percent || 50) / 100 })); } catch { return []; }
  },
  /* recording IDs → names/artist/year */
  async meta(recs) {
    const out = new Map(); const list = [...new Set(recs.filter(Boolean))];
    for (let i = 0; i < list.length; i += 25) {
      try { const d = await lbaLimit(() => getJSON(`https://api.listenbrainz.org/1/metadata/recording/?recording_mbids=${list.slice(i, i + 25).join(",")}&inc=artist%20release`, {}, 25000));
        for (const [k, v] of Object.entries(d || {})) out.set(k, { rec: k, t: v.recording && v.recording.name, a: (v.artist && v.artist.name) || "", y: (v.release && v.release.year) || null }); } catch {}
    }
    return out;
  },
  /* artist IDs → Map(mbid → {name, area, type, tags: {tag: count}}) ; genre tags (with a MusicBrainz genre id) count a bit more */
  async artists(ambids) {
    const out = new Map(); const list = [...new Set(ambids.filter(Boolean))];
    for (let i = 0; i < list.length; i += 25) {
      let d = null; try { d = await lbaLimit(() => getJSON(`https://api.listenbrainz.org/1/metadata/artist/?artist_mbids=${list.slice(i, i + 25).join(",")}&inc=tag`, {}, 25000)); } catch (e) { if (i === 0 && list.length <= 25) throw e; continue; }
      for (const a of (Array.isArray(d) ? d : Object.values(d || {}))) { if (!a || !a.artist_mbid) continue; const tags = {};
        for (const x of (a.tag && a.tag.artist) || []) { const tg = String(x.tag || "").toLowerCase().trim(); if (tg) tags[tg] = (tags[tg] || 0) + Math.max(1, x.count || 1) * (x.genre_mbid ? 1.5 : 1); }
        out.set(a.artist_mbid, { name: a.name || "", area: a.area || "", type: a.type || "", by: +a.begin_year || null, tags }); }
    }
    return out;
  },
  async tagSimilar(tag) { try { const d = await lbxLimit(() => getJSON(`${LBX}/tag-similarity/json?tag=${encodeURIComponent(tag)}`)); return (Array.isArray(d) ? d : []).map(x => ({ tag: String(x.similar_tag).toLowerCase(), count: x.count || 0 })); } catch { return []; } }
};

/* ---------- Discogs: release styles (very fine-grained: "UK Drill", "Lo-Fi", "Bachata"…). No key; 25 requests a minute ---------- */
const dgLimit = paced(pacer(.4));
const Discogs = {
  /* an artist's styles across their releases → {style: weight} (styles count fully, broad genres half) */
  async styles(name) {
    const d = await dgLimit(() => getJSON(`https://api.discogs.com/database/search?artist=${encodeURIComponent(name)}&type=master&per_page=20`, {}, 15000));
    const out = {}; let n = 0;
    for (const r of (d && d.results) || []) { const t = String(r.title || ""); const who = t.split(" - ")[0]; if (mnorm(who) !== mnorm(name) && !mnorm(who).startsWith(mnorm(name))) continue; n++;
      for (const s of r.style || []) out[s.toLowerCase()] = (out[s.toLowerCase()] || 0) + 1; for (const g of r.genre || []) out[g.toLowerCase()] = (out[g.toLowerCase()] || 0) + .5; }
    return n ? out : null;
  }
};
/* ---------- Wikidata: genres of artists, by MusicBrainz artist ID (one query for many artists) ---------- */
const wdLimit = paced(pacer(1));
const WDH = { headers: BROWSER ? { Accept: "application/sparql-results+json" } : { Accept: "application/sparql-results+json", "User-Agent": "MIXER/3 (github.com/nymph-exe/Prendete-Mix)" } };
const Wikidata = {
  async query(q) { const d = await wdLimit(() => getJSON("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), WDH, 20000)); return (d.results && d.results.bindings) || []; },
  async genres(mbids) {
    const out = new Map(); const list = [...new Set(mbids.filter(x => /^[0-9a-f-]{36}$/.test(x || "")))];
    for (let i = 0; i < list.length; i += 60) {
      const q = `SELECT ?mb ?gl WHERE { VALUES ?mb { ${list.slice(i, i + 60).map(x => `"${x}"`).join(" ")} } ?a wdt:P434 ?mb; wdt:P136 ?g. ?g rdfs:label ?gl FILTER(lang(?gl)="en") }`;
      try { const d = await wdLimit(() => getJSON("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), { headers: BROWSER ? { Accept: "application/sparql-results+json" } : { Accept: "application/sparql-results+json", "User-Agent": "MIXER/3 (github.com/nymph-exe/Prendete-Mix)" } }, 20000));
        for (const b of (d.results && d.results.bindings) || []) { const k = b.mb.value, g = String(b.gl.value).toLowerCase().replace(/ music$/, ""); out.set(k, [...(out.get(k) || []), g]); } } catch {}
    }
    return out;
  }
};

/* ---------- ReccoBeats (audio features + popularity, by ISRC) ---------- */
const rbLimit = pacer(4);
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
/* null = searched and not found; throws OFFLINE when no catalog could be reached, so callers never report "not found" for songs that weren't checked */
async function resolve(title, artist) {
  let r = null, fails = 0;
  try { r = await Deezer.find(title, artist); } catch { fails++; }
  if (r) { try { const full = await Deezer.track(r.dz); if (full) r = full; } catch {} return r; }
  try { r = await ITunes.find(title, artist); } catch { fails++; }
  if (!r && fails === 2) { const e = new Error("offline"); e.code = "OFFLINE"; throw e; }
  return r;
}
async function complete(t) { if (t.dz && !t.full) { try { const f = await Deezer.track(t.dz); if (f) return Object.assign(t, f, { full: true }); } catch {} } return t; }

/* ---------- LRCLIB lyrics → language ---------- */
/* LRCLIB is a free community service: keep a gentle pace, and when it says "slow down" (429) every lyrics request pauses */
const lrLimit = limiter(2.5), lrsLimit = limiter(1); let lrPause = 0;
async function lrGet(url, lim) {
  for (let i = 0; ; i++) {
    const w = lrPause - Date.now(); if (w > 0) await sleep(w);
    try { return await lim(() => getJSON(url, {}, 12000)); }
    catch (e) { if (e.status === 404) return null; if (i >= 3 || !(e.status === 429 || e.status >= 500 || !e.status)) throw e;
      const wait = Math.max(2000, (e.retryAfter || 0) * 1000) * (i + 1); if (e.status === 429) lrPause = Math.max(lrPause, Date.now() + wait); await sleep(wait); }
  }
}
const LRCLIB = {
  /* {text, instrumental} when found, null when the song isn't in LRCLIB, undefined when it couldn't be checked right now */
  async lyrics(t, deep = true) {
    const title = String(t.t || "").replace(/\s*[\(\[](feat|ft|with)\.?\s[^\)\]]*[\)\]]/ig, "").trim(), artist = Core.firstArtist(t.a), enc = encodeURIComponent;
    try {
      const d = await lrGet(`https://lrclib.net/api/get?artist_name=${enc(artist)}&track_name=${enc(title)}${t.dur ? "&duration=" + t.dur : ""}`, lrLimit);
      if (d) return { text: d.plainLyrics || "", instrumental: !!d.instrumental };
      if (!deep) return null;
      const s = await lrGet(`https://lrclib.net/api/search?track_name=${enc(title)}&artist_name=${enc(artist)}`, lrsLimit);
      const c = (s || []).filter(x => match(title, artist, { t: x.trackName, a: x.artistName })).sort((a, b) => Math.abs((a.duration || 0) - (t.dur || 0)) - Math.abs((b.duration || 0) - (t.dur || 0)))[0];
      return c ? { text: c.plainLyrics || "", instrumental: !!c.instrumental } : null;
    } catch { return undefined; }
  }
};
const LANG_NAMES = { es: "Spanish", en: "English", pt: "Portuguese", fr: "French", it: "Italian", de: "German", ko: "Korean", ja: "Japanese", zh: "Chinese", ru: "Russian", ar: "Arabic", hi: "Hindi" };
const SW = {
  en: "the and you i my your it is on that this with for we be are what all just like got know when but now up get go she he they do don't can't i'm it's you're to of out down back never need how time way gonna wanna gotta tonight feel make let love night think tell see say only ever where why who been have has had would could should because about over into them their there these those our ain't i'll i've",
  es: "el los las y pero yo tú tu eres estoy quiero mi muy porque cuando también ahora aquí mucho bien voy ella él nosotros conmigo contigo otra vez bebé noche corazón hoy siempre tengo hace hacer puedo dime mami pa' perreo baila dale ya sola sin con una lo le del al ese esa esto eso así más qué cómo dónde quieres tienes sabes tus mis sus están hay fue vamos mujer calle fiesta mientras después antes nadie nunca todo de la que en me te se no",
  pt: "você voce não nao eu meu minha com uma isso é está tá ta mais mas então sem pra pro também muito sua seu ele ela nós vai vou tô gente coisa quero sou já olha beijo coração saudade amanhã hoje sempre ninguém alguém tudo agora aqui quando onde fazer tem tenho nossa vamos mim dela dele num numa essa esse nunca todo e da do de o os as no na que se me te um ao bem vem aí ai lá novinha bunda chão",
  fr: "je il elle nous vous les des une est et pas mais moi toi avec pour dans ce qui c'est j'ai oui ne sur au du mon ma ton ta ça comme tout rien suis veux fait plus quand bien aussi encore toujours jamais cœur nuit de la que en me te se un le on y",
  it: "il che non sono ti mi ma per della sei io noi voi questo questa quello come cosa perché amore ancora sempre niente più già anche ciao bella cuore notte gli una di da e lo la se me te un in",
  de: "ich du und nicht die der das ist ein eine mit mich dich mir dir wir ihr sie auf für auch wie was noch nur mein dein liebe immer nacht kein schon aber wenn ja so will in"
};
const SWI = new Map(); for (const [l, ws] of Object.entries(SW)) for (const w of ws.split(" ")) { if (!SWI.has(w)) SWI.set(w, []); SWI.get(w).push(l); }
/* Script share for non-Latin alphabets + function-word frequency for Latin ones. Returns null when there's too little text. */
function detectLang(text) {
  const s = String(text || ""); const cnt = re => (s.match(re) || []).length;
  const sc = { ko: cnt(/[\uac00-\ud7af\u1100-\u11ff]/g), kana: cnt(/[\u3040-\u30ff]/g), han: cnt(/[\u4e00-\u9fff]/g), ru: cnt(/[\u0400-\u04ff]/g), ar: cnt(/[\u0600-\u06ff]/g), hi: cnt(/[\u0900-\u097f]/g) };
  const latin = cnt(/[a-zà-ÿ]/gi); const share = {};
  if (sc.ko) share.ko = sc.ko * 2.5; if (sc.kana) share.ja = (sc.kana + sc.han) * 2; else if (sc.han) share.zh = sc.han * 2.5; ["ru", "ar", "hi"].forEach(k => { if (sc[k]) share[k] = sc[k]; });
  const hits = {}; let sum = 0;
  for (const w of s.toLowerCase().replace(/[’`]/g, "'").match(/[a-zà-ÿœç']+/g) || []) { const ls = SWI.get(w); if (!ls) continue; ls.forEach(l => (hits[l] = (hits[l] || 0) + 1 / ls.length)); sum++; }
  if (sum >= 6) for (const [l, n] of Object.entries(hits)) share[l] = (share[l] || 0) + latin * (n / sum);
  const tot = Object.values(share).reduce((a, b) => a + b, 0); if (!tot || (sum < 6 && tot < 20)) return null;
  const ranked = Object.entries(share).map(([l, n]) => [l, n / tot]).sort((a, b) => b[1] - a[1]);
  return { main: ranked[0][0], langs: ranked.filter(([, x]) => x >= 0.2).slice(0, 3).map(([l]) => l), conf: ranked[0][1] };
}
async function languageOf(t, deep = true) {
  if (t.lang && (t.lang.src !== "unknown" || !deep || t.lang.deep)) return t.lang;
  const ly = await LRCLIB.lyrics(t, deep);
  if (ly === undefined) return null;
  if (ly && ly.instrumental) return (t.lang = { main: null, langs: [], src: "instrumental" });
  const d = ly && ly.text ? detectLang(ly.text) : null;
  if (d) return (t.lang = { main: d.main, langs: d.langs, src: "lyrics" });
  const g = guessLang(t.t); return (t.lang = g ? { main: g, langs: [g], src: "title", deep } : { main: null, langs: [], src: "unknown", deep });
}

/* ---------- language hint from a title, used only when a song has no lyrics on file ---------- */
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

const API = { SETTINGS, limiter, pacer, sleep, https, getJSON, postJSON, mnorm, match, expOf, dz, Deezer, ITunes, MusicBrainz, ListenBrainz, LB, Discogs, Wikidata, ReccoBeats, LRCLIB, LANG_NAMES, detectLang, languageOf, resolve, complete, guessLang };
G.Catalog = API;
if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

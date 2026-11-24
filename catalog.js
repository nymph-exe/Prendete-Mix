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
  try { const r = await fetch(url, Object.assign({ signal: ac && ac.signal }, opt)); if (!r.ok) { const e = new Error(url.split("?")[0] + " " + r.status); e.status = r.status; e.retryAfter = +(r.headers.get("retry-after") || 0); throw e; } return await r.json(); }
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
const lrLimit = limiter(5), lrsLimit = limiter(1.2);
async function lrGet(url, lim) {
  for (let i = 0; ; i++) {
    try { return await lim(() => getJSON(url, {}, 12000)); }
    catch (e) { if (e.status === 404) return null; if (i >= 3 || !(e.status === 429 || e.status >= 500 || !e.status)) throw e; await sleep(Math.max(1200, (e.retryAfter || 0) * 1000) * (i + 1)); }
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
  es: "el los las y pero yo tú tu eres estoy quiero mi muy porque cuando también ahora aquí mucho bien voy ella él nosotros conmigo contigo otra vez bebé noche corazón hoy siempre tengo hace hacer puedo dime mami pa' perreo baila dale ya sola sin con una lo le del al ese esa esto eso así más qué cómo dónde quieres tienes sabes tus mis sus están hay fue vamos mujer calle fiesta mientras después antes nadie nunca todo",
  pt: "você voce não nao eu meu minha com uma isso é está tá mais então sem pra pro também muito sua seu ele ela nós vai vou tô gente coisa quero sou já olha beijo coração saudade amanhã hoje sempre ninguém alguém tudo agora aqui quando onde fazer tem tenho nossa vamos mim dela dele num numa essa esse nunca todo",
  fr: "je il elle nous vous les des une est et pas mais moi toi avec pour dans ce qui c'est j'ai oui ne sur au du mon ma ton ta ça comme tout rien suis veux fait plus quand bien aussi encore toujours jamais cœur nuit",
  it: "il che non sono ti mi ma per della sei io noi voi questo questa quello come cosa perché amore ancora sempre niente più già anche ciao bella cuore notte gli una di da e lo",
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

const API = { SETTINGS, limiter, sleep, https, getJSON, mnorm, match, expOf, dz, Deezer, ITunes, MusicBrainz, ListenBrainz, ReccoBeats, LRCLIB, LANG_NAMES, detectLang, languageOf, resolve, complete, guessLang };
G.Catalog = API;
if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

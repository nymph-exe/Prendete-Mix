/* Préndete Mix — recommendation engines. Both read only the current playlist's own evidence (Section 16.3),
   never another playlist's. Classic: catalog graph + editorial playlists + audio features + lyrics language.
   AI: Gemini / OpenRouter with catalog verification.
   generate() appends pending candidates through onBatch (the app commits each batch against the latest state).
   fill() returns delegated picks; the app commits them with Core.fillCommit (capacity checked at commit). */
(function (G) {
"use strict";
const Core = G.Core || require("./core.js");
const Cat = G.Catalog || require("./catalog.js");
const { Deezer, ReccoBeats, ListenBrainz, MusicBrainz } = Cat;

const NEUTRAL = new Set(["Prefer another song", "Redundant selection"]);
const MOODS = {
  Party: { d: [.65, 1], e: [.55, 1] }, Hype: { e: [.75, 1] }, Danceable: { d: [.7, 1] }, "Feel-good": { v: [.55, 1] }, Chill: { e: [0, .55] },
  Romantic: { e: [0, .7], v: [.3, .85] }, Sad: { v: [0, .4] }, Dark: { v: [0, .38] }, Sensual: { d: [.6, 1], e: [.35, .8] },
  Workout: { e: [.7, 1], bpm: [112, 200] }, Focus: { e: [0, .6], ac: [.15, 1] }
};
const ENERGY = { low: [0, .5], medium: [.4, .75], high: [.65, 1] };
const TEMPO = { slow: [0, 96], mid: [90, 125], fast: [118, 250] };
const JUNK = /\b(karaoke|tribute|8[ -]?bit|lullaby|lullabies|cover band|sing along|music box|piano version|made famous|in the style of|tabata|zumba|workout (?:mix|version|music|songs|hits)|fitness|cardio (?:mix|music)|gym (?:music|hits)|running (?:music|songs)|\d{2,3} ?bpm|non-?stop|megamix|medley|dj mix|continuous mix|mixed by|originally performed|as made famous|cover version|bossa nova version|reggae version|acoustic version)\b/i;
/* seasonal songs only when the direction asks for them */
const HOLIDAY = /\b(christmas|xmas|navidad(?:es)?|navideñ[oa]s?|holiday|santa claus|jingle bells?|noël|noel|feliz navidad|año nuevo|new year'?s eve|halloween)\b/i;
const nn = s => Core.norm(s).replace(/\s+/g, "");
const fitRange = (x, r, soft = .12) => { if (x == null || !r) return null; if (x >= r[0] && x <= r[1]) return 1; const d = x < r[0] ? r[0] - x : x - r[1]; return Math.exp(-((d / soft) ** 2)); };
const bpmOf = b => (b == null ? null : b > 165 ? b / 2 : b < 68 ? b * 2 : b);
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const primary = t => Core.norm(Core.firstArtist(t.a));
/* written rejection feedback counts like the matching preset reason (REC-004) */
const TEXT_REASONS = [[/\b(mellow|boring|slow burn|sleepy|no energy|low energy|needs? more (?:energy|punch)|punch|aburrid|suave|tranquil|apagad)/i, "Too mellow"], [/\b(too slow|slow|lent[oa])\b/i, "Too slow"],
  [/\b(too (?:hard|loud|aggressive|intense|much)|too energetic|agresiv|pesad)/i, "Too energetic"], [/\b(too fast|rapid[oa])\b/i, "Too fast"], [/\b(overplayed|overdone|heard (?:it )?too much|quemad|trillad|tiktok|viral)/i, "Overplayed"],
  [/\b(too niche|obscure|nobody knows|desconocid)/i, "Excessively niche"], [/\b(same artist|too many .* songs|repetitiv|repeat)/i, "Excessive artist repetition"]];
const reasonsOf = r => { const out = r.reason ? [r.reason] : []; if (r.text) for (const [re, k] of TEXT_REASONS) if (re.test(r.text) && !out.includes(k)) out.push(k); return out; };

/* ---------- shared eligibility (hard requirements) ---------- */
function rules(pl, never) {
  const dir = pl.direction || {}, form = dir.form || {}, ex = dir.exclude || {};
  const block = new Set([...(never || []), ...(ex.artists || [])].map(nn).filter(Boolean));
  return { dir, form, block, exSongs: (ex.songs || []).filter(Boolean), versions: !!form.versions, era: form.era && form.era[0] ? form.era : null, explicit: form.explicit || "any",
    avoidHits: !!form.avoidHits || !!form.gems, gems: !!form.gems, preferHits: !!form.preferHits, langs: form.langs || [], notLangs: form.notLangs || [],
    holiday: HOLIDAY.test([dir.text, ...(form.keywords || []), ...(form.moods || [])].join(" ")) };
}
function blocked(t, R) { return String(t.a || "").split(/;\s*/).some(a => R.block.has(nn(a))) || [...R.block].some(b => b && nn(t.t).includes("feat" + b)); }
/* language: decided from the lyrics when LRCLIB has them; instrumentals pass; unknown songs are kept but ranked lower */
function langVerdict(t, R) {
  if (!R.langs.length && !R.notLangs.length) return "ok";
  const L = t.lang; if (!L || !L.src || L.src === "unknown") return "unknown"; if (L.src === "instrumental") return "ok";
  const sure = L.src === "lyrics";
  if (R.notLangs.length && L.main && R.notLangs.includes(L.main)) return sure ? "no" : "doubt";
  if (R.langs.length && !L.langs.some(l => R.langs.includes(l))) return sure ? "no" : "doubt";
  return "ok";
}
/* an explicit BPM range is a requirement; tempo words (slow/mid/fast) only rank */
function bpmOk(t, R) { const r = R.form.bpm; if (!Array.isArray(r) || !r[0] || !t.f || t.f.none || !t.f.bpm) return true; const b = t.f.bpm; return [b, b / 2, b * 2].some(x => x >= r[0] - 6 && x <= r[1] + 6); }
function eligible(t, R, getTrack, opts = {}) {
  if (!t || !t.t) return "missing";
  if (blocked(t, R)) return "blocked";
  if (R.exSongs.some(id => { const x = getTrack(id); return id === t.id || (x && Core.sameRecording(x, t)); })) return "excluded";
  if (!R.versions && Core.versionTags(t.t).length && !opts.allowVersions) return "version";
  if (JUNK.test(t.a) || JUNK.test(t.t)) return "junk";
  if (!R.holiday && (HOLIDAY.test(t.t) || HOLIDAY.test(t.al || ""))) return "seasonal";
  if (R.explicit === "clean" && t.exp === "explicit") return "explicit";
  if (R.explicit === "explicit" && t.exp === "clean") return "clean";
  if (R.era && t.y && (t.y < R.era[0] || t.y > R.era[1])) return "era";
  if (R.avoidHits && ((t.rank || 0) > (R.gems ? 560000 : 750000) || (t.f && t.f.pop >= (R.gems ? 75 : 85)))) return "hit";
  if (langVerdict(t, R) === "no") return "language";
  if (!bpmOk(t, R)) return "tempo";
  return null;
}

/* ---------- catalog look-ups shared by both engines ---------- */
async function featuresFor(tracks, save) {
  const need = tracks.filter(t => t && t.isrc && !t.f);
  if (need.length) {
    let m = new Map(); try { m = await ReccoBeats.features(need.map(t => t.isrc)); } catch {}
    const upd = []; for (const t of need) { const f = m.get(t.isrc); t.f = f || { none: 1 }; upd.push(t); }
    if (save && upd.length) save(upd);
  }
}
async function langsFor(tracks, save, deep = false) {
  const need = tracks.filter(t => t && (!t.lang || (deep && !t.lang.deep && (t.lang.src === "unknown" || t.lang.src === "title"))));
  if (!need.length) return;
  await Promise.all(need.map(t => Cat.languageOf(t, deep).catch(() => null)));
  if (save) save(need.filter(t => t.lang));
}
const vibe = f => { if (!f || f.none) return ""; const p = [];
  if (f.e != null) p.push(f.e >= .75 ? "high energy" : f.e <= .4 ? "mellow" : ""); if (f.d != null && f.d >= .78) p.push("very danceable");
  const b = bpmOf(f.bpm); if (b) p.push(Math.round(b) + " BPM"); return p.filter(Boolean).slice(0, 2).join(", "); };

/* ---------- evidence → profile ---------- */
async function buildProfile(ctx, say) {
  const pl = ctx.latest(); if (!pl) throw new Core.OpError("GONE", "This playlist was deleted.");
  const R = rules(pl, ctx.never), get = ctx.getTrack, ev = Core.evidence(pl, get);
  const refs = (R.dir.refs || []).map(get).filter(Boolean);
  const W = new Map(); const add = (id, name, w, tag) => { if (!id) return; const c = W.get(id) || { id, name, w: 0, known: false, tags: new Set() }; c.w += w; if (name && !c.name) c.name = name; if (tag) c.tags.add(tag); W.set(id, c); };
  const names = t => String(t.a || "").split(/;\s*/);
  say && say("Reading this playlist's direction and decisions…");
  for (const t of refs) (t.aid || []).forEach((id, i) => add(id, names(t)[i], i ? 1.2 : 3, "ref"));
  for (const a of R.dir.artists || []) add(a.id, a.name, 3, "ref");
  for (const t of ev.manual) (t.aid || []).forEach((id, i) => add(id, names(t)[i], i ? .4 : 1, "pl"));
  for (const t of ev.mandatory) (t.aid || []).slice(0, 1).forEach(id => add(id, names(t)[0], 1, "pl"));
  for (const t of ev.delegated) (t.aid || []).slice(0, 1).forEach(id => add(id, names(t)[0], .3, "pl"));
  for (const c of W.values()) c.known = c.tags.has("pl");
  // rejection patterns (QUAL-007/008): an artist is avoided only after 2+ musical rejections outweighing approvals
  const rejBy = new Map(), apBy = new Map(), reasons = {};
  for (const t of ev.manual) apBy.set(primary(t), (apBy.get(primary(t)) || 0) + 1);
  for (const r of ev.rejected) { const rs = reasonsOf(r); rs.forEach(k => (reasons[k] = (reasons[k] || 0) + 1)); r.reasons = rs; if (rs.length && rs.every(k => NEUTRAL.has(k))) continue; rejBy.set(primary(r.t), (rejBy.get(primary(r.t)) || 0) + 1); }
  const avoid = new Set([...rejBy].filter(([a, n]) => n >= 2 && n > (apBy.get(a) || 0)).map(([a]) => a));
  // seeds from the guided form: genre charts and Deezer's editorial playlists for each genre/mood
  const pool = []; let fails = 0; const f = R.form; const genres = (f.genres || []).filter(g => g.id); const moods = f.moods || [];
  for (const g of genres.slice(0, 4)) {
    if (ctx.stopped && ctx.stopped()) break;
    try { say && say(`Looking at ${g.name}…`); const tr = await Deezer.chart(g.id, 50);
      tr.forEach(t => { (t.aid || []).slice(0, 1).forEach(id => add(id, names(t)[0], .5, "genre")); pool.push(Object.assign(t, { _why: `On the ${g.name} charts` })); }); } catch { fails++; }
  }
  const qs = []; const gn = (f.genres || []).map(g => g.name.replace(/\/.*$/, "")); const kw = (f.keywords || []).slice(0, 3);
  kw.forEach(k => qs.push(moods.length ? `${k} ${moods[0]}` : k));
  if (moods.length && gn.length) gn.slice(0, 2).forEach(g => qs.push(`${g} ${moods[0]}`)); else if (moods.length) moods.slice(0, 2).forEach(m => qs.push(m)); else gn.slice(0, 2).forEach(g => qs.push(g));
  if (R.langs.length === 1 && qs.length) qs[0] = qs[0] + " " + ({ es: "latino", pt: "brasil", fr: "français", it: "italiano", de: "deutsch", ko: "k-pop", ja: "j-pop" }[R.langs[0]] || "");
  for (const q of [...new Set(qs)].slice(0, 3)) {
    if (ctx.stopped && ctx.stopped()) break;
    try { say && say(`Browsing “${q.trim()}” playlists…`); const pls = (await Deezer.playlists(q.trim(), 6)).filter(p => p.n >= 15).sort((a, b) => b.editor - a.editor).slice(0, 2);
      for (const p of pls) { const tr = await Deezer.playlistTracks(p.id, 100); tr.forEach(t => { (t.aid || []).slice(0, 1).forEach(id => add(id, names(t)[0], .25, "list")); pool.push(Object.assign(t, { _why: `From Deezer's “${p.title}” playlist` })); }); }
    } catch { fails++; }
  }
  for (const c of [...W.values()]) if (avoid.has(Core.norm(c.name)) || blocked({ a: c.name || "", t: "" }, R)) W.delete(c.id);
  const seenPool = new Set(); for (let i = pool.length - 1; i >= 0; i--) { const t = pool[i]; if (seenPool.has(t.id) || avoid.has(primary(t)) || blocked(t, R)) pool.splice(i, 1); else seenPool.add(t.id); }
  // audio-feature profile from manual approvals and references (delegated picks excluded: QUAL-012)
  say && say("Measuring energy, tempo and mood…");
  const sample = ev.manual.concat(refs).filter(t => t.isrc); const pick = sample.length > 120 ? sample.sort(() => Math.random() - .5).slice(0, 120) : sample;
  const reasoned = ev.rejected.filter(r => r.reasons.some(k => !NEUTRAL.has(k))).map(r => r.t);
  await featuresFor(pick.concat(reasoned), ctx.saveTracks);
  const fl = pick.map(t => t.f).filter(x => x && !x.none);
  const prof = {}; if (fl.length >= 5) for (const k of ["e", "d", "v"]) { const xs = fl.map(x => x[k]).filter(x => x != null); const m = avg(xs); const sd = Math.sqrt(avg(xs.map(x => (x - m) ** 2)) || 0); prof[k] = [m, Math.max(sd, .1)]; }
  const fx = (list, k) => list.map(r => r.t.f && !r.t.f.none ? (k === "bpm" ? bpmOf(r.t.f.bpm) : r.t.f[k]) : null).filter(x => x != null);
  const byReason = ks => ev.rejected.filter(r => r.reasons.some(k => ks.includes(k)));
  const pat = {
    mellow: fx(byReason(["Too mellow", "Insufficient momentum"]), "e"), slow: fx(byReason(["Too slow"]), "bpm"),
    hot: fx(byReason(["Too energetic"]), "e"), fast: fx(byReason(["Too fast"]), "bpm"),
    overplayed: reasons["Overplayed"] || 0, niche: reasons["Excessively niche"] || 0,
    repetition: (reasons["Excessive artist repetition"] || 0) > 0, similar: (reasons["Too similar to existing songs"] || 0) + (reasons["Redundant selection"] || 0)
  };
  const tgt = {};
  if (f.energy && ENERGY[f.energy]) tgt.e = ENERGY[f.energy];
  if (Array.isArray(f.bpm) && f.bpm[0]) tgt.bpm = f.bpm; else if (f.tempo && TEMPO[f.tempo]) tgt.bpm = TEMPO[f.tempo];
  const moodT = moods.map(m => MOODS[m]).filter(Boolean);
  return { fails, pl, R, ev, refs, W, avoid, pool: pool.sort(() => Math.random() - .5).slice(0, 400), prof, pat, tgt, moodT, epoch: pl.epoch };
}
function fitOf(t, P) {
  const f = t.f; if (!f || f.none) return { fit: .5, known: false };
  const parts = [];
  if (P.tgt.e) parts.push(fitRange(f.e, P.tgt.e));
  if (P.tgt.bpm) { const b = bpmOf(f.bpm); parts.push(Math.max(fitRange(b, P.tgt.bpm, 8) || 0, P.tgt.bpm[1] <= 100 && f.e != null && f.e < .6 && b ? fitRange(b / 2, P.tgt.bpm, 8) : 0)); }
  const soft = xs => .4 * avg(xs) + .6 * Math.min(...xs);
  for (const m of P.moodT) { const xs = Object.entries(m).map(([k, r]) => fitRange(k === "bpm" ? bpmOf(f.bpm) : f[k], r, k === "bpm" ? 10 : .12)).filter(x => x != null); if (xs.length) parts.push(soft(xs)); }
  const pf = Object.entries(P.prof).map(([k, [m, sd]]) => f[k] == null ? null : Math.exp(-(((f[k] - m) / (sd * 1.25)) ** 2) / 2)).filter(x => x != null);
  const pp = parts.filter(x => x != null); const a = pp.length ? soft(pp) : null, b = pf.length ? soft(pf) : null;
  const fit = a != null && b != null ? soft([a, b]) : a != null ? a : b != null ? b : .5;
  return { fit, known: a != null || b != null, asked: a != null };
}
/* what the user's own rejections rule out: with 2+ "too mellow" rejections, nothing at or below their typical energy, and so on */
const median = a => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
function learnedOut(t, P) {
  const f = t.f && !t.f.none ? t.f : null; if (!f) return false; const b = bpmOf(f.bpm);
  if (P.pat.mellow.length >= 2 && f.e != null && f.e <= median(P.pat.mellow)) return true;
  if (P.pat.hot.length >= 2 && f.e != null && f.e >= median(P.pat.hot)) return true;
  if (P.pat.slow.length >= 2 && b && b <= median(P.pat.slow)) return true;
  if (P.pat.fast.length >= 2 && b && b >= median(P.pat.fast)) return true;
  return false;
}
function penalty(t, P) {
  let p = 0; const f = t.f && !t.f.none ? t.f : null;
  if (f) {
    if (P.pat.mellow.length && f.e != null) p += .35 * Math.min(3, P.pat.mellow.filter(x => x >= f.e - .02).length);
    if (P.pat.hot.length && f.e != null) p += .35 * Math.min(3, P.pat.hot.filter(x => x <= f.e + .02).length);
    const b = bpmOf(f.bpm);
    if (P.pat.slow.length && b) p += .3 * Math.min(3, P.pat.slow.filter(x => x >= b - 3).length);
    if (P.pat.fast.length && b) p += .3 * Math.min(3, P.pat.fast.filter(x => x <= b + 3).length);
  }
  const pop = f && f.pop != null ? f.pop : null;
  if (P.pat.overplayed && ((pop != null && pop >= 80) || (t.rank || 0) >= 800000)) p += P.pat.overplayed >= 2 ? .8 : .4;
  if (P.pat.niche >= 2 && (t.rank || 0) < 60000 && (pop == null || pop < 35)) p += .4;
  const lv = langVerdict(t, P.R); if (lv === "doubt") p += .8; else if (lv === "unknown") p += .25;
  if (P.R.preferHits) p -= .4 * Math.min(1, (t.rank || 0) / 800000) + (pop != null && pop >= 70 ? .2 : 0);
  return p;
}

/* ---------- style: the genres a playlist asks for, in MusicBrainz genre names, matched against each artist's
   community tags (ListenBrainz / MusicBrainz). This is what keeps Classic from drifting off-genre. ---------- */
const GL = G.GENRES || (typeof require !== "undefined" ? (() => { try { return require("./genres.js"); } catch { return []; } })() : []);
const tk = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
const skey = s => tk(s).replace(/ /g, "");
const stoks = s => tk(s).replace(/hip hop/g, "hiphop").split(" ").filter(Boolean);
const GMAP = new Map(GL.map(g => [skey(g), g]));
const FAMILIES = [
  ["lo-fi hip hop", "lofi", "lo-fi beats", "chillhop", "jazz hop", "jazzhop", "chill beats", "study beats", "instrumental hip hop", "lofi hip hop", "beats", "chillwave"],
  ["reggaeton", "trap latino", "latin trap", "urbano latino", "latin urban", "perreo", "dembow", "neoperreo", "latin hip hop", "reguetón", "reggaetón", "música urbana"],
  ["corrido", "corrido tumbado", "corridos tumbados", "corrido bélico", "corridos bélicos", "sierreño", "regional mexicano", "regional mexican", "música mexicana", "norteño", "banda", "norteño-sax", "mexican"],
  ["ranchera", "ranchero", "mariachi", "bolero ranchero", "huapango"],
  ["afrobeats", "afropop", "afro-pop", "afrobeat", "naija", "afro fusion", "afro-fusion", "afroswing", "alté", "amapiano", "afro house", "gqom", "nigerian", "south african", "bongo flava", "afro r&b", "afro-soul", "afro-pop"],
  ["k-pop", "korean", "k-r&b", "korean pop", "k-hip hop", "korean hip hop", "boy group", "girl group", "korean idol", "k-rap"],
  ["uk drill", "drill", "grime", "uk hip hop", "british hip hop", "uk rap", "road rap", "brooklyn drill", "afroswing", "uk garage"],
  ["synth-pop", "synthpop", "new wave", "new romantic", "electropop", "post-punk", "darkwave", "coldwave", "italo disco", "sophisti-pop", "minimal wave", "electronic", "dance-pop"],
  ["techno", "dark techno", "industrial techno", "hard techno", "minimal techno", "acid techno", "peak time techno", "detroit techno", "hypnotic techno", "ebm", "tech house", "dub techno", "electro"],
  ["salsa", "salsa romántica", "salsa dura", "timba", "son cubano", "bachata", "merengue", "tropical", "cumbia", "boogaloo", "latin", "música tropical"],
  ["r&b", "contemporary r&b", "rnb", "neo soul", "new jack swing", "quiet storm", "soul", "alternative r&b", "rhythm and blues", "urban contemporary", "hip hop soul"],
  ["indie folk", "folk", "singer-songwriter", "chamber folk", "contemporary folk", "folk pop", "americana", "sadcore", "slowcore", "indie", "chamber pop", "freak folk", "indie rock", "folk rock", "emo"],
  ["classic rock", "hard rock", "blues rock", "rock", "album rock", "arena rock", "southern rock", "progressive rock", "glam rock", "heartland rock", "psychedelic rock", "boogie rock", "rock and roll", "folk rock"],
  ["hip hop", "rap", "trap", "pop rap", "gangsta rap", "east coast hip hop", "west coast hip hop", "southern hip hop", "conscious hip hop", "drill"],
  ["house", "deep house", "tech house", "afro house", "progressive house", "electro house", "dance", "edm", "uk garage"],
  ["dancehall", "reggae", "soca", "ragga"], ["shoegaze", "dream pop", "noise pop", "ethereal wave"], ["phonk", "drift phonk", "brazilian phonk", "memphis rap"],
  ["ambient", "downtempo", "chillout", "new age", "neoclassical", "modern classical", "piano"]
].map(f => new Set(f.map(skey)));
const GENERIC = new Set(["pop", "rock", "hiphop", "rap", "electronic", "dance", "indie", "folk", "soul", "latin", "jazz", "house", "music", "alternative"]);
const JUNK_TAG = /^(seen live|male vocalists?|female vocalists?|vocalists?|producers?|composers?|rappers?|singers?|songwriters?|dj|favou?rites?|my music|spotify|awesome|love|beautiful|\d{2,4}s|\d{4}|vampire|meme)$/;
const DZ_TAGS = { "Rap/Hip Hop": ["hip hop", "rap", "trap"], Pop: ["pop"], "R&B": ["r&b", "contemporary r&b", "soul"], Dance: ["dance", "house", "edm"], Electro: ["electronic", "techno", "house"],
  "Latin Music": ["latin", "reggaeton", "latin pop"], Alternative: ["alternative rock", "indie"], Rock: ["rock"], Folk: ["folk"], "African Music": ["afrobeats", "afropop", "amapiano"],
  "Asian Music": ["k-pop", "j-pop", "c-pop"], "Traditional Mexicano": ["regional mexicano", "corrido", "norteño", "banda"], Reggae: ["reggae", "dancehall"], Jazz: ["jazz"], Classical: ["classical"],
  "Soul & Funk": ["soul", "funk"], Metal: ["metal"], Country: ["country"], Blues: ["blues"], "Brazilian Music": ["mpb", "funk carioca", "sertanejo", "bossa nova"], "Films/Games": ["soundtrack"] };
const SIMC = new Map();
function tagSim(p, a) {
  const pk = skey(p), ak = skey(a); if (!pk || !ak) return 0; if (pk === ak) return 1;
  const ck = pk + "|" + ak; if (SIMC.has(ck)) return SIMC.get(ck);
  const pt = stoks(p), at = stoks(a); let s = 0;
  if (pt.length && pt.every(x => at.includes(x))) s = .9; /* the artist's tag is a narrower kind of what was asked ("drill" → "uk drill") */
  else if (at.length && at.every(x => pt.includes(x))) s = at.length === 1 && GENERIC.has(at[0]) ? .3 : .5; /* broader */
  if (FAMILIES.some(f => f.has(pk) && f.has(ak))) s = Math.max(s, .65);
  SIMC.set(ck, s); return s;
}
const vecOf = tags => { const e = Object.entries(tags || {}).filter(([t]) => !JUNK_TAG.test(t)); if (!e.length) return null; const mx = Math.max(...e.map(x => x[1]));
  return e.map(([t, c]) => [t, Math.sqrt(c / mx)]).sort((a, b) => b[1] - a[1]).slice(0, 12); };
const bestIn = (p, V) => { let b = 0; for (const [a, w] of V) { const s = tagSim(p, a) * w; if (s > b) b = s; } return b; };
/* the styles named in the direction, as MusicBrainz genre names */
function wantStyles(f) {
  const out = []; const kw = (f.keywords || []).filter(Boolean); const indie = kw.some(k => /rock|indie|pop/.test(tk(k)));
  for (const k of kw) { const kk = skey(k);
    if (/^(lofi|lofibeats|lofihiphop|chillhop|jazzhop)$/.test(kk) && !indie) { out.push("lo-fi hip hop", "chillhop", "jazz hop"); continue; }
    const sing = tk(k).split(" ").map(w => (w.length > 4 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w)).join("");
    const g = GMAP.get(kk) || GMAP.get(sing) || GMAP.get(kk.replace(/s$/, "")) || GMAP.get(kk.replace(/es$/, ""));
    if (g) out.push(g); else if (FAMILIES.some(fm => fm.has(kk))) out.push(k); }
  return [...new Set(out)];
}
/* Deezer artist id → {v: [[tag, weight]], area, type, mb} ; looked up in batches through a recording of theirs */
const ART = new Map();
/* the tag look-ups are kept in this browser for a month so later runs skip them */
const ART_KEY = "pm.artstyle.v1", ART_TTL = 30 * 864e5; let artLoaded = false, artTimer = null;
function artLoad() { if (artLoaded) return; artLoaded = true; try { const ls = G.localStorage; const j = ls && JSON.parse(ls.getItem(ART_KEY) || "null"); const now = Date.now();
  if (j) for (const [k, v] of j) if (v && now - (v.at || 0) < ART_TTL && !ART.has(+k || k)) ART.set(+k || k, v); } catch {} }
function artSave() { if (!G.localStorage || artTimer) return; artTimer = setTimeout(() => { artTimer = null; try { const all = [...ART].slice(-3000); G.localStorage.setItem(ART_KEY, JSON.stringify(all)); } catch {} }, 1500); }
const nameOk = (a, b) => { const x = Core.norm(a).replace(/\s+/g, ""), y = Core.norm(b).replace(/\s+/g, ""); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
async function stylesFor(tracks) {
  const need = [], ids = new Set();
  artLoad();
  for (const t of tracks) { const id = t && (t.aid || [])[0]; if (!id || !t.t || ART.has(id) || ids.has(id)) continue; ids.add(id); need.push(t); }
  if (!need.length) return;
  const tmp = need.map((t, i) => ({ id: "s" + i, t: t.t, a: Core.firstArtist(t.a), mbid: t.mbid || null, ambids: t.ambids }));
  let m; try { m = await Cat.LB.lookup(tmp); } catch { return; }
  const am = new Map(); tmp.forEach((x, i) => { const v = m.get(x.id); if (v && v.artists && v.artists[0]) am.set(need[i].aid[0], v.artists[0]); });
  /* songs ListenBrainz doesn't know yet (often brand-new ones): try the artist's best-known songs instead */
  const miss = need.filter(t => !am.has(t.aid[0])).slice(0, 10);
  if (miss.length) {
    const alt = []; await Promise.all(miss.map(async t => { try { (await Deezer.top(t.aid[0], 2)).filter(x => (x.aid || [])[0] === t.aid[0] && x.t !== t.t).slice(0, 2).forEach(x => alt.push({ id: "m" + alt.length, t: x.t, a: Core.firstArtist(x.a), aid: x.aid })); } catch {} }));
    if (alt.length) { let m2 = new Map(); try { m2 = await Cat.LB.lookup(alt); } catch {} alt.forEach(x => { const v = m2.get(x.id); if (v && v.artists && v.artists[0] && !am.has(x.aid[0])) am.set(x.aid[0], v.artists[0]); }); }
  }
  if (!am.size) return; /* nothing came back at all: likely offline; try again next time */
  let info = new Map(); if (am.size) { try { info = await Cat.LB.artists([...am.values()]); } catch { return; } }
  for (const t of need) { const id = t.aid[0], mb = am.get(id), a = mb && info.get(mb);
    ART.set(id, a && nameOk(a.name, Core.firstArtist(t.a)) ? { v: vecOf(a.tags), area: a.area, type: a.type, mb, at: Date.now() } : { v: null, at: Date.now() }); }
  artSave();
}
async function styleProfile(P, ctx, say) {
  const f = P.R.form; const want = wantStyles(f);
  const broad = [...new Set((f.genres || []).flatMap(g => DZ_TAGS[g.name] || []))];
  const notS = [...new Set((f.notStyles || []).map(x => GMAP.get(skey(x)) || x).filter(Boolean))];
  const S = { want, broad, notS, taste: [], ref: .3, strict: want.length > 0 };
  // taste: the tags of reference artists and of artists the user approved here (delegated picks excluded: QUAL-012)
  const seeds = []; const seenA = new Set(); const push = (t, w) => { const id = (t.aid || [])[0]; if (!id || seenA.has(id)) return; seenA.add(id); seeds.push([t, w]); };
  P.refs.forEach(t => push(t, 2)); P.ev.manual.slice().sort(() => Math.random() - .5).forEach(t => push(t, 1)); P.ev.mandatory.forEach(t => push(t, 1));
  const dirA = (P.R.dir.artists || []).filter(a => a.id && !seenA.has(a.id)).slice(0, 6);
  const tops = await Promise.all(dirA.map(a => Deezer.top(a.id, 1).then(r => r[0]).catch(() => null)));
  tops.forEach(t => t && push(t, 2));
  const sample = seeds.slice(0, 50);
  const poolS = P.pool.slice(0, 160);
  if (sample.length || want.length || broad.length) { say && say("Reading genre tags…"); await stylesFor(sample.map(x => x[0]).concat(poolS)); }
  const T = new Map(); let tw = 0;
  for (const [t, w] of sample) { const a = ART.get(t.aid[0]); if (!a || !a.v) continue; tw += w; for (const [tag, x] of a.v.slice(0, 6)) T.set(tag, (T.get(tag) || 0) + w * x); }
  if (tw) { const top = [...T].sort((a, b) => b[1] - a[1]).slice(0, 12); const sum = top.reduce((s, x) => s + x[1], 0); S.taste = top.map(([t, w]) => [t, w / sum]);
    const self = sample.map(([t]) => ART.get(t.aid[0])).filter(a => a && a.v).map(a => S.taste.reduce((s, [t, w]) => s + w * bestIn(t, a.v), 0));
    S.ref = Math.max(.15, avg(self) || .3); S.tasteN = self.length; }
  S.info = !!(want.length || broad.length || S.taste.length);
  /* several named styles ("afrobeats and amapiano"): keep a mix of them */
  S.balance = want.length >= 2 && (f.keywords || []).length >= 2 && !want.includes("lo-fi hip hop");
  for (const c of P.W.values()) c.sf = styleFit(c.id, S);
  return S;
}
/* → {fit 0..1 or null, known, wf: fit to the named styles, no: hits a style the user ruled out} */
function styleFit(id, S) {
  const a = ART.get(id); if (!a || !a.v || !S.info) return { fit: null, known: false };
  const V = a.v;
  if (S.notS.length && V.slice(0, 3).some(([t, w]) => w >= .6 && S.notS.some(n => tagSim(n, t) >= .9))) return { fit: 0, known: true, wf: 0, no: true };
  const wf = S.want.length ? Math.max(...S.want.map(p => bestIn(p, V))) : null;
  const bf = S.broad.length ? Math.max(...S.broad.map(p => bestIn(p, V))) : null;
  const tf = S.taste.length ? Math.min(1, S.taste.reduce((s, [t, w]) => s + w * bestIn(t, V), 0) / S.ref) : null;
  const tw = S.tasteN >= 3 ? .4 : .25;
  const fit = wf != null ? (tf != null ? (1 - tw) * wf + tw * tf : wf) : bf != null && tf != null ? .4 * bf + .6 * tf : bf != null ? bf : tf;
  return { fit, known: true, wf, top: V[0][0], n: V.length };
}
/* hard style gate: off-genre artists are skipped; artists with no tags pass only when they came in through a source we trust */
function styleGate(sf, S, trusted) {
  if (!S.info) return true;
  if (sf.known) { if (sf.no) return false; if (S.strict) return sf.wf >= .45; return !(sf.fit < .1 && sf.n >= 3); }
  return S.strict ? !!trusted : true;
}
const styleScore = (sf, S) => (!S.info ? .5 : sf.known ? sf.fit : S.strict ? .4 : .5);

/* ---------- Classic engine ---------- */
const Classic = {
  id: "classic", label: "Classic",
  async generate(ctx, opt) {
    const say = opt.onProgress || (() => {}), stop = () => opt.stopped && opt.stopped();
    const P = await buildProfile(Object.assign({ stopped: opt.stopped }, ctx), say);
    const S = await styleProfile(P, ctx, say);
    if (!P.W.size && !P.pool.length && !S.want.length) {
      if (P.fails) throw new Core.OpError("OFFLINE", "Couldn't reach Deezer to look for songs. Check your connection and try again. Nothing changed.");
      throw new Core.OpError("NO_SEEDS", "Add a genre, style, mood, artist or song to this playlist's direction (or approve a few songs) so Classic has a starting point.");
    }
    const target = opt.target; let found = 0, checked = 0, fails = 0;
    const seen = new Set();
    // a playlist found by searching the style itself ("corridos tumbados", "chill lofi") is trusted for artists with no tags
    const kws = [...(P.R.form.keywords || []), ...S.want].map(k => skey(k).replace(/e?s$/, "")).filter(k => k.length >= 3);
    const titleTrust = w => !!w && /playlist/.test(w) && kws.some(k => skey(w).includes(k));
    for (const t of P.pool) if (t._trust == null) t._trust = titleTrust(t._why);
    for (const c of P.W.values()) c.trust = c.tags.has("ref") || c.tags.has("pl") || P.pool.some(t => t._trust && (t.aid || [])[0] === c.id);
    const seedSF = s => (s.sf && s.sf.known ? s.sf.fit : s.trust ? .55 : .3);
    const pos = [...P.W.values()].filter(c => c.w > 0 && styleGate(c.sf || {}, S, c.trust))
      .map(c => Object.assign(c, { ws: c.w * (S.info ? .15 + styleScore(c.sf || {}, S) : 1) })).sort((a, b) => b.ws - a.ws);
    const seeds = []; const sp = pos.slice(0, 60);
    while (seeds.length < 14 && sp.length) { const tot = sp.reduce((s, c) => s + c.ws, 0); let r = Math.random() * tot, i = 0; for (; i < sp.length; i++) { r -= sp[i].ws; if (r <= 0) break; } seeds.push(sp.splice(Math.min(i, sp.length - 1), 1)[0]); }
    const base = Math.max(1, ...pos.slice(0, 5).map(c => c.ws));
    const cand = new Map();
    /* "hidden gems": artists with huge followings count for less (Deezer fans) */
    const gem = fans => (!fans || !P.R.avoidHits ? 1 : P.R.gems ? (fans > 400000 ? 0 : 1 / (1 + fans / 60000)) : 1 / (1 + fans / 1500000) ** .6);
    const addC = (id, name, score, from, via, sfrom, song, fans) => { if (!id || !name || P.avoid.has(Core.norm(name)) || blocked({ a: name, t: "" }, P.R)) return;
      if (gem(fans) === 0) return; const c = cand.get(id) || { id, name, score: 0, from: new Set(), via, seedFit: 0, fans }; c.score += score * gem(fans); if (from) c.from.add(from); if (sfrom != null) c.seedFit = Math.max(c.seedFit, sfrom); if (song && !c.song) c.song = song; cand.set(id, c); };
    const firstName = s => String(s || "").split(/\s+(?:&|feat\.?|ft\.?|x|×|with)\s+|,\s*/i)[0].trim();
    say("Exploring artists near your picks…");
    const relJob = Promise.all(seeds.map(async s => { if (stop()) return; try { (await Deezer.related(s.id, 20)).forEach((a, rank) => addC(a.id, a.name, s.ws / (1 + rank * .12), s.name, "related", seedSF(s), null, a.fans)); } catch { fails++; } }));
    // listeners' habits (ListenBrainz): artists played alongside the seeds, and songs played alongside the seed songs
    const lbJob = Promise.all(seeds.slice(0, 4).map(async s => { if (stop()) return;
      const mbid = (ART.get(s.id) || {}).mb || await MusicBrainz.artistMbid(s.name).catch(() => null); if (!mbid) return;
      const sim = await ListenBrainz.similar(mbid, 12).catch(() => []); const max = Math.max(1, ...sim.map(x => x.score));
      await Promise.all(sim.map(async x => { if (stop() || P.avoid.has(Core.norm(x.name))) return; try { const a = await Deezer.artistByName(x.name); if (a) addC(a.id, a.name, s.ws * .8 * (x.score / max), s.name, "lb", seedSF(s), null, a.fans); } catch {} }));
    })).catch(() => {});
    const recJob = (async () => {
      const songs = [...P.refs, ...P.ev.manual.slice().sort(() => Math.random() - .5)].slice(0, 6); if (!songs.length || stop()) return;
      const m = await Cat.LB.lookup(songs); const agg = new Map();
      await Promise.all(songs.map(async t => { const v = m.get(t.id); if (!v) return; const sim = await Cat.LB.similar(v.rec, Cat.LB.ALG[1]);
        sim.slice(0, 30).forEach((x, i) => { const n = firstName(x.a); if (!n || nameOk(n, Core.firstArtist(t.a))) return; const g = agg.get(n) || { n, s: 0, from: t }; g.s += 1 / (1 + i * .08); agg.set(n, g); }); }));
      const top = [...agg.values()].sort((a, b) => b.s - a.s).slice(0, 14);
      await Promise.all(top.map(async g => { if (stop()) return; try { const a = await Deezer.artistByName(g.n, 300); if (a) addC(a.id, a.name, base * .5 * g.s / top[0].s, Core.firstArtist(g.from.a), "lbrec", .45, g.from.t, a.fans); } catch {} }));
    })().catch(() => {});
    // the style itself: songs carrying the requested genre tag on ListenBrainz → their artists (a deep-cuts window when hits are unwanted)
    const tagJob = (async () => {
      if (!S.want.length || stop()) return; say(`Looking up ${S.want.slice(0, 2).join(" and ")} artists…`);
      const pop = P.R.avoidHits ? [0, 55] : P.R.preferHits ? [60, 100] : [15, 100]; const tags = S.want.filter(t => t !== "chillhop" && t !== "jazz hop").slice(0, 3);
      const res = await Promise.all(tags.map(tg => Cat.LB.byTag([tg], { popBegin: pop[0], popEnd: pop[1], count: 60 })));
      const meta = await Cat.LB.meta([...new Set(res.flat().map(x => x.rec))].slice(0, 150)); const cnt = new Map();
      for (const v of meta.values()) { if (!v.a || (P.R.era && v.y && (v.y < P.R.era[0] - 1 || v.y > P.R.era[1] + 1))) continue; const n = firstName(v.a); if (n) cnt.set(n, (cnt.get(n) || 0) + 1); }
      const top = [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 16); const mx = top.length ? top[0][1] : 1;
      await Promise.all(top.map(async ([n, k]) => { if (stop()) return; try { const a = await Deezer.artistByName(n, 300); if (a) addC(a.id, a.name, base * (.45 + .55 * k / mx), tags[0], "tag", .6, null, a.fans); } catch {} }));
    })().catch(() => {});
    const radio = [];
    const own = pos.filter(c => c.tags.has("ref") || c.tags.has("pl"));
    const radioJob = Promise.all((own.length ? own : pos).slice(0, 3).map(async s => { if (stop()) return; try { const tr = await Deezer.radio(s.id, 25); tr.forEach(t => { t._why = `On ${s.name}'s Deezer radio`; t._trust = seedSF(s) >= .5; }); radio.push(...tr); } catch {} }));
    await Promise.all([relJob, lbJob, recJob, tagJob, radioJob]);
    if (P.R.gems && !stop()) { /* lesser-known artists cluster together: one more hop from the smallest in-style names */
      const small = [...cand.values()].filter(c => c.fans && c.fans < 150000 && c.via !== "lbrec" && styleGate(styleFit(c.id, S), S, true)).sort((a, b) => b.score - a.score).slice(0, 10);
      await Promise.all(small.map(async s => { try { (await Deezer.related(s.id, 20)).forEach((a, rank) => addC(a.id, a.name, s.score * .8 / (1 + rank * .12), s.name, "related", Math.max(.5, s.seedFit), null, a.fans)); } catch {} })); }
    for (const c of pos) if (c.tags.has("ref") && !c.known) addC(c.id, c.name, Math.max(c.w, base) * 1.2, null, "ref", 1);
    const pool = []; const pseen = new Set(); for (const t of radio.concat(P.pool)) { if (pseen.has(t.id) || P.avoid.has(primary(t)) || blocked(t, P.R)) continue; pseen.add(t.id); pool.push(t); }
    const mixNew = P.pat.similar >= 2 ? .9 : .75;
    const fresh = [...cand.values()].filter(c => !P.W.has(c.id) || !P.W.get(c.id).known).map(c => Object.assign(c, { r: c.score * (1 + .25 * (c.from.size - 1)) * (.7 + .6 * Math.random()) })).sort((a, b) => b.r - a.r);
    const known = pos.filter(c => c.known).map(c => ({ id: c.id, name: c.name, score: c.w * .5, from: new Set(), via: "known", seedFit: 1 })).sort(() => Math.random() - .5);
    const order = []; let fi = 0, ki = 0;
    while (order.length < 140 && (fi < fresh.length || ki < known.length)) { if ((Math.random() < mixNew && fi < fresh.length) || ki >= known.length) order.push(fresh[fi++]); else order.push(known[ki++]); }
    const rpool = radio.length ? pool.slice(0, radio.length) : []; const opool = pool.slice(rpool.length).sort(() => Math.random() - .5);
    const pg = []; for (let i = 0; i < rpool.length; i += 12) pg.push({ pool: true, tracks: rpool.slice(i, i + 12) }); for (let i = 0; i < Math.min(opool.length, 240); i += 12) pg.push({ pool: true, tracks: opool.slice(i, i + 12) });
    pg.forEach((g, i) => order.splice(Math.min(order.length, i * 3 + (i ? 1 : 0)), 0, g));
    const maxScore = Math.max(1, ...fresh.map(c => c.score), ...known.map(c => c.score));
    const trustedC = c => ["ref", "known", "tag"].includes(c.via) || c.seedFit >= .5 || (c.from.size >= 2 && c.seedFit >= .3);
    // per-artist counts in this playlist (approved + pending) to avoid narrow loops (QUAL-006)
    const latest = ctx.latest(); const inPl = new Map();
    for (const k in latest.rels) { const r = latest.rels[k]; if (r.state === "REJECTED") continue; const t = ctx.getTrack(k); if (t) inPl.set(primary(t), (inPl.get(primary(t)) || 0) + 1); }
    const plCap = P.pat.repetition ? 2 : 4, capNew = P.pat.repetition ? 1 : 2, capKnown = P.pat.repetition ? 0 : 1, capRef = P.pat.repetition ? 1 : 4;
    const refIds = new Set(pos.filter(c => c.tags.has("ref")).map(c => c.id)); const isRef = t => refIds.has((t.aid || [])[0]);
    const capOf = t => (isRef(t) ? capRef : capNew);
    const needLang = P.R.langs.length || P.R.notLangs.length; const SW = S.strict ? 1.4 : S.info ? .8 : 0;
    const WC = []; const wantIdx = t => { const a = ART.get((t.aid || [])[0]); if (!a || !a.v || !S.balance) return -1; let bi = -1, bv = .5; S.want.forEach((p, i) => { const v = bestIn(p, a.v); if (v > bv + .05) { bv = v; bi = i; } }); return bi; };
    let buf = [];
    const flush = async (last) => {
      if (!buf.length) return; const b = buf; buf = [];
      say(`Checking energy, mood${needLang ? " and language" : ""}… ${found}/${target} found`);
      /* languages are only waited for when the direction has language rules; otherwise they fill in afterwards */
      const lj = langsFor(b.map(x => x.t), ctx.saveTracks, !!needLang).catch(() => {});
      await Promise.all([featuresFor(b.map(x => x.t), ctx.saveTracks), needLang ? lj : null]);
      const sc = b.filter(x => !eligible(x.t, P.R, ctx.getTrack)).map(x => { const { fit, known, asked } = fitOf(x.t, P); const pen = penalty(x.t, P);
        const wi = wantIdx(x.t); const mix = S.balance && wi >= 0 && (WC[wi] || 0) < (found + 1) / S.want.length ? .35 : 0;
        /* unless hits are unwanted, a scene's well-known songs are the safer picks */
        const hot = P.R.avoidHits ? .6 * Math.max(0, Math.min(1, ((x.t.rank || 0) - (P.R.gems ? 250000 : 450000)) / 400000)) : P.R.preferHits ? 0 : -.25 * Math.min(1, (x.t.rank || 0) / 700000);
        return Object.assign(x, { fit, wi, s: .7 * (x.as / maxScore) + 1.1 * fit + SW * styleScore(x.sf || {}, S) + .25 * Math.random() - pen - hot + mix, ok: !(known && fit < (asked ? .45 : .35)) && pen < 1.2 && !(P.R.avoidHits && x.t.f && x.t.f.pop >= 85) && !learnedOut(x.t, P) }); });
      const okd = sc.filter(x => x.ok).sort((a, b) => b.s - a.s); const per = new Map(); const keep = [];
      const room = Math.min(target - found, last ? okd.length : Math.max(1, Math.ceil(okd.length * .7)));
      for (const x of okd) { if (keep.length >= room) break; const a = primary(x.t); if ((per.get(a) || 0) >= capOf(x.t) || (inPl.get(a) || 0) + (per.get(a) || 0) >= plCap) continue; per.set(a, (per.get(a) || 0) + 1); keep.push(x); }
      if (!keep.length) return;
      const r = await opt.onBatch(keep.map(x => { const v = vibe(x.t.f); return { t: x.t, why: x.why + (v ? `, ${v}` : "") }; }));
      found += r.added; keep.forEach(x => { if (r.addedIds && r.addedIds.includes(x.t.id)) { inPl.set(primary(x.t), (inPl.get(primary(x.t)) || 0) + 1); if (x.wi >= 0) WC[x.wi] = (WC[x.wi] || 0) + 1; } });
    };
    for (let gi = 0; gi < order.length && !stop() && found < target; gi += 6) {
      const group = order.slice(gi, gi + 6);
      const deep = tr => (P.R.avoidHits ? tr.slice().sort((a, b) => Math.abs((a.rank || 0) - 300000) - Math.abs((b.rank || 0) - 300000)) : tr);
      const tops = await Promise.all(group.map(c => (c.pool ? Promise.resolve(c.tracks) : Deezer.top(c.id, P.R.avoidHits ? 25 : 10).then(deep).catch(() => { fails++; return []; }))));
      await stylesFor(tops.flatMap((tr, k) => (group[k].pool ? tr : tr.slice(0, 6))));
      const cur = ctx.latest(); if (!cur || cur.epoch !== P.epoch) throw new Core.OpError("STALE", "The playlist changed while searching.");
      const picks = [];
      group.forEach((c, k) => {
        if (!c.pool) { c.sf = styleFit(c.id, S); if (!styleGate(c.sf, S, trustedC(c))) return; }
        const cap = c.pool ? 3 : c.via === "known" ? capKnown + (capKnown ? 1 : 0) : c.via === "ref" ? capRef + 1 : capNew + (P.R.era || P.moodT.length || P.tgt.bpm ? 1 : 0); let got = 0;
        for (const t0 of tops[k]) {
          if (got >= cap || found + (buf.length + picks.length) * .7 >= target + 6) break;
          if (seen.has(t0.id)) continue; seen.add(t0.id);
          const art = primary(t0); if ((inPl.get(art) || 0) >= plCap || P.avoid.has(art)) continue;
          if ([...buf, ...picks].filter(x => primary(x.t0 || x.t) === art).length >= capOf(t0) + 1) continue;
          if (eligible(Object.assign({}, t0, { y: null }), P.R, ctx.getTrack)) continue;
          if (Core.findDuplicate(cur, t0, ctx.getTrack)) continue;
          let sf = c.sf; if (c.pool) { sf = styleFit((t0.aid || [])[0], S); if (!styleGate(sf, S, t0._trust)) continue; }
          else if ((t0.aid || [])[0] !== c.id) { const lead = styleFit(t0.aid[0], S); if (lead.known && !styleGate(lead, S, true)) continue; }
          picks.push({ c, t0, sf }); got++;
        }
      });
      const full = await Promise.all(picks.map(p => (p.t0.full && p.t0.y ? Promise.resolve(p.t0) : Deezer.track(p.t0.dz).then(t => (t ? Object.assign(t, { _why: p.t0._why }) : null)).catch(() => { fails++; return null; }))));
      full.forEach((t, k) => {
        if (!t) return; checked++; if (eligible(Object.assign({}, t, { lang: null }), P.R, ctx.getTrack)) return;
        const c = picks[k].c; const from = [...(c.from || [])].filter(Boolean).slice(0, 2);
        const why = c.pool ? picks[k].t0._why : c.via === "known" ? `More from ${c.name}, already on this playlist` : c.via === "ref" ? `By ${c.name}, one of your reference artists`
          : c.via === "lb" ? `People who play ${from[0]} also play ${c.name}` : c.via === "lbrec" ? `Listeners of “${c.song}” also play ${c.name}` : c.via === "tag" ? `Tagged ${from[0] || "this style"} on ListenBrainz` : `Near ${from.join(" and ") || c.name}`;
        buf.push({ t, why, as: c.pool ? maxScore * (t._trust ? .6 : .4) : c.score, sf: picks[k].sf });
      });
      if (buf.length >= 12 || (buf.length && found + buf.length * .7 >= target + 2)) await flush();
      say(`Finding songs… ${found}/${target} found`);
    }
    await flush(true);
    if (!found && !checked && fails && !stop()) throw new Core.OpError("OFFLINE", "Couldn't reach Deezer to look for songs. Check your connection and try again. Nothing changed.");
    return { found, checked };
  },
  async fill(ctx, slots, opt = {}) {
    const say = opt.onProgress || (() => {});
    const P = await buildProfile(Object.assign({ stopped: opt.stopped }, ctx), say);
    say(`Weighing ${P.ev.pending.length} recommendations…`);
    const pend0 = P.ev.pending.slice(-240);
    await Promise.all([featuresFor(pend0, ctx.saveTracks), (P.R.langs.length || P.R.notLangs.length) ? langsFor(pend0.slice(-120), ctx.saveTracks, true) : null]);
    const S = await styleProfile(P, ctx, null); await stylesFor(pend0);
    const pend = pend0.filter(t => !eligible(t, P.R, ctx.getTrack, { allowVersions: true }) && styleGate(styleFit((t.aid || [])[0], S), S, true));
    const apBy = new Map(); for (const id of P.pl.order) { const t = ctx.getTrack(id); if (t) apBy.set(primary(t), (apBy.get(primary(t)) || 0) + 1); }
    const sc = pend.map(t => { const { fit, known } = fitOf(t, P); const pen = penalty(t, P); return { t, fit, s: 1.4 * fit - pen + (P.W.has((t.aid || [])[0]) ? .2 : 0) + (S.info ? .8 * styleScore(styleFit((t.aid || [])[0], S), S) : 0), ok: !(known && fit < .35) && pen < 1.2 }; }).filter(x => x.ok).sort((a, b) => b.s - a.s);
    const pool = sc.slice(0, Math.max(slots * 2, slots + 5)); const picks = []; const per = new Map();
    while (picks.length < slots && pool.length) {
      const ws = pool.map(x => Math.exp(x.s * 2)); const tot = ws.reduce((a, b) => a + b, 0); let r = Math.random() * tot, i = 0; for (; i < pool.length; i++) { r -= ws[i]; if (r <= 0) break; }
      const x = pool.splice(Math.min(i, pool.length - 1), 1)[0]; const a = primary(x.t);
      if ((per.get(a) || 0) >= 2 || (apBy.get(a) || 0) + (per.get(a) || 0) >= (P.pat.repetition ? 2 : 5)) continue;
      per.set(a, (per.get(a) || 0) + 1); picks.push({ id: x.t.id });
    }
    const fresh = [];
    if (picks.length < slots && !(opt.stopped && opt.stopped())) {
      say("Looking for more songs that fit…");
      try { await this.generate(ctx, { target: slots - picks.length, onProgress: say, stopped: opt.stopped,
        onBatch: async list => { const ok = list.filter(x => !fresh.some(y => Core.sameRecording(y.t, x.t))); fresh.push(...ok); return { added: ok.length, addedIds: ok.map(x => x.t.id) }; } }); } catch (e) { if (e.code !== "NO_SEEDS") throw e; }
    }
    return { picks, fresh };
  }
};

/* ---------- AI providers ---------- */
function aiError(status, body) {
  const m = (body && (body.error && (body.error.message || body.error))) || ""; const E = (code, msg) => new Core.OpError(code, msg, { status });
  if ((status === 400 && /api key/i.test(m)) || status === 401 || status === 403) return E("AI_KEY", "The key was refused. Check it in Settings.");
  if (status === 404 || /no longer available|not found|deprecated/i.test(m)) return E("AI_GONE", "That model isn't available on your account anymore.");
  if (status === 503 || /high demand|overloaded|unavailable/i.test(m)) return E("AI_BUSY", "That model is busy right now.");
  if (status === 429 && /free_tier_requests|per-day|per day|daily|PerDay/i.test(m)) return E("AI_DAILY", "Today's free requests are used up. They reset tomorrow; Classic works in the meantime.");
  if (status === 429) return E("AI_QUOTA", "The free limit for that model is used up for now.");
  if (status === 400 && /thinking/i.test(m)) return E("AI_THINK", m);
  return E("AI_HTTP", "The AI service had a problem (" + status + ").");
}
async function postJSON(url, headers, body, timeout = 120000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
  try { const r = await fetch(url, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers), body: JSON.stringify(body), signal: ac.signal });
    let j = null; try { const txt = (await r.text()).split("\n").filter(l => !/^\s*:/.test(l)).join("\n").trim(); j = txt ? JSON.parse(txt) : null; } catch {}
    if (!r.ok) throw aiError(r.status, j);
    if (!j) throw new Core.OpError("AI_PARSE", "That model sent an empty answer."); return j;
  } catch (e) { if (e.name === "AbortError") throw new Core.OpError("AI_TIMEOUT", "That model took too long to answer."); if (e instanceof Core.OpError) throw e; throw new Core.OpError("AI_NET", "Couldn't reach the AI service. Check your connection."); }
  finally { clearTimeout(t); }
}
const dayKey = () => new Date(Date.now() - 8 * 3600e3).toISOString().slice(0, 10); // free quotas reset at midnight Pacific
const gemVer = id => { const m = /gemini-(\d+(?:\.\d+)?)/.exec(id); return m ? +m[1] : 0; };
const PROVIDERS = {
  gemini: { label: "Google Gemini", note: "Free key from Google AI Studio (about 20 requests a day per model)", keyUrl: "https://aistudio.google.com/apikey", dailyPerModel: true,
    async models(key) { const d = await Cat.getJSON("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } }).catch(e => { throw aiError(e.status || 0); });
      return (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent")).map(m => ({ id: m.name.replace(/^models\//, ""), name: m.displayName || m.name }))
        .filter(m => /^gemini-\d/.test(m.id) && !/embedding|aqa|imagen|tts|image|live|audio|veo|robotics|computer|learnlm|customtools|omni/i.test(m.id)); },
    /* order for Automatic: newest regular Flash first, then Flash-Lite, then Pro */
    rank(list) { const k = m => (/flash-lite/.test(m.id) ? 1 : /flash/.test(m.id) ? 0 : 2) * 100 - gemVer(m.id) + (/preview|exp/.test(m.id) ? .5 : 0); return list.slice().sort((a, b) => k(a) - k(b)).map(m => m.id); },
    pick(list) { return "auto"; },
    async chat(key, model, sys, user, o = {}) {
      const gen = { temperature: .9, responseMimeType: "application/json" }; if (gemVer(model) >= 3 && !o.noThink) gen.thinkingConfig = { thinkingLevel: "low" };
      let j;
      try { j = await postJSON(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": key }, { systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: gen }, o.timeout); }
      catch (e) { if (e.code === "AI_THINK" && !o.noThink) return this.chat(key, model, sys, user, Object.assign({}, o, { noThink: true })); throw e; }
      const c = (j.candidates || [])[0]; const txt = ((c && c.content && c.content.parts) || []).map(p => p.text || "").join("");
      if (!txt.trim()) throw new Core.OpError("AI_PARSE", "That model sent an empty answer."); return txt; } },
  openrouter: { label: "OpenRouter (free models)", note: "Free key from OpenRouter (50 free requests a day)", keyUrl: "https://openrouter.ai/keys", noProbe: true,
    async quota(key) { try { const d = (await Cat.getJSON("https://openrouter.ai/api/v1/key", { headers: { Authorization: "Bearer " + key } })).data || {}; const q = d.free_model_daily_requests; return q ? { used: q.used, limit: q.limit, remaining: q.remaining } : null; } catch { return null; } },
    async models() { const d = await Cat.getJSON("https://openrouter.ai/api/v1/models"); return (d.data || []).filter(m => /:free$/.test(m.id)).map(m => ({ id: m.id, name: m.name || m.id, ctx: m.context_length || 0 })).sort((a, b) => b.ctx - a.ctx); },
    /* bigger models know more music: known strong families first, then by size in the name (e.g. 550b), tiny models (<8B) last */
    rank(list) { const size = m => { const n = [...m.id.matchAll(/(\d+(?:\.\d+)?)b\b/gi)].map(x => +x[1]); return n.length ? Math.max(...n) : /ultra|super|large|pro/i.test(m.id) ? 200 : /lite|mini|small|tiny|lightning/i.test(m.id) ? 6 : 30; };
      const pref = m => (/deepseek|gemini|llama-3\.3|qwen3|gpt-oss|mistral|kimi|glm/i.test(m.id) ? 0 : 1) + (size(m) < 8 ? 2 : 0);
      return list.slice().sort((a, b) => pref(a) - pref(b) || size(b) - size(a) || b.ctx - a.ctx).map(m => m.id); },
    pick() { return "auto"; },
    async chat(key, model, sys, user, o = {}) {
      const j = await postJSON("https://openrouter.ai/api/v1/chat/completions", { Authorization: "Bearer " + key, "HTTP-Referer": (G.location && G.location.origin) || "https://nymph-exe.github.io", "X-Title": "Préndete Mix" },
        { model, temperature: .9, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }, o.timeout);
      if (j.error) throw aiError(+j.error.code || 0, j);
      const txt = ((j.choices || [])[0] || {}).message ? j.choices[0].message.content || "" : "";
      if (!txt.trim()) throw new Core.OpError("AI_PARSE", "That model sent an empty answer."); return txt; } },
  claude: { label: "Claude (your subscription)", wip: true },
  chatgpt: { label: "ChatGPT (your subscription)", wip: true }
};
/* Automatic model: probe several models at once with a tiny request and use the best-ranked one that answers.
   The choice is remembered (ctx.ai.memo) and replaced when that model fails later. */
async function workingModel(a, p, avoid = new Set(), say) {
  const memo = a.memo || {}; const today = dayKey(); const spent = m => memo.day && memo.day[m] === today;
  const fresh = memo.model && Date.now() - (memo.at || 0) < 6 * 3600e3 && !avoid.has(memo.model) && !spent(memo.model);
  if (fresh) return memo.model;
  const order = p.rank(a.models || []).filter(m => !avoid.has(m) && !spent(m) && !(memo.bad && memo.bad[m] && Date.now() - memo.bad[m] < 30 * 60e3));
  if (!order.length && (a.models || []).some(m => spent(m.id || m))) throw new Core.OpError("AI_DAILY", `Today's free ${p.label.replace(/ \(.*\)/, "")} requests are used up on all your models. They reset tomorrow; Classic works in the meantime.`);
  if (!order.length) throw new Core.OpError("AI_NONE", "None of your models are answering right now. Try again in a few minutes, or switch this playlist to Classic.");
  if (p.noProbe) return memo.model && !avoid.has(memo.model) ? memo.model : order[0];  // each request counts toward a daily cap: use the real request as the test
  for (let i = 0; i < order.length; i += 3) {
    say && say("Finding a model that's answering…");
    const batch = order.slice(i, i + 3);
    const res = await Promise.all(batch.map(m => p.chat(a.key, m, "Reply with JSON only.", 'Return {"ok":true}', { timeout: 15000 }).then(() => true).catch(e => { if (e.code === "AI_KEY") throw e; if (e.code === "AI_DAILY") memo.day = Object.assign(memo.day || {}, { [m]: dayKey() }); else memo.bad = Object.assign(memo.bad || {}, { [m]: Date.now() }); return false; })));
    const k = res.findIndex(Boolean);
    if (k >= 0) { Object.assign(memo, { model: batch[k], at: Date.now() }); if (memo.bad) delete memo.bad[batch[k]]; a.memo = memo; if (a.onMemo) a.onMemo(memo); return batch[k]; }
  }
  a.memo = memo; if (a.onMemo) a.onMemo(memo);
  throw new Core.OpError("AI_NONE", "None of your models are answering right now. Try again in a few minutes, or switch this playlist to Classic.");
}
function parseJSON(text) {
  let s = String(text || "").replace(/```(?:json)?/gi, "").trim(); const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Core.OpError("AI_PARSE", "The AI's answer couldn't be read. Try again or pick another model.");
  try { return JSON.parse(s.slice(a, b + 1)); } catch { throw new Core.OpError("AI_PARSE", "The AI's answer couldn't be read. Try again or pick another model."); }
}
const line = t => `${t.t} — ${String(t.a || "").split(/;\s*/).join(", ")}${t.y ? ` (${t.y})` : ""}`;
function directionBlock(pl, never, get) {
  const d = pl.direction || {}, f = d.form || {}, ex = d.exclude || {}; const L = [];
  L.push(`Playlist name: ${pl.name}`);
  if (d.text) L.push(`Creative direction (the user's own words):\n${d.text}`);
  const tr = []; if (f.genres && f.genres.length) tr.push("genres: " + f.genres.map(g => g.name).join(", ")); if (f.moods && f.moods.length) tr.push("moods: " + f.moods.join(", "));
  if (f.energy) tr.push("energy: " + f.energy); if (f.tempo) tr.push("tempo: " + f.tempo); if (f.era && f.era[0]) tr.push(`release years: ${f.era[0]}–${f.era[1]}`);
  if (f.langs && f.langs.length) tr.push("languages: " + f.langs.join(", ")); if (f.explicit && f.explicit !== "any") tr.push(f.explicit === "clean" ? "clean versions only" : "explicit versions preferred");
  if (Array.isArray(f.bpm) && f.bpm[0]) tr.push(`tempo ${f.bpm[0]}–${f.bpm[1]} BPM`); if ((f.notLangs || []).length) tr.push("no songs sung in: " + f.notLangs.join(", "));
  if (f.avoidHits) tr.push("avoid the most-played hits"); if (f.preferHits) tr.push("lean toward popular, well-known songs"); tr.push(f.versions ? "remixes, live and sped-up versions are welcome" : "original versions only (no remixes, live, sped-up, slowed or acoustic versions)");
  L.push("Requirements: " + tr.join("; "));
  const refs = (d.refs || []).map(get).filter(Boolean); if (refs.length) L.push("Reference songs (examples of the sound, not instructions to include):\n" + refs.map(line).join("\n"));
  if ((d.artists || []).length) L.push("Reference artists: " + d.artists.map(a => a.name).join(", "));
  const blocks = [...(ex.artists || []), ...(never || [])]; if (blocks.length) L.push("Never suggest songs by or featuring: " + [...new Set(blocks)].join(", "));
  const exs = (ex.songs || []).map(get).filter(Boolean); if (exs.length) L.push("Excluded songs:\n" + exs.map(line).join("\n"));
  return L.join("\n\n");
}
function stateBlock(pl, get, { pendingIdx } = {}) {
  const ev = Core.evidence(pl, get), L = [];
  const cap = (arr, n) => (arr.length > n ? arr.slice(-n) : arr);
  if (ev.mandatory.length) L.push("Must-include songs (already on the playlist):\n" + ev.mandatory.map(line).join("\n"));
  const man = ev.manual.filter(t => !ev.mandatory.includes(t)); if (man.length) L.push(`Songs the user approved (${man.length}):\n` + cap(man, 260).map(line).join("\n"));
  if (ev.delegated.length) L.push(`Songs added by an earlier random fill (weaker evidence; the user hasn't confirmed them):\n` + cap(ev.delegated, 80).map(line).join("\n"));
  if (ev.rejected.length) L.push(`Songs the user rejected (never suggest these again)${ev.rejected.some(r => r.reason) ? "; reasons are in brackets" : ""}:\n` + cap(ev.rejected, 300).map(r => line(r.t) + (r.reason || r.text ? ` [${[r.reason, r.text].filter(Boolean).join(": ")}]` : "")).join("\n"));
  if (pendingIdx) L.push(`Recommendations waiting for review (numbered):\n` + pendingIdx.map((t, i) => `${i + 1}. ${line(t)}`).join("\n"));
  else if (ev.pending.length) L.push(`Already recommended and waiting for review (don't repeat):\n` + cap(ev.pending, 200).map(line).join("\n"));
  return L.join("\n\n");
}
const SYS = "You are a music curator working on one playlist. Recommend only real, officially released songs that exist on streaming services, with the exact title and the main artist as credited. Never invent songs, artists or collaborations. Interpret the whole direction together, not keyword by keyword. Don't lean on one artist or their collaborators. Popular and lesser-known songs are both fine unless the direction says otherwise. Reply with JSON only.";

async function verifyAll(items, R, ctx, say, label) {
  const ok = [], missing = [], skipped = []; let i = 0;
  for (const it of items) {
    if (ctx.stopped && ctx.stopped()) break;
    say(`${label} ${++i}/${items.length}…`);
    const title = String(it.title || "").trim(), artist = String(it.artist || "").trim(); if (!title || !artist) continue;
    if (blocked({ t: title, a: artist }, R)) { skipped.push(`${title} — ${artist}`); continue; }
    let t; try { t = await Cat.resolve(title, artist); } catch { throw new Core.OpError("OFFLINE", "Couldn't reach Deezer or Apple Music to check the suggestions. Check your connection and try again; nothing was added."); }
    if (!t) { missing.push(`${title} — ${artist}`); continue; }
    await langsFor([t], ctx.saveTracks, !!(R.langs.length || R.notLangs.length));
    if (eligible(t, R, ctx.getTrack)) { skipped.push(line(t)); continue; }
    if (ok.some(x => Core.sameRecording(x.t, t))) continue;
    ok.push({ t, why: String(it.why || "").slice(0, 160) });
  }
  return { ok, missing, skipped };
}
const AI = {
  id: "ai", label: "AI",
  async ask(ctx, sys, user, say) {
    const a = ctx.ai || {}; const p = PROVIDERS[a.provider];
    if (!p || p.wip) throw new Core.OpError("AI_WIP", "That AI connection is coming next. For now pick Gemini or OpenRouter in this playlist's settings, or switch it to Classic.");
    if (!a.key) throw new Core.OpError("AI_KEY", `Add your ${p.label} key in Settings first.`);
    const auto = !a.model || a.model === "auto"; const avoid = new Set();
    for (let tries = 0; tries < (p.noProbe ? 2 : 4); tries++) {
      const model = auto ? await workingModel(a, p, avoid, say) : a.model;
      try { say && say(`Asking ${p.label.replace(/ \(.*\)/, "")} (${model})…`); const out = parseJSON(await p.chat(a.key, model, sys, user)); a.used = model;
        if (auto) { const memo = a.memo || (a.memo = {}); const was = memo.model; Object.assign(memo, { model, at: Date.now() }); if (was !== model && a.onMemo) a.onMemo(memo); } return out; }
      catch (e) {
        if (typeof console !== "undefined") console.warn("[ai]", p.label, model, e.code || e.name, e.message);
        if (e.code === "AI_DAILY" && p.dailyPerModel) { const memo = a.memo || (a.memo = {}); memo.day = Object.assign(memo.day || {}, { [model]: dayKey() }); if (memo.model === model) delete memo.model; if (a.onMemo) a.onMemo(memo); avoid.add(model); if (auto) continue; throw new Core.OpError("AI_DAILY", `Today's free requests for ${model} are used up. Set this playlist's model to Automatic to use your other Gemini models.`); }
        if (e.code === "AI_DAILY") throw e;
        const retryable = ["AI_TIMEOUT", "AI_BUSY", "AI_GONE", "AI_QUOTA", "AI_PARSE", "AI_HTTP"].includes(e.code);
        if (auto && retryable) { avoid.add(model); const memo = a.memo || (a.memo = {}); memo.bad = Object.assign(memo.bad || {}, { [model]: Date.now() }); if (memo.model === model) delete memo.model; if (a.onMemo) a.onMemo(memo); continue; }
        if (!auto && retryable) throw new Core.OpError(e.code, `${e.message} (${model}). In this playlist's settings, set the model to Automatic so the app can switch to one that's answering.`);
        throw e;
      }
    }
    throw new Core.OpError("AI_NONE", "None of your models are answering right now. Try again in a few minutes, or switch this playlist to Classic.");
  },
  async interpret(ctx, text) {
    const user = `Read this playlist description and turn it into structure. Keep the user's intent; don't add requirements they didn't state.\n\nDescription:\n"""${text}"""\n\nReturn JSON exactly like:\n{"name":"a short playlist name if the description suggests one, else empty","summary":"one or two sentences restating the musical identity, in the description's language","include":[{"title":"","artist":""}],"references":[{"title":"","artist":""}],"referenceArtists":[""],"excludeArtists":[""],"excludeSongs":[{"title":"","artist":""}],"traits":{"genres":[""],"moods":[""],"keywords":["specific styles or scenes, e.g. lofi, amapiano, corridos tumbados"],"energy":"low|medium|high or empty","tempo":"slow|mid|fast or empty","bpm":[0,0],"era":[0,0],"languages":["es","en"],"notLanguages":[],"explicit":"any|clean|explicit","versions":false,"avoidHits":false,"preferHits":false}}\n\nRules: put a song in "include" only when the user clearly asks for it to be on the playlist. Songs mentioned as examples of the sound go in "references". Songs or artists mentioned as what they don't want go in the exclude lists. An example used to explain a problem (like "X is too mellow") is not a request to add X. Use [0,0] for bpm unless the user wrote a BPM number, and [0,0] for era unless they mention years or decades; when they give only a start year, use the current year as the end. Languages are ISO 639-1 codes; "languages" are the ones wanted, "notLanguages" the ones ruled out. Moods may use: ${Object.keys(MOODS).join(', ')}.`;
    return this.ask(ctx, "You turn playlist descriptions into structured requirements. Never invent songs. Reply with JSON only.", user, ctx.say);
  },
  async generate(ctx, opt) {
    const say = opt.onProgress || (() => {}); const pl = ctx.latest(); if (!pl) throw new Core.OpError("GONE", "This playlist was deleted.");
    const R = rules(pl, ctx.never); let found = 0, missing = [], skipped = [];
    for (let round = 0; round < 2 && found < opt.target && !(opt.stopped && opt.stopped()); round++) {
      const want = Math.min(40, opt.target - found + 8);
      say(round ? "Asking for a few more…" : `Asking ${PROVIDERS[ctx.ai.provider].label.replace(/ \(.*\)/, "")}…`);
      const cur = ctx.latest(); if (!cur) throw new Core.OpError("GONE", "This playlist was deleted.");
      const user = `${directionBlock(cur, ctx.never, ctx.getTrack)}\n\n${stateBlock(cur, ctx.getTrack)}\n\n${missing.length ? "These earlier suggestions couldn't be found in the catalog, so don't repeat them:\n" + missing.join("\n") + "\n\n" : ""}Recommend ${want} new songs that fit this playlist and aren't listed above. Return JSON: {"songs":[{"title":"","artist":"","why":"one short reason tied to the direction"}]}`;
      const j = await this.ask(ctx, SYS, user, say);
      const v = await verifyAll((j.songs || []).slice(0, 50), R, Object.assign({ stopped: opt.stopped }, ctx), say, "Checking each song in the catalog");
      missing = [...new Set(missing.concat(v.missing))]; skipped = [...new Set(skipped.concat(v.skipped))];
      for (let i = 0; i < v.ok.length && found < opt.target; i += 8) { const r = await opt.onBatch(v.ok.slice(i, Math.min(i + 8, i + opt.target - found))); found += r.added; }
    }
    return { found, missing, skipped };
  },
  async fill(ctx, slots, opt = {}) {
    const say = opt.onProgress || (() => {}); const pl = ctx.latest(); const R = rules(pl, ctx.never);
    const pend = Core.evidence(pl, ctx.getTrack).pending.filter(t => !blocked(t, R)).slice(-300);
    say(`Asking ${PROVIDERS[ctx.ai.provider].label} to pick ${slots}…`);
    const user = `${directionBlock(pl, ctx.never, ctx.getTrack)}\n\n${stateBlock(pl, ctx.getTrack, { pendingIdx: pend })}\n\nThe playlist has ${slots} open spot${slots === 1 ? "" : "s"}. Fill them with the songs that fit best. Prefer numbers from the waiting list; only suggest new songs if not enough of them fit. Never pick anything that doesn't fit just to fill space. Return JSON: {"pick":[numbers],"new":[{"title":"","artist":"","why":""}]}`;
    const j = await this.ask(ctx, SYS, user, say);
    const picks = []; for (const n of j.pick || []) { const t = pend[(+n) - 1]; if (t && !picks.some(p => p.id === t.id) && picks.length < slots) picks.push({ id: t.id }); }
    let fresh = [], missing = [];
    if (picks.length < slots && (j.new || []).length) { const v = await verifyAll(j.new.slice(0, slots - picks.length + 5), R, Object.assign({ stopped: opt.stopped }, ctx), say, "Checking each song in the catalog"); fresh = v.ok.slice(0, slots - picks.length); missing = v.missing; }
    return { picks, fresh, missing };
  }
};

/* ---------- reading → direction (shared by the Classic reader and the AI reader) ----------
   Every song and artist is looked up in the catalog first; anything that can't be found is reported, never invented. */
async function applyReading(j, st, o = {}) {
  const say = o.say || (() => {}), d = st.dir, missing = [], unchecked = [], strict = !!j.verifyNames;
  d.exclude = d.exclude || { artists: [], songs: [] }; d.form = d.form || {};
  const look = async (it, into) => { if (!it || !it.title) return; say(`Looking up ${it.title}…`); const label = it.artist ? `${it.title} — ${it.artist}` : it.title;
    let t = null; try { t = it.artist ? await Cat.resolve(it.title, it.artist) : null; } catch { unchecked.push(label); return; } if (!t) { missing.push(label); return; }
    if (o.keep) o.keep(t); if (![d.refs, st.must, d.exclude.songs].some(a => a.includes(t.id))) into.push(t.id); };
  for (const it of (j.include || []).slice(0, 40)) await look(it, st.must);
  for (const it of (j.references || []).slice(0, 20)) await look(it, d.refs);
  for (const it of (j.excludeSongs || []).slice(0, 20)) await look(it, d.exclude.songs);
  const capd = n => /^[A-Z0-9$¡¿]/.test(n) || /[A-Z]/.test(n.slice(1));
  const OFF = {}; const artist = async (n, minFans) => { try { say(`Looking up ${n}…`); return await Deezer.artistByName(n, minFans); } catch { return OFF; } };
  for (const n of (j.referenceArtists || []).filter(Boolean).slice(0, 15)) { const a = await artist(n, strict ? (capd(n) ? 1000 : 10000) : 0); if (a === OFF) unchecked.push(n); else if (a) { if (!d.artists.some(x => x.id === a.id)) d.artists.push({ id: a.id, name: a.name }); } else missing.push(n); }
  for (const n of (j.excludeArtists || []).filter(Boolean).slice(0, 40)) {
    if (!strict) { if (!d.exclude.artists.some(x => Core.norm(x) === Core.norm(n))) d.exclude.artists.push(n); continue; }
    const a = await artist(n, capd(n) ? 500 : 5000);
    if (a === OFF) { if (capd(n) && !d.exclude.artists.some(x => Core.norm(x) === Core.norm(n))) d.exclude.artists.push(n); else unchecked.push(n); }
    else if (a) { if (!d.exclude.artists.some(x => Core.norm(x) === Core.norm(a.name))) d.exclude.artists.push(a.name); } else missing.push(n); }
  for (const c of (j.maybeArtists || []).slice(0, 10)) { const a = await artist(c.name, 30000); if (!a || a === OFF) continue;
    if (c.role === "ex") { if (!d.exclude.artists.some(x => Core.norm(x) === Core.norm(a.name))) d.exclude.artists.push(a.name); } else if (!d.artists.some(x => x.id === a.id)) d.artists.push({ id: a.id, name: a.name }); }
  const tr = j.traits || {}, f = d.form; const gl = o.genres || [];
  for (const n of (tr.genres || []).filter(Boolean)) { const g = gl.find(x => Core.norm(x.name) === Core.norm(n)); const item = g ? { id: g.id, name: g.name } : { id: null, name: n };
    const have = (f.genres || []).find(x => Core.norm(x.name) === Core.norm(item.name)); if (!have) f.genres = [...(f.genres || []), item]; else if (!have.id && item.id) have.id = item.id; }
  for (const m0 of (tr.moods || []).filter(Boolean)) { const m = Object.keys(MOODS).find(k => Core.norm(k) === Core.norm(m0)) || m0; if (!(f.moods || []).includes(m)) f.moods = [...(f.moods || []), m]; }
  for (const k of (tr.keywords || []).filter(Boolean)) if (!(f.keywords || []).includes(k)) f.keywords = [...(f.keywords || []), k];
  for (const k of (tr.notStyles || []).filter(Boolean)) if (!(f.notStyles || []).includes(k)) f.notStyles = [...(f.notStyles || []), k];
  if (["low", "medium", "high"].includes(tr.energy)) f.energy = tr.energy;
  /* strict filters only from what the description literally says: a BPM number, or years/decades */
  const txt = String(o.text || d.text || ""), CUR = new Date().getFullYear();
  const saysBpm = /\d{2,3}\s*(?:-|–|to|a)?\s*\d{0,3}\s*bpm/i.test(txt), saysYears = /\b(?:19|20)\d{2}\b|\b\d0'?s\b|\blos \d0\b|\b(?:recent|new|latest|nuev[oa]s|recientes|throwback|old school|clasicos|clásicos)\b/i.test(txt);
  if (Array.isArray(tr.bpm) && +tr.bpm[0] > 30 && +tr.bpm[1] >= +tr.bpm[0] && (strict || saysBpm)) { f.bpm = [+tr.bpm[0], +tr.bpm[1]]; f.tempo = ""; } else if (["slow", "mid", "fast"].includes(tr.tempo)) { f.tempo = tr.tempo; f.bpm = null; }
  if (Array.isArray(tr.era) && (+tr.era[0] > 1900 || +tr.era[1] > 1900) && (strict || saysYears)) {
    let end = +tr.era[1] > 1900 ? +tr.era[1] : 2100; if (!strict && end < CUR && end >= CUR - 2 && !new RegExp("\\b" + end + "\\b").test(txt)) end = CUR;
    f.era = [+tr.era[0] > 1900 ? +tr.era[0] : 1900, end]; }
  const iso = x => String(x || "").slice(0, 2).toLowerCase();
  for (const l of (tr.languages || []).map(iso).filter(l => Cat.LANG_NAMES[l])) if (!(f.langs || []).includes(l)) f.langs = [...(f.langs || []), l];
  for (const l of (tr.notLanguages || []).map(iso).filter(l => Cat.LANG_NAMES[l])) if (!(f.notLangs || []).includes(l)) f.notLangs = [...(f.notLangs || []), l];
  f.notLangs = (f.notLangs || []).filter(l => !(f.langs || []).includes(l));
  if (tr.explicit === "clean" || tr.explicit === "explicit") f.explicit = tr.explicit;
  if (tr.versions) f.versions = true; if (tr.avoidHits) { f.avoidHits = true; f.preferHits = false; }
  if (tr.gems || /\b(hidden gems?|underground|deep cuts?|lesser[- ]known|obscure|under the radar|joyitas?|poco conocid[oa]s?)\b/i.test(txt)) { f.gems = true; f.avoidHits = true; f.preferHits = false; } if (tr.preferHits && !f.avoidHits) f.preferHits = true;
  return { summary: j.summary || "", missing: [...new Set(missing)], unchecked: [...new Set(unchecked)] };
}

const API = { workingModel, applyReading, Classic, styleProfile, styleFit, stylesFor, wantStyles, tagSim, ART, AI, PROVIDERS, MOODS, ENERGY, TEMPO, rules, eligible, blocked, langVerdict, buildProfile, fitOf, directionBlock, stateBlock, parseJSON, featuresFor, langsFor, vibe, reasonsOf };
G.Engines = API;
if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

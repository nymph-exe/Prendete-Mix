/* MIXER (internally the Préndete app) — recommendation engines. Both read only the current playlist's own evidence (Section 16.3),
   never another playlist's. Classic: catalog graph + editorial playlists + audio features + lyrics language.
   AI: Gemini / OpenRouter with catalog verification.
   generate() appends pending candidates through onBatch (the app commits each batch against the latest state).
   fill() returns delegated picks; the app commits them with Core.fillCommit (capacity checked at commit). */
(function (G) {
"use strict";
const Core = G.Core || require("./core.js");
const Cat = G.Catalog || require("./catalog.js");
const Arts = G.Artists || require("./artists.js");
const { Deezer, ReccoBeats, ListenBrainz, MusicBrainz } = Cat;

const NEUTRAL = new Set(["Prefer another song", "Redundant selection"]);
const MOODS = {
  Party: { d: [.62, 1], e: [.5, 1] }, Hype: { e: [.75, 1] }, Danceable: { d: [.7, 1] }, "Feel-good": { v: [.55, 1] }, Chill: { e: [0, .55] },
  Romantic: { e: [0, .7], v: [.3, .85] }, Sad: { v: [0, .4], e: [0, .62] }, Dark: { v: [0, .38] }, Sensual: { d: [.6, 1], e: [.35, .8] },
  Workout: { e: [.65, 1] }, Focus: { e: [0, .6], ac: [.15, 1] }
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
  const block = Arts.banSet([...(never || []), ...(ex.artists || [])]);
  return { dir, form, block, exSongs: (ex.songs || []).filter(Boolean), versions: !!form.versions, era: form.era && form.era[0] ? form.era : null, explicit: form.explicit || "any",
    avoidHits: !!form.avoidHits || !!form.gems, gems: !!form.gems, preferHits: !!form.preferHits, langs: form.langs || [], notLangs: form.notLangs || [],
    holiday: HOLIDAY.test([dir.text, ...(form.keywords || []), ...(form.moods || [])].join(" ")), crowd: !!form.crowd,
    novelty: /\b(parody|parodies|meme|memes|novelty|joke songs?|funny songs?|kids|children|niños|infantil)\b/i.test(dir.text || "") };
}
/* "Never suggest": IDs decide; exact full names only where there's no ID to compare (see artists.js) */
function blocked(t, R) { return Arts.banned(t, R.block); }
/* language: decided from the lyrics when LRCLIB has them; instrumentals pass; unknown songs are kept but ranked lower */
/* where an artist comes from (MusicBrainz area, via ListenBrainz) hints at the language they sing in: used only when a
   song's lyrics aren't on file. A hint alone ranks a song lower; a hint that agrees with the title's language rules it out. */
const AREA_LANG = (() => { const m = new Map(); const add = (l, s) => s.split("|").forEach(n => m.set(n, l));
  add("en", "united states|united kingdom|england|scotland|wales|northern ireland|ireland|canada|australia|new zealand|jamaica|trinidad and tobago|barbados|los angeles|new york|atlanta|chicago|houston|detroit|london|manchester|toronto|nashville|memphis|philadelphia|compton|brooklyn|seattle");
  add("es", "mexico|spain|argentina|colombia|chile|peru|venezuela|puerto rico|cuba|dominican republic|panama|ecuador|uruguay|paraguay|bolivia|costa rica|guatemala|honduras|el salvador|nicaragua|medellín|bogotá|cali|barranquilla|san juan|carolina|buenos aires|madrid|barcelona|santiago|lima|mexico city|ciudad de méxico|monterrey|guadalajara|caracas|panama city|santo domingo|culiacán|tijuana");
  add("pt", "brazil|portugal|angola|mozambique|cape verde|são paulo|rio de janeiro|belo horizonte|salvador|recife|lisbon");
  add("fr", "france|monaco|senegal|haiti|paris|marseille"); add("ko", "south korea|korea|seoul|busan"); add("ja", "japan|tokyo|osaka"); add("de", "germany|austria|berlin|hamburg"); add("it", "italy|rome|milan");
  add("zh", "china|taiwan|hong kong"); add("ru", "russia|moscow"); add("tr", "turkey|istanbul"); return m; })();
const areaLang = t => { const a = ART.get((t.aid || [])[0]); return a && a.area ? AREA_LANG.get(String(a.area).toLowerCase()) || null : null; };
function langVerdict(t, R) {
  if (!R.langs.length && !R.notLangs.length) return "ok";
  const L = t.lang, al = areaLang(t), other = l => !!l && ((R.langs.length > 0 && !R.langs.includes(l)) || R.notLangs.includes(l));
  if (!L || !L.src || L.src === "unknown") return other(al) ? "doubt" : "unknown"; if (L.src === "instrumental") return "ok";
  if (L.src === "title" && other(L.main) && other(al)) return "no";
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
  if (!R.versions && Core.versionTags(t.t).length && !opts.allowVersions) {
    /* a version in the language the playlist asks for is fine ("Korean Ver." on a Korean playlist) */
    const LV = { japanese: "ja", korean: "ko", english: "en", chinese: "zh", mandarin: "zh", cantonese: "zh", spanish: "es", portuguese: "pt", french: "fr", german: "de" };
    const m = /\b(japanese|korean|english|chinese|mandarin|cantonese|spanish|portuguese|french|german) ?ver/i.exec(t.t);
    if (!(m && Core.versionTags(t.t).join() === "language version" && R.langs.includes(LV[m[1].toLowerCase()]))) return "version";
  }
  if (JUNK.test(t.a) || JUNK.test(t.t)) return "junk";
  if (SC && !R.novelty && String(t.a || "").split(/;\s*/).some(SC.novelty)) return "novelty";
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
/* audio features: ReccoBeats when it knows the song; otherwise Listen estimates them from the 30-second preview */
const lsLimit = (() => { let n = 0; const q = []; const next = () => { if (n >= 3 || !q.length) return; n++; const [fn, res] = q.shift(); fn().then(res, () => res(null)).finally(() => { n--; next(); }); }; return fn => new Promise(res => { q.push([fn, res]); next(); }); })();
async function featuresFor(tracks, save) {
  const need = tracks.filter(t => t && t.isrc && !t.f);
  if (need.length) {
    let m = new Map(); try { m = await ReccoBeats.features(need.map(t => t.isrc)); } catch {}
    const upd = []; for (const t of need) { const f = m.get(t.isrc); t.f = f || { none: 1 }; upd.push(t); }
    const L = G.Listen || (typeof require !== "undefined" ? (() => { try { return require("./listen.js"); } catch { return null; } })() : null);
    const deaf = need.filter(t => t.f.none && t.prev && L); /* previews expire after a while: only fresh ones */
    await Promise.all(deaf.filter(t => !t.prevAt || Date.now() - t.prevAt < 30 * 60e3).slice(0, 16).map(t => lsLimit(() => L.fromUrl(t.prev)).then(f => { if (f && f.e != null) t.f = Object.assign({ sp: t.f.sp }, f); }).catch(() => {})));
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
  const b = bpmOf(f.bpm); if (b) p.push((f.est ? "about " : "") + Math.round(b) + " BPM"); return p.filter(Boolean).slice(0, 2).join(", "); };

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
  const doubt = new Set([...rejBy].filter(([a]) => !apBy.get(a)).map(([a]) => a)); /* rejected here and never approved: ranked lower */
  /* their Deezer IDs, most-rejected first: their neighbourhoods count against candidates */
  const negIds = []; { const seenN = new Set(); for (const r of ev.rejected.slice().sort((a, b) => (rejBy.get(primary(b.t)) || 0) - (rejBy.get(primary(a.t)) || 0))) { const a = primary(r.t), id = (r.t.aid || [])[0]; if (!id || !doubt.has(a) || seenN.has(a) || (rejBy.get(a) || 0) < 2) continue; seenN.add(a); negIds.push(id); if (negIds.length >= 6) break; } }
  // seeds from the guided form: genre charts and Deezer's editorial playlists for each genre/mood
  const pool = []; let fails = 0; const f = R.form; const genres = (f.genres || []).filter(g => g.id); const moods = f.moods || [];
  /* a long approval history says more than charts and generic mood playlists: skip those unless genres or styles were named */
  const longHistory = ev.manual.length >= 50 && !genres.length && !(f.keywords || []).length;
  for (const g of longHistory ? [] : genres.slice(0, 4)) {
    if (ctx.stopped && ctx.stopped()) break;
    try { say && say(`Looking at ${g.name}…`); const tr = await Deezer.chart(g.id, 50);
      tr.forEach(t => { (t.aid || []).slice(0, 1).forEach(id => add(id, names(t)[0], .5, "genre")); pool.push(Object.assign(t, { _why: `On the ${g.name} charts` })); }); } catch { fails++; }
  }
  const qs = []; const gn = (f.genres || []).map(g => g.name.replace(/\/.*$/, "")); const kw = (f.keywords || []).slice(0, 3);
  /* a bare mood word finds the wrong playlists ("Romantic" is classical music's Romantic era): search the phrase people use */
  const esText = /\b(canciones|musica|música|para|del|años|que|con|sin|de los)\b/i.test(R.dir.text || "");
  const MQ = m => (esText ? { Sad: "canciones tristes", Romantic: "canciones de amor", Chill: "música relajante", Party: "fiesta", "Feel-good": "canciones alegres", Workout: "música para entrenar", Focus: "música para concentrarse", Danceable: "música para bailar", Hype: "música con energía", Dark: "música oscura", Sensual: "música sensual" }
    : { Sad: "sad songs", Romantic: "love songs", Chill: "chill vibes", Party: "party hits", "Feel-good": "feel good hits", Workout: "workout hits", Focus: "focus music", Danceable: "dance hits", Hype: "hype songs", Dark: "dark music", Sensual: "sensual songs" })[m] || m;
  kw.forEach(k => qs.push(moods.length ? `${k} ${moods[0]}` : k));
  if (moods.length && gn.length) gn.slice(0, 2).forEach(g => qs.push(`${g} ${moods[0]}`)); else if (moods.length) moods.slice(0, 2).forEach(m => qs.push(MQ(m))); else gn.slice(0, 2).forEach(g => qs.push(g));
  /* an occasion with no genre named ("wedding party hits"): Deezer's playlists for that occasion know the songs everyone knows */
  const occ = !genres.length && !(f.keywords || []).length ? String(R.dir.text || "").match(/\b(wedding|boda|road ?trip|karaoke|sing-?along|bbq|barbecue|carne asada|graduation|graduaci[oó]n|quincea[nñ]era|birthday|cumplea[nñ]os|baby shower|pool party|beach party|house party|family party|fiesta familiar)\b/i) : null;
  if (occ) qs.unshift(`${occ[1].toLowerCase()} ${R.crowd || R.preferHits ? "hits" : "party"}`);
  /* crowd-pleasers with no style, artist or song named: Deezer's occasion playlists are mostly new dance remixes of old hits,
     so the mainstream scenes (see scenesFor) lead instead */
  const crowdOnly = R.crowd && !genres.length && !(f.keywords || []).length && !refs.length && !(R.dir.artists || []).length && !ev.manual.length;
  if (crowdOnly) qs.length = 0;
  if (R.langs.length === 1 && qs.length) qs[0] = qs[0] + " " + ({ es: "latino", pt: "brasil", fr: "français", it: "italiano", de: "deutsch", ko: "k-pop", ja: "j-pop" }[R.langs[0]] || "");
  /* no genre, style or mood named ("songs from 2016", "songs in Korean", "high energy songs"): start from Deezer's
     playlists for the years, the language or the feel that was asked for */
  if (!qs.length && !crowdOnly && !genres.length && !(R.dir.refs || []).length && !(R.dir.artists || []).length && !ev.manual.length) {
    const L = R.langs.length === 1 ? R.langs[0] : null, era = R.era;
    const LQ = { es: "éxitos en español", pt: "sucessos brasileiros", fr: "hits français", it: "hit italiane", de: "deutsche hits", ko: "korean hits", ja: "japanese hits", hi: "bollywood hits", ar: "arabic hits", tr: "türkçe pop", ru: "русские хиты", zh: "chinese pop", en: "hits" };
    const mid = era ? Math.floor((Math.max(era[0], 1950) + Math.min(era[1], new Date().getFullYear())) / 2) : null;
    const when = !era ? "" : era[0] === era[1] ? String(era[0]) : mid < 2000 ? `${String(mid).slice(2, 3)}0s` : `${Math.floor(mid / 10) * 10}s`;
    const feel = f.energy === "high" ? (esText ? "música movida" : "upbeat hits") : f.energy === "low" ? (esText ? "música tranquila" : "chill songs") : f.tempo === "fast" ? (esText ? "música movida" : "upbeat hits") : f.tempo === "slow" ? (esText ? "canciones lentas" : "slow songs") : R.crowd ? "party hits" : R.gems ? "underground" : "";
    const lq = L ? LQ[L] || "" : "";
    [[when, lq || "hits"], [feel, when, L ? lq : ""], [lq]].forEach(parts => { const q = parts.filter(Boolean).join(" ").trim(); if (q && q !== "hits") qs.push(q); });
    if (!qs.length && when) qs.push(when + " hits");
  }
  for (const q of longHistory ? [] : [...new Set(qs)].slice(0, 3)) {
    if (ctx.stopped && ctx.stopped()) break;
    try { say && say(`Browsing “${q.trim()}” playlists…`); const pls = (await Deezer.playlists(q.trim(), 6)).filter(p => p.n >= 15).sort((a, b) => b.editor - a.editor).slice(0, 2);
      for (const p of pls) { const tr = await Deezer.playlistTracks(p.id, 100); tr.forEach(t => { (t.aid || []).slice(0, 1).forEach(id => add(id, names(t)[0], .25, "list")); pool.push(Object.assign(t, { _why: `From Deezer's “${p.title}” playlist` })); }); }
    } catch { fails++; }
  }
  for (const c of [...W.values()]) if (avoid.has(Core.norm(c.name)) || blocked({ a: c.name || "", aid: [c.id], t: "" }, R)) W.delete(c.id);
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
  /* release years the user tends to approve here (with 15+ approvals): far outside them ranks lower */
  const ys = ev.manual.map(t => t.y).filter(Boolean).sort((a, b) => a - b); const yr = ys.length >= 15 ? { lo: ys[Math.floor(ys.length * .15)], hi: ys[Math.floor(ys.length * .85)] } : null;
  /* a request with no genre, artist, song or language ("songs from 2016"): Deezer's playlists for it lean French, so songs
     in a language other than the request's own (English or Spanish) rank lower. Never a filter. */
  const seedless = !genres.length && !(f.keywords || []).length && !refs.length && !(R.dir.artists || []).length && !ev.manual.length && !R.langs.length;
  const home = seedless ? (/\b(canciones|musica|música|de los|para|del|años|que|con|sin)\b/i.test(R.dir.text || "") ? ["es", "en"] : ["en", "es"]) : null;
  return { fails, pl, R, ev, refs, W, avoid, doubt, negIds, pool: pool.sort(() => Math.random() - .5).slice(0, 400), prof, pat, tgt, moodT, yr, home, epoch: pl.epoch };
}
function fitOf(t, P) {
  const f = t.f; if (!f || f.none) return { fit: .5, known: false };
  const parts = [];
  if (P.tgt.e) parts.push(fitRange(f.e, P.tgt.e));
  if (P.tgt.bpm) { const b = bpmOf(f.bpm); parts.push(Math.max(fitRange(b, P.tgt.bpm, 8) || 0, P.tgt.bpm[1] <= 100 && f.e != null && f.e < .6 && b ? fitRange(b / 2, P.tgt.bpm, 8) : 0)); }
  const soft = xs => .4 * avg(xs) + .6 * Math.min(...xs);
  /* each mood's own dimensions must agree; several moods average ("party, feel-good" shouldn't demand both at full strength) */
  const mf = P.moodT.map(m => { const xs = Object.entries(m).map(([k, r]) => fitRange(k === "bpm" ? bpmOf(f.bpm) : f[k], r, k === "bpm" ? 10 : .12)).filter(x => x != null); return xs.length ? soft(xs) : null; }).filter(x => x != null);
  if (mf.length) parts.push(.5 * avg(mf) + .5 * Math.max(...mf));
  const pf = Object.entries(P.prof).map(([k, [m, sd]]) => f[k] == null ? null : Math.exp(-(((f[k] - m) / (sd * 1.25)) ** 2) / 2)).filter(x => x != null);
  const pp = parts.filter(x => x != null); const a = pp.length ? soft(pp) : null, b = pf.length ? soft(pf) : null;
  const fit = a != null && b != null ? soft([a, b]) : a != null ? a : b != null ? b : .5;
  /* estimated from the preview (Listen): less certain, so pulled toward neutral */
  return f.est ? { fit: .5 + .7 * (fit - .5), known: a != null || b != null, asked: a != null, est: true } : { fit, known: a != null || b != null, asked: a != null };
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
/* language-free requests: a song clearly in another language (its lyrics, or its artist's country and its title agreeing) is left out */
const CLASSICAL = /\b(Op\. ?\d|K\. ?\d{2,3}|BWV|WoO|Hob\.|Sonata|Concerto|Symphony|Symphonie|Quintet|Quartet|Nocturne|Pr[eé]lude|[EÉ]tude|Hungarian Dance|Adagio|Allegr(o|etto)|Andante)\b/i;
function homeOut(t, P) {
  if (!P.home || (t.lang && t.lang.src === "instrumental")) return false; const L = t.lang;
  if (L && L.src === "lyrics" && L.main) return !P.home.includes(L.main);
  /* the artist's country decides unless the title says the song is in the request's language */
  const al = areaLang(t), tg = (L && L.main) || Cat.guessLang(t.t); return !!(al && !P.home.includes(al) && !(tg && P.home.includes(tg)));
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
  /* a soft preference, so it uses what's already known (lyrics language, the artist's country, the title) instead of fetching lyrics */
  if (P.home && !(t.lang && t.lang.src === "instrumental")) { const l = (t.lang && t.lang.main) || areaLang(t) || Cat.guessLang(t.t); if (l && !P.home.includes(l)) p += t.lang && t.lang.src === "lyrics" ? .7 : .4; }
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
  ["uk drill", "drill", "grime", "uk hip hop", "british hip hop", "uk rap", "road rap", "brooklyn drill"],
  ["synth-pop", "synthpop", "new wave", "new romantic", "electropop", "post-punk", "darkwave", "coldwave", "italo disco", "sophisti-pop", "minimal wave", "electronic", "dance-pop"],
  ["techno", "dark techno", "industrial techno", "hard techno", "minimal techno", "acid techno", "peak time techno", "detroit techno", "hypnotic techno", "acid", "dub techno", "schranz", "raw techno", "warehouse techno"],
  ["electro", "electroclash", "french house", "electro house", "nu disco", "fidget house", "bloghouse"],
  ["salsa", "salsa romántica", "salsa dura", "timba", "son cubano", "bachata", "merengue", "tropical", "cumbia", "boogaloo", "latin", "música tropical"],
  ["r&b", "contemporary r&b", "rnb", "neo soul", "new jack swing", "quiet storm", "soul", "alternative r&b", "rhythm and blues", "urban contemporary", "hip hop soul"],
  ["indie folk", "folk", "singer-songwriter", "chamber folk", "contemporary folk", "folk pop", "americana", "sadcore", "slowcore", "indie", "chamber pop", "freak folk", "indie rock", "folk rock", "emo"],
  ["classic rock", "hard rock", "blues rock", "rock", "album rock", "arena rock", "southern rock", "progressive rock", "glam rock", "heartland rock", "psychedelic rock", "boogie rock", "rock and roll", "folk rock"],
  ["hip hop", "rap", "trap", "pop rap", "gangsta rap", "east coast hip hop", "west coast hip hop", "southern hip hop", "conscious hip hop", "drill"],
  ["house", "deep house", "tech house", "afro house", "progressive house", "electro house", "dance", "edm", "uk garage"],
  ["dancehall", "reggae", "soca", "ragga"], ["shoegaze", "dream pop", "noise pop", "ethereal wave"], ["phonk", "drift phonk", "brazilian phonk", "memphis rap"], ["funk brasileiro", "funk carioca", "baile funk", "brazilian funk", "funk paulista", "funk mandelão", "funk ostentação"],
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
  if (pt.length && pt.every(x => at.includes(x))) s = at[at.length - 1] === pt[pt.length - 1] ? .9 : .4; /* a narrower kind of what was asked ("drill" → "uk drill"), but "jazz rap" is rap, not jazz */
  else if (at.length && at.every(x => pt.includes(x))) s = at.length === 1 && GENERIC.has(at[0]) ? .3 : .5; /* broader */
  if (FAMILIES.some(f => f.has(pk) && f.has(ak))) s = Math.max(s, .65);
  SIMC.set(ck, s); return s;
}
/* ---------- the scene map (scenes.js): who defines each scene, by Deezer artist ID ---------- */
const SC = G.Scenes || (typeof require !== "undefined" ? (() => { try { return require("./scenes.js"); } catch { return null; } })() : null);
const SIDS = G.SCENE_IDS || (typeof require !== "undefined" ? (() => { try { return require("./scenes.ids.js"); } catch { return {}; } })() : {});
const KBID = new Map(); const NAMES = new Map(); /* Deezer id → scene memberships ; Deezer id → artist name */
if (SC) for (const [n, [id]] of Object.entries(SIDS)) { const m = SC.of(n); if (m.length) { KBID.set(id, m); NAMES.set(id, n); } }
const kbOf = id => KBID.get(id) || (SC && NAMES.has(id) ? SC.of(NAMES.get(id)) : []);
const noteName = (id, name) => { if (id && name && !NAMES.has(id)) NAMES.set(id, name); };
/* a scene member counts as carrying the scene's genre tags, even where community tags are missing */
const kbVec = id => { const m = kbOf(id); if (!m.length || !SC) return null; const out = new Map(); for (const { key, tier } of m) for (const t of SC.SCENES[key].tags) out.set(t, Math.max(out.get(t) || 0, tier === "core" ? 1 : .9)); return [...out]; };
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
const ART = new Map(); const MBQ = { n: 0 }; /* per-run allowance of MusicBrainz name look-ups */
/* the tag look-ups are kept in this browser for a month so later runs skip them */
const ART_KEY = "pm.artstyle.v1", ART_TTL = 30 * 864e5; let artLoaded = false, artTimer = null;
function artLoad() { if (artLoaded) return; artLoaded = true; try { const ls = G.localStorage; const j = ls && JSON.parse(ls.getItem(ART_KEY) || "null"); const now = Date.now();
  if (j) for (const [k, v] of j) if (v && now - (v.at || 0) < ART_TTL && !ART.has(+k || k)) ART.set(+k || k, v); } catch {} }
function artSave() { if (!G.localStorage || artTimer) return; artTimer = setTimeout(() => { artTimer = null; try { const all = [...ART].slice(-3000); G.localStorage.setItem(ART_KEY, JSON.stringify(all)); } catch {} }, 1500); }
const nameOk = (a, b) => { const x = Core.norm(a).replace(/\s+/g, ""), y = Core.norm(b).replace(/\s+/g, ""); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
async function stylesFor(tracks, { retry = false } = {}) {
  const need = [], ids = new Set();
  artLoad(); for (const t of tracks) if (t && t.aid && t.aid[0]) noteName(t.aid[0], Core.firstArtist(t.a));
  for (const t of tracks) { const id = t && (t.aid || [])[0]; if (!id || !t.t || ids.has(id)) continue; const a = ART.get(id); if (a && !(retry && !a.v && !a.mbq)) continue; ids.add(id); need.push(t); }
  if (!need.length) return;
  if (retry) need.forEach(t => { const a = ART.get(t.aid[0]); if (a) a.mbq = 1; });
  const tmp = need.map((t, i) => ({ id: "s" + i, t: t.t, a: Core.firstArtist(t.a), mbid: t.mbid || null, ambids: t.ambids }));
  let m; try { m = await Cat.LB.lookup(tmp); } catch { return; }
  const am = new Map(); tmp.forEach((x, i) => { const v = m.get(x.id); if (v && v.artists && v.artists[0]) am.set(need[i].aid[0], v.artists[0]); });
  /* songs ListenBrainz doesn't know yet (often brand-new ones): try the artist's best-known songs instead */
  const miss = need.filter(t => !am.has(t.aid[0])).slice(0, 10);
  if (miss.length) {
    const alt = []; await Promise.all(miss.map(async t => { try { (await Deezer.top(t.aid[0], 2)).filter(x => (x.aid || [])[0] === t.aid[0] && x.t !== t.t).slice(0, 2).forEach(x => alt.push({ id: "m" + alt.length, t: x.t, a: Core.firstArtist(x.a), aid: x.aid })); } catch {} }));
    if (alt.length) { let m2 = new Map(); try { m2 = await Cat.LB.lookup(alt); } catch {} alt.forEach(x => { const v = m2.get(x.id); if (v && v.artists && v.artists[0] && !am.has(x.aid[0])) am.set(x.aid[0], v.artists[0]); }); }
  }
  /* still unknown: find the artist itself on MusicBrainz (1 request a second, so only a few per run) */
  const left = need.filter(t => !am.has(t.aid[0])).slice(0, Math.max(0, MBQ.n));
  if (left.length) { MBQ.n -= left.length; await Promise.all(left.map(async t => { const mb = await MusicBrainz.artistMbid(Core.firstArtist(t.a)).catch(() => null); if (mb) am.set(t.aid[0], mb); })); }
  if (!am.size) return; /* nothing came back at all: likely offline; try again next time */
  let info = new Map(); if (am.size) { try { info = await Cat.LB.artists([...am.values()]); } catch { return; } }
  /* Wikidata genres fill in artists with few community tags */
  const sparse = [...info.entries()].filter(([, a]) => Object.keys(a.tags).length < 3).map(([mb]) => mb);
  if (sparse.length && Cat.Wikidata) { const wd = await Cat.Wikidata.genres(sparse).catch(() => new Map());
    for (const [mb, gs] of wd) { const a = info.get(mb); if (!a) continue; const top = Math.max(1, ...Object.values(a.tags)); gs.forEach(g => { a.tags[g] = (a.tags[g] || 0) + top * .8; }); } }
  for (const t of need) { const id = t.aid[0], mb = am.get(id), a = mb && info.get(mb);
    ART.set(id, a && nameOk(a.name, Core.firstArtist(t.a)) ? { v: vecOf(a.tags), area: a.area, type: a.type, by: a.by, mb, at: Date.now() } : { v: null, at: Date.now() }); }
  artSave();
}
/* Discogs styles for artists the tag sources don't know (new or niche artists); limited to a few per run, remembered afterwards */
async function discogsFill(list, budget) {
  const todo = []; for (const x of list) { const a = ART.get(x.id); if (!x.id || !x.name || (a && (a.v || a.dg))) continue; if (todo.length >= budget.n) break; todo.push(x); }
  budget.n -= todo.length; if (!todo.length || !Cat.Discogs) return;
  await Promise.all(todo.map(async x => { let st = null; try { st = await Cat.Discogs.styles(x.name); } catch { return; }
    const prev = ART.get(x.id) || {}; ART.set(x.id, Object.assign({}, prev, { v: st ? vecOf(st) : null, dg: 1, at: Date.now() })); }));
  artSave();
}
/* which scenes this playlist is about: named styles, reference artists, and (for long histories) where its approvals live */
const REGION = [[/\b(chilean|chileno|spanish|espa(n|ñ)ol|mexican[oa]?|argentin[eao]|latin[oa]?|colombian[oa]?|puerto ?rican|dominican[oa]?|cuban[oa]?)\b/, "es"], [/\b(brazilian|brasileir[oa]|portugu[eê]s)\b/, "pt"], [/\b(french|fran(c|ç)ais)\b/, "fr"], [/\b(korean|k-)/, "ko"], [/\b(japanese|j-)/, "ja"], [/\b(german|deutsch)\b/, "de"], [/\b(italian[oa]?)\b/, "it"], [/\b(uk|british|london)\b/, "uk"]];
function offRegion(tag, want, R) { for (const [re, l] of REGION) if (re.test(tag)) return !re.test(want) && !(R.langs || []).includes(l) && !(l === "uk" && /\b(uk|british|london|grime|drill)\b/i.test(String(R.dir && R.dir.text || ""))); return false; }
function scenesFor(P, S) {
  const W = new Map(); if (!SC) return W; const add = (k, w) => W.set(k, (W.get(k) || 0) + w);
  const era = P.R.era, overlap = sc => !era || !sc.era || (sc.era[0] <= era[1] && sc.era[1] >= era[0]);
  for (const sc of Object.values(SC.SCENES)) {
    /* a scene's first tag is what it is; a looser match on one of its other tags ("electro house" in EDM for "house") counts less */
    /* a regional scene ("chilean trap", "uk hip hop") answers a plain "trap" or "hip hop" only when the request points there */
    let m = 0; for (const p of S.want) sc.tags.forEach((t, i) => { let v = tagSim(p, t); if (v < 1 && (i > 0 || offRegion(t, p, P.R))) v *= .85; m = Math.max(m, v); });
    if (!S.want.length) for (const p of S.broad) for (const t of sc.tags.slice(0, 2)) m = Math.max(m, .6 * tagSim(p, t));
    if (m >= .85 || (!S.want.length && m >= .5)) add(sc.key, m * (overlap(sc) ? 1 : .15));
  }
  /* crowd-pleasers with no style named ("wedding hits everyone knows"): the mainstream scenes everyone knows */
  if (!S.want.length && P.R.crowd && !P.refs.length && !(P.R.dir.artists || []).length && !P.ev.manual.length) for (const k of ["pop_2010s", "pop_2000s", "funk_disco", "latin_pop", "rnb_2000s", "pop_now"]) if (SC.SCENES[k]) add(k, .8);
  /* the artists the user named say the most: their scenes */
  const named = [...P.refs.map(t => (t.aid || [])[0]), ...(P.R.dir.artists || []).map(a => a.id)].filter(Boolean);
  const nm = new Map(); for (const id of named) for (const { key, tier } of kbOf(id)) nm.set(key, (nm.get(key) || 0) + (tier === "core" ? 1 : .8));
  const nmax = Math.max(0, ...nm.values()); for (const [k, v] of nm) if (!S.want.length || W.has(k) || v >= nmax * .99) add(k, 1.2 * v / Math.max(1, nmax));
  /* approvals (not auto-filled): a playlist's history places it in scenes; rejections in a scene pull it down */
  if (!S.want.length) { const ap = new Map(), rj = new Map(); let n = 0;
    for (const t of P.ev.manual) { const m = kbOf((t.aid || [])[0]); if (!m.length) continue; n++; m.forEach(({ key }) => ap.set(key, (ap.get(key) || 0) + 1 / m.length)); }
    for (const r of P.ev.rejected) kbOf((r.t.aid || [])[0]).forEach(({ key }) => rj.set(key, (rj.get(key) || 0) + 1));
    if (n >= 8) for (const [k, v] of ap) { const share = v / n; if (share >= .05 && v >= 2) add(k, Math.min(1, share * 4) * (v + 1) / (v + 1 + .5 * (rj.get(k) || 0))); } }
  const top = [...W].sort((a, b) => b[1] - a[1]).slice(0, 6); const mx = top.length ? top[0][1] : 1;
  return new Map(top.filter(([, v]) => v >= mx * .2).map(([k, v]) => [k, v / mx]));
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
  P.dgBudget = { n: 7 };
  if (want.length) { const unk = [...P.W.values()].filter(c => { const a = ART.get(c.id); return a && !a.v; }).sort((a, b) => b.w - a.w).slice(0, 4).map(c => ({ id: c.id, name: c.name }));
    discogsFill(unk, P.dgBudget).catch(() => {}); /* not awaited: later checks pick the answers up */ }
  const T = new Map(); let tw = 0;
  for (const [t, w] of sample) { const a = ART.get(t.aid[0]); if (!a || !a.v) continue; tw += w; for (const [tag, x] of a.v.slice(0, 6)) T.set(tag, (T.get(tag) || 0) + w * x); }
  if (tw) { const top = [...T].sort((a, b) => b[1] - a[1]).slice(0, 12); const sum = top.reduce((s, x) => s + x[1], 0); S.taste = top.map(([t, w]) => [t, w / sum]);
    const self = sample.map(([t]) => ART.get(t.aid[0])).filter(a => a && a.v).map(a => S.taste.reduce((s, [t, w]) => s + w * bestIn(t, a.v), 0));
    S.ref = Math.max(.15, avg(self) || .3); S.tasteN = self.length; }
  S.info = !!(want.length || broad.length || S.taste.length);
  S.scenes = scenesFor(P, S);
  if (S.scenes.size) S.info = true;
  /* several named styles ("afrobeats and amapiano"): keep a mix of them */
  S.balance = want.length >= 2 && (f.keywords || []).length >= 2 && !want.includes("lo-fi hip hop");
  for (const c of P.W.values()) c.sf = styleFit(c.id, S);
  return S;
}
/* → {fit 0..1 or null, known, wf: fit to the named styles, no: hits a style the user ruled out} */
function styleFit(id, S) {
  const a = ART.get(id), kv = kbVec(id); if ((!a || !a.v) && !kv) return { fit: null, known: false }; if (!S.info) return { fit: null, known: false };
  const V = kv ? [...new Map([...(a && a.v ? a.v : []), ...kv].sort((x, y) => x[1] - y[1]))].sort((x, y) => y[1] - x[1]) : a.v;
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
  /* no style to compare with (a crowd-pleaser request with only scenes): known tags can't rule anyone out */
  if (sf.known) { if (sf.no) return false; if (S.strict) return sf.wf >= .45; return sf.fit == null || !(sf.fit < .1 && sf.n >= 3); }
  return S.strict ? !!trusted : true;
}
const styleScore = (sf, S) => (!S.info ? .5 : sf.known && sf.fit != null ? sf.fit : S.strict ? .4 : .5);

/* ---------- Classic engine ---------- */
const Classic = {
  id: "classic", label: "Classic",
  async generate(ctx, opt) {
    const say = opt.onProgress || (() => {}), stop = () => opt.stopped && opt.stopped();
    const P = await buildProfile(Object.assign({ stopped: opt.stopped }, ctx), say); MBQ.n = 0;
    const S = await styleProfile(P, ctx, say); MBQ.n = 6;
    if (!P.W.size && !P.pool.length && !S.want.length && !(S.scenes && S.scenes.size)) {
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
      .map(c => Object.assign(c, { ws: c.w * (S.info ? .15 + styleScore(c.sf || {}, S) : 1) * (S.strict && S.scenes && S.scenes.size && !c.tags.has("ref") && !c.tags.has("pl") && !kbOf(c.id).some(m => S.scenes.has(m.key)) ? .4 : 1) })).sort((a, b) => b.ws - a.ws); /* chart and playlist artists outside the map's scenes seed less */
    const seeds = []; const sp = pos.slice(0, 60);
    /* a broad taste (many approved artists) gets more, flatter-weighted seeds so one favorite doesn't crowd out the rest */
    const nSeeds = Math.min(20, 12 + Math.floor(pos.filter(c => c.known).length / 15)), flat = pos.filter(c => c.known).length >= 20 ? .5 : 1;
    while (seeds.length < nSeeds && sp.length) { const tot = sp.reduce((s, c) => s + c.ws ** flat, 0); let r = Math.random() * tot, i = 0; for (; i < sp.length; i++) { r -= sp[i].ws ** flat; if (r <= 0) break; } seeds.push(sp.splice(Math.min(i, sp.length - 1), 1)[0]); }
    const base = Math.max(1, ...pos.slice(0, 5).map(c => c.ws));
    const cand = new Map();
    /* "hidden gems": artists with huge followings count for less (Deezer fans) */
    const gem = fans => (!fans || !P.R.avoidHits ? 1 : P.R.gems ? (fans > 400000 ? 0 : 1 / (1 + fans / 60000)) : 1 / (1 + fans / 1500000) ** .6);
    const addC = (id, name, score, from, via, sfrom, song, fans) => { if (!id || !name || P.avoid.has(Core.norm(name)) || blocked({ a: name, aid: [id], t: "" }, P.R)) return;
      noteName(id, name); if (gem(fans) === 0) return; const c = cand.get(id) || { id, name, score: 0, from: new Set(), via, seedFit: 0, fans }; c.score += score * gem(fans) * (P.doubt.has(Core.norm(name)) ? .4 : 1); if (from) c.from.add(from); if (sfrom != null) c.seedFit = Math.max(c.seedFit, sfrom); if (song && !c.song) c.song = song; cand.set(id, c); };
    const firstName = s => String(s || "").split(/\s+(?:&|feat\.?|ft\.?|x|×|with)\s+|,\s*/i)[0].trim();
    say("Exploring artists near your picks…");
    const relJob = Promise.all(seeds.map(async s => { if (stop()) return; try { (await Deezer.related(s.id, 20)).forEach((a, rank) => addC(a.id, a.name, s.ws * (P.ev.manual.length >= 50 && !S.strict ? .6 : 1) / (1 + rank * .12), s.name, "related", seedSF(s), null, a.fans)); } catch { fails++; } }));
    // listeners' habits (ListenBrainz): artists played alongside the seeds, and songs played alongside the seed songs
    const lbJob = Promise.all(seeds.slice(0, seeds.length >= 16 ? 8 : 4).map(async s => { if (stop()) return;
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
    /* no style named but a mood is: listeners' own mood tags on ListenBrainz ("sad", "melancholic") find songs that really have that mood */
    const MOOD_TAGS = { Sad: ["sad", "melancholic"], Chill: ["chill", "chillout"], Romantic: ["love songs", "ballad"], Dark: ["dark"], "Feel-good": ["happy", "feel good"], Hype: ["energetic"], Sensual: ["sensual", "sexy"], Workout: ["energetic"], Focus: ["instrumental", "study"] };
    const moodTags = S.want.length || P.R.crowd ? [] : [...new Set((P.R.form.moods || []).flatMap(m => MOOD_TAGS[m] || []))].slice(0, 3);
    const tagJob = (async () => {
      if ((!S.want.length && !moodTags.length) || stop()) return; say(`Looking up ${(S.want.length ? S.want : moodTags).slice(0, 2).join(" and ")} artists…`);
      const pop = P.R.avoidHits ? [0, 55] : P.R.preferHits ? [60, 100] : [15, 100]; const tags = S.want.length ? S.want.filter(t => t !== "chillhop" && t !== "jazz hop").slice(0, 3) : moodTags;
      const res = await Promise.all(tags.map(tg => Cat.LB.byTag([tg], { popBegin: pop[0], popEnd: pop[1], count: 60 })));
      const recTag = new Map(); res.forEach((r, i) => r.forEach(x => { if (!recTag.has(x.rec)) recTag.set(x.rec, tags[i]); }));
      const meta = await Cat.LB.meta([...recTag.keys()].slice(0, 150)); const cnt = new Map();
      for (const v of meta.values()) { if (!v.a || (P.R.era && v.y && (v.y < P.R.era[0] - 1 || v.y > P.R.era[1] + 1))) continue; const n = firstName(v.a); if (!n) continue; const g = cnt.get(n) || { k: 0, tag: recTag.get(v.rec) }; g.k++; cnt.set(n, g); }
      /* the best-represented artists of each named style, so every style gets its own candidates */
      const top = []; for (const tg of tags) top.push(...[...cnt].filter(([, g]) => g.tag === tg).sort((a, b) => b[1].k - a[1].k).slice(0, Math.ceil(16 / tags.length)));
      const mx = Math.max(1, ...top.map(x => x[1].k));
      await Promise.all(top.map(async ([n, g]) => { if (stop()) return; try { const a = await Deezer.artistByName(n, 300); if (a) addC(a.id, a.name, base * (.45 + .55 * g.k / mx), g.tag, "tag", .6, null, a.fans); } catch {} }));
    })().catch(() => {});
    /* the scene map: the artists who define (core) or carry (next) each scene this playlist is about */
    const kbJob = (async () => {
      if (!S.scenes || !S.scenes.size) return; const gemsK = P.R.gems, seenK = new Set();
      const kbLong = !S.strict && P.ev.manual.length >= 50; /* a long approval history outranks the map */
      for (const [key, w] of S.scenes) { const sc = SC.SCENES[key]; if (!sc) continue;
        const tiers = [["core", sc.core, gemsK ? .35 : P.R.avoidHits ? .85 : 1.1], ["next", sc.next, gemsK ? 1.1 : .85]];
        for (const [tier, list, tw] of tiers) for (const n of list.slice().sort(() => Math.random() - .5).slice(0, 14)) { const e = SIDS[n]; if (!e || seenK.has(e[0])) continue; seenK.add(e[0]); noteName(e[0], n);
          addC(e[0], n, base * w * tw * (kbLong ? .45 : 1), sc.name, "kb", 1, null, e[1]); const c = cand.get(e[0]); if (c) { c.via = c.via === "ref" ? "ref" : "kb"; c.kb = c.kb || { scene: sc.name, tier }; } } }
    })();
    const radio = [];
    const own = pos.filter(c => c.tags.has("ref") || c.tags.has("pl"));
    const radioJob = Promise.all((own.length ? own : pos).slice(0, 3).map(async s => { if (stop()) return; try { const tr = await Deezer.radio(s.id, 25); tr.forEach(t => { t._why = `On ${s.name}'s Deezer radio`; t._trust = !S.strict && seedSF(s) >= .5; }); radio.push(...tr); } catch {} }));
    /* artists the user keeps rejecting: their close neighbours rank lower too */
    const NEG = new Map(); const negJob = Promise.all(P.negIds.map(async id => { try { (await Deezer.related(id, 20)).forEach((a, k) => NEG.set(a.id, (NEG.get(a.id) || 0) + (k < 10 ? 1 : .5))); } catch {} }));
    await Promise.all([relJob, lbJob, recJob, tagJob, radioJob, negJob, kbJob]);
    for (const c of cand.values()) { const n = NEG.get(c.id) || 0; if (n && !(P.W.get(c.id) || {}).known) c.score /= 1 + .7 * n; }
    if (P.R.gems && !stop()) { /* lesser-known artists cluster together: one more hop from the smallest in-style names */
      const small = [...cand.values()].filter(c => c.fans && c.fans < 150000 && c.via !== "lbrec" && styleGate(styleFit(c.id, S), S, true)).sort((a, b) => b.score - a.score).slice(0, 10);
      await Promise.all(small.map(async s => { try { (await Deezer.related(s.id, 20)).forEach((a, rank) => addC(a.id, a.name, s.score * .8 / (1 + rank * .12), s.name, "related", Math.max(.5, s.seedFit), null, a.fans)); } catch {} })); }
    for (const c of pos) if (c.tags.has("ref") && !c.known) { addC(c.id, c.name, Math.max(c.w, base) * 1.2, null, "ref", 1); const cc = cand.get(c.id); if (cc) cc.via = "ref"; }
    const pool = []; const pseen = new Set(); for (const t of radio.concat(P.pool)) { if (pseen.has(t.id) || P.avoid.has(primary(t)) || blocked(t, P.R)) continue; pseen.add(t.id); pool.push(t); }
    /* a playlist with a long approval history leans more on the artists already approved there */
    const broadTaste = !S.strict && P.ev.manual.length >= 50;
    const mixNew = P.pat.similar >= 2 ? .9 : broadTaste ? .6 : .75;
    const fresh = [...cand.values()].filter(c => !P.W.has(c.id) || !P.W.get(c.id).known).map(c => Object.assign(c, { r: c.score * (1 + .25 * (c.from.size - 1)) * (.7 + .6 * Math.random()) })).sort((a, b) => b.r - a.r);
    const known = pos.filter(c => c.known).map(c => ({ id: c.id, name: c.name, score: c.w * .5, from: new Set(), via: "known", seedFit: 1, r: Math.sqrt(c.w) * Math.random() })).sort((a, b) => b.r - a.r);
    if (opt.debug) opt.debug("cand", fresh.slice(0, 120).map(c => [c.name, c.via, +c.score.toFixed(2), c.from.size, c.fans || 0]));
    const order = []; let fi = 0, ki = 0;
    while (order.length < 140 && (fi < fresh.length || ki < known.length)) { if ((Math.random() < mixNew && fi < fresh.length) || ki >= known.length) order.push(fresh[fi++]); else order.push(known[ki++]); }
    if (S.balance) { const byTag = new Map(); order.forEach((c, i) => { if (c.via === "tag") { const tg = [...c.from][0]; const l = byTag.get(tg) || []; if (l.length < 3) l.push(i); byTag.set(tg, l); } });
      const idx = [...byTag.values()].flat().sort((a, b) => b - a); const lift = idx.map(i => order.splice(i, 1)[0]); lift.reverse().forEach((c, j) => order.splice(Math.min(order.length, 2 + j * 2), 0, c)); }
    /* the artists the user named go first, so each of them is represented */
    for (let i = order.length - 1, moved = 0; i >= 0 && moved < 8; i--) if (order[i].via === "ref") { const [c] = order.splice(i, 1); order.unshift(c); moved++; }
    const rpool = radio.length ? pool.slice(0, radio.length) : []; const opool = pool.slice(rpool.length).sort(() => Math.random() - .5);
    const pg = []; for (let i = 0; i < rpool.length; i += 12) pg.push({ pool: true, tracks: rpool.slice(i, i + 12) }); for (let i = 0; i < Math.min(opool.length, 240); i += 12) pg.push({ pool: true, tracks: opool.slice(i, i + 12) });
    pg.forEach((g, i) => order.splice(Math.min(order.length, i * 3 + (i ? 1 : 0)), 0, g));
    const maxScore = Math.max(1, ...fresh.map(c => c.score), ...known.map(c => c.score));
    const trustedC = c => ["ref", "known", "tag", "kb"].includes(c.via) || c.seedFit >= .5 || (c.from.size >= 2 && c.seedFit >= .3);
    // per-artist counts in this playlist (approved + pending) to avoid narrow loops (QUAL-006)
    const songKey = t => Core.norm(Core.baseTitle(t.t) || t.t) + "|" + primary(t);
    const latest = ctx.latest(); const inPl = new Map(); const runKeys = new Set(Object.keys(latest.rels).map(k => ctx.getTrack(k)).filter(Boolean).map(songKey));
    /* per-artist room: pending recommendations count fully; approved songs only beyond a fair share of a big playlist */
    const nAp = Core.idsIn(latest, "APPROVED").length, apShare = Math.max(4, Math.ceil(.08 * nAp)); const apCount = new Map();
    for (const k in latest.rels) { const r = latest.rels[k]; if (r.state === "REJECTED") continue; const t = ctx.getTrack(k); if (!t) continue; const a = primary(t);
      if (r.state === "APPROVED") apCount.set(a, (apCount.get(a) || 0) + 1); else inPl.set(a, (inPl.get(a) || 0) + 1); }
    for (const [a, n] of apCount) inPl.set(a, (inPl.get(a) || 0) + Math.max(0, n - apShare + 4));
    const plCap = P.pat.repetition ? 2 : 4, capNew = P.pat.repetition ? 1 : 2, capKnown = P.pat.repetition ? 0 : broadTaste ? 2 : 1, capRef = P.pat.repetition ? 1 : 3;
    const refIds = new Set(pos.filter(c => c.tags.has("ref")).map(c => c.id)); const isRef = t => refIds.has((t.aid || [])[0]);
    const capOf = t => (isRef(t) ? capRef : capNew);
    const needLang = P.R.langs.length || P.R.notLangs.length; const SW = S.strict ? 1.4 : S.info ? (broadTaste ? 1.2 : .8) : 0;
    const WC = []; const wantIdx = t => { const a = ART.get((t.aid || [])[0]); if (!a || !a.v || !S.balance) return -1; let bi = -1, bv = .5; S.want.forEach((p, i) => { const v = bestIn(p, a.v); if (v > bv + .05) { bv = v; bi = i; } }); return bi; };
    /* era requests: catalog dates are often a reissue's; artists who started long before the era get their song's first release checked on MusicBrainz */
    let eraBudget = 16;
    const eraCheck = async list => { await stylesFor(list.map(x => x.t)); const era = P.R.era;
      await Promise.all(list.map(async x => { const a = ART.get((x.t.aid || [])[0]) || {};
        /* ListenBrainz's "begin" is a birth year for a person and a founding year for a group: careers start about 20 years after birth */
        const start = a.by ? a.by + (a.type === "Person" ? 20 : 0) : null;
        if (start && (start > era[1] || start < era[0] - 30)) { x.eraOut = true; return; }
        /* a song dated after the era by an artist who was already active in it is often a reissue: ask MusicBrainz for its first release */
        const reissue = start && start <= era[1] && x.t.y && x.t.y > era[1];
        if (start && (start < era[0] - 10 || reissue) && eraBudget > 0) { eraBudget--; const y = await MusicBrainz.firstYear(x.t.t, x.t.a).catch(() => null); if (y && y < x.t.y) { x.t.y = y; if (y < era[0] || y > era[1]) x.eraOut = true; } } })); };
    const alang = new Map(); const noteLang = t => { const L = t && t.lang; if (!L || L.src !== "lyrics" || !L.main) return; const a = primary(t); const c = alang.get(a) || { n: 0, by: {} }; c.n++; c.by[L.main] = (c.by[L.main] || 0) + 1; const [m, k] = Object.entries(c.by).sort((u, v) => v[1] - u[1])[0]; c.main = m; c.top = k; alang.set(a, c); };
    Object.keys(latest.rels).forEach(k => noteLang(ctx.getTrack(k)));
    let buf = [];
    const flush = async (last) => {
      if (!buf.length) return; const b = buf; buf = [];
      say(`Checking energy, mood${needLang ? " and language" : ""}… ${found}/${target} found`);
      /* languages are only waited for when the direction has language rules; otherwise they fill in afterwards */
      await featuresFor(b.map(x => x.t), ctx.saveTracks);
      if (needLang) { /* lyrics look-ups are the slow part: only for the songs that could make the cut */
        const pre = b.map(x => ({ x, s: fitOf(x.t, P).fit - penalty(x.t, P) + .5 * (x.as / maxScore) + (isRef(x.t) ? .3 : 0) })).sort((u, v) => v.s - u.s);
        const keepN = Math.min(b.length, Math.ceil(Math.max(1, target - found) * 1.5) + 2); b.length = 0; pre.slice(0, keepN).forEach(o => b.push(o.x));
        /* an artist with 2+ songs already confirmed in one language: their other songs are taken to be in it too */
        for (const x of b) { if (x.t.lang) continue; const c = alang.get(primary(x.t)); if (c && c.n >= 2 && c.n === c.top) x.t.lang = { main: c.main, langs: [c.main], src: "artist" }; }
        await langsFor(b.map(x => x.t), ctx.saveTracks, true).catch(() => {}); b.forEach(x => noteLang(x.t));
      } else langsFor(b.map(x => x.t), ctx.saveTracks, false).catch(() => {}); /* fills in afterwards */
      if (P.R.era) await eraCheck(b);
      /* last word on style: whatever path a song came by, an off-style lead artist doesn't get in */
      if (S.strict) { const unk = b.filter(x => !(ART.get((x.t.aid || [])[0]) || {}).v); if (unk.length) { MBQ.n = Math.max(MBQ.n, Math.min(4, unk.length)); await stylesFor(unk.map(x => x.t), { retry: true }); } }
      const styleOk = x => { if (!S.strict) return true; const sf = styleFit((x.t.aid || [])[0], S); return !sf.known || styleGate(sf, S, true); };
      const sc = b.filter(x => !x.eraOut && styleOk(x) && !eligible(x.t, P.R, ctx.getTrack)).map(x => { const { fit, known, asked, est } = fitOf(x.t, P); const pen = penalty(x.t, P);
        const negP = (P.doubt.has(primary(x.t)) ? .5 : 0) + .25 * Math.min(2, NEG.get((x.t.aid || [])[0]) || 0);
        const km = (broadTaste ? .5 : 1) * (S.scenes && S.scenes.size ? kbOf((x.t.aid || [])[0]).reduce((u, { key, tier }) => Math.max(u, (S.scenes.get(key) || 0) * (tier === "core" ? (P.R.gems ? .1 : .3) : (P.R.gems ? .4 : .25))), 0) : 0);
        /* crowd-pleasers: songs most people know, clean when possible; little-known songs are a poor fit for a wedding */
        const crowdB = P.R.crowd ? .8 * Math.min(1, (x.t.rank || 0) / 700000) - ((x.t.rank || 0) < 250000 ? .35 : 0) - (x.t.exp === "explicit" ? .25 : 0) : 0;
        const refB = isRef(x.t) ? .3 : 0; const yd = P.yr && x.t.y ? (x.t.y < P.yr.lo ? P.yr.lo - x.t.y : x.t.y > P.yr.hi ? x.t.y - P.yr.hi : 0) : 0; const yearP = .12 * Math.min(4, yd);
        const wi = wantIdx(x.t); const mix = S.balance && wi >= 0 && (WC[wi] || 0) < (found + 1) / S.want.length ? .35 : 0;
        /* unless hits are unwanted, a scene's well-known songs are the safer picks */
        const hot = P.R.avoidHits ? .6 * Math.max(0, Math.min(1, ((x.t.rank || 0) - (P.R.gems ? 250000 : 450000)) / 400000)) : P.R.preferHits ? 0 : -.25 * Math.min(1, (x.t.rank || 0) / 700000);
        return Object.assign(x, { fit, wi, s: .7 * (x.as / maxScore) + 1.1 * fit + SW * styleScore(x.sf || {}, S) + .25 * Math.random() - pen - hot + mix + refB - yearP - negP + km + crowdB, ok: !(known && fit < (isRef(x.t) && !P.moodT.length ? .3 : asked ? (P.home && P.moodT.length ? .55 : .42) : .35) - (est ? .05 : 0)) && pen < 1.2 && !(P.R.avoidHits && x.t.f && x.t.f.pop >= 85) && !learnedOut(x.t, P) && !homeOut(x.t, P)
          /* "hits everyone knows" with no style named: songs most people know; a request for songs with no style named: no symphonies */
          && !(P.R.crowd && x.t.rank && x.t.rank < (P.home ? 450000 : 250000)) && !(P.home && CLASSICAL.test(x.t.t)) }); });
      if (opt.debug) opt.debug("flush", sc.map(x => [x.t.t, primary(x.t), x.ok, +x.s.toFixed(2), +x.fit.toFixed(2), x.why.slice(0, 30)]));
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
      if (S.strict) await discogsFill(group.filter(c => !c.pool && (ART.get(c.id) || {}).v === null).sort((a, b) => (trustedC(b) - trustedC(a)) || b.score - a.score).slice(0, 1).map(c => ({ id: c.id, name: c.name })), P.dgBudget);
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
          if (Core.findDuplicate(cur, t0, ctx.getTrack) || runKeys.has(songKey(t0))) continue;
          if ((c.via === "known" || c.via === "ref") && (t0.aid || [])[0] !== c.id) continue; /* their own songs, not guest spots on someone else's */
          let sf = c.sf; if (c.pool) { sf = styleFit((t0.aid || [])[0], S); if (!styleGate(sf, S, t0._trust)) continue; if (broadTaste && !(sf.known && sf.fit >= .35)) continue; }
          else if ((t0.aid || [])[0] !== c.id) { const lead = styleFit(t0.aid[0], S); if (lead.known && !styleGate(lead, S, true)) continue; }
          picks.push({ c, t0, sf }); runKeys.add(songKey(t0)); got++;
        }
      });
      /* a featured guest can't carry a song whose lead artist is off-style ("Victory Lap — Fred again.. feat. Skepta") */
      if (S.strict) { await stylesFor(picks.map(p => p.t0)); for (let i = picks.length - 1; i >= 0; i--) { const p = picks[i]; if (p.c.pool || (p.t0.aid || [])[0] === p.c.id) continue; const lead = styleFit(p.t0.aid[0], S); if (!lead.known || !styleGate(lead, S, true)) picks.splice(i, 1); } }
      /* the song's own tags (when listeners tagged it) must not contradict the style: a grime MC's house crossover is out */
      if ((S.strict || (broadTaste && S.taste.length)) && picks.length) { try { const m = await Cat.LB.lookup(picks.map(p => ({ id: p.t0.id, t: p.t0.t, a: p.t0.a }))); const tg = await Cat.LB.tags([...m.values()].map(v => v.rec), { own: true });
        for (let i = picks.length - 1; i >= 0; i--) { const v = m.get(picks[i].t0.id); const T = v && tg.get(v.rec); if (!T) continue; const tot = Object.values(T).reduce((a, b) => a + b, 0); if (tot < 3) continue; const V = vecOf(T); if (!V) continue;
          const no = S.notS.some(n => V.slice(0, 3).some(([t, w]) => w >= .6 && tagSim(n, t) >= .9));
          /* named styles: the song must carry one; a long-running playlist: the song must resemble its taste (an artist's country album doesn't) */
          const off = S.strict ? Math.max(...S.want.map(p => bestIn(p, V))) < .2 : S.taste.reduce((u, [t, w]) => u + w * bestIn(t, V), 0) / S.ref < .12;
          if (no || off) picks.splice(i, 1); } } catch {} }
      const full = await Promise.all(picks.map(p => (p.t0.full && p.t0.y ? Promise.resolve(p.t0) : Deezer.track(p.t0.dz).then(t => (t ? Object.assign(t, { _why: p.t0._why }) : null)).catch(() => { fails++; return null; }))));
      full.forEach((t, k) => {
        if (!t) return; checked++;
        /* dated after the era by an artist active in it: maybe a reissue, so the year is checked later instead of here */
        const aa = ART.get((t.aid || [])[0]) || {}, by = aa.by ? aa.by + (aa.type === "Person" ? 20 : 0) : null, maybeReissue = P.R.era && t.y > P.R.era[1] && by && by <= P.R.era[1];
        if (eligible(Object.assign({}, t, { lang: null }, maybeReissue ? { y: null } : {}), P.R, ctx.getTrack)) return;
        const c = picks[k].c; const from = [...(c.from || [])].filter(Boolean).slice(0, 2);
        const why = c.pool ? picks[k].t0._why : c.via === "known" ? `More from ${c.name}, already on this playlist` : c.via === "ref" ? `By ${c.name}, one of your reference artists`
          : c.via === "lb" ? `People who play ${from[0]} also play ${c.name}` : c.via === "lbrec" ? `Listeners of “${c.song}” also play ${c.name}` : c.via === "tag" ? `Tagged ${from[0] || "this style"} on ListenBrainz` : c.via === "kb" && c.kb ? (c.kb.tier === "core" ? `One of the artists who define ${c.kb.scene}` : `A newer or deeper name in ${c.kb.scene}`) : (from.length ? `Similar to ${from.join(" and ")}` : "Close to this playlist's artists");
        buf.push({ t, why, as: c.pool ? maxScore * (t._trust ? .6 : .4) : c.score, sf: picks[k].sf });
      });
      if (opt.debug) opt.debug("group", group.map((c, k) => `${c.pool ? "pool" : c.name}:${c.pool ? "" : (c.sf && c.sf.known && c.sf.fit != null ? c.sf.fit.toFixed(2) : "?") + (styleGate(c.sf || {}, S, trustedC(c)) ? "" : "✗gate")}:${tops[k].length}`).join(" ") + ` → ${picks.length} picked, buf ${buf.length}`);
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
    async models(key) { const d = await Cat.getJSON("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } }).catch(e => { throw e.status === 400 || e.status === 401 || e.status === 403 ? aiError(401) : !e.status ? new Core.OpError("AI_NET", "Couldn't reach Google. Check your connection.") : aiError(e.status); });
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
      const j = await postJSON("https://openrouter.ai/api/v1/chat/completions", { Authorization: "Bearer " + key, "HTTP-Referer": (G.location && G.location.origin) || "https://nymph-exe.github.io", "X-Title": "MIXER" },
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
  const recent = m => memo.bad && memo.bad[m] && Date.now() - memo.bad[m] < 30 * 60e3;
  let order = p.rank(a.models || []).filter(m => !avoid.has(m) && !spent(m) && !recent(m));
  if (!order.length) order = p.rank(a.models || []).filter(m => !avoid.has(m) && !spent(m)).sort((x, y) => memo.bad[x] - memo.bad[y]).slice(0, 3); /* all failed lately: try the ones that failed longest ago */
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
  const blocks = []; for (const e of [...(ex.artists || []), ...(never || [])]) Arts.add(blocks, e);
  if (blocks.length) L.push("Never suggest songs by or featuring these artists (other artists who only share a name are fine): " + blocks.map(e => { const a = Arts.describe(e); return Arts.nameOf(e) + (a ? ` (${a})` : ""); }).join(", "));
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
    const auto = !a.model || a.model === "auto"; const avoid = new Set(); let last = null;
    for (let tries = 0; tries < (p.noProbe ? 2 : 4); tries++) {
      let model; try { model = auto ? await workingModel(a, p, avoid, say) : a.model; } catch (e) { if (e.code === "AI_NONE" && last) break; throw e; }
      try { say && say(`Asking ${p.label.replace(/ \(.*\)/, "")} (${model})…`); const out = parseJSON(await p.chat(a.key, model, sys, user)); a.used = model;
        if (auto) { const memo = a.memo || (a.memo = {}); const was = memo.model; Object.assign(memo, { model, at: Date.now() }); if (was !== model && a.onMemo) a.onMemo(memo); } return out; }
      catch (e) {
        last = e;
        if (typeof console !== "undefined") console.warn("[ai]", p.label, model, e.code || e.name, e.message);
        if (e.code === "AI_DAILY" && p.dailyPerModel) { const memo = a.memo || (a.memo = {}); memo.day = Object.assign(memo.day || {}, { [model]: dayKey() }); if (memo.model === model) delete memo.model; if (a.onMemo) a.onMemo(memo); avoid.add(model); if (auto) continue; throw new Core.OpError("AI_DAILY", `Today's free requests for ${model} are used up. Set this playlist's model to Automatic to use your other Gemini models.`); }
        if (e.code === "AI_DAILY") throw e;
        const retryable = ["AI_TIMEOUT", "AI_BUSY", "AI_GONE", "AI_QUOTA", "AI_PARSE", "AI_HTTP"].includes(e.code);
        if (auto && retryable) { avoid.add(model); if (e.code !== "AI_PARSE") { const memo = a.memo || (a.memo = {}); memo.bad = Object.assign(memo.bad || {}, { [model]: Date.now() }); if (memo.model === model) delete memo.model; if (a.onMemo) a.onMemo(memo); } continue; }
        if (!auto && retryable) throw new Core.OpError(e.code, `${e.message} (${model}). In this playlist's settings, set the model to Automatic so the app can switch to one that's answering.`);
        throw e;
      }
    }
    throw new Core.OpError("AI_NONE", `None of your models gave a usable answer${last && last.message && last.code !== "AI_NONE" ? ` (last problem: ${last.message.split(/(?<=\.)\s/)[0].replace(/\.$/, "").replace(/^./, c => c.toLowerCase())})` : ""}. Try again later, or switch this playlist to Classic.`);
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
      const v = await verifyAll(songsOf(j && j.songs).slice(0, 50), R, Object.assign({ stopped: opt.stopped }, ctx), say, "Checking each song in the catalog");
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
    const picks = []; for (const n of arr(j && j.pick)) { const t = pend[(+n) - 1]; if (t && !picks.some(p => p.id === t.id) && picks.length < slots) picks.push({ id: t.id }); }
    let fresh = [], missing = [];
    const nu = songsOf(j && j.new);
    if (picks.length < slots && nu.length) { const v = await verifyAll(nu.slice(0, slots - picks.length + 5), R, Object.assign({ stopped: opt.stopped }, ctx), say, "Checking each song in the catalog"); fresh = v.ok.slice(0, slots - picks.length); missing = v.missing; }
    return { picks, fresh, missing };
  }
};

/* ---------- AI answers are untrusted: keep only the shapes the app expects ---------- */
const arr = x => (Array.isArray(x) ? x : []);
const str = x => (typeof x === "string" ? x : typeof x === "number" ? String(x) : "").trim().slice(0, 300);
const songsOf = x => arr(x).filter(it => it && typeof it === "object").map(it => ({ title: str(it.title), artist: str(it.artist), why: str(it.why) })).filter(it => it.title);
const namesOf = x => (typeof x === "string" ? x.split(/\s*,\s*/) : arr(x)).map(n => (n && typeof n === "object" ? str(n.name) : str(n))).filter(Boolean);
function cleanReading(j) {
  j = j && typeof j === "object" ? j : {}; const t = j.traits && typeof j.traits === "object" ? j.traits : {};
  const nums = x => (Array.isArray(x) && x.length >= 2 && x.slice(0, 2).every(n => Number.isFinite(+n)) ? [+x[0], +x[1]] : null);
  return { name: str(j.name).slice(0, 100), summary: str(j.summary), verifyNames: !!j.verifyNames,
    include: songsOf(j.include), references: songsOf(j.references), excludeSongs: songsOf(j.excludeSongs),
    referenceArtists: namesOf(j.referenceArtists), excludeArtists: namesOf(j.excludeArtists),
    maybeArtists: arr(j.maybeArtists).filter(c => c && typeof c === "object" && str(c.name)).map(c => ({ name: str(c.name), role: c.role === "ex" ? "ex" : "ref" })),
    traits: { genres: namesOf(t.genres), moods: namesOf(t.moods), keywords: namesOf(t.keywords), notStyles: namesOf(t.notStyles), languages: namesOf(t.languages), notLanguages: namesOf(t.notLanguages),
      energy: str(t.energy), tempo: str(t.tempo), explicit: str(t.explicit) || "any", bpm: nums(t.bpm), era: nums(t.era),
      versions: t.versions === true, avoidHits: t.avoidHits === true, preferHits: t.preferHits === true, gems: t.gems === true, crowd: t.crowd === true } };
}

/* ---------- reading → direction (shared by the Classic reader and the AI reader) ----------
   Every song and artist is looked up in the catalog first; anything that can't be found is reported, never invented. */
async function applyReading(j, st, o = {}) {
  j = cleanReading(j);
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
  /* an artist to leave out is saved by ID once it's found; a name that can't be checked right now stays a plain
     name (exact full-name match only) and the editor offers to pick the artist later */
  const ban = a => Arts.add(d.exclude.artists, { name: a.name, dz: [a.id] });
  for (const n of (j.excludeArtists || []).filter(Boolean).slice(0, 40)) {
    const a = await artist(n, strict ? (capd(n) ? 500 : 5000) : 0);
    if (a === OFF) { if (!strict || capd(n)) Arts.add(d.exclude.artists, n); else unchecked.push(n); }
    else if (a) ban(a); else if (!strict) Arts.add(d.exclude.artists, n); else missing.push(n); }
  for (const c of (j.maybeArtists || []).slice(0, 10)) { const a = await artist(c.name, 30000); if (!a || a === OFF) continue;
    if (c.role === "ex") ban(a); else if (!d.artists.some(x => x.id === a.id)) d.artists.push({ id: a.id, name: a.name }); }
  const tr = j.traits || {}, f = d.form; const gl = o.genres || [];
  for (const n of (tr.genres || []).filter(Boolean)) { const g = gl.find(x => Core.norm(x.name) === Core.norm(n)); const item = g ? { id: g.id, name: g.name } : { id: null, name: n };
    const have = (f.genres || []).find(x => Core.norm(x.name) === Core.norm(item.name)); if (!have) f.genres = [...(f.genres || []), item]; else if (!have.id && item.id) have.id = item.id; }
  /* moods the app knows become moods; any other word is kept as a style keyword instead of a mood it can't use */
  for (const m0 of (tr.moods || []).filter(Boolean)) { const m = Object.keys(MOODS).find(k => Core.norm(k) === Core.norm(m0));
    if (m) { if (!(f.moods || []).includes(m)) f.moods = [...(f.moods || []), m]; } else if (!/^\d+$/.test(m0) && !(f.keywords || []).includes(m0.toLowerCase())) f.keywords = [...(f.keywords || []), m0.toLowerCase()]; }
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
  if (tr.crowd || /\b(wedding|boda|road ?trip|karaoke|sing-?along|family|familia|graduation|graduaci[oó]n|quincea[nñ]era|bbq|barbecue|carne asada|reunion|reuni[oó]n)\b/i.test(txt)) f.crowd = true;
  if (tr.versions) f.versions = true; if (tr.avoidHits) { f.avoidHits = true; f.preferHits = false; }
  if (tr.gems || /\b(hidden gems?|underground|deep cuts?|lesser[- ]known|obscure|under the radar|joyitas?|poco conocid[oa]s?)\b/i.test(txt)) { f.gems = true; f.avoidHits = true; f.preferHits = false; } if (tr.preferHits && !f.avoidHits) f.preferHits = true;
  return { summary: j.summary || "", missing: [...new Set(missing)], unchecked: [...new Set(unchecked)] };
}

const API = { workingModel, applyReading, cleanReading, Classic, styleProfile, styleFit, stylesFor, MBQ, scenesFor, kbOf, wantStyles, tagSim, ART, AI, PROVIDERS, MOODS, ENERGY, TEMPO, rules, eligible, blocked, langVerdict, buildProfile, fitOf, directionBlock, stateBlock, parseJSON, featuresFor, langsFor, vibe, reasonsOf };
G.Engines = API;
if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

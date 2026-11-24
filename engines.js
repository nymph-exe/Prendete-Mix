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
    avoidHits: !!form.avoidHits, preferHits: !!form.preferHits, langs: form.langs || [], notLangs: form.notLangs || [] };
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
  if (R.explicit === "clean" && t.exp === "explicit") return "explicit";
  if (R.explicit === "explicit" && t.exp === "clean") return "clean";
  if (R.era && t.y && (t.y < R.era[0] || t.y > R.era[1])) return "era";
  if (R.avoidHits && ((t.rank || 0) > 750000 || (t.f && t.f.pop >= 85))) return "hit";
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
  if (P.tgt.e) parts.push(fitRange(f.e, P.tgt.e)); if (P.tgt.bpm) parts.push(fitRange(bpmOf(f.bpm), P.tgt.bpm, 8));
  for (const m of P.moodT) { const xs = Object.entries(m).map(([k, r]) => fitRange(k === "bpm" ? bpmOf(f.bpm) : f[k], r, k === "bpm" ? 10 : .12)).filter(x => x != null); if (xs.length) parts.push(avg(xs)); }
  const pf = Object.entries(P.prof).map(([k, [m, sd]]) => f[k] == null ? null : Math.exp(-(((f[k] - m) / sd) ** 2) / 2)).filter(x => x != null);
  const a = avg(parts.filter(x => x != null)), b = avg(pf);
  const fit = a != null && b != null ? (a + b) / 2 : a != null ? a : b != null ? b : .5;
  return { fit, known: a != null || b != null };
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

/* ---------- Classic engine ---------- */
const Classic = {
  id: "classic", label: "Classic",
  async generate(ctx, opt) {
    const say = opt.onProgress || (() => {}), stop = () => opt.stopped && opt.stopped();
    const P = await buildProfile(Object.assign({ stopped: opt.stopped }, ctx), say);
    if (!P.W.size && !P.pool.length && P.fails) throw new Core.OpError("OFFLINE", "Couldn't reach Deezer to look for songs. Check your connection and try again. Nothing changed.");
    if (!P.W.size && !P.pool.length) throw new Core.OpError("NO_SEEDS", "Add a genre, mood, artist or song to this playlist's direction (or approve a few songs) so Classic has a starting point.");
    const target = opt.target; let found = 0, checked = 0, fails = 0;
    const seen = new Set();
    // candidate artists: Deezer related + ListenBrainz similar
    const pos = [...P.W.values()].filter(c => c.w > 0).sort((a, b) => b.w - a.w);
    const seeds = []; const sp = pos.slice(0, 60);
    while (seeds.length < 14 && sp.length) { const tot = sp.reduce((s, c) => s + c.w, 0); let r = Math.random() * tot, i = 0; for (; i < sp.length; i++) { r -= sp[i].w; if (r <= 0) break; } seeds.push(sp.splice(Math.min(i, sp.length - 1), 1)[0]); }
    const cand = new Map(); const addC = (id, name, score, from, via) => { if (!id || P.avoid.has(Core.norm(name)) || blocked({ a: name, t: "" }, P.R)) return; const c = cand.get(id) || { id, name, score: 0, from: new Set(), via }; c.score += score; if (from) c.from.add(from); cand.set(id, c); };
    const lbJob = (async () => {
      for (const s of seeds.slice(0, 3)) {
        if (stop()) return; const mbid = await MusicBrainz.artistMbid(s.name); if (!mbid) continue;
        const sim = await ListenBrainz.similar(mbid, 10); const max = Math.max(1, ...sim.map(x => x.score));
        await Promise.all(sim.map(async x => { if (stop() || P.avoid.has(Core.norm(x.name))) return; try { const a = await Deezer.artistByName(x.name); if (a) addC(a.id, a.name, s.w * .8 * (x.score / max), s.name, "lb"); } catch {} }));
      }
    })().catch(() => {});
    say("Exploring artists near your picks…");
    await Promise.all(seeds.map(async s => { if (stop()) return; try { (await Deezer.related(s.id, 20)).forEach((a, rank) => addC(a.id, a.name, s.w / (1 + rank * .12), s.name, "related")); } catch { fails++; } }));
    await lbJob;
    for (const c of pos) if (c.tags.has("ref") && !c.known) addC(c.id, c.name, c.w * .6, null, "ref");
    const mixNew = P.pat.similar >= 2 ? .9 : .75;
    const fresh = [...cand.values()].filter(c => !P.W.has(c.id) || !P.W.get(c.id).known).map(c => Object.assign(c, { r: c.score * (.7 + .6 * Math.random()) })).sort((a, b) => b.r - a.r);
    const known = pos.filter(c => c.known).map(c => ({ id: c.id, name: c.name, score: c.w * .5, from: new Set(), via: "known" })).sort(() => Math.random() - .5);
    const order = []; let fi = 0, ki = 0;
    while (order.length < 120 && (fi < fresh.length || ki < known.length)) { if ((Math.random() < mixNew && fi < fresh.length) || ki >= known.length) order.push(fresh[fi++]); else order.push(known[ki++]); }
    if (P.pool.length) for (let i = 0; i < P.pool.length; i += 12) order.splice(Math.min(order.length, Math.floor(i / 12) * 3), 0, { pool: true, tracks: P.pool.slice(i, i + 12) });
    const maxScore = Math.max(1, ...fresh.map(c => c.score), ...known.map(c => c.score));
    // per-artist counts in this playlist (approved + pending) to avoid narrow loops (QUAL-006)
    const latest = ctx.latest(); const inPl = new Map();
    for (const k in latest.rels) { const r = latest.rels[k]; if (r.state === "REJECTED") continue; const t = ctx.getTrack(k); if (t) inPl.set(primary(t), (inPl.get(primary(t)) || 0) + 1); }
    const plCap = P.pat.repetition ? 2 : 4, capNew = P.pat.repetition ? 1 : 2, capKnown = P.pat.repetition ? 0 : 1;
    const needLang = P.R.langs.length || P.R.notLangs.length;
    let buf = [];
    const flush = async () => {
      if (!buf.length) return; const b = buf; buf = [];
      say(`Checking energy, mood${needLang ? " and language" : ""}… ${found}/${target} found`);
      await Promise.all([featuresFor(b.map(x => x.t), ctx.saveTracks), langsFor(b.map(x => x.t), ctx.saveTracks, !!needLang)]);
      const sc = b.filter(x => !eligible(x.t, P.R, ctx.getTrack)).map(x => { const { fit, known } = fitOf(x.t, P); const pen = penalty(x.t, P);
        return Object.assign(x, { fit, s: .9 * (x.as / maxScore) + 1.3 * fit + .3 * Math.random() - pen, ok: !(known && fit < .35) && pen < 1.2 && !(P.R.avoidHits && x.t.f && x.t.f.pop >= 85) }); });
      const keep = sc.filter(x => x.ok).sort((a, b) => b.s - a.s).slice(0, Math.max(0, target - found));
      if (!keep.length) return;
      const r = await opt.onBatch(keep.map(x => { const v = vibe(x.t.f); return { t: x.t, why: x.why + (v ? `, ${v}` : "") }; }));
      found += r.added; keep.forEach(x => { if (r.addedIds && r.addedIds.includes(x.t.id)) inPl.set(primary(x.t), (inPl.get(primary(x.t)) || 0) + 1); });
    };
    for (let gi = 0; gi < order.length && !stop() && found < target; gi += 4) {
      const group = order.slice(gi, gi + 4);
      const tops = await Promise.all(group.map(c => (c.pool ? Promise.resolve(c.tracks) : Deezer.top(c.id, 10).catch(() => { fails++; return []; }))));
      const cur = ctx.latest(); if (!cur || cur.epoch !== P.epoch) throw new Core.OpError("STALE", "The playlist changed while searching.");
      const picks = [];
      group.forEach((c, k) => {
        const cap = c.pool ? 3 : c.via === "known" ? capKnown : capNew; let got = 0;
        for (const t0 of tops[k]) {
          if (got >= cap || found + buf.length + picks.length >= target + 6) break;
          if (seen.has(t0.id)) continue; seen.add(t0.id);
          const art = primary(t0); if ((inPl.get(art) || 0) >= plCap || P.avoid.has(art)) continue;
          if ([...buf, ...picks].filter(x => primary(x.t0 || x.t) === art).length >= capNew) continue;
          if (eligible(Object.assign({}, t0, { y: null }), P.R, ctx.getTrack)) continue;
          if (Core.findDuplicate(cur, t0, ctx.getTrack)) continue;
          picks.push({ c, t0 }); got++;
        }
      });
      const full = await Promise.all(picks.map(p => (p.t0.full && p.t0.y ? Promise.resolve(p.t0) : Deezer.track(p.t0.dz).then(t => (t ? Object.assign(t, { _why: p.t0._why }) : null)).catch(() => { fails++; return null; }))));
      full.forEach((t, k) => {
        if (!t) return; checked++; if (eligible(Object.assign({}, t, { lang: null }), P.R, ctx.getTrack)) return;
        const c = picks[k].c; const from = [...(c.from || [])].filter(Boolean).slice(0, 2);
        const why = c.pool ? picks[k].t0._why : c.via === "known" ? `More from ${c.name}, already on this playlist` : c.via === "ref" ? `By ${c.name}, one of your reference artists` : c.via === "lb" ? `People who play ${from[0]} also play ${c.name}` : `Near ${from.join(" and ") || c.name}`;
        buf.push({ t, why, as: c.pool ? maxScore * .5 : c.score });
      });
      if (buf.length >= 8) await flush();
      say(`Finding songs… ${found}/${target} found`);
    }
    await flush();
    if (!found && !checked && fails && !stop()) throw new Core.OpError("OFFLINE", "Couldn't reach Deezer to look for songs. Check your connection and try again. Nothing changed.");
    return { found, checked };
  },
  async fill(ctx, slots, opt = {}) {
    const say = opt.onProgress || (() => {});
    const P = await buildProfile(Object.assign({ stopped: opt.stopped }, ctx), say);
    say(`Weighing ${P.ev.pending.length} recommendations…`);
    const pend0 = P.ev.pending.slice(-240);
    await Promise.all([featuresFor(pend0, ctx.saveTracks), (P.R.langs.length || P.R.notLangs.length) ? langsFor(pend0.slice(-120), ctx.saveTracks, true) : null]);
    const pend = pend0.filter(t => !eligible(t, P.R, ctx.getTrack, { allowVersions: true }));
    const apBy = new Map(); for (const id of P.pl.order) { const t = ctx.getTrack(id); if (t) apBy.set(primary(t), (apBy.get(primary(t)) || 0) + 1); }
    const sc = pend.map(t => { const { fit, known } = fitOf(t, P); const pen = penalty(t, P); return { t, fit, s: 1.4 * fit - pen + (P.W.has((t.aid || [])[0]) ? .2 : 0), ok: !(known && fit < .35) && pen < 1.2 }; }).filter(x => x.ok).sort((a, b) => b.s - a.s);
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
  if (status === 429) return E("AI_QUOTA", "The free limit for that model is used up for now.");
  if (status === 400 && /thinking/i.test(m)) return E("AI_THINK", m);
  return E("AI_HTTP", "The AI service had a problem (" + status + ").");
}
async function postJSON(url, headers, body, timeout = 120000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
  try { const r = await fetch(url, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers), body: JSON.stringify(body), signal: ac.signal });
    let j = null; try { j = await r.json(); } catch {} if (!r.ok) throw aiError(r.status, j); return j;
  } catch (e) { if (e.name === "AbortError") throw new Core.OpError("AI_TIMEOUT", "That model took too long to answer."); if (e instanceof Core.OpError) throw e; throw new Core.OpError("AI_NET", "Couldn't reach the AI service. Check your connection."); }
  finally { clearTimeout(t); }
}
const gemVer = id => { const m = /gemini-(\d+(?:\.\d+)?)/.exec(id); return m ? +m[1] : 0; };
const PROVIDERS = {
  gemini: { label: "Google Gemini", note: "Free key from Google AI Studio", keyUrl: "https://aistudio.google.com/apikey",
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
      const c = (j.candidates || [])[0]; return ((c && c.content && c.content.parts) || []).map(p => p.text || "").join(""); } },
  openrouter: { label: "OpenRouter (free models)", note: "Free key from OpenRouter", keyUrl: "https://openrouter.ai/keys",
    async models() { const d = await Cat.getJSON("https://openrouter.ai/api/v1/models"); return (d.data || []).filter(m => /:free$/.test(m.id)).map(m => ({ id: m.id, name: m.name || m.id, ctx: m.context_length || 0 })).sort((a, b) => b.ctx - a.ctx); },
    rank(list) { const pref = m => (/deepseek|gemini|llama-3\.3|qwen3|gpt-oss|mistral/i.test(m.id) ? 0 : 1); return list.slice().sort((a, b) => pref(a) - pref(b) || b.ctx - a.ctx).map(m => m.id); },
    pick() { return "auto"; },
    async chat(key, model, sys, user, o = {}) {
      const j = await postJSON("https://openrouter.ai/api/v1/chat/completions", { Authorization: "Bearer " + key, "HTTP-Referer": (G.location && G.location.origin) || "https://nymph-exe.github.io", "X-Title": "Préndete Mix" },
        { model, temperature: .9, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }, o.timeout);
      if (j && j.error) throw aiError(j.error.code || 0, j);
      return ((j.choices || [])[0] || {}).message ? j.choices[0].message.content || "" : ""; } },
  claude: { label: "Claude (your subscription)", wip: true },
  chatgpt: { label: "ChatGPT (your subscription)", wip: true }
};
/* Automatic model: probe several models at once with a tiny request and use the best-ranked one that answers.
   The choice is remembered (ctx.ai.memo) and replaced when that model fails later. */
async function workingModel(a, p, avoid = new Set(), say) {
  const memo = a.memo || {}; const fresh = memo.model && Date.now() - (memo.at || 0) < 30 * 60e3 && !avoid.has(memo.model);
  if (fresh) return memo.model;
  const order = p.rank(a.models || []).filter(m => !avoid.has(m) && !(memo.bad && memo.bad[m] && Date.now() - memo.bad[m] < 30 * 60e3));
  if (!order.length) throw new Core.OpError("AI_NONE", "None of your models are answering right now. Try again in a few minutes, or switch this playlist to Classic.");
  for (let i = 0; i < order.length; i += 6) {
    say && say("Finding a model that's answering…");
    const batch = order.slice(i, i + 6);
    const res = await Promise.all(batch.map(m => p.chat(a.key, m, "Reply with JSON only.", 'Return {"ok":true}', { timeout: 15000 }).then(() => true).catch(e => { if (e.code === "AI_KEY") throw e; memo.bad = Object.assign(memo.bad || {}, { [m]: Date.now() }); return false; })));
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
    for (let tries = 0; tries < 4; tries++) {
      const model = auto ? await workingModel(a, p, avoid, say) : a.model;
      try { say && say(`Asking ${p.label.replace(/ \(.*\)/, "")} (${model})…`); const out = parseJSON(await p.chat(a.key, model, sys, user)); a.used = model; return out; }
      catch (e) {
        const retryable = ["AI_TIMEOUT", "AI_BUSY", "AI_GONE", "AI_QUOTA", "AI_PARSE"].includes(e.code);
        if (auto && retryable) { avoid.add(model); const memo = a.memo || (a.memo = {}); memo.bad = Object.assign(memo.bad || {}, { [model]: Date.now() }); if (memo.model === model) delete memo.model; if (a.onMemo) a.onMemo(memo); continue; }
        if (!auto && retryable) throw new Core.OpError(e.code, `${e.message} (${model}). In this playlist's settings, set the model to Automatic so the app can switch to one that's answering.`);
        throw e;
      }
    }
    throw new Core.OpError("AI_NONE", "None of your models are answering right now. Try again in a few minutes, or switch this playlist to Classic.");
  },
  async interpret(ctx, text) {
    const user = `Read this playlist description and turn it into structure. Keep the user's intent; don't add requirements they didn't state.\n\nDescription:\n"""${text}"""\n\nReturn JSON exactly like:\n{"name":"a short playlist name if the description suggests one, else empty","summary":"one or two sentences restating the musical identity, in the description's language","include":[{"title":"","artist":""}],"references":[{"title":"","artist":""}],"referenceArtists":[""],"excludeArtists":[""],"excludeSongs":[{"title":"","artist":""}],"traits":{"genres":[""],"moods":[""],"keywords":["specific styles or scenes, e.g. lofi, amapiano, corridos tumbados"],"energy":"low|medium|high or empty","tempo":"slow|mid|fast or empty","bpm":[0,0],"era":[0,0],"languages":["es","en"],"notLanguages":[],"explicit":"any|clean|explicit","versions":false,"avoidHits":false,"preferHits":false}}\n\nRules: put a song in "include" only when the user clearly asks for it to be on the playlist. Songs mentioned as examples of the sound go in "references". Songs or artists mentioned as what they don't want go in the exclude lists. An example used to explain a problem (like "X is too mellow") is not a request to add X. Use [0,0] for era and bpm when not stated. Languages are ISO 639-1 codes; "languages" are the ones wanted, "notLanguages" the ones ruled out. Moods may use: ${Object.keys(MOODS).join(', ')}.`;
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
  if (["low", "medium", "high"].includes(tr.energy)) f.energy = tr.energy;
  if (Array.isArray(tr.bpm) && +tr.bpm[0] > 30 && +tr.bpm[1] >= +tr.bpm[0]) { f.bpm = [+tr.bpm[0], +tr.bpm[1]]; f.tempo = ""; } else if (["slow", "mid", "fast"].includes(tr.tempo)) { f.tempo = tr.tempo; f.bpm = null; }
  if (Array.isArray(tr.era) && (+tr.era[0] > 1900 || +tr.era[1] > 1900)) f.era = [+tr.era[0] > 1900 ? +tr.era[0] : 1900, +tr.era[1] > 1900 ? +tr.era[1] : 2100];
  const iso = x => String(x || "").slice(0, 2).toLowerCase();
  for (const l of (tr.languages || []).map(iso).filter(l => Cat.LANG_NAMES[l])) if (!(f.langs || []).includes(l)) f.langs = [...(f.langs || []), l];
  for (const l of (tr.notLanguages || []).map(iso).filter(l => Cat.LANG_NAMES[l])) if (!(f.notLangs || []).includes(l)) f.notLangs = [...(f.notLangs || []), l];
  f.notLangs = (f.notLangs || []).filter(l => !(f.langs || []).includes(l));
  if (tr.explicit === "clean" || tr.explicit === "explicit") f.explicit = tr.explicit;
  if (tr.versions) f.versions = true; if (tr.avoidHits) { f.avoidHits = true; f.preferHits = false; } if (tr.preferHits && !f.avoidHits) f.preferHits = true;
  return { summary: j.summary || "", missing: [...new Set(missing)], unchecked: [...new Set(unchecked)] };
}

const API = { workingModel, applyReading, Classic, AI, PROVIDERS, MOODS, ENERGY, TEMPO, rules, eligible, blocked, langVerdict, buildProfile, fitOf, directionBlock, stateBlock, parseJSON, featuresFor, langsFor, vibe, reasonsOf };
G.Engines = API;
if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

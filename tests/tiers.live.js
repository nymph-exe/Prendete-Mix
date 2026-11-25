// Basic / Normal / Aggressive recommendation tests: every rule, plus how well the picks fit the request.
// usage: node tests/tiers.live.js run <tag> [basic|normal|aggressive|case,...]   → runs Classic live, saves picks to $OUT (default: the temp folder)
//        node tests/tiers.live.js check <tag> [...] → report: rule problems, fit, niche level, time
// fit = share of picks whose artist the scene map places in one of the scenes the request should reach (placed artists only)
const fs = require("fs"), path = require("path");
const V = __dirname + "/..";
const Core = require(V + "/core.js"); globalThis.Core = Core;
const Cat = require(V + "/catalog.js"); globalThis.Catalog = Cat;
const R = require(V + "/reader.js"); globalThis.Reader = R;
try { globalThis.Listen = require(V + "/listen.js"); } catch {}
const E = require(V + "/engines.js");
const OUT = process.env.OUT || require("os").tmpdir(); fs.mkdirSync(OUT, { recursive: true }); const TARGET = +(process.env.TARGET || 25);
const HIPHOP = ["golden_age_hiphop", "hiphop_2000s", "west_coast", "trap", "rage", "alt_rap", "female_rap", "drill_us", "southern_rap", "boombap_now", "michigan_rap", "emo_rap", "uk_rap"];
const RGTN = ["reggaeton_new", "reggaeton_classic", "trap_latino", "dembow", "neoperreo", "latin_pop", "argentina_urbano", "chile_urbano", "spain_urbano", "plena_panama"];
const PHONK = ["aggressive_phonk", "phonk", "hardstyle", "funk_brasileiro"];
const CUMBIA = ["cumbia", "cumbia_regia", "cumbia_nortena", "vallenato", "latin_electronic"];
// [name, tier, spec, expectations]   spec: description | { seeds: [[title, artist]...], text? }
const CASES = [
  ["b_reggaeton", "basic", "reggaeton", { fit: RGTN }],
  ["b_pophits", "basic", "pop hits", { fit: ["pop_now", "pop_2010s", "pop_2000s", "latin_pop", "afroswing", "edm", "rnb_2000s", "hyperpop", "kpop"], hits: true }],
  ["b_hiphop90s", "basic", "90s hip hop", { fit: HIPHOP, era: [1990, 1999] }],
  ["b_lofi", "basic", "chill lofi beats", { fit: ["lofi_beats", "jazz_modern", "trip_hop", "ambient", "bedroom_pop"] }],
  ["b_classicrock", "basic", "classic rock", { fit: ["classic_rock", "rock_80s", "hard_rock_modern", "psych_rock", "prog_rock", "soft_rock", "rock_and_roll", "blues", "folk_rock", "britpop", "grunge"] }],
  ["b_salsa", "basic", "salsa", { fit: ["salsa", "son_cubano", "latin_jazz", "merengue", "bachata"] }],
  ["b_kpop", "basic", "k-pop", { fit: ["kpop", "khiphop"] }],
  ["b_country", "basic", "country music", { fit: ["country", "country_alt", "classic_country", "bluegrass", "folk_rock"] }],
  ["b_house", "basic", "house music", { fit: ["house", "french_touch", "afrohouse", "edm", "ukg_bass", "techno", "electroclash", "trance"] }],
  ["b_bachata", "basic", "bachata", { fit: ["bachata", "merengue", "latin_pop", "salsa"] }],
  ["b_jazz", "basic", "jazz", { fit: ["jazz_classic", "jazz_modern", "crooners", "swing_bigband", "smooth_jazz", "latin_jazz", "gypsy_jazz", "bossa_nova"] }],
  ["b_cristiana", "basic", "música cristiana", { fit: ["ccm_es", "ccm", "gospel"], langs: ["es"] }],
  ["n_reggaeton", "normal", "reggaeton y trap latino para el gym, tipo Bad Bunny, Feid y Young Miko, sin Daddy Yankee, desde 2019, en español", { fit: RGTN, era: [2019, 2026], langs: ["es"], banned: ["Daddy Yankee"] }],
  ["n_sadspanish", "normal", "sad songs in Spanish", { fit: ["latin_pop", "bolero", "rock_es", "latin_alt", "cantautor", "pop_es", "reggaeton_new", "trap_latino", "corridos_tumbados", "regional_mexicano", "bachata", "grupera", "ranchera"], langs: ["es"] }],
  ["n_synth80s", "normal", "upbeat 80s synthpop for a road trip", { fit: ["synthpop_80s", "italo_disco", "rock_80s", "postpunk", "pop_2000s", "funk_disco", "eurodance", "soft_rock"], era: [1980, 1989] }],
  ["n_gemsindie", "normal", "hidden gems indie rock", { fit: ["indie_now", "indie_2000s", "shoegaze", "postpunk", "folk_indie", "bedroom_pop", "britpop", "emo", "post_rock", "psych_rock", "art_pop", "grunge"], gems: true }],
  ["n_rosalia", "normal", "songs like Rosalía but no reggaeton", { fit: ["flamenco", "spain_urbano", "art_pop", "latin_alt", "pop_es", "neoperreo"], notScenes: ["reggaeton_new", "reggaeton_classic"] }],
  ["n_kidsparty", "normal", "clean pop hits for a kids birthday party", { fit: ["pop_now", "pop_2010s", "pop_2000s", "latin_pop", "edm", "kpop", "musicals", "funk_disco"], clean: true, hits: true }],
  ["n_corridos", "normal", "corridos tumbados como Peso Pluma, sin Natanael Cano", { fit: ["corridos_tumbados", "regional_mexicano", "banda", "norteno"], banned: ["Natanael Cano"] }],
  ["n_rnb", "normal", "chill rnb for late night, 2010s", { fit: ["rnb_alt", "neo_soul", "rnb_2000s", "afroswing", "pop_2010s", "trap"], era: [2010, 2019] }],
  ["n_afro", "normal", "afrobeats and amapiano for a party", { fit: ["afrobeats", "amapiano", "afrohouse", "afroswing", "gqom", "east_african", "dancehall"] }],
  ["n_bossa", "normal", "1960s bossa nova in Portuguese", { fit: ["bossa_nova", "brazil_mpb", "samba_pagode", "latin_jazz", "jazz_classic"], era: [1960, 1969], langs: ["pt"] }],
  ["n_workout", "normal", "high energy workout rap", { fit: HIPHOP, energyMin: .55 }],
  ["n_plena", "normal", "plena panameña para una fiesta", { fit: ["plena_panama", "reggaeton_classic", "reggaeton_new", "dancehall", "dembow"] }],
  ["a_threesongs", "aggressive", { seeds: [["ULTIMATE RAGE", "HUSSVRX"], ["WGSU", "8deuceee7"], ["Pégale Papá", "Los Plebeyos"]] }, { fit: [...PHONK, ...HIPHOP, ...CUMBIA, "grupera"], parts: 3, target: 30 }],
  ["a_threetext", "aggressive", "ULTIMATE RAGE - HUSSVRX • 222.222t\n\nand WGSU 8deucee7, BigWan, Illwill\n\nand Pégale Papá - Los Plebeyos, Celso Piña", { fit: [...PHONK, ...HIPHOP, ...CUMBIA], parts: 3, target: 30 }],
  ["a_threestyles", "aggressive", "aggressive phonk, Michigan street rap and Monterrey cumbia", { fit: [...PHONK, ...HIPHOP, ...CUMBIA], parts: 3, target: 30 }],
  ["a_misspelled", "aggressive", "regaeton viejo como daddy yanki y don omar", { fit: RGTN }],
  ["a_contra", "aggressive", "slow high energy songs", {}],
  ["a_notreggaeton", "aggressive", "anything but reggaeton, upbeat", { notScenes: ["reggaeton_new", "reggaeton_classic", "trap_latino", "dembow"] }],
  ["a_manyno", "aggressive", "hip hop but no trap, no drill, no Drake, no Kanye, nothing after 2010", { fit: HIPHOP, notScenes: ["trap", "drill_us", "uk_drill", "rage"], banned: ["Drake", "Kanye West"], era: [1970, 2010] }],
  ["a_tipico", "aggressive", "típico panameño", { fit: ["tipico_panama", "cumbia", "vallenato"] }],
  ["a_citypop", "aggressive", "日本のシティポップ", { fit: ["city_pop", "jpop_now", "anime", "funk_disco", "soft_rock"] }],
  ["a_noseed", "aggressive", { seeds: [["WGSU", "8deuceee7"]] }, { fit: HIPHOP }],
  ["a_fusion", "aggressive", "jazz-influenced hip hop", { fit: ["jazz_rap", "golden_age_hiphop", "alt_rap", "lofi_beats", "jazz_modern", "boombap_now", "neo_soul"], parts: 1, fusion: true }],
  ["a_blend", "aggressive", "a blend of jazz and hip hop", { fit: [...HIPHOP, "jazz_classic", "jazz_modern", "lofi_beats", "smooth_jazz", "crooners", "swing_bigband", "latin_jazz", "neo_soul"], parts: 2 }],
  ["a_cumbiarap", "aggressive", "cumbia mixed with rap, en español", { fit: [...CUMBIA, "cumbia_rap", "mexico_rap", "argentina_urbano", "trap_latino", "chile_urbano", "latin_alt", "champeta"], parts: 1, langs: ["es"] }],
  ["a_instrumental", "aggressive", "instrumental music only, no vocals, for focus", { fit: ["ambient", "lofi_beats", "modern_classical", "post_rock", "idm", "classical", "soundtracks", "trip_hop", "jazz_modern", "new_age"] }],
  ["a_korean", "aggressive", "songs in Korean", { fit: ["kpop", "khiphop"], langs: ["ko"] }],
  ["a_swapped", "aggressive", "Bad Bunny - Tití Me Preguntó, Feid - Normal", { fit: RGTN }],
  ["a_emoji", "aggressive", "🔥🔥 perreo intenso pa la disco 🔥", { fit: RGTN }],
  ["a_cumbiaperuana", "aggressive", "cumbia peruana", { fit: ["auto_cumbia_peruana", "cumbia", "latin_electronic", "cumbia_regia"], langs: ["es"] }],
  ["a_psychobilly", "aggressive", "psychobilly", { fit: ["auto_psychobilly", "rock_and_roll", "punk", "auto_garage_punk"] }],
  ["a_texascountry", "aggressive", "texas country for a road trip", { fit: ["auto_texas_country", "country", "country_alt", "classic_country", "folk_rock", "auto_red_dirt", "auto_outlaw_country"] }],
  ["a_chicanorap", "aggressive", "chicano rap, old school", { fit: ["auto_chicano_rap", "west_coast", "mexico_rap", "golden_age_hiphop", "hiphop_2000s"] }],
  ["a_noclue", "aggressive", { seeds: [["Price to pay", "8deuceee7"]] }, { fit: ["michigan_rap", ...HIPHOP] }],
];
const TIERS = { basic: CASES.filter(c => c[1] === "basic"), normal: CASES.filter(c => c[1] === "normal"), aggressive: CASES.filter(c => c[1] === "aggressive") };
const TR = new Map(); const get = id => TR.get(id);
const genresP = Cat.Deezer.genres().catch(() => []);
async function build(name, spec) {
  const text = typeof spec === "string" ? spec : spec.text || "";
  const st = { dir: { text, refs: [], artists: [], exclude: { artists: [], songs: [] }, form: {} }, must: [] };
  if (text) await E.applyReading(R.read(text), st, { genres: await genresP, keep: t => TR.set(t.id, t), text });
  const pl = Core.createPlaylist({ name, method: "NATURAL_LANGUAGE", direction: st.dir, capacity: 60 });
  if (spec.seeds) { const ts = []; for (const [t, a] of spec.seeds) { const x = await Cat.resolve(t, a); if (x) { TR.set(x.id, x); ts.push(x); } }
    Core.appendCandidates(pl, ts, { batchId: "seed" }, get); Core.approve(pl, ts.map(t => t.id)); }
  Core.addMandatory(pl, st.must, get); return pl;
}
async function run(tag, list) {
  for (const [name, , spec, ex] of list) {
    const f = path.join(OUT, `t.${tag}.${name}.json`); if (fs.existsSync(f) && !process.env.FORCE) continue;
    const t0 = Date.now(); const pl = await build(name, spec); let err = null, res = null; const target = ex.target || TARGET; const steps = [];
    const ctx = { latest: () => pl, getTrack: get, never: JSON.parse(process.env.NEVER || '["DaBaby"]'), saveTracks: () => {} };
    try { res = await E.Classic.generate(ctx, { target, onProgress: m => { if (!steps.length || steps[steps.length - 1] !== m) steps.push(m); },
      onBatch: async l => { l.forEach(x => TR.set(x.t.id, x.t)); const a = Core.appendCandidates(pl, l.map(x => x.t), { batchId: "b" }, get); a.added.forEach(id => (pl.rels[id].why = (l.find(x => x.t.id === id) || {}).why)); return { added: a.added.length, addedIds: a.added }; } }); }
    catch (e) { err = (e.code || "") + ": " + e.message; }
    const picks = Core.idsIn(pl, "PENDING").map(get).map(t => ({ t: t.t, a: t.a, aid: t.aid, y: t.y, rank: t.rank, exp: t.exp, lang: t.lang, f: t.f, isrc: t.isrc, why: pl.rels[t.id].why, v: Core.versionTags(t.t) }));
    fs.writeFileSync(f, JSON.stringify({ name, spec, form: pl.direction.form, artists: pl.direction.artists, refs: (pl.direction.refs || []).map(get).filter(Boolean).map(t => t.t + " — " + t.a), parts: res && res.parts || null, secs: Math.round((Date.now() - t0) / 1000), err, first: steps[0] || "", picks }, null, 1));
    console.log(`${name}: ${picks.length} picks in ${Math.round((Date.now() - t0) / 1000)}s${err ? " ERR " + err : ""}`);
  }
}
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
function check(tag, list) {
  const T = {}; const line = p => `${p.t} — ${String(p.a).split(/;\s*/).slice(0, 2).join(", ")}${p.y ? " (" + p.y + ")" : ""}`;
  for (const [name, tier, spec, ex] of list) {
    const f = path.join(OUT, `t.${tag}.${name}.json`); if (!fs.existsSync(f)) continue; const r = JSON.parse(fs.readFileSync(f)); const P = r.picks, bad = [], off = [];
    const target = ex.target || TARGET;
    for (const p of P) {
      if (ex.era && p.y && (p.y < ex.era[0] || p.y > ex.era[1])) bad.push(`year ${p.y}: ${line(p)}`);
      if (ex.clean && p.exp === "explicit") bad.push(`explicit: ${line(p)}`);
      const LV = { japanese: "ja", korean: "ko", english: "en", chinese: "zh", spanish: "es", portuguese: "pt" }; const lm = /\b(japanese|korean|english|chinese|spanish|portuguese) ?ver/i.exec(p.t);
      const langOk = lm && (p.v || []).join() === "language version" && ((r.form && r.form.langs) || []).includes(LV[lm[1].toLowerCase()]);
      if (p.v && p.v.length && !(r.form && r.form.versions) && !langOk) bad.push(`version (${p.v.join(",")}): ${line(p)}`);
      if (ex.langs && p.lang && p.lang.src === "lyrics" && !p.lang.langs.some(l => ex.langs.includes(l))) bad.push(`language ${p.lang.main}: ${line(p)}`);
      if (ex.energyMin != null && p.f && p.f.e != null && p.f.e < ex.energyMin - .1) bad.push(`energy ${p.f.e.toFixed(2)}: ${line(p)}`);
      if (ex.banned && String(p.a + " " + p.t).split(/;\s*|\(feat\.?\s*|\s&\s|,\s/).some(x => ex.banned.some(b => Core.norm(x).replace(/\s/g, "") === Core.norm(b).replace(/\s/g, "")))) bad.push(`banned: ${line(p)}`);
    }
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (Core.sameRecording({ t: P[i].t, a: P[i].a, isrc: P[i].isrc }, { t: P[j].t, a: P[j].a, isrc: P[j].isrc })) bad.push(`duplicate: ${line(P[i])}`);
    const by = new Map(); P.forEach(p => { const a = Core.firstArtist(p.a); by.set(a, (by.get(a) || 0) + 1); });
    const top = [...by].sort((a, b) => b[1] - a[1])[0] || ["", 0]; if (top[1] > Math.max(3, Math.ceil(P.length * .16))) bad.push(`artist ${top[0]} ×${top[1]}`);
    const mr = med(P.map(p => p.rank).filter(Boolean));
    if (ex.gems && mr > 400000) bad.push(`median popularity ${mr} is high for hidden gems`);
    if (ex.hits && mr < 500000) bad.push(`median popularity ${mr} is low for hits`);
    if (ex.parts && ex.parts > 1 && !(r.parts && r.parts.length >= ex.parts)) bad.push(`expected ${ex.parts} parts, got ${r.parts ? r.parts.length : 1}`);
    if (ex.parts === 1 && r.parts) bad.push(`split into ${r.parts.length} parts; expected one blended playlist`);
    if (P.length < target * .8) bad.push(`only ${P.length} of ${target} picks`);
    let placed = 0, fit = 0;
    for (const p of P) { const ks = (p.aid || []).slice(0, 2).flatMap(id => E.kbOf(id).map(m => m.key)); if (!ks.length) continue; placed++;
      const inFit = !ex.fit || ks.some(k => ex.fit.includes(k)); const inNot = ex.notScenes && ks.some(k => ex.notScenes.includes(k)) && !(ex.fit || []).some(k => ks.includes(k));
      if (inFit && !inNot) fit++; else off.push(`${line(p)} [${[...new Set(ks)].slice(0, 3).join(",")}]`); }
    const fitP = placed ? Math.round(100 * fit / placed) : null;
    (T[tier] = T[tier] || { n: 0, picks: 0, viol: 0, fit: [], placed: [], secs: [] });
    const t = T[tier]; t.n++; t.picks += P.length; t.viol += bad.length; if (fitP != null) t.fit.push(fitP); t.placed.push(P.length ? Math.round(100 * placed / P.length) : 0); t.secs.push(r.secs);
    console.log(`== [${tier}] ${name}: ${typeof spec === "string" ? JSON.stringify(spec).slice(0, 70) : "seeds " + spec.seeds.map(s => s[0]).join(" / ")} (${r.secs}s)${r.err ? " ERR " + r.err : ""}`);
    console.log(`   ${P.length} picks, ${by.size} artists, median rank ${mr}, fit ${fitP == null ? "—" : fitP + "%"} of ${placed} placed${r.parts ? ", parts " + r.parts.map(x => x.label + ":" + x.found).join(" · ") : ""}${r.refs && r.refs.length ? " | refs " + r.refs.join("; ").slice(0, 120) : ""}`);
    bad.forEach(b => console.log("   ✗ " + b)); if (process.env.OFF || off.length > P.length * .25) off.slice(0, 8).forEach(o => console.log("   ~ off: " + o));
    if (process.env.SHOW) console.log("   " + P.map(line).join(" | "));
  }
  console.log("\nTIER        cases  picks  rule problems  avg fit  avg placed  avg time");
  for (const [k, t] of Object.entries(T)) console.log(`${k.padEnd(11)} ${String(t.n).padStart(5)} ${String(t.picks).padStart(6)} ${String(t.viol).padStart(14)} ${String(t.fit.length ? Math.round(t.fit.reduce((a, b) => a + b, 0) / t.fit.length) : "—").padStart(7)}% ${String(Math.round(t.placed.reduce((a, b) => a + b, 0) / t.placed.length)).padStart(10)}% ${String(Math.round(t.secs.reduce((a, b) => a + b, 0) / t.secs.length)).padStart(8)}s`);
}
const [cmd, tag, sel] = process.argv.slice(2);
const list = !sel ? CASES : TIERS[sel] || CASES.filter(c => sel.split(",").includes(c[0]));
(cmd === "run" ? run(tag, list) : Promise.resolve(check(tag, list))).catch(e => { console.error(e); process.exit(1); });

/* Builds scenes.auto.js: a small scene for every genre in the bundled genre list that no hand-written scene covers.
   For each such genre: songs listeners tagged with it on ListenBrainz → the artists behind them (2+ songs) →
   their Deezer IDs. A genre becomes a scene when 6+ of its artists are found on Deezer.
   Auto scenes are only used when a request names their genre; they never outrank the hand-written map.
   Answers are cached (MIXER_AUTO_CACHE, or a file in the system temp folder) so reruns resume where they stopped.
   Run from anywhere: node tools/kbauto.js [limit] */
const V = __dirname + "/..";
globalThis.Core = require(V + "/core.js"); const Cat = require(V + "/catalog.js");
const SC = require(V + "/scenes.js"); const E = require(V + "/engines.js"); const IDS = require(V + "/scenes.ids.js");
const GL = (() => { const g = require(V + "/genres.js"); const L = g.L || g.LIST || g; return Array.isArray(L) ? L : Object.values(L).find(Array.isArray); })();
const fs = require("fs"), path = require("path"); const CF = process.env.MIXER_AUTO_CACHE || path.join(require("os").tmpdir(), "mixer-auto.json");
const cache = fs.existsSync(CF) ? JSON.parse(fs.readFileSync(CF)) : { tag: {}, meta: {}, dz: {} };
let dirty = 0; const save = (force) => { if (++dirty % 25 && !force) return; fs.writeFileSync(CF, JSON.stringify(cache)); };
/* not music, or not a style anyone builds a playlist from */
const SKIP = /\b(non-music|production music|porn|library music|stock music|asmr|animal sounds|audio (drama|documentary)|audiobook|spoken word|comedy|stand-?up|field recording|nature sounds|white noise|noise wall|poetry|sermon|adhan|chant|cantorial|lecture|interview|sound effects|hypnosis|guided meditation|radio drama|nursery|lullab|children|ringtone|jingle|commercial|advertising|sound collage|plunderphonics|musique concr|tape music|acousmatic|electroacoustic|ars (antiqua|nova|subtilior)|medieval|renaissance|plainchant|gregorian|liturgical|religious recitation|quran|mantra|marching band|military|national anthem|test tone|silence|binaural|isochronic|vocal percussion|whistling|yodel|bird ?song|throat singing|sound art)\b/i;
const tags = [...new Set(Object.values(SC.SCENES).filter(s => !s.auto).flatMap(s => s.tags))]; /* hand-written scenes only (the engine merges the auto ones in) */
const covered = g => tags.some(t => E.tagSim(g, t) >= .85);
const firstName = a => String(a || "").split(/\s+(?:feat\.?|ft\.?|featuring|with)\s+|,\s*|;\s*/i)[0].trim();
const mnorm = s => SC.norm(s).replace(/\s+/g, "");
(async () => {
  const LIMIT = +(process.argv[2] || 1e9);
  const todo = GL.filter(g => !SKIP.test(g) && !covered(g)).slice(0, LIMIT);
  console.log(`${GL.length} genres, ${todo.length} without a scene`);
  /* 1. songs per genre (ListenBrainz allows about 2.6 requests a second) */
  let i = 0; for (const g of todo) { i++; if (cache.tag[g]) continue;
    const r = await Cat.LB.byTag([g], { popBegin: 15, popEnd: 100, count: 100 }); cache.tag[g] = r.map(x => x.rec); save();
    if (i % 100 === 0) console.log(`tags ${i}/${todo.length}`); }
  save(true);
  /* 1b. (DEEP=1) genres with too few artists from their 100 best-known songs: up to 300 songs at any popularity */
  cache.deep = cache.deep || {}; const recsOf = g => [...new Set((cache.tag[g] || []).concat(cache.deep[g] || []))];
  if (process.env.DEEP) { const thin = todo.filter(g => (cache.tag[g] || []).length >= 20 && !cache.deep[g] && (() => { const c = new Map(); for (const r of cache.tag[g]) { const v = cache.meta[r]; if (v && v[0]) c.set(v[0], (c.get(v[0]) || 0) + 1); } return [...c.values()].filter(n => n >= 2).length < 12; })());
    console.log(`${thin.length} genres to dig deeper`); let k = 0;
    for (const g of thin) { const r = await Cat.LB.byTag([g], { popBegin: 0, popEnd: 100, count: 300 }); cache.deep[g] = r.map(x => x.rec); save(); if (++k % 100 === 0) console.log(`deep ${k}/${thin.length}`); }
    save(true); }
  const rich = todo.filter(g => recsOf(g).length >= 40); console.log(`${rich.length} genres with 40+ tagged songs`);
  /* 2. who made them */
  const need = [...new Set(rich.flatMap(recsOf))].filter(r => !(r in cache.meta)); console.log(`${need.length} songs to look up`);
  for (let k = 0; k < need.length; k += 100) { const m = await Cat.LB.meta(need.slice(k, k + 100)); for (const r of need.slice(k, k + 100)) { const v = m.get(r); cache.meta[r] = v ? [firstName(v.a), v.y || null] : null; } save(); if (k % 2000 === 0) console.log(`meta ${k}/${need.length}`); }
  save(true);
  /* 3. the artists behind 2+ songs of each genre, found on Deezer */
  const per = new Map(); const names = new Set();
  for (const g of rich) { const c = new Map(), ys = []; for (const r of recsOf(g)) { const v = cache.meta[r]; if (!v || !v[0] || SC.novelty(v[0]) || E._pseudo(v[0])) continue; c.set(v[0], (c.get(v[0]) || 0) + 1); if (v[1]) ys.push(v[1]); }
    const top = [...c].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 24); per.set(g, { top, ys }); top.forEach(([n]) => names.add(n)); }
  const look = [...names].filter(n => !(n in cache.dz)); console.log(`${names.size} artists, ${look.length} to find on Deezer`);
  let j = 0; await Promise.all(Array.from({ length: 16 }, async () => { while (look.length) { const n = look.shift(); j++;
    const known = IDS[n]; if (known) { cache.dz[n] = [known[0], known[1]]; continue; }
    try { const a = await Cat.Deezer.artistByName(n, 1000); cache.dz[n] = a ? [a.id, a.fans] : 0; } catch { continue; } save(); if (j % 500 === 0) console.log(`deezer ${j}`); } }));
  save(true);
  /* 4. scenes: core = the genre's most-tagged artists, next = the rest; near = hand-written scenes its artists also belong to */
  const AUTO = {}; let made = 0;
  for (const g of rich) { const { top, ys } = per.get(g); const found = top.map(([n, k]) => [n, k, cache.dz[n]]).filter(x => x[2]);
    const ids = new Set(); const list = found.filter(x => !ids.has(x[2][0]) && ids.add(x[2][0]));
    if (list.length < 6) continue;
    const near = new Map(); for (const [, , [id]] of list) for (const m of E.kbOf(id)) if (m.tier !== "wide" && m.tier !== "auto") near.set(m.key, (near.get(m.key) || 0) + 1);
    const key = "auto_" + SC.norm(g).replace(/ /g, "_"); if (SC.SCENES[key] && !SC.SCENES[key].auto) continue;
    const ysS = ys.sort((a, b) => a - b), p = q => ysS[Math.floor(q * (ysS.length - 1))];
    AUTO[key] = { name: g.replace(/(^|[\s-])\p{L}/gu, m => m.toUpperCase()), tags: [g], era: ysS.length >= 20 && p(.9) - p(.1) <= 20 ? [p(.1) - 2, p(.9) + 2] : null,
      core: list.slice(0, 8).map(([n, , [id, fans]]) => [id, fans, n]), next: list.slice(8).map(([n, , [id, fans]]) => [id, fans, n]),
      near: [...near].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k) };
    made++; }
  const out = `/* MIXER scene map, auto tier (built ${new Date().toISOString().slice(0, 10)} by tools/kbauto.js): one scene per genre the hand-written map doesn't cover,\n   from songs listeners tagged with it on ListenBrainz. Used only when a request names the genre. key → {name, tags, era, core, next, near}; artists are [deezer id, fans, name] */\n` +
    `(function (G) { const AUTO = ${JSON.stringify(AUTO)};\n  if (typeof module !== "undefined") module.exports = AUTO; else G.SCENE_AUTO = AUTO; })(typeof window !== "undefined" ? window : globalThis);\n`;
  fs.writeFileSync(V + "/scenes.auto.js", out);
  console.log(`${made} auto scenes, ${Object.values(AUTO).reduce((s, a) => s + a.core.length + a.next.length, 0)} artist places, ${Math.round(out.length / 1024)} KB`);
})().catch(e => { console.error(e); process.exit(1); });

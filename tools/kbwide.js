/* Builds scenes.wide.js: for each scene, the artists Deezer relates to several of its core artists.
   They become the map's third tier ("wide"): weaker than core and next, but they widen every scene
   past what was written by hand. Run from anywhere: node tools/kbwide.js
   Deezer answers are cached (MIXER_CACHE, or a file in the system temp folder) so reruns are quick. */
const V = __dirname + "/..";
globalThis.Core = require(V + "/core.js"); const Cat = require(V + "/catalog.js");
const SC = require(V + "/scenes.js"); const PSEUDO = require(V + "/engines.js")._pseudo; const IDS = require(V + "/scenes.ids.js");
const fs = require("fs"); const CF = process.env.MIXER_CACHE || require("path").join(require("os").tmpdir(), "mixer-related.json");
const cache = fs.existsSync(CF) ? JSON.parse(fs.readFileSync(CF)) : {};
(async () => {
  const coreIds = new Set(); for (const sc of Object.values(SC.SCENES)) for (const n of sc.core) if (IDS[n]) coreIds.add(IDS[n][0]);
  const todo = [...coreIds].filter(id => !cache[id]);
  console.log("core artists", coreIds.size, "to fetch", todo.length);
  let done = 0;
  await Promise.all(todo.map(async id => { try { cache[id] = (await Cat.Deezer.related(id, 25)).map(a => [a.id, a.name, a.fans || 0]); } catch { } if (++done % 250 === 0) { console.log(done); fs.writeFileSync(CF, JSON.stringify(cache)); } }));
  fs.writeFileSync(CF, JSON.stringify(cache));
  const inMap = new Set(Object.values(IDS).map(v => v[0]));
  /* only artists the hand-written map doesn't place: the tiers written by hand stay as they are */
  const cand = new Map(); /* artist id → [{key, n, need, name, fans}] */
  for (const sc of Object.values(SC.SCENES)) {
    const core = sc.core.map(n => IDS[n]).filter(Boolean).map(v => v[0]);
    if (core.length < 6) continue; /* too few anchors: Deezer's links would be mostly noise */
    /* an artist linked to 2 core names in a small scene, 3 in a big one */
    const need = core.length >= 18 ? 3 : 2;
    const cnt = new Map();
    for (const id of core) for (const [rid, name, fans] of cache[id] || []) { if (inMap.has(rid)) continue; const c = cnt.get(rid) || { n: 0, name, fans }; c.n++; cnt.set(rid, c); }
    for (const [rid, c] of cnt) if (c.n >= need && c.fans >= 2000 && !SC.novelty(c.name) && !PSEUDO(c.name)) { const l = cand.get(rid) || []; l.push({ key: sc.key, n: c.n, need, name: c.name, fans: c.fans }); cand.set(rid, l); }
  }
  /* an artist goes in the (at most 3) scenes it is most strongly linked to */
  const per = {}; for (const [rid, l] of cand) l.sort((a, b) => b.n / b.need - a.n / a.need).slice(0, 3).forEach(x => (per[x.key] = per[x.key] || []).push([rid, x]));
  const out = {}; let total = 0; const report = [];
  for (const [key, l] of Object.entries(per)) {
    const list = l.sort((a, b) => b[1].n - a[1].n || b[1].fans - a[1].fans).slice(0, 40);
    out[key] = list.map(([id, c]) => [id, c.fans, c.name]); total += list.length;
    report.push(`${key} (≥${list[0][1].need}): ${list.slice(0, 12).map(([, c]) => c.name + "×" + c.n).join(", ")}${list.length > 12 ? ` … +${list.length - 12}` : ""}`);
  }
  fs.writeFileSync(V + "/scenes.wide.js", "/* MIXER scene map, third tier (built " + new Date().toISOString().slice(0, 10) + " by tools/kbwide.js): artists Deezer relates to several of a scene's core artists. scene → [[deezer id, fans, name]] */\n(function (G) { const WIDE = " + JSON.stringify(out) + ";\nG.SCENE_WIDE = WIDE; if (typeof module !== \"undefined\") module.exports = WIDE; })(typeof window !== \"undefined\" ? window : globalThis);\n");
  fs.writeFileSync("/tmp/wide_report.txt", report.join("\n"));
  console.log("scenes widened", Object.keys(out).length, "entries", total, "new artists", new Set(Object.values(out).flat().map(x => x[0]).filter(id => !inMap.has(id))).size, Math.round(fs.statSync(V + "/scenes.wide.js").size / 1024) + " KB");
})();

/* Regression tests from the D.A.T.A. C.H.E.C.K. (24 Nov 2026): junk input, damaged data, untrusted AI answers. Offline. */
const D = process.env.V3 || "..";
const Core = require(D + "/core.js"), R = require(D + "/reader.js"), E = require(D + "/engines.js"), M = require(D + "/migrate.js");
const seed = require(D + "/seed.json");
let pass = 0, fail = 0;
const ok = (name, c, info) => { if (c) pass++; else { fail++; console.log("FAIL", name, info === undefined ? "" : JSON.stringify(info)); } };
const throwsShape = f => { try { f(); return false; } catch (e) { return e.code === "SHAPE" || e.code === "INVARIANT"; } };

/* the Classic reader says when it understood nothing */
for (const junk of ["<script>alert(1)</script>", "🔥🔥🔥", "no", "我想听周杰伦的歌"]) ok(`reader: “${junk}” says nothing was usable`, /^Nothing in that could be used/.test(R.read(junk).summary), R.read(junk).summary);
ok("reader: artists are named in the summary", R.read("like Bad Bunny and Feid").summary === "Songs like Bad Bunny and Feid.", R.read("like Bad Bunny and Feid").summary);

/* Classic check (24 Nov 2026): reading fixes */
const rd = d => R.read(d), CUR = new Date().getFullYear();
ok("reader: “songs from 2016” is that year", JSON.stringify(rd("songs from 2016").traits.era) === "[2016,2016]", rd("songs from 2016").traits.era);
ok("reader: “from 2010 onwards” is a range", JSON.stringify(rd("music from 2010 onwards").traits.era) === `[2010,${CUR}]`);
ok("reader: “anything but reggaeton” leaves it out", !rd("anything but reggaeton, upbeat").traits.genres.length && rd("anything but reggaeton, upbeat").traits.notStyles.includes("reggaeton"));
ok("reader: “without Drake” isn't an artist called “out Drake”", JSON.stringify(rd("trap like Travis Scott, without Drake").referenceArtists) === '["Travis Scott"]' && rd("trap like Travis Scott, without Drake").excludeArtists.includes("Drake"));
ok("reader: “other than Taylor Swift” leaves her out", rd("pop, other than Taylor Swift").excludeArtists.includes("Taylor Swift"));
ok("reader: “thinking of Frank Ocean vibes”", JSON.stringify(rd("thinking of Frank Ocean vibes").referenceArtists) === '["Frank Ocean"]');
ok("reader: christmas songs, navidad, holiday music", ["christmas songs for a family dinner", "musica de navidad", "holiday music"].every(d => rd(d).traits.keywords.includes("christmas music")));
ok("reader: a house party isn't house music", !rd("house party").traits.genres.length && rd("house music").traits.keywords.includes("house"));
const ra = rd("rock alternativo en español"); ok("reader: Spanish genre names, language kept", ra.traits.keywords.includes("latin rock") && ra.traits.keywords.includes("alternative") && ra.traits.languages.includes("es"), ra.traits);
ok("reader: says when tempo and energy disagree", /opposite directions/.test(rd("slow high energy songs").summary));

/* the artist's country as a language clue */
E.ART.set(9001, { area: "United States" }); E.ART.set(9002, { area: "Mexico" });
const RL = { langs: ["es"], notLangs: [] };
ok("language: English title + US artist is out of a Spanish playlist", E.langVerdict({ aid: [9001], lang: { src: "title", main: "en", langs: ["en"] } }, RL) === "no");
ok("language: a US artist with a Spanish title stays (Becky G)", E.langVerdict({ aid: [9001], lang: { src: "title", main: "es", langs: ["es"] } }, RL) === "ok");
ok("language: no lyrics, US artist: ranked lower, not out", E.langVerdict({ aid: [9001], lang: { src: "unknown", main: null, langs: [] } }, RL) === "doubt");
ok("language: no lyrics, Mexican artist: unknown", E.langVerdict({ aid: [9002] }, RL) === "unknown");

/* Classic check: session-style credits and background-music acts */
const AR = require(D + "/artists.js"), SC = require(D + "/scenes.js");
ok("ban: “Daddy Yankee: Bzrp Music Session” is his song", AR.banned({ t: "Daddy Yankee: Bzrp Music Session, Vol. 0/66", a: "Bizarrap", aid: [1] }, AR.banSet([{ name: "Daddy Yankee", dz: [3839] }])));
ok("background-music projects are left out, real jazz acts aren't", ["The Jazz Lounge", "Relaxing Jazz Music", "Coffee Shop Jazz"].every(SC.novelty) && !["John Coltrane", "Jazz at Lincoln Center Orchestra", "Snarky Puppy"].some(SC.novelty));

/* AI answers with the wrong shapes */
const j = E.cleanReading({ name: 5, include: "abc", references: [null, { title: "X", artist: 7 }, { artist: "no title" }], excludeArtists: "DaBaby, Feid", referenceArtists: [{ name: "Feid" }, "", null], traits: { genres: "rock", moods: [null, "Party"], bpm: ["a", 2], era: [1990, "2000"], gems: "yes" } });
ok("AI reading: lists stay lists", Array.isArray(j.include) && j.include.length === 0 && j.references.length === 1 && j.references[0].artist === "7");
ok("AI reading: comma text becomes a list", JSON.stringify(j.excludeArtists) === '["DaBaby","Feid"]' && JSON.stringify(j.traits.genres) === '["rock"]');
ok("AI reading: bad numbers are dropped", j.traits.bpm === null && JSON.stringify(j.traits.era) === "[1990,2000]" && j.traits.gems === false);
ok("AI reading: nothing at all is fine", E.cleanReading(null).include.length === 0 && E.cleanReading("text").traits.genres.length === 0);

/* saved or restored playlists: repair what can be repaired, refuse the rest */
const good = () => { const p = Core.createPlaylist({ name: "T", method: "NATURAL_LANGUAGE", direction: {}, capacity: 10 }); p.rels["dz:1"] = { state: "APPROVED" }; p.order = ["dz:1"]; return p; };
ok("shape: an empty object is refused", throwsShape(() => Core.checkShape({})));
ok("shape: missing songs are refused", throwsShape(() => Core.checkShape(Object.assign(good(), { rels: null }))));
ok("shape: a damaged order is refused", throwsShape(() => Core.checkShape(Object.assign(good(), { order: [5] }))));
const fixed = Core.checkShape(Object.assign(good(), { history: null, batches: 7, direction: "oops", engine: "x", artwork: "javascript:alert(1)" }));
ok("shape: fixable fields are repaired", Array.isArray(fixed.history) && Array.isArray(fixed.batches) && Array.isArray(fixed.direction.refs) && fixed.engine.mode === "classic" && fixed.artwork === null);
ok("shape: bad bans and songs inside a direction are dropped", Core.checkShape(Object.assign(good(), { direction: { exclude: { artists: [null, 5, "DaBaby", { name: "Feid" }], songs: "x" } } })).direction.exclude.artists.length === 2);
ok("songs: one without a title is refused", Core.checkTrack({ id: "dz:1" }) === null && Core.checkTrack(null) === null && Core.checkTrack({ id: "dz:2", t: "T", a: 5 }).a === "5");

/* the old app's data, partly damaged: the app still starts and Préndete keeps its seeded songs */
for (const [n, l] of Object.entries({ songsText: { songs: "x" }, nullSong: { songs: { a: null } }, listsText: { songs: { "dz:1": { k: "dz:1", t: "T", a: "A" } }, lists: "x", ov: null }, badList: { songs: { "dz:1": { k: "dz:1", t: "T", a: "A" } }, lists: [null, { name: 5, songs: "q" }] } })) {
  let out = null; try { out = M.build(seed, l); out.playlists.forEach(Core.checkShape); } catch (e) { out = e; }
  ok(`migration: ${n} doesn't stop the app`, out && out.playlists, out && out.message);
}
ok("migration: junk old data falls back to the seed", Core.counts(M.build(seed, { songs: "x" }).playlists[0]).approved === 230);

/* AI: unreadable answers don't lock the models out, and the reason is said */
const P = E.PROVIDERS.gemini, chat0 = P.chat; let calls = 0;
P.chat = async (k, m, s, u) => { calls++; if (u.includes('"ok":true')) return '{"ok":true}'; throw new Core.OpError("AI_PARSE", "The AI's answer couldn't be read. Try again or pick another model."); };
const a = { provider: "gemini", key: "k", model: "auto", models: [{ id: "gemini-2.5-flash" }, { id: "gemini-2.5-flash-lite" }], memo: {} };
(async () => {
  const msgs = [];
  for (let i = 0; i < 2; i++) { try { await E.AI.ask({ ai: a }, "s", "u"); } catch (e) { msgs.push(e.message); } }
  const before = calls; try { await E.AI.ask({ ai: a }, "s", "u"); } catch {}
  ok("AI: a run after two failed ones still asks the models", calls > before);
  ok("AI: the last problem is named", /last problem: the AI's answer couldn't be read/.test(msgs[0]), msgs[0]);
  ok("AI: unreadable answers don't mark models as down", !a.memo.bad || !Object.keys(a.memo.bad).length, a.memo.bad);
  P.chat = chat0;
  /* random operations never leave a playlist broken */
  let seedN = 7; const rnd = () => { seedN = (seedN * 1103515245 + 12345) % 2147483648; return seedN / 2147483648; }; const pick = x => x[Math.floor(rnd() * x.length)];
  const TR = new Map(); for (let i = 0; i < 120; i++) TR.set("dz:" + i, { id: "dz:" + i, t: "Song " + (i % 100), a: "A" + (i % 9), isrc: "I" + (i % 100) }); const ids = [...TR.keys()], get = id => TR.get(id);
  let broken = 0;
  for (let run = 0; run < 15; run++) { let pl = Core.createPlaylist({ name: "F", method: "NATURAL_LANGUAGE", direction: {}, capacity: pick(Core.capacityOptions().slice(0, 4)) });
    for (let s = 0; s < 200; s++) { const before = JSON.parse(JSON.stringify(pl)); const st = x => Object.keys(pl.rels).filter(k => pl.rels[k].state === x);
      const op = pick([() => Core.appendCandidates(pl, [get(pick(ids)), get(pick(ids))], { batchId: "b", source: "r" }, get), () => Core.approve(pl, [pick(st("PENDING").concat([pick(ids)]))]), () => Core.reject(pl, [pick(Object.keys(pl.rels).concat(["x"]))]),
        () => Core.restore(pl, pick(Object.keys(pl.rels).concat(["x"])), pick(["APPROVED", "PENDING"])), () => Core.reorder(pl, pick(pl.order.concat(["x"])), pick([0, -3, 1e9, NaN])), () => Core.setCapacity(pl, pick([10, 20, 30, 15]), pl.order.slice(0, 5)),
        () => Core.addMandatory(pl, [pick(ids)], get), () => Core.fillCommit(pl, [{ id: pick(ids) }, { id: pick(st("PENDING").concat(["x"])) }], get), () => Core.editDirection(pl, {}, { reset: rnd() < .1 })]);
      try { op(); Core.validate(pl); } catch (e) { if (!(e instanceof Core.OpError) || e.code === "INVARIANT") broken++; pl = before; } } }
  ok("random operations never break a playlist", broken === 0, broken);
  console.log(`\n${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})();

// Classic's genre matching: offline checks of tag similarity, named styles and the style gate.
const D = process.env.V3 || "..";
globalThis.Core = require(D + "/core.js"); globalThis.Catalog = require(D + "/catalog.js"); const E = require(D + "/engines.js");
let pass = 0, fail = 0; const ok = (name, c, got) => { c ? pass++ : fail++; console.log(c ? "ok  " : "FAIL", name, c ? "" : "→ got " + JSON.stringify(got)); };
ok("same tag", E.tagSim("uk drill", "UK Drill") === 1);
ok("narrower artist tag fits", E.tagSim("drill", "uk drill") >= .9);
ok("broader generic tag is weak", E.tagSim("indie folk", "indie") <= .65);
ok("same family", E.tagSim("afrobeats", "amapiano") >= .6);
ok("k-pop is not pop", E.tagSim("k-pop", "pop") === 0, E.tagSim("k-pop", "pop"));
ok("ranchera is not corrido tumbado", E.tagSim("corrido tumbado", "ranchera") === 0);
ok("named styles map to genre names", JSON.stringify(E.wantStyles({ keywords: ["synthpop", "new wave"] })) === JSON.stringify(["synth-pop", "new wave"]), E.wantStyles({ keywords: ["synthpop", "new wave"] }));
ok("lofi means lo-fi hip hop", E.wantStyles({ keywords: ["lofi"] })[0] === "lo-fi hip hop");
ok("plural styles", E.wantStyles({ keywords: ["corridos tumbados"] })[0] === "corrido tumbado", E.wantStyles({ keywords: ["corridos tumbados"] }));
// gate: an artist tagged only "neoclassical" can't join a lofi playlist; one tagged "lo-fi hip hop" can
const S = { want: E.wantStyles({ keywords: ["lofi"] }), broad: [], notS: [], taste: [], ref: .3, strict: true, info: true };
E.ART.set(1, { v: [["neoclassical", 1], ["piano", .8]] }); E.ART.set(2, { v: [["lo-fi hip hop", 1], ["chillhop", .5]] }); E.ART.set(3, { v: [["edm", 1]] });
ok("off-style artist gated", E.styleFit(1, S).wf < .45);
ok("in-style artist passes", E.styleFit(2, S).wf >= .45);
const S2 = { want: ["house"], broad: [], notS: ["edm"], taste: [], ref: .3, strict: true, info: true };
ok("ruled-out style", E.styleFit(3, S2).no === true);
// the scene map
const SC = require(D + "/scenes.js"); globalThis.Scenes = SC;
ok("scene map loads", Object.keys(SC.SCENES).length >= 80, Object.keys(SC.SCENES).length);
ok("an artist belongs to its scene", SC.of("Peso Pluma").some(m => m.key === "corridos_tumbados"));
ok("novelty acts are known", SC.novelty("Big Shaq") && !SC.novelty("Skepta"));
ok("\"jazz rap\" is not jazz", E.tagSim("jazz", "jazz rap") < .45, E.tagSim("jazz", "jazz rap"));
const P0 = { R: { era: null, dir: {} }, refs: [], ev: { manual: [], rejected: [] } };
const pick = kw => [...E.scenesFor(P0, { want: E.wantStyles({ keywords: kw }), broad: [], notS: [], taste: [], strict: true }).keys()];
ok("UK drill and grime pick their scenes", JSON.stringify(pick(["uk drill", "grime"]).sort()) === JSON.stringify(["grime", "uk_drill"]), pick(["uk drill", "grime"]));
ok("Brazilian funk picks its scene", pick(["funk brasileiro"])[0] === "funk_brasileiro", pick(["funk brasileiro"]));
/* Classic check (24 Nov 2026): scene choice */
const P1 = (langs = [], text = "", crowd = false) => ({ R: { era: null, dir: { text }, langs, crowd }, refs: [], ev: { manual: [], rejected: [] } });
const sc = (kw, langs, text) => [...E.scenesFor(P1(langs, text), { want: E.wantStyles({ keywords: kw }), broad: [], notS: [], taste: [], strict: true }).keys()];
ok("“house” is house, not EDM or amapiano", sc(["house"]).includes("house") && !sc(["house"]).includes("edm") && !sc(["house"]).includes("amapiano"), sc(["house"]));
ok("plain “hip hop” has no lofi or regional scenes", !sc(["hip hop"]).some(k => /lofi|uk_rap|mexico_rap/.test(k)), sc(["hip hop"]));
ok("plain “trap” is US trap; “trap” in Spanish adds Spanish-language scenes", JSON.stringify(sc(["trap"])) === '["trap"]' && sc(["trap"], ["es"]).includes("spain_urbano"), [sc(["trap"]), sc(["trap"], ["es"])]);
ok("UK hip hop when the request says UK", sc(["hip hop"], [], "uk hip hop and grime").includes("uk_rap"));
ok("plain “indie” finds indie rock", sc(["indie"]).includes("indie_now"));
ok("bossa nova has its own scene", sc(["bossa nova"])[0] === "bossa_nova", sc(["bossa nova"]));
ok("lofi still finds lofi beats", JSON.stringify(sc(["lofi"])) === '["lofi_beats"]');
ok("crowd-pleasers with no style: mainstream scenes", [...E.scenesFor(P1([], "wedding hits", true), { want: [], broad: [], notS: [], taste: [], strict: false }).keys()].includes("pop_2010s"));
/* the larger map (24 Nov 2026): 176 scenes, a third tier, every scene tag a style */
const SCN = require(D + "/scenes.js"); const Rd = require(D + "/reader.js");
const rsc = (text, langs = []) => { const t = Rd.read(text).traits; return sc([...(t.keywords || []), ...(t.genres || [])], langs, text); };
ok("the map has 170+ scenes", Object.keys(SCN.SCENES).length >= 170, Object.keys(SCN.SCENES).length);
ok("every scene tag is a style a request can name", Object.values(SCN.SCENES).flatMap(x => x.tags).every(t => E.wantStyles({ keywords: [t] }).length));
ok("new scenes are reachable from a description", rsc("plena panameña")[0] === "plena_panama" && rsc("deutschrap")[0] === "german_rap" && rsc("show tunes")[0] === "musicals" && rsc("midwest emo")[0] === "emo", [rsc("plena panameña"), rsc("deutschrap"), rsc("show tunes"), rsc("midwest emo")]);
ok("plain “rock”, “metal”, “jazz” keep to the broad scenes", !rsc("rock").some(k => /prog|psych|post_rock|hard_rock_modern|soft_rock|jrock/.test(k)) && JSON.stringify(rsc("metal")) === '["metal"]' && JSON.stringify(rsc("jazz")) === '["jazz_classic"]', [rsc("rock"), rsc("metal"), rsc("jazz")]);
ok("a named subgenre still finds its scene", rsc("death metal").includes("extreme_metal") && rsc("prog rock")[0] === "prog_rock" && rsc("gypsy jazz").includes("gypsy_jazz"));
ok("regional pop and hip hop only when asked", !rsc("pop").some(k => /arabic|turkish|cpop|opm/.test(k)) && !rsc("hip hop").includes("khiphop") && rsc("k-hip hop").includes("khiphop"), [rsc("pop"), rsc("hip hop")]);
ok("plain “rap” is hip hop, not female rap", rsc("rap").includes("hiphop_2000s") && !rsc("rap").includes("female_rap") && rsc("female rappers")[0] === "female_rap", rsc("rap"));
ok("“una banda de rock” is a band, “banda sinaloense” is banda", !rsc("una banda de rock").includes("banda") && !rsc("mi banda favorita").includes("banda") && rsc("banda sinaloense")[0] === "banda", [rsc("una banda de rock"), rsc("mi banda favorita")]);
ok("ordinary words don't pick scenes", !rsc("music for my son's graduation").length && !rsc("electro").includes("electroclash") && !rsc("música para estudiar ingeniería industrial").length, [rsc("music for my son's graduation"), rsc("electro")]);
const W1 = (SCN.SCENES.reggaeton_new.wide || [])[0]; ok("third tier: weaker members that never pick scenes", W1 && E.kbOf(W1[0]).every(m => m.tier === "wide"), W1 && E.kbOf(W1[0]));
const gl = globalThis.Catalog.guessLang; ok("a title or name in another language's letters is read as that language", gl("Sığamıyorum") === "tr" && gl("Işın Karaca", true) === "tr" && gl("사랑해") === "ko" && gl("Corazón") === "es" && gl("Lady Gaga", true) === null, [gl("Sığamıyorum"), gl("Işın Karaca", true), gl("Lady Gaga", true)]);
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1;

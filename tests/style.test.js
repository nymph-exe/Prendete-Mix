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
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1;

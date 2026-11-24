// Classic description reader: offline checks (names are only candidates; the app verifies them in the catalog).
const R = require("../reader.js");
let pass = 0, fail = 0; const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `→ got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
let r = R.read("reggaeton y trap latino para el gym, tipo Bad Bunny, Feid y Young Miko, sin Daddy Yankee, desde 2019, en español");
eq("es genres", r.traits.genres, ["Reggaeton", "Latin Music", "Rap/Hip Hop"]); eq("es mood", r.traits.moods, ["Workout"]); eq("es era", r.traits.era, [2019, new Date().getFullYear()]);
eq("es language", r.traits.languages, ["es"]); eq("es references", r.referenceArtists, ["Bad Bunny", "Feid", "Young Miko"]); eq("es exclusion", r.excludeArtists, ["Daddy Yankee"]);
r = R.read("chill lofi beats to study, nothing in english, around 80 bpm");
eq("lofi moods", r.traits.moods, ["Chill", "Focus"]); eq("lofi bpm", r.traits.bpm, [74, 86]); eq("not english", r.traits.notLanguages, ["en"]); eq("lofi keyword", r.traits.keywords, ["lofi"]);
r = R.read('Sunny Brazilian funk for the beach. Must have "Envolver" by Anitta. Something like Bola Rebola by Tropkillaz. Remixes are welcome.');
eq("must include", r.include, [{ title: "Envolver", artist: "Anitta" }]); eq("reference song", r.references, [{ title: "Bola Rebola", artist: "Tropkillaz" }]); eq("brazilian not soul", r.traits.genres, ["Brazilian Music"]); eq("versions ok", r.traits.versions, true);
r = R.read("Upbeat party songs, any language. Mellow is fine. No overplayed hits, joke songs or throwback anthems. 2017–2026. No DaBaby.");
eq("any language", r.traits.languages, []); eq("avoid hits", r.traits.avoidHits, true); eq("era range", r.traits.era, [2017, 2026]); eq("only DaBaby excluded", r.excludeArtists, ["DaBaby"]);
r = R.read("90s and early 2000s R&B slow jams, clean versions, like Aaliyah and Brandy");
eq("decades", r.traits.era, [1990, 2004]); eq("clean", r.traits.explicit, "clean"); eq("r&b refs", r.referenceArtists, ["Aaliyah", "Brandy"]);
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1;

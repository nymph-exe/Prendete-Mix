// Classic description reader: offline checks (names are only candidates; the app verifies them in the catalog).
const R = require(process.env.V3 ? process.env.V3 + "/reader.js" : "../reader.js");
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
// any genre from the bundled MusicBrainz list, plural or hyphenated, plus styles to leave out
r = R.read("80s synthpop and new wave for a retro night"); eq("synthpop + new wave", r.traits.keywords, ["new wave", "synth-pop"]); eq("80s", r.traits.era, [1980, 1989]);
r = R.read("corridos tumbados y regional mexicano como Peso Pluma y Natanael Cano"); eq("corridos tumbados", r.traits.keywords, ["regional mexicano", "corrido tumbado"]);
r = R.read("UK drill and grime, aggressive, like Central Cee and Skepta"); eq("uk drill", r.traits.keywords, ["grime", "uk drill"]);
r = R.read("shoegaze and dream pop, no metal"); eq("shoegaze", r.traits.keywords, ["shoegaze", "dream pop"]); eq("not metal", r.traits.notStyles, ["metal"]);
r = R.read("house party songs, no edm"); eq("not edm", r.traits.notStyles, ["edm"]); eq("summary no EDM", /No EDM\./.test(r.summary), true);
r = R.read("sad indie folk for a rainy day, like Phoebe Bridgers and Bon Iver"); eq("indie folk", r.traits.keywords, ["indie folk"]);
r = R.read("90s and early 2000s R&B slow jams, clean versions, like Aaliyah and Brandy"); eq("slow jams romantic", r.traits.moods, ["Romantic"]); eq("slow jams tempo", r.traits.tempo, "slow");
r = R.read("K-pop dance songs, high energy, hidden gems only"); eq("hidden gems", [r.traits.gems, r.traits.avoidHits], [true, true]);
r = R.read("no Reggaeton, more Dembow like El Alfa"); eq("ruled-out genre dropped", r.traits.genres, []); eq("genre not an artist", r.excludeArtists, []);
r = R.read("funk brasileiro para la previa, bien perreo"); eq("perreo is the vibe here", [r.traits.genres, r.traits.keywords], [["Brazilian Music"], ["funk brasileiro"]]);
r = R.read("perreo intenso para la disco"); eq("la disco is the club", r.traits.keywords, ["perreo"]);
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1;

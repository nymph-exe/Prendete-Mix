/* "Never suggest" matching: IDs decide, exact full names only where there's no ID. Offline. */
const APP = __dirname + "/../../app", DATA = __dirname + "/../../data";
const A = require(APP + "/artists.js");
let pass = 0, fail = 0;
const ok = (name, c, info) => { if (c) pass++; else { fail++; console.log("FAIL", name, info === undefined ? "" : JSON.stringify(info)); } };

const DABABY = { name: "DaBaby", about: "American rapper (born 1991)", dz: [11363014, 100877302], it: [1175595427], mb: "87ae83df-6173-40cc-a0f2-bad543faa6aa" };
const B = A.banSet([DABABY]);
const dz = (t, names, ids) => ({ id: "dz:1", dz: 1, t, a: names.join("; "), aid: ids });

ok("his own song", A.banned(dz("ROCKSTAR", ["DaBaby", "Roddy Ricch"], [11363014, 13594287]), B));
ok("his duplicate Deezer profile", A.banned(dz("Wakanda", ["Anuel AA", "DaBaby"], [7961888, 100877302]), B));
ok("featured, credited by ID", A.banned(dz("Levitating (feat. DaBaby)", ["Dua Lipa", "DaBaby"], [5934153, 11363014]), B));
ok("another artist named “Da baby” is not him", !A.banned(dz("Coochie Bag", ["Tanya Stephens", "Da baby"], [431, 12392348]), B));
ok("a similar name is not him", !A.banned(dz("Song", ["Dabbaby"], [999]), B));
ok("“Fababy” is not him", !A.banned(dz("Song", ["Fababy"], [1435566]), B));
ok("Apple Music: his profile", A.banned({ id: "it:1", t: "Suge", a: "DaBaby", aid: [], itA: 1175595427 }, B));
ok("Apple Music: a namesake profile", !A.banned({ id: "it:2", t: "Algo", a: "Da Baby", aid: [], itA: 1462200567 }, B));
ok("Apple Music: no ID at all falls back to the exact name", A.banned({ id: "it:3", t: "Suge", a: "DaBaby", aid: [] }, B));
ok("feat. only in the title, exact name", A.banned(dz("Song (feat. DaBaby)", ["Someone"], [5]), B));
ok("feat. in the title, credited with another ID: the ID decides", !A.banned(dz("Song (feat. Da Baby)", ["Someone", "Da Baby"], [5, 12392348]), B));
ok("a combined credit containing him", A.banned({ id: "it:4", t: "X", a: "DaBaby & Roddy Ricch", aid: [] }, B));
ok("candidate artist by ID", A.banned({ a: "DaBaby", aid: [11363014], t: "" }, B) && !A.banned({ a: "Da baby", aid: [12392348], t: "" }, B));

/* the bug that started this: a partial name blocked whole discographies */
const C = A.banSet(["car"]);
ok("“car” doesn't block Carla Morrison in a title", !A.banned(dz("Te Quiero (feat. Carla Morrison)", ["X"], [1]), C));
ok("“car” doesn't block Carín León", !A.banned(dz("Song (feat. Carín León)", ["Grupo Frontera"], [2]), C) && !A.banned(dz("Song", ["Carín León"], [3]), C));
ok("“car” doesn't block Cardi B", !A.banned(dz("WAP", ["Cardi B", "Megan Thee Stallion"], [4, 5]), C));
ok("an old plain name still blocks that exact name", A.banned(dz("Song", ["CAR"], [6]), C));

/* old lists: plain names keep working, and linking replaces them */
const L = ["DaBaby"]; ok("adding the linked artist replaces the plain name", A.add(L, DABABY) && L.length === 1 && typeof L[0] === "object", L);
ok("adding him twice does nothing", !A.add(L, { name: "DaBaby", dz: [11363014] }) && L.length === 1);
ok("a namesake can be added separately", A.add(L, { name: "Da baby", dz: [12392348] }) && L.length === 2);
ok("plain names are saved as plain text", A.store("  car ") === "car" && A.entry("car").plain);
ok("feat. names split", JSON.stringify(A.featNames("Hit (feat. A, B & C)")) === JSON.stringify(["A, B & C", "A", "B", "C"]), A.featNames("Hit (feat. A, B & C)"));
/* search order: most-followed first, whatever was typed */
const order = (q, gs) => gs.slice().sort((a, b) => A._.relevance(q)(b) - A._.relevance(q)(a)).map(g => g.name);
ok("“taylor”: Taylor Swift above artists named just Taylor", order("taylor", [{ name: "Taylor", fans: 4 }, { name: "Tayl'Or", fans: 133 }, { name: "Taylor Swift", fans: 13e6, albums: 40 }, { name: "James Taylor", fans: 138e3 }])[0] === "Taylor Swift");
ok("“DaBaby”: the rapper first, a similar name below real namesakes", JSON.stringify(order("DaBaby", [{ name: "Fababy", fans: 397e3 }, { name: "Da baby", fans: 7e3 }, { name: "DaBaby", fans: 1.1e6 }])) === JSON.stringify(["DaBaby", "Da baby", "Fababy"]));
ok("an artist without Deezer followers ranks by Wikipedia coverage", order("x", [{ name: "x a", sl: 0 }, { name: "x b", sl: 80 }])[0] === "x b");
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

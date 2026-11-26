// Last.fm: answers in Last.fm's own response shapes are read correctly, with no network (fetch is stubbed).
const APP = __dirname + "/../../app";
globalThis.Core = require(APP + "/core.js"); const C = require(APP + "/catalog.js");
let pass = 0, fail = 0; const ok = (n, c, got) => { c ? pass++ : fail++; console.log(c ? "ok  " : "FAIL", n, c ? "" : JSON.stringify(got)); };
const calls = [];
const reply = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });
globalThis.fetch = async url => { const u = new URL(url); const m = u.searchParams.get("method"); calls.push(u);
  if (u.searchParams.get("api_key") === "bad") return reply(403, { error: 10, message: "Invalid API key - You must be granted a valid key by last.fm" });
  if (m === "artist.getinfo") return reply(200, { artist: { name: "Cher" } });
  if (m === "artist.getsimilar" && u.searchParams.get("artist") === "Nobody Here") return reply(200, { error: 6, message: "The artist you supplied could not be found" });
  if (m === "artist.getsimilar") return reply(200, { similarartists: { artist: [{ name: "Rauw Alejandro", mbid: "197b70c7", match: "1" }, { name: "Jhayco", mbid: "", match: "0.83" }], "@attr": { artist: "Bad Bunny" } } });
  if (m === "track.getsimilar") return reply(200, { similartracks: { track: { name: "Safaera", match: 0.9, artist: { name: "Bad Bunny" } }, "@attr": { artist: "Bad Bunny" } } }); /* a single result comes as an object */
  if (m === "artist.gettoptags") return reply(200, { toptags: { tag: [{ count: 100, name: "Cumbia" }, { count: 60, name: "under 2000 listeners" }, { count: 40, name: "albums I own" }, { count: 25, name: "panama" }, { count: 2, name: "rare" }] } });
  return reply(404, {}); };
(async () => {
  ok("nothing is asked without a key", (await C.LastFm.similarArtists("Bad Bunny")).length === 0 && calls.length === 0);
  ok("a working key checks out", await C.LastFm.check("good"));
  let err = null; try { await C.LastFm.check("bad"); } catch (e) { err = e; } ok("a rejected key says so", err && err.code === 10, err && err.message);
  C.SETTINGS.lastfm = "good";
  const sim = await C.LastFm.similarArtists("Bad Bunny"); ok("similar artists with scores", sim.length === 2 && sim[0].name === "Rauw Alejandro" && sim[1].score === .83, sim);
  ok("an artist Last.fm doesn't know gives nothing", (await C.LastFm.similarArtists("Nobody Here")).length === 0);
  const tr = await C.LastFm.similarTracks("DtMF", "Bad Bunny"); ok("one similar song (sent as an object) is read", tr.length === 1 && tr[0].a === "Bad Bunny", tr);
  const tags = await C.LastFm.artistTags("Los Plebeyos"); ok("tags without the junk ones", JSON.stringify(tags) === JSON.stringify({ cumbia: 100, panama: 25 }), tags);
  await C.LastFm.artistTags("Rei", "mbid-123"); ok("tags by MusicBrainz ID when it's known", calls[calls.length - 1].searchParams.get("mbid") === "mbid-123" && !calls[calls.length - 1].searchParams.get("artist"));
  ok("every request asks for JSON with name corrections", calls.filter(u => u.searchParams.get("api_key") === "good").every(u => u.searchParams.get("format") === "json" && u.searchParams.get("autocorrect") === "1"));
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1;
})();

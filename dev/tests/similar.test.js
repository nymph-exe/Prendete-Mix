// Similar: the artist table built from ListenBrainz's listening data loads and names artists the way the build did (no network).
const APP = __dirname + "/../../app";
const C = require(APP + "/catalog.js"); let pass = 0, fail = 0; const ok = (n, c, got) => { c ? pass++ : fail++; console.log(c ? "ok  " : "FAIL", n, c ? "" : JSON.stringify(got)); };
(async () => {
  /* the same keys and file numbers dev/tools/lbsim.py gives these names */
  const want = { "Bad Bunny": ["badbunny", 240], "Beyoncé": ["beyonce", 62], "Кино": ["кино", 90], "A$AP Rocky": ["a$aprocky", 35], "Simon & Garfunkel": ["simonandgarfunkel", 83] };
  for (const [n, [k, f]] of Object.entries(want)) ok(`key and file for ${n}`, C.Similar.key(n) === k && C.Similar.shard(k) === f, [C.Similar.key(n), C.Similar.shard(C.Similar.key(n))]);
  const bb = await C.Similar.of("Bad Bunny", 10);
  ok("finds a well-known artist", bb && bb.similar.length >= 5, bb);
  ok("neighbors come with scores between 0 and 1, best first", bb && bb.similar.every((x, i, a) => x.score > 0 && x.score <= 1 && (!i || a[i - 1].score >= x.score)), bb && bb.similar);
  ok("keeps the MusicBrainz ID to tell same-named artists apart", bb && /^[0-9a-f-]{36}$/.test(bb.mbid || ""), bb && bb.mbid);
  const kino = await C.Similar.of("кино", 5);
  ok("names in other scripts are kept", kino && kino.similar.length > 0, kino);
  ok("an unknown name gives nothing", (await C.Similar.of("zzqx no such artist 12345")) === null);
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1;
})();

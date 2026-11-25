// Listen: the preview analyzer gives sensible, bounded values on synthetic audio (no network).
const APP = __dirname + "/../../app", DATA = __dirname + "/../../data";
try { globalThis.Meyda = require("meyda"); } catch { console.log("skip: npm install meyda to run this test"); process.exit(0); }
const L = require(APP + "/listen.js"); let pass = 0, fail = 0; const ok = (n, c, got) => { c ? pass++ : fail++; console.log(c ? "ok  " : "FAIL", n, c ? "" : JSON.stringify(got)); };
const sr = 22050, secs = 20; const beat = bpm => { const x = new Float32Array(sr * secs); const per = sr * 60 / bpm; for (let i = 0; i < x.length; i++) { const ph = i % per; x[i] = .6 * Math.exp(-ph / 900) * Math.sin(2 * Math.PI * 60 * i / sr) + .05 * (Math.random() - .5) + .1 * Math.sin(2 * Math.PI * 440 * i / sr); } return x; };
const quiet = new Float32Array(sr * secs).map((_, i) => .02 * Math.sin(2 * Math.PI * 220 * i / sr));
const a = L.estimate(L.describe(beat(128), sr)), b = L.estimate(L.describe(quiet, sr));
ok("values between 0 and 1", ["e", "d", "v"].every(k => a[k] >= 0 && a[k] <= 1 && b[k] >= 0 && b[k] <= 1), [a, b]);
ok("finds a 128 BPM pulse", [128, 64, 256].some(t => Math.abs(a.bpm - t) / t < .06), a.bpm);
ok("a loud beat has more energy than a quiet tone", a.e > b.e, [a.e, b.e]);
ok("marked as an estimate", a.est === 1);
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1;

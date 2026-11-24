/* MIXER (internally the Préndete app) — Listen: estimates energy, danceability, mood and tempo from a song's
   30-second Deezer preview, for songs the audio-feature catalogs don't know yet. Uses Meyda (MIT) for the
   spectral features; the mapping to 0–1 scores was fitted on songs whose values ReccoBeats does know. */
(function (G) {
"use strict";
const MeydaLib = () => G.Meyda || (typeof require !== "undefined" ? require("meyda") : null);
const BUF = 1024, HOP = 512;
const KRUM_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], KRUM_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb || 1); };
const pct = (a, q) => { const b = Float64Array.from(a).sort(); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
/* raw descriptors of mono samples */
function describe(x, sr) {
  const M = MeydaLib(); M.bufferSize = BUF; M.sampleRate = sr; M.windowingFunction = "hanning";
  const rms = [], cen = [], flat = [], zcr = [], roll = [], flux = [], bass = []; const chroma = new Float64Array(12); let prev = null;
  const binHz = sr / BUF, bassBins = Math.max(1, Math.round(150 / binHz));
  for (let i = 0; i + BUF <= x.length; i += HOP) {
    const fr = x.subarray(i, i + BUF); const f = M.extract(["rms", "spectralCentroid", "spectralFlatness", "zcr", "spectralRolloff", "amplitudeSpectrum", "chroma"], fr);
    rms.push(20 * Math.log10((f.rms || 0) + 1e-6)); cen.push((f.spectralCentroid || 0) * binHz); flat.push(f.spectralFlatness || 0); zcr.push(f.zcr || 0); roll.push(f.spectralRolloff || 0);
    const A = f.amplitudeSpectrum; let tot = 0, lo = 0, fl = 0; for (let k = 0; k < A.length; k++) { tot += A[k]; if (k < bassBins) lo += A[k]; if (prev) { const d = A[k] - prev[k]; if (d > 0) fl += d; } }
    bass.push(tot ? lo / tot : 0); flux.push(fl); prev = Float32Array.from(A);
    if (f.rms > .01 && f.chroma) for (let k = 0; k < 12; k++) chroma[k] += f.chroma[k] || 0;
  }
  // onsets and tempo from the spectral-flux envelope
  const fps = sr / HOP, m = flux.reduce((a, b) => a + b, 0) / flux.length; const env = flux.map(v => Math.max(0, v - m));
  let onsets = 0; for (let i = 1; i < env.length - 1; i++) if (env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > 1.5 * m) onsets++;
  const lagMin = Math.round(fps * 60 / 180), lagMax = Math.round(fps * 60 / 70); let best = 0, bl = lagMin; const ac0 = env.reduce((s, v) => s + v * v, 0) || 1;
  const ac = l => { let s = 0; for (let i = 0; i + l < env.length; i++) s += env[i] * env[i + l]; return s / ac0; };
  for (let l = lagMin; l <= lagMax; l++) { const v = ac(l) + .5 * ac(2 * l); if (v > best) { best = v; bl = l; } }
  let bpm = 60 * fps / bl; if (bpm < 85) bpm *= 2;
  // key mode (major vs minor) from the chroma profile
  let maj = -1, min = -1; const ch = Array.from(chroma); for (let r = 0; r < 12; r++) { const rot = ch.slice(r).concat(ch.slice(0, r)); maj = Math.max(maj, corr(rot, KRUM_MAJ)); min = Math.max(min, corr(rot, KRUM_MIN)); }
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length; const sd = a => { const u = mean(a); return Math.sqrt(mean(a.map(v => (v - u) ** 2))); };
  const loud = rms.filter(v => v > -60);
  return { db: mean(loud.length ? loud : rms), db90: pct(rms, .9), dbsd: sd(loud.length ? loud : rms), cen: mean(cen) / 4000, flat: mean(flat), zcr: mean(zcr) / BUF, roll: mean(roll) / (sr / 2),
    onset: onsets / (x.length / sr), flux: m, pulse: best, bass: mean(bass), mode: maj - min, bpm };
}
const KEYS = ["db", "db90", "dbsd", "cen", "flat", "zcr", "roll", "onset", "flux", "pulse", "bass", "mode"];
/* fitted coefficients: {target: {mu, sd, w, b}} — see tests/listen.fit.js */
const MODEL = {"e":{"mu":[-17.198,-11.684,4.8849,0.51096,0.29459,0.086361,0.83046,2.3521,275.83,0.72183,0.17788,0.0080111],"sd":[4.7687,4.1055,1.883,0.17103,0.11547,0.034855,0.1385,0.75946,155.48,0.21579,0.090197,0.14915],"w":[0.05632,0.008037,-0.002788,-0.06119,0.09176,0.06904,0.002696,0.02715,0.05245,0.01804,-0.02095,-0.007785],"b":0.5954},"d":{"mu":[-17.198,-11.684,4.8849,0.51096,0.29459,0.086361,0.83046,2.3521,275.83,0.72183,0.17788,0.0080111],"sd":[4.7687,4.1055,1.883,0.17103,0.11547,0.034855,0.1385,0.75946,155.48,0.21579,0.090197,0.14915],"w":[-0.002968,0.03923,0.04256,0.02407,-0.03677,0.006862,0.03901,0.03936,0.01674,0.009412,0.003232,0.003691],"b":0.6685},"v":{"mu":[-17.198,-11.684,4.8849,0.51096,0.29459,0.086361,0.83046,2.3521,275.83,0.72183,0.17788,0.0080111],"sd":[4.7687,4.1055,1.883,0.17103,0.11547,0.034855,0.1385,0.75946,155.48,0.21579,0.090197,0.14915],"w":[0.0463,-0.01599,0.006035,-0.0127,-0.01628,0.08719,0.05004,0.07498,-0.001074,0.01832,-0.05373,0.005106],"b":0.528}};
const clamp = v => Math.max(0, Math.min(1, v));
function estimate(d) {
  if (!MODEL) return null; const out = { bpm: Math.round(d.bpm), est: 1 };
  for (const [k, m] of Object.entries(MODEL)) { let y = m.b; KEYS.forEach((f, i) => { y += m.w[i] * ((d[f] - m.mu[i]) / (m.sd[i] || 1)); }); out[k] = +clamp(y).toFixed(3); }
  return out;
}
/* browser: fetch + decode a preview, downmix to mono 22,050 Hz (node, for tests: ffmpeg) */
async function fromUrl(url) {
  const AC = G.OfflineAudioContext || G.webkitOfflineAudioContext;
  if (!AC && typeof process !== "undefined" && typeof require !== "undefined") { try { if (!G.Meyda) G.Meyda = require("meyda"); } catch { return null; }
    const cp = require("child_process"); const b = Buffer.from(await (await fetch(url)).arrayBuffer());
    const pcm = cp.execFileSync("ffmpeg", ["-v", "quiet", "-i", "pipe:0", "-ac", "1", "-ar", "22050", "-f", "f32le", "pipe:1"], { input: b, maxBuffer: 64 << 20 });
    const x = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4)); return x.length > 22050 * 8 ? estimate(describe(x, 22050)) : null; }
  if (!AC || !MeydaLib()) return null;
  const buf = await (await fetch(url)).arrayBuffer(); const ctx0 = new AC(1, 22050, 22050);
  const audio = await new Promise((res, rej) => { const p = ctx0.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
  const sr = 22050, len = Math.ceil(audio.duration * sr); const off = new AC(1, len, sr); const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
  const out = await off.startRendering(); return estimate(describe(out.getChannelData(0), sr));
}
const API = { describe, estimate, fromUrl, KEYS, get ready() { return !!MODEL && !!MeydaLib(); } };
G.Listen = API;
if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

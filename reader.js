/* Préndete Mix — Classic description reader. Rule-based (no AI): reads a typed description in English or Spanish
   and returns the same structure the AI reader returns, so both feed the same preview and the same engine.
   Names it finds are only candidates; the app verifies every one against the catalog before using it. */
(function (G) {
"use strict";
const CUR = new Date().getFullYear();
const deacc = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’`´]/g, "'");
const NEG = /(?:^|\b)(no|not|nothing|without|sin|nada|ni|never|nunca|avoid|avoiding|skip|except|excepto|excluding|minus|zero|don'?t|no quiero|hate|odio|evita|evitar|menos|ningun[oa]?|cero|less)\b[^,]*$/;
const OK_AFTER = /^\s*(?:is|are|es|son|esta|estan|also|tambien|too)?\s*(?:fine|ok|okay|bien|vale|allowed|welcome|permitid[oa]s?|bienvenid[oa]s?)\b/;
const GENRES = [
  [/\b(reggaeton|regueton|reguetton|perreo|dembow|urbano latino|musica urbana|latin urban)\b/, "Reggaeton"], [/\b(latin|latino|latina|latinos|musica latina|latin music)\b/, "Latin Music"],
  [/\bsalsa\b/, "Salsa"], [/\bcumbias?\b/, "Cumbia"], [/\b(regional mexicano|corridos?|corridos tumbados|tumbados?|banda|mariachi|nortenos?|sierrenos?)\b/, "Traditional Mexicano"],
  [/\b(rap|hip[ -]?hop|trap|drill|grime|boom bap)\b/, "Rap/Hip Hop"], [/(?<![kjc]-?)\bpop\b/, "Pop"], [/\b(rock|punk|grunge|pop punk)\b/, "Rock"],
  [/\b(edm|dance music|dance-pop|house|club music|eurodance)\b/, "Dance"], [/\b(electro|electronic|electronica|techno|trance|dubstep|drum and bass|dnb)\b/, "Electro"],
  [/\b(r&b|rnb|r ?n ?b|r and b)\b/, "R&B"], [/\b(soul|(?<!brazilian |baile |brasil |brazil )funk(?! carioca)|motown|disco)\b/, "Soul & Funk"], [/\b(alternative|alt|indie)\b/, "Alternative"],
  [/\b(reggae|dancehall)\b/, "Reggae"], [/\bjazz\b/, "Jazz"], [/\bcountry\b/, "Country"], [/\b(classical|clasica|orchestral|opera)\b/, "Classical"], [/\b(metal|metalcore|heavy metal)\b/, "Metal"],
  [/\b(afrobeats?|afro ?pop|amapiano|afro house|african)\b/, "African Music"], [/\b(k-?pop|j-?pop|c-?pop|asian|anime)\b/, "Asian Music"],
  [/\b(brazilian|brasil|brazil|brasileir[oa]|funk carioca|baile funk|sertanejo|pagode|bossa nova|mpb|forro)\b/, "Brazilian Music"], [/\bblues\b/, "Blues"], [/\bfolk\b/, "Folk"],
  [/\b(christian|gospel|worship|cristiana?|alabanza)\b/, "Christian"], [/\b(soundtracks?|film music|movie music|game music|ost)\b/, "Films/Games"]
];
const MOODS = [
  [/\b(part(y|ies)|fiesta|pregame|pre-game|turn up|club|perreo|rumba|jangueo|janguear|bellaqueo|antro|discoteca|carrete|parrandas?|vacil[oó]n)\b/, "Party"],
  [/\b(hype|hyped|pump(ed)? up|intense|aggressive|bangers?|turnt|hard[- ]hitting|motivat\w*)\b/, "Hype"],
  [/\b(workout|gym|training|running|cardio|entreno|entrenar|ejercicio|correr)\b/, "Workout"],
  [/\b(chill|chilling|relax\w*|calm|laid[- ]back|lo-?fi|tranquil[oa]|easy listening|unwind|sunday morning)\b/, "Chill"],
  [/\b(romantic|romantic[oa]|love songs?|canciones de amor|date night|enamorad[oa]s?|cita)\b/, "Romantic"],
  [/\b(sad|triste|heartbreak|heartbroken|despecho|melanchol\w*|crying|llorar|breakup|ruptura)\b/, "Sad"],
  [/\b(dark|oscur[oa]|moody|sinister|eerie|gloomy)\b/, "Dark"],
  [/\b(feel[- ]good|happy|feliz|alegre|sunny|summer|verano|playa|beach|cheerful|good vibes|buena vibra|buen rollo|positive|positiv[oa])\b/, "Feel-good"],
  [/\b(sexy|sensual|seductive|slow jams?|bellac[oa]|intimate|intim[oa])\b/, "Sensual"],
  [/\b(focus|study|studying|estudiar|concentrat\w*|deep work|coding)\b/, "Focus"],
  [/\b(danceable|bailable|bailables|to dance|para bailar|groovy|groove|dance ?floor|pista|bailar|dance (?:songs|tracks|hits|jams))\b/, "Danceable"]
];
const ENERGY = [[/\b(high[- ]energy|energetic|energetic[oa]|enérgic[oa]|energic[oa]|upbeat|lively|fast[- ]paced|alta energia|movid[oa]s?|explosive|power)\b/, "high"],
  [/\b(low[- ]energy|mellow|soft|gentle|quiet|suaves?|tranquil[oa]s?|baja energia|calmad[oa]s?)\b/, "low"], [/\b(mid[- ]energy|medium energy|moderate energy|energia media)\b/, "medium"]];
const TEMPO = [[/\b(fast|rapid[oa]s?|uptempo|up-tempo|quick|acelerad[oa]s?)\b(?! paced)/, "fast"], [/\b(slow|lent[oa]s?|downtempo|down-tempo)\b(?!ed)/, "slow"], [/\b(mid-?tempo|medium tempo|tempo medio)\b/, "mid"]];
const LANGS = [[/\b(spanish|espanol|castellano|en espanol|latin lyrics)\b/, "es"], [/\b(english|ingles|en ingles)\b/, "en"], [/\b(portuguese|portugues|em portugues)\b/, "pt"],
  [/\b(french|frances|francais)\b/, "fr"], [/\b(italian|italiano)\b/, "it"], [/\b(german|aleman|deutsch)\b/, "de"], [/\b(korean|coreano|k-?pop)\b/, "ko"], [/\b(japanese|japones|j-?pop)\b/, "ja"],
  [/\b(chinese|chino|mandarin|c-?pop)\b/, "zh"], [/\b(russian|ruso)\b/, "ru"], [/\b(arabic|arabe)\b/, "ar"], [/\b(hindi|bollywood)\b/, "hi"]];
const ANYLANG = /\b(any language|all languages|any languages|cualquier idioma|todos los idiomas|whatever language|any lang)\b/;
const BILINGUAL = /\b(spanglish|bilingual|bilingue)\b/;
const HITS_AVOID = /\b(overplayed|over-played|mainstream|top 40|radio hits?|viral|tiktok|snippets?|too popular|super popular|quemad[oa]s?|trillad[oa]s?)\b/;
const HITS_NICHE = /\b(underground|deep cuts?|hidden gems?|lesser[- ]known|less known|niche|obscure|joyitas?|poco conocid[oa]s?|under the radar|b-sides?)\b/;
const HITS_PREFER = /\b(hits|top hits|popular|chart|charting|exitos|famous|famos[oa]s|bangers everyone knows|well[- ]known|conocid[oa]s)\b/;
const CLEAN = /\b(clean|family[- ]friendly|kid[- ]friendly|kids|radio edit|sin groserias|sin malas palabras|para ninos|no explicit|no swearing|no cursing)\b/;
const EXPLICIT = /\b(explicit|uncensored|dirty versions?)\b/;
const VERSIONS = /\b(remix(es)?|live versions?|en vivo|sped[- ]up|slowed|acoustic|acustic[oa]s?|covers?)\b/;
const THROWBACK = /\b(throwbacks?|old school|oldies|classics|clasicos|retro|vieja escuela)\b/;
const RECENT = /\b(recent|new music|new songs|newest|latest|current|nuev[oa]s|recientes|actuales|de ahora|fresh|this year|este ano)\b/;
const FILLER = new Set("the a an some songs song music tracks track stuff things vibes vibe artists artist bands band singers people like and or y o e de del la el los las con with by from of en mas more other otros otras canciones cancion musica temas tema artistas cosas rollo tipo estilo as such similar to also too even just only really very".split(" "));
const CUE_REF = /\b(like|similar to|such as|in the style of|sounds? like|think|influenced by|inspired by|e\.?g\.?|for example|parecid[oa]s? a|como|tipo|estilo|onda|al estilo de|rollo|artists? like|songs? like|references?|reference|vibes? (?:of|like)|from artists like|similar a|influencias? de|songs by|music by|tracks by|canciones de|musica de|temas de|artists such as)\s*[:]?\s*/g;
const CUE_MUST = /\b(must (?:have|include|be on it)|has to have|have to include|include|including|add|make sure (?:to (?:add|include))?|needs?|with|incluye|incluir|incluya|que tenga|tiene que tener|agrega|agregar|anade|pon|ponle|que este|que esten)\s*[:]?\s*/g;
const CUE_EX = /\b(no|not|without|nothing (?:by|from)|except|excluding|exclude|avoid|skip|ban|never|hate|sin|nada de|excepto|menos|ni|odio|evita|evitar|cero|zero)\s+/g;
const COMMON = new Set(("i you he she it we they me him her us them my your his its our their this that these those what which who whom whose when where why how all any both each few more most other some such no nor not only own same so than too very can will just don should now one two three first last new old good bad great best better high low big small long short little right left real true false hot cool nice sweet hard soft light heavy fast slow loud quiet happy sad fun funny joke jokes silly cringe corny cheesy generic boring basic typical random weird strange classic modern fresh clean dirty dark bright warm cold summer winter spring fall day night morning evening weekend time year years life love heart world man woman girl boy baby people friends family home house car road city street beach sun moon star fire water rain wind sky way thing things stuff something anything everything nothing someone anyone everyone song songs track tracks hit hits album albums artist artists band bands singer rapper producer music sound sounds beat beats vibe vibes mood energy playlist list mix set radio video tiktok snippet snippets anthem anthems throwback throwbacks must should could would might may also even still again ever never always sometimes often maybe please thanks hello hey yes yeah okay ok fine well much many lot lots kind sort type style feel feeling think want need like make get go come see know take give find tell ask work play put keep let begin seem help show hear run move live believe bring happen write sit stand lose pay meet include continue set learn change lead understand watch follow stop create speak read spend grow open walk win offer remember consider appear buy wait serve die send expect build stay fall cut reach kill remain suggest raise pass sell require report decide pull " +
  "yo tu el ella nosotros ustedes ellos mi mis su sus nuestro que cual quien cuando donde como todo todos nada algo alguien nadie bueno buena malo mala mejor peor alto bajo grande pequeno nuevo nueva viejo vieja rapido lento suave fuerte feliz triste caliente frio dia noche manana tarde semana ano anos vida amor corazon mundo hombre mujer chica chico gente amigos familia casa carro calle playa sol luna fuego agua cancion canciones tema temas musica artista artistas sonido ritmo vibra lista algo cosas tipo estilo onda rollo sin con para por pero tambien muy mas menos solo siempre nunca ahora hoy").split(" "));
const MONTHS = /^(january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$/;

function lexiconWord(w) {
  const x = deacc(w).trim(); if (!x) return true; if (FILLER.has(x) || COMMON.has(x)) return true;
  return [...GENRES, ...MOODS, ...ENERGY, ...TEMPO, ...LANGS].some(([re]) => new RegExp("^(?:" + re.source.replace(/^\\b|\\b$/g, "") + ")$").test(x)) ||
    HITS_AVOID.test(x) || HITS_NICHE.test(x) || HITS_PREFER.test(x) || CLEAN.test(x) || VERSIONS.test(x) || THROWBACK.test(x) || RECENT.test(x) || /\d/.test(x) || MONTHS.test(x) ||
    /\b(energy|tempo|bpm|mood|years?|anos?|decadas?|decades?|languages?|idiomas?|lyrics|letras|playlist|lista|songs?|canciones|vibes?|hits?|beats?|sound|sonido|anthems?|himnos?|feel|sentir|night|noche|day|dia|morning|manana|weekend|finde)\b/.test(x);
}
function clauses(text) {
  const out = []; const re = /[^.!?;\n]+/g; let m;
  while ((m = re.exec(text))) { const parts = m[0].split(/\b(?=but |pero |however |sino |aunque )/); let off = m.index; for (const p of parts) { out.push({ s: off, e: off + p.length }); off += p.length; } }
  return out;
}
/* find every match of re; return {val, neg, allowed} per hit, judging negation inside its own comma-separated segment */
function hits(low, re, cls) {
  const g = new RegExp(re.source, "g"); const res = []; let m;
  while ((m = g.exec(low))) {
    const i = m.index, c = cls.find(c => i >= c.s && i < c.e) || { s: 0 }; let seg = low.slice(c.s, i); const comma = seg.lastIndexOf(","); if (comma >= 0) seg = seg.slice(comma + 1);
    const after = low.slice(i + m[0].length, i + m[0].length + 24);
    res.push({ m, i, neg: NEG.test(seg), allowed: OK_AFTER.test(after) });
    if (m[0].length === 0) g.lastIndex++;
  }
  return res;
}
function splitNames(chunk) {
  const lead = /^(?:i (?:want|need|like|love|wanna|mean)|we (?:want|need)|give me|gimme|quiero|queremos|dame|me gustan?|something|some|more|a few|a bunch of|lots of|mostly|mainly|just|only|maybe|especially|sobre todo|mucho|mucha|the music of|music by|songs by|canciones de|musica de|temas de|stuff by|artists like|songs like|canciones|songs)\s+/i;
  const tail = /\s+(?:vibes?|type(?: of)?|style|energy|songs?|music|stuff|canciones|musica|tracks)$/i;
  return chunk.split(/\s*(?:,|\/|&| and | y | or | o | e | plus | as well as |\+)\s*/i).map(x => {
    x = x.trim().replace(/^["“”'‘]+|["“”'‘]+$/g, "").trim(); let y;
    while ((y = x.replace(lead, "").replace(tail, "")) !== x) x = y.trim();
    return x;
  }).filter(x => x && x.length >= 2 && x.split(/\s+/).length <= 5 && !lexiconWord(x) && !x.split(/\s+/).every(w => lexiconWord(w)));
}

function read(text) {
  const raw = String(text || ""); const low = deacc(raw); const cls = clauses(low);
  const tr = { genres: [], moods: [], keywords: [], energy: "", tempo: "", bpm: null, era: null, languages: [], notLanguages: [], explicit: "any", versions: false, avoidHits: false, preferHits: false };
  const out = { name: "", summary: "", include: [], references: [], referenceArtists: [], excludeArtists: [], excludeSongs: [], traits: tr, verifyNames: true };
  const add = (arr, v) => { if (v && !arr.includes(v)) arr.push(v); };
  for (const [re, name] of GENRES) for (const x of hits(low, re, cls)) if (!x.neg) { add(tr.genres, name); if (x.m[0].length > 2 && !/^(latin[oa]?s?|pop|rock|dance music|alt|asian)$/.test(x.m[0])) add(tr.keywords, x.m[0]); }
  for (const x of hits(low, /\b(lo-?fi|ambient|piano|acoustic guitar|synthwave|city pop|bedroom pop|phonk|jersey club|drill|baile funk|guaracha|bachata|merengue|vallenato|tango|flamenco|bolero|kizomba|dancehall|soca|grime|garage|deep house|tech house|afro house|trance|hyperpop|shoegaze|emo|neo soul|boom bap|jazz rap|jazz-hop|chillhop|bossa nova|instrumental)\b/, cls)) if (!x.neg) add(tr.keywords, x.m[0]);
  // "to dance" style phrases mean danceable, not the Dance genre
  for (const [re, name] of MOODS) for (const x of hits(low, re, cls)) if (!x.neg && !x.allowed) add(tr.moods, name);
  for (const [re, v] of ENERGY) for (const x of hits(low, re, cls)) if (!x.neg && !x.allowed && !tr.energy) tr.energy = v;
  for (const x of hits(low, /\b(not too|no tan|nothing too|not overly)\s+(mellow|soft|slow|calm|suave|lento|tranquilo)\b/, cls)) { if (!tr.energy) tr.energy = "medium"; }
  // rhythm: explicit BPM beats words
  let m;
  if ((m = /(\d{2,3})\s*(?:-|–|to|a|y)\s*(\d{2,3})\s*bpm/.exec(low))) tr.bpm = [Math.min(+m[1], +m[2]), Math.max(+m[1], +m[2])];
  else if ((m = /(?:over|above|more than|mas de|sobre|at least|minimo|faster than)\s*(\d{2,3})\s*bpm/.exec(low))) tr.bpm = [+m[1], 220];
  else if ((m = /(?:under|below|less than|menos de|bajo|slower than|max(?:imo)?)\s*(\d{2,3})\s*bpm/.exec(low))) tr.bpm = [50, +m[1]];
  else if ((m = /(?:around|about|~|cerca de|alrededor de)?\s*(\d{2,3})\s*bpm/.exec(low))) tr.bpm = [+m[1] - 6, +m[1] + 6];
  if (!tr.bpm) for (const [re, v] of TEMPO) for (const x of hits(low, re, cls)) if (!x.neg && !x.allowed && !tr.tempo && !/slowed|sped/.test(x.m[0])) tr.tempo = v;
  // years
  const yr = [];
  for (const x of hits(low, /\b((?:19|20)\d{2})\s*(?:-|–|to|a|hasta|through|thru|al|y)\s*((?:19|20)\d{2})\b/, cls)) if (!x.neg) yr.push([+x.m[1], +x.m[2]]);
  if (!yr.length) {
    for (const x of hits(low, /\b(?:from|since|desde|after|despues de|post|starting|a partir de)\s*((?:19|20)\d{2})\b/, cls)) if (!x.neg) yr.push([+x.m[1], CUR]);
    for (const x of hits(low, /\b(?:before|until|up to|antes de|hasta|pre)\s*((?:19|20)\d{2})\b/, cls)) if (!x.neg) yr.push([1900, +x.m[1]]);
    for (const x of hits(low, /\b(early|late|mid|principios de los|finales de los|mediados de los)?\s*(?:the |los |la decada de los )?((?:19|20)?\d0)'?s?\b(?=s|'s|\s|$|,)/, cls)) {
      const t = x.m[0]; if (!/s\b|'s|los |decada/.test(t + low.slice(x.i + t.length, x.i + t.length + 2))) continue; if (x.neg) continue;
      let d = +x.m[2]; if (d < 100) d += d >= 30 ? 1900 : 2000; if (d < 1900 || d > CUR) continue;
      let a = d, b = Math.min(d + 9, CUR); const q = x.m[1] || ""; if (/early|principios/.test(q)) b = d + 4; else if (/late|finales/.test(q)) a = d + 5; else if (/mid|mediados/.test(q)) { a = d + 3; b = d + 7; }
      yr.push([a, b]);
    }
    for (const x of hits(low, /\b((?:19|20)\d{2})\b/, cls)) { if (x.neg || yr.length) continue; const y = +x.m[1]; if (y >= 1950 && y <= CUR + 1) yr.push([y, y]); }
    if (!yr.length) { for (const x of hits(low, RECENT, cls)) if (!x.neg) { yr.push(/this year|este ano/.test(x.m[0]) ? [CUR, CUR] : [CUR - 2, CUR]); break; } }
    if (!yr.length) { for (const x of hits(low, THROWBACK, cls)) if (!x.neg && !x.allowed) { yr.push([1980, CUR - 8]); break; } }
  }
  if (yr.length) tr.era = [Math.min(...yr.map(y => y[0])), Math.max(...yr.map(y => y[1]))];
  // languages, read from lyrics later
  if (!ANYLANG.test(low)) {
    for (const [re, l] of LANGS) for (const x of hits(low, re, cls)) { if (x.allowed) continue; if (x.neg) add(tr.notLanguages, l); else add(tr.languages, l); }
    if (BILINGUAL.test(low)) { add(tr.languages, "es"); add(tr.languages, "en"); }
    tr.notLanguages = tr.notLanguages.filter(l => !tr.languages.includes(l));
  }
  for (const x of hits(low, CLEAN, cls)) { if (/no explicit|no swearing|no cursing/.test(x.m[0])) { tr.explicit = "clean"; continue; } tr.explicit = x.neg ? "explicit" : "clean"; }
  for (const x of hits(low, EXPLICIT, cls)) { if (x.neg) tr.explicit = "clean"; else if (x.allowed || /explicit (is |are )?(fine|ok|okay)/.test(low)) { if (tr.explicit !== "clean") tr.explicit = "any"; } else tr.explicit = "explicit"; }
  for (const x of hits(low, VERSIONS, cls)) tr.versions = !x.neg;
  for (const x of hits(low, HITS_AVOID, cls)) if (x.neg) tr.avoidHits = true;
  for (const x of hits(low, HITS_NICHE, cls)) if (!x.neg) tr.avoidHits = true;
  if (!tr.avoidHits) for (const x of hits(low, HITS_PREFER, cls)) if (!x.neg && !x.allowed) tr.preferHits = true;
  // names: quoted titles, "Title by Artist", then cue-word lists, "X vibes", Capitalized names
  const seen = new Set(); const role = (s, base) => base;
  const push = (kind, item) => { const k = kind + "|" + deacc(JSON.stringify(item)); if (seen.has(k)) return; seen.add(k); out[kind].push(item); };
  const ctxRole = i => { const c = cls.find(c => i >= c.s && i < c.e) || { s: 0 }; const before = low.slice(Math.max(c.s, i - 60), i);
    const lastMatch = (re) => { let mm, last = -1; const g = new RegExp(re.source, "g"); while ((mm = g.exec(before))) last = mm.index; return last; };
    const ex = lastMatch(CUE_EX), mu = lastMatch(CUE_MUST), rf = lastMatch(CUE_REF); const mx = Math.max(ex, mu, rf); if (mx < 0) return "ref"; return mx === ex ? "ex" : mx === mu ? "must" : "ref"; };
  const qre = /["“”«»]([^"“”«»\n]{2,80})["“”«»](?:\s*(?:by|de|from|of|-|–|—)\s*([^,.;\n"“”]+?))?(?=\s*(?:[,.;\n!?)]|$| and | y | or | o | but | pero ))/g; const masked = raw.split("");
  while ((m = qre.exec(raw))) { const r = ctxRole(m.index); const item = { title: m[1].trim(), artist: (m[2] || "").trim() };
    push(r === "ex" ? "excludeSongs" : r === "must" ? "include" : "references", item); for (let k = m.index; k < m.index + m[0].length; k++) masked[k] = " "; }
  const rest = masked.join(""); const restLow = deacc(rest);
  const byre = /([\p{L}\d'’$!¡?¿&. ]{2,50}?)\s+by\s+([\p{L}\d'’$!&. ]{2,40}?)(?=\s*(?:[,.;\n!?]|$| and | or | but ))/gu;
  while ((m = byre.exec(rest))) { const t0 = m[1].replace(/^.*\b(?:like|such as|include|including|add|must have|has to have|no|not|without|sin|tipo|como|with)\s+/i, "").trim(); if (!t0 || lexiconWord(t0) || t0.split(/\s+/).length > 7) continue;
    if (/^(songs?|music|tracks|stuff|anything|something|canciones)$/i.test(t0)) continue; const r = ctxRole(m.index + m[0].indexOf(t0)); push(r === "ex" ? "excludeSongs" : r === "must" ? "include" : "references", { title: t0, artist: m[2].trim() }); }
  const cueNames = (re, kind) => { const g = new RegExp(re.source, "g"); let mm;
    while ((mm = g.exec(restLow))) { const st = mm.index + mm[0].length; const c = cls.find(c => st >= c.s && st <= c.e) || { e: restLow.length }; let end = c.e;
      const nxt = restLow.slice(st, end).search(/\b(like|similar to|such as|but|pero|must|include|without|except|no |not |sin |also|tambien|with|con |for |para |that |que |who |which )/); if (nxt > 0) end = st + nxt;
      const chunkRaw = rest.slice(st, end); for (const n of splitNames(chunkRaw)) { if (/\sby\s/i.test(n)) continue; if (kind === "excludeArtists") push("excludeArtists", n); else if (kind === "include") push("referenceArtists", n); else push("referenceArtists", n); } } };
  cueNames(CUE_REF, "referenceArtists"); cueNames(CUE_EX, "excludeArtists"); cueNames(CUE_MUST, "include");
  const vre = /([^.;!?\n]{2,90}?)\s+(?:vibes|type beat|type of|style|energy|wave)\b/gu;
  while ((m = vre.exec(rest))) { const chunk = m[1].replace(/^.*\b(?:like|with|some|more|that|those|esa|ese|con|tipo)\s+/i, ""); const r = ctxRole(m.index + m[0].length - 1);
    for (const n of splitNames(chunk)) { if (/\sby\s/i.test(n) || n.split(/\s+/).length > 4) continue; push(r === "ex" ? "excludeArtists" : "referenceArtists", n); } }
  // Capitalized names anywhere (need a stronger catalog match: see minFans)
  const cap = /(?:^|[\s,(])((?:[A-ZÁÉÍÓÚÑÜ$][\p{L}\d$'’&.!-]*)(?:\s+(?:[A-ZÁÉÍÓÚÑÜ$][\p{L}\d$'’&.!-]*|(?:de|del|la|the|of|da)\b)){0,3})/gu; const caps = [];
  while ((m = cap.exec(rest))) { let n = m[1].replace(/[.!-]+$/, "").trim(); while (n && /^(no|not|sin|must|like|tipo|como|include|with|something|some|also|and|y|or|songs?|music|upbeat|sunny)$/i.test(n.split(/\s+/)[0])) n = n.split(/\s+/).slice(1).join(" "); const words = n.split(/\s+/); if (!n || words.every(lexiconWord) || lexiconWord(n)) continue; if (words.length === 1 && n.length < 3) continue;
    const st = m.index + m[0].indexOf(n); const sentStart = /(^|[.!?\n]\s*)$/.test(rest.slice(0, st)); if (sentStart && words.length === 1 && lexiconWord(words[0])) continue;
    caps.push({ name: n, role: ctxRole(st) }); }
  const sub = (a, b) => { a = deacc(a); b = deacc(b); return a === b || a.includes(b) || b.includes(a); };
  out.maybeArtists = caps.filter((c, i) => caps.findIndex(d => deacc(d.name) === deacc(c.name)) === i).filter(c => ![...out.referenceArtists, ...out.excludeArtists].some(x => sub(x, c.name)) && ![...out.include, ...out.references, ...out.excludeSongs].some(x => deacc(x.title) === deacc(c.name) || deacc(x.artist) === deacc(c.name)));
  out.summary = summarize(out);
  return out;
}
const LN = { es: "Spanish", en: "English", pt: "Portuguese", fr: "French", it: "Italian", de: "German", ko: "Korean", ja: "Japanese", zh: "Chinese", ru: "Russian", ar: "Arabic", hi: "Hindi" };
const list = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
function summarize(o) {
  const t = o.traits, s = [];
  const what = t.genres.length ? list(t.genres) : "Songs"; const mood = t.moods.length ? ` with a ${list(t.moods.map(x => x.toLowerCase()))} feel` : "";
  s.push(`${what}${mood}${t.energy ? `, ${t.energy} energy` : ""}${t.bpm ? `, around ${t.bpm[0]}–${t.bpm[1]} BPM` : t.tempo ? `, ${t.tempo} tempo` : ""}.`);
  if (t.era) s.push(t.era[0] === t.era[1] ? `Released in ${t.era[0]}.` : `Released ${t.era[0]}–${t.era[1]}.`);
  if (t.languages.length) s.push(`Sung in ${list(t.languages.map(l => LN[l] || l))}.`); if (t.notLanguages.length) s.push(`Nothing in ${list(t.notLanguages.map(l => LN[l] || l))}.`);
  if (t.avoidHits) s.push("Skipping the most-played hits."); if (t.preferHits) s.push("Leaning toward popular songs.");
  if (t.explicit === "clean") s.push("Clean versions only."); if (t.explicit === "explicit") s.push("Explicit versions preferred."); if (t.versions) s.push("Remixes and other versions are welcome.");
  return s.join(" ");
}
const API = { read, summarize, deacc, lexiconWord };
G.Reader = API;
if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

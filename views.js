/* Préndete Mix — views. Dashboard → playlist workspaces (Section 3). Nothing here is a global rating queue. */
"use strict";
/* ---------- routing ---------- */
function parseRoute() {
  const p = location.hash.replace(/^#\/?/, "").split("/");
  if (p[0] === "new") return { v: "new" };
  if (p[0] === "settings") return { v: "settings" };
  if (p[0] === "p" && p[1]) return { v: "pl", id: decodeURIComponent(p[1]), tab: ["playlist", "recs", "rejected", "settings"].includes(p[2]) ? p[2] : "playlist" };
  return { v: "home" };
}
const routeKey = r => r.v + (r.id ? ":" + r.id + ":" + r.tab : "");
function go(hash) { if (location.hash === hash) render(true); else location.hash = hash; }
window.addEventListener("hashchange", () => { S.ui.scroll[routeKey(S.route)] = scrollY; S.route = parseRoute(); render(true); });
function render(nav) {
  const r = S.route, v = $("#view"); const y = nav ? S.ui.scroll[routeKey(r)] || 0 : scrollY;
  v.replaceChildren();
  if (r.v === "new") vNew(v); else if (r.v === "settings") vSettings(v); else if (r.v === "pl") vPlaylist(v, r); else vHome(v);
  scrollTo(0, y); markRows();
}
function refresh(id) { const r = S.route; if (r.v === "home") return render(); if (r.v === "pl" && r.id === id) { if (r.tab === "settings") return updateHead(id); render(); } }
function setTop(title, sub, back) {
  $("#gear").hidden = S.route.v === "settings";
  $("#ttl").textContent = title; const s = $("#sub"); s.replaceChildren(); if (sub) s.append(...[].concat(sub)); $("#back").hidden = !back; $("#back").onclick = () => go(back);
  document.title = title === "Préndete Mix" ? title : title + " · Préndete Mix";
}
const statusLabel = pl => (pl.status === "COMPLETED" ? "Completed" : "In progress");
const statusPill = pl => h("span", { class: "pill" + (pl.status === "COMPLETED" ? " done" : ""), text: statusLabel(pl) });
const headSub = pl => [statusPill(pl), h("span", { text: plural(Core.counts(pl).approved, "song") })];
function updateHead(id) { const pl = S.pls.get(id); if (pl) { setTop(pl.name, headSub(pl), "#/"); const s = $("#stats"); if (s) s.replaceWith(statsEl(pl)); } }
function dirSummary(pl) {
  const d = pl.direction || {}, f = d.form || {}; if (d.text) return d.text;
  const bits = []; const refs = (d.refs || []).map(getTrack).filter(Boolean);
  if (refs.length) bits.push("Sounds like " + refs.slice(0, 3).map(t => t.t).join(", ") + (refs.length > 3 ? ` and ${refs.length - 3} more` : ""));
  if ((d.artists || []).length) bits.push("Artists like " + d.artists.slice(0, 4).map(a => a.name).join(", "));
  if ((f.genres || []).length) bits.push(f.genres.map(g => g.name).join(", ")); if ((f.moods || []).length) bits.push(f.moods.join(", ").toLowerCase());
  return bits.join(". ") || "Built from the songs on it";
}
function mosaic(pl) {
  const job = S.jobs.get(pl.id); let m;
  if (pl.artwork) m = h("div", { class: "mos one", "aria-hidden": "true" }, h("img", { src: pl.artwork, alt: "" }));
  else { const c = pl.order.map(getTrack).filter(t => t && https(t.cov)).slice(0, 4); m = h("div", { class: "mos" + (c.length < 4 ? " one" : ""), "aria-hidden": "true" }); if (!c.length) m.append(placeholder({ id: pl.id, t: pl.name })); else (c.length < 4 ? c.slice(0, 1) : c).forEach(t => { const e = coverEl(t); if (e.removeAttribute) e.removeAttribute("loading"); m.append(e); }); }
  if (job) m.append(h("span", { class: "badge", text: job.kind === "fill" ? "Filling…" : "Finding songs…" }));
  return m;
}

/* ---------- dashboard (NAV-001..006) ---------- */
function vHome(v) {
  const all = S.meta.order.map(id => S.pls.get(id)).filter(Boolean);
  const nIn = all.filter(p => p.status === "IN_PROGRESS").length, nDone = all.length - nIn;
  setTop("Préndete Mix", h("span", { text: `${plural(all.length, "playlist")}, ${nIn} in progress, ${nDone} completed` }), null);
  const m = h("main", { class: "wrap" }); v.append(m);
  m.append(h("div", { class: "btns", style: "margin-top:14px" }, btn("Create a playlist", "red", () => { S.create = null; go("#/new"); }, { ic: "plus" })));
  if (S.meta.migrated && !S.meta.migrated.seen) {
    const r = S.meta.migrated.report;
    m.append(h("div", { class: "note" }, h("b", { text: "Préndete 🔥 moved into the new app. " }), `${plural(r.approved, "song")} on the playlist, ${r.rejected} rejected, ${plural(r.pending, "recommendation")}${r.lists ? `, plus ${plural(r.lists, "other playlist")}` : ""}. It's marked Completed; you can reopen it any time.`,
      r.unsorted ? h("span", { text: ` ${plural(r.unsorted, "song")} from the old app had no clear playlist, so ${r.unsorted === 1 ? "it's" : "they're"} kept aside in Settings.` }) : null, " ",
      h("button", { class: "lnk", type: "button", text: "Got it", onclick: () => { S.meta.migrated.seen = true; saveMeta().catch(() => {}); render(); } })));
  }
  const f = S.ui.homeF || "all";
  m.append(h("div", { class: "chips", role: "group", "aria-label": "Show" }, [["all", "All", all.length], ["IN_PROGRESS", "In progress", nIn], ["COMPLETED", "Completed", nDone]].map(([k, l, n]) =>
    h("button", { class: "chip", type: "button", "aria-pressed": String(f === k), onclick: () => { S.ui.homeF = k; render(); } }, l, h("span", { class: "n", text: n })))));
  const list = all.filter(p => f === "all" || p.status === f);
  if (!list.length) m.append(h("p", { class: "empty", text: all.length ? "No playlists with this status." : "No playlists yet. Create one to start." }));
  const g = h("div", { class: "pls" });
  for (const pl of list) { const c = Core.counts(pl); const ds = dirSummary(pl);
    g.append(h("a", { class: "pl", href: "#/p/" + encodeURIComponent(pl.id) }, mosaic(pl), h("div", { class: "nm", text: pl.name }), statusPill(pl),
      h("div", { class: "ct", text: `${plural(c.approved, "song")}${c.pending ? `, ${c.pending} waiting` : ""}` }), h("div", { class: "ct", text: ds.slice(0, 72) + (ds.length > 72 ? "…" : "") }))); }
  m.append(g);
}

/* ---------- engine picker (per playlist) ---------- */
function aiReady(p) { const pv = Engines.PROVIDERS[p]; return pv && !pv.wip && S.meta.ai[p] && S.meta.ai[p].key; }
function firstAi() { return ["gemini", "openrouter"].find(aiReady) || null; }
function defaultModel(p) { const a = S.meta.ai[p] || {}; return a.model || (a.models && a.models.length ? Engines.PROVIDERS[p].pick(a.models) : null); }
function aiCtx(eng) { const p = eng && eng.provider; return { provider: p, model: (eng && eng.model) || defaultModel(p), key: p && S.meta.ai[p] ? S.meta.ai[p].key : null }; }
function engineLabel(eng) { if (!eng || eng.mode !== "ai") return "Classic"; const p = Engines.PROVIDERS[eng.provider]; return `AI (${p ? p.label.replace(/ \(.*\)/, "") : "?"}${eng.model ? ", " + eng.model : ""})`; }
const CLASSIC_NOTE = "Classic reads your description with built-in rules, then finds songs through Deezer's related artists and editorial playlists, ListenBrainz listening data, ReccoBeats audio features (energy, tempo, mood) and LRCLIB lyrics (language). It learns from what you approve and reject here.";
function enginePicker(eng, onchange) {
  const box = h("div");
  const draw = () => {
    box.replaceChildren();
    box.append(h("div", { class: "seg", role: "group", "aria-label": "Recommendations by" },
      h("button", { type: "button", "aria-pressed": String(eng.mode !== "ai"), onclick: () => { eng.mode = "classic"; onchange(eng); draw(); } }, "Classic"),
      h("button", { type: "button", "aria-pressed": String(eng.mode === "ai"), onclick: () => { eng.mode = "ai"; if (!eng.provider) eng.provider = firstAi() || "gemini"; if (!eng.model) eng.model = defaultModel(eng.provider); onchange(eng); draw(); } }, "AI")));
    if (eng.mode !== "ai") { box.append(h("p", { class: "small", text: CLASSIC_NOTE })); return; }
    const sel = h("select", { class: "selp", "aria-label": "AI service", onchange: e => { eng.provider = e.target.value; eng.model = defaultModel(eng.provider); onchange(eng); draw(); } });
    for (const [k, p] of Object.entries(Engines.PROVIDERS)) { const o = h("option", { value: k, text: p.label + (p.wip ? " (coming next)" : !aiReady(k) ? " (add a key in Settings)" : "") }); if (p.wip) o.disabled = true; if (k === eng.provider) o.selected = true; sel.append(o); }
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "AI service" }), sel));
    if (!aiReady(eng.provider)) { box.append(h("p", { class: "note" }, `${Engines.PROVIDERS[eng.provider].label} needs a free key first. `, h("a", { class: "lnk", href: "#/settings", text: "Add it in Settings" }))); return; }
    const models = S.meta.ai[eng.provider].models || [];
    const ms = h("select", { class: "selp", "aria-label": "Model", onchange: e => { eng.model = e.target.value; onchange(eng); } });
    if (!models.length) ms.append(h("option", { value: eng.model || "", text: eng.model || "Default" }));
    models.forEach(md => { const o = h("option", { value: md.id, text: md.name && md.name !== md.id ? `${md.name} (${md.id})` : md.id }); if (md.id === eng.model) o.selected = true; ms.append(o); });
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "Model" }), ms));
    box.append(h("p", { class: "small", text: "Every song the AI suggests is looked up in Deezer and Apple Music first. Anything that can't be found is left out and listed." }));
  };
  draw(); return box;
}

/* ---------- direction editor (creation + later edits) ---------- */
function emptyDir() { return { text: "", refs: [], artists: [], exclude: { artists: [], songs: [] }, form: { genres: [], keywords: [], moods: [], energy: "", tempo: "", bpm: null, era: null, langs: [], notLangs: [], explicit: "any", versions: false, avoidHits: false, preferHits: false } }; }
async function loadGenres() { if (S.genres && S.genres.length) return S.genres; try { S.genres = await Catalog.Deezer.genres(); } catch { S.genres = []; } return S.genres; }
const LANGS = Object.entries(Catalog.LANG_NAMES);
function chipToggle(label, on, fn, cls = "") { return h("button", { class: "chip " + cls, type: "button", "aria-pressed": String(!!on), onclick: fn }, label); }
function segPick(label, opts, val, fn) { return h("div", { class: "field" }, h("span", { class: "lbl", text: label }), h("div", {}, h("div", { class: "seg", role: "group", "aria-label": label }, opts.map(([k, l]) => h("button", { type: "button", "aria-pressed": String(val === k), onclick: () => fn(k) }, l))))); }
function formEditor(form, o = {}) {
  const box = h("div");
  const draw = () => {
    box.replaceChildren();
    const gl = h("div", { class: "chips wrapc", role: "group", "aria-label": "Genres" });
    if (!S.genres) { gl.append(h("span", { class: "small", text: "Loading genres…" })); loadGenres().then(draw); }
    else { const have = new Set((form.genres || []).map(g => g.name)); S.genres.forEach(g => gl.append(chipToggle(g.name, have.has(g.name), () => { form.genres = have.has(g.name) ? form.genres.filter(x => x.name !== g.name) : [...(form.genres || []), { id: g.id, name: g.name }]; draw(); })));
      (form.genres || []).filter(g => !g.id).forEach(g => gl.append(chipToggle(g.name + " ✕", true, () => { form.genres = form.genres.filter(x => x !== g); draw(); }))); }
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "Genres" }), gl));
    form.keywords = form.keywords || [];
    box.append(namesEditor(form.keywords, "Styles and scenes (optional)", "e.g. lofi, amapiano, corridos tumbados"));
    const ml = h("div", { class: "chips wrapc", role: "group", "aria-label": "Moods" }); const mo = new Set(form.moods || []);
    Object.keys(Engines.MOODS).concat((form.moods || []).filter(m => !Engines.MOODS[m])).forEach(md => ml.append(chipToggle(md, mo.has(md), () => { form.moods = mo.has(md) ? form.moods.filter(x => x !== md) : [...(form.moods || []), md]; draw(); })));
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "Moods" }), ml));
    box.append(segPick("Energy", [["", "Any"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]], form.energy || "", k => { form.energy = k; draw(); }));
    box.append(segPick("Tempo", [["", "Any"], ["slow", "Slow"], ["mid", "Mid"], ["fast", "Fast"]], form.bpm ? "" : form.tempo || "", k => { form.tempo = k; form.bpm = null; draw(); }));
    const b1 = h("input", { type: "number", min: "40", max: "220", inputmode: "numeric", placeholder: "From", "aria-label": "Lowest BPM", value: form.bpm ? form.bpm[0] : "" });
    const b2 = h("input", { type: "number", min: "40", max: "220", inputmode: "numeric", placeholder: "To", "aria-label": "Highest BPM", value: form.bpm ? form.bpm[1] : "" });
    const setB = () => { const a = +b1.value, c = +b2.value; form.bpm = a >= 40 || c >= 40 ? [a >= 40 ? a : 40, c >= 40 ? c : 220] : null; if (form.bpm) form.tempo = ""; };
    b1.onchange = setB; b2.onchange = setB;
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "Exact BPM range (optional, strict)" }), h("div", { class: "inl" }, b1, "to", b2)));
    const y1 = h("input", { type: "number", min: "1900", max: "2100", inputmode: "numeric", placeholder: "From", "aria-label": "From year", value: form.era ? form.era[0] : "" });
    const y2 = h("input", { type: "number", min: "1900", max: "2100", inputmode: "numeric", placeholder: "To", "aria-label": "To year", value: form.era ? form.era[1] : "" });
    const setEra = () => { const a = +y1.value, c = +y2.value; form.era = a > 1900 || c > 1900 ? [a > 1900 ? a : 1900, c > 1900 ? c : 2100] : null; };
    y1.onchange = setEra; y2.onchange = setEra;
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "Release years (optional)" }), h("div", { class: "inl" }, y1, "to", y2)));
    const ll = h("div", { class: "chips wrapc", role: "group", "aria-label": "Languages" }); form.langs = form.langs || []; form.notLangs = form.notLangs || [];
    LANGS.forEach(([k, l]) => { const st = form.langs.includes(k) ? 1 : form.notLangs.includes(k) ? 2 : 0;
      ll.append(chipToggle(st === 2 ? "No " + l : l, st === 1, () => { form.langs = form.langs.filter(x => x !== k); form.notLangs = form.notLangs.filter(x => x !== k); if (st === 0) form.langs.push(k); else if (st === 1) form.notLangs.push(k); draw(); }, st === 2 ? "no" : "")); });
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "Languages (optional)" }), ll, h("span", { class: "small", text: "Tap once to want a language, twice to rule it out. Checked against each song's lyrics; instrumentals always pass." })));
    box.append(segPick("Explicit or clean", [["any", "Either"], ["clean", "Clean"], ["explicit", "Explicit"]], form.explicit || "any", k => { form.explicit = k; draw(); }));
    box.append(segPick("Popularity", [["", "Any"], ["avoid", "Skip big hits"], ["prefer", "Lean popular"]], form.avoidHits ? "avoid" : form.preferHits ? "prefer" : "", k => { form.avoidHits = k === "avoid"; form.preferHits = k === "prefer"; draw(); }));
    const v1 = h("input", { type: "checkbox" }); v1.checked = !!form.versions; v1.onchange = () => (form.versions = v1.checked);
    box.append(h("label", { class: "chk" }, v1, "Remixes, live, sped-up and acoustic versions are OK"));
  };
  draw(); return box;
}
function namesEditor(list, label, placeholder, onchange) {
  const box = h("div", { class: "field" });
  const draw = () => {
    box.replaceChildren(h("span", { class: "lbl", text: label }));
    const chips = h("div", { class: "chips wrapc" }); list.forEach((n, i) => { const c = h("button", { class: "chip", type: "button", "aria-label": "Remove " + n, onclick: () => { list.splice(i, 1); if (onchange) onchange(); draw(); } }, n); const x = h("span", { class: "x" }); x.innerHTML = I("x"); c.append(x); chips.append(c); });
    const inp = h("input", { type: "text", placeholder, "aria-label": label, maxlength: "80" });
    const add = () => { const v = inp.value.trim(); if (v && !list.some(x => Core.norm(x) === Core.norm(v))) { list.push(v); if (onchange) onchange(); } inp.value = ""; draw(); box.querySelector("input").focus(); };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    if (list.length) box.append(chips); box.append(h("div", { class: "inl" }, inp, btn("Add", "ghost sm", add)));
  };
  draw(); return box;
}
/* Read a description with the playlist's engine (Classic reader or AI) and merge it into the editor state. */
async function readInto(st, engine, say) {
  const text = (st.dir.text || "").trim(); if (!text) throw new Core.OpError("EMPTY", "Write a description first.");
  let j;
  if (engine && engine.mode === "ai") { if (!aiReady(engine.provider)) throw new Core.OpError("AI_KEY", "Add an AI key in Settings, or switch to Classic."); say("Reading it with " + Engines.PROVIDERS[engine.provider].label + "…"); j = await Engines.AI.interpret({ ai: aiCtx(engine) }, text); }
  else { say("Reading it…"); j = Reader.read(text); }
  const r = await Engines.applyReading(j, st, { genres: await loadGenres(), say, keep: t => { if (!S.tr.has(t.id)) S.tmp.set(t.id, t); } });
  if (j.name && st.setName) st.setName(String(j.name).slice(0, 100));
  return r;
}
/* st: {dir, must:[ids], mustLocked:[ids]} — mode: "A" | "B" | "edit"; o.engine decides who reads the description */
function dirEditor(st, mode, o = {}) {
  const root = h("div");
  const draw = () => {
    root.replaceChildren(); const d = st.dir;
    const ta = h("textarea", { maxlength: "4000", "aria-label": "Description", placeholder: "Genres, moods, rhythm or BPM, energy, years, languages, artists or songs it should sound like, anything it must include or never include…" }); ta.value = d.text || ""; ta.oninput = () => (d.text = ta.value);
    const stat = h("p", { class: "status", "aria-live": "polite", text: st._msg || "" });
    const readBtn = btn(st._read ? "Read it again" : mode === "B" ? "Read my description" : "Read it", st._read || mode !== "B" ? "ghost" : "red", async () => {
      readBtn.disabled = true; try { const r = await readInto(st, o.engine && o.engine(), t => (stat.textContent = t)); st._read = r; st._msg = ""; } catch (e) { st._msg = e.message || "Couldn't read it. Try again."; } draw(); if (o.onchange) o.onchange(); }, { ic: "spark" });
    const desc = h("div", {}, h("div", { class: "field" }, h("label", { text: mode === "B" ? "Describe the playlist" : "Description (optional)" }), ta), h("div", { class: "btns" }, readBtn), stat);
    if (st._read) desc.append(h("div", { class: "read" }, h("h3", { text: "How it was read" }), st._read.summary ? h("p", { text: st._read.summary }) : null,
      st._read.missing.length ? h("p", { class: "small", text: "Couldn't find these in the catalog, so they're left out: " + st._read.missing.join("; ") }) : null,
      (st._read.unchecked || []).length ? h("p", { class: "small", text: "Couldn't reach the catalog to check these, so they aren't added yet: " + st._read.unchecked.join("; ") + ". Check your connection and tap Read it again." }) : null,
      h("p", { class: "small", text: "Everything below was filled in from it. Change anything that's off." })));
    if (mode === "A") root.append(h("details", { class: "more", open: d.text ? true : null }, h("summary", { text: "Add a description (optional)" }), desc)); else root.append(desc);
    if (mode === "B" && !st._read && !st._manual) { root.append(h("p", { class: "small" }, "Prefer picking things yourself? ", h("button", { class: "lnk", type: "button", text: "Use the form instead", onclick: () => { st._manual = true; draw(); } }))); return; }
    const picks = h("div"), res = h("div");
    const drop = id => { d.refs = d.refs.filter(x => x !== id); st.must = st.must.filter(x => x !== id); d.exclude.songs = d.exclude.songs.filter(x => x !== id); };
    const drawPicks = () => {
      picks.replaceChildren();
      const sec = (title, ids, acts, empty) => { if (!ids.length && !empty) return; picks.append(h("h3", { class: "sub2", text: `${title} (${ids.length})` })); if (!ids.length) picks.append(h("p", { class: "small", text: empty }));
        const box = h("div"); rowsInto(box, ids.map(getTrack).filter(Boolean), "pick:" + title, t => ({ below: acts(t) })); picks.append(box); };
      sec("Sounds like", d.refs, t => [btn("Must include", "ghost sm", () => { drop(t.id); st.must.push(t.id); drawPicks(); }), ibtn("x", "Remove " + t.t, () => { drop(t.id); drawPicks(); })], mode === "A" ? "Songs that show the sound you want. They only go on the playlist if you approve them later." : null);
      sec("Must include", st.must, t => [btn("Just a reference", "ghost sm", () => { drop(t.id); d.refs.push(t.id); drawPicks(); }), ibtn("x", "Remove " + t.t, () => { drop(t.id); drawPicks(); })], mode === "A" ? "Songs that go straight onto the playlist." : null);
      if ((st.mustLocked || []).length) sec("Already must-include", st.mustLocked, t => [btn("Unmark", "ghost sm", () => { st.mustLocked = st.mustLocked.filter(x => x !== t.id); (st.unmust = st.unmust || []).push(t.id); drawPicks(); })], null);
      if (d.artists.length) { picks.append(h("h3", { class: "sub2", text: `Artists it should sound like (${d.artists.length})` })); picks.append(h("div", { class: "chips wrapc" }, d.artists.map(a => { const c = h("button", { class: "chip", type: "button", "aria-label": "Remove " + a.name, onclick: () => { d.artists = d.artists.filter(x => x !== a); drawPicks(); } }, a.name); const x = h("span", { class: "x" }); x.innerHTML = I("x"); c.append(x); return c; }))); }
      sec("Never include", d.exclude.songs, t => [ibtn("x", "Remove " + t.t, () => { drop(t.id); drawPicks(); })], null);
      if (o.onchange) o.onchange();
    };
    let exBox = namesEditor(d.exclude.artists, "Never suggest these artists here", "Artist name");
    const drawRes = () => {
      res.replaceChildren(); const r = st._res; if (!r) return;
      if (r.msg) res.append(h("p", { class: "small", text: r.msg }));
      (r.artists || []).forEach(a => { const on = d.artists.some(x => x.id === a.id); const ex = d.exclude.artists.some(x => Core.norm(x) === Core.norm(a.name));
        res.append(h("div", { class: "res" }, h("div", { class: "ava" }, a.pic ? h("img", { src: a.pic, alt: "", referrerpolicy: "no-referrer" }) : placeholder({ id: "a" + a.id, t: a.name })),
          h("div", {}, h("div", { class: "t", text: a.name }), h("div", { class: "m", text: "Artist" }), h("div", { class: "pick" },
            btn(on ? "✓ Sounds like" : "Sounds like", on ? "" : "ghost", () => { if (on) d.artists = d.artists.filter(x => x.id !== a.id); else d.artists.push({ id: a.id, name: a.name }); drawPicks(); drawRes(); }),
            btn(ex ? "✓ Never suggest" : "Never suggest", ex ? "" : "ghost", () => { if (ex) d.exclude.artists = d.exclude.artists.filter(x => Core.norm(x) !== Core.norm(a.name)); else d.exclude.artists.push(a.name); const nb = namesEditor(d.exclude.artists, "Never suggest these artists here", "Artist name"); exBox.replaceWith(nb); exBox = nb; drawRes(); }))))); });
      Q["search"] = (r.tracks || []).map(t => t.id);
      (r.tracks || []).forEach(t => { const cur = d.refs.includes(t.id) ? "ref" : st.must.includes(t.id) || (st.mustLocked || []).includes(t.id) ? "must" : d.exclude.songs.includes(t.id) ? "ex" : "";
        const set = k => async () => { drop(t.id); if (k !== cur) { if (k !== "ex") { const full = await Catalog.complete(t); S.tmp.set(full.id, full); } (k === "ref" ? d.refs : k === "must" ? st.must : d.exclude.songs).push(t.id); } drawPicks(); drawRes(); };
        const cv = h("button", { class: "cov", type: "button", "aria-label": "Play sample of " + t.t, onclick: () => togglePlay(t, "search") }, coverEl(t));
        res.append(h("div", { class: "res", "data-k": t.id }, cv, h("div", {}, h("div", { class: "t", text: t.t }), h("div", { class: "m", text: artistsOf(t.a) + (t.exp ? ` · ${t.exp === "explicit" ? "Explicit" : "Clean"}` : "") }),
          h("div", { class: "pick" }, btn(cur === "ref" ? "✓ Sounds like" : "Sounds like", cur === "ref" ? "" : "ghost", set("ref")), btn(cur === "must" ? "✓ Must include" : "Must include", cur === "must" ? "" : "ghost", set("must")), btn(cur === "ex" ? "✓ Never include" : "Never include", cur === "ex" ? "" : "ghost", set("ex")))))); });
    };
    const inp = h("input", { type: "search", enterkeyhint: "search", autocomplete: "off", placeholder: "Search a song or an artist", "aria-label": "Search songs and artists", value: st._q || "" });
    const srch = async () => { const q = inp.value.trim(); st._q = q; if (!q) return; st._res = { msg: "Searching…" }; drawRes();
      let tracks = [], artists = [], msg = ""; try { [tracks, artists] = await Promise.all([Catalog.Deezer.search(q, 15), Catalog.Deezer.artists(q, 4)]); } catch { msg = "Deezer didn't answer, so these are from Apple Music."; }
      if (!tracks.length) { try { tracks = await Catalog.ITunes.search(q, 15); } catch {} }
      tracks.forEach(t => { if (!S.tr.has(t.id)) S.tmp.set(t.id, t); });
      st._res = { tracks, artists: artists.slice(0, 3), msg: !tracks.length && !artists.length ? "Nothing found. Try other words." : msg }; drawRes(); };
    root.append(h("form", { class: "field", role: "search", onsubmit: e => { e.preventDefault(); srch(); } }, h("label", { text: mode === "A" ? "Find artists and songs" : "Add songs or artists" }), h("div", { class: "inl" }, inp, btn("Search", "", null, { type: "submit", ic: "search" }))), res, picks);
    const det = h("details", { class: "more" }, h("summary", { text: mode === "A" ? "Genres, mood, rhythm, years and languages (optional)" : "Genres, mood, rhythm, years and languages" }), formEditor(d.form), exBox);
    if (mode !== "A" || st._read) det.open = true; root.append(det);
    drawPicks(); drawRes();
  };
  draw(); return root;
}

/* ---------- create (Section 5) ---------- */
function vNew(v) {
  const D = S.create || (S.create = { step: "method", method: null, name: "", capacity: 50, engine: { mode: firstAi() ? "ai" : "classic", provider: firstAi(), model: firstAi() ? defaultModel(firstAi()) : null }, st: { dir: emptyDir(), must: [] }, busy: false, msg: "" });
  D.st.setName = n => { if (!D.name) D.name = n; };
  setTop("New playlist", h("span", { text: D.step === "method" ? "Step 1 of 2" : "Step 2 of 2" }), "#/");
  const m = h("main", { class: "wrap" }); v.append(m);
  if (D.step === "method") {
    m.append(h("h2", { class: "sec", text: "How do you want to start?" }));
    m.append(h("div", { class: "opts" },
      h("button", { class: "optc", type: "button", onclick: () => { D.method = "A"; D.step = "build"; render(); } }, h("b", { text: "From artists and songs" }), h("span", { text: "Search and pick artists or songs that show the sound. Mark any song as must-include." })),
      h("button", { class: "optc", type: "button", onclick: () => { D.method = "B"; D.step = "build"; render(); } }, h("b", { text: "Describe it" }), h("span", { text: "Write what you want in your own words. Classic or AI reads it, and you check what it understood before creating." }))));
    return;
  }
  m.append(h("div", { class: "btns" }, h("button", { class: "lnk", type: "button", text: "Change how to start", onclick: () => { D.step = "method"; render(); } })));
  const name = h("input", { type: "text", maxlength: "100", placeholder: "Playlist name", "aria-label": "Playlist name", value: D.name, oninput: e => (D.name = e.target.value) });
  const cap = h("select", { "aria-label": "Capacity", onchange: e => (D.capacity = +e.target.value) }); Core.capacityOptions().forEach(c => { const o = h("option", { value: c, text: `${c} songs` }); if (c === D.capacity) o.selected = true; cap.append(o); });
  m.append(h("div", { class: "card" }, h("div", { class: "field", style: "margin-top:0" }, h("label", { text: "Name" }), name),
    h("div", { class: "field" }, h("label", { text: "Capacity" }), cap, h("span", { class: "small", text: "The most songs it can hold. It's a ceiling, not a goal: you decide when it's done." })),
    h("div", { class: "field", style: "margin-bottom:0" }, h("span", { class: "lbl", text: "Recommendations by" }), enginePicker(D.engine, () => render()))));
  m.append(h("h2", { class: "sec", text: D.method === "A" ? "Artists and songs" : "Describe it" }));
  m.append(dirEditor(D.st, D.method, { engine: () => D.engine, onchange: () => { const n = $('input[aria-label="Playlist name"]'); if (n && D.name && !n.value) n.value = D.name; } }));
  m.append(h("p", { class: "status", "aria-live": "polite", text: D.msg || "" }));
  m.append(h("div", { class: "btns" }, btn(D.busy ? "Creating…" : "Create and find songs", "red", () => createFromDraft(D), { ic: "spark", disabled: D.busy ? true : null })));
}
function hasSeeds(st) { const d = st.dir, f = d.form || {}; return d.refs.length || st.must.length || d.artists.length || (f.genres || []).some(g => g.id) || (f.moods || []).length || (f.keywords || []).length; }
async function createFromDraft(D) {
  const st = D.st, d = st.dir; const name = D.name.trim(); if (!name) { D.msg = "Give the playlist a name."; return render(); }
  if (D.method === "A" && !d.refs.length && !st.must.length && !d.artists.length) { D.msg = "Pick at least one artist or song."; return render(); }
  if (D.method === "B" && !st._read && !hasSeeds(st)) { D.msg = d.text.trim() ? "Tap “Read my description” first so you can check what it understood." : "Write a description, or use the form instead."; return render(); }
  if (D.engine.mode !== "ai" && !hasSeeds(st)) { D.msg = "Add a genre, mood, style, artist or song so Classic has a starting point."; return render(); }
  if (D.engine.mode === "ai" && !aiReady(D.engine.provider)) { D.msg = "Add an AI key in Settings, or switch to Classic."; return render(); }
  if (st.must.length > D.capacity) { D.msg = `You picked ${st.must.length} must-include songs but the capacity is ${D.capacity}. Raise the capacity or unmark some.`; return render(); }
  D.busy = true; D.msg = "Creating…"; render();
  try {
    const ids = [...d.refs, ...st.must, ...d.exclude.songs]; const tracks = [];
    for (const id of ids) { let t = getTrack(id); if (t && !d.exclude.songs.includes(id)) t = await Catalog.complete(t); if (t) tracks.push(t); }
    tracks.forEach(t => S.tmp.set(t.id, t));
    const eng = D.engine.mode === "ai" ? { mode: "ai", provider: D.engine.provider, model: D.engine.model || defaultModel(D.engine.provider) } : { mode: "classic" };
    const pl = Core.createPlaylist({ name, method: D.method === "A" ? "ARTISTS_AND_SONGS" : "NATURAL_LANGUAGE", direction: clone(d), capacity: D.capacity, engine: eng });
    Core.addMandatory(pl, st.must, getTrack); Core.validate(pl);
    const order = [pl.id, ...S.meta.order]; const metaNext = Object.assign({}, S.meta, { order });
    await DB.tx([{ store: "kv", key: "pl:" + pl.id, value: pl }, { store: "kv", key: "meta", value: metaNext }, ...tracks.map(t => ({ store: "tracks", value: slimTrack(t) }))]);
    tracks.forEach(t => { S.tr.set(t.id, t); S.tmp.delete(t.id); }); S.pls.set(pl.id, pl); S.meta.order = order; S.create = null;
    go("#/p/" + encodeURIComponent(pl.id) + "/recs"); startJob(pl.id, "initial");
  } catch (e) { D.busy = false; D.msg = e.message || "Couldn't create it. Nothing was saved."; render(); }
}

/* ---------- playlist workspace (Section 9) ---------- */
function statsEl(pl) {
  const c = Core.counts(pl);
  return h("div", { class: "stats", id: "stats" }, [["On the playlist", c.approved], ["Recom­mendations", c.pending], ["Rejected", c.rejected], ["Capacity", pl.capacity], ["Open spots", Math.max(0, c.available)]].map(([l, n]) => h("div", { class: "stat" }, h("b", { text: n }), h("span", { text: l }))));
}
function vPlaylist(v, r) {
  const pl = S.pls.get(r.id);
  if (!pl) { setTop("Not found", null, "#/"); v.append(h("main", { class: "wrap" }, h("p", { class: "empty", text: "This playlist doesn't exist anymore." }), btn("Back to playlists", "", () => go("#/")))); return; }
  setTop(pl.name, headSub(pl), "#/");
  const m = h("main", { class: "wrap" }); v.append(m); const c = Core.counts(pl), job = S.jobs.get(pl.id), open = Math.max(0, c.available);
  m.append(h("div", { class: "card" }, statsEl(pl), h("p", { class: "lede dirsum", text: dirSummary(pl) }), h("p", { class: "small", style: "margin:0" }, "Recommendations by " + engineLabel(pl.engine) + ". ", h("a", { class: "lnk", href: `#/p/${encodeURIComponent(pl.id)}/settings`, text: "Edit direction" }))));
  if (job) { const s = h("div", { class: "job", role: "status" }, h("span", { class: "spin", "aria-hidden": "true" }), h("p", { id: "jobmsg", text: job.msg })); s.append(btn("Stop", "sm", () => { job.stop = true; const e = $("#jobmsg"); if (e) e.textContent = "Stopping… songs already added stay."; })); m.append(s); }
  const rep = S.reports.get(pl.id); if (rep) m.append(h("div", { class: "note" + (rep.err ? " err" : "") }, rep.text, " ", rep.action || null, " ", h("button", { class: "lnk", type: "button", text: "Dismiss", onclick: () => { S.reports.delete(pl.id); render(); } })));
  m.append(h("div", { class: "btns" },
    btn("Recalibrate", "red", () => startJob(pl.id, "recal"), { ic: "spark", disabled: job ? true : null }),
    btn(open ? `Fill ${plural(open, "open spot")}` : "Full, no open spots", "yel", () => fillFlow(pl.id), { ic: "shuffle", disabled: job || !open ? true : null })),
    h("div", { class: "btns", style: "margin-top:2px" },
      pl.status === "COMPLETED" ? btn("Reopen curation", "ghost sm", () => act(() => mutate(pl.id, p => Core.setStatus(p, "IN_PROGRESS")), "Back to In progress. Nothing else changed."), { ic: "undo" })
        : btn("Mark as completed", "ghost sm", () => act(() => mutate(pl.id, p => Core.setStatus(p, "COMPLETED")), "Marked as completed. Everything stays editable."), { ic: "done" }),
      btn("Export CSV", "ghost sm", () => exportCsv(pl), { ic: "dl" })));
  const base = `#/p/${encodeURIComponent(pl.id)}/`;
  const tab = (k, label, n) => { const a = h("a", { class: "tab", role: "tab", href: base + k, "aria-selected": String(r.tab === k), "aria-label": n != null ? `${label}, ${n}` : label }); if (k === "settings") a.innerHTML = I("tune"); else a.append(h("b", { text: n }), h("span", { text: label })); return a; };
  m.append(h("div", { class: "tabsbar" }, h("div", { class: "tabs", role: "tablist", "aria-label": "Playlist sections" }, tab("playlist", "Playlist", c.approved), tab("recs", "Recommendations", c.pending), tab("rejected", "Rejected", c.rejected), tab("settings", "Playlist settings", null))));
  const body = h("div"); m.append(body);
  ({ playlist: tabPlaylist, recs: tabRecs, rejected: tabRejected, settings: tabSettings })[r.tab](body, pl);
}
const uiOf = id => S.ui.view[id] || (S.ui.view[id] = { plMode: null, plSort: "order", recView: "cards", recSort: "new", recSel: false, rjSel: false });
const selOf = (id, k) => { const key = id + ":" + k; if (!S.ui.sel.has(key)) S.ui.sel.set(key, new Set()); return S.ui.sel.get(key); };
function batchBar(set, actions) { if (!set.size) return null; return h("div", { class: "batch", role: "region", "aria-label": "Selected songs" }, h("b", { text: `${set.size} selected` }), ...actions, btn("Clear", "ghost sm", () => { set.clear(); render(); })); }
function selHandler(box, set, actions) { return () => { const b = $(".batch"); const nb = batchBar(set, actions()); if (b) b.replaceWith(nb || h("span")); else if (nb) box.append(nb); }; }
function tabPlaylist(box, pl) {
  const u = uiOf(pl.id), sel = selOf(pl.id, "pl");
  const sort = h("select", { "aria-label": "Sort for viewing", onchange: e => { u.plSort = e.target.value; if (u.plSort !== "order" && u.plMode === "arrange") u.plMode = null; render(); } });
  [["order", "Your order"], ["title", "Title A–Z"], ["artist", "Artist A–Z"], ["year", "Newest first"]].forEach(([k, l]) => { const o = h("option", { value: k, text: l }); if (k === u.plSort) o.selected = true; sort.append(o); });
  box.append(h("div", { class: "tool" }, sort, h("div", { class: "seg", role: "group", "aria-label": "Mode" },
    h("button", { type: "button", "aria-pressed": String(u.plMode === "arrange"), disabled: u.plSort !== "order" ? true : null, onclick: () => { u.plMode = u.plMode === "arrange" ? null : "arrange"; render(); } }, "Arrange"),
    h("button", { type: "button", "aria-pressed": String(u.plMode === "select"), onclick: () => { u.plMode = u.plMode === "select" ? null : "select"; sel.clear(); render(); } }, "Select"))));
  if (u.plSort !== "order") box.append(h("p", { class: "small", text: "Sorted for viewing only. Your saved order hasn't changed." }));
  if (pl.legacyOver) box.append(h("div", { class: "note err", text: `This playlist has ${pl.order.length} songs but the app's limit is ${Core.CONFIG.maxConfirmed}. Nothing was deleted. Remove songs until it fits; new approvals wait until then.` }));
  let list = pl.order.map(getTrack).filter(Boolean);
  if (u.plSort === "title") list = list.slice().sort((a, b) => a.t.localeCompare(b.t)); else if (u.plSort === "artist") list = list.slice().sort((a, b) => artistsOf(a.a).localeCompare(artistsOf(b.a))); else if (u.plSort === "year") list = list.slice().sort((a, b) => (b.y || 0) - (a.y || 0));
  if (!list.length) { box.append(h("p", { class: "empty", text: "No songs on the playlist yet. Approve recommendations or use Random fill." })); return; }
  const rows = h("div"); box.append(rows); const acts = () => plBatch(pl, sel); const onSel = selHandler(box, sel, acts);
  rowsInto(rows, list, "pl:" + pl.id, t => {
    const r = pl.rels[t.id]; const tags = [];
    if (r.mandatory) tags.push({ t: "Must include", c: "r" });
    if (r.origin === Core.ORIGIN.FILL) tags.push({ t: "Auto-filled", c: "y" }, h("button", { class: "lnk", type: "button", text: "Keep", "aria-label": "Keep " + t.t + " as your own pick", onclick: () => act(() => mutate(pl.id, p => Core.confirmKeep(p, t.id)), "Marked as your pick.") }));
    let a;
    if (u.plMode === "arrange") { const pos = pl.order.indexOf(t.id);
      a = [ibtn("aup", "Move up", () => act(() => mutate(pl.id, p => Core.reorder(p, t.id, pos - 1))), "", { disabled: pos === 0 ? true : null }), ibtn("adn", "Move down", () => act(() => mutate(pl.id, p => Core.reorder(p, t.id, pos + 1))), "", { disabled: pos === pl.order.length - 1 ? true : null }),
        h("button", { class: "btn ghost sm", type: "button", "aria-label": `Position ${pos + 1}. Move to another position`, onclick: () => moveTo(pl.id, t) }, String(pos + 1))]; }
    else if (u.plMode === "select") a = [];
    else a = [ibtn("x", "Remove " + t.t + " from the playlist", () => removeFlow(pl.id, [t.id]), "rj")];
    return { tags, acts: a, ctx: pl.id, why: r.origin === Core.ORIGIN.FILL ? r.why : null, sel: u.plMode === "select" ? { checked: sel.has(t.id), onchange: on => { if (on) sel.add(t.id); else sel.delete(t.id); onSel(); } } : null };
  });
  if (u.plMode === "select") { const b = batchBar(sel, acts()); if (b) box.append(b); }
}
const plBatch = (pl, sel) => [btn(`Remove ${sel.size}`, "danger sm", () => removeFlow(pl.id, [...sel], () => sel.clear()))];
function moveTo(id, t) {
  const pl = S.pls.get(id); const pos = pl.order.indexOf(t.id);
  sheet({ title: "Move to position", build: close => { const n = h("input", { type: "number", min: "1", max: String(pl.order.length), value: String(pos + 1), "aria-label": "New position", autofocus: true, inputmode: "numeric" });
    return [h("p", { class: "lede", text: `${t.t} is at ${pos + 1} of ${pl.order.length}.` }), h("div", { class: "field" }, n), h("div", { class: "foot" }, btn("Cancel", "ghost", () => close()), btn("Move", "red", () => { const to = Math.max(1, Math.min(pl.order.length, Math.round(+n.value || 1))) - 1; close(); act(() => mutate(id, p => Core.reorder(p, t.id, to))); }))]; } });
}
function pendingSorted(pl, how) {
  const list = Core.idsIn(pl, "PENDING").map(getTrack).filter(Boolean);
  if (how === "artist") return list.sort((a, b) => artistsOf(a.a).localeCompare(artistsOf(b.a)));
  const bt = new Map((pl.batches || []).map(b => [b.id, b.at]));
  const grp = t => { const r = pl.rels[t.id]; return Math.max(r.restoredAt || 0, (r.batch && bt.get(r.batch)) || r.recAt || 0); };
  const at = t => pl.rels[t.id].recAt || 0;
  return list.sort((a, b) => (how === "old" ? grp(a) - grp(b) || at(a) - at(b) : grp(b) - grp(a) || at(a) - at(b)));
}
function tagsFor(t, r) {
  const out = h("div", { class: "tags" }); if (t.y) out.append(h("span", { class: "tag", text: String(t.y) })); const ln = langName(t); if (ln) out.append(h("span", { class: "tag", text: ln }));
  if (t.exp) out.append(h("span", { class: "tag", text: t.exp === "explicit" ? "Explicit" : "Clean" })); if (r && r.restoredAt) out.append(h("span", { class: "tag", text: "Restored" }));
  out.append(h("a", { class: "lnk", href: spLink(t), target: "_blank", rel: "noopener noreferrer", text: "Spotify ↗" })); return out;
}
function tabRecs(box, pl) {
  const u = uiOf(pl.id), sel = selOf(pl.id, "rec"), c = Core.counts(pl), full = c.available <= 0 || pl.legacyOver;
  const sort = h("select", { "aria-label": "Order", onchange: e => { u.recSort = e.target.value; render(); } }); [["new", "Newest first"], ["old", "Oldest first"], ["artist", "Artist A–Z"]].forEach(([k, l]) => { const o = h("option", { value: k, text: l }); if (k === u.recSort) o.selected = true; sort.append(o); });
  const vs = h("div", { class: "seg", role: "group", "aria-label": "View" }, h("button", { type: "button", "aria-pressed": String(u.recView === "cards"), onclick: () => { u.recView = "cards"; render(); } }), h("button", { type: "button", "aria-pressed": String(u.recView === "list"), onclick: () => { u.recView = "list"; render(); } }));
  vs.children[0].innerHTML = I("cards") + "Cards"; vs.children[1].innerHTML = I("list") + "List";
  const tool = h("div", { class: "tool" }, vs, sort); if (u.recView === "list") tool.append(h("div", { class: "seg" }, h("button", { type: "button", "aria-pressed": String(u.recSel), onclick: () => { u.recSel = !u.recSel; sel.clear(); render(); } }, "Select")));
  box.append(tool);
  if (full) box.append(h("p", { class: "note", text: pl.legacyOver ? "Over the app's limit: remove songs before approving more." : `The playlist is full (${c.approved} of ${pl.capacity}). To approve more, raise the capacity in its settings or remove a song. Rejecting and Recalibrate still work.` }));
  const list = pendingSorted(pl, u.recSort);
  if (!list.length) { box.append(h("p", { class: "empty", text: S.jobs.has(pl.id) ? "Looking for songs. They show up here as they're found." : "Nothing waiting. Tap Recalibrate to find more." })); return; }
  Q["rec:" + pl.id] = list.map(t => t.id);
  if (u.recView === "cards") {
    const i = Math.max(0, list.findIndex(t => t.id === S.ui.card[pl.id])); const t = list[i]; S.ui.card[pl.id] = t.id; const r = pl.rels[t.id];
    const nextId = () => (list[i + 1] || list[i - 1] || {}).id;
    const big = h("button", { class: "big", type: "button", "aria-label": "Play sample of " + t.t, onclick: () => togglePlay(t, "rec:" + pl.id, pl.id) }, coverEl(t), h("span", { class: "ov" })); big.querySelector(".ov").innerHTML = I("play");
    const card = h("div", { class: "rcard", "data-k": t.id });
    const leave = (dir, fn) => { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return fn(); card.classList.add(dir); setTimeout(fn, 170); };
    card.append(h("div", { class: "rnav" }, ibtn("prev", "Previous recommendation", () => { S.ui.card[pl.id] = (list[i - 1] || t).id; render(); }, "", { disabled: i === 0 ? true : null }), h("span", { text: `${i + 1} of ${list.length}` }), ibtn("next", "Next recommendation", () => { S.ui.card[pl.id] = (list[i + 1] || t).id; render(); }, "", { disabled: i === list.length - 1 ? true : null })),
      big, h("div", { class: "t", text: t.t }), h("div", { class: "m", text: artistsOf(t.a) + (t.al ? ` · ${t.al}` : "") }), r.why ? h("div", { class: "why", text: r.why }) : null, tagsFor(t, r),
      h("div", { class: "decide" }, btn("Reject", "ghost", () => { const n = nextId(); rejectFlow(pl.id, [t.id], () => { S.ui.card[pl.id] = n; }, f => leave("out-l", f)); }, { ic: "x" }),
        btn("Skip", "ghost", () => { S.ui.card[pl.id] = (list[i + 1] || list[0]).id; render(); }),
        btn("Approve", "ok", () => { const n = nextId(); leave("out-r", () => approveFlow(pl.id, [t.id], Core.ORIGIN.MANUAL, () => { S.ui.card[pl.id] = n; })); }, { ic: "check", disabled: full ? true : null })));
    box.append(card); return;
  }
  const rows = h("div"); box.append(rows); const acts = () => recBatch(pl, sel, full); const onSel = selHandler(box, sel, acts);
  rowsInto(rows, list, "rec:" + pl.id, t => { const r = pl.rels[t.id];
    return { why: r.why, ctx: pl.id, tags: r.restoredAt ? [{ t: "Restored" }] : [], acts: u.recSel ? [] : [ibtn("x", "Reject " + t.t, () => rejectFlow(pl.id, [t.id]), "rj"), ibtn("check", "Approve " + t.t, () => approveFlow(pl.id, [t.id]), "ap", { disabled: full ? true : null })],
      sel: u.recSel ? { checked: sel.has(t.id), onchange: on => { if (on) sel.add(t.id); else sel.delete(t.id); onSel(); } } : null }; });
  if (u.recSel) { const b = batchBar(sel, acts()); if (b) box.append(b); }
}
const recBatch = (pl, sel, full) => [btn(`Reject ${sel.size}`, "danger sm", () => rejectFlow(pl.id, [...sel], () => sel.clear())), btn(`Approve ${sel.size}`, "ok sm", () => approveFlow(pl.id, [...sel], Core.ORIGIN.BATCH, () => sel.clear()), { disabled: full ? true : null })];
function tabRejected(box, pl) {
  const u = uiOf(pl.id), sel = selOf(pl.id, "rj");
  const list = Core.idsIn(pl, "REJECTED").sort((a, b) => (pl.rels[b].changedAt || 0) - (pl.rels[a].changedAt || 0)).map(getTrack).filter(Boolean);
  box.append(h("p", { class: "lede", style: "margin-top:14px", text: "Rejected and removed songs stay out of this playlist's recommendations until you restore them. Other playlists aren't affected." }));
  if (!list.length) { box.append(h("p", { class: "empty", text: "Nothing rejected here." })); return; }
  box.append(h("div", { class: "tool" }, h("div", { class: "seg" }, h("button", { type: "button", "aria-pressed": String(u.rjSel), onclick: () => { u.rjSel = !u.rjSel; sel.clear(); render(); } }, "Select"))));
  const c = Core.counts(pl), full = c.available <= 0 || pl.legacyOver; const rows = h("div"); box.append(rows); const acts = () => rjBatch(pl, sel); const onSel = selHandler(box, sel, acts);
  rowsInto(rows, list, "rj:" + pl.id, t => { const r = pl.rels[t.id]; const tags = []; if (r.from === "APPROVED") tags.push({ t: "Removed from playlist" }); if (r.migrated) tags.push({ t: "Earlier review" });
    return { fb: [r.reason, r.text].filter(Boolean).join(": ") || null, tags, ctx: pl.id,
      acts: u.rjSel ? [] : [ibtn("undo", "Restore " + t.t + " to recommendations", () => act(() => mutate(pl.id, p => Core.restore(p, t.id, "PENDING")), "Back in recommendations.")), ibtn("plus", "Restore " + t.t + " to the playlist", () => act(() => mutate(pl.id, p => Core.restore(p, t.id, "APPROVED")), "Back on the playlist."), "ap", { disabled: full ? true : null })],
      sel: u.rjSel ? { checked: sel.has(t.id), onchange: on => { if (on) sel.add(t.id); else sel.delete(t.id); onSel(); } } : null }; });
  if (u.rjSel) { const b = batchBar(sel, acts()); if (b) box.append(b); }
}
const rjBatch = (pl, sel) => [btn(`Restore ${sel.size} to recommendations`, "sm", () => act(() => mutate(pl.id, p => [...sel].forEach(id => Core.restore(p, id, "PENDING"))), `Restored ${sel.size}.`).then(() => { sel.clear(); render(); }))];

/* ---------- decisions ---------- */
function approveFlow(id, ids, origin = Core.ORIGIN.MANUAL, after) {
  return act(() => mutate(id, p => Core.approve(p, ids, origin)), ids.length > 1 ? r => `Approved ${r.length}.` : null).then(r => { if (r !== undefined) { if (after) after(); if (!$("#npw").hidden) renderNp(); } render(); });
}
/* Undo puts rejected songs back exactly where they were (restore is an allowed transition, Section 8.2) */
function undoReject(id, snapshot) {
  act(() => mutate(id, p => { for (const [tid, from, pos] of snapshot) { if (!p.rels[tid] || p.rels[tid].state !== "REJECTED") continue; Core.restore(p, tid, from === "APPROVED" ? "APPROVED" : "PENDING"); if (from === "APPROVED" && pos >= 0) Core.reorder(p, tid, pos); } }), "Undone.").then(() => render());
}
async function rejectFlow(id, ids, after, anim) {
  const t = getTrack(ids[0]);
  const fb = await feedbackSheet({ title: ids.length > 1 ? `Reject ${ids.length} songs?` : `Reject “${t ? t.t : "this song"}”?`, count: ids.length, verb: "Reject" }); if (!fb) return;
  const pl = S.pls.get(id); const snap = ids.map(x => [x, pl.rels[x] && pl.rels[x].state, pl.order.indexOf(x)]);
  const run = async () => { const r = await act(() => mutate(id, p => Core.reject(p, ids, fb))); if (r !== undefined) { if (after) after(); render(); toast(ids.length > 1 ? `Rejected ${ids.length}.` : "Rejected. It won't be suggested here again.", 6500, { label: "Undo", fn: () => undoReject(id, snap) }); } };
  if (anim) anim(run); else run();
}
async function removeFlow(id, ids, after) {
  const t = getTrack(ids[0]);
  const fb = await feedbackSheet({ title: ids.length > 1 ? `Remove ${ids.length} songs?` : `Remove “${t ? t.t : "this song"}”?`, count: ids.length, verb: "Remove", lede: "Removed songs move to Rejected and won't be suggested here again unless you restore them. A reason is optional." }); if (!fb) return;
  const pl = S.pls.get(id); const snap = ids.map(x => [x, "APPROVED", pl.order.indexOf(x)]).sort((a, b) => a[2] - b[2]);
  const r = await act(() => mutate(id, p => Core.reject(p, ids, fb)));
  if (r !== undefined) { if (after) after(); render(); toast(ids.length > 1 ? `Removed ${ids.length}.` : "Removed. It's in Rejected if you change your mind.", 6500, { label: "Undo", fn: () => undoReject(id, snap) }); }
}
async function fillFlow(id) {
  const pl = S.pls.get(id); const open = Core.counts(pl).available; if (open <= 0) return;
  const ok = await confirmSheet({ title: `Random fill: ${plural(open, "open spot")}?`, text: "Picks songs that fit this playlist and adds them straight to it, marked Auto-filled. It uses waiting recommendations first and finds new ones if needed. You can remove any of them.", ok: `Fill ${plural(open, "spot")}`, cls: "yel" });
  if (ok) startJob(id, "fill");
}
function exportCsv(pl) { const list = pl.order.map(getTrack).filter(Boolean); if (!list.length) return toast("The playlist is empty."); download((pl.name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "playlist") + ".csv", toCsv(list), "text/csv;charset=utf-8"); toast("CSV saved. Import it with TuneMyMusic or Soundiiz."); }

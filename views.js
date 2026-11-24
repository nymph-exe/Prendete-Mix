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
  $("#ttl").textContent = title; $("#sub").textContent = sub || ""; $("#back").hidden = !back; $("#back").onclick = () => go(back);
  document.title = title === "Préndete Mix" ? title : title + " · Préndete Mix";
}
const statusLabel = pl => (pl.status === "COMPLETED" ? "Completed" : "In progress");
const headSub = pl => `${statusLabel(pl)} · ${plural(Core.counts(pl).approved, "song")}`;
function updateHead(id) { const pl = S.pls.get(id); if (pl) { $("#sub").textContent = headSub(pl); const s = $("#stats"); if (s) s.replaceWith(statsEl(pl)); } }
function dirSummary(pl) {
  const d = pl.direction || {}, f = d.form || {}; if (d.text) return d.text;
  const bits = []; const refs = (d.refs || []).map(getTrack).filter(Boolean);
  if (refs.length) bits.push("Sounds like " + refs.slice(0, 3).map(t => t.t).join(", ") + (refs.length > 3 ? ` +${refs.length - 3}` : ""));
  if ((d.artists || []).length) bits.push("Artists: " + d.artists.slice(0, 4).map(a => a.name).join(", "));
  if ((f.genres || []).length) bits.push(f.genres.map(g => g.name).join(", ")); if ((f.moods || []).length) bits.push(f.moods.join(", "));
  return bits.join(" · ") || "Built from the songs on it";
}
function mosaic(pl) {
  const job = S.jobs.get(pl.id); let m;
  if (pl.artwork) m = h("div", { class: "mos one", "aria-hidden": "true" }, h("img", { src: pl.artwork, alt: "" }));
  else { const c = pl.order.map(getTrack).filter(t => t && https(t.cov)).slice(0, 4); m = h("div", { class: "mos" + (c.length < 4 ? " one" : ""), "aria-hidden": "true" }); if (!c.length) m.append(placeholder({ id: pl.id, t: pl.name })); else (c.length < 4 ? c.slice(0, 1) : c).forEach(t => m.append(coverEl(t))); }
  if (job) m.append(h("span", { class: "badge", text: job.kind === "fill" ? "Filling…" : "Finding songs…" }));
  return m;
}

/* ---------- dashboard (NAV-001..006) ---------- */
function vHome(v) {
  const all = S.meta.order.map(id => S.pls.get(id)).filter(Boolean);
  const nIn = all.filter(p => p.status === "IN_PROGRESS").length, nDone = all.length - nIn;
  setTop("Préndete Mix", `${plural(all.length, "playlist")} · ${nIn} in progress · ${nDone} completed`, null);
  const m = h("main", { class: "wrap" }); v.append(m);
  m.append(h("div", { class: "btns", style: "margin-top:18px" }, btn("Create new playlist", "red", () => { S.create = null; go("#/new"); }, { ic: "plus" })));
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
  if (!list.length) m.append(h("p", { class: "empty", text: all.length ? "No playlists here." : "No playlists yet. Create one to start." }));
  const g = h("div", { class: "pls" });
  for (const pl of list) { const c = Core.counts(pl);
    g.append(h("a", { class: "pl", href: "#/p/" + encodeURIComponent(pl.id) }, mosaic(pl), h("div", { class: "nm", text: pl.name }), h("div", { class: "ct", text: headSub(pl) }),
      c.pending ? h("div", { class: "ct", text: plural(c.pending, "recommendation") + " waiting" }) : null, h("div", { class: "ct", text: dirSummary(pl).slice(0, 70) + (dirSummary(pl).length > 70 ? "…" : "") }))); }
  m.append(g);
}

/* ---------- engine picker (per playlist) ---------- */
function aiReady(p) { const pv = Engines.PROVIDERS[p]; return pv && !pv.wip && S.meta.ai[p] && S.meta.ai[p].key; }
function firstAi() { return ["gemini", "openrouter"].find(aiReady) || null; }
function defaultModel(p) { const a = S.meta.ai[p] || {}; return a.model || (a.models && a.models.length ? Engines.PROVIDERS[p].pick(a.models) : null); }
function aiCtx(eng) { const p = eng && eng.provider; return { provider: p, model: eng && eng.model || defaultModel(p), key: p && S.meta.ai[p] ? S.meta.ai[p].key : null }; }
function engineLabel(eng) { if (!eng || eng.mode !== "ai") return "Classic"; const p = Engines.PROVIDERS[eng.provider]; return `AI · ${p ? p.label.replace(/ \(.*\)/, "") : "?"}${eng.model ? " · " + eng.model : ""}`; }
function enginePicker(eng, onchange) {
  const box = h("div");
  const draw = () => {
    box.replaceChildren();
    box.append(h("div", { class: "seg", role: "group", "aria-label": "Recommendations by" },
      h("button", { type: "button", "aria-pressed": String(eng.mode !== "ai"), onclick: () => { eng.mode = "classic"; onchange(eng); draw(); } }, "Classic"),
      h("button", { type: "button", "aria-pressed": String(eng.mode === "ai"), onclick: () => { eng.mode = "ai"; if (!eng.provider) eng.provider = firstAi() || "gemini"; if (!eng.model) eng.model = defaultModel(eng.provider); onchange(eng); draw(); } }, "AI")));
    if (eng.mode !== "ai") { box.append(h("p", { class: "small", text: "Classic combines Deezer's related artists, ListenBrainz listening data and audio features (energy, tempo, mood), tuned by what you approve and reject here." })); return; }
    const sel = h("select", { "aria-label": "AI service", onchange: e => { eng.provider = e.target.value; eng.model = defaultModel(eng.provider); onchange(eng); draw(); } });
    for (const [k, p] of Object.entries(Engines.PROVIDERS)) { const o = h("option", { value: k, text: p.label + (p.wip ? " — work in progress" : !aiReady(k) ? " — add a key in Settings" : "") }); if (p.wip) o.disabled = true; if (k === eng.provider) o.selected = true; sel.append(o); }
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "AI service" }), sel));
    if (!aiReady(eng.provider)) { box.append(h("p", { class: "note" }, `${Engines.PROVIDERS[eng.provider].label} needs a free key first. `, h("a", { class: "lnk", href: "#/settings", text: "Add it in Settings" }))); return; }
    const models = (S.meta.ai[eng.provider].models || []);
    const ms = h("select", { "aria-label": "Model", onchange: e => { eng.model = e.target.value; onchange(eng); } });
    if (!models.length) ms.append(h("option", { value: eng.model || "", text: eng.model || "Default" }));
    models.forEach(md => { const o = h("option", { value: md.id, text: md.name && md.name !== md.id ? `${md.name} (${md.id})` : md.id }); if (md.id === eng.model) o.selected = true; ms.append(o); });
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "Model" }), ms));
    box.append(h("p", { class: "small", text: "Every song the AI suggests is looked up in Deezer and Apple Music first. Anything that can't be found is left out." }));
  };
  draw(); return box;
}

/* ---------- direction editor (creation + later edits) ---------- */
function emptyDir() { return { text: "", refs: [], artists: [], exclude: { artists: [], songs: [] }, form: { genres: [], moods: [], energy: "", tempo: "", era: null, langs: [], explicit: "any", versions: false, avoidHits: false } }; }
async function loadGenres() { if (S.genres) return S.genres; try { S.genres = await Catalog.Deezer.genres(); } catch { S.genres = []; } return S.genres; }
const LANGS = [["es", "Spanish"], ["en", "English"], ["pt", "Portuguese"], ["fr", "French"]];
function chipToggle(label, on, fn) { return h("button", { class: "chip", type: "button", "aria-pressed": String(!!on), onclick: fn }, label); }
function segPick(label, opts, val, fn) { return h("div", { class: "field" }, h("span", { class: "lbl", text: label }), h("div", { class: "seg", role: "group", "aria-label": label }, opts.map(([k, l]) => h("button", { type: "button", "aria-pressed": String(val === k), onclick: () => fn(k) }, l)))); }
function formEditor(form, o = {}) {
  const box = h("div");
  const draw = () => {
    box.replaceChildren();
    const gl = h("div", { class: "chips wrapc", role: "group", "aria-label": "Genres" });
    if (!S.genres) { gl.append(h("span", { class: "small", text: "Loading genres…" })); loadGenres().then(draw); }
    else { const have = new Set((form.genres || []).map(g => g.name)); S.genres.forEach(g => gl.append(chipToggle(g.name, have.has(g.name), () => { form.genres = have.has(g.name) ? form.genres.filter(x => x.name !== g.name) : [...(form.genres || []), { id: g.id, name: g.name }]; draw(); })));
      (form.genres || []).filter(g => !g.id).forEach(g => gl.append(chipToggle(g.name + " ✕", true, () => { form.genres = form.genres.filter(x => x !== g); draw(); }))); }
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "Genres" + (o.needGenre ? " (pick at least one)" : "") }), gl));
    const ml = h("div", { class: "chips wrapc", role: "group", "aria-label": "Moods" }); const mo = new Set(form.moods || []);
    Object.keys(Engines.MOODS).concat((form.moods || []).filter(m => !Engines.MOODS[m])).forEach(md => ml.append(chipToggle(md, mo.has(md), () => { form.moods = mo.has(md) ? form.moods.filter(x => x !== md) : [...(form.moods || []), md]; draw(); })));
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "Moods" }), ml));
    box.append(segPick("Energy", [["", "Any"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]], form.energy || "", k => { form.energy = k; draw(); }));
    box.append(segPick("Tempo", [["", "Any"], ["slow", "Slow"], ["mid", "Mid"], ["fast", "Fast"]], form.tempo || "", k => { form.tempo = k; draw(); }));
    const y1 = h("input", { type: "number", min: "1900", max: "2100", inputmode: "numeric", placeholder: "From", "aria-label": "From year", value: form.era ? form.era[0] : "" });
    const y2 = h("input", { type: "number", min: "1900", max: "2100", inputmode: "numeric", placeholder: "To", "aria-label": "To year", value: form.era ? form.era[1] : "" });
    const setEra = () => { const a = +y1.value, b = +y2.value; form.era = a > 1900 || b > 1900 ? [a > 1900 ? a : 1900, b > 1900 ? b : 2100] : null; };
    y1.onchange = setEra; y2.onchange = setEra;
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "Release years (optional)" }), h("div", { class: "inl" }, y1, "to", y2)));
    const ll = h("div", { class: "chips wrapc", role: "group", "aria-label": "Languages" }); const lo = new Set(form.langs || []);
    LANGS.forEach(([k, l]) => ll.append(chipToggle(l, lo.has(k), () => { form.langs = lo.has(k) ? form.langs.filter(x => x !== k) : [...(form.langs || []), k]; draw(); })));
    box.append(h("div", { class: "field" }, h("span", { class: "lbl", text: "Languages (optional)" }), ll, h("span", { class: "small", text: "Classic can only guess a language from song titles, so this is a light nudge, not a filter." })));
    box.append(segPick("Explicit and clean versions", [["any", "Either"], ["clean", "Clean only"], ["explicit", "Explicit preferred"]], form.explicit || "any", k => { form.explicit = k; draw(); }));
    const v1 = h("input", { type: "checkbox" }); v1.checked = !!form.versions; v1.onchange = () => (form.versions = v1.checked);
    const v2 = h("input", { type: "checkbox" }); v2.checked = !!form.avoidHits; v2.onchange = () => (form.avoidHits = v2.checked);
    box.append(h("label", { class: "chk" }, v1, "Remixes, live, sped-up and acoustic versions are OK"), h("label", { class: "chk" }, v2, "Skip the most-played hits"));
  };
  draw(); return box;
}
function namesEditor(list, label, placeholder) {
  const box = h("div", { class: "field" });
  const draw = () => {
    box.replaceChildren(h("span", { class: "lbl", text: label }));
    const chips = h("div", { class: "chips wrapc" }); list.forEach((n, i) => { const c = h("button", { class: "chip", type: "button", "aria-label": "Remove " + n, onclick: () => { list.splice(i, 1); draw(); } }, n); const x = h("span", { class: "x" }); x.innerHTML = I("x"); c.append(x); chips.append(c); });
    const inp = h("input", { type: "text", placeholder, "aria-label": label, maxlength: "80" });
    const add = () => { const v = inp.value.trim(); if (v && !list.some(x => Core.norm(x) === Core.norm(v))) list.push(v); inp.value = ""; draw(); box.querySelector("input").focus(); };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    if (list.length) box.append(chips); box.append(h("div", { class: "inl" }, inp, btn("Add", "ghost sm", add)));
  };
  draw(); return box;
}
/* st: {dir, must:[ids], mustLocked:[ids]} — mode: "A" | "Bc" | "Bai" | "edit" */
function dirEditor(st, mode, o = {}) {
  const root = h("div"); const d = st.dir;
  const showSearch = mode !== "Bc";
  const picks = h("div"), res = h("div");
  const has = id => d.refs.includes(id) || st.must.includes(id) || (st.mustLocked || []).includes(id) || d.exclude.songs.includes(id);
  const drop = id => { d.refs = d.refs.filter(x => x !== id); st.must = st.must.filter(x => x !== id); d.exclude.songs = d.exclude.songs.filter(x => x !== id); };
  const drawPicks = () => {
    picks.replaceChildren();
    const sec = (title, ids, acts, empty) => { if (!ids.length && !empty) return; picks.append(h("h3", { class: "sub2", text: `${title} (${ids.length})` })); if (!ids.length) picks.append(h("p", { class: "small", text: empty }));
      const box = h("div"); rowsInto(box, ids.map(getTrack).filter(Boolean), "pick:" + title, t => ({ acts: acts(t) })); picks.append(box); };
    sec("Sounds like", d.refs, t => [btn("Must include", "ghost sm", () => { drop(t.id); st.must.push(t.id); drawPicks(); }), ibtn("x", "Remove " + t.t, () => { drop(t.id); drawPicks(); })], mode === "A" ? "Songs that show the sound you want. They don't go on the playlist unless you approve them later." : null);
    sec("Must include", st.must, t => [btn("Just a reference", "ghost sm", () => { drop(t.id); d.refs.push(t.id); drawPicks(); }), ibtn("x", "Remove " + t.t, () => { drop(t.id); drawPicks(); })], mode === "A" ? "Songs that go straight onto the playlist." : null);
    if ((st.mustLocked || []).length) sec("Already must-include", st.mustLocked, t => [btn("Unmark", "ghost sm", () => { st.mustLocked = st.mustLocked.filter(x => x !== t.id); (st.unmust = st.unmust || []).push(t.id); drawPicks(); })], null);
    if (d.artists.length) { picks.append(h("h3", { class: "sub2", text: `Artists (${d.artists.length})` })); picks.append(h("div", { class: "chips wrapc" }, d.artists.map(a => { const c = h("button", { class: "chip", type: "button", "aria-label": "Remove " + a.name, onclick: () => { d.artists = d.artists.filter(x => x !== a); drawPicks(); } }, a.name); const x = h("span", { class: "x" }); x.innerHTML = I("x"); c.append(x); return c; }))); }
    sec("Never include", d.exclude.songs, t => [ibtn("x", "Remove " + t.t, () => { drop(t.id); drawPicks(); })], null);
    if (o.onchange) o.onchange();
  };
  const drawRes = () => {
    res.replaceChildren(); const r = st._res; if (!r) return;
    if (r.msg) res.append(h("p", { class: "small", text: r.msg }));
    (r.artists || []).forEach(a => { const on = d.artists.some(x => x.id === a.id); const ex = d.exclude.artists.some(x => Core.norm(x) === Core.norm(a.name));
      res.append(h("div", { class: "res" }, h("div", { class: "ava" }, a.pic ? h("img", { src: a.pic, alt: "", referrerpolicy: "no-referrer" }) : placeholder({ id: "a" + a.id, t: a.name })),
        h("div", {}, h("div", { class: "t", text: a.name }), h("div", { class: "m", text: "Artist" }), h("div", { class: "pick" },
          btn(on ? "✓ Reference artist" : "Reference artist", on ? "" : "ghost", () => { if (on) d.artists = d.artists.filter(x => x.id !== a.id); else d.artists.push({ id: a.id, name: a.name }); drawPicks(); drawRes(); }),
          btn(ex ? "✓ Never suggest" : "Never suggest", ex ? "" : "ghost", () => { if (ex) d.exclude.artists = d.exclude.artists.filter(x => Core.norm(x) !== Core.norm(a.name)); else d.exclude.artists.push(a.name); exBox.replaceWith(exBox = namesEditor(d.exclude.artists, "Never suggest these artists here", "Artist name")); drawRes(); }))))); });
    Q["search"] = (r.tracks || []).map(t => t.id);
    (r.tracks || []).forEach(t => { const st2 = d.refs.includes(t.id) ? "ref" : st.must.includes(t.id) || (st.mustLocked || []).includes(t.id) ? "must" : d.exclude.songs.includes(t.id) ? "ex" : "";
      const set = k => async () => { drop(t.id); if (k !== st2) { if (k !== "ex" && mode !== "Bai") { const full = await Catalog.complete(t); S.tmp.set(full.id, full); } (k === "ref" ? d.refs : k === "must" ? st.must : d.exclude.songs).push(t.id); } drawPicks(); drawRes(); };
      const cv = h("button", { class: "cov", type: "button", "aria-label": "Play sample of " + t.t, onclick: () => togglePlay(t, "search") }, coverEl(t));
      res.append(h("div", { class: "res", "data-k": t.id }, cv, h("div", {}, h("div", { class: "t", text: t.t }), h("div", { class: "m", text: meta(t) + (t.exp ? ` · ${t.exp === "explicit" ? "Explicit" : "Clean"}` : "") }),
        h("div", { class: "pick" }, btn(st2 === "ref" ? "✓ Sounds like" : "Sounds like", st2 === "ref" ? "" : "ghost", set("ref")), btn(st2 === "must" ? "✓ Must include" : "Must include", st2 === "must" ? "" : "ghost", set("must")), btn(st2 === "ex" ? "✓ Never include" : "Never include", st2 === "ex" ? "" : "ghost", set("ex")))))); });
  };
  if (showSearch) {
    const inp = h("input", { type: "search", enterkeyhint: "search", autocomplete: "off", placeholder: "Search a song or an artist", "aria-label": "Search songs and artists", value: st._q || "" });
    const srch = async () => { const q = inp.value.trim(); st._q = q; if (!q) return; st._res = { msg: "Searching…" }; drawRes();
      let tracks = [], artists = [], msg = ""; try { [tracks, artists] = await Promise.all([Catalog.Deezer.search(q, 15), Catalog.Deezer.artists(q, 4)]); } catch { msg = "Deezer didn't answer, so these are from Apple Music."; }
      if (!tracks.length) { try { tracks = await Catalog.ITunes.search(q, 15); } catch {} }
      tracks.forEach(t => { if (!S.tr.has(t.id)) S.tmp.set(t.id, t); });
      st._res = { tracks, artists: artists.slice(0, 3), msg: !tracks.length && !artists.length ? "Nothing found. Try other words." : msg }; drawRes(); };
    const f = h("form", { class: "field", role: "search", onsubmit: e => { e.preventDefault(); srch(); } }, h("label", { text: mode === "A" ? "Find artists and songs" : "Add songs or artists" }), h("div", { class: "inl" }, inp, btn("Search", "", null, { type: "submit", ic: "search" })));
    root.append(f, res);
  }
  root.append(picks);
  if (mode === "Bc" || mode === "edit" || (mode === "A" && d.text)) {
    const ta = h("textarea", { maxlength: "2000", "aria-label": "Description", placeholder: mode === "Bc" ? "Anything else? (optional, kept with the playlist)" : "Describe the playlist" }); ta.value = d.text || ""; ta.oninput = () => (d.text = ta.value);
    root.append(h("div", { class: "field" }, h("label", { text: mode === "Bc" ? "Notes (optional)" : "Description" }), ta));
  }
  let exBox = namesEditor(d.exclude.artists, "Never suggest these artists here", "Artist name");
  if (mode === "Bc") root.append(formEditor(d.form, { needGenre: !d.refs.length && !d.artists.length }), exBox);
  else { const det = h("details", { class: "more" }, h("summary", { text: mode === "A" ? "Fine-tune (optional)" : "Genres, mood, energy, years and exclusions" }), formEditor(d.form), exBox); if (mode === "edit" || mode === "Bai") det.open = true; root.append(det); }
  drawPicks(); drawRes();
  return root;
}

/* ---------- create (Section 5) ---------- */
function vNew(v) {
  const D = S.create || (S.create = { step: "method", method: null, name: "", capacity: 50, engine: { mode: firstAi() ? "ai" : "classic", provider: firstAi(), model: firstAi() ? defaultModel(firstAi()) : null }, dir: emptyDir(), must: [], interp: null, busy: false, msg: "" });
  setTop("New playlist", D.step === "method" ? "Step 1 of 2" : "Step 2 of 2", "#/");
  const m = h("main", { class: "wrap" }); v.append(m);
  if (D.step === "method") {
    m.append(h("h2", { class: "sec", text: "How do you want to start?" }));
    m.append(h("div", { class: "opts" },
      h("button", { class: "optc", type: "button", onclick: () => { D.method = "A"; D.step = "build"; render(); } }, h("b", { text: "From artists and songs" }), h("span", { text: "Search and pick artists or songs that show the sound. Mark any song as must-include." })),
      h("button", { class: "optc", type: "button", onclick: () => { D.method = "B"; D.step = "build"; render(); } }, h("b", { text: "Describe it" }), h("span", { text: "Write what you want and let an AI read it, or use Classic's short form." }))));
    return;
  }
  m.append(h("div", { class: "btns" }, h("button", { class: "lnk", type: "button", text: "← Change how to start", onclick: () => { D.step = "method"; render(); } })));
  const name = h("input", { type: "text", maxlength: "100", placeholder: "Playlist name", "aria-label": "Playlist name", value: D.name, oninput: e => (D.name = e.target.value) });
  const cap = h("select", { "aria-label": "Capacity", onchange: e => (D.capacity = +e.target.value) }); Core.capacityOptions().forEach(c => { const o = h("option", { value: c, text: `${c} songs` }); if (c === D.capacity) o.selected = true; cap.append(o); });
  m.append(h("div", { class: "card" }, h("div", { class: "field" }, h("label", { text: "Name" }), name),
    h("div", { class: "field" }, h("label", { text: "Capacity" }), cap, h("span", { class: "small", text: "The most songs it can hold. It's a ceiling, not a goal: you decide when it's done." })),
    h("div", { class: "field" }, h("span", { class: "lbl", text: "Recommendations by" }), enginePicker(D.engine, () => render()))));
  const st = { dir: D.dir, must: D.must }; const sync = () => { D.must = st.must; };
  if (D.method === "A") { m.append(h("h2", { class: "sec", text: "Artists and songs" })); m.append(dirEditor(st, "A", { onchange: sync })); }
  else if (D.engine.mode !== "ai") { m.append(h("h2", { class: "sec", text: "Describe it" }), h("p", { class: "lede", text: "Classic doesn't read prose, so describe it with this form." })); m.append(dirEditor(st, "Bc", { onchange: sync })); }
  else {
    m.append(h("h2", { class: "sec", text: "Describe it" }));
    const ta = h("textarea", { maxlength: "4000", "aria-label": "Description", placeholder: "Genres, mood, energy, occasion, languages, eras, songs you'd want or never want…" }); ta.value = D.dir.text; ta.oninput = () => { D.dir.text = ta.value; };
    m.append(h("div", { class: "field" }, ta), h("div", { class: "btns" }, btn(D.interp ? "Read it again" : "Read my description", D.interp ? "ghost" : "yel", () => readDescription(D), { ic: "spark", disabled: D.busy ? true : null })));
    if (D.interp) {
      m.append(h("div", { class: "card" }, h("h3", { class: "sub2", style: "margin-top:0", text: "Here's how I read it" }), h("p", { text: D.interp.summary || "" }),
        D.interp.missing.length ? h("p", { class: "note", text: "Couldn't find these in the catalog, so they're left out: " + D.interp.missing.join("; ") }) : null,
        h("p", { class: "small", text: "Check it, remove anything that's wrong, then create the playlist." })));
      m.append(dirEditor(st, "Bai", { onchange: sync }));
    }
  }
  m.append(h("p", { class: "status", "aria-live": "polite", text: D.msg || "" }));
  m.append(h("div", { class: "btns" }, btn(D.busy ? "Working…" : "Create and find songs", "red", () => createFromDraft(D), { ic: "spark", disabled: D.busy ? true : null })));
}
async function readDescription(D) {
  if (!D.dir.text.trim()) { D.msg = "Write a description first."; return render(); }
  D.busy = true; D.msg = "Reading your description…"; render();
  try {
    const ctx = { ai: aiCtx(D.engine) }; const j = await Engines.AI.interpret(ctx, D.dir.text);
    const missing = []; const dir = Object.assign(emptyDir(), { text: D.dir.text }); const must = [];
    const look = async (it, into) => { if (!it || !it.title || !it.artist) return; D.msg = `Finding ${it.title}…`; render(); const t = await Catalog.resolve(it.title, it.artist); if (!t) { missing.push(`${it.title} — ${it.artist}`); return; } S.tmp.set(t.id, t); if (!into.includes(t.id)) into.push(t.id); };
    for (const it of (j.include || []).slice(0, 40)) await look(it, must);
    for (const it of (j.references || []).slice(0, 20)) await look(it, dir.refs);
    for (const it of (j.excludeSongs || []).slice(0, 20)) await look(it, dir.exclude.songs);
    for (const n of (j.referenceArtists || []).slice(0, 12)) { try { const a = await Catalog.Deezer.artistByName(n); if (a) dir.artists.push({ id: a.id, name: a.name }); else missing.push(n); } catch {} }
    dir.exclude.artists = (j.excludeArtists || []).filter(Boolean).slice(0, 40);
    const tr = j.traits || {}; const gl = await loadGenres();
    dir.form.genres = (tr.genres || []).filter(Boolean).map(n => { const g = gl.find(x => Core.norm(x.name) === Core.norm(n)); return g ? { id: g.id, name: g.name } : { id: null, name: n }; });
    dir.form.moods = (tr.moods || []).filter(Boolean).map(mo => Object.keys(Engines.MOODS).find(k => Core.norm(k) === Core.norm(mo)) || mo);
    dir.form.energy = ["low", "medium", "high"].includes(tr.energy) ? tr.energy : ""; dir.form.tempo = ["slow", "mid", "fast"].includes(tr.tempo) ? tr.tempo : "";
    dir.form.era = Array.isArray(tr.era) && (+tr.era[0] > 1900 || +tr.era[1] > 1900) ? [+tr.era[0] > 1900 ? +tr.era[0] : 1900, +tr.era[1] > 1900 ? +tr.era[1] : 2100] : null;
    dir.form.langs = (tr.languages || []).map(x => String(x).slice(0, 2).toLowerCase()).filter(x => LANGS.some(([k]) => k === x));
    dir.form.explicit = ["any", "clean", "explicit"].includes(tr.explicit) ? tr.explicit : "any"; dir.form.versions = !!tr.versions; dir.form.avoidHits = !!tr.avoidHits;
    D.dir = dir; D.must = must; D.interp = { summary: j.summary || "", missing }; if (!D.name && j.name) D.name = String(j.name).slice(0, 100); D.msg = "";
  } catch (e) { D.msg = e.message || "Couldn't read it. Try again."; }
  D.busy = false; render();
}
async function createFromDraft(D) {
  const name = D.name.trim(); if (!name) { D.msg = "Give the playlist a name."; return render(); }
  const d = D.dir;
  if (D.method === "A" && !d.refs.length && !D.must.length && !d.artists.length) { D.msg = "Pick at least one artist or song."; return render(); }
  if (D.method === "B" && D.engine.mode !== "ai" && !d.form.genres.some(g => g.id) && !d.refs.length && !d.artists.length) { D.msg = "Pick at least one genre so Classic has somewhere to start."; return render(); }
  if (D.method === "B" && D.engine.mode === "ai" && !D.interp) { D.msg = "Tap “Read my description” first and check what it found."; return render(); }
  if (D.engine.mode === "ai" && !aiReady(D.engine.provider)) { D.msg = "Add an AI key in Settings, or switch to Classic."; return render(); }
  if (D.must.length > D.capacity) { D.msg = `You picked ${D.must.length} must-include songs but the capacity is ${D.capacity}. Raise the capacity or unmark some.`; return render(); }
  D.busy = true; D.msg = "Creating…"; render();
  try {
    const ids = [...d.refs, ...D.must, ...d.exclude.songs]; const tracks = [];
    for (const id of ids) { let t = getTrack(id); if (t && d.exclude.songs.indexOf(id) < 0) t = await Catalog.complete(t); if (t) tracks.push(t); }
    tracks.forEach(t => S.tmp.set(t.id, t));
    const eng = D.engine.mode === "ai" ? { mode: "ai", provider: D.engine.provider, model: D.engine.model || defaultModel(D.engine.provider) } : { mode: "classic" };
    const pl = Core.createPlaylist({ name, method: D.method === "A" ? "ARTISTS_AND_SONGS" : "NATURAL_LANGUAGE", direction: clone(d), capacity: D.capacity, engine: eng });
    Core.addMandatory(pl, D.must, getTrack); Core.validate(pl);
    const order = [pl.id, ...S.meta.order]; const metaNext = Object.assign({}, S.meta, { order });
    await DB.tx([{ store: "kv", key: "pl:" + pl.id, value: pl }, { store: "kv", key: "meta", value: metaNext }, ...tracks.map(t => ({ store: "tracks", value: slimTrack(t) }))]);
    tracks.forEach(t => { S.tr.set(t.id, t); S.tmp.delete(t.id); }); S.pls.set(pl.id, pl); S.meta.order = order; S.create = null;
    go("#/p/" + encodeURIComponent(pl.id) + "/recs"); startJob(pl.id, "initial");
  } catch (e) { D.busy = false; D.msg = e.message || "Couldn't create it. Nothing was saved."; render(); }
}

/* ---------- playlist workspace (Section 9) ---------- */
function statsEl(pl) {
  const c = Core.counts(pl);
  return h("div", { class: "stats", id: "stats" }, [["Playlist", c.approved], ["Recom\u00ADmendations", c.pending], ["Rejected", c.rejected], ["Capacity", pl.capacity], ["Open spots", Math.max(0, c.available)]].map(([l, n]) => h("div", { class: "stat" }, h("b", { text: n }), h("span", { text: l }))));
}
function vPlaylist(v, r) {
  const pl = S.pls.get(r.id);
  if (!pl) { setTop("Not found", "", "#/"); v.append(h("main", { class: "wrap" }, h("p", { class: "empty", text: "This playlist doesn't exist anymore." }), btn("Back to playlists", "", () => go("#/")))); return; }
  setTop(pl.name, headSub(pl), "#/");
  const m = h("main", { class: "wrap" }); v.append(m); const c = Core.counts(pl), job = S.jobs.get(pl.id), open = Math.max(0, c.available);
  m.append(h("div", { class: "card" }, statsEl(pl), h("p", { class: "lede dirsum", style: "margin-top:10px", text: dirSummary(pl) }), h("p", { class: "small" }, "Recommendations by " + engineLabel(pl.engine) + " · ", h("a", { class: "lnk", href: `#/p/${encodeURIComponent(pl.id)}/settings`, text: "Edit direction" }))));
  if (job) { const s = h("div", { class: "job", role: "status" }, h("span", { class: "spin", "aria-hidden": "true" }), h("p", { id: "jobmsg", text: job.msg })); s.append(btn("Stop", "sm", () => { job.stop = true; $("#jobmsg") && ($("#jobmsg").textContent = "Stopping… songs already added stay."); })); m.append(s); }
  const rep = S.reports.get(pl.id); if (rep) m.append(h("div", { class: "note" + (rep.err ? " err" : "") }, rep.text, " ", rep.action || null, " ", h("button", { class: "lnk", type: "button", text: "Dismiss", onclick: () => { S.reports.delete(pl.id); render(); } })));
  m.append(h("div", { class: "btns" },
    btn("Recalibrate", "red", () => startJob(pl.id, "recal"), { ic: "spark", disabled: job ? true : null }),
    btn(open ? `Random fill · ${plural(open, "open spot")}` : "Full · no open spots", "yel", () => fillFlow(pl.id), { ic: "shuffle", disabled: job || !open ? true : null }),
  ), h("div", { class: "btns", style: "margin-top:2px" },
    pl.status === "COMPLETED" ? btn("Reopen curation", "ghost sm", () => act(() => mutate(pl.id, p => Core.setStatus(p, "IN_PROGRESS")), "Back to In progress. Nothing else changed."), { ic: "undo" })
      : btn("Mark as completed", "ghost sm", () => act(() => mutate(pl.id, p => Core.setStatus(p, "COMPLETED")), "Marked as completed. Everything stays editable."), { ic: "done" }),
    btn("Export CSV", "ghost sm", () => exportCsv(pl), { ic: "dl" })));
  const tabs = [["playlist", "Playlist", c.approved], ["recs", "Recommendations", c.pending], ["rejected", "Rejected", c.rejected], ["settings", "Settings", null]];
  m.append(h("div", { class: "tabsbar" }, h("div", { class: "chips", role: "tablist", "aria-label": "Playlist sections" }, tabs.map(([k, l, n]) => h("a", { class: "chip", role: "tab", href: `#/p/${encodeURIComponent(pl.id)}/${k}`, "aria-selected": String(r.tab === k), "aria-pressed": String(r.tab === k) }, l, n != null ? h("span", { class: "n", text: n }) : null)))));
  const body = h("div"); m.append(body);
  ({ playlist: tabPlaylist, recs: tabRecs, rejected: tabRejected, settings: tabSettings })[r.tab](body, pl);
}
const uiOf = id => S.ui.view[id] || (S.ui.view[id] = { plMode: null, plSort: "order", recView: "cards", recSort: "new", recSel: false, rjSel: false });
const selOf = (id, k) => { const key = id + ":" + k; if (!S.ui.sel.has(key)) S.ui.sel.set(key, new Set()); return S.ui.sel.get(key); };
function batchBar(set, actions) { if (!set.size) return null; return h("div", { class: "batch", role: "region", "aria-label": "Selected songs" }, h("b", { text: `${set.size} selected` }), ...actions, btn("Clear", "sm", () => { set.clear(); render(); })); }
function tabPlaylist(box, pl) {
  const u = uiOf(pl.id), sel = selOf(pl.id, "pl");
  const sort = h("select", { "aria-label": "Sort for viewing", onchange: e => { u.plSort = e.target.value; if (u.plSort !== "order" && u.plMode === "arrange") u.plMode = null; render(); } });
  [["order", "Your order"], ["title", "Title A–Z"], ["artist", "Artist A–Z"], ["year", "Newest first"]].forEach(([k, l]) => { const o = h("option", { value: k, text: l }); if (k === u.plSort) o.selected = true; sort.append(o); });
  box.append(h("div", { class: "tool" }, sort, h("div", { class: "seg", role: "group", "aria-label": "Mode" },
    h("button", { type: "button", "aria-pressed": String(u.plMode === "arrange"), disabled: u.plSort !== "order" ? true : null, onclick: () => { u.plMode = u.plMode === "arrange" ? null : "arrange"; render(); } }, "Arrange"),
    h("button", { type: "button", "aria-pressed": String(u.plMode === "select"), onclick: () => { u.plMode = u.plMode === "select" ? null : "select"; sel.clear(); render(); } }, "Select"))));
  if (u.plSort !== "order") box.append(h("p", { class: "small", text: "Sorted for viewing only. Your saved order hasn't changed." }));
  if (pl.legacyOver) box.append(h("div", { class: "note err", text: `This playlist has ${pl.order.length} songs but the app's limit is ${Core.CONFIG.maxConfirmed}. Nothing was deleted. Remove songs until it fits; new approvals are blocked until then.` }));
  let list = pl.order.map(getTrack).filter(Boolean);
  if (u.plSort === "title") list = list.slice().sort((a, b) => a.t.localeCompare(b.t)); else if (u.plSort === "artist") list = list.slice().sort((a, b) => artistsOf(a.a).localeCompare(artistsOf(b.a))); else if (u.plSort === "year") list = list.slice().sort((a, b) => (b.y || 0) - (a.y || 0));
  if (!list.length) { box.append(h("p", { class: "empty", text: "No songs on the playlist yet. Approve recommendations or use Random fill." })); return; }
  const rows = h("div"); box.append(rows);
  rowsInto(rows, list, "pl:" + pl.id, (t, i) => {
    const r = pl.rels[t.id]; const tags = [];
    if (r.mandatory) tags.push({ t: "Must include", c: "r" });
    if (r.origin === Core.ORIGIN.FILL) tags.push({ t: "Auto-filled", c: "y" }, h("button", { class: "lnk", type: "button", text: "Keep", "aria-label": "Keep " + t.t + " as your own pick", onclick: () => act(() => mutate(pl.id, p => Core.confirmKeep(p, t.id)), "Marked as your pick.") }));
    let acts;
    if (u.plMode === "arrange") { const pos = pl.order.indexOf(t.id);
      acts = [ibtn("aup", "Move up", () => act(() => mutate(pl.id, p => Core.reorder(p, t.id, pos - 1))), "", { disabled: pos === 0 ? true : null }), ibtn("adn", "Move down", () => act(() => mutate(pl.id, p => Core.reorder(p, t.id, pos + 1))), "", { disabled: pos === pl.order.length - 1 ? true : null }),
        h("button", { class: "btn ghost sm", type: "button", "aria-label": `Position ${pos + 1}. Move to another position`, onclick: () => moveTo(pl.id, t) }, String(pos + 1))]; }
    else if (u.plMode === "select") acts = [];
    else acts = [ibtn("x", "Remove " + t.t + " from the playlist", () => removeFlow(pl.id, [t.id]), "rj")];
    return { tags, acts, ctx: pl.id, sel: u.plMode === "select" ? { checked: sel.has(t.id), onchange: on => { on ? sel.add(t.id) : sel.delete(t.id); const b = $(".batch"); const nb = batchBar(sel, plBatch(pl, sel)); if (b) b.replaceWith(nb || h("span")); else if (nb) box.append(nb); } } : null };
  });
  if (u.plMode === "select") { const b = batchBar(sel, plBatch(pl, sel)); if (b) box.append(b); }
}
const plBatch = (pl, sel) => [btn(`Remove ${sel.size}`, "red sm", () => removeFlow(pl.id, [...sel], () => sel.clear()))];
function moveTo(id, t) {
  const pl = S.pls.get(id); const pos = pl.order.indexOf(t.id);
  sheet({ title: "Move to position", build: close => { const n = h("input", { type: "number", min: "1", max: String(pl.order.length), value: String(pos + 1), "aria-label": "New position", autofocus: true, inputmode: "numeric" });
    return [h("p", { class: "lede", text: `${t.t} is at ${pos + 1} of ${pl.order.length}.` }), h("div", { class: "field" }, n), h("div", { class: "foot" }, btn("Cancel", "ghost", () => close()), btn("Move", "red", () => { const to = Math.max(1, Math.min(pl.order.length, Math.round(+n.value || 1))) - 1; close(); act(() => mutate(id, p => Core.reorder(p, t.id, to))); }))]; } });
}
function pendingSorted(pl, how) {
  const ids = Core.idsIn(pl, "PENDING"); const list = ids.map(getTrack).filter(Boolean);
  if (how === "artist") return list.sort((a, b) => artistsOf(a.a).localeCompare(artistsOf(b.a)));
  const bt = new Map((pl.batches || []).map(b => [b.id, b.at]));
  const grp = t => { const r = pl.rels[t.id]; return Math.max(r.restoredAt || 0, (r.batch && bt.get(r.batch)) || r.recAt || 0); };
  const at = t => pl.rels[t.id].recAt || 0;
  return list.sort((a, b) => (how === "old" ? grp(a) - grp(b) || at(a) - at(b) : grp(b) - grp(a) || at(a) - at(b)));
}
function tabRecs(box, pl) {
  const u = uiOf(pl.id), sel = selOf(pl.id, "rec"), c = Core.counts(pl), full = c.available <= 0 || pl.legacyOver;
  const sort = h("select", { "aria-label": "Order", onchange: e => { u.recSort = e.target.value; render(); } }); [["new", "Newest first"], ["old", "Oldest first"], ["artist", "Artist A–Z"]].forEach(([k, l]) => { const o = h("option", { value: k, text: l }); if (k === u.recSort) o.selected = true; sort.append(o); });
  const vs = h("div", { class: "seg", role: "group", "aria-label": "View" }, h("button", { type: "button", "aria-pressed": String(u.recView === "cards"), onclick: () => { u.recView = "cards"; render(); } }, "Cards"), h("button", { type: "button", "aria-pressed": String(u.recView === "list"), onclick: () => { u.recView = "list"; render(); } }, "List"));
  vs.children[0].innerHTML = I("cards") + "Cards"; vs.children[1].innerHTML = I("list") + "List";
  const tool = h("div", { class: "tool" }, vs, sort); if (u.recView === "list") tool.append(h("div", { class: "seg" }, h("button", { type: "button", "aria-pressed": String(u.recSel), onclick: () => { u.recSel = !u.recSel; sel.clear(); render(); } }, "Select")));
  box.append(tool);
  if (full) box.append(h("p", { class: "note", text: pl.legacyOver ? "Over the app's limit: remove songs before approving more." : `The playlist is full (${c.approved} of ${pl.capacity}). To approve more, raise the capacity in Settings or remove a song. You can still reject, and Recalibrate still works.` }));
  const list = pendingSorted(pl, u.recSort);
  if (!list.length) { box.append(h("p", { class: "empty", text: S.jobs.has(pl.id) ? "Looking for songs… they'll show up here as they're found." : "No recommendations waiting. Tap Recalibrate to find more." })); return; }
  Q["rec:" + pl.id] = list.map(t => t.id);
  if (u.recView === "cards") {
    let i = Math.max(0, list.findIndex(t => t.id === S.ui.card[pl.id])); const t = list[i]; S.ui.card[pl.id] = t.id; const r = pl.rels[t.id];
    const nextId = () => (list[i + 1] || list[i - 1] || {}).id;
    const big = h("button", { class: "big", type: "button", "aria-label": "Play sample of " + t.t, onclick: () => togglePlay(t, "rec:" + pl.id, pl.id) }, coverEl(t), h("span", { class: "ov" })); big.querySelector(".ov").innerHTML = I("play");
    const card = h("div", { class: "rcard", "data-k": t.id }, h("div", { class: "rnav" }, ibtn("prev", "Previous recommendation", () => { S.ui.card[pl.id] = (list[i - 1] || t).id; render(); }, "", { disabled: i === 0 ? true : null }), h("span", { text: `${i + 1} of ${list.length}` }), ibtn("next", "Next recommendation", () => { S.ui.card[pl.id] = (list[i + 1] || t).id; render(); }, "", { disabled: i === list.length - 1 ? true : null })),
      big, h("div", { class: "t", text: t.t }), h("div", { class: "m", text: meta(t) }), r.why ? h("div", { class: "why", text: r.why }) : null,
      h("div", { class: "tags" }, t.exp ? h("span", { class: "tag o", text: t.exp === "explicit" ? "Explicit" : "Clean" }) : null, r.restoredAt ? h("span", { class: "tag", text: "Restored" }) : null, h("a", { class: "lnk", href: spLink(t), target: "_blank", rel: "noopener noreferrer", text: "Spotify ↗" })),
      h("div", { class: "decide" }, btn("Reject", "ghost", () => { const n = nextId(); rejectFlow(pl.id, [t.id], () => { S.ui.card[pl.id] = n; }); }, { ic: "x" }),
        btn("Skip", "ghost", () => { S.ui.card[pl.id] = (list[i + 1] || list[0]).id; render(); }),
        btn("Approve", "ok", () => { const n = nextId(); approveFlow(pl.id, [t.id], Core.ORIGIN.MANUAL, () => { S.ui.card[pl.id] = n; }); }, { ic: "check", disabled: full ? true : null })));
    box.append(card); return;
  }
  const rows = h("div"); box.append(rows);
  rowsInto(rows, list, "rec:" + pl.id, t => { const r = pl.rels[t.id];
    return { why: r.why, ctx: pl.id, tags: r.restoredAt ? [{ t: "Restored" }] : [], acts: u.recSel ? [] : [ibtn("x", "Reject " + t.t, () => rejectFlow(pl.id, [t.id]), "rj"), ibtn("check", "Approve " + t.t, () => approveFlow(pl.id, [t.id]), "ap", { disabled: full ? true : null })],
      sel: u.recSel ? { checked: sel.has(t.id), onchange: on => { on ? sel.add(t.id) : sel.delete(t.id); const b = $(".batch"); const nb = batchBar(sel, recBatch(pl, sel, full)); if (b) b.replaceWith(nb || h("span")); else if (nb) box.append(nb); } } : null }; });
  if (u.recSel) { const b = batchBar(sel, recBatch(pl, sel, full)); if (b) box.append(b); }
}
const recBatch = (pl, sel, full) => [btn(`Reject ${sel.size}`, "red sm", () => rejectFlow(pl.id, [...sel], () => sel.clear())), btn(`Approve ${sel.size}`, "ok sm", () => approveFlow(pl.id, [...sel], Core.ORIGIN.BATCH, () => sel.clear()), { disabled: full ? true : null })];
function tabRejected(box, pl) {
  const u = uiOf(pl.id), sel = selOf(pl.id, "rj");
  const ids = Core.idsIn(pl, "REJECTED").sort((a, b) => (pl.rels[b].changedAt || 0) - (pl.rels[a].changedAt || 0)); const list = ids.map(getTrack).filter(Boolean);
  box.append(h("p", { class: "lede", style: "margin-top:12px", text: "Rejected and removed songs stay out of this playlist's recommendations until you restore them. Other playlists aren't affected." }));
  if (!list.length) { box.append(h("p", { class: "empty", text: "Nothing rejected here." })); return; }
  box.append(h("div", { class: "tool" }, h("div", { class: "seg" }, h("button", { type: "button", "aria-pressed": String(u.rjSel), onclick: () => { u.rjSel = !u.rjSel; sel.clear(); render(); } }, "Select"))));
  const c = Core.counts(pl), full = c.available <= 0 || pl.legacyOver; const rows = h("div"); box.append(rows);
  rowsInto(rows, list, "rj:" + pl.id, t => { const r = pl.rels[t.id]; const tags = []; if (r.from === "APPROVED") tags.push({ t: "Removed from playlist" }); if (r.migrated) tags.push({ t: "Earlier review" });
    return { fb: [r.reason, r.text].filter(Boolean).join(" — ") || null, tags, ctx: pl.id,
      acts: u.rjSel ? [] : [ibtn("undo", "Restore " + t.t + " to recommendations", () => act(() => mutate(pl.id, p => Core.restore(p, t.id, "PENDING")), "Back in recommendations.")), ibtn("plus", "Restore " + t.t + " to the playlist", () => act(() => mutate(pl.id, p => Core.restore(p, t.id, "APPROVED")), "Back on the playlist."), "ap", { disabled: full ? true : null })],
      sel: u.rjSel ? { checked: sel.has(t.id), onchange: on => { on ? sel.add(t.id) : sel.delete(t.id); const b = $(".batch"); const nb = batchBar(sel, rjBatch(pl, sel)); if (b) b.replaceWith(nb || h("span")); else if (nb) box.append(nb); } } : null }; });
  if (u.rjSel) { const b = batchBar(sel, rjBatch(pl, sel)); if (b) box.append(b); }
}
const rjBatch = (pl, sel) => [btn(`Restore ${sel.size} to recommendations`, "sm", () => act(() => mutate(pl.id, p => [...sel].forEach(id => Core.restore(p, id, "PENDING"))), `Restored ${sel.size}.`).then(() => { sel.clear(); render(); }))];

/* ---------- decisions ---------- */
function approveFlow(id, ids, origin = Core.ORIGIN.MANUAL, after) {
  return act(() => mutate(id, p => Core.approve(p, ids, origin)), r => (r && r.length > 1 ? `Approved ${r.length}.` : "Approved.")).then(r => { if (r !== undefined) { after && after(); render(); if (!$("#npw").hidden) renderNp(); } });
}
async function rejectFlow(id, ids, after) {
  const pl = S.pls.get(id); const t = getTrack(ids[0]);
  const fb = await feedbackSheet({ title: ids.length > 1 ? `Reject ${ids.length} songs?` : `Reject “${t ? t.t : "this song"}”?`, count: ids.length, verb: "Reject" }); if (!fb) return;
  const r = await act(() => mutate(id, p => Core.reject(p, ids, fb)), ids.length > 1 ? `Rejected ${ids.length}.` : "Rejected. It won't be suggested here again.");
  if (r !== undefined) { after && after(); render(); }
}
async function removeFlow(id, ids, after) {
  const t = getTrack(ids[0]);
  const fb = await feedbackSheet({ title: ids.length > 1 ? `Remove ${ids.length} songs?` : `Remove “${t ? t.t : "this song"}”?`, count: ids.length, verb: "Remove", lede: "Removed songs move to Rejected and won't be suggested here again unless you restore them. A reason is optional." }); if (!fb) return;
  const r = await act(() => mutate(id, p => Core.reject(p, ids, fb)), ids.length > 1 ? `Removed ${ids.length}.` : "Removed. It's in Rejected if you change your mind.");
  if (r !== undefined) { after && after(); render(); }
}
async function fillFlow(id) {
  const pl = S.pls.get(id); const open = Core.counts(pl).available; if (open <= 0) return;
  const ok = await confirmSheet({ title: `Fill ${plural(open, "open spot")}?`, text: `Picks songs that fit this playlist and adds them straight to it, marked Auto-filled. It uses waiting recommendations first and finds new ones if needed. You can remove any of them.`, ok: `Fill ${plural(open, "spot")}`, cls: "yel" });
  if (ok) startJob(id, "fill");
}
function exportCsv(pl) { const list = pl.order.map(getTrack).filter(Boolean); if (!list.length) return toast("The playlist is empty."); download((pl.name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "playlist") + ".csv", toCsv(list), "text/csv;charset=utf-8"); toast("CSV saved. Import it with TuneMyMusic or Soundiiz."); }

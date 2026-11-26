/* MIXER (internally the Préndete app) — playlist settings, global settings, background jobs, first run + migration, boot. */
"use strict";
const SILENT = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAACAAAA/oAR0dHR0dHR0dHR0dHYmJiYmJiYmJiYmJifHx8fHx8fHx8fHx8fJaWlpaWlpaWlpaWlrGxsbGxsbGxsbGxsbHLy8vLy8vLy8vLy8vl5eXl5eXl5eXl5eXl////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQC1AAAAAAAAAP6yysejgAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEowAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80DEpAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsSjAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==";
S.snaps = new Map();

/* ---------- playlist settings tab ---------- */
function tabSettings(box, pl) {
  const id = pl.id;
  const nm = h("input", { type: "text", maxlength: "100", value: pl.name, "aria-label": "Playlist name" });
  box.append(h("div", { class: "card" }, h("h3", { class: "sub2", style: "margin-top:0", text: "Name" }), h("div", { class: "field" }, nm),
    btn("Save name", "", () => act(() => mutate(id, p => { const v = nm.value.trim(); if (!v) throw new Core.OpError("NAME", "Give it a name."); p.name = v.slice(0, 100); Core.log(p, "rename"); }), "Renamed.").then(() => render()))));
  const file = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return; try { const url = await shrink(f); await act(() => mutate(id, p => { p.artwork = url; Core.log(p, "artwork"); }), "Artwork saved."); render(); } catch { toast("Couldn't read that image."); } } });
  box.append(h("div", { class: "card" }, h("h3", { class: "sub2", style: "margin-top:0", text: "Artwork" }), h("div", { style: "width:120px" }, mosaic(pl)),
    h("div", { class: "btns" }, h("label", { class: "btn ghost sm", tabindex: "0", onkeydown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } }, onclick: () => file.click() }, "Choose an image"), file,
      pl.artwork ? btn("Use song covers", "ghost sm", () => act(() => mutate(id, p => { p.artwork = null; }), "Using song covers.").then(() => render())) : null)));
  const c = Core.counts(pl);
  const cap = h("select", { "aria-label": "Capacity" }); Core.capacityOptions().forEach(n => { const o = h("option", { value: n, text: `${n} songs` + (n < c.approved ? " (needs removals)" : "") }); if (n === pl.capacity) o.selected = true; cap.append(o); });
  box.append(h("div", { class: "card" }, h("h3", { class: "sub2", style: "margin-top:0", text: "Capacity" }), h("p", { class: "small", text: `${c.approved} on the playlist now. Capacity is a ceiling; changing it never adds songs or changes the status.` }),
    h("div", { class: "field inl" }, cap, btn("Apply", "", () => capacityFlow(id, +cap.value)))));
  const eng = clone(pl.engine || { mode: "classic" });
  box.append(h("div", { class: "card" }, h("h3", { class: "sub2", style: "margin-top:0", text: "Recommendations by" }), h("p", { class: "small", text: "Only this playlist. Switching doesn't change any songs or run anything." }),
    enginePicker(eng, e => act(() => mutate(id, p => { p.engine = e.mode === "ai" ? { mode: "ai", provider: e.provider, model: e.model || defaultModel(e.provider) } : { mode: "classic" }; Core.log(p, "engine", { mode: e.mode }); }, { quiet: true })))));
  box.append(h("div", { class: "card" }, h("h3", { class: "sub2", style: "margin-top:0", text: "Creative direction" }), h("p", { text: dirSummary(pl) }),
    dirDetails(pl), h("div", { class: "btns" }, btn("Edit direction", "", () => directionSheet(id), { ic: "edit" })),
    S.snaps.has(id) ? h("div", { class: "btns" }, btn("Undo the last reset", "ghost", () => undoReset(id), { ic: "undo" })) : null));
  const hist = pl.history.slice(-12).reverse();
  if (hist.length) box.append(h("details", { class: "more" }, h("summary", { text: "Activity" }), h("div", {}, hist.map(e => h("p", { class: "small", text: `${new Date(e.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${histText(e)}` })))));
  box.append(h("div", { class: "card" }, h("h3", { class: "sub2", style: "margin-top:0", text: "Delete playlist" }), h("p", { class: "small", text: "Deletes this playlist and its own decisions. Songs in other playlists aren't affected." }),
    btn("Delete playlist", "danger", () => deletePlaylist(id), { ic: "trash" })));
}
function histText(e) {
  const n = e.ids ? e.ids.length : 0;
  return ({ approve: `Approved ${n}`, reject: `Rejected ${n}${e.reason ? ` (${e.reason})` : ""}`, restore: `Restored ${n}`, fill: `Random fill added ${n}`, candidates: `${e.added} recommendations added`, mandatory: `Must-include ${n}`,
    capacity: `Capacity ${e.from} → ${e.to}`, status: e.status === "COMPLETED" ? "Marked as completed" : "Reopened curation", direction: "Direction edited", reset: "Curation reset", rename: "Renamed", engine: `Recommendations by ${e.mode === "ai" ? "AI" : "Classic"}`,
    confirm: "Kept an auto-filled song", migrated: "Moved from the old app", artwork: "Artwork changed", "undo-reset": "Reset undone" })[e.type] || e.type;
}
function dirDetails(pl) {
  const d = pl.direction || {}, f = d.form || {}, ex = d.exclude || {}, lines = [];
  const refs = (d.refs || []).map(getTrack).filter(Boolean); if (refs.length) lines.push("Sounds like: " + refs.map(t => `${t.t} — ${artistsOf(t.a)}`).join("; "));
  if ((d.artists || []).length) lines.push("Reference artists: " + d.artists.map(a => a.name).join(", "));
  const must = pl.order.filter(x => pl.rels[x].mandatory).length; if (must) lines.push(`Must-include: ${must} song${must === 1 ? "" : "s"}`);
  const ln = k => (LANGS.find(x => x[0] === k) || [k, k])[1];
  const tr = []; if ((f.genres || []).length) tr.push(f.genres.map(g => g.name).join(", ")); if ((f.keywords || []).length) tr.push(f.keywords.join(", ")); if ((f.notStyles || []).length) tr.push("no " + f.notStyles.join(" or ")); if ((f.moods || []).length) tr.push(f.moods.join(", ").toLowerCase()); if (f.energy) tr.push(f.energy + " energy");
  if (Array.isArray(f.bpm) && f.bpm[0]) tr.push(`${f.bpm[0]}–${f.bpm[1]} BPM`); else if (f.tempo) tr.push(f.tempo + " tempo");
  if (f.era) tr.push(`${f.era[0]}–${f.era[1]}`); if ((f.langs || []).length) tr.push("in " + f.langs.map(ln).join(" or ")); if ((f.notLangs || []).length) tr.push("nothing in " + f.notLangs.map(ln).join(" or "));
  if (f.explicit === "clean") tr.push("clean only"); if (f.explicit === "explicit") tr.push("explicit preferred");
  if (f.crowd) tr.push("crowd-pleasers"); if (f.gems) tr.push("lesser-known artists and deep cuts"); else if (f.avoidHits) tr.push("skipping the most-played hits"); if (f.preferHits) tr.push("leaning popular"); tr.push(f.versions ? "other versions OK" : "original versions only"); lines.push(tr.join(", "));
  if ((ex.artists || []).length) lines.push("Never: " + ex.artists.map(Artists.nameOf).join(", ")); if ((ex.songs || []).length) lines.push(`Never include: ${ex.songs.length} song${ex.songs.length === 1 ? "" : "s"}`);
  return h("div", {}, lines.map(l => h("p", { class: "small", style: "margin:2px 0", text: l })));
}
function shrink(file) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = rej; fr.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => {
    const s = 320, cv = document.createElement("canvas"); cv.width = cv.height = s; const x = cv.getContext("2d"); const k = Math.max(s / im.width, s / im.height); const w = im.width * k, hh = im.height * k;
    x.drawImage(im, (s - w) / 2, (s - hh) / 2, w, hh); res(cv.toDataURL("image/jpeg", 0.85)); }; im.src = fr.result; }; fr.readAsDataURL(file); });
}
/* lowering capacity below membership needs an explicit choice of songs to remove (CAP-008, AT-020) */
function capacityFlow(id, cap) {
  const pl = S.pls.get(id); const c = Core.counts(pl);
  if (cap === pl.capacity && !pl.legacyOver) return toast("That's already the capacity.");
  if (cap >= c.approved) return act(() => mutate(id, p => Core.setCapacity(p, cap)), `Capacity set to ${cap}.`).then(() => render());
  const excess = c.approved - cap, pick = new Set(); let reason = "";
  sheet({ title: `Remove ${excess} to fit ${cap}`, cls: "tall", build: close => {
    const go = btn("", "red", () => { close(); act(() => mutate(id, p => Core.setCapacity(p, cap, [...pick], { reason: reason || null })), `Capacity set to ${cap}. ${pick.size} moved to Rejected.`).then(() => render()); });
    const upd = () => { go.textContent = pick.size >= excess ? `Remove ${pick.size} and set capacity to ${cap}` : `Pick ${excess - pick.size} more`; go.disabled = pick.size < excess; };
    const rs = h("select", { "aria-label": "Reason (optional)", onchange: e => (reason = e.target.value) }, h("option", { value: "", text: "No reason" }), Core.REASONS.flatMap(([g, l]) => l).map(r => h("option", { value: r, text: r })));
    const list = h("div"); rowsInto(list, pl.order.map(getTrack).filter(Boolean), "cap:" + id, t => ({ sel: { checked: false, onchange: on => { on ? pick.add(t.id) : pick.delete(t.id); upd(); } } })); upd();
    return [h("p", { class: "lede", text: `The playlist has ${c.approved} songs. Pick at least ${excess} to remove; they move to Rejected. Nothing is removed until you confirm.` }), h("div", { class: "field" }, h("span", { class: "lbl", text: "Reason (optional)" }), rs), list, h("div", { class: "foot" }, btn("Cancel", "ghost", () => close()), go)];
  } });
}
function fixDir(d) { const e = emptyDir(); d = Object.assign(e, clone(d || {})); d.exclude = Object.assign({ artists: [], songs: [] }, d.exclude || {}); d.form = Object.assign(emptyDir().form, d.form || {}); return d; }
/* editing direction preserves curation by default; reset needs explicit confirmation (EDIT-006/007) */
function directionSheet(id) {
  const pl = S.pls.get(id);
  const st = { dir: fixDir(pl.direction), must: [], mustLocked: pl.order.filter(x => pl.rels[x].mandatory), unmust: [] };
  sheet({ title: "Edit creative direction", cls: "tall", build: close => [h("p", { class: "lede", text: "Changes guide future Recalibrate and Random fill. Nothing runs by itself." }), dirEditor(st, "edit", { engine: () => S.pls.get(id).engine }),
    h("div", { class: "foot" }, btn("Cancel", "ghost", () => close()), btn("Save", "red", () => { close(); saveDirection(id, st); }))] });
}
function saveDirection(id, st) {
  const pl = S.pls.get(id); const c = Core.counts(pl);
  const tracks = () => [...st.dir.refs, ...st.must, ...st.dir.exclude.songs].map(getTrack).filter(Boolean);
  const apply = (p, reset) => { st.unmust.forEach(x => { if (p.rels[x]) p.rels[x].mandatory = false; }); if (st.must.length) Core.addMandatory(p, st.must, getTrack); Core.editDirection(p, clone(st.dir), { reset }); };
  sheet({ title: "Keep your curation?", build: close => [
    h("p", { class: "lede", text: "Keeping it saves the new direction and leaves every approved, waiting and rejected song as it is." }),
    h("div", { class: "foot" }, btn("Reset curation…", "danger", async () => {
      close(); const mand = pl.order.filter(x => pl.rels[x].mandatory && !st.unmust.includes(x)).length + st.must.length;
      const ok = await confirmSheet({ title: "Reset this playlist's curation?", ok: "Reset curation", text: `This clears ${plural(Math.max(0, c.approved - mand), "song")} from the playlist (keeping ${plural(mand, "must-include song")}), ${plural(c.pending, "recommendation")}, and ${plural(c.rejected, "rejection")} with their reasons, so rejected songs can be suggested again. The status goes back to In progress. Name, capacity and the new direction stay. Other playlists aren't touched. You can undo it once from this playlist's Settings.` });
      if (!ok) return;
      const snap = clone(S.pls.get(id));
      try { await DB.tx([{ store: "kv", key: "snap:" + id, value: snap }]); S.snaps.set(id, snap); } catch { return toast("Couldn't save an undo copy, so nothing was reset."); }
      const j = S.jobs.get(id); if (j) j.stop = true;
      const r = await act(() => mutate(id, p => apply(p, true), { tracks }), "Curation reset. Tap Recalibrate when you want fresh recommendations.");
      if (r === undefined) { S.snaps.delete(id); DB.tx([{ store: "kv", key: "snap:" + id, del: true }]).catch(() => {}); } render();
    }), btn("Keep curation and save", "red", () => { close(); act(() => mutate(id, p => apply(p, false), { tracks }), "Direction saved. Your curation is unchanged.").then(() => render()); }, { autofocus: true }))] });
}
async function undoReset(id) {
  const snap = S.snaps.get(id); if (!snap) return;
  const ok = await confirmSheet({ title: "Undo the last reset?", text: "Brings back the songs, recommendations, rejections, direction and status from just before the reset. Anything done since the reset is replaced.", ok: "Undo reset" }); if (!ok) return;
  const cur = S.pls.get(id); if (!cur) return; const j = S.jobs.get(id); if (j) j.stop = true;
  const back = clone(snap); back.epoch = cur.epoch + 1; back.updatedAt = Date.now(); back.history = cur.history.concat([{ at: Date.now(), type: "undo-reset" }]);
  try { Core.validate(back); await DB.tx([{ store: "kv", key: "pl:" + id, value: back }, { store: "kv", key: "snap:" + id, del: true }]); S.pls.set(id, back); S.snaps.delete(id); announce({ t: "pl", id }); toast("Reset undone."); render(); }
  catch (e) { toast(e.message || "Couldn't undo. Nothing changed."); }
}
async function deletePlaylist(id) {
  const pl = S.pls.get(id); if (!pl) return;
  const ok = await confirmSheet({ title: `Delete “${pl.name}”?`, text: "This removes the playlist with its recommendations, rejections and feedback. It can't be undone, so save a backup first if you might want it back. Other playlists keep all their songs.", ok: "Delete playlist" }); if (!ok) return;
  const j = S.jobs.get(id); if (j) j.stop = true;
  const order = S.meta.order.filter(x => x !== id); const metaNext = Object.assign({}, S.meta, { order });
  try { await DB.tx([{ store: "kv", key: "pl:" + id, del: true }, { store: "kv", key: "snap:" + id, del: true }, { store: "kv", key: "meta", value: metaNext }]); }
  catch (e) { return toast(e.message || "Couldn't delete. Nothing changed."); }
  S.pls.delete(id); S.snaps.delete(id); S.meta.order = order; S.reports.delete(id); announce({ t: "del", id }); toast(`Deleted “${pl.name}”.`); go("#/");
}

/* ---------- global settings ---------- */
function vSettings(v) {
  setTop("Settings", h("span", { text: "Everything is saved in this browser" }), "#/");
  const m = h("main", { class: "wrap" }); v.append(m);
  const ai = h("div", { class: "card" }, h("h2", { class: "sec", text: "AI connections" }), h("p", { class: "lede", text: "Keys stay in this browser and are only sent to that service. Each playlist chooses Classic or AI in its own Settings." }));
  for (const [k, p] of Object.entries(Engines.PROVIDERS)) {
    if (p.wip) { ai.append(h("div", { class: "prov" }, h("div", { class: "nm" }, p.label, h("span", { class: "tag y", text: "Work in progress" })), h("p", { class: "small", text: `Coming next: your own ${k === "claude" ? "Claude" : "ChatGPT"} subscription, with no API key and no extra cost, through a connector in the ${k === "claude" ? "Claude" : "ChatGPT"} app.` }))); continue; }
    const a = S.meta.ai[k] || {}; const key = h("input", { type: "password", autocomplete: "off", placeholder: a.key ? "Key saved · paste a new one to replace it" : "Paste your key", "aria-label": p.label + " key" });
    const stat = h("p", { class: "small", "aria-live": "polite", text: a.key ? `Connected. ${plural((a.models || []).length, "model")} available${a.memo && a.memo.model ? `; answering lately: ${a.memo.model}` : ""}.` : "Not set up" });
    if (a.key && p.quota) p.quota(a.key).then(q => { if (q && document.contains(stat)) stat.textContent += ` ${q.remaining} of ${q.limit} free requests left today.`; });
    const save = async () => { const v2 = key.value.trim() || a.key; if (!v2) return toast("Paste a key first."); stat.textContent = "Checking the key…";
      try { const models = await p.models(v2); if (!models.length) throw new Core.OpError("AI", "That key works but no usable models came back.");
        S.meta.ai[k] = { key: v2, models, model: "auto", memo: {} }; await saveMeta(); stat.textContent = `Key works. Checking which of your ${models.length} models are answering…`;
        if (p.noProbe) { const q = p.quota ? await p.quota(v2) : null; S.meta.ai[k].quota = q ? Object.assign(q, { at: Date.now() }) : null; await saveMeta(); toast(`${p.label.replace(/ \(.*\)/, "")} connected.${q ? ` ${q.remaining} of ${q.limit} free requests left today.` : ""}`, 6000); render(); return; }
        const ctx = aiCtx({ provider: k, model: "auto" }); const m = await Engines.workingModel(ctx, p); toast(`${p.label.replace(/ \(.*\)/, "")} connected. Answering now: ${m}.`, 6000); render(); }
      catch (e) { stat.textContent = e.message || "The key didn't work."; if (S.meta.ai[k] && S.meta.ai[k].key) render(); } };
    ai.append(h("div", { class: "prov" }, h("div", { class: "nm" }, p.label, a.key ? h("span", { class: "tag", text: "Connected" }) : null), h("p", { class: "small" }, p.note + " · ", h("a", { class: "lnk", href: p.keyUrl, target: "_blank", rel: "noopener noreferrer", text: "Get a key ↗" })),
      h("div", { class: "inl" }, key, btn(a.key ? "Check again" : "Save key", "sm", save), a.key ? btn("Remove", "ghost sm", async () => { delete S.meta.ai[k]; await saveMeta().catch(() => {}); toast("Key removed."); render(); }) : null), stat));
  }
  m.append(ai);
  /* Last.fm: optional, with the user's own free key, kept in this browser like the AI keys */
  const lf = (S.meta.keys || {}).lastfm || null;
  const lkey = h("input", { type: "password", autocomplete: "off", placeholder: lf ? "Key saved · paste a new one to replace it" : "Paste your API key", "aria-label": "Last.fm API key" });
  const lstat = h("p", { class: "small", "aria-live": "polite", text: lf ? "Connected. Classic also uses Last.fm listeners' similar artists, similar songs and tags." : "Not set up" });
  const lsave = async () => { const v = lkey.value.trim() || lf; if (!v) return toast("Paste a key first."); lstat.textContent = "Checking the key…";
    try { if (!(await Catalog.LastFm.check(v))) throw new Error("Last.fm didn't answer with that key."); S.meta.keys = Object.assign({}, S.meta.keys, { lastfm: v }); Catalog.SETTINGS.lastfm = v; await saveMeta(); toast("Last.fm connected."); render(); }
    catch (e) { lstat.textContent = e.code === 10 || e.code === 26 ? "That key wasn't accepted. Copy the API key (not the shared secret) from your Last.fm API account page." : (e.message || "Couldn't reach Last.fm. Try again."); } };
  m.append(h("div", { class: "card" }, h("h2", { class: "sec", text: "Last.fm" }),
    h("p", { class: "lede", text: "Optional. With your own free key, Classic also uses what Last.fm listeners play together and how they tag artists, which helps most with smaller and regional artists. The key stays in this browser." }),
    h("div", { class: "prov" }, h("div", { class: "nm" }, "Last.fm API key", lf ? h("span", { class: "tag", text: "Connected" }) : null),
      h("p", { class: "small" }, "Free from your Last.fm account (non-commercial use) · ", h("a", { class: "lnk", href: "https://www.last.fm/api/account/create", target: "_blank", rel: "noopener noreferrer", text: "Get a key ↗" })),
      h("div", { class: "inl" }, lkey, btn(lf ? "Check again" : "Save key", "sm", lsave), lf ? btn("Remove", "ghost sm", async () => { const k = Object.assign({}, S.meta.keys); delete k.lastfm; S.meta.keys = k; Catalog.SETTINGS.lastfm = null; await saveMeta().catch(() => {}); toast("Key removed."); render(); }) : null), lstat)));
  m.append(h("div", { class: "card" }, h("h2", { class: "sec", text: "Never suggest" }), h("p", { class: "lede", text: "Artists no playlist should ever suggest, as lead or featured. Search and pick the artist you mean: they're matched by their IDs on Deezer, MusicBrainz and Apple Music, so other artists who share the name stay allowed. Changes save right away." }),
    banEditor(S.meta.never, { label: "Artists", onchange: () => act(() => saveMeta(), "Saved.") })));
  const cc = h("select", { "aria-label": "Apple Music store", onchange: e => { S.meta.country = e.target.value; Catalog.SETTINGS.country = e.target.value; saveMeta().catch(() => {}); toast("Saved."); } });
  [["us", "United States"], ["pa", "Panamá"], ["mx", "México"], ["es", "España"], ["co", "Colombia"], ["pr", "Puerto Rico"], ["ar", "Argentina"], ["br", "Brasil"], ["gb", "United Kingdom"]].forEach(([k, l]) => { const o = h("option", { value: k, text: l }); if (k === S.meta.country) o.selected = true; cc.append(o); });
  m.append(h("div", { class: "card" }, h("h2", { class: "sec", text: "Search and samples" }), h("div", { class: "field" }, h("label", { text: "Apple Music store (used when Deezer doesn't have a song)" }), cc)));
  const inp = h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: e => { const f = e.target.files[0]; if (f) restoreBackup(f); e.target.value = ""; } });
  m.append(h("div", { class: "card" }, h("h2", { class: "sec", text: "Backup" }), h("p", { class: "lede", text: "Save a copy now and then, or use it to move your playlists to another device. AI and Last.fm keys aren't included." }),
    h("div", { class: "btns" }, btn("Save backup", "", saveBackup, { ic: "dl" }), h("label", { class: "btn ghost", tabindex: "0", onclick: () => inp.click(), onkeydown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } } }, "Restore backup"), inp)));
  const old = h("div", { class: "card" }, h("h2", { class: "sec", text: "From the old app" }));
  const un = (S.meta.unsorted || []).filter(id => getTrack(id));
  if (un.length) { const pid = S.meta.migrated && S.meta.migrated.prendete; old.append(h("p", { class: "lede", text: `${plural(un.length, "song")} from the old app weren't liked, disliked or in a playlist, so they weren't put anywhere.` }));
    const box = h("div"); rowsInto(box, un.map(getTrack), "unsorted", () => ({})); old.append(box);
    old.append(h("div", { class: "btns" }, S.pls.has(pid) ? btn("Add them to Préndete 🔥's recommendations", "", () => act(() => mutate(pid, p => Core.appendCandidates(p, un.map(getTrack), { batchId: "legacy", source: "migrated" }, getTrack)), r => `Added ${r.added.length}.`).then(async r => { if (r) { S.meta.unsorted = []; await saveMeta().catch(() => {}); render(); } })) : null,
      btn("Leave them out", "ghost", async () => { S.meta.unsorted = []; await saveMeta().catch(() => {}); render(); }))); }
  else old.append(h("p", { class: "lede", text: S.meta.migrated ? `Moved on ${new Date(S.meta.migrated.at).toLocaleDateString()}: everything went to a playlist.` : "Nothing to move." }));
  if (S.hasLegacy) old.append(h("div", { class: "btns" }, btn("Download the old app's data", "ghost", async () => { const kv = await DB.all("kv"); const x = kv.find(([k]) => k === "legacy-backup"); if (x) download("prendete-old-app-data.json", JSON.stringify(x[1]), "application/json"); }, { ic: "dl" })));
  m.append(old);
  m.append(h("div", { class: "card" }, h("h2", { class: "sec", text: "Start over" }), h("p", { class: "lede", text: "Erases every playlist, decision and key in this browser. Préndete 🔥 is set up again from its saved copy." + (DB.mode === "ls" ? " (This browser is using simpler storage.)" : "") }),
    btn("Erase everything in this browser", "danger", eraseAll, { ic: "trash" })));
  m.append(h("p", { class: "small", style: "margin-top:20px" }, "Songs and samples from Deezer and Apple Music. Music data from MusicBrainz, ListenBrainz, Discogs, Wikidata, ReccoBeats and LRCLIB", S.meta.keys.lastfm ? h("span", {}, ", and ", h("a", { class: "lnk", href: "https://www.last.fm", target: "_blank", rel: "noopener noreferrer", text: "Last.fm" })) : null, "."));
}
function saveBackup() {
  const meta = clone(S.meta); delete meta.ai; delete meta.keys; /* keys never go in a backup */
  const data = { app: "prendete-mix", v: 3, at: Date.now(), meta, playlists: [...S.pls.values()], snaps: [...S.snaps.entries()], tracks: [...S.tr.values()].map(slimTrack) };
  download(`mixer-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), "application/json"); toast("Backup saved.");
}
/* settings from outside this session (a backup, an old save): keep the right types so no screen trips on them */
function fixMeta(m, defaults = {}) {
  const o = Object.assign({ v: 3, order: [], never: [], country: "us", ai: {}, unsorted: [] }, defaults, m && typeof m === "object" && !Array.isArray(m) ? m : {});
  o.order = Array.isArray(o.order) ? o.order.filter(x => typeof x === "string") : [];
  o.never = Array.isArray(o.never) ? o.never : typeof o.never === "string" ? [o.never] : [];
  o.never = o.never.filter(e => (typeof e === "string" && e.trim()) || (e && typeof e === "object" && typeof e.name === "string" && e.name.trim()));
  if (typeof o.country !== "string" || !/^[a-z]{2}$/.test(o.country)) o.country = "us";
  delete o.autoNext; delete o.loopV; /* the old "play the next sample" setting: samples always repeat now */
  if (!o.ai || typeof o.ai !== "object" || Array.isArray(o.ai)) o.ai = {};
  if (!o.keys || typeof o.keys !== "object" || Array.isArray(o.keys)) o.keys = {}; if (typeof o.keys.lastfm !== "string") delete o.keys.lastfm;
  o.unsorted = Array.isArray(o.unsorted) ? o.unsorted.filter(x => typeof x === "string") : [];
  return o;
}
async function restoreBackup(file) {
  let data; try { data = JSON.parse(await file.text()); } catch { return toast("That file isn't a backup from this app."); }
  if (!data || data.app !== "prendete-mix" || !Array.isArray(data.playlists)) return toast("That file isn't a backup from this app.");
  try { data.playlists.forEach(Core.checkShape); } catch (e) { return toast(`The backup is damaged: ${e.code === "SHAPE" ? e.message : String(e.message || e).replace(/\.$/, "").toLowerCase()}. Nothing changed.`); }
  if (new Set(data.playlists.map(p => p.id)).size !== data.playlists.length) return toast("The backup is damaged: two playlists in it share an ID. Nothing changed.");
  const when = Number.isFinite(new Date(data.at).getTime()) ? new Date(data.at).toLocaleString() : "an unknown date";
  const ok = await confirmSheet({ title: "Restore this backup?", text: `Replaces everything in this browser with the backup from ${when}: ${plural(data.playlists.length, "playlist")}. Your AI keys stay.`, ok: "Replace with backup" }); if (!ok) return;
  for (const j of S.jobs.values()) j.stop = true;
  data.tracks = (Array.isArray(data.tracks) ? data.tracks : []).map(Core.checkTrack).filter(Boolean);
  data.snaps = (Array.isArray(data.snaps) ? data.snaps : []).filter(x => Array.isArray(x) && typeof x[0] === "string" && data.playlists.some(p => p.id === x[0])).filter(([, v]) => { try { Core.checkShape(v); return true; } catch { return false; } });
  const meta = Object.assign(fixMeta(data.meta), { ai: S.meta.ai, keys: S.meta.keys, order: data.playlists.map(p => p.id), bansV2: 1 });
  const ops = [...S.pls.keys()].map(k => ({ store: "kv", key: "pl:" + k, del: true })).concat([...S.snaps.keys()].map(k => ({ store: "kv", key: "snap:" + k, del: true })),
    data.playlists.map(p => ({ store: "kv", key: "pl:" + p.id, value: p })), data.snaps.map(([k, v]) => ({ store: "kv", key: "snap:" + k, value: v })), data.tracks.map(t => ({ store: "tracks", value: t })), [{ store: "kv", key: "meta", value: meta }]);
  try { await DB.tx(ops); } catch (e) { return toast(e.message || "Couldn't restore. Nothing changed."); }
  announce({ t: "reload" }); toast("Backup restored."); setTimeout(() => { location.hash = "#/"; location.reload(); }, 600);
}
async function eraseAll() {
  const ok = await confirmSheet({ title: "Erase everything?", text: "Deletes all playlists, decisions and AI keys in this browser. Save a backup first if you might want them.", ok: "Erase everything" }); if (!ok) return;
  for (const j of S.jobs.values()) j.stop = true; announce({ t: "reload" });
  try { if (DB.mode === "idb") { DB.close(); await new Promise(r => { const q = indexedDB.deleteDatabase("prendete-mix"); q.onsuccess = q.onerror = () => r(); setTimeout(r, 4000); }); } Object.keys(localStorage).filter(k => k.startsWith("pmx:")).forEach(k => localStorage.removeItem(k)); } catch {}
  location.hash = "#/"; location.reload();
}

/* ---------- background jobs (scoped to one playlist; OPS-004..013) ---------- */
function engineFor(pl) {
  const e = pl.engine || { mode: "classic" };
  if (e.mode !== "ai") return { impl: Engines.Classic };
  const p = Engines.PROVIDERS[e.provider];
  if (!p || p.wip) return { err: `${p ? p.label : "That AI connection"} is coming next. For now pick Gemini or OpenRouter, or switch this playlist to Classic.` };
  if (!aiReady(e.provider)) return { err: `Add your ${p.label} key in Settings, or switch this playlist to Classic.` };
  return { impl: Engines.AI, ai: aiCtx(e) };
}
const targetFor = pl => Math.min(40, Math.max(20, Core.counts(pl).available + 10));
function report(id, text, o = {}) {
  S.reports.set(id, Object.assign({ text }, o)); const pl = S.pls.get(id);
  /* while you're typing on that screen the note waits for the next re-draw; a toast says it now */
  if (S.route.v === "pl" && S.route.id === id && !typing()) render(); else if (pl) toast(`${pl.name}: ${text}`, 6000);
}
async function startJob(id, kind) {
  const pl = S.pls.get(id); if (!pl) return; if (S.jobs.has(id)) return toast("Already working on this playlist.");
  const eng = engineFor(pl);
  if (eng.err) return report(id, eng.err, { err: true, action: h("span", {}, h("a", { class: "lnk", href: "#/settings", text: "Open Settings" }), " · ", h("button", { class: "lnk", type: "button", text: "Use Classic for this playlist", onclick: () => act(() => mutate(id, p => { p.engine = { mode: "classic" }; Core.log(p, "engine", { mode: "classic" }); }), "Switched to Classic.").then(() => { S.reports.delete(id); render(); }) })) });
  const job = { kind, msg: kind === "fill" ? "Getting ready to fill…" : "Getting ready…", stop: false, epoch: pl.epoch, found: 0 }; S.jobs.set(id, job); S.reports.delete(id);
  const say = t => { job.msg = t; const e = $("#jobmsg"); if (e && S.route.id === id && !job.stop) e.textContent = t; };
  const ctx = { latest: () => S.pls.get(id) || null, getTrack, never: S.meta.never, saveTracks, ai: eng.ai, stopped: () => job.stop || !S.pls.has(id) };
  refresh(id);
  try {
    if (kind === "fill") {
      const slots = Core.counts(S.pls.get(id)).available;
      const r = await eng.impl.fill(ctx, slots, { onProgress: say, stopped: ctx.stopped });
      if (!S.pls.has(id)) return;
      const why = new Map(r.fresh.map(x => [x.t.id, x.why])); const fresh = new Map(r.fresh.map(x => [x.t.id, x.t]));
      const gt = x => getTrack(x) || fresh.get(x);
      const got = await mutate(id, p => { const a = Core.fillCommit(p, r.picks.concat(r.fresh.map(x => ({ id: x.t.id, isNew: true }))), gt); a.forEach(x => { if (why.get(x)) p.rels[x].why = why.get(x); }); return a; },
        { epoch: job.epoch, tracks: a => a.map(x => fresh.get(x)).filter(Boolean), quiet: true });
      const left = Core.counts(S.pls.get(id)).available;
      const via = eng.ai && eng.ai.used ? ` Model: ${eng.ai.used}.` : "";
      report(id, (got.length ? `Random fill added ${plural(got.length, "song")}${left ? `. ${plural(left, "open spot")} left${got.length < slots ? ": not enough songs that fit turned up, so the rest stay open" : ""}` : ". The playlist is full"}.${(r.missing || []).length ? ` ${plural(r.missing.length, "AI suggestion")} couldn't be found in the catalog and ${r.missing.length === 1 ? "was" : "were"} left out.` : ""}`
        : "Random fill didn't find songs that fit well enough, so nothing was added.") + via);
    } else {
      const batchId = "b" + Date.now().toString(36); const target = targetFor(S.pls.get(id));
      const r = await eng.impl.generate(ctx, { target, onProgress: say, stopped: ctx.stopped,
        onBatch: async list => {
          const nt = new Map(list.map(x => [x.t.id, x])); const gt = x => getTrack(x) || (nt.get(x) && nt.get(x).t);
          const res = await mutate(id, p => { const a = Core.appendCandidates(p, list.map(x => x.t), { batchId, source: kind }, gt); a.added.forEach(x => { if (nt.get(x).why) p.rels[x].why = nt.get(x).why; }); return a; },
            { epoch: job.epoch, tracks: a => a.added.map(x => nt.get(x).t) });
          job.found += res.added.length; return { added: res.added.length, addedIds: res.added };
        } });
      const miss = (r.missing || []).length;
      const stopped = job.stop && S.pls.has(id);
      const via = eng.ai && eng.ai.used ? ` Model: ${eng.ai.used}.` : "";
      report(id, (stopped ? (job.found ? `Stopped. ${plural(job.found, "recommendation")} added.` : "Stopped. Nothing was added.")
        : job.found ? `${plural(job.found, "new recommendation")} added.${miss ? ` ${plural(miss, "AI suggestion")} couldn't be found in the catalog and ${miss === 1 ? "was" : "were"} left out.` : ""}`
        : `No new songs that fit turned up this time. Nothing else changed.${miss ? ` ${plural(miss, "AI suggestion")} couldn't be found in the catalog.` : ""}`) + via);
    }
  } catch (e) {
    if (!S.pls.has(id) || (e && e.code === "GONE")) return;
    const msg = e && e.code === "STALE" ? "The playlist was reset while that was running, so its results were dropped." : e instanceof Core.OpError ? e.message : "Something unexpected went wrong. Try again.";
    report(id, job.found && e.code !== "STALE" ? `${plural(job.found, "new recommendation")} added, then it stopped: ${msg}` : msg, { err: !job.found });
  } finally { S.jobs.delete(id); if (S.pls.has(id)) refresh(id); }
}

/* ---------- quiet background job: language tags for songs already in playlists (lyrics via LRCLIB) ---------- */
/* "Never suggest" lists from before artist IDs. Once: the Settings list keeps only DaBaby (asked for on
   24 Nov 2026). Then plain names are linked to a real artist when one is the clear answer; the rest stay
   plain (exact full-name match only) and the editor offers "Choose the artist". */
async function upgradeBans() {
  const key = e => Core.norm(Artists.nameOf(e)).replace(/\s+/g, "");
  if (!S.meta.bansV2) { const keep = S.meta.never.filter(e => key(e) === "dababy"); S.meta.never.splice(0, S.meta.never.length, ...keep); S.meta.bansV2 = 1; await saveMeta().catch(() => {}); if (S.route && S.route.v === "settings" && !typing()) render(); }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const tried = new Map(); const linkOf = async n => { const k = key(n); if (!tried.has(k)) tried.set(k, await Artists.link(Artists.nameOf(n)).catch(() => null)); return tried.get(k); };
  for (const n of (S.meta.never || []).filter(e => !Artists.isLinked(e))) { const e = await linkOf(n); if (!e) continue; const i = S.meta.never.indexOf(n); if (i >= 0) { S.meta.never[i] = e; await saveMeta().catch(() => {}); } }
  for (const id of [...S.pls.keys()]) { const p = S.pls.get(id); const L = (p && p.direction && p.direction.exclude && p.direction.exclude.artists) || [];
    for (const n of L.filter(e => !Artists.isLinked(e))) { const e = await linkOf(n); if (!e) continue;
      await mutate(id, q => { const M = q.direction.exclude.artists; const i = M.findIndex(x => x === n); if (i >= 0) M[i] = e; }, { quiet: true }).catch(() => {}); } }
  if (S.route && S.route.v === "settings" && !typing()) render();
}
async function backfillLanguages() {
  const ids = new Set(); for (const pl of S.pls.values()) for (const k in pl.rels) if (pl.rels[k].state !== "REJECTED") ids.add(k);
  const need = [...ids].map(getTrack).filter(t => t && !t.lang).slice(0, 400);
  for (let i = 0; i < need.length; i += 4) {
    if (document.hidden || !navigator.onLine || S.jobs.size) { await sleep(5000); i -= 4; continue; }
    await Engines.langsFor(need.slice(i, i + 4), saveTracks, false); await sleep(2500);
  }
}

/* ---------- first run: migrate Préndete (Section 19) ---------- */
async function firstRun() {
  const seed = await fetch("data/seed.json", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error("seed " + r.status); return r.json(); });
  let legacy = null; try { legacy = JSON.parse(localStorage.getItem("prendete-standalone-v1") || "null"); } catch {}
  const out = Migrate.build(seed, legacy);
  const meta = { v: 3, created: Date.now(), order: out.playlists.map(p => p.id), never: out.never, country: out.prefs.country || "us", ai: {}, unsorted: out.unsorted,
    migrated: { at: Date.now(), report: out.report, prendete: out.playlists[0].id, seen: false } };
  const ops = [...out.playlists.map(p => ({ store: "kv", key: "pl:" + p.id, value: p })), ...out.tracks.map(t => ({ store: "tracks", value: t })), { store: "kv", key: "meta", value: meta }];
  if (legacy) ops.push({ store: "kv", key: "legacy-backup", value: legacy });
  await DB.tx(ops);
  S.meta = meta; out.playlists.forEach(p => S.pls.set(p.id, p)); out.tracks.forEach(t => S.tr.set(t.id, t)); S.hasLegacy = !!legacy;
}
/* changes saved in another tab of the app: load them here. Screens re-draw unless you're typing in one. */
function typing() { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !!a.closest("#view, .sheet"); }
async function heard(m) {
  if (!m || !S.meta) return;
  if (m.t === "reload") return setTimeout(() => location.reload(), 800);
  if (m.t === "meta") { const r = await DB.get("kv", "meta"); if (!r.found || !r.value) return; const fresh = fixMeta(r.value);
    for (const k of Object.keys(fresh)) { if (Array.isArray(S.meta[k]) && Array.isArray(fresh[k])) S.meta[k].splice(0, S.meta[k].length, ...fresh[k]); else S.meta[k] = fresh[k]; }
    S.meta.order = S.meta.order.filter(id => S.pls.has(id)); Catalog.SETTINGS.country = S.meta.country;
    if ((S.route.v === "settings" || S.route.v === "home") && !typing()) render(); return; }
  if (m.t === "del") { S.pls.delete(m.id); S.meta.order = S.meta.order.filter(x => x !== m.id); if ((S.route.v === "home" || (S.route.v === "pl" && S.route.id === m.id)) && !typing()) render(); return; }
  if (m.t === "pl") { const r = await DB.get("kv", "pl:" + m.id); if (!r.found || !r.value) return; let pl; try { pl = Core.checkShape(r.value); } catch { return; }
    const missing = Object.keys(pl.rels).filter(x => !S.tr.has(x));
    for (const x of missing) { const t = await DB.get("tracks", x); const ok = t.found && Core.checkTrack(t.value); if (ok) S.tr.set(ok.id, ok); }
    S.pls.set(m.id, pl); if (!S.meta.order.includes(m.id)) S.meta.order.unshift(m.id);
    if (!typing()) refresh(m.id); }
}
if (BC) BC.onmessage = e => { heard(e.data).catch(() => {}); };
/* anything that slips past the app's own error handling still gets said, not swallowed (at most once every 10 s);
   an interrupted or blocked sample isn't an error */
let lastOops = 0;
function oops(e) {
  if (e && /^(AbortError|NotAllowedError|NotSupportedError)$/.test(e.name || "")) return;
  if (typeof console !== "undefined") console.error("[mixer]", e);
  if (Date.now() - lastOops < 10000 || !document.querySelector("#toast")) return; lastOops = Date.now();
  toast(e instanceof Core.OpError ? e.message : "Something went wrong there. Try again; your playlists are saved.", 6000);
}
window.addEventListener("unhandledrejection", e => oops(e.reason));
window.addEventListener("error", e => { if (e.error) oops(e.error); });
async function boot() {
  initPlayer(); $("#gear").innerHTML = I("gear"); $("#gear").onclick = () => go("#/settings"); $("#back").innerHTML = I("back");
  $("#view").replaceChildren(h("main", { class: "wrap" }, h("p", { class: "empty", text: "Loading your playlists…" })));
  await DB.open();
  try {
    const [kv, tr] = await Promise.all([DB.all("kv"), DB.all("tracks")]);
    /* a damaged saved record is skipped (and left in storage) instead of stopping the whole app */
    for (const [k, v] of kv) { try { if (k === "meta") S.meta = v; else if (k.startsWith("pl:")) { Core.checkShape(v); if (v.id !== k.slice(3)) throw new Error("key"); S.pls.set(v.id, v); } else if (k.startsWith("snap:")) S.snaps.set(k.slice(5), Core.checkShape(v)); else if (k === "legacy-backup") S.hasLegacy = true; } catch { if (k.startsWith("pl:")) S.damaged = (S.damaged || 0) + 1; } }
    for (const [, t] of tr) { const ok = Core.checkTrack(t); if (ok) S.tr.set(ok.id, ok); }
    if (!S.meta) await firstRun();
  } catch (e) {
    $("#view").replaceChildren(h("main", { class: "wrap" }, h("div", { class: "note err", text: "Couldn't set up the app: " + (e.message || e) + ". Check your connection and try again." }), btn("Try again", "red", () => location.reload())));
    return;
  }
  const old = S.meta && ("autoNext" in S.meta || "loopV" in S.meta); S.meta = fixMeta(S.meta, { never: ["DaBaby"] }); if (old) saveMeta().catch(() => {});
  S.meta.order = S.meta.order.filter(id => S.pls.has(id)).concat([...S.pls.keys()].filter(id => !S.meta.order.includes(id)));
  Catalog.SETTINGS.country = S.meta.country; Catalog.SETTINGS.lastfm = S.meta.keys.lastfm || null;
  S.route = parseRoute(); render(true);
  setTimeout(backfillLanguages, 4000);
  setTimeout(() => upgradeBans().catch(() => {}), 2500);
  if (DB.mode === "ls") toast("This browser blocks the app's database, so it's using simpler storage with less room. Save backups often.", 7000);
  else if (S.damaged) toast(`${plural(S.damaged, "saved playlist")} ${S.damaged === 1 ? "was" : "were"} damaged and couldn't be opened. ${S.damaged === 1 ? "It stays" : "They stay"} stored; the rest work normally.`, 8000);
}
boot();

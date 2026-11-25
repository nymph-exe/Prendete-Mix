// Acceptance tests from the Master Ruleset (Section 24) that apply to core logic. Hypothetical fixtures only.
const APP = __dirname + "/../../app", DATA = __dirname + "/../../data";
const C = require(__dirname + "/../../app/core.js");
let pass = 0, fail = 0;
const T = (id, name, fn) => { try { fn(); pass++; console.log("ok  ", id, name); } catch (e) { fail++; console.log("FAIL", id, name, "->", e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || "") + " expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); };
const throwsCode = (fn, code) => { try { fn(); } catch (e) { if (e.code === code) return; throw new Error("wrong error " + e.code + " " + e.message); } throw new Error("expected error " + code); };
const tracks = {};
const mk = (n, extra = {}) => { const id = "dz:" + n; tracks[id] = Object.assign({ id, t: "Song " + n, a: "Artist " + (n % 37), dur: 180 + (n % 50), isrc: "USAAA" + String(20 + (n % 6)).padStart(2, "0") + String(n).padStart(5, "0") }, extra); return tracks[id]; };
const get = id => tracks[id];
const P = (cap = 250, name = "Example_1") => C.createPlaylist({ name, method: "ARTISTS_AND_SONGS", direction: {}, capacity: cap });
const fillPending = (pl, from, n) => C.appendCandidates(pl, Array.from({ length: n }, (_, i) => mk(from + i)), { batchId: "b" + from }, get);
const c = pl => C.counts(pl);

T("AT-001/002", "same track has independent states in two playlists", () => {
  const p1 = P(250, "Préndete"), p2 = P(250, "Example_1"); const t = mk(1);
  C.appendCandidates(p1, [t], { batchId: "x" }, get); C.appendCandidates(p2, [t], { batchId: "y" }, get);
  C.approve(p1, [t.id]); C.reject(p2, [t.id]);
  eq([C.stateOf(p1, t.id), C.stateOf(p2, t.id)], ["APPROVED", "REJECTED"]);
  const p3 = P(100, "Example_2"); const r = C.appendCandidates(p3, [t], { batchId: "z" }, get); eq(r.added.length, 1, "still eligible elsewhere");
});
T("AT-003", "new playlist starts clean", () => { const p = P(); eq(c(p), { approved: 0, pending: 0, rejected: 0, available: 250 }); });
T("AT-008", "only must-include songs become members at creation", () => {
  const p = P(50); const ref = mk(10), must = mk(11); C.addMandatory(p, [must.id], get);
  eq(C.stateOf(p, must.id), "APPROVED"); eq(C.stateOf(p, ref.id), null); eq(p.rels[must.id].mandatory, true);
});
T("AT-009", "too many must-includes need resolution", () => { const p = P(10); throwsCode(() => C.addMandatory(p, Array.from({ length: 11 }, (_, i) => mk(100 + i).id), get), "CAPACITY"); eq(c(p).approved, 0, "nothing silently added"); });
T("AT-010", "rejecting a must-include clears the designation", () => { const p = P(10); const m = mk(12); C.addMandatory(p, [m.id], get); C.reject(p, [m.id]); eq([C.stateOf(p, m.id), p.rels[m.id].mandatory], ["REJECTED", false]); C.validate(p); });
T("AT-013", "capacity selector is exactly 10..250 by 10", () => { const o = C.capacityOptions(); eq([o.length, o[0], o[o.length - 1], o.every(x => x % 10 === 0)], [25, 10, 250, true]); });
T("AT-014/015", "a surplus pool beyond capacity is kept whole", () => { const p = P(250); fillPending(p, 1000, 340); eq(c(p).pending, 340); });
T("AT-016/017", "rejected and evaluated history beyond 250 is kept", () => { const p = P(250); fillPending(p, 2000, 700); C.reject(p, C.idsIn(p, "PENDING").slice(0, 300)); eq([c(p).rejected, c(p).pending], [300, 400]); });
T("AT-018", "approved count is not rounded", () => { const p = P(200); fillPending(p, 3000, 180); C.approve(p, C.idsIn(p, "PENDING").slice(0, 173)); eq(c(p).approved, 173); });
T("AT-019", "raising capacity after completion keeps everything", () => { const p = P(200); fillPending(p, 3500, 50); C.approve(p, C.idsIn(p, "PENDING").slice(0, 20)); C.setStatus(p, "COMPLETED"); C.setCapacity(p, 250); eq([p.status, c(p).approved, c(p).pending], ["COMPLETED", 20, 30]); });
T("AT-020", "lowering capacity below membership requires intentional removal", () => {
  const p = P(250); fillPending(p, 4000, 236); C.approve(p, C.idsIn(p, "PENDING"));
  throwsCode(() => C.setCapacity(p, 200), "EXCESS"); eq([p.capacity, c(p).approved], [250, 236], "no silent deletion");
  const rm = p.order.slice(0, 36); C.setCapacity(p, 200, rm, { reason: "Prefer another song" }); eq([p.capacity, c(p).approved, c(p).rejected], [200, 200, 36]); C.validate(p);
});
T("AT-021/022", "rejecting pending keeps capacity; removing approved frees a spot", () => {
  const p = P(50); fillPending(p, 5000, 5); const [a, b] = C.idsIn(p, "PENDING"); C.reject(p, [a]); eq([p.capacity, c(p).approved], [50, 0]);
  C.approve(p, [b]); C.reject(p, [b]); eq([p.capacity, c(p).available, C.stateOf(p, b)], [50, 50, "REJECTED"]);
});
T("AT-025", "approving one song doesn't touch anything else", () => { const p = P(50); fillPending(p, 5100, 3); const ids = C.idsIn(p, "PENDING"); C.approve(p, [ids[0]]); eq([c(p).approved, c(p).pending, p.batches.length], [1, 2, 1]); });
T("AT-026/027", "batch approval is exact or refused", () => {
  const p = P(30); fillPending(p, 5200, 40); const ids = C.idsIn(p, "PENDING"); C.approve(p, ids.slice(0, 20), C.ORIGIN.BATCH); eq(c(p).approved, 20);
  throwsCode(() => C.approve(p, ids.slice(20, 40), C.ORIGIN.BATCH), "CAPACITY"); eq(c(p).approved, 20, "no subset chosen");
});
T("AT-028/029/031", "feedback is optional and stays with the playlist", () => { const p = P(); fillPending(p, 5300, 3); const [a, b] = C.idsIn(p, "PENDING"); C.reject(p, [a]); C.reject(p, [b], { reason: "Too mellow", text: "needs more punch" }); eq([p.rels[a].reason, p.rels[b].reason, p.rels[b].text], [undefined, "Too mellow", "needs more punch"]); });
T("AT-030", "batch rejection with a shared reason affects only the selection", () => { const p = P(); fillPending(p, 5400, 20); const ids = C.idsIn(p, "PENDING"); C.reject(p, ids.slice(0, 15), { reason: "Overplayed" }); eq([c(p).rejected, c(p).pending], [15, 5]); });
T("AT-032", "removal uses the same rejected state", () => { const p = P(); fillPending(p, 5500, 1); const [a] = C.idsIn(p, "PENDING"); C.approve(p, [a]); C.reject(p, [a]); eq([C.stateOf(p, a), p.rels[a].from, p.order.includes(a)], ["REJECTED", "APPROVED", false]); });
T("AT-033/034/035/036", "restoration to recommendations or playlist", () => {
  const p = P(10); fillPending(p, 5600, 12); const ids = C.idsIn(p, "PENDING"); C.reject(p, [ids[0], ids[1]], { reason: "Too slow" });
  C.restore(p, ids[0], "PENDING"); eq([C.stateOf(p, ids[0]), p.rels[ids[0]].reason], ["PENDING", undefined]);
  C.restore(p, ids[1], "APPROVED"); eq(C.stateOf(p, ids[1]), "APPROVED");
  C.approve(p, ids.slice(2, 11)); eq(c(p).available, 0); C.reject(p, [ids[11]]); throwsCode(() => C.restore(p, ids[11], "APPROVED"), "CAPACITY"); eq(c(p).approved, 10, "no eviction");
  const r = C.appendCandidates(p, [tracks[ids[0]]], { batchId: "again" }, get); eq(r.added.length, 0, "restored-to-pending isn't duplicated");
});
T("AT-040", "recalibration appends and keeps the old pool", () => { const p = P(); fillPending(p, 6000, 250); const before = C.idsIn(p, "PENDING"); fillPending(p, 7000, 100); eq(c(p).pending, 350); eq(before.every(id => C.stateOf(p, id) === "PENDING"), true); });
T("AT-041/042", "recalibration works when full and when completed", () => { const p = P(10); fillPending(p, 7200, 10); C.approve(p, C.idsIn(p, "PENDING")); C.setStatus(p, "COMPLETED"); fillPending(p, 7300, 5); eq([c(p).approved, c(p).pending, p.status], [10, 5, "COMPLETED"]); });
T("AT-043/044/045", "dedupe against pending, approved and rejected", () => {
  const p = P(); fillPending(p, 7400, 3); const [a, b, r] = C.idsIn(p, "PENDING"); C.approve(p, [b]); C.reject(p, [r]);
  const res = C.appendCandidates(p, [tracks[a], tracks[b], tracks[r]], { batchId: "dup" }, get); eq([res.added.length, res.dupes, res.rejectedSkip], [0, 2, 1]);
});
T("POLICY", "same recording merges; clean vs explicit and remixes stay separate", () => {
  const p = P(); const single = mk(8000, { t: "Fuego", a: "Artist X", isrc: "USABC2400001", exp: "explicit", dur: 200 });
  C.appendCandidates(p, [single], { batchId: "s" }, get);
  const album = mk(8001, { t: "Fuego (Remastered 2025)", a: "Artist X", isrc: "USABC2500999", exp: "explicit", dur: 201 });
  const clean = mk(8002, { t: "Fuego", a: "Artist X", isrc: "USABC2400002", exp: "clean", dur: 200 });
  const remix = mk(8003, { t: "Fuego (Remix)", a: "Artist X; Artist Y", isrc: "USABC2400003", exp: "explicit", dur: 230 });
  const sameIsrc = mk(8004, { t: "Fuego - Single", a: "Artist X", isrc: "USABC2400001", exp: "explicit" });
  const r = C.appendCandidates(p, [album, clean, remix, sameIsrc], { batchId: "v" }, get);
  eq(r.added.sort(), [clean.id, remix.id].sort(), "remaster + same ISRC merged; clean & remix kept");
});
T("AT-051/052/053", "random fill is capped at open spots", () => {
  const p = P(200); fillPending(p, 9000, 175); C.approve(p, C.idsIn(p, "PENDING")); fillPending(p, 9200, 60);
  const got = C.fillCommit(p, C.idsIn(p, "PENDING").map(id => ({ id })), get); eq([got.length, c(p).approved, c(p).pending], [25, 200, 35]);
  eq(C.fillCommit(p, C.idsIn(p, "PENDING").map(id => ({ id })), get).length, 0, "full playlist adds nothing");
});
T("AT-054", "fill with too few suitable songs adds what it can", () => { const p = P(200); fillPending(p, 9400, 18); const got = C.fillCommit(p, C.idsIn(p, "PENDING").map(id => ({ id })), get); eq([got.length, c(p).available], [18, 182]); });
T("AT-055/056/057", "fill uses pending or new songs; unselected pending survive", () => {
  const p = P(10); fillPending(p, 9500, 8); const ids = C.idsIn(p, "PENDING"); const nw = mk(9600);
  C.fillCommit(p, [{ id: ids[0] }, { id: nw.id, isNew: true }], get);
  eq([C.stateOf(p, ids[0]), C.stateOf(p, nw.id), p.rels[nw.id].origin, c(p).pending], ["APPROVED", "APPROVED", "DELEGATED_RANDOM_FILL", 7]);
});
T("AT-058", "a removed auto-filled song is never re-filled", () => { const p = P(10); fillPending(p, 9700, 2); const [a] = C.idsIn(p, "PENDING"); C.fillCommit(p, [{ id: a }], get); C.reject(p, [a]); eq(C.fillCommit(p, [{ id: a }], get).length, 0); });
T("AT-059/062/064/065/066", "completion is a declared status only", () => {
  const p = P(250, "Préndete"); fillPending(p, 10000, 556); C.approve(p, C.idsIn(p, "PENDING").slice(0, 236)); C.reject(p, C.idsIn(p, "PENDING").slice(0, 85));
  C.setStatus(p, "COMPLETED"); eq([c(p).approved, c(p).pending, c(p).rejected, p.status, p.capacity], [236, 235, 85, "COMPLETED", 250]);
});
T("AT-063", "full but in progress is valid", () => { const p = P(10); fillPending(p, 11000, 10); C.approve(p, C.idsIn(p, "PENDING")); eq(p.status, "IN_PROGRESS"); C.validate(p); });
T("AT-067/069/070", "editing a completed playlist doesn't reopen it", () => {
  const p = P(250); fillPending(p, 12000, 250); C.approve(p, C.idsIn(p, "PENDING")); C.setStatus(p, "COMPLETED");
  C.reject(p, p.order.slice(0, 14)); C.setCapacity(p, 240); C.reorder(p, p.order[5], 0); eq([c(p).approved, c(p).rejected, p.status], [236, 14, "COMPLETED"]);
});
T("AT-068", "reopening keeps the data", () => { const p = P(); fillPending(p, 13000, 5); C.setStatus(p, "COMPLETED"); C.setStatus(p, "IN_PROGRESS"); eq([p.status, c(p).pending], ["IN_PROGRESS", 5]); });
T("AT-073/075", "editing direction preserves decisions by default", () => { const p = P(); fillPending(p, 14000, 4); const ids = C.idsIn(p, "PENDING"); C.approve(p, [ids[0]]); C.reject(p, [ids[1]]); C.editDirection(p, { text: "new" }); eq([C.stateOf(p, ids[0]), C.stateOf(p, ids[1]), c(p).pending], ["APPROVED", "REJECTED", 2]); });
T("AT-077/078", "reset clears active decisions but keeps must-includes", () => {
  const p = P(); const must = mk(15000); C.addMandatory(p, [must.id], get); fillPending(p, 15001, 6); const ids = C.idsIn(p, "PENDING"); C.approve(p, [ids[0]]); C.reject(p, [ids[1]]); C.setStatus(p, "COMPLETED");
  const ep = p.epoch; C.editDirection(p, { text: "fresh" }, { reset: true });
  eq([c(p).approved, c(p).pending, c(p).rejected, p.status, p.epoch > ep], [1, 0, 0, "IN_PROGRESS", true]);
  eq(C.appendCandidates(p, [tracks[ids[1]]], { batchId: "after" }, get).added.length, 1, "old rejection no longer active");
});
T("AT-079/081", "reordering only changes order", () => { const p = P(); fillPending(p, 16000, 3); C.approve(p, C.idsIn(p, "PENDING")); const st = JSON.stringify(c(p)); const last = p.order[2]; C.reorder(p, last, 0); eq([p.order[0], JSON.stringify(c(p))], [last, st]); });
T("AT-090", "repeating an approval doesn't duplicate", () => { const p = P(); fillPending(p, 17000, 1); const [a] = C.idsIn(p, "PENDING"); C.approve(p, [a]); C.approve(p, [a]); eq([c(p).approved, p.order.length], [1, 1]); });
T("APP-011", "rejected songs can't be approved without restoring", () => { const p = P(); fillPending(p, 18000, 1); const [a] = C.idsIn(p, "PENDING"); C.reject(p, [a]); throwsCode(() => C.approve(p, [a]), "REJECTED"); });
T("INV", "validate catches a broken order", () => { const p = P(); fillPending(p, 19000, 2); C.approve(p, C.idsIn(p, "PENDING")); p.order.push(p.order[0]); throwsCode(() => C.validate(p), "INVARIANT"); });
T("ISRC", "ISRC year", () => eq([C.isrcYear("USCM51100104"), C.isrcYear("USUG12408493"), C.isrcYear("x")], [2011, 2024, null]));
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1;

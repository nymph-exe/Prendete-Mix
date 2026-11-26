"""Artist similarity from ListenBrainz listening data (CC0), computed ahead of time.

Input: the ListenBrainz statistics dump's artists_all_time.jsonl, reduced by lbsim_extract.py to one line per user:
  user_id <TAB> mbid|listen_count|name <TAB> ...   (their all-time top artists, most played first, up to 300)
Two artists are similar when the same listeners have both near the top of their all-time lists: cosine similarity of
artists over listeners, each artist weighted by its place in the listener's list (1/log2(place+1)) and each listener's
list scaled to the same total, shrunk when few listeners share them. (Tried against weighting by listen counts on ten
artists: place weights kept heavy listeners and fan bases of one star from pulling in unrelated artists.) Output: data/similar/NN.json,
256 shards keyed by a hash of the artist's name, so the app loads only the shard a starting artist needs.
Each entry: name key → [name, listeners, [[similar artist, score], ...], MusicBrainz ID].
Run: python3 dev/tools/lbsim.py artists.tsv data/similar
"""
import sys, os, json, math, time, unicodedata, re
import numpy as np, scipy.sparse as sp

MIN_USERS = 8      # an artist needs this many listeners with it in their top 300
TOP = 16           # neighbors kept per artist
SHRINK = 10        # cosine * shared / (shared + SHRINK)
PER_USER = 200     # each listener's top artists used

def key(name):  # the same as simKey in app/catalog.js: lower case, accents off, "&" as "and", only letters, digits and "$"
    s = unicodedata.normalize("NFKD", name.lower()); s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return "".join(c for c in s.replace("&", "and") if c.isalnum() or c == "$")

def shard(k):  # FNV-1a, 32-bit, mod 256 (same as the app)
    h = 0x811c9dc5
    for ch in k.encode("utf8"): h = ((h ^ ch) * 0x01000193) & 0xffffffff
    return h % 256

def main(src, out):
    t0 = time.time(); idx, names, users = {}, [], []
    # pass 1: who each artist is and how many listeners have them (two passes keep memory low)
    with open(src, encoding="utf8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")[1:PER_USER + 1]
            if len(parts) < 10: continue
            for p in parts:
                mb, _, n = (p.split("|", 2) + ["", ""])[:3]
                if not mb: continue
                i = idx.get(mb)
                if i is None: i = idx[mb] = len(names); names.append(n); users.append(0)
                users[i] += 1
    users = np.array(users); keep = np.where(users >= MIN_USERS)[0]; col = -np.ones(len(names), dtype=np.int64); col[keep] = np.arange(len(keep))
    # pass 2: listener x artist weights
    ri, ci, w = [], [], []; nrow = 0
    with open(src, encoding="utf8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")[1:PER_USER + 1]
            if len(parts) < 10: continue
            row = []
            for place, p in enumerate(parts):
                mb = p.split("|", 1)[0]; j = col[idx[mb]] if mb in idx else -1
                if j >= 0: row.append((j, 1 / math.log2(place + 2)))
            if row:
                nrm = math.sqrt(sum(v * v for _, v in row))
                for j, v in row: ri.append(nrow); ci.append(j); w.append(v / nrm)
            nrow += 1
    rows = range(nrow)
    print(f"{nrow} listeners, {len(names)} artists, {len(keep)} with {MIN_USERS}+ listeners ({time.time() - t0:.0f}s)", flush=True)
    X = sp.csr_matrix((np.array(w, dtype=np.float32), (np.array(ri, dtype=np.int32), np.array(ci, dtype=np.int32))), shape=(nrow, len(keep))); del ri, ci, w
    B = X.copy(); B.data[:] = 1
    norm = np.sqrt(np.asarray(X.multiply(X).sum(0)).ravel()) + 1e-9; Xn = (X @ sp.diags(1 / norm)).tocsc().astype(np.float32); Bc = B.tocsc()
    XnT, BT = Xn.T.tocsr(), Bc.T.tocsr()
    print(f"matrix {X.shape}, {X.nnz} entries ({time.time() - t0:.0f}s)", flush=True)
    A = len(keep); nb = np.zeros((A, TOP), dtype=np.int32); sc = np.zeros((A, TOP), dtype=np.float32); CH = 800
    for s0 in range(0, A, CH):
        s1 = min(A, s0 + CH)
        S = (XnT[s0:s1] @ Xn).toarray(); Co = (BT[s0:s1] @ Bc).toarray()
        S *= Co / (Co + SHRINK); S[np.arange(s1 - s0), np.arange(s0, s1)] = 0
        top = np.argpartition(-S, TOP, axis=1)[:, :TOP]; vals = np.take_along_axis(S, top, 1); o = np.argsort(-vals, 1)
        nb[s0:s1] = np.take_along_axis(top, o, 1); sc[s0:s1] = np.take_along_axis(vals, o, 1)
        if (s0 // CH) % 10 == 0: print(f"  {s1}/{A} ({time.time() - t0:.0f}s)", flush=True)
    os.makedirs(out, exist_ok=True); shards = [dict() for _ in range(256)]
    kept_names = [names[i] for i in keep]; kept_users = users[keep]; inv = {i: mb for mb, i in idx.items()}; mbids = [inv[i] for i in keep]
    for a in range(A):
        k = key(kept_names[a])
        if not k: continue
        d = shards[shard(k)]
        if k in d and d[k][1] >= kept_users[a]: continue  # same name: the artist more listeners have
        d[k] = [kept_names[a], int(kept_users[a]), [[kept_names[b], round(float(v), 3)] for b, v in zip(nb[a], sc[a]) if v > 0.02], mbids[a]]
    total = 0
    for i, d in enumerate(shards):
        txt = json.dumps(d, ensure_ascii=False, separators=(",", ":")); total += len(txt.encode("utf8"))
        open(os.path.join(out, f"{i:02x}.json"), "w", encoding="utf8").write(txt)
    print(f"{sum(len(d) for d in shards)} artists in 256 shards, {total / 1e6:.1f} MB ({time.time() - t0:.0f}s)", flush=True)

if __name__ == "__main__": main(sys.argv[1], sys.argv[2])

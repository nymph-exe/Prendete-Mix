"""Genre family tree for Classic, from MusicBrainz's genre relationships (CC0).

MusicBrainz records which genres are subgenres of others ("jazz rap" is a subgenre of "hip hop") and which
began as a fusion of others. Classic uses this to see that an artist tagged "jazz rap" fits a request for hip hop.
"Influenced by" links are left out: a genre influenced by jazz is not jazz.

Input: the genre tables from the MusicBrainz database dump (data.metabrainz.org, fullexport/<date>/mbdump.tar.bz2).
Only five small tables are needed; tar can pull them out while the 7 GB download streams past:
    curl -s <url>/mbdump.tar.bz2 | tar -xjf - --occurrence=1 mbdump/genre mbdump/genre_alias mbdump/l_genre_genre mbdump/link mbdump/link_type
Optionally, Wikidata's "subclass of" links for genres MusicBrainz gives no parent (a SPARQL result as JSON,
query in WIKIDATA_QUERY below) fill gaps.

Run:  python3 dev/tools/genretree.py <mbdump dir> data/genretree.js [wikidata.json]
"""
import json, sys, collections

WIKIDATA_QUERY = "SELECT ?mb ?pmb WHERE { ?g wdt:P8052 ?mb . ?g wdt:P279 ?p . ?p wdt:P8052 ?pmb . }"

def rows(path):
    with open(path, encoding="utf8") as f:
        for line in f: yield line.rstrip("\n").split("\t")

def main(src, out, wd=None):
    gname = {r[0]: r[2] for r in rows(f"{src}/genre")}; gmbid = {r[1]: r[2] for r in rows(f"{src}/genre")}
    types = {r[0]: r[6] for r in rows(f"{src}/link_type") if r[4] == "genre" and r[5] == "genre"}
    ltype = {r[0]: types.get(r[1]) for r in rows(f"{src}/link")}
    parents, fusion = collections.defaultdict(set), collections.defaultdict(set)
    for r in rows(f"{src}/l_genre_genre"):
        t, a, b = ltype.get(r[1]), gname.get(r[2]), gname.get(r[3])
        if not a or not b or a == b: continue
        if t == "subgenre": parents[b].add(a)          # entity0 has subgenre entity1
        elif t == "fusion of": fusion[a].add(b)        # entity0 is a fusion of entity1
    added = 0
    if wd:
        for x in json.load(open(wd))["results"]["bindings"]:
            c, p = gmbid.get(x["mb"]["value"]), gmbid.get(x["pmb"]["value"])
            if c and p and c != p and c not in parents and c not in fusion: parents[c].add(p); added += 1
    # alternative spellings MusicBrainz knows for a genre ("hip-hop", "rnb"), for tags written that way
    alias = {}
    for r in rows(f"{src}/genre_alias"):
        g, a = gname.get(r[1]), r[2].strip().lower()
        if g and a and a != g and len(a) > 1: alias[a] = g
    tree = {"p": {k: sorted(v) for k, v in sorted(parents.items())}, "f": {k: sorted(v) for k, v in sorted(fusion.items())}, "a": dict(sorted(alias.items()))}
    with open(out, "w", encoding="utf8") as f:
        f.write("/* Genre family tree from MusicBrainz (CC0), built by dev/tools/genretree.py.\n"
                "   p: genre → the genres it is a subgenre of; f: genre → the genres it began as a fusion of; a: other spelling → genre */\n")
        f.write("(function (G) { const T = " + json.dumps(tree, ensure_ascii=False, separators=(",", ":")) + ";\n"
                "  if (typeof module !== \"undefined\") module.exports = T; else G.GENRE_TREE = T; })(typeof window !== \"undefined\" ? window : globalThis);\n")
    print(f"{len(parents)} genres with parents ({added} from Wikidata), {len(fusion)} fusions, {len(alias)} other spellings → {out}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)

# MIXER

A playlist maker that runs entirely in the browser: https://nymph-exe.github.io/Prendete-Mix/

Internally it's still the Préndete app, named after the playlist that started it (Préndete 🔥).

Each playlist has its own direction, capacity, recommendations, rejections and status. Nothing is shared between playlists. Data lives in this browser (IndexedDB); Settings → Save backup keeps a copy or moves it to another device.

## Recommendations

- **Classic**: no AI and no keys. Described below.
- **AI**: Google Gemini or OpenRouter with your own free key. Every suggestion is looked up on Deezer / Apple Music before it's added. Claude and ChatGPT subscriptions are a work in progress.
- **Never suggest** lists hold real artists, not text: you search and pick the one you mean. Each is matched by its IDs on Deezer, MusicBrainz and Apple Music (linked through Wikidata and MusicBrainz, with duplicate profiles confirmed by recording codes), so other artists who share the name stay allowed.

## How Classic works

**Reading the request.** A typed description (English or Spanish, and genre or language words in Japanese, Korean, Chinese, Russian, Arabic and Hindi script) is read with built-in rules: 2,000+ genre names (the MusicBrainz genre list), moods, tempo, years ("nothing after 2010"), languages, artists, songs and exclusions. Song lists pasted as "Title - Artist" are read as songs. It can start from anything: genres, moods, artists, songs, a year, a language or an occasion, and it says when parts of a request pull in opposite directions.

**The scene map** (about 580 scenes, 11,000 artists):
- *Curated core* (`data/scenes.js`, IDs in `data/scenes.ids.js`): 184 scenes, from emo, tango and gospel to plena panameña, deutschrap, Michigan street rap, Monterrey cumbia, jazz rap and cumbia rap, each with the artists who define it and the newer or deeper names that carry it, how scenes connect, and novelty acts to skip. Subgenre scenes need to be named, so a plain "rock" means the broad scenes; regional scenes answer a plain "hip hop" only when the request points there.
- *Wide tier* (`data/scenes.wide.js`): 3,900 more artists Deezer relates to several of a scene's core artists. It widens the search but never decides which scenes a request is about.
- *Auto tier* (`data/scenes.auto.js`): a small scene for 399 genres the core doesn't cover (acid house, psychobilly, cumbia peruana, chicano rap…), from the artists behind songs ListenBrainz listeners tagged with the genre. Used only when a request names the genre.

**Shape of the playlist.** Starting points far apart (three songs from three different worlds) are built in parts, each with its share, so one world can't crowd out another. A fusion ("jazz-influenced hip hop") stays one playlist: a genre that names the mix leads, and songs whose artists carry both sounds rank first. Several named styles take turns. A starting song by an artist no service knows brings in their other songs and any artist named in their titles or credits; niche starting songs keep the picks niche.

**Finding and checking songs.** Songs come from Deezer (related artists, artist radios, playlists) and ListenBrainz (similar artists, songs played together, songs tagged with a genre). Similar artists come first from a table built ahead of time from ListenBrainz's listening data (`data/similar/`, below), so no request is needed for 98,000 artists. Every artist is checked against MusicBrainz/ListenBrainz tags, Wikidata and Discogs styles so picks stay in the requested style; MusicBrainz's genre family tree says which genres are kinds of others ("jazz rap" is hip hop, "cubatón" is reggaeton). Artists no database knows yet are heard instead: a model trained on 400 Discogs styles listens to a song preview in the browser. Release years come from first releases, since Deezer often gives a compilation's year; style-named compilation acts and generic sleep or spa music are never picked. Energy, tempo and mood come from ReccoBeats, or for songs too new for it, from **Listen**: the app analyzes the 30-second preview with Meyda (MIT) and a small model fitted on 426 songs (energy r = 0.82). LRCLIB lyrics tell each song's language (read with franc, by parts, so a song in two languages shows both); without lyrics, the artist's country, scene and song titles stand in. A local scene stays local, and artists from a scene sung in another language rank lower unless the request points there. Each playlist's approvals and rejections tune what comes next.

## Repo layout

GitHub Pages publishes `index.html`, `app/`, `data/` and `vendor/`. `dev/` stays in the repo and off the live site (`_config.yml`).

| Path | What it is |
|---|---|
| `index.html` | The app's page |
| `app/core.js` | Playlist rules: song states, capacity, operations, identity, invariants |
| `app/catalog.js` | Deezer, Apple Music, MusicBrainz, ListenBrainz, Discogs, Wikidata, ReccoBeats, LRCLIB |
| `app/reader.js` | Classic's description reader |
| `app/artists.js` | "Never suggest": finds the artist on each service and matches songs by artist ID |
| `app/engines.js` | Classic and AI recommendation engines |
| `app/listen.js` | Listen: energy, danceability, mood and tempo estimated from a song's preview |
| `app/sound.js` | Styles heard from a song's preview: Discogs-EffNet on ONNX Runtime Web, loaded only when needed |
| `app/migrate.js` | Moves Préndete 🔥 from the old single-playlist app |
| `app/ui.js`, `app/views.js`, `app/main.js` | Interface, storage, jobs |
| `data/genres.js` | MusicBrainz genre list (CC0) |
| `data/genretree.js` | MusicBrainz genre family tree: subgenres, fusions, other spellings (CC0) |
| `data/similar/` | Similar artists for 98,000 artists from ListenBrainz listening data (CC0), 256 files by name; a lookup loads one |
| `data/scenes*.js` | The scene map: curated core, Deezer IDs, wide tier, auto tier |
| `data/seed.json` | Préndete 🔥's saved songs, used once on first run |
| `vendor/meyda.min.js` | Meyda 5.6.3 audio features (MIT) |
| `vendor/franc.min.js` | franc 6.2.0 language detection (MIT) |
| `vendor/ort/` | ONNX Runtime Web 1.31.1, single-threaded WebAssembly build (MIT) |
| `vendor/models/` | Discogs-EffNet (MTG, Universitat Pompeu Fabra), CC BY-NC-ND 4.0: non-commercial use only |
| `dev/tests/` | `node dev/tests/<name>.test.js`: core rules, reader, genre matching, robustness, "Never suggest", similar artists, Listen (`npm install meyda` first) |
| `dev/tools/kbwide.js` | `node dev/tools/kbwide.js` rebuilds the wide tier from Deezer's related artists |
| `dev/tools/kbauto.js` | `node dev/tools/kbauto.js` rebuilds the auto tier from ListenBrainz genre tags and Deezer |
| `dev/tools/lbsim.py` | Rebuilds `data/similar/` from the ListenBrainz statistics dump (how-to in the file) |
| `dev/tools/genretree.py` | Rebuilds `data/genretree.js` from five tables of the MusicBrainz database dump (how-to in the file) |

## Data and licenses

- MusicBrainz and ListenBrainz data (genre list, genre tree, listening statistics) are CC0, from the MetaBrainz Foundation.
- Discogs-EffNet is © Music Technology Group, Universitat Pompeu Fabra, under CC BY-NC-ND 4.0 and used unchanged. Because of that license the app is non-commercial; a commercial version would need MTG's proprietary license or a different model. essentia.js itself is AGPL and isn't used: the app computes the model's input in its own code.
- franc, Meyda and ONNX Runtime Web are MIT; their licenses are in `vendor/`.

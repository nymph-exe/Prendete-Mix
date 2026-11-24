# Préndete Mix

A playlist maker that runs entirely in the browser: https://nymph-exe.github.io/Prendete-Mix/

Each playlist has its own direction, capacity, recommendations, rejections and status. Nothing is shared between playlists.

- **Classic** recommendations: reads a typed description (English or Spanish) with built-in rules and recognizes 2,000+ genre names (the MusicBrainz genre list). It finds songs through Deezer related artists, artist radios, charts and editorial playlists, plus ListenBrainz listening data (similar artists, songs played together, songs tagged with a genre). Every candidate artist is checked against MusicBrainz community genre tags so picks stay in the requested style. ReccoBeats audio features (energy, tempo, mood) and LRCLIB lyrics (language) do the rest. Tuned by what you approve and reject in that playlist.
- **AI** recommendations: Google Gemini or OpenRouter with your own free key. Every suggestion is looked up in Deezer / Apple Music before it's added. Claude and ChatGPT subscriptions are a work in progress.
- Data lives in this browser (IndexedDB). Use Settings → Save backup to keep a copy or move devices.

| File | What it does |
|---|---|
| `core.js` | Playlist rules: song states, capacity, operations, identity, invariants |
| `catalog.js` | Deezer, Apple Music, MusicBrainz, ListenBrainz (similar artists and songs, genre tags), ReccoBeats, LRCLIB (lyrics → language) |
| `reader.js` | Classic's description reader (genres, styles, moods, BPM, years, languages, artists, songs, exclusions) |
| `genres.js` | MusicBrainz genre list (CC0), so descriptions can name any genre |
| `engines.js` | Classic and AI recommendation engines |
| `migrate.js` | Moves Préndete 🔥 from the old single-playlist app |
| `ui.js`, `views.js`, `main.js` | Interface, storage, jobs |
| `seed.json` | Préndete 🔥's saved songs, used once on first run |
| `tests/core.test.js` | `node tests/core.test.js` checks the rules against the ruleset's acceptance tests |
| `tests/reader.test.js` | `node tests/reader.test.js` checks the description reader |
| `tests/style.test.js` | `node tests/style.test.js` checks Classic's genre matching |

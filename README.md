# Préndete Mix

A playlist maker that runs entirely in the browser: https://nymph-exe.github.io/Prendete-Mix/

Each playlist has its own direction, capacity, recommendations, rejections and status. Nothing is shared between playlists.

- **Classic** recommendations: reads a typed description (English or Spanish) with built-in rules, then uses Deezer related artists, charts and editorial playlists, ListenBrainz similar artists, ReccoBeats audio features (energy, tempo, mood) and LRCLIB lyrics to tell each song's language. Tuned by what you approve and reject in that playlist.
- **AI** recommendations: Google Gemini or OpenRouter with your own free key. Every suggestion is looked up in Deezer / Apple Music before it's added. Claude and ChatGPT subscriptions are a work in progress.
- Data lives in this browser (IndexedDB). Use Settings → Save backup to keep a copy or move devices.

| File | What it does |
|---|---|
| `core.js` | Playlist rules: song states, capacity, operations, identity, invariants |
| `catalog.js` | Deezer, Apple Music, MusicBrainz, ListenBrainz, ReccoBeats, LRCLIB (lyrics → language) |
| `reader.js` | Classic's description reader (genres, moods, BPM, years, languages, artists, songs, exclusions) |
| `engines.js` | Classic and AI recommendation engines |
| `migrate.js` | Moves Préndete 🔥 from the old single-playlist app |
| `ui.js`, `views.js`, `main.js` | Interface, storage, jobs |
| `seed.json` | Préndete 🔥's saved songs, used once on first run |
| `tests/core.test.js` | `node tests/core.test.js` checks the rules against the ruleset's acceptance tests |
| `tests/reader.test.js` | `node tests/reader.test.js` checks the description reader |

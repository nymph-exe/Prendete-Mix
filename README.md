# Préndete Mix

A playlist maker that runs entirely in the browser: https://nymph-exe.github.io/Prendete-Mix/

Each playlist has its own direction, capacity, recommendations, rejections and status. Nothing is shared between playlists.

- **Classic** recommendations: Deezer related artists and charts, ListenBrainz similar artists, ReccoBeats audio features (energy, tempo, mood), tuned by what you approve and reject in that playlist.
- **AI** recommendations: Google Gemini or OpenRouter with your own free key. Every suggestion is looked up in Deezer / Apple Music before it's added. Claude and ChatGPT subscriptions are a work in progress.
- Data lives in this browser (IndexedDB). Use Settings → Save backup to keep a copy or move devices.

| File | What it does |
|---|---|
| `core.js` | Playlist rules: song states, capacity, operations, identity, invariants |
| `catalog.js` | Deezer, Apple Music, MusicBrainz, ListenBrainz, ReccoBeats |
| `engines.js` | Classic and AI recommendation engines |
| `migrate.js` | Moves Préndete 🔥 from the old single-playlist app |
| `ui.js`, `views.js`, `main.js` | Interface, storage, jobs |
| `seed.json` | Préndete 🔥's saved songs, used once on first run |
| `tests/core.test.js` | `node tests/core.test.js` checks the rules against the ruleset's acceptance tests |

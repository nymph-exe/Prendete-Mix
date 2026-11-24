# MIXER

A playlist maker that runs entirely in the browser: https://nymph-exe.github.io/Prendete-Mix/

Internally it's still the Préndete app, named after the playlist that started it (Préndete 🔥).

Each playlist has its own direction, capacity, recommendations, rejections and status. Nothing is shared between playlists.

- **Classic** recommendations, with no AI and no keys: reads a typed description (English or Spanish) with built-in rules and recognizes 2,000+ genre names (the MusicBrainz genre list). It starts from a curated **scene map** (`scenes.js`): 82 scenes, each with the artists who define it and the newer or deeper names that carry it (2,300 artists, Deezer IDs in `scenes.ids.js`), how scenes connect, and novelty acts to skip. Named styles and reference artists pick the scenes; a playlist's approvals place it in scenes too, and rejections in a scene pull it down. It finds songs through Deezer (related artists, artist radios, editorial playlists) and ListenBrainz listening data (similar artists, songs played together, songs tagged with a genre). Every artist, and each song's lead artist, is checked against genre data from MusicBrainz/ListenBrainz tags, Wikidata and Discogs styles, plus the song's own listener tags, so picks stay in the requested style. Release years are checked against MusicBrainz first releases. Energy, tempo and mood come from ReccoBeats, or for songs too new for it, from **Listen**: the app analyzes the 30-second Deezer preview with Meyda (MIT) and a small model fitted on 426 songs (energy r = 0.82). LRCLIB lyrics tell each song's language. Tuned by what you approve and reject in that playlist, including steering away from the neighbourhood of artists you keep rejecting.
- **AI** recommendations: Google Gemini or OpenRouter with your own free key. Every suggestion is looked up in Deezer / Apple Music before it's added. Claude and ChatGPT subscriptions are a work in progress.
- Data lives in this browser (IndexedDB). Use Settings → Save backup to keep a copy or move devices.

| File | What it does |
|---|---|
| `core.js` | Playlist rules: song states, capacity, operations, identity, invariants |
| `catalog.js` | Deezer, Apple Music, MusicBrainz, ListenBrainz (similar artists and songs, genre tags), Discogs (styles), Wikidata (genres), ReccoBeats, LRCLIB (lyrics → language) |
| `reader.js` | Classic's description reader (genres, styles, moods, BPM, years, languages, artists, songs, exclusions) |
| `genres.js` | MusicBrainz genre list (CC0), so descriptions can name any genre |
| `scenes.js`, `scenes.ids.js` | The scene map Classic starts from, and the artists' Deezer IDs |
| `listen.js` | Listen: energy, danceability, mood and tempo estimated from a song's preview |
| `vendor/meyda.min.js` | Meyda 5.6.3 audio features (MIT) |
| `engines.js` | Classic and AI recommendation engines |
| `migrate.js` | Moves Préndete 🔥 from the old single-playlist app |
| `ui.js`, `views.js`, `main.js` | Interface, storage, jobs |
| `seed.json` | Préndete 🔥's saved songs, used once on first run |
| `tests/core.test.js` | `node tests/core.test.js` checks the rules against the ruleset's acceptance tests |
| `tests/reader.test.js` | `node tests/reader.test.js` checks the description reader |
| `tests/style.test.js` | `node tests/style.test.js` checks Classic's genre matching |
| `tests/listen.test.js` | `npm install meyda && node tests/listen.test.js` checks the preview analyzer |

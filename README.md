# MIXER

Start with a playlist idea. Describe it, name a few artists, or paste songs you have in mind. MIXER suggests tracks, and your likes and dislikes help it find better fits the next time you ask.

**[Try MIXER](https://nymph-exe.github.io/Prendete-Mix/)**

## What makes it different?

- **Each playlist learns separately.** You can like a song in one playlist and dislike it in another. Each decision applies only to the playlist you’re curating.
- **Multiple genres get room in the mix.** When your idea spans different music scenes, Classic searches each one separately so the scene with the most results doesn’t crowd out the others.
- **Feedback shapes future suggestions.** When you repeatedly turn down tracks from similar artists, Classic recommends fewer songs from that part of the scene.
- **You decide when it’s finished.** Request another round, revise your picks, or mark the playlist complete at any size within its limit. You can still edit it afterward.

## Recommendation modes

**Classic** works without AI or an API key. It recognizes 2,000+ genres and draws on 181 curated music scenes, listening data, and audio features to find tracks.

**AI** uses Gemini or OpenRouter with your own API key. MIXER checks each suggestion against Deezer or Apple Music before adding it.

**Work in progress:** Support for connecting a Claude or ChatGPT subscription.

Your playlists are saved automatically in the same browser. Use **Settings → Save backup** to keep a copy or move them to another device.

## Technical reference

<details>
<summary>What each file does</summary>

### App and playlist data

| File | Purpose |
|---|---|
| [index.html](index.html) | Defines the page layout and styles, then loads the app scripts. |
| [main.js](main.js) | Starts the app, handles settings and backups, and runs recommendation jobs. |
| [views.js](views.js) | Handles navigation and renders the dashboard, playlist screens, and curation views. |
| [ui.js](ui.js) | Provides shared interface controls and the preview player, and saves playlist changes to IndexedDB. |
| [core.js](core.js) | Defines song identity, approval and rejection states, capacity limits, and playlist operations. |
| [migrate.js](migrate.js) | Converts data from the original single-playlist app into the current playlist format. |
| [seed.json](seed.json) | Contains the starter playlist’s saved songs for first-time setup. |
| [README.md](README.md) | Introduces MIXER and documents the repository. |

### Recommendations and music data

| File | Purpose |
|---|---|
| [engines.js](engines.js) | Runs Classic discovery and ranking, requests AI suggestions, and verifies AI picks against music catalogs. |
| [reader.js](reader.js) | Interprets English and Spanish descriptions, including genres, moods, tempo, years, languages, references, and exclusions. |
| [genres.js](genres.js) | Supplies the MusicBrainz genre names that Classic recognizes in descriptions. |
| [catalog.js](catalog.js) | Queries music services for tracks, related artists, genre tags, release dates, audio features, and lyrics. |
| [artists.js](artists.js) | Matches artist IDs across services so “Never suggest” can distinguish artists who share a name. |
| [scenes.js](scenes.js) | Defines each curated scene’s styles, artists, and connections to other scenes. |
| [scenes.ids.js](scenes.ids.js) | Maps artists in the curated scenes to their Deezer IDs. |
| [scenes.wide.js](scenes.wide.js) | Lists additional artists linked to several core artists in a scene, widening discovery once Classic selects that scene. |
| [tools/kbwide.js](tools/kbwide.js) | Rebuilds `scenes.wide.js` from Deezer’s related-artist data. |
| [listen.js](listen.js) | Estimates energy, danceability, mood, and tempo from a track’s audio preview. |
| [vendor/meyda.min.js](vendor/meyda.min.js) | Provides the Meyda audio feature extractor used by `listen.js`. |

### Tests

| File | What it checks |
|---|---|
| [tests/core.test.js](tests/core.test.js) | Playlist rules, song states, capacity limits, and curation operations. |
| [tests/reader.test.js](tests/reader.test.js) | How Classic interprets playlist descriptions and song references. |
| [tests/style.test.js](tests/style.test.js) | How Classic matches recommendations to requested genres and styles. |
| [tests/ban.test.js](tests/ban.test.js) | Artist exclusions, including same-name artists and partial name matches. |
| [tests/listen.test.js](tests/listen.test.js) | Audio feature estimates from the preview analyzer. |
| [tests/robust.test.js](tests/robust.test.js) | Invalid input, damaged backups, older data, unexpected AI responses, and randomized playlist operations. |

</details>

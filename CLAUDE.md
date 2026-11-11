# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Tradewind" (working title): a relaxing 3D sailing game for the browser, on laptop and phone. Plain JavaScript ES modules, Three.js, Vite. There are no asset files at all: geometry, colours, sky, sound and music are generated in code. Keep it that way unless the owner asks otherwise.

The owner is not a programmer. Explain changes in plain language, keep code comments readable by a beginner (the existing files set the tone), and verify behaviour yourself rather than asking them to debug.

**Keep this file up to date.** The owner has asked that CLAUDE.md always reflects important information. Whenever a change adds a feature, alters the architecture, changes a workflow or agreement, or makes something here untrue, update this file (and the README's controls and file tables) in the same commit.

## Commands

```bash
npm install          # once
npm run dev          # dev server with hot reload (http://localhost:5173)
npm run build        # single self-contained dist/index.html (vite-plugin-singlefile inlines everything)
npm run artifact     # build, then strip the html/head/body wrapper into dist/artifact.html for publishing as a Claude Artifact
```

There is no linter and no test suite. Verify changes by building and driving the game in headless Chromium with Playwright against `dist/index.html`:

- Launch with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` so WebGL works (add `--autoplay-policy=no-user-gesture-required` to test audio).
- Software rendering is slow and frame time is clamped to 0.05 s, so game time runs far slower than wall time. Do not wait on real time; use the test hook instead.
- `window.game` exposes `{ ship, wind, cam, env, audio, shore, places, save, wildlife, camera, step }`. `game.step(seconds, { steer, sail })` fast-forwards the simulation without rendering. Set state directly (`game.ship.state.x`, `game.env.hour`, `game.env.forced = 0..3` plus `env.w`/`env.sea` for instant weather, `game.cam.yaw/dist/pitch`), then screenshot. `game.audio.level()` returns output RMS.
- Press Enter (or click `#help-go`) to dismiss the help overlay before screenshots.
- To test ashore: place the ship within 110 m of `isl.dock`, set `anchorDown = true`, `game.step(4)`, then press `E` (or click `#action`). Move the sailor by setting `game.shore.state.x/z/heading`, or run `game.shore.update(1/60, { up: true }, false)` in a loop to walk without waiting on frames. Place doors are in `shore.state.island.portInfo.places` (`doorX`, `doorZ`).
- Progress is stored in localStorage (`tradewind-save`, `tradewind-look`, `tradewind-sound`); a fresh Playwright page starts clean. Setting `env.hour` backwards counts as a new day in the logbook.

## Deployment and branches

- Pushing to `main` triggers `.github/workflows/pages.yml`, which builds and deploys to GitHub Pages: https://adambabin.github.io/sailing-game/
- The agreed workflow: develop on a working branch, and only update `main` (the public site) after the owner has seen and approved the change. Update `main` by pushing the working branch to it (`git push origin <branch>:main`); the two are kept identical, with no merge commits.
- Before approval, the owner reviews changes on a private Claude Artifact published from `dist/artifact.html` (`npm run artifact`). Republish to the same artifact so the link stays the same; the URL is in the session where it was created, or find it with the Artifact tool's list action ("Tradewind").
- After pushing to `main`, check the "Publish to GitHub Pages" workflow run finished successfully. The `github-pages` environment only allows deployments from `main` (and the original working branch); a deploy job that fails in seconds with no log means a branch rule is blocking it, which only the owner can change in repo Settings → Environments.
- The cloud sandbox cannot reach `adambabin.github.io`, so the live site cannot be loaded from there; rely on the workflow result and ask the owner to confirm.
- `vite.config.js` uses `base: './'` and a single-file build so the same output works on Pages, from `file://`, and as an Artifact. The Artifact environment blocks external resources except Google Fonts and a few script CDNs, which is another reason nothing loads at runtime.

## Architecture

`src/main.js` owns the scene, input, camera, HUD and the frame loop. Per frame, in order: `env.update` (clock and weather) → `updateWind` (copies `env.windSpeed` into the shared `wind` object and `env.sea` into `sea.state`) → `ship.update` → `shore.update` (only when ashore) → `wildlife.update` → `findAction` and logbook counters → camera → wake → `applyEnvironment` (lights, fog) → `ocean.update` / `sky.update` / `windFx.update` → HUD, place labels, chart → `audio.update` → render. Most cross-module behaviour comes from these shared objects rather than events.

Things that span several files:

- **Waves exist twice and must stay in sync.** `src/waves.js` computes Gerstner wave height on the CPU (ship buoyancy, wake foam, camera floor); the vertex shader in `src/ocean.js` computes the same waves on the GPU. Both read the same wave list (`buildWaves`), the same sea-state multiplier (`sea.state` ↔ `uSea`), and the same calming near islands. Change one, change the other, or the ship will float above or below the visible water.
- **Island coastline also exists twice.** `coastRadius`/`coastOf` in `src/islands.js` (terrain mesh, collision via `terrainHeight`, wave calming) is mirrored by `coast()` in the ocean shader (shallow-water colour, shore foam). Islands are passed to the shader as uniforms sized by `MAX_ISLANDS` (12); the `ISLANDS` list must not exceed it. Adding an island is one entry in that list.
- **Environment drives everything visual and audible.** `src/environment.js` blends colour keyframes by hour, applies weather (`w` from 0 calm to 1 gale → wind speed, overcast, rain, sea state, foam), and exposes sun/moon/light directions and a `night` factor. Ocean, sky, lights, fog, wind ribbons, rain, night lights and audio all read from the one `env` object. New time-of-day or weather effects should read `env` rather than keep their own state.
- **Paint system.** Meshes are tagged with `paint(mesh, color, opts)` and get materials from `applyPaint(root)` (`src/materials.js`), cached by colour and options. Ship parts carry a `part` tag (`hull`, `trim`, `sail`, `flag`); `ship.setLook()` recolours by part and re-applies paint. The available colours and sail cloths live in `BASIC` (free) and `SPECIAL` (bought at shipwrights) in `src/places.js`; new recolourable parts need a `part` tag, entries in both tables and in `PART_LABELS`, and a default in `look` in `main.js`. Call `applyPaint` after adding painted meshes.
- **Ship conventions** (`src/ship.js`): model forward is +Z, +X is port. `heading` 0 faces +Z (south); world north is −Z. Increasing heading turns to port. Sail geometry is rebuilt on the CPU every frame from sail amount, wind side (`tack`) and `fill`. Speed = `MAX_SPEED × polar(angle to wind) × sail × windFactor`; the `POLAR` table defines the no-go zone.
- **Ports and going ashore.** An island becomes a port by having a `port` angle in `ISLANDS`; `buildPort` then creates the dock, houses and the three visitable places and records them in `isl.portInfo` (dock extent, `places` with door positions). Ports must also have an entry in `FACTORS` and `TAVERNS` in `src/trade.js`. `main.js` switches between sailing and ashore via `shore.state.active`: the same `held` input drives either the ship or the sailor (`src/shore.js`), the camera follows whichever is active, and `findAction()` decides the single context action shown on the `#action` button (E key). Walking is limited by `terrainHeight > 0.25`, `onDock`, and the `obstacles` circles from `islands.js`. Going ashore requires the anchor fully down, speed under 1, and the ship within 110 m of the dock end; the row ashore is skipped. Place screens (`src/places.js`) and the chart (`src/chart.js`) are DOM panels that read and write the `save` object (`src/save.js`, persisted to localStorage; the ship's look is stored separately under `tradewind-look`). The ship's position, heading, sail, anchor and the time of day are saved in `save.ship` (every 10 s and when the page is hidden) and restored on load if that spot is still deep water. "Start a new voyage" in the logbook calls `wipe()` and reloads; it asks twice in-page because `confirm()` does not work inside an Artifact.
- **Economy.** Start: 100 coins, 20-crate hold. Five goods in `GOODS`; a port's price is `base × FACTORS[port] × daily wobble`, and merchants pay 92% of the buy price. Tavern trade tips come from `bestRoute()` so they are always true; keep it that way if prices change. Paints cost 25, sail cloth 60, upgrades 150 (hold → 30 crates) and 250 (sails → `speedBonus` 1.1). `applyUpgrades()` in `main.js` turns `save.upgrades` into actual effects.
- **Discovery.** Sailing within `R × 1.5 + 90` m of an island adds it to `save.discovered` (drawn solid on the chart); hearing of it in a tavern adds it to `save.rumoured` (dotted outline). The chart's world bounds are the `WORLD` constant in `src/chart.js`; widen it if islands are added outside it.
- **Wildlife** (`src/wildlife.js`) is decoration only and never affects the ship: gulls orbit the nearest island and come out to a ship within about 280 m; a dolphin pod joins occasionally in open water when moving (force one in tests with `game.wildlife.pod.wait = 0`); flying fish; three merchant ships that wander between random open-water points, steering away from land and from the player. It disturbs the water through `foamAt` and `audio.splash`, passed in from `main.js`. To test without waiting on frames, call `game.wildlife.update(dt, time, game.ship.state, game.env, game.camera)` in a loop.
- **Audio** (`src/audio.js`) is fully synthesised with Web Audio and can only start after a user gesture; `main.js` calls `audio.start()` on the first pointer/key event. One-shot sounds are triggered from `main.js` (e.g. `audio.anchor`), continuous layers follow the state passed to `audio.update`.

The HUD and all CSS live in `index.html`; elements toggle with the `hidden` attribute (there is an explicit `[hidden] { display: none !important }` rule because several are `display: grid/flex`). Touch buttons and keyboard share the same `held` input state, so new controls should be added to both. Keys: A/D/W/S or arrows (steer and sails, or turn and walk ashore), Space anchor, E context action, C chart, T skip three hours, R cycle weather, M sound mode. The help overlay in `index.html` and the README controls table list these and need updating when controls change.

## Direction

Art style is settled: the soft "painterly" look. Done so far: sailing, ship customisation (at shipwrights), day/night and weather, sound, going ashore on foot at five ports with tavern, market, shipwright, chart and logbook, saved ship position, life at sea.

Agreed plan, in this order (set by the owner):

1. Polish pass on what exists, driven by the owner's play-testing. Ongoing: fix what they report. **Keep the Time and Weather buttons for now**; they are wanted while testing and should only be hidden when the owner says so.
2. Life at sea (gulls, dolphins, flying fish, other ships). Built; awaiting the owner's review.
3. People in the villages: villagers walking about, a barkeep and merchant you walk up to, someone fishing off the dock.
4. More to find on the islands: go ashore on the islands without ports and find things (message in a bottle, ruin, lookout, shells), recorded in the logbook.
5. More ships: a two-masted brig and a galleon, bought at shipwrights.
6. A first-person view from the deck, at the helm.

Preferences the owner has stated: the sailing feel is right as it is; the game should stay relaxing, with no danger or pressure (a gale is a wilder ride, not a threat); features are reviewed on the private link before going public.

Known limits worth remembering: all testing so far has been automated, so motion smoothness, real-phone performance and how the generated audio actually sounds have only been judged by the owner; villages have no people; the Time and Weather buttons are preview tools kept on purpose for now (see the plan).

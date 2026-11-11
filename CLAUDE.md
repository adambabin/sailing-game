# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Tradewind" (working title): a relaxing 3D sailing game for the browser, on laptop and phone. Plain JavaScript ES modules, Three.js, Vite. There are no asset files at all: geometry, colours, sky, sound and music are generated in code. Keep it that way unless the owner asks otherwise.

The owner is not a programmer. Explain changes in plain language, keep code comments readable by a beginner (the existing files set the tone), and verify behaviour yourself rather than asking them to debug.

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
- `window.game` exposes `{ ship, wind, cam, env, audio, step }`. `game.step(seconds, { steer, sail })` fast-forwards the simulation without rendering. Set state directly (`game.ship.state.x`, `game.env.hour`, `game.env.forced = 0..3` plus `env.w`/`env.sea` for instant weather, `game.cam.yaw/dist/pitch`), then screenshot. `game.audio.level()` returns output RMS.
- Press Enter (or click `#help-go`) to dismiss the help overlay before screenshots.

## Deployment and branches

- Pushing to `main` triggers `.github/workflows/pages.yml`, which builds and deploys to GitHub Pages: https://adambabin.github.io/sailing-game/
- The agreed workflow: develop on a working branch, and only update `main` (the public site) after the owner has seen and approved the change.
- `vite.config.js` uses `base: './'` and a single-file build so the same output works on Pages, from `file://`, and as an Artifact. The Artifact environment blocks external resources except Google Fonts and a few script CDNs, which is another reason nothing loads at runtime.

## Architecture

`src/main.js` owns the scene, input, camera, HUD and the frame loop. Per frame, in order: `env.update` (clock and weather) → `updateWind` (copies `env.windSpeed` into the shared `wind` object and `env.sea` into `sea.state`) → `ship.update` → camera → wake → `applyEnvironment` (lights, fog) → `ocean.update` / `sky.update` / `windFx.update` → HUD → `audio.update` → render. Most cross-module behaviour comes from these shared objects rather than events.

Things that span several files:

- **Waves exist twice and must stay in sync.** `src/waves.js` computes Gerstner wave height on the CPU (ship buoyancy, wake foam, camera floor); the vertex shader in `src/ocean.js` computes the same waves on the GPU. Both read the same wave list (`buildWaves`), the same sea-state multiplier (`sea.state` ↔ `uSea`), and the same calming near islands. Change one, change the other, or the ship will float above or below the visible water.
- **Island coastline also exists twice.** `coastRadius`/`coastOf` in `src/islands.js` (terrain mesh, collision via `terrainHeight`, wave calming) is mirrored by `coast()` in the ocean shader (shallow-water colour, shore foam). Islands are passed to the shader as uniforms sized by `MAX_ISLANDS` (12); the `ISLANDS` list must not exceed it. Adding an island is one entry in that list.
- **Environment drives everything visual and audible.** `src/environment.js` blends colour keyframes by hour, applies weather (`w` from 0 calm to 1 gale → wind speed, overcast, rain, sea state, foam), and exposes sun/moon/light directions and a `night` factor. Ocean, sky, lights, fog, wind ribbons, rain, night lights and audio all read from the one `env` object. New time-of-day or weather effects should read `env` rather than keep their own state.
- **Paint system.** Meshes are tagged with `paint(mesh, color, opts)` and get materials from `applyPaint(root)` (`src/materials.js`), cached by colour and options. Ship parts carry a `part` tag (`hull`, `trim`, `sail`, `flag`); `ship.setLook()` recolours by part and re-applies paint. New recolourable parts need a `part` tag and an entry in `LOOK_OPTIONS` in `main.js`. Call `applyPaint` after adding painted meshes.
- **Ship conventions** (`src/ship.js`): model forward is +Z, +X is port. `heading` 0 faces +Z (south); world north is −Z. Increasing heading turns to port. Sail geometry is rebuilt on the CPU every frame from sail amount, wind side (`tack`) and `fill`. Speed = `MAX_SPEED × polar(angle to wind) × sail × windFactor`; the `POLAR` table defines the no-go zone.
- **Audio** (`src/audio.js`) is fully synthesised with Web Audio and can only start after a user gesture; `main.js` calls `audio.start()` on the first pointer/key event. One-shot sounds are triggered from `main.js` (e.g. `audio.anchor`), continuous layers follow the state passed to `audio.update`.

The HUD and all CSS live in `index.html`; elements toggle with the `hidden` attribute (there is an explicit `[hidden] { display: none !important }` rule because several are `display: grid/flex`). Touch buttons and keyboard share the same `held` input state, so new controls should be added to both.

## Direction

Art style is settled: the soft "painterly" look. Done so far: sailing, ship customisation, day/night and weather, sound. Agreed next step: going ashore at ports. Other ideas noted in the README: a chart of the islands, more ships.

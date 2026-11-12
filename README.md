# Tradewind (working title)

A relaxing 3D sailing game that runs in a web browser, on a laptop or a phone.
You sail a small sloop among Caribbean-style islands. The wind does the work;
you choose how much sail to carry and where to point her.

Play it: https://adambabin.github.io/sailing-game/

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer to port / starboard | `A` / `D` or arrow keys | Joystick left / right |
| Raise / lower sails | `W` / `S` or arrow keys | Joystick up / down |
| Walk ashore | The same keys | Joystick, any direction |
| Drop / weigh anchor | `Space` | ⚓ button |
| Look around (turn your head at the wheel) | Drag with the mouse | Drag with a finger |
| Zoom | Scroll wheel | Pinch |
| Skip ahead three hours | `T` | Time button |
| Change the weather | `R` | Weather button |
| Go ashore / visit a place / row back | `E` | The yellow button |
| Chart and logbook | `C` | Chart button |
| Fire the port / starboard guns | `1` / `2` | The two Fire buttons |
| Stand at the wheel / view from astern | `V` | View button |
| Try the next ship (temporary, for testing) | `B` | Ship button |
| Sound / no music / muted | `M` | Sound button |

The dial in the corner shows where the wind is coming from relative to your
bow. A ship cannot sail straight into the wind (the red wedge). She is fastest
with the wind on her side or just behind.

Speed depends on two things: how hard the wind blows and how much sail is
up. The weather drifts between calm, fair, fresh and gale on its own, and the
sea gets rougher as the wind rises. Above about 13 knots you can see the wind
as pale ribbons streaming past. A full day lasts about 20 minutes.

Five islands have a port. Drop anchor near the dock and go ashore: on foot
the joystick (or the same keys) walks you in any direction and the view swings
round to follow. Each port has a tavern (local talk and trade
tips), a market (buy cargo cheap, sell it dear elsewhere) and a shipwright
(paints, sail cloth and upgrades, paid for with coins), each minded by someone
you walk up to. Villagers stroll about by day and will return a greeting, and
there is usually someone fishing off the dock. The chart fills in
as you find islands. Progress, including where you left the ship, is saved in
the browser you play in; "Start a new voyage" in the logbook wipes it.

Shipwrights also sell bigger ships: a two-masted brig (900 coins, holds 45
crates) and a three-masted galleon (2800 coins, holds 90). They carry more and
are a little faster, but turn more slowly and cannot sail as close to the wind
as the sloop. You keep every ship you buy and can swap at any shipwright.

You can also row to the beach of any island: drop anchor close to shore and
the yellow button offers it. Every island hides one curiosity (a "?" tag shows
when you are near it) and three shells on its beaches. The logbook counts them.

Every ship carries cannon down each side. Steer to bring a side to face another
ship, and fire that side's guns; the button rings with light when a ship is in
their arc, and fills like a clock while they reload. A damaged ship is slower
and sits lower. Shipwrights repair the hull for coins, and a crew at anchor
patches it part of the way. If your hull reaches nothing the ship sinks: cargo
and ship are lost, and you start again from Port Marigold in a sloop.

Three kinds of ship share the sea. **Merchants** trade and run if fired on.
The **navy** hunts pirates. **Pirates** keep to two stretches of water marked
in red on the chart, and attack anyone who enters; leave and they give up the
chase. Fire on a merchant or the navy and you become **wanted**: the navy
hunts you and markets give worse prices, until a few days pass or you pay the
fine at any market. A tag over the nearest ship shows who she is and how
damaged.

A sunk ship leaves crates, a sea chest and sometimes a bottle floating where
she went down; sail over them to haul them aboard. Each pirate captain has a
name and a bounty, listed on the board in every tavern. Sink one and the navy
owes you the bounty, which you collect at any tavern (not while wanted).

A ship you have beaten badly enough strikes her colours and stops. Come
alongside and **Board** her to choose: take her as your own ship, add her to
your fleet, strip her and sink her, or let her go. Up to three ships can sail
in your fleet. They follow in your wake, fight whoever you are fighting, add
their holds to yours, and cost a daily wage. Shipwrights repair or buy them.
If your flagship is sunk, your next ship picks you up and becomes the flagship.

Treasure maps can be bought in any tavern (60 coins) or found in a bottle that
washes up on one beach each day. A map shows an island's shape and an X but
not its name. Work out which island it is, go ashore, and use **Dig here**.
Your maps are kept with the chart.

Out at sea you may meet gulls near land, dolphins at the bow, flying fish and
other ships under sail.

## Running it on your own computer

You need [Node.js](https://nodejs.org) installed (the "LTS" version). Then, in
a terminal opened in this folder:

```bash
npm install
```

```bash
npm run dev
```

The second command prints a web address (usually `http://localhost:5173`).
Open it in your browser. The page reloads by itself whenever a file changes.

`npm run build` produces a single self-contained file, `dist/index.html`, that
can be hosted anywhere.

Every change pushed to the `main` branch is built and published to the link
above automatically (see `.github/workflows/pages.yml`).

## How it is built

The game is plain JavaScript using [Three.js](https://threejs.org), a library
for drawing 3D graphics in the browser. There is no game engine to install and
no art files: the ship, islands, sea and sky are all generated by code.

| File | What it does |
| --- | --- |
| `index.html` | The page, the on-screen gauges and buttons |
| `src/main.js` | Starts everything; controls, camera, game loop |
| `src/ship.js` | The three ships (sloop, brig, galleon): how each is built and how they sail |
| `src/waves.js` | The wave maths, shared by the picture and the physics |
| `src/ocean.js` | Draws the sea |
| `src/sky.js` | Sky, sun and clouds |
| `src/islands.js` | Islands, palms, ports, lighthouses (edit the list at the top to add more) |
| `src/environment.js` | Clock and weather: sky, sea and light colours for every hour and wind strength |
| `src/windfx.js` | Wind ribbons and rain |
| `src/audio.js` | Every sound and the music, generated live (there are no audio files) |
| `src/wildlife.js` | Gulls, dolphins and flying fish |
| `src/vessels.js` | Other ships at sea: they sail, take damage and sink |
| `src/loot.js` | Crates and chests left floating by sunk ships |
| `src/factions.js` | Merchants, navy and pirates; pirate waters; your wanted level |
| `src/combat.js` | Cannon fire: broadsides, cannonballs, hits, smoke |
| `src/shore.js` | The sailor you walk around on land |
| `src/treasure.js` | Treasure maps, the washed-up bottle, and digging |
| `src/finds.js` | The curiosity on each island and the shells on the beaches |
| `src/people.js` | Villagers, the keepers of each place, and the fisher on the dock |
| `src/places.js` | Tavern, market and shipwright screens |
| `src/trade.js` | Trade goods and each port's prices |
| `src/chart.js` | The sea chart and logbook |
| `src/save.js` | Saved progress (coins, cargo, discoveries) |
| `src/materials.js` | Paint and sail-cloth patterns, used for ship customisation |

## Ideas for later

Nothing is queued; ideas welcome.

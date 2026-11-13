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
| Skip ahead three hours (testing) | `T` | In the pause menu |
| Change the weather (testing) | `R` | In the pause menu |
| Go ashore / visit a place / row back | `E` | The yellow button |
| Map and logbook | `M` | Map button |
| Compass strip | `C` | Compass button |
| Fire the port / starboard guns | `1` / `2` | The two Fire buttons |
| Fish: cast, strike, hold to reel in | `F` | Hook button |
| Stand at the wheel / view from astern | `V` | View button |
| Try the next ship (testing) | `B` | In the pause menu |
| Sound / no music / muted | `N` | In the pause menu |
| Start a new voyage (erases progress, asks twice) | | Reset button |
| Pause | `Esc` | II button |

The dial in the corner shows where the wind is coming from relative to your
bow. A ship cannot sail straight into the wind (the red wedge), and is slow
close to it; a hint tells you when to steer further off and zig-zag. She is
fastest with the wind on her side or just behind.

Speed depends on two things: how hard the wind blows and how much sail is
up. The weather drifts between calm, fair, fresh and gale on its own, and the
sea gets rougher as the wind rises. Above about 13 knots you can see the wind
as pale ribbons streaming past. A full day lasts about 20 minutes.

The sea holds 33 named islands in seven regions: the home waters, the
volcanic Cinder Isles to the north, the atolls of the Pearl Rings to the east
(you can sail into their lagoons), the sandbars and reefs of the Shallows, the
Stepping Stones, the cliffs and sea stacks of the Ironbound Coast, and Santa
Brisa in the west. Reefs lie just under the surface: a sloop floats over them,
a brig or galleon must go round. The map fills most of the screen, can zoom in
around your ship, and shows reefs and pirate waters.

Ten islands have a port. Drop anchor near the dock and go ashore: on foot
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
The **navy** hunts pirates. **Pirates** keep to four stretches of water marked
in red on the chart, and attack anyone who enters; leave and they give up the
chase. Fire on a merchant or the navy and you become **wanted**: the navy
hunts you and markets give worse prices, until a few days pass or you pay the
fine at any market. A tag over the nearest ship shows who she is and how
damaged.

A sunk ship leaves crates, a sea chest and sometimes a bottle floating where
she went down; sail over them to haul them aboard. Each pirate captain has a
name and a bounty, listed on the board in every tavern. Sink one and the navy
owes you the bounty, which you collect at any tavern (not while wanted).

Ships sail in company: a merchant convoy of three with a navy escort, a navy
patrol of two, and a pirate squadron in each stretch of pirate waters. Every
few minutes the navy sweeps one of those waters and a battle follows; a notice
tells you which way the gunfire is. Join in against the pirates and the navy
pays you half the bounty for any they finish after you have hit her.

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

Every tavern has three jobs on offer each day: freight or a passenger for
another port, and often a pirate to hunt, a curiosity to find or an island to
chart. A job gives you a name and a rough direction, no more. Carry up to
three at once; the logbook lists them. Do enough and the harbours reward you
with paints, sail cloths and fittings that cannot be bought.

Each stretch of pirate water has a **pirate lord** who keeps out of sight.
Sink or take three of their ships there and the lord comes out in a great
galleon. Beat one for 1500 coins, their colours for your own ship, and an
improvement such as faster-loading guns or a tougher hull.

Now and then a **storm** builds upwind and drifts across the sea: you can see
it coming as a dark wall of cloud and rain, and it shows on the chart. Inside it
the wind howls, the seas tower and lightning cracks. Carry more than half sail in
one and the ship is strained and slowly damaged (never below a quarter of her
hull, so a storm alone will not sink you); shorten sail or anchor and she rides
it out. The rare oarfish only bites in a storm.

Slow down or drop anchor and you can fish. Cast, wait for the float to dip,
strike, then hold the hook button to reel in: let go when the fish runs or the
line will snap. Sixteen kinds of fish bite in different waters and at different
times; some only near land, some only far out, some only at night. Fish sell at
any market (each pays its own price), a cook may ask for one, and the fish log
(under the chart) rewards a fuller log with things that cannot be bought.

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
| `src/factions.js` | Merchants, navy and pirates; pirate waters and their lords; your wanted level |
| `src/jobs.js` | Work offered in taverns |
| `src/storms.js` | Storms: where they build, how they look and sound, and the strain on a ship |
| `src/fishing.js` | Fishing: the fish, where they bite, casting and reeling in |
| `src/rewards.js` | Paints, cloths and fittings that are earned rather than bought |
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

# Tools

Things for working on the site. None of this needs uploading.

| File | What it does |
|---|---|
| `serve.ps1` | The local server (`Open portfolio.bat` runs it). |
| `tests/` | Browser test scripts for the interactive parts (below). |
| `snap.ps1` | Receives canvas snapshots from the tests and saves them in `tools/snaps/`. |
| `sheet.ps1` | Combines several images into one contact sheet. `-Out sheet.jpg -Cell 400 -Cols 3 -Files a.jpg,b.jpg` |
| `vframes.ps1` | Grabs still frames from a video with the Windows media APIs (no ffmpeg needed). `-Video x.mp4 -OutDir frames -Every 3` or `-Times 1.5,4,9` |
| `crop.ps1` | Crops, resizes and re-saves a photo as JPEG, respecting EXIF rotation. `-Src in.jpg -Out out.jpg -X 0 -Y 0 -W 0 -H 0 -MaxW 1200` |

## Test harness

Open the site with `?debug` on the end, for example `http://localhost:5173/?debug`. Every interactive part then loads straight away (without being scrolled to) and hands its internals to `window.__soohoo`: `cover`, `engine`, `flywheel`, `track`, `ball`. Without `?debug` nothing is exposed.

Then, in the browser console:

```js
const t = await import('/tools/tests/run.js');
await t.all();               // everything, about 20 to 40 s
await t.all({ quick: true }); // a smaller, faster pass
```

Or one test at a time:

```js
await t.track.walls();                                  // barrier crossings (should be 0), clearance, narrowest road
await t.track.crash({ every: 7 });                      // fire the car into the walls all round the lap
await t.engines.engine();                               // engine: revs over time, biggest jump per frame
await t.engines.flywheel();                             // flywheel: the same
await t.cover.settle();                                 // where every part in the bin ends up
await t.cover.hurl();                                   // throw everything at the floor and label
await t.volley.serveReturns('advanced', 30);            // how often each CPU level returns your serve
await t.volley.attack('pro', { mode: 'tip', n: 30 });   // a scripted player spiking or tipping
```

These need one real click on the page first, because browsers keep audio off until then:

```js
await t.track.engineSound('rec');   // the recorded V10: level, centroid, energy by band at several revs
await t.cover.sweep();              // sounds started while a pointer sweeps through the pile
```

To look at a moment when screenshots don't work, start `tools/snap.ps1`, then for example
`await t.volley.capture('jump')` saves `tools/snaps/jump.jpg`.

Everything is stepped directly, so the tests do not depend on animation frames (which stall when the browser window is hidden). The sound tests mute the page while they run and restore the volume after.

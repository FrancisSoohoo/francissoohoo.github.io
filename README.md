# Soo-Hoo — portfolio of Siu Tsun "Francis" Soo-Hoo

A one-page portfolio styled as a bilingual (English / 繁體中文) Hong Kong parts catalogue. Every project is a "part" with a drawing, a spec table and something you can operate:

| Part | What you can do |
|---|---|
| Cover | A parts bin of my own parts in their real colours (engine hardware, ESP32, DRV8833, servo, TT motor and wheel, chips, breadboard, jumper wires) on Matter.js rigid-body physics, so stacks settle instead of jittering. Every impact is heard the moment it happens, voiced by material (metal rings, plastic tocks, boards click, rubber thuds), so sweeping the mouse through the pile rattles it. Click to drop, click a part to flick it, grab to throw, hover for its name, hold to magnetise, double-click to blast, **Shake the bin**. A refresh always opens here. |
| Fig. 001 engine | Drag to rotate. Hold **Start** to crank, catch and rev (synthesised engine sound); **Stop** kills it instantly. **Explode** pulls it apart. The yellow studs and flywheel are clickable and jump to their parts. |
| 02 Powertrain | Two folder tabs. **Flywheel (02-01):** hold to rev (it stops if you scroll away), FEA contour, forces, pockets, base plate and wall skim. **Head studs (02-02):** the measured stack in section with torque and stud length, and the six-fastener torque bench. |

| 03-01 Decision tree | A real CART tree retrained live on 303 synthetic patients shaped like the UCI set: max depth, min patients per leaf, Gini or entropy, class weights, test split, feature toggles. Readable node-link drawing you can drill into, confusion matrix, recall and precision, feature importance, and a 5-fold cross-validated depth curve. |
| 04 Design | The Y1 Human-centred Design project: research (interviews on a campus map, a sticky-note board, library headcounts), 34 ideas cut to three concepts, co-design, and the final concept, The Canvas. A playable version of the wall follows the prototype's rules: tap your card for five pixels, then a short break. It is seeded from a canvas students drew in testing. Five folders hold the findings, sketches, concepts, ESP32 and web prototypes, renders and scores. |
| 05 Test track | Drive the RC car round the real Circuit de Monaco layout (tunnel, harbour, Armco). The first drive starts from the grid with F1-style start lights: five reds, one a second, a random hold, lights out, and your reaction time (G returns to the grid). A real F1 V10 (a 2005 Red Bull-Cosworth RB1 recorded at Goodwood by Edvvc, CC BY-SA 3.0, streamed from Wikimedia Commons, looped and pitched to the revs; a synthesised engine as the alternative), silent until you press throttle, through an 8-speed sequential box with up and down shift sounds (auto, or manual: P shifts up, I shifts down). Grip and Drift presets, tyre grip and weight sliders, spoiler. Chase, clear cockpit and low-res ESP32-CAM cameras. Lap times feed a live forecast. Build photos, FPV screenshots and a video sit in five filing folders. |
| 07 Off-spec | Piano: play it, switch to five octaves, or play a real recording of Liebestraum No. 3 (one of my favourites) with the keys lit from its live spectrum. Bean volleyball on a court drawn in 3D, against a Rookie, Pro or Advanced CPU: A / D move, Space jumps, left click plays the ball (a bump or set on the ground, an attack in the air, aimed where you click: any swing at a ball above the tape is a full spike, and clicking as the jump tops out is a perfect spike with extra impact), right click dives on the ground and tips the ball over the net in the air (into a spot only a dive can save), jump at the net to block. Third-touch attacks get take-off smoke, slow motion and a push-in; spikes flash, boom and shake. First to 7. |

The header search works (press `/`), the speaker slider in the header sets the volume of every sound on the page (remembered between visits, click the speaker to mute), and the thumb tabs on the right jump between sections with a page-turn (skipped if you prefer reduced motion).

## Preview locally

Easiest: double-click **`Open portfolio.bat`** in this folder. It starts a small local server and opens your browser at http://localhost:5173. Close the "Portfolio server" window when you're done.

Or from a terminal in this folder:

```powershell
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Then open http://localhost:5173. (Opening `index.html` directly from disk will not work, because browsers block ES modules on `file://`.)

## Put it online (free)

The site is hosted with **GitHub Pages**: Settings → Pages → Deploy from a branch → `main` / root. A repository named `<username>.github.io` is served at `https://<username>.github.io`.

Working files (design notes, review screenshots, editor settings, test snapshots) are kept out of the repository by `.gitignore`. Original photos and recordings are kept outside this folder entirely; only checked, cropped copies go into `assets/`.

## Testing the interactive parts

Open the site with `?debug` (for example http://localhost:5173/?debug) and run the saved test scripts from the browser console. See `tools/README.md`.

## Editing content

- All text lives in `index.html`, one `<section>` per catalogue tab.
- Colours and type are CSS variables at the top of `css/style.css`.
- Each interactive figure is its own file in `js/`.

### RC car media

The RC photos, three FPV screenshots and one video live in `assets/rc/`. The finished-car photo is cropped so nothing personal is in frame, and the FPV feed is shown as screenshots taken from the parts of the recording without a face; check any new photo or video the same way before adding it. The video is about 9 MB and loads only when played.

### Adding photos later

Each part entry has a `.part-fig` column. Add a figure under the existing drawing, for example:

```html
<figure class="fig">
  <figcaption class="fig-cap"><span><b>Fig. 002a</b> ARP studs on the bench</span></figcaption>
  <img src="assets/studs.jpg" alt="Custom ARP head studs laid out before fitting" style="width:100%;height:auto">
</figure>
```

## Honesty notes

Figures tagged **Illustrative model** or **Schematic** (the torque bench, the flywheel stress map, the decision tree and its accuracy curve, the RC car's handling in the driving game) are models drawn for this page, not team or test data. The piano demo is this page's synth playing a transcription of the public-domain score, not a recording. The page says so on each figure and in the footer. The engine is a schematic parallel twin, not a CAD model of the Ninja 400.

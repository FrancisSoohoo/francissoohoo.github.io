# Francis Soo-Hoo — Portfolio

**▶ Open it: [francissoohoo.github.io](https://francissoohoo.github.io)** — nothing to install; works in any modern browser (best on desktop, sound on).

A one-page portfolio styled as a bilingual (English / 繁體中文) Hong Kong parts catalogue. Every project is a "part" with a drawing, a spec sheet and something you can operate.

## What to try

| Part | Try this |
|---|---|
| **Cover** | A physics parts bin of my real components. Click to drop, grab to throw, hold to magnetise, double-click to blast, or **Shake the bin**. |
| **001 Engine** | Drag to rotate. Hold **Start** to crank and rev; **Explode** pulls it apart. Click the yellow studs or flywheel to jump to them. |
| **02 Powertrain** | **Flywheel:** hold to rev, see the FEA contour and pockets. **Head studs:** sectioned stack and the torque bench. |
| **03 Decision tree** | Retrain a real CART tree live — depth, leaf size, Gini/entropy, features — and watch the confusion matrix and CV curve update. |
| **04 Design** | Y1 Human-centred Design project, from research to the final concept, The Canvas — plus a playable version of the pixel wall. |
| **05 Test track** | Drive the RC car round Monaco from an F1-style start. Real V10 sound, 8-speed box (P / I for manual), grip and drift presets, FPV camera. |
| **07 Off-spec** | Play the piano (or hear Liebestraum No. 3 light up the keys), and 3D bean volleyball vs a CPU: A / D move, Space jump, left click hit, right click dive/tip. First to 7. |

**Tips:** press `/` to search · speaker slider in the header sets volume · thumb tabs on the right jump between sections.

## Honesty notes

Figures tagged **Illustrative model** or **Schematic** (torque bench, flywheel stress map, decision-tree data, the car's handling) are models drawn for this page, not team or test data. The engine is a schematic parallel twin, not a CAD model of the Ninja 400. Each figure says so on the page.

Credits: F1 V10 recording (2005 Red Bull-Cosworth RB1, Goodwood) by Edvvc, CC BY-SA 3.0, via Wikimedia Commons.

---

<details>
<summary>For developers: editing and running locally</summary>

- Plain HTML/CSS/JS, no build step. Text is in `index.html` (one `<section>` per tab), colours/type are CSS variables in `css/style.css`, each interactive figure is a file in `js/`.
- Run locally: double-click `Open portfolio.bat` (serves http://localhost:5173). Opening `index.html` from disk won't work — ES modules need a server.
- Tests: open with `?debug` and see `tools/README.md`.
- Hosted on GitHub Pages from `main` / root; pushing to `main` updates the live site.

</details>

# STL Container Maker

A static web page that turns any closed STL into a two-part print: a hollow container and a lid that plugs into it.

The page lays out as numbered steps: 1 Model and 2 Cut plane side by side, then 3 Container, 4 Lid, 5 Make and 6 Download.

The layout is responsive CSS, with no device detection:
- **Narrow screens** (phones, a foldable's outer screen, split-screen windows, under 600 px): the 3D view is pinned on top and the settings scroll underneath.
- **600–899 px** (for example a foldable's inner screen in portrait, 669 px): same arrangement, and the settings panel switches to two columns through a container query.
- **900 px and up**: settings beside the 3D view.
- **Short landscape screens** (480 px tall or less, such as a folded phone turned sideways at 594 × 368): the screen is split in half, the 3D view on one side and the settings on the other.

Folding and unfolding without a reload is handled: the 3D view resizes with its box, and the page re-checks on `resize`, `visualViewport` resize, `orientationchange` and posture changes. When the browser reports a fold (viewport segments, or device posture `folded`), the 3D view and settings go on opposite sides of it. Safari doesn't report folds by default yet, so touch screens sized like a foldable's inner display (both sides roughly 540–1000 px, such as 669 × 867 and 951 × 585) get the same half-and-half split automatically. A **Split view** button on the 3D view turns the split on or off on any screen at least 560 px wide (the choice is remembered), and **Swap** switches the two halves. Add `#duo` to the address to preview that split layout on any screen.

1. **Load an STL** (drag and drop, or pick a file). Everything runs in your browser; nothing is uploaded.
2. **Pick the cut plane**: an axis (X, Y or Z), a position along it, and two tilt angles. The teal side becomes the container and the orange side the lid; **Swap** flips them.
3. **Set the walls and lid**:
   - *Minimum wall thickness*: the hollow is the largest space that keeps every wall at least this thick. It doesn't copy the outer shape, it just fills all the room it can.
   - *Inside surface*: **Follow outside** keeps the hollow as large as possible, so the inside mirrors the outside's bumps and folds. **Smooth** rolls a ball of the chosen size around the inside and keeps only the space it can reach, giving a rounded, bowl-like inside. A bigger ball is smoother but leaves thicker walls in places; walls never go below the minimum either way.
   - *Lid plug depth*: how far the lid's plug reaches into the container.
   - *Lid clearance*: how much smaller than the opening the plug is, on every side, so it fits after printing.
   - *Print the lid in two parts*: the lid top prints flat on its cut face, so its outside never sits on the bed or on supports. The plug becomes a separate insert that reaches down into the container and up into a matching pocket in the lid top (*Insert reaches into lid*), with dowel pins on top that glue into holes above the pocket. The lid clearance applies in every direction: the insert is that much narrower than the pocket and that much shorter than it, and the pins are that much narrower and shorter than their holes. Holes are also 0.5 mm deeper, for glue. The pocket only goes where the lid top keeps the minimum wall thickness around it. Pins are placed only where each hole keeps a solid wall around it (up to three per insert piece, spread apart), and get smaller automatically if the chosen size doesn't fit.
   - *Detail*: finer is more accurate but slower.
4. **Make container & lid**, check the result, and download each part as STL. "Lay parts flat for printing" puts the container opening-up and flips the lid so its plug points up.

## How it works

- Overlapping shells (common in STLs exported from sculpting tools) are merged into one solid first, and inside-out scraps are dropped.
- The model is moved so the cut plane is `z = 0`.
- A voxel distance field measures how far each point inside the model is from its surface. Points near the wall-thickness level get exact distances (via a BVH), then the hollow is the surface at that distance (`Manifold.levelSet`). Pockets that don't reach the opening are dropped so no sealed air bubbles are left behind.
- Walls are checked against the true surface. Cells the surface passes through count as wall, so folds and slots thinner than the grid are respected, and the hollow is pulled in by a small margin tied to the grid size. Walls come out at or slightly above the minimum you set.
- The heavy work runs in a background worker (`worker.js`) so the page stays responsive; if a host blocks the worker it runs on the page instead.
- Smooth inside: the hollow is shrunk by the ball's radius (where the ball's centre can go), grown back by the same radius (everywhere the ball can reach), lightly blurred to round the seams between ball positions, and held a tenth of the radius inside that sweep. A final check against the wall limit guarantees the minimum thickness.
- The plug's outline is the opening narrowed to whatever still fits at every depth it reaches, so it slides straight in, then shrunk by the clearance and extruded onto the lid.

Libraries (loaded from jsDelivr): [three.js](https://threejs.org), [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh), [manifold-3d](https://github.com/elalish/manifold).

## Hosting

The folder is ready to upload as-is to any static host (your own domain, GitHub Pages, Netlify, Cloudflare Pages):

```
index.html
favicon.ico
favicon.svg
preview.jpg          link-preview image
assets/app.js        page logic and 3D view
assets/core.js       hollowing and lid geometry
assets/worker.js     runs the geometry in the background
assets/manifold.wasm geometry engine (a local copy, so it doesn't depend on the CDN)
```

three.js, three-mesh-bvh and the manifold-3d loader still come from jsDelivr. It's set up for https://container.michaelkiaunis.com/; if it moves, update the `og:image` and `og:url` lines in `index.html`.

It has to be served over HTTP(S), not opened as a local `file://`, because it uses ES modules and a worker. To try it locally:

```bash
cd stl-container && python3 -m http.server 8000
```

then open http://localhost:8000.

The STL must be watertight (closed, no holes). If it isn't, run it through a repair tool first.

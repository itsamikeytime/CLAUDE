# STL Container Maker

A static web page that turns any closed STL into a two-part print: a hollow container and a lid that plugs into it.

1. **Load an STL** (drag and drop, or pick a file). Everything runs in your browser; nothing is uploaded.
2. **Pick the cut plane**: an axis (X, Y or Z), a position along it, and two tilt angles. The teal side becomes the container and the orange side the lid; **Swap** flips them.
3. **Set the walls and lid**:
   - *Minimum wall thickness*: the hollow is the largest space that keeps every wall at least this thick. It doesn't copy the outer shape, it just fills all the room it can.
   - *Lid plug depth*: how far the lid's plug reaches into the container.
   - *Lid clearance*: how much smaller than the opening the plug is, on every side, so it fits after printing.
   - *Detail*: finer is more accurate but slower.
4. **Make container & lid**, check the result, and download each part as STL. "Lay parts flat for printing" puts the container opening-up and flips the lid so its plug points up.

## How it works

- The model is moved so the cut plane is `z = 0`.
- A voxel distance field measures how far each point inside the model is from its surface. Points near the wall-thickness level get exact distances (via a BVH), then the hollow is the surface at that distance (`Manifold.levelSet`). Pockets that don't reach the opening are dropped so no sealed air bubbles are left behind.
- The plug's outline is the opening narrowed to whatever still fits at every depth it reaches, so it slides straight in, then shrunk by the clearance and extruded onto the lid.

Libraries (loaded from jsDelivr): [three.js](https://threejs.org), [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh), [manifold-3d](https://github.com/elalish/manifold).

## Hosting

It's plain static files (`index.html`, `app.js`, `core.js`), so any static host works: GitHub Pages, Netlify, Cloudflare Pages, or your own server. It must be served over HTTP(S), not opened as a local `file://`, because it uses ES modules. To try it locally:

```bash
cd stl-container && python3 -m http.server 8000
```

then open http://localhost:8000.

The STL must be watertight (closed, no holes). If it isn't, run it through a repair tool first.

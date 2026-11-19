// Geometry core: turns a closed triangle mesh (already moved into the "cut frame",
// where the cut plane is z = 0, the container is below and the lid above) into a
// hollow container and a lid with a plug.
//
// deps = { wasm (manifold-3d module, after setup()), BufferGeometry, BufferAttribute, Vector3, MeshBVH }

export function weldToManifold(wasm, positions) {
  // positions: Float32Array of a triangle soup (9 floats per triangle)
  const map = new Map();
  const verts = [];
  const tris = new Uint32Array(positions.length / 3);
  const q = 1e5; // weld tolerance of 0.01 µm (STL units are usually mm)
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const key = Math.round(x * q) + ',' + Math.round(y * q) + ',' + Math.round(z * q);
    let idx = map.get(key);
    if (idx === undefined) {
      idx = verts.length / 3;
      map.set(key, idx);
      verts.push(x, y, z);
    }
    tris[i / 3] = idx;
  }
  // drop degenerate triangles (two corners welded together)
  const clean = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    if (a !== b && b !== c && a !== c) clean.push(a, b, c);
  }
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(clean),
  });
  mesh.merge();
  const fail = (why) => new Error(
    `This STL isn't a closed, watertight solid (${why}), so it can't be hollowed. ` +
    'Repair it first (for example with your slicer\'s "repair" option, Meshmixer or Microsoft 3D Builder) and load it again.');
  let m;
  try { m = new wasm.Manifold(mesh); } catch (e) { throw fail(e && e.message ? e.message.toLowerCase() : 'not manifold'); }
  const status = m.status();
  if (status !== 'NoError') throw fail(status);
  return m;
}

// --- Euclidean distance transform (Felzenszwalb & Huttenlocher), squared, 1D ---
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -1e30; z[1] = 1e30;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e30;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

function edt3d(grid, nx, ny, nz) {
  const n = Math.max(nx, ny, nz);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  // x lines
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const base = (k * ny + j) * nx;
    for (let i = 0; i < nx; i++) f[i] = grid[base + i];
    edt1d(f, nx, d, v, z);
    for (let i = 0; i < nx; i++) grid[base + i] = d[i];
  }
  // y lines
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) f[j] = grid[(k * ny + j) * nx + i];
    edt1d(f, ny, d, v, z);
    for (let j = 0; j < ny; j++) grid[(k * ny + j) * nx + i] = d[j];
  }
  // z lines
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) f[k] = grid[(k * ny + j) * nx + i];
    edt1d(f, nz, d, v, z);
    for (let k = 0; k < nz; k++) grid[(k * ny + j) * nx + i] = d[k];
  }
}

// Inside/outside for voxel centers: cast a ray up each (x, y) column and count crossings.
function voxelizeInside(positions, ox, oy, oz, h, nx, ny, nz) {
  const inside = new Uint8Array(nx * ny * nz);
  const hits = Array.from({ length: nx * ny }, () => null);
  const jx = 0.000137 * h, jy = 0.000291 * h; // tiny jitter to avoid hitting edges exactly
  for (let t = 0; t < positions.length; t += 9) {
    const ax = positions[t], ay = positions[t + 1], az = positions[t + 2];
    const bx = positions[t + 3], by = positions[t + 4], bz = positions[t + 5];
    const cx = positions[t + 6], cy = positions[t + 7], cz = positions[t + 8];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-18) continue; // edge-on to the ray
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - ox - jx) / h - 0.5));
    const i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - ox - jx) / h - 0.5));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - oy - jy) / h - 0.5));
    const j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - oy - jy) / h - 0.5));
    for (let j = j0; j <= j1; j++) {
      const py = oy + (j + 0.5) * h + jy;
      for (let i = i0; i <= i1; i++) {
        const px = ox + (i + 0.5) * h + jx;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const zz = l1 * az + l2 * bz + l3 * cz;
        const c = j * nx + i;
        (hits[c] || (hits[c] = [])).push(zz);
      }
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const hz = hits[j * nx + i];
    if (!hz || hz.length < 2) continue;
    hz.sort((a, b) => a - b);
    for (let p = 0; p + 1 < hz.length; p += 2) {
      const k0 = Math.max(0, Math.ceil((hz[p] - oz) / h - 0.5));
      const k1 = Math.min(nz - 1, Math.floor((hz[p + 1] - oz) / h - 0.5));
      for (let k = k0; k <= k1; k++) inside[(k * ny + j) * nx + i] = 1;
    }
  }
  return inside;
}

// Separable Gaussian blur (sigma in cells) of the bottom `kLimit` layers of a grid, in place.
function blur3d(f, _nx, _ny, kLimit, nx, ny, nz, sigma) {
  const r = Math.max(1, Math.min(40, Math.ceil(2.5 * sigma)));
  const w = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { w[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += w[i + r]; }
  for (let i = 0; i < w.length; i++) w[i] /= sum;
  const kl = Math.min(nz, kLimit);
  const n = Math.max(nx, ny, nz);
  const line = new Float64Array(n), out = new Float64Array(n);
  const pass = (count, len, stride, base) => {
    for (let q = 0; q < count; q++) {
      const b = base(q);
      for (let i = 0; i < len; i++) line[i] = f[b + i * stride];
      for (let i = 0; i < len; i++) {
        let acc = 0;
        for (let t = -r; t <= r; t++) {
          const j = i + t < 0 ? 0 : i + t >= len ? len - 1 : i + t; // clamp at the edges
          acc += w[t + r] * line[j];
        }
        out[i] = acc;
      }
      for (let i = 0; i < len; i++) f[b + i * stride] = out[i];
    }
  };
  pass(kl * ny, nx, 1, (q) => q * nx);                                            // x lines
  pass(kl * nx, ny, nx, (q) => Math.floor(q / nx) * nx * ny + (q % nx));          // y lines
  pass(nx * ny, kl, nx * ny, (q) => q);                                           // z lines (bottom part only)
}

// Mark every cell a triangle passes through, by sampling each triangle at half-cell spacing.
function markSurfaceCells(positions, ox, oy, oz, h, nx, ny, nz) {
  const out = new Uint8Array(nx * ny * nz);
  const step = 0.5 * h;
  for (let t = 0; t < positions.length; t += 9) {
    const ax = positions[t], ay = positions[t + 1], az = positions[t + 2];
    const bx = positions[t + 3], by = positions[t + 4], bz = positions[t + 5];
    const cx = positions[t + 6], cy = positions[t + 7], cz = positions[t + 8];
    const len = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
    const n = Math.max(1, Math.ceil(len / step));
    for (let a = 0; a <= n; a++) for (let b = 0; a + b <= n; b++) {
      const u = a / n, v = b / n, w = 1 - u - v;
      const i = Math.floor((u * ax + v * bx + w * cx - ox) / h);
      const j = Math.floor((u * ay + v * by + w * cy - oy) / h);
      const k = Math.floor((u * az + v * bz + w * cz - oz) / h);
      if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) out[(k * ny + j) * nx + i] = 1;
    }
  }
  return out;
}

/**
 * positions: Float32Array triangle soup in the cut frame.
 * opts: { wall, clearance, lipDepth, resolution, onProgress }
 */
export async function makeContainerAndLid(deps, positions, opts) {
  const { wasm, BufferGeometry, BufferAttribute, Vector3, MeshBVH } = deps;
  const { wall, clearance, lipDepth } = opts;
  const progress = opts.onProgress || (async () => {});
  const garbage = [];
  const keep = (m) => { garbage.push(m); return m; };

  await progress('Checking the model…');
  let model = keep(weldToManifold(wasm, positions));
  // Many STLs are several closed shells that overlap (or one copy inside another), and some
  // carry small inside-out scraps. A printer treats overlaps as solid, so merge the shells
  // into one solid and work from that outer surface only.
  let merged = 0;
  {
    const shells = model.decompose();
    const solid = shells.filter((m) => m.volume() > 1e-9);
    const dropped = shells.length - solid.length;
    if (!solid.length) throw new Error('This STL has no solid volume (its faces may point inward). Repair it and try again.');
    if (shells.length > 1) {
      await progress(`Merging ${solid.length} overlapping shells…`);
      model = keep(solid.length === 1 ? solid[0].translate([0, 0, 0]) : wasm.Manifold.union(solid));
      positions = manifoldToTriangles(model);
      merged = solid.length > 1 ? solid.length : 0;
      if (dropped) merged = Math.max(merged, 1);
    }
    for (const m of shells) m.delete();
  }
  const bb = model.boundingBox();
  const size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  if (bb.min[2] >= -1e-6 || bb.max[2] <= 1e-6) throw new Error('The cut plane doesn\'t pass through the model.');

  // Grid spacing comes from the detail setting. Walls stay accurate even when they're thinner
  // than a grid cell, because distances near the wall are measured exactly. The voxel cap keeps
  // memory within what a browser tab can handle.
  let h = Math.max(...size) / (opts.resolution || 140);
  const vox = (hh) => (size[0] / hh + 8) * (size[1] / hh + 8) * (size[2] / hh + 8);
  while (vox(h) > (opts.maxVoxels || 6e6)) h *= 1.05;
  const pad = 3;
  const ox = bb.min[0] - pad * h, oy = bb.min[1] - pad * h, oz = bb.min[2] - pad * h;
  const nx = Math.ceil(size[0] / h) + 2 * pad, ny = Math.ceil(size[1] / h) + 2 * pad, nz = Math.ceil(size[2] / h) + 2 * pad;

  await progress(`Measuring wall space (${nx}×${ny}×${nz} grid)…`);
  const inside = voxelizeInside(positions, ox, oy, oz, h, nx, ny, nz);
  const N = nx * ny * nz;
  // Rough distances: from each cell to the nearest cell that is outside or that the surface
  // passes through. Marking surface cells matters for folds and slots thinner than a cell,
  // whose outside space would otherwise be missed by every cell centre.
  const touched = markSurfaceCells(positions, ox, oy, oz, h, nx, ny, nz);
  const field = new Float64Array(N);
  for (let i = 0; i < N; i++) field[i] = inside[i] && !touched[i] ? 1e20 : 0;
  edt3d(field, nx, ny, nz);
  for (let i = 0; i < N; i++) field[i] = inside[i] ? Math.sqrt(field[i]) * h : -h;

  // Refine distances near the wall-thickness level with exact distances to the surface.
  await progress('Refining wall distances…');
  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(positions, 3));
  const bvh = new MeshBVH(geom);
  const p = new Vector3();
  const target = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const band = 2 * h; // rough distances are within about 1.7 cells of the truth
  const smoothR = opts.smooth ? Math.max(h, opts.smoothRadius || 8) : 0;
  // Only the container side matters (plus the reach of the smoothing ball above the cut).
  const kMax = Math.min(nz, Math.ceil((smoothR + 4 * h - oz) / h));
  let refined = 0;
  for (let k = 0; k < kMax; k++) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const idx = (k * ny + j) * nx + i;
      let sign = 1;
      if (inside[idx]) {
        if (Math.abs(field[idx] - wall) > band) continue;
      } else {
        // Outside cells only matter when the wall is thinner than the band: then the cells
        // just outside the surface need true (negative) distances too.
        if (wall > band) continue;
        const nb = (i > 0 && inside[idx - 1]) || (i < nx - 1 && inside[idx + 1]) ||
          (j > 0 && inside[idx - nx]) || (j < ny - 1 && inside[idx + nx]) ||
          (k > 0 && inside[idx - nx * ny]) || (k < nz - 1 && inside[idx + nx * ny]);
        if (!nb) continue;
        sign = -1;
      }
      p.set(ox + (i + 0.5) * h, oy + (j + 0.5) * h, oz + (k + 0.5) * h);
      const r = bvh.closestPointToPoint(p, target);
      if (r) { field[idx] = sign * r.distance; refined++; }
    }
    if (k % 16 === 0) await progress(`Refining wall distances… ${Math.round(100 * k / nz)}%`);
  }

  const trilinear = (f, x, y, z, outside) => {
    const fx = (x - ox) / h - 0.5, fy = (y - oy) / h - 0.5, fz = (z - oz) / h - 0.5;
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
    if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return outside;
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const at = (a, b, c) => f[((k + c) * ny + (j + b)) * nx + (i + a)];
    const c00 = at(0, 0, 0) * (1 - tx) + at(1, 0, 0) * tx;
    const c10 = at(0, 1, 0) * (1 - tx) + at(1, 1, 0) * tx;
    const c01 = at(0, 0, 1) * (1 - tx) + at(1, 0, 1) * tx;
    const c11 = at(0, 1, 1) * (1 - tx) + at(1, 1, 1) * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  };

  // The surface is simplified afterwards; pad the level by the same tolerance so walls never get
  // thinner. The extra margin covers folds narrower than a grid cell, which the grid can't see
  // between its sample points (checked against exact distances on detailed models).
  const tol = Math.min(0.05, 0.15 * h);
  const level = wall + tol + (opts.margin ?? (wall < h ? 0.65 : 0.5)) * h;
  const distAt = (x, y, z) => trilinear(field, x, y, z, -h);

  // Only build the cavity below the cut (plus a sliver above it so the opening is clean).
  const lb = { min: [ox, oy, oz], max: [ox + nx * h, oy + ny * h, Math.min(oz + nz * h, 2 * h)] };
  let dense;
  if (!smoothR) {
    await progress('Shaping the hollow…');
    dense = keep(wasm.Manifold.levelSet(([x, y, z]) => distAt(x, y, z), lb, h, level));
  } else {
    // Smooth inside: roll a ball of radius R around the hollow and keep only where it reaches.
    // Step 1: the space the ball's centre can reach (the hollow shrunk by R).
    await progress('Smoothing the inside: finding where the ball fits…');
    const coreTop = Math.min(oz + nz * h, 2 * h + smoothR + 2 * h);
    const coreBounds = { min: [ox, oy, oz], max: [ox + nx * h, oy + ny * h, coreTop] };
    const core = keep(wasm.Manifold.levelSet(([x, y, z]) => distAt(x, y, z) - smoothR, coreBounds, h, level));
    if (core.isEmpty()) {
      throw new Error(`A ${smoothR} mm smoothing ball doesn't fit inside this part. Try a smaller smoothness, a thinner wall, or move the cut.`);
    }
    // Step 2: grow it back by R. Rough distances from a grid, exact ones near the surface.
    await progress('Smoothing the inside: rolling the ball…');
    const coreTri = manifoldToTriangles(core);
    const coreGeom = new BufferGeometry();
    coreGeom.setAttribute('position', new BufferAttribute(coreTri, 3));
    const coreBvh = new MeshBVH(coreGeom);
    const reach = new Float64Array(N);
    for (let i = 0; i < N; i++) reach[i] = field[i] >= level + smoothR ? 0 : 1e20;
    edt3d(reach, nx, ny, nz);
    for (let i = 0; i < N; i++) reach[i] = field[i] >= level + smoothR ? field[i] - level : smoothR - Math.sqrt(reach[i]) * h;
    const t2 = { point: new Vector3(), distance: 0, faceIndex: 0 };
    const kTop = Math.min(nz, Math.ceil((3 * h - oz) / h));
    for (let k = 0; k < kTop; k++) {
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const idx = (k * ny + j) * nx + i;
        if (field[idx] >= level + smoothR || Math.abs(reach[idx]) > 2 * h) continue;
        p.set(ox + (i + 0.5) * h, oy + (j + 0.5) * h, oz + (k + 0.5) * h);
        const r = coreBvh.closestPointToPoint(p, t2);
        if (r) reach[idx] = smoothR - r.distance;
      }
      if (k % 16 === 0) await progress(`Smoothing the inside: rolling the ball… ${Math.round(100 * k / kTop)}%`);
    }
    // Blur the ball's sweep a little to round off the creases where neighbouring ball
    // positions meet. Blurring can push the surface towards a wall in places; the wall
    // check below stops it there.
    await progress('Smoothing the inside: blending…');
    blur3d(reach, nx, ny, kTop + Math.ceil(smoothR / h) + 2, nx, ny, nz, Math.max(h, 0.3 * smoothR) / h);
    const ballAt = (x, y, z) => trilinear(reach, x, y, z, -smoothR);
    await progress('Smoothing the inside: shaping the hollow…');
    // The ball's sweep never reaches past the walls, but keep the wall check as a backstop.
    // Keep the blended surface a little inside the ball's sweep, so it rarely meets the wall
    // limit (where the outside's texture would show through). The wall check is the backstop.
    const inset = 0.1 * smoothR;
    dense = keep(wasm.Manifold.levelSet(([x, y, z]) => Math.min(ballAt(x, y, z) - inset, distAt(x, y, z) - level), lb, h, 0));
    coreGeom.dispose();
  }
  const rawCavity = keep(dense.simplify(tol));
  const capped = keep(rawCavity.trimByPlane([0, 0, -1], -h)); // keep z <= h

  // Keep only the hollow pockets that reach the opening (no sealed-in air bubbles).
  const parts = capped.decompose();
  const open = [];
  for (const part of parts) {
    garbage.push(part);
    if (part.boundingBox().max[2] > 0.5 * h && part.volume() > 0) open.push(part);
  }
  if (!open.length) {
    throw new Error('There isn\'t room for a hollow with that wall thickness at this cut. ' +
      'Try a thinner wall or move the cut plane.');
  }
  const cavity = keep(open.length === 1 ? open[0] : wasm.Manifold.union(open));

  await progress('Cutting the container…');
  const bottomHalf = keep(model.trimByPlane([0, 0, -1], 0));
  const container = bottomHalf.subtract(cavity);

  await progress('Fitting the lid…');
  const topHalf = keep(model.trimByPlane([0, 0, 1], 0));
  // The plug's outline is the opening, narrowed to whatever still fits at every depth
  // it reaches (so it can slide straight in), then shrunk by the clearance.
  let outline = null;
  let depth = Math.max(0, lipDepth);
  const cavDepth = -cavity.boundingBox().min[2];
  depth = Math.min(depth, Math.max(0, cavDepth - h));
  const step = Math.max(h / 2, depth / 60);
  const sliceGarbage = [];
  for (let z = -Math.min(h * 0.25, 0.01); z >= -depth - 1e-9; z -= step) {
    const s = cavity.slice(z); sliceGarbage.push(s);
    if (outline === null) outline = s;
    else { outline = outline.intersect(s); sliceGarbage.push(outline); }
  }
  {
    const s = cavity.slice(-depth); sliceGarbage.push(s);
    if (outline) { outline = outline.intersect(s); sliceGarbage.push(outline); }
  }
  let lid, plugInfo = { depth: 0 };
  let plugOutline = outline ? outline.offset(-clearance, 'Round') : null;
  if (plugOutline) sliceGarbage.push(plugOutline);
  if (plugOutline && depth > 0 && plugOutline.area() > 1e-6) {
    const plug = keep(plugOutline.extrude(depth + 0.5 * h).translate([0, 0, -depth]));
    lid = topHalf.add(plug);
    plugInfo = { depth };
  } else {
    lid = topHalf.translate([0, 0, 0]);
  }
  for (const s of sliceGarbage) { try { s.delete(); } catch (e) {} }

  const result = {
    container, lid,
    info: {
      gridSpacing: h, refined, mergedShells: merged, smoothRadius: smoothR, plugDepth: plugInfo.depth,
      cavityVolume: cavity.volume(), modelVolume: model.volume(),
      containerVolume: container.volume(), lidVolume: lid.volume(),
    },
  };
  for (const g of garbage) { try { g.delete(); } catch (e) {} }
  geom.dispose();
  return result;
}

export function manifoldToTriangles(m) {
  const mesh = m.getMesh();
  const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts;
  const out = new Float32Array(tv.length * 3);
  for (let t = 0; t < tv.length; t++) {
    const v = tv[t] * np;
    out[t * 3] = vp[v]; out[t * 3 + 1] = vp[v + 1]; out[t * 3 + 2] = vp[v + 2];
  }
  return out;
}

export function trianglesToSTL(tri, name = 'part') {
  const n = tri.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const header = `${name} - made with STL Container Maker`.slice(0, 80);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i));
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const b = t * 9;
    const ux = tri[b + 3] - tri[b], uy = tri[b + 4] - tri[b + 1], uz = tri[b + 5] - tri[b + 2];
    const vx = tri[b + 6] - tri[b], vy = tri[b + 7] - tri[b + 1], vz = tri[b + 8] - tri[b + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
    o += 12;
    for (let k = 0; k < 9; k++) { dv.setFloat32(o, tri[b + k], true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return buf;
}

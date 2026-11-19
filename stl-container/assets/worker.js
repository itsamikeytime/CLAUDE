// Runs the geometry work off the page's main thread so the page stays responsive.
// Import maps don't apply inside workers, so libraries are imported by full URL.
// three-mesh-bvh is loaded through jsDelivr's /+esm build, which rewrites its `three` import.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { MeshBVH } from 'https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.9.1/+esm';
import Module from 'https://cdn.jsdelivr.net/npm/manifold-3d@3.5.5/manifold.js';
import { makeContainerAndLid, manifoldToTriangles } from './core.js?v=20261119-4';

let wasmPromise = null;
function getWasm() {
  if (!wasmPromise) {
    wasmPromise = fetch(new URL('./manifold.wasm', import.meta.url))
      .then((r) => (r.ok && /wasm|octet/.test(r.headers.get('content-type') || '') ? r.arrayBuffer() : null))
      .catch(() => null)
      .then((bin) => Module(bin ? { wasmBinary: bin } : {}))
      .then((w) => { w.setup(); return w; });
  }
  return wasmPromise;
}

self.onmessage = async (e) => {
  const { type, positions, opts } = e.data;
  if (type !== 'run') return;
  try {
    self.postMessage({ type: 'progress', message: 'Loading the geometry engine…' });
    const wasm = await getWasm();
    const r = await makeContainerAndLid(
      { wasm, BufferGeometry: THREE.BufferGeometry, BufferAttribute: THREE.BufferAttribute, Vector3: THREE.Vector3, MeshBVH },
      positions,
      { ...opts, onProgress: async (message) => self.postMessage({ type: 'progress', message }) });
    const parts = {};
    for (const k of ['container', 'lid', 'lidTop', 'lidInsert']) {
      if (r[k]) { parts[k] = manifoldToTriangles(r[k]); r[k].delete(); }
    }
    self.postMessage({ type: 'done', parts, info: r.info }, Object.values(parts).map((p) => p.buffer));
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};

self.postMessage({ type: 'ready' });

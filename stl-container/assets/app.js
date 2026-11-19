import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { MeshBVH } from 'three-mesh-bvh';
import Module from 'manifold-3d';
import { makeContainerAndLid, manifoldToTriangles, trianglesToSTL } from './core.js';

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------- Geometry engine (loads in the background) ----------
let wasmPromise = null;
function getWasm() {
  if (!wasmPromise) {
    // Use a copy of the engine served next to this page when there is one (some hosts
    // only allow scripts from the CDN); otherwise Module() fetches it from the CDN.
    wasmPromise = fetch(new URL('./manifold.wasm', import.meta.url))
      .then((r) => (r.ok && /wasm|octet/.test(r.headers.get('content-type') || '') ? r.arrayBuffer() : null))
      .catch(() => null)
      .then((bin) => Module(bin ? { wasmBinary: bin } : {}))
      .then((w) => { w.setup(); return w; });
  }
  return wasmPromise;
}

// ---------- Viewer ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
camera.up.set(0, 0, 1); // STL files are usually Z-up
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
scene.add(key);
scene.add(camera);
camera.add(key);
key.position.set(1, 2, 3);

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

function applyTheme() {
  scene.background = new THREE.Color(css('--viewer') || '#e6ebe7');
  containerMat.color.set(css('--container') || '#2f9a62');
  lidMat.color.set(css('--lid') || '#3f7fd9');
  resContainerMat.color.set(css('--container') || '#2f9a62');
  resLidMat.color.set(css('--lid') || '#3f7fd9');
  resInsertMat.color.set(css('--insert') || '#8a63d8');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
// A host page can also switch the theme by setting data-theme on <html>.
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

(function loop() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
})();

// ---------- State ----------
const state = {
  positions: null,       // Float32Array triangle soup, centred on the origin
  radius: 1,
  axis: 'z',
  frac: 0.65,
  tiltA: 0, tiltB: 0,
  swapped: false,
  wall: 2, plug: 5, clearance: 0.2, res: 140, smooth: false, smoothR: 12, splitLid: false, dowelD: 4, dowelL: 5, insertUp: 3,
  result: null,          // { container: Float32Array, lid: Float32Array, M, Minv, info }
  busy: false,
};

// Materials: the model is drawn twice, each copy clipped to one side of the plane.
const lidPlane = new THREE.Plane();
const containerPlane = new THREE.Plane();
const containerMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, clippingPlanes: [containerPlane] });
const lidMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, clippingPlanes: [lidPlane] });
const resContainerMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
const resLidMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });

const modelGroup = new THREE.Group();
scene.add(modelGroup);
let modelGeom = null;

const planeMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
const planeEdge = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
  new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.5 }));
planeMesh.add(planeEdge);
planeMesh.visible = false;
scene.add(planeMesh);

const resultGroup = new THREE.Group();
resultGroup.matrixAutoUpdate = false;
scene.add(resultGroup);
const resContainer = new THREE.Mesh(new THREE.BufferGeometry(), resContainerMat);
const resLid = new THREE.Mesh(new THREE.BufferGeometry(), resLidMat);
const resInsertMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
const resInsert = new THREE.Mesh(new THREE.BufferGeometry(), resInsertMat);
resultGroup.add(resContainer, resLid, resInsert);
resultGroup.visible = false;

applyTheme();

// ---------- Plane math ----------
const AXES = {
  x: { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  y: { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  z: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
};
function planeNormal() {
  const a = AXES[state.axis];
  const n = new THREE.Vector3(...a.n);
  n.applyAxisAngle(new THREE.Vector3(...a.u), THREE.MathUtils.degToRad(state.tiltA));
  n.applyAxisAngle(new THREE.Vector3(...a.v), THREE.MathUtils.degToRad(state.tiltB));
  return n.normalize();
}
function extentAlong(n) {
  const p = state.positions;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const d = p[i] * n.x + p[i + 1] * n.y + p[i + 2] * n.z;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return [lo, hi];
}
// The plane as used for the cut: lid on the +normal side, container on the −normal side.
function cutPlane() {
  const n = planeNormal();
  const [lo, hi] = extentAlong(n);
  let d = lo + state.frac * (hi - lo);
  const out = { n, d, lo, hi };
  if (state.swapped) { out.n = n.clone().negate(); out.d = -d; }
  return out;
}

function updatePlaneView() {
  if (!state.positions) return;
  const { n, d, lo, hi } = cutPlane();
  lidPlane.set(n.clone(), -d);
  containerPlane.set(n.clone().negate(), d);
  const size = state.radius * 2.6;
  planeMesh.scale.set(size, size, 1);
  planeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  planeMesh.position.copy(n).multiplyScalar(d);
  $('posNum').value = (state.frac * (hi - lo)).toFixed(1);
  $('posNum').max = (hi - lo).toFixed(1);
}

// ---------- Loading ----------
const loader = new STLLoader();
function setModel(geometry, name) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('normal');
  g.computeBoundingBox();
  const c = new THREE.Vector3();
  g.boundingBox.getCenter(c);
  g.translate(-c.x, -c.y, -c.z);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const s = new THREE.Vector3();
  g.boundingBox.getSize(s);

  state.positions = new Float32Array(g.attributes.position.array);
  state.radius = g.boundingSphere.radius;
  // Default smoothing ball: about a tenth of the model's largest size.
  state.smoothR = Math.max(2, Math.min(50, Math.round(Math.max(s.x, s.y, s.z) / 10)));
  $('smoothR').value = state.smoothR; $('smoothNum').value = state.smoothR;
  // Default dowel pins scale with the model too: 3 mm on small parts up to 8 mm on big ones.
  state.dowelD = Math.max(3, Math.min(8, Math.round(Math.max(s.x, s.y, s.z) / 25 * 2) / 2));
  state.dowelL = Math.max(4, Math.min(10, Math.round(state.dowelD * 1.5)));
  $('dowelD').value = state.dowelD; $('dowelDNum').value = state.dowelD;
  $('dowelL').value = state.dowelL; $('dowelLNum').value = state.dowelL;
  state.insertUp = Math.max(2, Math.min(6, Math.round(Math.max(s.x, s.y, s.z) / 30 * 2) / 2));
  $('insertUp').value = state.insertUp; $('insertUpNum').value = state.insertUp;
  state.name = name.replace(/\.stl$/i, '');
  clearResult();

  if (modelGeom) modelGeom.dispose();
  modelGeom = g;
  modelGroup.clear();
  modelGroup.add(new THREE.Mesh(g, containerMat), new THREE.Mesh(g, lidMat));
  planeMesh.visible = true;

  const tris = state.positions.length / 9;
  $('fileInfo').textContent = `${name} · ${s.x.toFixed(1)} × ${s.y.toFixed(1)} × ${s.z.toFixed(1)} mm · ${tris.toLocaleString()} triangles`;
  $('empty').classList.add('hidden');
  $('planeSec').classList.remove('hidden');
  for (const id of ['containerSec', 'lidSec', 'makeSec']) $(id).classList.remove('hidden');
  setStatus('');
  updatePlaneView();
  fitView();
}

function fitView(margin = 1.15) {
  const r = state.radius || 50;
  const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * margin;
  camera.position.set(dist * 0.62, -dist * 0.62, dist * 0.48);
  camera.near = r / 100; camera.far = r * 100;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

function readFile(file) {
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const g = loader.parse(fr.result);
      if (!g.attributes.position || g.attributes.position.count < 12) throw new Error('empty');
      setModel(g, file.name);
    } catch (e) {
      setStatus('That file couldn\'t be read as an STL.', true);
      $('makeSec').classList.remove('hidden');
    }
  };
  fr.readAsArrayBuffer(file);
}

const drop = $('drop');
drop.addEventListener('click', () => $('file').click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
$('file').addEventListener('change', (e) => readFile(e.target.files[0]));
for (const t of [drop, canvas]) {
  t.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  t.addEventListener('dragleave', () => drop.classList.remove('over'));
  t.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files[0]); });
}
$('sample').addEventListener('click', (e) => {
  e.preventDefault();
  // An egg-like pebble, 50 mm tall.
  const g = new THREE.SphereGeometry(20, 96, 48);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const k = 1 - 0.18 * (z / 20);
    p.setXYZ(i, p.getX(i) * k * 1.1, p.getY(i) * k * 0.85, z * 1.25);
  }
  setModel(g, 'sample-pebble.stl');
});

// ---------- Controls ----------
function bindPair(rangeId, numId, keyName, onChange) {
  const r = $(rangeId), n = $(numId);
  r.addEventListener('input', () => { n.value = r.value; state[keyName] = +r.value; onChange(); });
  n.addEventListener('change', () => {
    const v = Math.max(+n.min || -Infinity, +n.value || 0);
    n.value = v;
    if (v > +r.max) r.max = v;
    r.value = v; state[keyName] = v; onChange();
  });
}
function planeChanged() { clearResult(); updatePlaneView(); }
function settingsChanged() { if (state.result) clearResult(); }

bindPair('tiltA', 'tiltANum', 'tiltA', planeChanged);
bindPair('tiltB', 'tiltBNum', 'tiltB', planeChanged);
bindPair('wall', 'wallNum', 'wall', settingsChanged);
bindPair('smoothR', 'smoothNum', 'smoothR', settingsChanged);
bindPair('dowelD', 'dowelDNum', 'dowelD', settingsChanged);
bindPair('insertUp', 'insertUpNum', 'insertUp', settingsChanged);
bindPair('dowelL', 'dowelLNum', 'dowelL', settingsChanged);
$('splitLid').addEventListener('change', () => {
  state.splitLid = $('splitLid').checked;
  $('dowelBox').classList.toggle('hidden', !state.splitLid);
  settingsChanged();
});
for (const b of $('inside').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    state.smooth = b.dataset.smooth === '1';
    for (const o of $('inside').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
    $('smoothBox').classList.toggle('hidden', !state.smooth);
    settingsChanged();
  });
}
bindPair('plug', 'plugNum', 'plug', settingsChanged);
bindPair('clear', 'clearNum', 'clearance', settingsChanged);

$('pos').addEventListener('input', () => { state.frac = $('pos').value / 1000; planeChanged(); });
$('posNum').addEventListener('change', () => {
  const n = planeNormal();
  const [lo, hi] = extentAlong(n);
  const mm = Math.min(hi - lo, Math.max(0, +$('posNum').value || 0));
  state.frac = (hi - lo) > 0 ? mm / (hi - lo) : 0.5;
  $('pos').value = Math.round(state.frac * 1000);
  planeChanged();
});

for (const b of $('axis').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    state.axis = b.dataset.axis;
    for (const o of $('axis').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
    planeChanged();
  });
}
for (const b of $('detail').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    state.res = +b.dataset.res;
    for (const o of $('detail').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
    settingsChanged();
  });
}
$('swap').addEventListener('click', () => { state.swapped = !state.swapped; planeChanged(); });
$('resetView').addEventListener('click', () => fitView(resultGroup.visible ? 1.5 : 1.15));
$('backToCut').addEventListener('click', () => { showResult(false); });
$('explode').addEventListener('input', applyExplode);

// ---------- Make ----------
function setStatus(msg, isError = false) {
  const s = $('status');
  s.textContent = msg;
  s.classList.toggle('error', isError);
}
function setBusy(msg) {
  const b = $('busy');
  b.textContent = msg || '';
  b.classList.toggle('on', !!msg);
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

$('make').addEventListener('click', async () => {
  if (!state.positions || state.busy) return;
  state.busy = true;
  $('make').disabled = true;
  setStatus('');
  try {
    setBusy('Starting…');
    await nextFrame();

    const { n, d } = cutPlane();
    // Cut frame: the plane becomes z = 0, lid above, container below.
    const R = new THREE.Matrix4().makeRotationFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 0, 1)));
    const M = R.multiply(new THREE.Matrix4().makeTranslation(-n.x * d, -n.y * d, -n.z * d));
    const Minv = M.clone().invert();
    const pos = new Float32Array(state.positions);
    const e = M.elements;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      pos[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }

    const t0 = performance.now();
    const opts = { wall: state.wall, clearance: state.clearance, lipDepth: state.plug, resolution: state.res, smooth: state.smooth, smoothRadius: state.smoothR,
      splitLid: state.splitLid, dowelDiameter: state.dowelD, dowelLength: state.dowelL, insertUp: state.insertUp };
    let r = await runInWorker(pos, opts);
    if (!r) r = await runOnPage(pos, opts);
    state.result = { ...r.parts, M, Minv, info: r.info, seconds: (performance.now() - t0) / 1000 };
    buildResultMeshes();
    showResult(true);
    fitView(1.5);
    let msg = '';
    if (state.plug > 0 && r.info.plugDepth < state.plug - 0.01) {
      msg = r.info.plugDepth > 0
        ? `The hollow is shallow here, so the plug was shortened to ${r.info.plugDepth.toFixed(1)} mm.`
        : 'The hollow is too shallow for a plug, so the lid is flat.';
    }
    const dw = r.info.dowels;
    if (dw && !dw.count) msg += ' There was no spot with enough material for dowel pins, so glue the insert on flat.';
    if (dw && dw.pocketsDropped) msg += ` ${dw.pocketsDropped === dw.pieces ? 'The lid was too thin for both a pocket and pins, so the insert' : `${dw.pocketsDropped} insert piece${dw.pocketsDropped > 1 ? 's' : ''}`} ${dw.pocketsDropped === dw.pieces ? 'stops' : (dw.pocketsDropped > 1 ? 'stop' : 'stops')} at the lid's cut face${dw.pocketsDropped === dw.pieces ? '' : ' (no room for both a pocket and pins there)'}; the pins go straight into the cut face.`;
    if (dw && dw.count && dw.piecesWithout) msg += ` The insert is ${dw.pieces} separate pieces; ${dw.piecesWithout} of them had no room for a pin, so glue those on flat.`;
    if (dw && dw.count && (dw.diameter < state.dowelD - 1e-6 || dw.length < state.dowelL - 1e-6)) {
      msg += ` The dowels were made ${dw.diameter.toFixed(1)} mm × ${dw.length.toFixed(1)} mm so they fit.`;
    }
    if (r.info.mergedShells) {
      msg = 'This STL was made of several overlapping pieces; they were merged into one solid first. ' + msg;
    }
    setStatus(msg.trim());
  } catch (err) {
    console.error(err);
    setStatus(err && err.message ? err.message : String(err), true);
  } finally {
    setBusy('');
    state.busy = false;
    $('make').disabled = false;
  }
});

// The work runs in a background worker so the page doesn't freeze. If the worker can't
// start (for example a host that blocks it), it runs on the page instead.
let worker = null, workerReady = null;
function startWorker() {
  if (workerReady) return workerReady;
  workerReady = new Promise((resolve) => {
    let w;
    try { w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch (e) { resolve(null); return; }
    const timer = setTimeout(() => { w.terminate(); resolve(null); }, 30000);
    w.onmessage = (e) => { if (e.data.type === 'ready') { clearTimeout(timer); resolve(w); } };
    w.onerror = (e) => { e.preventDefault(); clearTimeout(timer); w.terminate(); resolve(null); };
  });
  return workerReady.then((w) => (worker = w));
}
startWorker();

async function runInWorker(positions, opts) {
  const w = await startWorker();
  if (!w) return null;
  return new Promise((resolve, reject) => {
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'progress') setBusy(d.message);
      else if (d.type === 'done') resolve({ parts: d.parts, info: d.info });
      else if (d.type === 'error') reject(new Error(d.message));
    };
    w.onerror = (e) => {
      e.preventDefault();
      // The worker died (usually out of memory). Start a fresh one next time.
      w.terminate(); workerReady = null; worker = null;
      reject(new Error('The browser ran out of memory. Try the Draft detail setting, or a smaller model.'));
    };
    w.postMessage({ type: 'run', positions, opts }, [positions.buffer]);
  });
}

async function runOnPage(positions, opts) {
  setBusy('Loading the geometry engine…');
  await nextFrame();
  const wasm = await getWasm();
  const r = await makeContainerAndLid(
    { wasm, BufferGeometry: THREE.BufferGeometry, BufferAttribute: THREE.BufferAttribute, Vector3: THREE.Vector3, MeshBVH },
    positions,
    { ...opts, onProgress: async (m) => { setBusy(m); await nextFrame(); } });
  const parts = {};
  for (const k of ['container', 'lid', 'lidTop', 'lidInsert']) if (r[k]) { parts[k] = manifoldToTriangles(r[k]); r[k].delete(); }
  return { parts, info: r.info };
}

function geomFrom(tri) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(tri, 3));
  g.computeVertexNormals();
  return g;
}

function buildResultMeshes() {
  const r = state.result;
  const split = !!r.lidTop;
  for (const m of [resContainer, resLid, resInsert]) m.geometry.dispose();
  resContainer.geometry = geomFrom(r.container);
  resLid.geometry = geomFrom(split ? r.lidTop : r.lid);
  resInsert.geometry = split ? geomFrom(r.lidInsert) : new THREE.BufferGeometry();
  resInsert.visible = split;
  $('dlLid').classList.toggle('hidden', split);
  $('dlLidTop').classList.toggle('hidden', !split);
  $('dlLidInsert').classList.toggle('hidden', !split);
  $('orientHint').textContent = split
    ? 'Container opening up, lid top on its flat cut face, insert with its pins pointing up.'
    : 'Container opening up, lid flipped so the plug points up.';
  resultGroup.matrix.copy(r.Minv);
  resultGroup.matrixWorldNeedsUpdate = true;
  applyExplode();

  const i = r.info;
  const ml = (v) => (v / 1000).toFixed(1) + ' cm³';
  $('stats').innerHTML =
    `<span>Hollow inside</span><b>${ml(i.cavityVolume)}</b>` +
    `<span>Container material</span><b>${ml(i.containerVolume)}</b>` +
    `<span>Lid material</span><b>${ml(i.lidVolume)}</b>` +
    `<span>Inside surface</span><b>${i.smoothRadius ? `Smooth (${i.smoothRadius} mm ball)` : 'Follows outside'}</b>` +
    `<span>Plug depth</span><b>${i.plugDepth.toFixed(1)} mm</b>` +
    (i.dowels ? `<span>Dowels</span><b>${i.dowels.count ? `${i.dowels.count} × ${i.dowels.diameter.toFixed(1)} mm, ${Math.max(0.5, i.dowels.length - state.clearance).toFixed(1)} mm long` : 'none (glue flat)'}</b>` + `<span>Insert into lid</span><b>${i.dowels.up ? `${(i.dowels.up - state.clearance).toFixed(1)} mm (pocket ${i.dowels.up.toFixed(1)} mm)` : 'none'}</b>` + (i.dowels.pieces > 1 ? `<span>Insert pieces</span><b>${i.dowels.pieces}</b>` : '') : '') +
    `<span>Accuracy</span><b>${i.gridSpacing.toFixed(2)} mm grid · ${r.seconds.toFixed(1)} s</b>`;
}

function applyExplode() {
  const gap = ($('explode').value / 100) * state.radius * 1.2;
  resContainer.position.set(0, 0, -gap / 2);
  if (resInsert.visible) {
    resInsert.position.set(0, 0, 0);
    resLid.position.set(0, 0, gap);
  } else {
    resLid.position.set(0, 0, gap / 2);
  }
}

function showResult(on) {
  resultGroup.visible = on && !!state.result;
  modelGroup.visible = !resultGroup.visible;
  planeMesh.visible = !resultGroup.visible && !!state.positions;
  $('resultSec').classList.toggle('hidden', !resultGroup.visible);
  if (on && state.result) $('resultSec').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearResult() {
  if (!state.result) return;
  state.result = null;
  showResult(false);
}

// ---------- Download ----------
function exportTriangles(which) {
  const r = state.result;
  const src = r[which];
  const out = new Float32Array(src.length);
  if ($('printOrient').checked) {
    // Container: opening already faces up (+z). Lid: flip so the plug points up.
    // Lid top and insert are already the right way up (flat cut face down, pins up).
    const flip = which === 'lid';
    let minZ = Infinity;
    for (let i = 0; i < src.length; i += 3) {
      out[i] = src[i];
      out[i + 1] = flip ? -src[i + 1] : src[i + 1];
      out[i + 2] = flip ? -src[i + 2] : src[i + 2];
      if (out[i + 2] < minZ) minZ = out[i + 2];
    }
    for (let i = 2; i < out.length; i += 3) out[i] -= minZ;
  } else {
    const e = r.Minv.elements;
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2];
      out[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      out[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      out[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  }
  return out;
}
// Inside a claude.ai artifact, files can only be saved through the viewer's download
// prompt, which doesn't accept .stl, so the part goes out inside a .zip there.
let savePromise = null;
function viewerDownloads() {
  if (!savePromise) {
    savePromise = window.claude && typeof window.claude.use === 'function'
      ? window.claude.use('downloads').catch(() => null)
      : Promise.resolve(null);
  }
  return savePromise;
}
viewerDownloads();

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files) { // [{name, data: Uint8Array}] -> Blob (stored, no compression)
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = new TextEncoder().encode(f.name), crc = crc32(f.data), size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true);
    h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
    parts.push(h.buffer, name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(c.buffer, name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, b) => a + b.byteLength, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}

async function download(which) {
  if (!state.result) return;
  const base = state.name || 'model';
  const label = { container: 'container', lid: 'lid', lidTop: 'lid-top', lidInsert: 'lid-insert' };
  const list = which === 'both' ? ['container', 'lid', 'lidTop', 'lidInsert'].filter((k) => state.result[k]) : [which];
  const files = list.map((w) => ({
    name: `${base}-${label[w]}.stl`,
    data: new Uint8Array(trianglesToSTL(exportTriangles(w), `${base}-${label[w]}`)),
  }));
  const dl = await viewerDownloads();
  if (dl) {
    const filename = which === 'both' ? `${base}-all-parts.zip` : `${base}-${label[which]}.zip`;
    try {
      await dl.save({ filename, data: zip(files) });
      setStatus(`Saved ${filename}. Unzip it to get the STL.`);
    } catch (err) {
      if (err && err.code !== 'declined') setStatus('This view can\'t save files. Open the page in a browser tab to download.', true);
    }
    return;
  }
  const blob = which === 'both' ? zip(files) : new Blob([files[0].data], { type: 'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = which === 'both' ? `${base}-all-parts.zip` : files[0].name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('dlContainer').addEventListener('click', () => download('container'));
$('dlLid').addEventListener('click', () => download('lid'));
$('dlBoth').addEventListener('click', () => download('both'));
$('dlLidTop').addEventListener('click', () => download('lidTop'));
$('dlLidInsert').addEventListener('click', () => download('lidInsert'));

// ---------- Dual-screen and foldable devices ----------
// The layout itself is responsive CSS (no device detection). On top of that, when the browser
// reports that a fold or hinge splits the screen (viewport segments), or that a foldable is
// half-open (device posture "folded"), put the 3D view on one side of the fold and the settings
// on the other. Both APIs are optional; without them nothing changes. Add #duo to the address
// to preview the split layout on any screen.
const root = document.documentElement;
const postureFolded = () =>
  (navigator.devicePosture && navigator.devicePosture.type === 'folded') ||
  matchMedia('(device-posture: folded)').matches;
function detectDual() {
  let mode = null;
  const segs = window.viewport && window.viewport.segments;
  if (segs && segs.length > 1) {
    mode = segs[0].width < window.innerWidth - 1 ? 'h' : 'v';
  } else if (matchMedia('(horizontal-viewport-segments: 2)').matches) {
    mode = 'h';
  } else if (matchMedia('(vertical-viewport-segments: 2)').matches) {
    mode = 'v';
  } else if (postureFolded()) {
    // Half-open but no segment info: a book-style fold runs down the middle in portrait
    // and across the middle in landscape.
    mode = window.innerWidth < window.innerHeight ? 'h' : 'v';
  }
  if (!mode && location.hash === '#duo') mode = window.innerWidth >= window.innerHeight ? 'h' : 'v';
  root.classList.toggle('dual', !!mode);
  root.classList.toggle('dual-h', mode === 'h');
  root.classList.toggle('dual-v', mode === 'v');
}
try { if (localStorage.getItem('duoSwapped') === '1') root.classList.add('swapped'); } catch (e) {}
$('duoSwap').addEventListener('click', () => {
  const on = root.classList.toggle('swapped');
  try { localStorage.setItem('duoSwapped', on ? '1' : '0'); } catch (e) {}
});
// Folding or unfolding changes the viewport without a reload; re-check on every signal.
window.addEventListener('resize', detectDual);
window.addEventListener('orientationchange', detectDual);
window.addEventListener('hashchange', detectDual);
if (window.visualViewport) window.visualViewport.addEventListener('resize', detectDual);
if (window.viewport && 'onsegmentschange' in window.viewport) window.viewport.addEventListener('segmentschange', detectDual);
if (navigator.devicePosture && navigator.devicePosture.addEventListener) navigator.devicePosture.addEventListener('change', detectDual);
for (const q of ['(device-posture: folded)', '(horizontal-viewport-segments: 2)', '(vertical-viewport-segments: 2)']) {
  const m = matchMedia(q);
  if (m.addEventListener) m.addEventListener('change', detectDual);
}
detectDual();

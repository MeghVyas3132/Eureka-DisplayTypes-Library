// Physically-lit 3D renders for the displays where flat 2D fakes fall short:
// folded stacks and side/spine-hung rails. The product photo is never
// repainted. It is *wrapped*:
//   • a fold is a soft slab whose top face is the crop at fold-board size and
//     whose rounded front and side folds continue into the neighbouring
//     photo pixels, exactly like fabric continuing round a real fold;
//   • a hung garment is a thin draped shell carrying the cut-out, hung
//     perpendicular to the wall and seen in perspective, so each spine is a
//     compressed sliver of the real garment (sleeve, borders, hem band).
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { mk, ctx2d, type Box, type Canvas, type RGB } from "./image.ts";
import { fabric } from "./draw.ts";

// ── One shared offscreen renderer ────────────────────────────────────────────
interface Rig {
  r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; root: THREE.Group;
  key: THREE.DirectionalLight; composer: EffectComposer; gtao: GTAOPass;
}
let rig: Rig | null = null;
function getRig(): Rig {
  if (rig) return rig;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.NeutralToneMapping; // keeps product colours true (ACES desaturates)
  r.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(r);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.background = new THREE.Color("#efece7");
  scene.add(new THREE.HemisphereLight("#ffffff", "#d8d2c8", 0.35));
  const key = new THREE.DirectionalLight("#fff6ec", 2.0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.25;
  key.shadow.radius = 6;
  scene.add(key, key.target);
  const root = new THREE.Group();
  scene.add(root);
  const cam = new THREE.PerspectiveCamera(30, 1, 2, 6000);
  const composer = new EffectComposer(r);
  composer.addPass(new RenderPass(scene, cam));
  const gtao = new GTAOPass(scene, cam, 1, 1);
  gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.6, thickness: 3, scale: 1.25, samples: 16 });
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
  rig = { r, scene, cam, root, key, composer, gtao };
  return rig;
}

const disposables: { dispose(): void }[] = [];
const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
function clearRoot(root: THREE.Group) {
  root.clear();
  while (disposables.length) disposables.pop()!.dispose();
}

export interface Fit { box: THREE.Box3; elev: number; azim?: number; fov?: number; pad?: number; light?: THREE.Vector3 }

/** Frame the content box from the given elevation so it fills the image (perspective-aware). */
function frame(cam: THREE.PerspectiveCamera, fit: Fit, aspect: number) {
  cam.fov = fit.fov ?? 30;
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  const target = fit.box.getCenter(new THREE.Vector3());
  const size = fit.box.getSize(new THREE.Vector3());
  const el = THREE.MathUtils.degToRad(fit.elev), az = THREE.MathUtils.degToRad(fit.azim ?? 0);
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  let dist = size.length() * 1.4;
  const pad = fit.pad ?? 0.9;
  const corners: THREE.Vector3[] = [];
  for (const x of [fit.box.min.x, fit.box.max.x]) for (const y of [fit.box.min.y, fit.box.max.y]) for (const z of [fit.box.min.z, fit.box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  for (let i = 0; i < 6; i++) {
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
    for (const c of corners) { const p = c.clone().project(cam); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    // re-centre on the projected box, then scale distance to fill
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist;
    target.addScaledVector(right, cx * halfH * aspect).addScaledVector(up, cy * halfH);
    const ext = Math.max((x1 - x0) / 2, (y1 - y0) / 2);
    dist *= ext / pad;
  }
  cam.position.copy(target).addScaledVector(dir, dist);
  cam.lookAt(target);
  cam.updateMatrixWorld();
}

const cache = new Map<string, Canvas>();
/** Render a 3D scene into a 2D canvas (cached by key). */
export function render3D(key: string, pxW: number, pxH: number, build: (root: THREE.Group) => Fit): Canvas {
  pxW = Math.max(64, Math.min(2400, Math.round(pxW)));
  pxH = Math.max(64, Math.min(2400, Math.round(pxH)));
  const k = `${key}|${pxW}x${pxH}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const R = getRig();
  clearRoot(R.root);
  const fit = build(R.root);
  R.r.setSize(pxW, pxH, false);
  R.composer.setSize(pxW, pxH);
  frame(R.cam, fit, pxW / pxH);
  // key light from upper-front-left, shadow frustum hugging the content
  const c = fit.box.getCenter(new THREE.Vector3()), s = fit.box.getSize(new THREE.Vector3()).length();
  const ld = (fit.light ?? new THREE.Vector3(-0.55, 1, 0.75)).normalize();
  R.key.position.copy(c).addScaledVector(ld, s * 1.5);
  R.key.target.position.copy(c);
  const sc = R.key.shadow.camera;
  sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 1; sc.far = s * 4;
  sc.updateProjectionMatrix();
  R.gtao.setSize(pxW, pxH);
  R.composer.render();
  const out = mk(pxW, pxH);
  ctx2d(out).drawImage(R.r.domElement, 0, 0);
  if (cache.size > 80) cache.delete(cache.keys().next().value!);
  cache.set(k, out);
  return out;
}

// ── Materials ────────────────────────────────────────────────────────────────
const col = (c: RGB) => new THREE.Color(`rgb(${c[0]},${c[1]},${c[2]})`);
function fabricMat(map: THREE.Texture, color: RGB, alphaTest = 0.5) {
  return track(new THREE.MeshPhysicalMaterial({
    map, roughness: 0.95, metalness: 0, sheen: 0.22, sheenRoughness: 0.8, sheenColor: col(color).lerp(new THREE.Color("#ffffff"), 0.25),
    alphaTest, side: THREE.DoubleSide,
  }));
}
const woodMat = () => track(new THREE.MeshStandardMaterial({ color: "#c7a77a", roughness: 0.68 }));
const wallMat = () => track(new THREE.MeshStandardMaterial({ color: "#ebe7e0", roughness: 0.95 }));
const chromeMat = () => track(new THREE.MeshStandardMaterial({ color: "#d9dde2", roughness: 0.22, metalness: 1 }));

function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true) {
  const o = new THREE.Mesh(track(g), m);
  o.castShadow = cast; o.receiveShadow = receive;
  return o;
}
function boxAt(root: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
  const o = mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  root.add(o);
  return o;
}

// ── Textures: the photo padded with real fabric, so wraps never hit a hole ───
export interface Wrap {
  src: Canvas;            // photo cut-out (transparent outside the garment)
  box: Box;               // the fold's top face in src pixels
  patch: Canvas;          // real fabric swatch
  color: RGB;
  shoulderY: number;      // src px; above this the silhouette shapes the back corners
  maskBack: boolean;
}
interface PadTex { tex: THREE.Texture; pad: number; W: number; H: number }
const padCache = new WeakMap<Canvas, Map<string, PadTex>>();
function paddedTexture(w: Wrap, padPx: number): PadTex {
  const k = `${w.maskBack}|${Math.round(padPx)}|${w.shoulderY}`;
  let m = padCache.get(w.src);
  if (!m) { m = new Map(); padCache.set(w.src, m); }
  const hit = m.get(k);
  if (hit) return hit;
  const pad = Math.round(padPx);
  const W = w.src.width + pad * 2, H = w.src.height + pad * 2;
  const c = mk(W, H), x = ctx2d(c);
  x.fillStyle = fabric(x, w.patch, 1);
  x.fillRect(0, 0, W, H);
  x.drawImage(w.src, pad, pad);
  if (w.maskBack) {
    // Above the shoulder line the garment's own outline shapes the fold's back
    // corners (the shoulder slope you see on every folded tee).
    const m2 = mk(W, H), y = ctx2d(m2);
    const cut = pad + Math.round(w.shoulderY);
    y.fillStyle = "#000"; y.fillRect(0, cut, W, H - cut);
    y.save(); y.beginPath(); y.rect(0, 0, W, cut); y.clip(); y.drawImage(w.src, pad, pad); y.restore();
    x.globalCompositeOperation = "destination-in";
    x.drawImage(m2, 0, 0);
    x.globalCompositeOperation = "source-over";
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  const out = { tex, pad, W, H };
  m.set(k, out);
  return out;
}
const backCache = new WeakMap<Canvas, THREE.Texture>();
/** The unseen back of a garment: its real fabric, clipped to its real outline. */
function backTexture(cut: Canvas, patch: Canvas) {
  let t = backCache.get(cut);
  if (t) return t;
  const c = mk(cut.width, cut.height), x = ctx2d(c);
  x.drawImage(cut, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = fabric(x, patch, 1);
  x.fillRect(0, 0, c.width, c.height);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 16;
  backCache.set(cut, t);
  return t;
}
const alphaCache = new WeakMap<Canvas, THREE.Texture>();
function cutTexture(c: Canvas) {
  let t = alphaCache.get(c);
  if (t) return t;
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 16;
  alphaCache.set(c, t);
  return t;
}

// ── Fold geometry ────────────────────────────────────────────────────────────
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/**
 * A folded garment as one continuous surface: a flat top (w × d) whose border
 * wraps down round a half-cylinder of radius t/2 on every side. (s, r) are
 * unrolled surface coordinates in cm, so texture distance = fabric distance.
 */
function foldGeometry(w: number, d: number, t: number, uvOf: (s: number, r: number) => [number, number], puff: number) {
  const rho = t / 2, a = Math.PI * rho;
  const nx = 64, nz = 64;
  const S = w / 2 + a, Z = d / 2 + a;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  // denser samples near the edges, where the surface bends
  const warp = (f: number, flat: number, total: number) => {
    const g = f * 2 - 1; // -1..1
    const k = flat / total;
    const ag = Math.abs(g);
    const v = ag < 0.6 ? (ag / 0.6) * k : k + ((ag - 0.6) / 0.4) * (1 - k);
    return Math.sign(g) * v * total;
  };
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const s = warp(i / nx, w / 2, S), r = warp(j / nz, d / 2, Z);
    const ex = Math.max(0, Math.abs(s) - w / 2), ez = Math.max(0, Math.abs(r) - d / 2);
    const px_ = ex / rho, pz_ = ez / rho;
    const phi = Math.min(Math.PI, Math.hypot(px_, pz_));
    let x = s, z = r, y = t;
    if (phi > 0) {
      const dx = px_ / Math.hypot(px_, pz_), dz = pz_ / Math.hypot(px_, pz_);
      if (ex > 0) x = Math.sign(s) * (w / 2 + rho * Math.sin(phi) * dx);
      if (ez > 0) z = Math.sign(r) * (d / 2 + rho * Math.sin(phi) * dz);
      y = rho + rho * Math.cos(phi);
      // fabric bulges a little at the fold rather than being a perfect tube
      const bul = Math.sin(phi) * rho * 0.12;
      if (ex > 0) x += Math.sign(s) * bul * dx;
      if (ez > 0) z += Math.sign(r) * bul * dz;
    } else {
      // soft pillow on the top face + low-frequency fabric undulation
      const fx = (2 * s) / w, fz = (2 * r) / d;
      y += puff * (1 - fx * fx) * (1 - fz * fz) + t * 0.025 * Math.sin(s * 0.55 + r * 0.21) * Math.sin(r * 0.37);
    }
    // gentle wrinkles across the front fold where the fabric is compressed
    if (ez > 0 && r > 0) y += Math.sin(s * 1.1) * rho * 0.05 * Math.sin(Math.min(phi, Math.PI));
    pos.push(x, y, z);
    uv.push(...uvOf(s, r));
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a0 = j * (nx + 1) + i, b0 = a0 + 1, c0 = a0 + nx + 1, d0 = c0 + 1;
    idx.push(a0, c0, b0, b0, c0, d0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface FoldSpec { wrap: Wrap; w: number; d: number; t: number }

function foldedItem(f: FoldSpec): THREE.Mesh {
  const ppc = f.wrap.box.w / f.w;
  const P = paddedTexture(f.wrap, (Math.PI * f.t / 2 + 4) * ppc);
  const b = f.wrap.box;
  const uvOf = (s: number, r: number): [number, number] => [
    (P.pad + b.x + (s + f.w / 2) * ppc) / P.W,
    (P.pad + b.y + (r + f.d / 2) * (b.h / f.d)) / P.H,
  ];
  const g = foldGeometry(f.w, f.d, f.t, uvOf, f.t * 0.22);
  return mesh(g, fabricMat(P.tex, f.wrap.color));
}

/** A stack of `n` folded pieces with natural jitter, origin at its footprint centre. */
function foldStack(f: FoldSpec, n: number, s0: number): THREE.Group {
  seed = s0;
  const grp = new THREE.Group();
  const proto = foldedItem(f);
  for (let k = 0; k < n; k++) {
    const m = k === 0 ? proto : proto.clone();
    m.position.set((rnd() - 0.5) * 0.7, k * f.t * 0.93, (rnd() - 0.5) * 0.6);
    m.rotation.y = (rnd() - 0.5) * 0.035;
    grp.add(m);
  }
  return grp;
}

function wall(root: THREE.Object3D, x0: number, x1: number, y0: number, y1: number, z: number) {
  const o = mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), wallMat(), false, true);
  o.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  root.add(o);
}

export function shelfFolds(root: THREE.Group, f: FoldSpec, n: number): Fit {
  const sw = f.w + 16, sd = f.d + 10, th = 2.6;
  const top = 0;
  boxAt(root, woodMat(), 0, top - th / 2, 0, sw, th, sd);
  wall(root, -sw * 4, sw * 4, -th - 60, n * f.t + 80, -sd / 2);
  const st = foldStack(f, n, 7);
  st.position.set(0, top, 0.5);
  root.add(st);
  const box = new THREE.Box3(new THREE.Vector3(-sw / 2, -th, -sd / 2), new THREE.Vector3(sw / 2, n * f.t + 1, sd / 2));
  return { box, elev: 34, azim: -14, pad: 0.86 };
}

export function tableFolds(root: THREE.Group, f: FoldSpec, counts: number[]): Fit {
  const gap = 6, tw = counts.length * f.w + (counts.length + 1) * gap, td = f.d + 22, th = 3.5;
  boxAt(root, woodMat(), 0, -th / 2, 0, tw, th, td);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxAt(root, woodMat(), sx * (tw / 2 - 4), -th - 20, sz * (td / 2 - 4), 3, 40, 3);
  const floor = mesh(new THREE.PlaneGeometry(tw * 3, td * 4), wallMat(), false, true);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -th - 40; root.add(floor);
  counts.forEach((c, i) => {
    const st = foldStack(f, c, 11 + i * 5);
    st.position.set(-tw / 2 + gap + f.w / 2 + i * (f.w + gap), 0, 1 + (i % 2) * 1.5);
    st.rotation.y = (i - 1) * 0.02;
    root.add(st);
  });
  const hmax = Math.max(...counts) * f.t;
  const box = new THREE.Box3(new THREE.Vector3(-tw / 2, -th - 6, -td / 2), new THREE.Vector3(tw / 2, hmax + 1, td / 2));
  return { box, elev: 32, azim: -10, pad: 0.92 };
}

export function cubbyFolds(root: THREE.Group, f: FoldSpec, n: number): Fit {
  const cw = f.w + 7, ch = n * f.t + 9, cd = f.d + 6, wt = 1.8;
  const m = woodMat();
  boxAt(root, m, 0, -wt / 2, 0, cw + 2 * wt, wt, cd);                     // bottom
  boxAt(root, m, 0, ch + wt / 2, 0, cw + 2 * wt, wt, cd);                  // top
  boxAt(root, m, -cw / 2 - wt / 2, ch / 2, 0, wt, ch + 2 * wt, cd);        // sides
  boxAt(root, m, cw / 2 + wt / 2, ch / 2, 0, wt, ch + 2 * wt, cd);
  boxAt(root, track(new THREE.MeshStandardMaterial({ color: "#b8986c", roughness: 0.8 })), 0, ch / 2, -cd / 2 + 0.5, cw, ch, 1); // back
  const st = foldStack(f, n, 3);
  st.position.set(0, 0, 1);
  root.add(st);
  const box = new THREE.Box3(new THREE.Vector3(-cw / 2 - wt, -wt, -cd / 2), new THREE.Vector3(cw / 2 + wt, ch + wt, cd / 2));
  return { box, elev: 16, azim: -12, pad: 0.88 };
}

// ── Rolls ────────────────────────────────────────────────────────────────────
function spiralTexture(patch: Canvas): THREE.Texture {
  const S = 256, c = mk(S, S), x = ctx2d(c);
  x.fillStyle = fabric(x, patch, 1.2); x.fillRect(0, 0, S, S);
  x.strokeStyle = "rgba(0,0,0,.45)"; x.lineWidth = 3;
  x.beginPath();
  for (let a = 0; a < Math.PI * 9; a += 0.05) { const rr = (S / 2) * (0.05 + (a / (Math.PI * 9)) * 0.93); const px = S / 2 + Math.cos(a) * rr, py = S / 2 + Math.sin(a) * rr; a === 0 ? x.moveTo(px, py) : x.lineTo(px, py); }
  x.stroke();
  const g = x.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(0,0,0,.35)"); g.addColorStop(0.3, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.15)");
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return track(t);
}
export function rolls(root: THREE.Group, patch: Canvas, color: RGB, len: number, dia: number, cubby: boolean): Fit {
  const r = dia / 2, cols = 3;
  const sideTex = new THREE.CanvasTexture((() => { const c = mk(256, 256), x = ctx2d(c); x.fillStyle = fabric(x, patch, 1); x.fillRect(0, 0, 256, 256); return c; })());
  sideTex.colorSpace = THREE.SRGBColorSpace; sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping; sideTex.repeat.set(3, 2); track(sideTex);
  const side = fabricMat(sideTex, color, 0);
  const endM = fabricMat(spiralTexture(patch), color, 0);
  const W = cols * dia + 8, D = len + 8;
  const m = woodMat();
  boxAt(root, m, 0, -1.2, 0, W, 2.4, D);
  if (cubby) {
    const h = dia * 2.2;
    boxAt(root, m, -W / 2 - 0.9, h / 2, 0, 1.8, h + 2.4, D);
    boxAt(root, m, W / 2 + 0.9, h / 2, 0, 1.8, h + 2.4, D);
    boxAt(root, m, 0, h + 0.9, 0, W + 3.6, 1.8, D);
  }
  wall(root, -W * 4, W * 4, -40, dia * 6, -D / 2);
  const place = (x: number, y: number, s: number) => {
    seed = s;
    const g = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(r, r * 0.97, len, 48, 1, true), side);
    body.rotation.x = Math.PI / 2; g.add(body);
    const end = mesh(new THREE.CircleGeometry(r * 0.995, 48), endM);
    end.position.z = len / 2; g.add(end);
    g.position.set(x + (rnd() - 0.5) * 0.4, y, (rnd() - 0.5) * 1.2);
    g.rotation.z = rnd() * Math.PI * 2;
    root.add(g);
  };
  for (let i = 0; i < cols; i++) place(-W / 2 + 4 + r + i * dia, r, 20 + i);
  for (let i = 0; i < cols - 1; i++) place(-W / 2 + 4 + dia + i * dia, r + dia * 0.86, 40 + i);
  const box = new THREE.Box3(new THREE.Vector3(-W / 2 - 2, -2.4, -D / 2), new THREE.Vector3(W / 2 + 2, cubby ? dia * 2.2 + 2 : dia * 1.9, D / 2));
  return { box, elev: 18, azim: -16, pad: 0.88 };
}

// ── Hung garments ────────────────────────────────────────────────────────────
export interface HangSpec {
  cut: Canvas;          // front cut-out
  ppc: number;          // cut px per cm
  thick: number;        // garment thickness when hung, cm
  neckX: number;        // hang point, cut px
  shoulderY: number;    // cut px
  color: RGB;
  patch: Canvas;        // real fabric swatch (for the unseen back)
  back: Canvas | null;  // real back photo, if uploaded
  clip: boolean;        // bottoms on a clip hanger
}

/**
 * A hung garment: two surfaces (front, back) bowed apart into a thin lens so
 * the outline is the real silhouette and the visible edge is the real sleeve.
 * Local frame: width along z (perpendicular to the wall), height down from y=0.
 */
function garmentShell(h: HangSpec, fan: number): THREE.Group {
  const W = h.cut.width / h.ppc, L = h.cut.height / h.ppc;
  const zc = h.neckX / h.ppc; // hang point offset from the image's left edge
  const front = fabricMat(cutTexture(h.cut), h.color, 0.5);
  // the back is never in a front photo: use the real back photo if we have one,
  // otherwise the real fabric inside the real outline (never a mirrored print)
  const back = fabricMat(h.back ? cutTexture(h.back) : backTexture(h.cut, h.patch), h.color, 0.5);
  const nx = 36, ny = 72;
  const grp = new THREE.Group();
  for (const side of [1, -1]) {
    const mat = side > 0 ? front : back;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / ny;
      const z = u * W - zc, y = -v * L;
      const e = Math.max(0, 1 - ((2 * (u - 0.5)) ** 2));
      // lens thickness: fuller at the shoulders (hanger) and hem, slimmer at the waist
      const prof = 0.75 + 0.25 * Math.cos(v * Math.PI * 1.6);
      let x = side * (h.thick / 2) * Math.sqrt(e) * prof;
      // the lower garment fans away from its neighbours
      x += fan * v * v * 4;
      pos.push(x, y, z * -1);
      uv.push(side < 0 && h.back ? 1 - u : u, v);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    grp.add(mesh(g, mat));
  }
  return grp;
}

function hangerMesh(halfW: number, railR: number, drop: number, clip: boolean): THREE.Group {
  const g = new THREE.Group();
  const wire = chromeMat();
  // hook: up from the hanger centre, over the rail (circle in the y–z plane), down the back
  const hookPts: THREE.Vector3[] = [];
  const rr = railR + 0.45;
  hookPts.push(new THREE.Vector3(0, -drop + 1.5, 0), new THREE.Vector3(0, -rr * 0.6, rr * 0.2));
  for (let a = -0.15; a <= Math.PI * 1.15; a += 0.12) hookPts.push(new THREE.Vector3(0, Math.sin(a) * rr, Math.cos(a) * rr));
  const hook = new THREE.CatmullRomCurve3(hookPts);
  g.add(mesh(new THREE.TubeGeometry(hook, 48, 0.22, 8, false), wire));
  const body = track(new THREE.MeshStandardMaterial({ color: clip ? "#26282c" : "#2a2522", roughness: 0.55 }));
  if (clip) {
    g.add(mesh(new THREE.BoxGeometry(0.8, 1.2, halfW * 2 + 2), body).translateY(-drop));
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(1.4, 3.6, 2.4), body).translateY(-drop - 1.8).translateZ(s * (halfW - 1)));
  } else {
    const arm = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -drop - 4.2, -halfW), new THREE.Vector3(0, -drop - 1.6, -halfW * 0.55),
      new THREE.Vector3(0, -drop, 0), new THREE.Vector3(0, -drop - 1.6, halfW * 0.55), new THREE.Vector3(0, -drop - 4.2, halfW),
    ]);
    g.add(mesh(new THREE.TubeGeometry(arm, 40, 0.65, 10, false), body));
  }
  return g;
}

export function spineRail(root: THREE.Group, h: HangSpec, n: number): Fit {
  const W = h.cut.width / h.ppc, L = h.cut.height / h.ppc;
  const gap = Math.max(h.thick * 0.95, 2.6);
  const railR = 1.3, railY = 0;
  const len = n * gap + 24;
  const rail = mesh(new THREE.CylinderGeometry(railR, railR, len, 24), chromeMat());
  rail.rotation.z = Math.PI / 2; root.add(rail);
  for (const sx of [-1, 1]) {
    const b = mesh(new THREE.CylinderGeometry(0.9, 0.9, W / 2 + 10, 16), chromeMat());
    b.rotation.x = Math.PI / 2; b.position.set(sx * (len / 2 - 1), 0, -(W / 2 + 10) / 2); root.add(b);
  }
  const zWall = -W / 2 - 10;
  wall(root, -len, len, -L - 60, 40, zWall);
  seed = 5;
  const drop = h.clip ? 4.5 : 6.5;
  const halfW = Math.min(22, ((h.cut.width / h.ppc) * 0.42));
  for (let k = 0; k < n; k++) {
    const x = -((n - 1) * gap) / 2 + k * gap;
    const grp = new THREE.Group();
    grp.add(hangerMesh(h.clip ? Math.min(halfW, W * 0.45) : halfW, railR, drop, h.clip));
    const shell = garmentShell(h, (rnd() - 0.5) * 0.5);
    const top = h.clip ? -drop - 3.4 : -drop + 1.8 - Math.min(2.5, (h.shoulderY / h.ppc) * 0.4);
    shell.position.y = top;
    grp.add(shell);
    grp.position.set(x, railY, 0);
    // garments settle a few degrees off perpendicular, alternating a little
    grp.rotation.y = THREE.MathUtils.degToRad(-11 + (rnd() - 0.5) * 7); // fronts turned slightly towards the customer
    root.add(grp);
  }
  const box = new THREE.Box3(new THREE.Vector3(-len / 2, -L - 6, -W / 2), new THREE.Vector3(len / 2, 4, W / 2));
  return { box, elev: 6, azim: 0, fov: 28, pad: 0.94, light: new THREE.Vector3(-0.35, 0.9, 1) };
}

// ── Draped over a bar (trousers over a hanger, scarf / dupatta / towel on a rod) ──
export interface DrapeSpec {
  src: Canvas;          // photo cut-out
  box: Box;             // the strip of the photo that is draped (src px), top = front end
  w: number;            // strip width, cm
  len: number;          // strip length, cm (both halves together)
  frontShare: number;   // share of the length hanging in front (0.5 = even)
  patch: Canvas; color: RGB;
}

/** A strip of real fabric laid over a horizontal bar (radius r) along x. */
function drapeGeometry(d: DrapeSpec, r: number) {
  const nx = 24, ns = 120;
  const arc = Math.PI * r;
  const front = d.len * d.frontShare - arc / 2, back = d.len - front - arc;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ns; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, s = (j / ns) * d.len; // s = 0 at the front hem, d.len at the back hem
    const x = (u - 0.5) * d.w;
    let y: number, z: number;
    if (s < front) { // front panel hanging down, swinging slightly away
      const k = front - s;
      y = -k; z = r + 0.15 + k * 0.035 + Math.sin(u * Math.PI * 2 + k * 0.08) * 0.25;
    } else if (s < front + arc) { // over the bar
      const a = ((s - front) / arc) * Math.PI;
      y = Math.sin(a) * (r + 0.15); z = Math.cos(a) * (r + 0.15);
    } else { // back panel
      const k = s - front - arc;
      y = -k; z = -(r + 0.15) - k * 0.03;
    }
    // soft folds across the width
    z += Math.sin(u * Math.PI * 3.2) * 0.35 * Math.min(1, Math.abs(y) / 10);
    pos.push(x, y, z);
    uv.push(u, s / d.len);
  }
  for (let j = 0; j < ns; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1;
    idx.push(a, b, c, b, e, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function stripTexture(d: DrapeSpec) {
  const W = Math.max(8, Math.round(d.box.w)), H = Math.max(8, Math.round(d.box.h));
  const c = mk(W, H), x = ctx2d(c);
  x.fillStyle = fabric(x, d.patch, 1); x.fillRect(0, 0, W, H);
  x.drawImage(d.src, d.box.x, d.box.y, d.box.w, d.box.h, 0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 8;
  return track(t);
}

export function drapeOverBar(root: THREE.Group, d: DrapeSpec, mode: "hanger" | "rod"): Fit {
  const r = mode === "hanger" ? 0.7 : 1.3;
  const strip = mesh(drapeGeometry(d, r), fabricMat(stripTexture(d), d.color, 0));
  root.add(strip);
  const halfW = d.w / 2 + 4;
  const zWall = -12;
  if (mode === "hanger") {
    // wooden hanger seen face-on (arms along x), hooked over a faceout arm
    const body = track(new THREE.MeshStandardMaterial({ color: "#7b4f2c", roughness: 0.5 }));
    const arm = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-halfW, -2.6, 0), new THREE.Vector3(-halfW * 0.5, -0.6, 0), new THREE.Vector3(0, 1.4, 0),
      new THREE.Vector3(halfW * 0.5, -0.6, 0), new THREE.Vector3(halfW, -2.6, 0),
    ]);
    root.add(mesh(new THREE.TubeGeometry(arm, 40, 0.7, 10, false), body));
    const bar = mesh(new THREE.CylinderGeometry(r, r, halfW * 2 - 2, 16), body);
    bar.rotation.z = Math.PI / 2; bar.position.y = -2.4 + r; root.add(bar);
    strip.position.y = -2.4 + r;
    const hook = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(0, 6, 0), new THREE.Vector3(0, 8.4, -1.2), new THREE.Vector3(0, 7.6, -2.6)]);
    root.add(mesh(new THREE.TubeGeometry(hook, 24, 0.22, 8, false), chromeMat()));
    const faceArm = mesh(new THREE.CylinderGeometry(0.9, 0.9, -zWall, 16), chromeMat());
    faceArm.rotation.x = Math.PI / 2; faceArm.position.set(0, 7.2, zWall / 2); root.add(faceArm);
  } else {
    const rod = mesh(new THREE.CylinderGeometry(r, r, d.w + 18, 24), chromeMat());
    rod.rotation.z = Math.PI / 2; root.add(rod);
    for (const sx of [-1, 1]) {
      const p = mesh(new THREE.CylinderGeometry(0.8, 0.8, -zWall, 12), chromeMat());
      p.rotation.x = Math.PI / 2; p.position.set(sx * (d.w / 2 + 7), 0, zWall / 2); root.add(p);
      const plate = mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.8, 24), chromeMat());
      plate.rotation.x = Math.PI / 2; plate.position.set(sx * (d.w / 2 + 7), 0, zWall + 0.4); root.add(plate);
    }
  }
  const drop = d.len * Math.max(d.frontShare, 1 - d.frontShare);
  wall(root, -d.w * 3, d.w * 3, -drop - 40, 40, zWall);
  const box = new THREE.Box3(new THREE.Vector3(-halfW - 2, -drop - 2, -4), new THREE.Vector3(halfW + 2, mode === "hanger" ? 9 : 3, 4));
  return { box, elev: 8, azim: -18, pad: 0.9, light: new THREE.Vector3(-0.5, 0.9, 1) };
}

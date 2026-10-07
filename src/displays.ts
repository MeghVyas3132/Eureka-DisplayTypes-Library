// Every display type is a small scene in centimetres built from ONE product photo.
// Each scene says honestly how it was made (provenance), which is the whole point:
//   exact   – the visible surface is real pixels from the photo (cropped / warped)
//   inferred – a surface the photo never saw, rebuilt from the real fabric swatch
//   needs   – the visible surface defines the product but isn't in the photo
import * as THREE from "three";
import { mk, ctx2d, rgb, type Analysis, type Box, type Canvas } from "./image.ts";
import { render3D, shelfFolds, tableFolds, cubbyFolds, rolls, spineRail, drapeOverBar, type Fit, type FoldSpec, type HangSpec, type DrapeSpec } from "./three3d.ts";
import {
  type C2D, type Pt, dep, drawQuad, blit, fabric, grad, CYL, FOLD_EDGE, drape, shadow, noShadow, poly,
  contactShadow, rail, hanger, hangerEdge, clipHanger, shelf, wallPanel, tableTop, arm, pegHook, dressForm,
  headForm, box3d, riser, label,
} from "./draw.ts";

export type Prov = "exact" | "inferred" | "needs";

export interface View { cut: Canvas; an: Analysis }
export interface Product extends View {
  id: string;
  name: string;
  cat: CatId;
  sizeCm: number;
  back: View | null;
  warning: string | null;
}

export interface Opts { count: number }
export interface Scene { w: number; h: number; prov: Prov; note: string; dims: string; paint: (ctx: C2D) => void; persp?: boolean }

export type CatId = "tee" | "shirt" | "sweater" | "dress" | "set" | "bottoms" | "outerwear" | "footwear" | "bag" | "cap" | "scarf" | "towel" | "packaged";

interface Fold { w: number; d: number; t: number }
export interface Category {
  id: CatId; label: string; vertical: string;
  axis: "h" | "w"; size: number;   // the photo's height or width in real cm
  thick: number;                   // spine (side-hung) thickness, cm
  fold: Fold;                      // folded footprint and per-item thickness
  foldKind: FoldKind;
  displays: string[];
  words: RegExp;                   // filename hints for auto-detect
}

type FoldKind = "board" | "collar" | "print" | "yoke" | "box" | "wall" | "front" | "pocket" | "back" | "scarf" | "towel";

export const CATEGORIES: Category[] = [
  { id: "tee", label: "T-shirt / Knit top", vertical: "Topwear", axis: "h", size: 70, thick: 3, fold: { w: 30.5, d: 31.8, t: 2.6 }, foldKind: "board",
    displays: ["face_out", "spine_out", "waterfall", "fold_board", "fold_print", "fold_wall", "fold_back", "table_stacks", "cubby", "rolled", "flat_lay", "bust_form"], words: /tee|t-?shirt|polo|tank|top|knit/i },
  { id: "shirt", label: "Shirt (collared)", vertical: "Topwear", axis: "h", size: 78, thick: 3.5, fold: { w: 30.5, d: 36, t: 2.8 }, foldKind: "collar",
    displays: ["face_out", "spine_out", "waterfall", "fold_collar", "fold_wall", "table_stacks", "cubby", "flat_lay", "bust_form"], words: /shirt|oxford|linen|formal/i },
  { id: "sweater", label: "Sweater / Hoodie", vertical: "Topwear", axis: "h", size: 68, thick: 6, fold: { w: 33, d: 33, t: 5.5 }, foldKind: "box",
    displays: ["face_out", "spine_out", "waterfall", "fold_box", "table_stacks", "cubby", "flat_lay", "bust_form"], words: /sweat|hood|jumper|pullover|cardigan|fleece/i },
  { id: "dress", label: "Dress / Kurta / Tunic", vertical: "Dresses & ethnic", axis: "h", size: 110, thick: 4, fold: { w: 30, d: 35, t: 3 }, foldKind: "yoke",
    displays: ["face_out", "spine_out", "waterfall", "fold_yoke", "table_stacks", "dress_form", "flat_lay"], words: /dress|kurta|kurti|tunic|gown|kaftan|anarkali/i },
  { id: "set", label: "Kurta set / Co-ord / Suit", vertical: "Dresses & ethnic", axis: "h", size: 140, thick: 6, fold: { w: 32, d: 38, t: 4.5 }, foldKind: "yoke",
    displays: ["face_out", "spine_out", "waterfall", "fold_yoke", "table_stacks", "dress_form", "flat_lay"], words: /set|co-?ord|salwar|suit|lehenga|sharara/i },
  { id: "bottoms", label: "Jeans / Trousers / Shorts", vertical: "Bottoms", axis: "h", size: 104, thick: 3.5, fold: { w: 26, d: 33, t: 4 }, foldKind: "front",
    displays: ["clip_hang", "spine_clip", "over_bar", "fold_front", "fold_pocket", "table_stacks", "cubby", "leg_form", "flat_lay"], words: /jean|denim|trouser|pant|chino|short|jogger|legging/i },
  { id: "outerwear", label: "Jacket / Blazer / Coat", vertical: "Outerwear", axis: "h", size: 72, thick: 8, fold: { w: 35, d: 38, t: 7 }, foldKind: "box",
    displays: ["face_out", "spine_out", "waterfall", "bust_form", "fold_box", "flat_lay"], words: /jacket|blazer|coat|parka|puffer|bomber/i },
  { id: "footwear", label: "Footwear (side photo)", vertical: "Footwear", axis: "w", size: 28, thick: 10, fold: { w: 0, d: 0, t: 0 }, foldKind: "board",
    displays: ["shoe_side", "shoe_pair", "shoe_angle", "shoe_riser", "shoe_box", "shoe_heel"], words: /shoe|sneaker|boot|sandal|heel|loafer|trainer|slipper|footwear/i },
  { id: "bag", label: "Bag / Backpack", vertical: "Bags", axis: "w", size: 36, thick: 12, fold: { w: 0, d: 0, t: 0 }, foldKind: "board",
    displays: ["bag_shelf", "bag_hook", "bag_angle", "bag_side"], words: /bag|tote|backpack|purse|sling|clutch|handbag/i },
  { id: "cap", label: "Cap / Headwear", vertical: "Accessories", axis: "w", size: 22, thick: 0, fold: { w: 0, d: 0, t: 0 }, foldKind: "board",
    displays: ["cap_shelf", "cap_head", "cap_stack", "cap_hook"], words: /cap|hat|beanie|beret/i },
  { id: "scarf", label: "Scarf / Stole / Dupatta", vertical: "Accessories", axis: "w", size: 70, thick: 0, fold: { w: 28, d: 24, t: 1.2 }, foldKind: "scarf",
    displays: ["fold_scarf", "scarf_bar", "scarf_hanger", "flat_lay"], words: /scarf|stole|dupatta|shawl|muffler/i },
  { id: "towel", label: "Towel / Bed & bath", vertical: "Home textiles", axis: "w", size: 70, thick: 0, fold: { w: 35, d: 26, t: 4.5 }, foldKind: "towel",
    displays: ["fold_towel", "towel_roll", "towel_bar", "cubby"], words: /towel|bath|sheet|bedsheet|linen|napkin|duvet/i },
  { id: "packaged", label: "Boxed / Hardgoods", vertical: "Hardgoods", axis: "h", size: 22, thick: 0, fold: { w: 0, d: 0, t: 0 }, foldKind: "board",
    displays: ["pack_shelf", "pack_stack", "pack_peg", "pack_tray"], words: /bottle|box|lunch|tiffin|cup|mug|jar|container|pack|tray|casserole/i },
];
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CatId, Category>;

/** Guess the category from the file name first, then from the silhouette. */
export function guessCategory(name: string, an: Analysis, w: number): CatId {
  for (const c of CATEGORIES) if (c.words.test(name)) return c.id;
  const torsoW = an.torso[1] - an.torso[0];
  let topMax = 0;
  for (let y = 0; y < an.rows.length * 0.4; y++) { const r = an.rows[y]; if (r[0] >= 0) topMax = Math.max(topMax, r[1] - r[0]); }
  const sleeves = topMax > torsoW * 1.35;
  if (an.legSplitY !== null) {
    const split = an.legSplitY / an.rows.length;
    if (split < 0.5 && !sleeves) return "bottoms";
    return "set";
  }
  if (an.aspect < 0.6) return "footwear";
  if (an.aspect < 1.0) return sleeves ? "tee" : "bag";
  if (an.aspect > 2.2 && !sleeves) return "packaged";
  if (an.aspect > 1.45) return "dress";
  return sleeves ? "tee" : torsoW > w * 0.8 ? "bag" : "tee";
}

// ── Geometry helpers ─────────────────────────────────────────────────────────
export const ppcOf = (p: Product) => { const c = CAT[p.cat]; return (c.axis === "h" ? p.cut.height : p.cut.width) / p.sizeCm; };
const geo = (p: Product) => {
  const ppc = ppcOf(p), an = p.an;
  return {
    ppc, L: p.cut.height / ppc, W: p.cut.width / ppc, cx: an.neckX / ppc,
    shoulder: an.shoulderY / ppc, torsoW: (an.torso[1] - an.torso[0]) / ppc, torsoCx: (an.torso[0] + an.torso[1]) / 2 / ppc,
  };
};
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const dimsWH = (w: number, h: number) => `${f1(w)} × ${f1(h)} cm`;

/** Darker copy of a cut-out (for items further back). */
const dimmed = new WeakMap<Canvas, Canvas>();
function dim(c: Canvas): Canvas {
  let d = dimmed.get(c);
  if (d) return d;
  d = mk(c.width, c.height);
  const x = ctx2d(d);
  x.drawImage(c, 0, 0);
  x.globalCompositeOperation = "source-atop";
  x.fillStyle = "rgba(0,0,0,.16)"; x.fillRect(0, 0, c.width, c.height);
  dimmed.set(c, d);
  return d;
}
const mirrorCache = new WeakMap<Canvas, Canvas>();
function mirror(c: Canvas): Canvas {
  let m = mirrorCache.get(c);
  if (m) return m;
  m = mk(c.width, c.height);
  const x = ctx2d(m);
  x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0);
  mirrorCache.set(c, m);
  return m;
}

function placeholderFace(v: View, w: number, h: number, text: string): Canvas {
  const c = mk(w, h);
  const x = ctx2d(c);
  x.fillStyle = fabric(x, v.an.patch, 1); x.fillRect(0, 0, w, h);
  x.fillStyle = "rgba(255,255,255,.55)"; x.fillRect(0, 0, w, h);
  x.setLineDash([w * 0.03, w * 0.02]); x.strokeStyle = "#b45309"; x.lineWidth = Math.max(2, w * 0.012);
  x.strokeRect(w * 0.06, h * 0.06, w * 0.88, h * 0.88);
  x.fillStyle = "#92400e"; x.textAlign = "center"; x.font = `700 ${Math.round(w * 0.075)}px Inter, Helvetica, Arial`;
  x.fillText(text, w / 2, h / 2);
  x.font = `500 ${Math.round(w * 0.05)}px Inter, Helvetica, Arial`;
  x.fillText("add it under Photos → Back", w / 2, h / 2 + w * 0.09);
  return c;
}

interface FoldPlan { spec: FoldSpec; prov: Prov; note: string }

function planFold(p: Product, kind: FoldKind): FoldPlan {
  const g = geo(p), c = CAT[p.cat], an = p.an;
  let { w, d, t } = c.fold;
  const ppc = g.ppc;
  const centreX = (an.torso[0] + an.torso[1]) / 2;
  let v: View = p;
  let box: Box;
  let maskBack = true;
  let note = "The photo is wrapped over a folded piece at the store-standard fold size: the top face is the real crop, and the rounded folds continue into the neighbouring real pixels.";
  const placeholder = (text: string, why: string): FoldPlan => {
    const src = placeholderFace(p, Math.round(w * 10), Math.round(d * 10), text);
    return { spec: { w, d, t, wrap: { src, box: { x: 0, y: 0, w: src.width, h: src.height }, patch: p.an.patch, color: p.an.color, shoulderY: 0, maskBack: false } }, prov: "needs", note: why };
  };
  switch (kind) {
    case "print": {
      const pb = an.printBox;
      const cy = pb ? pb.y + pb.h / 2 : an.shoulderY + (d * ppc) / 2;
      const cxp = pb ? pb.x + pb.w / 2 : centreX;
      box = { x: cxp - (w * ppc) / 2, y: Math.max(0, cy - (d * ppc) / 2), w: w * ppc, h: d * ppc };
      maskBack = box.y < an.shoulderY;
      note = pb ? "Print fold: folded so the detected graphic / embroidery sits centred on top. Real pixels, wrapped over the fold." : "No distinct print found, so this falls back to a neckline fold. Real pixels.";
      break;
    }
    case "wall":
      d = d / 2; t = t * 1.8;
      box = { x: centreX - (w * ppc) / 2, y: 0, w: w * ppc, h: d * ppc };
      note = "Double fold for wall shelves: half the depth, nearly twice the thickness. Real pixels, wrapped over the fold.";
      break;
    case "front": case "pocket": {
      const top = an.rows.find((r) => r[0] >= 0) ?? Int32Array.of(0, p.cut.width);
      const half = (an.cx - top[0]) / ppc;
      w = Math.min(32, Math.max(24, half * 1.3)); // leg-over-leg: one leg plus the seat
      maskBack = false;
      if (kind === "pocket") {
        if (p.back) { v = p.back; note = "Back-pocket fold from the back photo. Real pixels, wrapped over the fold."; }
        else return placeholder("Back photo needed", "Denim is folded with the back pockets showing, and they aren't in a front photo. Upload a back photo and this becomes real pixels.");
      }
      const vr = v.an.rows.find((r) => r[0] >= 0) ?? Int32Array.of(0, v.cut.width);
      box = { x: vr[0], y: 0, w: w * ppc, h: d * ppc };
      if (kind === "front") note = "Leg-over-leg fold, front facing: waistband, front pocket and fly are real pixels; the folded leg wraps round the front edge.";
      break;
    }
    case "back":
      if (!p.back) return placeholder("Back photo needed", "Back-print fold shows the garment's back, which a front photo never sees. Upload a back photo to fix this.");
      v = p.back;
      box = { x: (v.an.torso[0] + v.an.torso[1]) / 2 - (w * ppc) / 2, y: 0, w: w * ppc, h: d * ppc };
      note = "Back-print fold from the back photo. Real pixels, wrapped over the fold.";
      break;
    case "scarf": case "towel":
      maskBack = false;
      // towels fold so the woven end band faces up; scarves show their centre panel
      box = kind === "towel"
        ? { x: p.cut.width / 2 - (w * ppc) / 2, y: p.cut.height - d * ppc - 2 * ppc, w: w * ppc, h: d * ppc }
        : { x: p.cut.width / 2 - (w * ppc) / 2, y: p.cut.height / 2 - (d * ppc) / 2, w: w * ppc, h: d * ppc };
      note = kind === "towel" ? "Folded with the woven end band on top, as stores do. Real pixels, wrapped over the fold." : "Folded to the standard size; the face is the real centre panel. Real pixels, wrapped over the fold.";
      break;
    default:
      // board / collar / yoke / box: neckline at the back edge, chest towards the customer
      box = { x: centreX - (w * ppc) / 2, y: 0, w: w * ppc, h: d * ppc };
      if (kind === "collar") note = "Collar fold: collar, placket and chest are real pixels at fold-board size; the shoulder slope shapes the back corners.";
      if (kind === "yoke") note = "Yoke fold: neckline and yoke embroidery are real pixels; the fold continues into the real kurta below the yoke. A dupatta, if any, is folded underneath.";
      if (kind === "box") note = "Box fold for bulky knits: thicker, rounder folds. Real pixels, wrapped over the fold.";
      if (kind === "board") note = "Board fold (12\" × 12.5\"): neckline and chest are real pixels; shoulder slope shapes the back corners and the front fold continues into the real hem area.";
  }
  return { spec: { w, d, t, wrap: { src: v.cut, box, patch: v.an.patch, color: v.an.color, shoulderY: v.an.shoulderY + 0.02 * v.cut.height, maskBack } }, prov: "exact", note };
}

// ── 3D scene glue ───────────────────────────────────────────────────────────
const canvasIds = new WeakMap<Canvas, number>();
let nextId = 1;
const cid = (c: Canvas) => { let i = canvasIds.get(c); if (!i) { i = nextId++; canvasIds.set(c, i); } return i; };
const pkey = (p: Product, extra: string) => `${p.id}|${cid(p.cut)}|${p.back ? cid(p.back.cut) : 0}|${p.sizeCm}|${p.cat}|${extra}`;
function scene3d(key: string, w: number, h: number, build: (root: THREE.Group) => Fit): Pick<Scene, "w" | "h" | "paint" | "persp"> {
  return {
    w, h, persp: true,
    paint: (ctx) => {
      const t = ctx.getTransform(), s = Math.hypot(t.a, t.b);
      ctx.drawImage(render3D(key, w * s, h * s, build), 0, 0, w, h);
    },
  };
}

// ── Hanging helpers ──────────────────────────────────────────────────────────
function hungGarment(ctx: C2D, p: Product, cx: number, barY: number, opts: { dim?: boolean } = {}) {
  const g = geo(p);
  const img = opts.dim ? dim(drape(p.cut)) : drape(p.cut);
  const top = barY - Math.min(2.5, g.shoulder * 0.6);
  shadow(ctx, 2.5, 1.2, 0.25);
  ctx.drawImage(img, cx - g.cx, top, g.W, g.L);
  noShadow(ctx);
  return { top, bottom: top + g.L };
}

// ── Scenes ───────────────────────────────────────────────────────────────────
type Builder = (p: Product, o: Opts) => Scene;
export interface DisplayDef { id: string; label: string; group: "Hanging" | "Folded" | "Forms" | "Shelf & table" | "Wall & peg"; build: Builder }

const D: DisplayDef[] = [];
const def = (id: string, label: string, group: DisplayDef["group"], build: Builder) => D.push({ id, label, group, build });

def("face_out", "Face-out (front hung)", "Hanging", (p) => {
  const g = geo(p);
  const w = Math.max(g.W + 24, 56), barY = 16, h = barY + g.L + 10;
  return { w, h, prov: "exact", dims: `${dimsWH(g.W, g.L)} garment · faceout arm`,
    note: "The full front cut-out on a hanger with drape shading. Every garment pixel is real.",
    paint: (ctx) => {
      wallPanel(ctx, 0, 0, w, h);
      arm(ctx, 4, barY - 7, w / 2 + 6, barY - 7);
      hanger(ctx, w / 2, barY - 8, barY, Math.min(g.torsoW * 0.48, 22));
      hungGarment(ctx, p, w / 2, barY);
    } };
});

const hangSpec = (p: Product, clip: boolean): HangSpec => ({
  cut: p.cut, ppc: ppcOf(p), thick: CAT[p.cat].thick, neckX: p.an.neckX, shoulderY: p.an.shoulderY, color: p.an.color,
  patch: p.an.patch, back: p.back?.cut ?? null, clip,
});
const spineScene = (clip: boolean): Builder => (p, o) => {
  const g = geo(p), t = CAT[p.cat].thick, n = Math.max(2, o.count + 3);
  const gap = Math.max(t * 0.95, 2.6);
  const w = Math.max(n * gap + 46, g.L * 0.62), h = g.L + 18;
  return { ...scene3d(pkey(p, `spine${clip}|${n}`), w, h, (root) => spineRail(root, hangSpec(p, clip), n)),
    prov: "exact", dims: `${n} facings × ${f1(gap)} cm = ${f1(n * gap)} cm of rail · drop ${f1(g.L)} cm`,
    note: clip
      ? "Bottoms clipped at the waistband and hung side-on: each one is the real cut-out on a thin draped shell, seen in perspective, so the outseam, pockets and hem are real pixels."
      : "Each garment is the real cut-out on a thin draped shell, hung perpendicular to the wall and seen in perspective, so every spine is a compressed sliver of the real sleeve, side, borders and hem. Nothing is repainted." };
};
def("spine_out", "Side / spine hung", "Hanging", spineScene(false));

def("waterfall", "Waterfall", "Hanging", (p, o) => {
  const g = geo(p), n = Math.min(5, Math.max(2, o.count));
  const stepX = 5, stepY = 6;
  const w = g.W + (n - 1) * stepX + 30, barY = 16, h = barY + g.L + (n - 1) * stepY + 10;
  return { w, h, prov: "exact", dims: `${n} hangers · ${f1(stepY)} cm drop per knob`,
    note: "A sloping arm with face-forward hangers. Every layer is the real cut-out; the ones behind are just darker.",
    paint: (ctx) => {
      wallPanel(ctx, 0, 0, w, h);
      const cx0 = 15 + g.W / 2;
      arm(ctx, 4, barY - 8, cx0 + (n - 1) * stepX + 4, barY - 8 + (n - 1) * stepY, n);
      for (let k = 0; k < n; k++) {
        const cx = cx0 + k * stepX, by = barY + k * stepY;
        hanger(ctx, cx, by - 8, by, Math.min(g.torsoW * 0.48, 22));
        hungGarment(ctx, p, cx, by, { dim: k < n - 1 });
      }
    } };
});

const foldScene = (kind: FoldKind, label: string): Builder => (p, o) => {
  const f = planFold(p, kind), n = Math.max(1, o.count);
  const w = f.spec.w + 30, h = w * 0.74;
  return { ...scene3d(pkey(p, `fold|${kind}|${n}`), w, h, (root) => shelfFolds(root, f.spec, n)),
    prov: f.prov, note: f.note, dims: `${label} ${dimsWH(f.spec.w, f.spec.d)} · stack of ${n} = ${f1(n * f.spec.t)} cm` };
};

def("fold_board", "Board fold", "Folded", foldScene("board", "Fold"));
def("fold_print", "Print fold", "Folded", foldScene("print", "Fold"));
def("fold_collar", "Collar fold", "Folded", foldScene("collar", "Fold"));
def("fold_yoke", "Yoke fold", "Folded", foldScene("yoke", "Fold"));
def("fold_box", "Box fold", "Folded", foldScene("box", "Fold"));
def("fold_wall", "Double fold (wall)", "Folded", foldScene("wall", "Fold"));
def("fold_back", "Back-print fold", "Folded", foldScene("back", "Fold"));
def("fold_front", "Front fold", "Folded", foldScene("front", "Fold"));
def("fold_pocket", "Back-pocket fold", "Folded", foldScene("pocket", "Fold"));
def("fold_scarf", "Folded stack", "Folded", foldScene("scarf", "Fold"));
def("fold_towel", "Towel stack", "Folded", foldScene("towel", "Fold"));

def("table_stacks", "Table stacks", "Shelf & table", (p, o) => {
  const f = planFold(p, CAT[p.cat].foldKind);
  const n = Math.max(1, o.count), counts = [n, n + 1, Math.max(1, n - 1)];
  const tw = 3 * f.spec.w + 24, w = tw + 20, h = w * 0.52;
  return { ...scene3d(pkey(p, `table|${n}`), w, h, (root) => tableFolds(root, f.spec, counts)),
    prov: f.prov, note: "A feature table with three stacks. " + f.note, dims: `3 stacks · ${f1(tw)} cm of table` };
});

def("cubby", "Cubby", "Shelf & table", (p, o) => {
  const f = planFold(p, CAT[p.cat].foldKind);
  const n = Math.max(1, o.count);
  const cw = f.spec.w + 7, ch = n * f.spec.t + 9;
  const w = cw + 26, h = Math.max(ch + 26, w * 0.7);
  return { ...scene3d(pkey(p, `cubby|${n}`), w, h, (root) => cubbyFolds(root, f.spec, n)),
    prov: f.prov, note: "A stack in a cube cell. " + f.note, dims: `cube ${dimsWH(cw, ch)} · ${n} pieces` };
});

const rollScene = (len: number, dia: number, cubby: boolean): Builder => (p) => {
  const w = 3 * dia + 30, h = w * 0.72;
  return { ...scene3d(pkey(p, `roll|${len}|${dia}|${cubby}`), w, h, (root) => rolls(root, p.an.patch, p.an.color, len, dia, cubby)),
    prov: "inferred", dims: `rolls ${f1(len)} cm × Ø${f1(dia)} cm · 5 pieces`,
    note: "Rolled: only the spiral end and the outer layer show. Both are rebuilt from the real fabric swatch." };
};
def("rolled", "Rolled", "Folded", rollScene(28, 8, true));
def("towel_roll", "Spa rolls", "Folded", rollScene(32, 12, false));

def("flat_lay", "Flat lay (table)", "Shelf & table", (p) => {
  const g = geo(p);
  const w = g.W + 20, h = g.L + 20;
  return { w, h, prov: "exact", dims: `${dimsWH(g.W, g.L)} · seen from above`,
    note: "Laid flat on a table, seen from above. This is the photo itself at true scale.",
    paint: (ctx) => {
      tableTop(ctx, 2, 2, w - 4, h - 4);
      shadow(ctx, 1.5, 0.6, 0.25);
      ctx.drawImage(p.cut, 10, 10, g.W, g.L);
      noShadow(ctx);
    } };
});

def("bust_form", "Bust form", "Forms", (p) => {
  const g = geo(p);
  const neckY = 14, sw = Math.min(g.torsoW * 1.0, 44);
  const w = Math.max(g.W + 20, 60), floor = neckY + Math.max(g.L, 60) + 30, h = floor + 4;
  return { w, h, prov: "exact", dims: `form shoulder ${f1(sw)} cm · garment ${dimsWH(g.W, g.L)}`,
    note: "Dressed on a bust form. The garment is the real cut-out over the form; there's no body warp, so it reads as a pinned front.",
    paint: (ctx) => {
      dressForm(ctx, w / 2, neckY, sw, 62, floor);
      hungGarment(ctx, p, w / 2, neckY + 2.5);
    } };
});

def("dress_form", "Dress form (full)", "Forms", (p) => {
  const g = geo(p);
  const neckY = 14, sw = Math.min(g.torsoW * 1.0, 44);
  const w = Math.max(g.W + 24, 64), floor = neckY + g.L + 22, h = floor + 4;
  return { w, h, prov: "exact", dims: `${dimsWH(g.W, g.L)} on a ${f1(floor - neckY + 8)} cm form`,
    note: "On a full dress form with a stand. The garment is the real cut-out; sets and dupattas stay together as photographed.",
    paint: (ctx) => {
      dressForm(ctx, w / 2, neckY, sw, Math.min(70, g.L * 0.55), floor);
      hungGarment(ctx, p, w / 2, neckY + 2.5);
    } };
});

def("clip_hang", "Clip hanger", "Hanging", (p) => {
  const g = geo(p);
  const w = Math.max(g.W + 24, 56), barY = 16, h = barY + g.L + 12;
  return { w, h, prov: "exact", dims: `${dimsWH(g.W, g.L)} · clipped at the waistband`,
    note: "Clipped at the waistband, front facing. Real pixels.",
    paint: (ctx) => {
      wallPanel(ctx, 0, 0, w, h);
      arm(ctx, 4, barY - 7, w / 2 + 6, barY - 7);
      clipHanger(ctx, w / 2, barY - 8, barY, g.W / 2);
      shadow(ctx, 2, 1, 0.22);
      ctx.drawImage(drape(p.cut), w / 2 - g.cx, barY + 2.6, g.W, g.L);
      noShadow(ctx);
      clipHanger(ctx, w / 2, barY - 8, barY, g.W / 2);
    } };
});

def("spine_clip", "Side hung (clip)", "Hanging", spineScene(true));

def("over_bar", "Folded over hanger", "Hanging", (p) => {
  const g = geo(p), an = p.an, ppc = g.ppc;
  const split = an.legSplitY ?? Math.round(p.cut.height * 0.35);
  const row = an.rows[Math.min(an.rows.length - 1, split + 2)];
  const legW = Math.max(14, (an.cx - Math.max(0, row[0])) / ppc * 1.25);
  const len = (p.cut.height - split) / ppc;
  const d: DrapeSpec = { src: p.cut, box: { x: Math.max(0, row[0]), y: split, w: legW * ppc, h: len * ppc }, w: legW, len, frontShare: 0.52, patch: an.patch, color: an.color };
  return { ...scene3d(pkey(p, "overbar"), legW + 34, len * 0.55 + 22, (root) => drapeOverBar(root, d, "hanger")),
    prov: "exact", dims: `legs ${f1(legW)} cm wide · ${f1(len / 2)} cm drop each side`,
    note: "Legs folded together and laid over the hanger bar: both hanging halves are the real leg, from crotch to hem, draped over a real bar." };
});

def("leg_form", "Pant form", "Forms", (p) => {
  const g = geo(p);
  const w = Math.max(g.W + 24, 56), top = 10, floor = top + g.L + 20, h = floor + 4;
  return { w, h, prov: "exact", dims: `${dimsWH(g.W, g.L)} on a pant form`,
    note: "Bottoms on a waist-and-hip form with a stand. Real pixels.",
    paint: (ctx) => {
      const cx = w / 2;
      ctx.fillStyle = "#e9e3d8"; ctx.beginPath(); ctx.ellipse(cx, top + 1.5, g.W * 0.42, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = grad(ctx, cx - 1, 0, cx + 1, 0, [[0, "#8d939c"], [0.5, "#eef0f3"], [1, "#6b717a"]]);
      ctx.fillRect(cx - 0.8, top, 1.6, floor - top);
      ctx.fillStyle = "#3b3f46"; ctx.beginPath(); ctx.ellipse(cx, floor - 0.6, 14, 2, 0, 0, Math.PI * 2); ctx.fill();
      shadow(ctx, 2, 1, 0.22);
      ctx.drawImage(drape(p.cut), cx - g.cx, top + 1.5, g.W, g.L);
      noShadow(ctx);
    } };
});

// ── Footwear ─────────────────────────────────────────────────────────────────
/** True if the heel (taller collar) is on the right of a side photo. */
function heelRight(p: Product) {
  const w = p.cut.width, rows = p.an.rows;
  const colH = (x0: number, x1: number) => { let top = rows.length; for (let y = 0; y < rows.length; y++) { const r = rows[y]; if (r[0] >= 0 && r[1] >= x0 && r[0] <= x1) { top = y; break; } } return rows.length - top; };
  return colH(w * 0.75, w) > colH(0, w * 0.25);
}
const shelfScene = (p: Product, extraW: number, paintItems: (ctx: C2D, x: number, y: number) => void, depth = 30, extraH = 0): Pick<Scene, "w" | "h" | "paint"> => {
  const g = geo(p);
  depth = Math.max(12, Math.min(depth, g.L * 1.6));
  const [dx, dy] = dep(depth);
  const sw = g.W + extraW + 14, w = sw + dx + 8, shelfY = g.L + extraH - dy + 8, h = shelfY + 6;
  return { w, h, paint: (ctx) => { wallPanel(ctx, 0, 0, w, shelfY); shelf(ctx, 4, shelfY, sw, depth, 2, { top: "#f4f4f2", front: "#e3e3df", side: "#cfcfca", line: "rgba(0,0,0,.12)" }); const [ix, iy] = dep(6); paintItems(ctx, 4 + 7 + ix, shelfY + iy); } };
};

def("shoe_side", "Side profile", "Shelf & table", (p) => {
  const g = geo(p);
  return { ...shelfScene(p, 0, (ctx, x, y) => { contactShadow(ctx, x + g.W / 2, y, g.W * 1.05, 1.4); ctx.drawImage(p.cut, x, y - g.L, g.W, g.L); }),
    prov: "exact", dims: `${dimsWH(g.W, g.L)} · single shoe`, note: "The photographed side on a shoe-wall shelf. Real pixels." };
});
def("shoe_pair", "Pair", "Shelf & table", (p) => {
  const g = geo(p);
  return { ...shelfScene(p, 6, (ctx, x, y) => {
    const [bx, by] = dep(11);
    contactShadow(ctx, x + g.W / 2 + bx, y + by, g.W, 1.2);
    ctx.drawImage(dim(p.cut), x + bx, y + by - g.L, g.W, g.L);
    contactShadow(ctx, x + g.W / 2, y, g.W * 1.05, 1.4);
    ctx.drawImage(p.cut, x, y - g.L, g.W, g.L);
  }), prov: "inferred", dims: `pair · ${f1(g.W + 4)} cm of shelf`,
    note: "The second shoe re-uses the photographed side. Its real inner (medial) side wasn't photographed, so inner-side logos won't match." };
});
def("shoe_angle", "Toe-out (¾)", "Shelf & table", (p) => {
  const g = geo(p), hr = heelRight(p);
  const ww = g.W * 0.72;
  return { ...shelfScene(p, -g.W * 0.2, (ctx, x, y) => {
    contactShadow(ctx, x + ww / 2, y, ww * 1.1, 1.8);
    const near = 1.1, far = 0.86;
    const [lH, rH] = hr ? [near, far] : [far, near];
    const q: [Pt, Pt, Pt, Pt] = [[x, y - g.L * lH], [x + ww, y - g.L * rH], [x + ww, y + (hr ? -0.8 : 0.6)], [x, y + (hr ? 0.6 : -0.8)]];
    drawQuad(ctx, p.cut, { x: 0, y: 0, w: p.cut.width, h: p.cut.height }, q, 10);
  }), prov: "inferred", dims: `angled · ${f1(ww)} cm footprint`,
    note: "¾ toe-out angle faked with perspective from the single side photo. Good for layout; a true ¾ needs a 3D model or a second photo." };
});
def("shoe_riser", "On riser", "Shelf & table", (p) => {
  const g = geo(p);
  return { ...shelfScene(p, 4, (ctx, x, y) => {
    riser(ctx, x - 1, y, g.W + 4, 8, 14);
    ctx.save(); ctx.translate(x + g.W / 2, y - 8); ctx.rotate(-0.07);
    contactShadow(ctx, 0, 0, g.W, 1.2);
    ctx.drawImage(p.cut, -g.W / 2, -g.L, g.W, g.L); ctx.restore();
  }), prov: "exact", dims: `acrylic riser 8 cm · ${dimsWH(g.W, g.L)}`, note: "Tilted on an acrylic riser. Real pixels." };
});
def("shoe_box", "In box", "Shelf & table", (p) => {
  const g = geo(p);
  const bw = g.W + 4, bh = Math.max(11, g.L * 0.55), bd = 18;
  return { ...shelfScene(p, 6, (ctx, x, y) => {
    const [dx, dy] = dep(bd);
    box3d(ctx, x + dx * 0.15, y - bh * 0.15 - bh, bw, 2.5, bd * 0.2, { front: "#e46b3c", top: "#f08b5f", side: "#bf5428" });
    poly(ctx, [[x, y - bh], [x + bw, y - bh], [x + bw + dx, y - bh + dy], [x + dx, y - bh + dy]]); ctx.fillStyle = "#7a3a1c"; ctx.fill();
    ctx.save(); poly(ctx, [[x - 2, y - bh - g.L], [x + bw + dx + 2, y - bh - g.L], [x + bw + dx, y - bh + dy * 0.4], [x, y - bh + 0.6]]); ctx.clip();
    ctx.drawImage(p.cut, x + 2 + dx * 0.4, y - bh + dy * 0.4 - g.L * 0.55, g.W, g.L); ctx.restore();
    poly(ctx, [[x + bw, y - bh], [x + bw + dx, y - bh + dy], [x + bw + dx, y + dy], [x + bw, y]]); ctx.fillStyle = "#bf5428"; ctx.fill();
    ctx.fillStyle = "#e46b3c"; ctx.fillRect(x, y - bh, bw, bh);
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(x + bw * 0.62, y - bh * 0.7, bw * 0.3, bh * 0.4);
  }), prov: "exact", dims: `box ${f1(bw)} × ${f1(bh)} × ${bd} cm`, note: "The shoe sits in an open box with the photographed side visible. The box is generic." };
});
def("shoe_heel", "Heel-out", "Shelf & table", (p) => {
  const g = geo(p);
  const hw = Math.min(10, g.W * 0.35);
  const has = !!p.back;
  return { ...shelfScene(p, -g.W + hw, (ctx, x, y) => {
    contactShadow(ctx, x + hw / 2, y, hw * 1.4, 1.2);
    if (p.back) { const bg = p.back.cut; const bh = g.L, bw = (bg.width / bg.height) * bh; ctx.drawImage(bg, x, y - bh, bw, bh); return; }
    const face = placeholderFace(p, 200, Math.round((200 * g.L) / hw), "Heel photo");
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y - g.L, hw, g.L, [hw * 0.45, hw * 0.45, 1, 1]); ctx.clip();
    ctx.drawImage(face, x, y - g.L, hw, g.L); ctx.restore();
  }), prov: has ? "exact" : "needs", dims: `heel ${f1(hw)} cm wide`,
    note: has ? "Heel-out, from the back photo." : "Heel-out shows the back of the shoe, which a side photo can't see. Upload a heel or back photo." };
});

// ── Bags ─────────────────────────────────────────────────────────────────────
def("bag_shelf", "Front on shelf", "Shelf & table", (p) => {
  const g = geo(p);
  return { ...shelfScene(p, 0, (ctx, x, y) => { contactShadow(ctx, x + g.W / 2, y, g.W, 1.4); ctx.drawImage(p.cut, x, y - g.L, g.W, g.L); }, 36),
    prov: "exact", dims: dimsWH(g.W, g.L), note: "Standing front-facing on a shelf. Real pixels." };
});
def("bag_hook", "On hook", "Wall & peg", (p) => {
  const g = geo(p);
  const w = g.W + 24, hookY = 10, h = hookY + g.L + 10;
  return { w, h, prov: "exact", dims: `${dimsWH(g.W, g.L)} · hung by the handle`, note: "Hung from a wall hook by its handle. Real pixels.",
    paint: (ctx) => {
      wallPanel(ctx, 0, 0, w, h);
      pegHook(ctx, w / 2, hookY, 14);
      shadow(ctx, 2, 1.2, 0.22);
      ctx.drawImage(p.cut, w / 2 - g.cx, hookY + 1.2, g.W, g.L);
      noShadow(ctx);
      ctx.strokeStyle = grad(ctx, 0, hookY - 1, 0, hookY + 2, [[0, "#8d939c"], [0.5, "#eef0f3"], [1, "#6b717a"]]); ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(w / 2, hookY); ctx.lineTo(w / 2 + 1.6, hookY + 2.4); ctx.stroke();
    } };
});
def("bag_angle", "Angled (¾)", "Shelf & table", (p) => {
  const g = geo(p), d = CAT[p.cat].thick, ppc = g.ppc;
  const fw = g.W * 0.82;
  return { ...shelfScene(p, d * 0.5, (ctx, x, y) => {
    const sideW = d * 0.55;
    contactShadow(ctx, x + (fw + sideW) / 2, y, fw + sideW + 4, 1.6);
    const bodyTop = y - g.L * 0.78;
    poly(ctx, [[x + fw, bodyTop + 1.2], [x + fw + sideW, bodyTop - 1.6], [x + fw + sideW, y - 1.2], [x + fw, y]]);
    ctx.fillStyle = fabric(ctx, p.an.patch, ppc); ctx.fill(); ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fill();
    drawQuad(ctx, p.cut, { x: 0, y: 0, w: p.cut.width, h: p.cut.height }, [[x, y - g.L], [x + fw, y - g.L + 1.2], [x + fw, y], [x, y - 0.6]], 10);
  }, 40), prov: "inferred", dims: `front ${f1(fw)} cm + gusset ${f1(d)} cm`,
    note: "The front is real pixels in perspective. The side gusset is rebuilt from the bag's real material." };
});
def("bag_side", "Side profile", "Shelf & table", (p) => {
  const g = geo(p), d = CAT[p.cat].thick, ppc = g.ppc;
  return { ...shelfScene(p, d - g.W, (ctx, x, y) => {
    const bodyTop = y - g.L * 0.75;
    contactShadow(ctx, x + d / 2, y, d * 1.4, 1.2);
    ctx.beginPath(); ctx.moveTo(x + 1, bodyTop); ctx.lineTo(x + d - 1, bodyTop); ctx.quadraticCurveTo(x + d + 0.6, y * 0.5 + bodyTop * 0.5, x + d, y); ctx.lineTo(x, y); ctx.quadraticCurveTo(x - 0.6, y * 0.5 + bodyTop * 0.5, x + 1, bodyTop); ctx.closePath();
    ctx.fillStyle = fabric(ctx, p.an.patch, ppc); ctx.fill();
    ctx.fillStyle = grad(ctx, x, 0, x + d, 0, CYL); ctx.fill();
    ctx.strokeStyle = rgb(p.an.color, 0.6); ctx.lineWidth = 0.9; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x + d / 2, bodyTop); ctx.lineTo(x + d / 2, y - g.L); ctx.stroke();
  }, 30), prov: "inferred", dims: `${f1(d)} cm deep`, note: "Side-on shows only the gusset, rebuilt from the real material and colour." };
});

// ── Caps ─────────────────────────────────────────────────────────────────────
def("cap_shelf", "Front on shelf", "Shelf & table", (p) => {
  const g = geo(p);
  return { ...shelfScene(p, 0, (ctx, x, y) => { contactShadow(ctx, x + g.W / 2, y, g.W, 1.2); ctx.drawImage(p.cut, x, y - g.L, g.W, g.L); }, 24),
    prov: "exact", dims: dimsWH(g.W, g.L), note: "Front-facing on a shelf. Real pixels." };
});
def("cap_head", "Head form", "Forms", (p) => {
  const g = geo(p);
  const w = g.W + 26, top = 8, hw = g.W * 0.82;
  const h = top + g.L * 0.5 + hw * 1.25 * 1.25 + 14;
  return { w, h, prov: "exact", dims: `${dimsWH(g.W, g.L)} on a head form`, note: "On a head form. The cap is the real cut-out.",
    paint: (ctx) => {
      const headTop = top + g.L * 0.45;
      headForm(ctx, w / 2, headTop, hw);
      shadow(ctx, 1.5, 0.8, 0.2);
      ctx.drawImage(p.cut, w / 2 - g.cx, top, g.W, g.L);
      noShadow(ctx);
    } };
});
def("cap_stack", "Nested stack", "Shelf & table", (p, o) => {
  const g = geo(p), n = Math.min(5, Math.max(2, o.count));
  return { ...shelfScene(p, (n - 1) * 1.2, (ctx, x, y) => {
    contactShadow(ctx, x + g.W / 2, y, g.W, 1.2);
    for (let k = n - 1; k >= 0; k--) ctx.drawImage(k ? dim(p.cut) : p.cut, x + k * 1.2, y - g.L - k * 1.6, g.W, g.L);
  }, 24), prov: "exact", dims: `${n} caps nested`, note: "Caps nested front to back. Every layer is the real cut-out." };
});
def("cap_hook", "On peg", "Wall & peg", (p) => {
  const g = geo(p);
  const w = g.W + 22, hookY = 9, h = hookY + g.L + 8;
  return { w, h, prov: "exact", dims: dimsWH(g.W, g.L), note: "Hung on a peg by the back strap. Real pixels.",
    paint: (ctx) => {
      wallPanel(ctx, 0, 0, w, h); pegHook(ctx, w / 2, hookY, 10);
      shadow(ctx, 1.5, 1, 0.22); ctx.drawImage(p.cut, w / 2 - g.cx, hookY + 0.8, g.W, g.L); noShadow(ctx);
    } };
});

// ── Draped textiles ──────────────────────────────────────────────────────────
const drapeScene = (mode: "hanger" | "rod", panelW: number, dropCm: number): Builder => (p) => {
  const g = geo(p), ppc = g.ppc;
  const pw = Math.min(panelW, g.W), len = Math.min(dropCm * 2, g.L);
  const d: DrapeSpec = { src: p.cut, box: { x: (p.cut.width - pw * ppc) / 2, y: (p.cut.height - len * ppc) / 2, w: pw * ppc, h: len * ppc }, w: pw, len, frontShare: 0.55, patch: p.an.patch, color: p.an.color };
  return { ...scene3d(pkey(p, `drape|${mode}|${panelW}|${dropCm}`), pw + 36, len * 0.55 + 22, (root) => drapeOverBar(root, d, mode)),
    prov: "exact", dims: `${f1(pw)} cm panel · ${f1(len * 0.55)} cm front drop`,
    note: "Folded and laid over a bar: the strip is the real textile, draped over a real bar with soft folds, so borders and prints fall where they really would." };
};
def("scarf_bar", "Draped on bar", "Hanging", drapeScene("rod", 26, 60));
def("scarf_hanger", "On hanger", "Hanging", drapeScene("hanger", 22, 55));
def("towel_bar", "On towel bar", "Hanging", drapeScene("rod", 40, 45));

// ── Packaged / hardgoods ─────────────────────────────────────────────────────
def("pack_shelf", "Facings on shelf", "Shelf & table", (p, o) => {
  const g = geo(p), n = Math.max(1, o.count);
  const gap = 1.5;
  return { ...shelfScene(p, (n - 1) * (g.W + gap), (ctx, x, y) => {
    for (let k = 0; k < n; k++) { const xx = x + k * (g.W + gap); contactShadow(ctx, xx + g.W / 2, y, g.W * 1.05, 1); ctx.drawImage(p.cut, xx, y - g.L, g.W, g.L); }
  }, 30), prov: "exact", dims: `${n} facings × ${f1(g.W)} cm = ${f1(n * g.W + (n - 1) * gap)} cm`, note: "A row of facings. Every facing is the real photo at true size." };
});
def("pack_stack", "Stacked", "Shelf & table", (p, o) => {
  const g = geo(p), n = Math.max(2, o.count), cols = Math.ceil(n / 2);
  return { ...shelfScene(p, (cols - 1) * g.W, (ctx, x, y) => {
    for (let k = 0; k < n; k++) { const c = k % cols, r = Math.floor(k / cols); ctx.drawImage(p.cut, x + c * g.W, y - g.L * (r + 1), g.W, g.L); }
  }, 30, g.L), prov: "exact", dims: `${cols} wide × 2 high`, note: "Stacked two high. Real pixels; stacking works only for products that are stable on top of each other." };
});
def("pack_peg", "On peg hook", "Wall & peg", (p) => {
  const g = geo(p);
  const w = g.W + 24, hookY = 9, h = hookY + g.L + 14;
  return { w, h, prov: "exact", dims: `${dimsWH(g.W, g.L)} + hang tab`, note: "Hung from a peg hook with a hang tab added. The product is real pixels.",
    paint: (ctx) => {
      ctx.fillStyle = "#e7e2d9"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,.10)";
      for (let yy = 3; yy < h; yy += 2.54) for (let xx = 3; xx < w; xx += 2.54) { ctx.beginPath(); ctx.arc(xx, yy, 0.25, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#f8f8f6"; ctx.beginPath(); ctx.roundRect(w / 2 - 3.5, hookY - 1, 7, 5, 1); ctx.fill();
      ctx.fillStyle = "#e7e2d9"; ctx.beginPath(); ctx.ellipse(w / 2, hookY + 0.6, 1.6, 0.6, 0, 0, 7); ctx.fill();
      shadow(ctx, 1.5, 1, 0.2); ctx.drawImage(p.cut, w / 2 - g.cx, hookY + 3.5, g.W, g.L); noShadow(ctx);
      pegHook(ctx, w / 2, hookY - 4, 14);
    } };
});
def("pack_tray", "Shelf-ready tray", "Shelf & table", (p, o) => {
  const g = geo(p), n = Math.max(2, o.count);
  const tw = n * g.W + 2, th = Math.max(4, g.L * 0.28);
  return { ...shelfScene(p, (n - 1) * g.W + 2, (ctx, x, y) => {
    const [dx, dy] = dep(18);
    poly(ctx, [[x, y - th], [x + dx, y - th + dy], [x + dx + tw, y - th + dy], [x + tw, y - th]]); ctx.fillStyle = "#b98d5c"; ctx.fill();
    for (let k = 0; k < n; k++) ctx.drawImage(p.cut, x + 1 + k * g.W, y - g.L - 0.4, g.W, g.L);
    poly(ctx, [[x + tw, y - th], [x + tw + dx, y - th + dy], [x + tw + dx, y + dy], [x + tw, y]]); ctx.fillStyle = "#9e7547"; ctx.fill();
    ctx.fillStyle = "#c99d6a"; ctx.fillRect(x, y - th, tw, th);
    label(ctx, "SHELF READY", x + tw / 2, y - th / 2 + 0.6, Math.min(2, th * 0.35), "rgba(80,50,20,.6)");
  }, 30), prov: "exact", dims: `tray ${f1(tw)} cm · ${n} units`, note: "In a shelf-ready tray. The products are real pixels; the tray is generic." };
});

export const DISPLAYS = Object.fromEntries(D.map((d) => [d.id, d])) as Record<string, DisplayDef>;
export const displaysFor = (cat: CatId) => CAT[cat].displays.map((id) => DISPLAYS[id]).filter(Boolean);
export const PROV_LABEL: Record<Prov, string> = { exact: "Real pixels", inferred: "Inferred surface", needs: "Needs another photo" };

// cubby falls back to the category's fold, so towels get a towel cubby, etc.
export { planFold };

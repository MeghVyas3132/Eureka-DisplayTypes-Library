// Every display type is a small scene in centimetres built from ONE product photo.
// Each scene says honestly how it was made (provenance), which is the whole point:
//   exact   – the visible surface is real pixels from the photo (cropped / warped)
//   inferred – a surface the photo never saw, rebuilt from the real fabric swatch
//   needs   – the visible surface defines the product but isn't in the photo
import { mk, ctx2d, rgb, type Analysis, type Box, type Canvas } from "./image.ts";
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
export interface Scene { w: number; h: number; prov: Prov; note: string; dims: string; paint: (ctx: C2D) => void }

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

/**
 * The visible top face of a folded item: a crop of the photo at true size,
 * laid over the fabric swatch so tucked-in edges read as fabric, not holes.
 */
function foldFace(v: View, box: Box, ppcSwatch: number): Canvas {
  const fw = Math.max(4, Math.round(box.w)), fh = Math.max(4, Math.round(box.h));
  const c = mk(fw, fh);
  const x = ctx2d(c);
  x.fillStyle = fabric(x, v.an.patch, 1);
  x.fillRect(0, 0, fw, fh);
  // intersect the crop with the image
  const sx0 = Math.max(0, box.x), sy0 = Math.max(0, box.y);
  const sx1 = Math.min(v.cut.width, box.x + box.w), sy1 = Math.min(v.cut.height, box.y + box.h);
  if (sx1 > sx0 && sy1 > sy0) {
    const k = fw / box.w;
    x.drawImage(v.cut, sx0, sy0, sx1 - sx0, sy1 - sy0, (sx0 - box.x) * k, (sy0 - box.y) * k, (sx1 - sx0) * k, (sy1 - sy0) * k);
  }
  // tucked side edges + soft fold at the front
  x.fillStyle = grad(x, 0, 0, fw, 0, [[0, "rgba(0,0,0,.20)"], [0.05, "rgba(0,0,0,0)"], [0.95, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.22)"]]);
  x.fillRect(0, 0, fw, fh);
  x.fillStyle = grad(x, 0, 0, 0, fh, [[0, "rgba(0,0,0,.05)"], [0.85, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.18)"]]);
  x.fillRect(0, 0, fw, fh);
  void ppcSwatch;
  return c;
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

interface FoldPlan { face: Canvas; w: number; d: number; t: number; prov: Prov; note: string }

function planFold(p: Product, kind: FoldKind): FoldPlan {
  const g = geo(p), c = CAT[p.cat], an = p.an;
  let { w, d, t } = c.fold;
  const ppc = g.ppc;
  const centreX = (an.torso[0] + an.torso[1]) / 2;
  let v: View = p;
  let box: Box;
  let prov: Prov = "exact";
  let note = "Top face = real pixels cropped at the store-standard fold size. Folded edges are built from the real fabric.";
  switch (kind) {
    case "print": {
      const pb = an.printBox;
      const cy = pb ? pb.y + pb.h / 2 : an.shoulderY + (d * ppc) / 2;
      const cxp = pb ? pb.x + pb.w / 2 : centreX;
      box = { x: cxp - (w * ppc) / 2, y: Math.max(0, cy - (d * ppc) / 2), w: w * ppc, h: d * ppc };
      note = pb ? "Print fold: the crop is centred on the detected graphic / embroidery. Real pixels." : "No distinct print found, so this falls back to a neckline fold. Real pixels.";
      break;
    }
    case "wall":
      d = d / 2; t = t * 2;
      box = { x: centreX - (w * ppc) / 2, y: 0, w: w * ppc, h: d * ppc };
      note = "Double fold for wall shelves: half the depth, twice the thickness. The top face is real pixels.";
      break;
    case "front": case "pocket": {
      const top = an.rows.find((r) => r[0] >= 0) ?? Int32Array.of(0, p.cut.width);
      const half = (an.cx - top[0]) / ppc;
      w = Math.min(32, Math.max(18, half));
      if (kind === "pocket") {
        if (p.back) { v = p.back; note = "Back-pocket fold, using the back photo. Real pixels."; }
        else return { face: placeholderFace(p, Math.round(w * 10), Math.round(d * 10), "Back photo needed"), w, d, t, prov: "needs",
          note: "Denim is folded with the back pockets showing, and they aren't in a front photo. Upload a back photo and this becomes real pixels." };
      }
      const vr = v.an.rows.find((r) => r[0] >= 0) ?? Int32Array.of(0, v.cut.width);
      box = { x: vr[0], y: 0, w: w * ppc, h: d * ppc };
      if (kind === "front") note = "Leg-over-leg fold, front facing: waistband, front pocket and fly are real pixels.";
      break;
    }
    case "back":
      if (!p.back) return { face: placeholderFace(p, Math.round(w * 10), Math.round(d * 10), "Back photo needed"), w, d, t, prov: "needs",
        note: "Back-print fold shows the garment's back, which a front photo never sees. Upload a back photo to fix this." };
      v = p.back;
      box = { x: (v.an.torso[0] + v.an.torso[1]) / 2 - (w * ppc) / 2, y: 0, w: w * ppc, h: d * ppc };
      note = "Back-print fold from the back photo. Real pixels.";
      break;
    case "scarf": case "towel":
      // towels fold so the woven end band faces up; scarves show their centre panel
      box = kind === "towel"
        ? { x: p.cut.width / 2 - (w * ppc) / 2, y: p.cut.height - d * ppc, w: w * ppc, h: d * ppc }
        : { x: p.cut.width / 2 - (w * ppc) / 2, y: p.cut.height / 2 - (d * ppc) / 2, w: w * ppc, h: d * ppc };
      note = "Folded to the standard size; the face is the real centre panel of the photo.";
      break;
    default:
      // board / collar / yoke / box: neckline at the back edge, chest towards the customer
      box = { x: centreX - (w * ppc) / 2, y: 0, w: w * ppc, h: d * ppc };
      if (kind === "collar") note = "Collar fold: collar, placket and chest are real pixels at fold-board size.";
      if (kind === "yoke") note = "Yoke fold: neckline and yoke embroidery are real pixels. A dupatta, if any, is folded underneath.";
      if (kind === "box") note = "Box fold for bulky knits: thicker folds; the front is real pixels.";
  }
  return { face: foldFace(v, box, ppc), w, d, t, prov, note };
}

/** A stack of folded items sitting on a surface whose front edge is at y = baseY. */
function foldStack(ctx: C2D, p: Product, f: FoldPlan, x: number, baseY: number, count: number) {
  const ppc = ppcOf(p);
  const [dx, dy] = dep(f.d);
  const pat = fabric(ctx, p.an.patch, ppc);
  contactShadow(ctx, x + f.w / 2 + dx / 2, baseY + dy / 2, f.w + dx + 6, 3);
  // solid body behind the stack so no seam between faces can show the wall through
  const topY = baseY - count * f.t;
  poly(ctx, [[x, baseY], [x + f.w, baseY], [x + f.w + dx, baseY + dy], [x + f.w + dx, topY + dy], [x + dx, topY + dy], [x, topY]]);
  ctx.fillStyle = rgb(p.an.color, 0.55); ctx.fill();
  for (let k = 0; k < count; k++) {
    const jx = ((k * 37) % 5 - 2) * 0.12;
    const y = baseY - k * f.t;
    const x0 = x + jx;
    // front fold edge
    ctx.fillStyle = pat; ctx.beginPath(); ctx.roundRect(x0, y - f.t, f.w, f.t, f.t * 0.35); ctx.fill();
    ctx.fillStyle = grad(ctx, 0, y - f.t, 0, y, FOLD_EDGE); ctx.fill();
    // right side
    poly(ctx, [[x0 + f.w, y - f.t], [x0 + f.w + dx, y - f.t + dy], [x0 + f.w + dx, y + dy], [x0 + f.w, y]]);
    ctx.fillStyle = pat; ctx.fill(); ctx.fillStyle = "rgba(0,0,0,.30)"; ctx.fill();
    if (k === count - 1) {
      const ty = y - f.t;
      // under-fill so no background seam shows between the warped face and the sides
      poly(ctx, [[x0 + dx, ty + dy], [x0 + f.w + dx, ty + dy], [x0 + f.w, ty], [x0, ty]]);
      ctx.fillStyle = rgb(p.an.color, 0.8); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.35; ctx.fill(); ctx.stroke();
      drawQuad(ctx, f.face, { x: 0, y: 0, w: f.face.width, h: f.face.height }, [[x0 + dx, ty + dy], [x0 + f.w + dx, ty + dy], [x0 + f.w, ty], [x0, ty]]);
    }
    ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.moveTo(x0 + 0.3, y); ctx.lineTo(x0 + f.w - 0.3, y); ctx.stroke();
  }
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

function spineStrip(ctx: C2D, p: Product, x: number, top: number, t: number, len: number, flare = 1.18, clip = false) {
  const ppc = ppcOf(p);
  const b = top + len;
  const shape = () => {
    ctx.beginPath();
    if (clip) {
      ctx.moveTo(x, top); ctx.lineTo(x + t, top);
    } else {
      ctx.moveTo(x, top + 3);
      ctx.quadraticCurveTo(x + t * 0.05, top, x + t / 2, top - 0.2);
      ctx.quadraticCurveTo(x + t * 0.95, top, x + t, top + 3);
    }
    ctx.lineTo(x + t + (t * (flare - 1)) / 2, b - 0.6);
    ctx.quadraticCurveTo(x + t / 2, b + 0.8, x - (t * (flare - 1)) / 2, b - 0.6);
    ctx.closePath();
  };
  shape(); ctx.fillStyle = fabric(ctx, p.an.patch, ppc, 90); ctx.fill();
  shape(); ctx.fillStyle = grad(ctx, x - 0.5, 0, x + t + 0.5, 0, CYL); ctx.fill();
  shape(); ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 0.1; ctx.stroke();
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

def("spine_out", "Side / spine hung", "Hanging", (p, o) => {
  const g = geo(p), t = CAT[p.cat].thick, n = Math.max(1, o.count + 2);
  const len = g.L * 0.97, gap = t * 0.92;
  const w = n * gap + 30, barY = 14, h = barY + len + 12;
  return { w, h, prov: "inferred", dims: `${n} facings × ${f1(t)} cm = ${f1(n * gap)} cm of rail · drop ${f1(len)} cm`,
    note: "The side of a hung garment is never in a front photo. Each spine is the real fabric swatch (tiled) on a sleeve-and-shoulder profile, with cylinder shading. At rail scale this reads as the real thing.",
    paint: (ctx) => {
      wallPanel(ctx, 0, 0, w, h);
      rail(ctx, 6, w - 6, barY - 6);
      for (let k = 0; k < n; k++) {
        const x = 15 + k * gap;
        hangerEdge(ctx, x + t / 2, barY - 7.3, barY + 0.8);
        shadow(ctx, 1.2, 0.4, 0.18);
        spineStrip(ctx, p, x, barY + 1, t, len);
        noShadow(ctx);
      }
    } };
});

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

const foldScene = (kind: FoldKind | "cat", label: string): Builder => (p, o) => {
  const f = planFold(p, kind === "cat" ? CAT[p.cat].foldKind : kind);
  const n = Math.max(1, o.count);
  const [dx, dy] = dep(f.d + 6);
  const sw = f.w + 14, w = sw + dx + 8, shelfY = n * f.t - dy + 10, h = shelfY + 8;
  return { w, h, prov: f.prov, note: f.note, dims: `${label} ${dimsWH(f.w, f.d)} · stack of ${n} = ${f1(n * f.t)} cm`,
    paint: (ctx) => {
      shelf(ctx, 4, shelfY, sw, f.d + 6);
      const [ix, iy] = dep(2.5);
      foldStack(ctx, p, f, 4 + 7 + ix, shelfY + iy, n);
    } };
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
  const n = Math.max(1, o.count);
  const counts = [n, n + 1, Math.max(1, n - 1)];
  const gap = 5, depth = f.d + 14;
  const [dx, dy] = dep(depth);
  const tw = 3 * f.w + 4 * gap, w = tw + dx + 10, topY = (n + 1) * f.t - dy + 12;
  const h = topY + 14;
  return { w, h, prov: f.prov, note: "A feature table with three stacks. " + f.note, dims: `3 stacks · ${f1(tw)} cm of table`,
    paint: (ctx) => {
      shelf(ctx, 5, topY, tw, depth, 4);
      ctx.fillStyle = "#a88c63"; ctx.fillRect(9, topY + 4, 2.5, h - topY - 4); ctx.fillRect(5 + tw - 6.5, topY + 4, 2.5, h - topY - 4);
      const [ix, iy] = dep(5);
      counts.forEach((c, i) => foldStack(ctx, p, f, 5 + gap + i * (f.w + gap) + ix, topY + iy, c));
    } };
});

def("cubby", "Cubby", "Shelf & table", (p, o) => {
  const f = planFold(p, CAT[p.cat].foldKind);
  const n = Math.max(1, o.count);
  const cw = f.w + 6, chh = n * f.t + 10, cd = f.d + 4, wall = 1.8;
  const [dx, dy] = dep(cd);
  const w = cw + 2 * wall + dx + 8, h = chh + 2 * wall - dy + 8;
  return { w, h, prov: f.prov, note: "A stack in a cube cell. " + f.note, dims: `cube ${dimsWH(cw, chh)} · ${n} pieces`,
    paint: (ctx) => {
      const x = 4, y = 4 - dy + wall;
      const inner = { x: x + wall, y: y, w: cw, h: chh };
      ctx.fillStyle = "#cdb48c";
      ctx.fillRect(inner.x + dx, inner.y + dy, inner.w, inner.h);
      poly(ctx, [[inner.x, inner.y], [inner.x + dx, inner.y + dy], [inner.x + dx, inner.y + inner.h + dy], [inner.x, inner.y + inner.h]]); ctx.fillStyle = "#bba077"; ctx.fill();
      poly(ctx, [[inner.x, inner.y], [inner.x + inner.w, inner.y], [inner.x + inner.w + dx, inner.y + dy], [inner.x + dx, inner.y + dy]]); ctx.fillStyle = "#a88c63"; ctx.fill();
      poly(ctx, [[inner.x, inner.y + inner.h], [inner.x + inner.w, inner.y + inner.h], [inner.x + inner.w + dx, inner.y + inner.h + dy], [inner.x + dx, inner.y + inner.h + dy]]); ctx.fillStyle = "#dcc6a2"; ctx.fill();
      const [ix, iy] = dep(2);
      foldStack(ctx, p, f, inner.x + 3 + ix, inner.y + inner.h + iy, n);
      ctx.fillStyle = "#c4a77c";
      ctx.fillRect(x, y - wall, cw + 2 * wall, wall); ctx.fillRect(x, y + chh, cw + 2 * wall, wall);
      ctx.fillRect(x, y - wall, wall, chh + 2 * wall); ctx.fillRect(x + wall + cw, y - wall, wall, chh + 2 * wall);
    } };
});

const rollScene = (len: number, dia: number): Builder => (p) => {
  const ppc = ppcOf(p), r = dia / 2;
  const [dx, dy] = dep(len);
  const cols = 3, rows = 2;
  const w = cols * dia + dx + 16, shelfY = rows * dia * 0.9 - dy + 8, h = shelfY + 8;
  return { w, h, prov: "inferred", dims: `rolls ${f1(len)} cm × Ø${f1(dia)} cm · ${cols * rows - 1} pieces`,
    note: "Rolled: you only see the spiral end and the outer layer. Both are rebuilt from the real fabric swatch.",
    paint: (ctx) => {
      shelf(ctx, 3, shelfY, cols * dia + 10, len + 4);
      const pat = fabric(ctx, p.an.patch, ppc);
      const L = Math.hypot(dx, dy), vx = dx / L, vy = dy / L, nx = -vy, ny = vx;
      const roll = (cx: number, cy: number) => {
        // body: the capsule swept from the front circle back along the depth axis
        const bx = cx + dx, by = cy + dy;
        poly(ctx, [[cx + nx * r, cy + ny * r], [bx + nx * r, by + ny * r], [bx - nx * r, by - ny * r], [cx - nx * r, cy - ny * r]]);
        ctx.fillStyle = pat; ctx.fill();
        ctx.fillStyle = grad(ctx, cx + nx * r, cy + ny * r, cx - nx * r, cy - ny * r, CYL); ctx.fill();
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fillStyle = pat; ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fill();
        // spiral end facing the customer
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = pat; ctx.fill();
        const rg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        rg.addColorStop(0, "rgba(255,255,255,.12)"); rg.addColorStop(1, "rgba(0,0,0,.22)");
        ctx.fillStyle = rg; ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.30)"; ctx.lineWidth = 0.12;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 7; a += 0.2) { const rr = r * (0.08 + (a / (Math.PI * 7)) * 0.9); const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
        ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 0.1; ctx.stroke();
      };
      const x0 = 3 + 5 + r, base = shelfY - r - 0.3;
      for (let i = 0; i < cols; i++) roll(x0 + i * dia, base);
      for (let i = 0; i < cols - 1; i++) roll(x0 + r + i * dia, base - dia * 0.86);
    } };
};
def("rolled", "Rolled", "Folded", rollScene(28, 8));
def("towel_roll", "Spa rolls", "Folded", rollScene(32, 12));

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

def("spine_clip", "Side hung (clip)", "Hanging", (p, o) => {
  const g = geo(p), t = CAT[p.cat].thick, n = Math.max(1, o.count + 2), gap = t * 0.95;
  const len = g.L * 0.98;
  const w = n * gap + 30, barY = 14, h = barY + len + 12;
  return { w, h, prov: "inferred", dims: `${n} facings · ${f1(n * gap)} cm of rail`,
    note: "Bottoms seen side-on on clip hangers: the outseam is rebuilt from the real fabric swatch.",
    paint: (ctx) => {
      wallPanel(ctx, 0, 0, w, h);
      rail(ctx, 6, w - 6, barY - 6);
      for (let k = 0; k < n; k++) {
        const x = 15 + k * gap;
        hangerEdge(ctx, x + t / 2, barY - 7.3, barY);
        ctx.fillStyle = "#2b2f36"; ctx.fillRect(x - 0.3, barY, t + 0.6, 2.4);
        spineStrip(ctx, p, x, barY + 2.2, t, len, 1.05, true);
      }
    } };
});

def("over_bar", "Folded over hanger", "Hanging", (p) => {
  const g = geo(p), an = p.an, ppc = g.ppc;
  const split = an.legSplitY ?? Math.round(p.cut.height * 0.35);
  const row = an.rows[Math.min(an.rows.length - 1, split + 2)];
  const legW = Math.max(8, (an.cx - Math.max(0, row[0])) / ppc);
  const segPx = Math.round((p.cut.height - split) * 0.48);
  const src: Box = { x: Math.max(0, row[0]), y: split, w: legW * ppc, h: segPx };
  const segL = segPx / ppc;
  const w = Math.max(legW + 40, 50), barY = 16, h = barY + segL + 12;
  return { w, h, prov: "exact", dims: `leg ${f1(legW)} cm wide · ${f1(segL)} cm drop`,
    note: "Folded leg-over-leg across the hanger bar. Both visible halves are real crops of the leg.",
    paint: (ctx) => {
      wallPanel(ctx, 0, 0, w, h);
      arm(ctx, 4, barY - 7, w / 2 + 6, barY - 7);
      hanger(ctx, w / 2, barY - 8, barY, legW * 0.7 + 3);
      ctx.save(); ctx.globalAlpha = 1;
      blit(ctx, dim(p.cut), src, w / 2 - legW / 2 + 2, barY + 1.6, legW, segL * 0.92);
      shadow(ctx, 1.5, 0.6, 0.22);
      blit(ctx, p.cut, src, w / 2 - legW / 2, barY + 1.2, legW, segL);
      noShadow(ctx); ctx.restore();
      ctx.fillStyle = fabric(ctx, p.an.patch, ppc); ctx.beginPath(); ctx.roundRect(w / 2 - legW / 2, barY - 0.6, legW, 2.4, 1.2); ctx.fill();
      ctx.fillStyle = grad(ctx, 0, barY - 0.6, 0, barY + 1.8, FOLD_EDGE); ctx.fill();
    } };
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
const drapeScene = (withHanger: boolean, panelW: number, dropCm: number): Builder => (p) => {
  const g = geo(p), ppc = g.ppc;
  const pw = Math.min(panelW, g.W), drop = Math.min(dropCm, g.L * 0.5);
  const src: Box = { x: (p.cut.width - pw * ppc) / 2, y: (p.cut.height - drop * 2 * ppc) / 2, w: pw * ppc, h: drop * ppc };
  const src2: Box = { ...src, y: src.y + drop * ppc };
  const w = pw + 36, barY = 18, h = barY + drop + 14;
  return { w, h, prov: "exact", dims: `${f1(pw)} cm panel · ${f1(drop)} cm drop`,
    note: "Folded over a bar: both hanging halves are real crops of the textile, with the fold drawn from the real fabric.",
    paint: (ctx) => {
      wallPanel(ctx, 0, 0, w, h);
      if (withHanger) { arm(ctx, 4, barY - 7, w / 2 + 6, barY - 7); hanger(ctx, w / 2, barY - 8, barY - 1, pw * 0.5 + 2); }
      else { ctx.fillStyle = "#9aa1aa"; ctx.fillRect(6, barY - 4, 2.5, 6); ctx.fillRect(w - 8.5, barY - 4, 2.5, 6); rail(ctx, 6, w - 6, barY - 1, 1.1); }
      blit(ctx, dim(p.cut), src2, w / 2 - pw / 2 + 1.5, barY, pw, drop * 0.94);
      shadow(ctx, 1.5, 0.6, 0.22);
      blit(ctx, p.cut, src, w / 2 - pw / 2, barY + 0.4, pw, drop);
      noShadow(ctx);
      ctx.fillStyle = fabric(ctx, p.an.patch, ppc); ctx.beginPath(); ctx.roundRect(w / 2 - pw / 2, barY - 2.2, pw, 3, 1.5); ctx.fill();
      ctx.fillStyle = grad(ctx, 0, barY - 2.2, 0, barY + 0.8, FOLD_EDGE); ctx.fill();
    } };
};
def("scarf_bar", "Draped on bar", "Hanging", drapeScene(false, 26, 60));
def("scarf_hanger", "On hanger", "Hanging", drapeScene(true, 22, 55));
def("towel_bar", "On towel bar", "Hanging", drapeScene(false, 40, 45));

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

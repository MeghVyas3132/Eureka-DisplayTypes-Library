// Drawing primitives. Scene units are centimetres (y down); the stage sets the
// transform, so every size below is a real-world size.
import { mk, ctx2d, type Box, type Canvas } from "./image.ts";

export type C2D = CanvasRenderingContext2D;
export type Pt = [number, number];

/** Oblique projection for depth: 1 cm of depth moves (OX, −OY) on screen. */
export const OX = 0.32, OY = 0.36;
export const dep = (d: number): Pt => [d * OX, -d * OY];

// ── Mesh warp ────────────────────────────────────────────────────────────────
function affine(s: Pt[], d: Pt[]) {
  const [[x0, y0], [x1, y1], [x2, y2]] = s;
  const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  const solve = (u0: number, u1: number, u2: number) => [
    (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / den,
    (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / den,
    (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / den,
  ];
  const [a, c, e] = solve(d[0][0], d[1][0], d[2][0]);
  const [b, dd, f] = solve(d[0][1], d[1][1], d[2][1]);
  return [a, b, c, dd, e, f] as const;
}

function tri(ctx: C2D, img: CanvasImageSource, s: Pt[], d: Pt[]) {
  const cx = (d[0][0] + d[1][0] + d[2][0]) / 3, cy = (d[0][1] + d[1][1] + d[2][1]) / 3;
  const grow = (p: Pt): Pt => [cx + (p[0] - cx) * 1.03 + Math.sign(p[0] - cx) * 0.02, cy + (p[1] - cy) * 1.03 + Math.sign(p[1] - cy) * 0.02];
  ctx.save();
  ctx.beginPath();
  const g = d.map(grow);
  ctx.moveTo(g[0][0], g[0][1]); ctx.lineTo(g[1][0], g[1][1]); ctx.lineTo(g[2][0], g[2][1]);
  ctx.closePath();
  ctx.clip();
  ctx.transform(...affine(s, d));
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** Map a source rectangle onto a destination quad [tl, tr, br, bl] (bilinear mesh). */
export function drawQuad(ctx: C2D, img: Canvas, s: Box, q: [Pt, Pt, Pt, Pt], n = 8) {
  const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const at = (u: number, v: number) => lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
  const src = (u: number, v: number): Pt => [s.x + s.w * u, s.y + s.h * v];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n;
    tri(ctx, img, [src(u0, v0), src(u1, v0), src(u1, v1)], [at(u0, v0), at(u1, v0), at(u1, v1)]);
    tri(ctx, img, [src(u0, v0), src(u1, v1), src(u0, v1)], [at(u0, v0), at(u1, v1), at(u0, v1)]);
  }
}

/** Draw a source rect of `img` into an axis-aligned destination rect. */
export function blit(ctx: C2D, img: Canvas, s: Box, x: number, y: number, w: number, h: number) {
  ctx.drawImage(img, s.x, s.y, s.w, s.h, x, y, w, h);
}

// ── Fabric ───────────────────────────────────────────────────────────────────
const mirrored = new WeakMap<Canvas, Canvas>();
/** A 2×2 mirrored tile of the swatch, so repeats have no visible seam. */
function seamless(p: Canvas) {
  let m = mirrored.get(p);
  if (m) return m;
  m = mk(p.width * 2, p.height * 2);
  const c = ctx2d(m);
  const s = p.width;
  c.drawImage(p, 0, 0);
  c.save(); c.translate(s * 2, 0); c.scale(-1, 1); c.drawImage(p, 0, 0); c.restore();
  c.save(); c.translate(0, s * 2); c.scale(1, -1); c.drawImage(p, 0, 0); c.restore();
  c.save(); c.translate(s * 2, s * 2); c.scale(-1, -1); c.drawImage(p, 0, 0); c.restore();
  mirrored.set(p, m);
  return m;
}

/** A pattern of the fabric swatch at true scale (`ppc` = swatch pixels per cm). */
export function fabric(ctx: C2D, patch: Canvas, ppc: number, rot = 0): CanvasPattern {
  const pat = ctx.createPattern(seamless(patch), "repeat")!;
  pat.setTransform(new DOMMatrix().rotate(rot).scale(1 / ppc));
  return pat;
}

// ── Shading ──────────────────────────────────────────────────────────────────
type Stop = [number, string];
export function grad(ctx: C2D, x0: number, y0: number, x1: number, y1: number, stops: Stop[]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
export const CYL: Stop[] = [[0, "rgba(0,0,0,.38)"], [0.28, "rgba(255,255,255,.10)"], [0.5, "rgba(255,255,255,.06)"], [0.8, "rgba(0,0,0,.12)"], [1, "rgba(0,0,0,.42)"]];
export const FOLD_EDGE: Stop[] = [[0, "rgba(255,255,255,.22)"], [0.35, "rgba(255,255,255,.04)"], [0.8, "rgba(0,0,0,.18)"], [1, "rgba(0,0,0,.40)"]];

/** Copy of a garment cut-out with soft hanging drape (darker sides and hem). */
const draped = new WeakMap<Canvas, Canvas>();
export function drape(cut: Canvas): Canvas {
  let d = draped.get(cut);
  if (d) return d;
  d = mk(cut.width, cut.height);
  const c = ctx2d(d);
  c.drawImage(cut, 0, 0);
  c.globalCompositeOperation = "source-atop";
  c.fillStyle = grad(c, 0, 0, cut.width, 0, [[0, "rgba(0,0,0,.20)"], [0.18, "rgba(0,0,0,0)"], [0.5, "rgba(255,255,255,.05)"], [0.82, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.22)"]]);
  c.fillRect(0, 0, cut.width, cut.height);
  c.fillStyle = grad(c, 0, 0, 0, cut.height, [[0, "rgba(255,255,255,.06)"], [0.6, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.12)"]]);
  c.fillRect(0, 0, cut.width, cut.height);
  draped.set(cut, d);
  return d;
}

export function shadow(ctx: C2D, blur: number, oy = 0, a = 0.22) {
  const t = ctx.getTransform();
  ctx.shadowColor = `rgba(20,16,10,${a})`;
  ctx.shadowBlur = blur * t.a;
  ctx.shadowOffsetY = oy * t.d;
  ctx.shadowOffsetX = 0;
}
export const noShadow = (ctx: C2D) => { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };

export function poly(ctx: C2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
}

export function contactShadow(ctx: C2D, cx: number, y: number, w: number, h = 1.2) {
  const g = ctx.createRadialGradient(cx, y, 0, cx, y, w / 2);
  g.addColorStop(0, "rgba(30,22,12,.30)");
  g.addColorStop(1, "rgba(30,22,12,0)");
  ctx.save();
  ctx.translate(cx, y); ctx.scale(1, h / (w / 2)); ctx.translate(-cx, -y);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, y, w / 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const CHROME: Stop[] = [[0, "#8d939c"], [0.35, "#eef0f3"], [0.6, "#b9bec6"], [1, "#6b717a"]];
const WOOD = { top: "#d9c4a3", front: "#bfa37a", side: "#a88c63", line: "rgba(80,55,25,.25)" };

export function rail(ctx: C2D, x0: number, x1: number, y: number, r = 1.3) {
  ctx.fillStyle = grad(ctx, 0, y - r, 0, y + r, CHROME);
  ctx.beginPath(); ctx.roundRect(x0, y - r, x1 - x0, r * 2, r); ctx.fill();
  for (const x of [x0 + 1.5, x1 - 1.5]) {
    ctx.fillStyle = grad(ctx, x - 1.5, 0, x + 1.5, 0, CHROME);
    ctx.fillRect(x - 1.2, y - r * 3.2, 2.4, r * 2.6);
  }
}

/** A clothes hanger: hook top at (cx, hookY), shoulder bar at barY. */
export function hanger(ctx: C2D, cx: number, hookY: number, barY: number, halfW: number, kind: "wood" | "clear" = "wood") {
  ctx.lineCap = "round";
  ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(cx, barY - 2.2);
  ctx.lineTo(cx, hookY + 2.2);
  ctx.arc(cx - 1.6, hookY + 2.2, 1.6, 0, -Math.PI * 1.1, true);
  ctx.stroke();
  ctx.fillStyle = kind === "wood" ? "#8a5a32" : "rgba(220,226,234,.85)";
  ctx.beginPath();
  ctx.moveTo(cx - halfW, barY + 0.6);
  ctx.quadraticCurveTo(cx - halfW * 0.45, barY - 1.2, cx, barY - 2.6);
  ctx.quadraticCurveTo(cx + halfW * 0.45, barY - 1.2, cx + halfW, barY + 0.6);
  ctx.lineTo(cx + halfW - 0.4, barY + 1.6);
  ctx.quadraticCurveTo(cx, barY - 0.6, cx - halfW + 0.4, barY + 1.6);
  ctx.closePath(); ctx.fill();
}

/** Spine view of a hanger: just the hook and a thin edge. */
export function hangerEdge(ctx: C2D, cx: number, hookY: number, barY: number) {
  ctx.lineCap = "round";
  ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(cx, barY);
  ctx.lineTo(cx, hookY + 2);
  ctx.arc(cx - 1.4, hookY + 2, 1.4, 0, -Math.PI * 1.1, true);
  ctx.stroke();
  ctx.fillStyle = "#6f4726";
  ctx.beginPath(); ctx.roundRect(cx - 0.7, barY - 0.6, 1.4, 2.2, 0.5); ctx.fill();
}

/** Clip hanger for bottoms: bar + two clips. */
export function clipHanger(ctx: C2D, cx: number, hookY: number, barY: number, halfW: number) {
  ctx.lineCap = "round";
  ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 0.45;
  ctx.beginPath(); ctx.moveTo(cx, barY); ctx.lineTo(cx, hookY + 2.2); ctx.arc(cx - 1.6, hookY + 2.2, 1.6, 0, -Math.PI * 1.1, true); ctx.stroke();
  ctx.fillStyle = "#2b2f36";
  ctx.beginPath(); ctx.roundRect(cx - halfW - 1, barY - 0.7, halfW * 2 + 2, 1.4, 0.7); ctx.fill();
  for (const x of [cx - halfW + 1.5, cx + halfW - 1.5]) {
    ctx.fillStyle = "#3a3f47";
    ctx.beginPath(); ctx.roundRect(x - 1.4, barY - 0.2, 2.8, 4.2, 0.5); ctx.fill();
    ctx.fillStyle = "#c0c5cc"; ctx.fillRect(x - 1, barY + 2.6, 2, 0.5);
  }
}

/** A shelf whose front edge is at `y`; depth recedes up-right. */
export function shelf(ctx: C2D, x: number, y: number, w: number, depth: number, thick = 2.4, look = WOOD) {
  const [dx, dy] = dep(depth);
  poly(ctx, [[x, y], [x + w, y], [x + w + dx, y + dy], [x + dx, y + dy]]);
  ctx.fillStyle = look.top; ctx.fill();
  ctx.fillStyle = grad(ctx, 0, y + dy, 0, y, [[0, "rgba(0,0,0,.10)"], [1, "rgba(255,255,255,.08)"]]); ctx.fill();
  poly(ctx, [[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + dy + thick], [x + w, y + thick]]);
  ctx.fillStyle = look.side; ctx.fill();
  ctx.fillStyle = grad(ctx, 0, y, 0, y + thick, [[0, look.front], [1, look.side]]);
  ctx.fillRect(x, y, w, thick);
  ctx.strokeStyle = look.line; ctx.lineWidth = 0.12; ctx.strokeRect(x, y, w, thick);
}

export function wallPanel(ctx: C2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = grad(ctx, 0, y, 0, y + h, [[0, "#efebe4"], [1, "#e4dfd6"]]);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(0,0,0,.05)"; ctx.lineWidth = 0.15;
  for (let gy = y + 7.6; gy < y + h; gy += 7.6) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
}

export function tableTop(ctx: C2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = grad(ctx, x, y, x + w, y + h, [[0, "#e7d6bb"], [1, "#d6c09d"]]);
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 1.5); ctx.fill();
  ctx.strokeStyle = "rgba(90,60,25,.10)"; ctx.lineWidth = 0.12;
  for (let gy = y + 3; gy < y + h; gy += 4.5) { ctx.beginPath(); ctx.moveTo(x + 1, gy); ctx.bezierCurveTo(x + w * 0.3, gy + 0.6, x + w * 0.7, gy - 0.6, x + w - 1, gy); ctx.stroke(); }
}

/** Faceout / waterfall arm from a wall standard. */
export function arm(ctx: C2D, x0: number, y0: number, x1: number, y1: number, knobs = 0) {
  ctx.strokeStyle = grad(ctx, x0, y0 - 1, x0, y0 + 1, CHROME); ctx.lineWidth = 1.1; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.fillStyle = "#7c828b"; ctx.fillRect(x0 - 1.5, y0 - 4, 2.2, 8);
  for (let k = 1; k <= knobs; k++) {
    const t = k / (knobs + 0.6);
    ctx.fillStyle = "#c9cdd3";
    ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - 0.9, 0.7, 0, Math.PI * 2); ctx.fill();
  }
}

export function pegHook(ctx: C2D, x: number, y: number, len = 12) {
  ctx.fillStyle = "#d8d3ca"; ctx.fillRect(x - 3, y - 3, 6, 6);
  ctx.fillStyle = "rgba(0,0,0,.25)";
  for (const [a, b] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { ctx.beginPath(); ctx.arc(x + a, y + b, 0.35, 0, 7); ctx.fill(); }
  ctx.strokeStyle = grad(ctx, 0, y - 1, 0, y + 1, CHROME); ctx.lineWidth = 0.7; ctx.lineCap = "round";
  const [dx, dy] = dep(len);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * 0.35, y + dy * 0.35 + 1.5); ctx.stroke();
}

/** Dress form / bust. `full` adds a pole and base down to `floorY`. */
export function dressForm(ctx: C2D, cx: number, neckY: number, shoulderW: number, torsoH: number, floorY: number | null) {
  const hw = shoulderW / 2;
  if (floorY !== null) {
    ctx.fillStyle = grad(ctx, cx - 1, 0, cx + 1, 0, CHROME);
    ctx.fillRect(cx - 0.9, neckY + torsoH, 1.8, floorY - neckY - torsoH - 1);
    ctx.fillStyle = "#3b3f46";
    ctx.beginPath(); ctx.ellipse(cx, floorY - 0.6, 16, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "#e9e3d8";
  ctx.beginPath();
  ctx.moveTo(cx - 3, neckY - 4);
  ctx.lineTo(cx - 3.4, neckY);
  ctx.quadraticCurveTo(cx - hw, neckY + 1, cx - hw * 0.98, neckY + torsoH * 0.18);
  ctx.quadraticCurveTo(cx - hw * 0.78, neckY + torsoH * 0.55, cx - hw * 0.72, neckY + torsoH * 0.7);
  ctx.quadraticCurveTo(cx - hw * 0.9, neckY + torsoH * 0.92, cx - hw * 0.86, neckY + torsoH);
  ctx.lineTo(cx + hw * 0.86, neckY + torsoH);
  ctx.quadraticCurveTo(cx + hw * 0.9, neckY + torsoH * 0.92, cx + hw * 0.72, neckY + torsoH * 0.7);
  ctx.quadraticCurveTo(cx + hw * 0.78, neckY + torsoH * 0.55, cx + hw * 0.98, neckY + torsoH * 0.18);
  ctx.quadraticCurveTo(cx + hw, neckY + 1, cx + 3.4, neckY);
  ctx.lineTo(cx + 3, neckY - 4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = grad(ctx, cx - hw, 0, cx + hw, 0, CYL.map(([o, c]) => [o, c.replace(/\.\d+\)/, (m) => `${(parseFloat(m.slice(0, -1)) * 0.6).toFixed(2)})`)] as Stop));
  ctx.fill();
  ctx.fillStyle = "#5b4b3a";
  ctx.beginPath(); ctx.ellipse(cx, neckY - 4, 3, 0.9, 0, 0, Math.PI * 2); ctx.fill();
}

export function headForm(ctx: C2D, cx: number, topY: number, w: number) {
  const h = w * 1.25;
  ctx.fillStyle = "#e8e2d6";
  ctx.beginPath(); ctx.ellipse(cx, topY + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(cx - w * 0.2, topY + h * 0.8, w * 0.4, h * 0.45);
  ctx.fillStyle = grad(ctx, cx - w / 2, 0, cx + w / 2, 0, [[0, "rgba(0,0,0,.18)"], [0.4, "rgba(255,255,255,.08)"], [1, "rgba(0,0,0,.22)"]]);
  ctx.beginPath(); ctx.ellipse(cx, topY + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3b3f46"; ctx.fillRect(cx - w * 0.35, topY + h * 1.25, w * 0.7, 1.5);
  return topY + h * 1.25 + 1.5;
}

export function box3d(ctx: C2D, x: number, y: number, w: number, h: number, d: number, faces: { front: string; top: string; side: string }) {
  const [dx, dy] = dep(d);
  poly(ctx, [[x, y - h], [x + w, y - h], [x + w + dx, y - h + dy], [x + dx, y - h + dy]]); ctx.fillStyle = faces.top; ctx.fill();
  poly(ctx, [[x + w, y - h], [x + w + dx, y - h + dy], [x + w + dx, y + dy], [x + w, y]]); ctx.fillStyle = faces.side; ctx.fill();
  ctx.fillStyle = faces.front; ctx.fillRect(x, y - h, w, h);
}

export function riser(ctx: C2D, x: number, y: number, w: number, h: number, d: number) {
  box3d(ctx, x, y, w, h, d, { front: "rgba(225,235,245,.55)", top: "rgba(240,246,252,.75)", side: "rgba(200,212,226,.6)" });
  ctx.strokeStyle = "rgba(150,170,190,.6)"; ctx.lineWidth = 0.12; ctx.strokeRect(x, y - h, w, h);
}

export function label(ctx: C2D, text: string, x: number, y: number, size = 1.6, color = "#6b7280") {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px Inter, -apple-system, Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

// Product image pipeline: load → cut out → trim → analyse.
// Everything here runs in the browser on a plain 2D canvas; no model, no server.

export type Canvas = HTMLCanvasElement;
export type RGB = [number, number, number];

export interface Box { x: number; y: number; w: number; h: number }

export interface Analysis {
  /** Per-row [left, right] of the opaque silhouette (−1 when the row is empty). */
  rows: Int32Array[];
  cx: number;            // horizontal centre of mass (px)
  neckX: number;         // centre of the top of the silhouette: the hang point
  shoulderY: number;     // first row that reaches shoulder width
  waistY: number;        // ~waistband for bottoms, ~waist for tops
  legSplitY: number | null; // crotch, if the lower body splits into two legs
  torso: [number, number];  // x-range of the body (sleeves excluded) at mid height
  color: RGB;            // dominant fabric colour
  patch: Canvas;         // a representative fabric swatch (used for unseen surfaces)
  printBox: Box | null;  // densest-detail window on the chest (graphic / embroidery)
  aspect: number;        // h / w
}

export interface Cutout { cut: Canvas; mask: Uint8Array; warning: string | null }

export const mk = (w: number, h: number): Canvas => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};
export const ctx2d = (c: Canvas) => c.getContext("2d", { willReadFrequently: true })!;

export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not read that image"));
    img.src = typeof src === "string" ? src : URL.createObjectURL(src);
  });
}

/** Draw an image into a canvas no larger than `max` on its long side. */
export function toCanvas(img: CanvasImageSource & { width: number; height: number }, max = 1100): Canvas {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = mk(img.width * s, img.height * s);
  ctx2d(c).drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const dist = (d: Uint8ClampedArray, i: number, c: RGB) =>
  Math.sqrt((d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2);

/**
 * Background removal for catalogue shots: estimate the backdrop colour from the
 * border, flood-fill everything connected to the border that is close to it,
 * keep the large components, feather the edge. Transparent PNGs pass through.
 */
export function cutout(src: Canvas, tolerance = 30): Cutout {
  const w = src.width, h = src.height;
  const data = ctx2d(src).getImageData(0, 0, w, h);
  const d = data.data;
  const n = w * h;
  const bg = new Uint8Array(n); // 1 = background
  let warning: string | null = null;

  let transparent = 0;
  for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 20) transparent++;

  if (transparent > n * 0.05) {
    for (let i = 0; i < n; i++) bg[i] = d[i * 4 + 3] < 20 ? 1 : 0;
  } else {
    // Backdrop colour = median of the border ring.
    const ring: number[][] = [[], [], []];
    const push = (x: number, y: number) => { const i = (y * w + x) * 4; ring[0].push(d[i]); ring[1].push(d[i + 1]); ring[2].push(d[i + 2]); };
    for (let x = 0; x < w; x += 2) { push(x, 0); push(x, 1); push(x, h - 1); push(x, h - 2); }
    for (let y = 0; y < h; y += 2) { push(0, y); push(1, y); push(w - 1, y); push(w - 2, y); }
    const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
    const bgc: RGB = [med(ring[0]), med(ring[1]), med(ring[2])];
    let spread = 0;
    for (let k = 0; k < ring[0].length; k++) spread += Math.abs(ring[0][k] - bgc[0]) + Math.abs(ring[1][k] - bgc[1]) + Math.abs(ring[2][k] - bgc[2]);
    if (spread / ring[0].length > 40) warning = "Busy background. Try AI cutout or raise the tolerance.";

    const stack = new Int32Array(n);
    let sp = 0;
    const seed = (x: number, y: number) => { const p = y * w + x; if (!bg[p] && dist(d, p * 4, bgc) < tolerance) { bg[p] = 1; stack[sp++] = p; } };
    for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
    for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p / w) | 0;
      if (x > 0) seed(x - 1, y);
      if (x < w - 1) seed(x + 1, y);
      if (y > 0) seed(x, y - 1);
      if (y < h - 1) seed(x, y + 1);
    }
    // Enclosed background (inside a bag handle, between straps): large, uniform,
    // backdrop-coloured holes. Small ones are kept, so white prints survive.
    const hole = new Uint8Array(n);
    const hq = new Int32Array(n);
    let objectArea = 0;
    for (let p = 0; p < n; p++) if (!bg[p]) objectArea++;
    for (let p = 0; p < n; p++) {
      if (bg[p] || hole[p] || dist(d, p * 4, bgc) >= tolerance * 0.7) continue;
      let qh = 0, qt = 0;
      hq[qt++] = p; hole[p] = 1;
      while (qh < qt) {
        const c = hq[qh++];
        const x = c % w, y = (c / w) | 0;
        const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1];
        for (const m of nb) if (m >= 0 && !bg[m] && !hole[m] && dist(d, m * 4, bgc) < tolerance * 0.7) { hole[m] = 1; hq[qt++] = m; }
      }
      if (qt >= objectArea * 0.005) for (let k = 0; k < qt; k++) bg[hq[k]] = 1;
    }
    // Feather: pixels next to the background get partial alpha by colour distance.
    for (let p = 0; p < n; p++) {
      if (bg[p]) continue;
      const x = p % w, y = (p / w) | 0;
      const edge = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (y > 0 && bg[p - w]) || (y < h - 1 && bg[p + w]);
      if (edge) {
        const a = Math.min(1, Math.max(0.15, (dist(d, p * 4, bgc) - tolerance * 0.5) / (tolerance * 1.5)));
        d[p * 4 + 3] = Math.round(d[p * 4 + 3] * a);
      }
    }
  }

  // Keep components ≥ 1% of the largest (drops dust, keeps a separate dupatta / pair).
  const label = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const q = new Int32Array(n);
  for (let p = 0; p < n; p++) {
    if (bg[p] || label[p] >= 0) continue;
    const id = sizes.length;
    let qh = 0, qt = 0, size = 0;
    q[qt++] = p; label[p] = id;
    while (qh < qt) {
      const c = q[qh++]; size++;
      const x = c % w, y = (c / w) | 0;
      const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1];
      for (const m of nb) if (m >= 0 && !bg[m] && label[m] < 0) { label[m] = id; q[qt++] = m; }
    }
    sizes.push(size);
  }
  const biggest = Math.max(1, ...sizes);
  const mask = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const keep = !bg[p] && sizes[label[p]] >= biggest * 0.01;
    mask[p] = keep ? 1 : 0;
    if (!keep) d[p * 4 + 3] = 0;
  }
  if (!sizes.length) warning = "Nothing found. The photo looks like plain background.";

  const out = mk(w, h);
  ctx2d(out).putImageData(data, 0, 0);
  return trim(out, mask, warning);
}

/** Crop to the opaque bounding box (+ small margin). */
function trim(c: Canvas, mask: Uint8Array, warning: string | null): Cutout {
  const w = c.width, h = c.height;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { cut: c, mask, warning };
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const t = mk(tw, th);
  ctx2d(t).drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
  const m = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) m[y * tw + x] = mask[(y + y0) * w + x + x0];
  return { cut: t, mask: m, warning };
}

/** Rebuild the mask from an already-cut canvas (e.g. an AI cutout result). */
export function fromTransparent(c: Canvas): Cutout {
  return cutout(c, 30);
}

function runAt(row: Int8Array | Uint8Array, w: number, x: number): [number, number] | null {
  if (!row[x]) {
    // nearest opaque pixel to x
    let l = x, r = x;
    while (l >= 0 && !row[l]) l--;
    while (r < w && !row[r]) r++;
    if (l < 0 && r >= w) return null;
    x = l < 0 ? r : r >= w ? l : x - l <= r - x ? l : r;
  }
  let a = x, b = x;
  while (a > 0 && row[a - 1]) a--;
  while (b < w - 1 && row[b + 1]) b++;
  return [a, b];
}

export function analyse(c: Canvas, mask: Uint8Array): Analysis {
  const w = c.width, h = c.height;
  const px = ctx2d(c).getImageData(0, 0, w, h).data;
  const rows: Int32Array[] = [];
  let sx = 0, cnt = 0;
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (l < 0) l = x; r = x; sx += x; cnt++; }
    rows.push(Int32Array.of(l, r));
  }
  const cx = cnt ? sx / cnt : w / 2;
  let nx = 0, nn = 0;
  for (let y = 0; y < h * 0.04; y++) if (rows[y][0] >= 0) { nx += (rows[y][0] + rows[y][1]) / 2; nn++; }
  const neckX = nn ? nx / nn : cx;
  const width = (y: number) => (rows[y][0] < 0 ? 0 : rows[y][1] - rows[y][0] + 1);

  // Shoulders: first row reaching 60% of the widest row in the top 40%.
  let topMax = 0;
  for (let y = 0; y < h * 0.4; y++) topMax = Math.max(topMax, width(y));
  let shoulderY = 0;
  for (let y = 0; y < h; y++) if (width(y) >= topMax * 0.6) { shoulderY = y; break; }

  // Legs: walking up from the hem, the centre column is empty with fabric on both sides.
  const cxi = Math.round(cx);
  let legSplitY: number | null = null;
  const rowMask = (y: number) => mask.subarray(y * w, y * w + w);
  if (!mask[(h - 3) * w + cxi]) {
    let y = h - 3;
    while (y > h * 0.25 && !mask[y * w + cxi] && rows[y][0] < cxi && rows[y][1] > cxi) y--;
    if (y < h * 0.8 && y > h * 0.25) legSplitY = y;
  }

  // Torso: the run containing the centre at ~55% height (detached sleeves fall away).
  const ty = Math.round(h * (legSplitY ? Math.min(0.3, legSplitY / h * 0.5) : 0.55));
  const run = runAt(rowMask(ty), w, cxi) ?? [0, w - 1];
  const torso: [number, number] = [run[0], run[1]];
  const waistY = legSplitY ? Math.round(h * 0.06) : Math.round(h * 0.6);

  // Dominant colour: mean of opaque torso pixels after dropping the extremes.
  const samples: number[][] = [];
  for (let y = Math.round(h * 0.2); y < h * 0.9; y += 3) for (let x = torso[0]; x <= torso[1]; x += 3) {
    const i = (y * w + x) * 4;
    if (px[i + 3] > 200) samples.push([px[i], px[i + 1], px[i + 2], px[i] + px[i + 1] + px[i + 2]]);
  }
  samples.sort((a, b) => a[3] - b[3]);
  const mid = samples.slice(Math.floor(samples.length * 0.2), Math.ceil(samples.length * 0.8));
  const color: RGB = mid.length
    ? [0, 1, 2].map((k) => Math.round(mid.reduce((s, v) => s + v[k], 0) / mid.length)) as RGB
    : [150, 150, 150];

  // Fabric swatch: the fully-opaque square whose mean colour is closest to the dominant colour.
  const side = Math.max(12, Math.round(Math.min(torso[1] - torso[0], h) * 0.22));
  let best = Infinity, bx = torso[0], by = Math.round(h * 0.5);
  const yA = Math.round(h * (legSplitY ? 0.1 : 0.35)), yB = Math.round(h * 0.92) - side;
  for (let y = yA; y <= yB; y += Math.max(4, side >> 2)) for (let x = torso[0]; x <= torso[1] - side; x += Math.max(4, side >> 2)) {
    let r = 0, g = 0, b = 0, k = 0, holes = 0, sq = 0;
    for (let yy = y; yy < y + side; yy += 4) for (let xx = x; xx < x + side; xx += 4) {
      const i = (yy * w + xx) * 4;
      if (px[i + 3] < 250) holes++;
      r += px[i]; g += px[i + 1]; b += px[i + 2]; k++;
      sq += px[i] * px[i] + px[i + 1] * px[i + 1] + px[i + 2] * px[i + 2];
    }
    if (holes) continue;
    const mean2 = ((r / k) ** 2 + (g / k) ** 2 + (b / k) ** 2);
    const std = Math.sqrt(Math.max(0, sq / k - mean2) / 3);
    // closest to the dominant colour, and not straddling a logo or seam
    const s = Math.abs(r / k - color[0]) + Math.abs(g / k - color[1]) + Math.abs(b / k - color[2]) + std * 0.8;
    if (s < best) { best = s; bx = x; by = y; }
  }
  const patch = mk(side, side);
  ctx2d(patch).drawImage(c, bx, by, side, side, 0, 0, side, side);

  // Print / embroidery: detail energy in a chest-sized window, top 60% of the torso.
  let printBox: Box | null = null;
  if (!legSplitY || legSplitY > h * 0.5) {
    const win = Math.round((torso[1] - torso[0]) * 0.55);
    const y0 = shoulderY, y1 = Math.round(Math.min(h * 0.6, shoulderY + (torso[1] - torso[0]) * 1.1));
    const energyAt = (x: number, y: number) => {
      const i = (y * w + x) * 4, j = i + 8, k = i + w * 8;
      if (px[i + 3] < 200 || px[j + 3] < 200 || px[k + 3] < 200) return 0;
      return Math.abs(px[i] - px[j]) + Math.abs(px[i + 1] - px[j + 1]) + Math.abs(px[i] - px[k]) + Math.abs(px[i + 2] - px[k + 2]);
    };
    let top = 0, total = 0, n = 0, pxx = 0, pyy = 0;
    const step = Math.max(6, win >> 3);
    for (let y = y0; y + win < y1 + win * 0.5 && y + win < h - 2; y += step) for (let x = torso[0]; x + win <= torso[1]; x += step) {
      let e = 0;
      for (let yy = y; yy < y + win; yy += 5) for (let xx = x; xx < x + win; xx += 5) e += energyAt(xx, yy);
      total += e; n++;
      if (e > top) { top = e; pxx = x; pyy = y; }
    }
    if (n > 2 && top > (total / n) * 1.35) printBox = { x: pxx, y: pyy, w: win, h: win };
  }

  return { rows, cx, neckX, shoulderY, waistY, legSplitY, torso, color, patch, printBox, aspect: h / w };
}

export const rgb = (c: RGB, k = 1) => `rgb(${c.map((v) => Math.round(Math.min(255, v * k))).join(",")})`;

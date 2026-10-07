import { analyse, cutout, loadImage, toCanvas, mk, ctx2d, rgb, type Canvas } from "./image.ts";
import {
  CATEGORIES, CAT, DISPLAYS, PROV_LABEL, displaysFor, guessCategory, ppcOf,
  type CatId, type Product, type Scene, type Opts, type DisplayDef,
} from "./displays.ts";
import { SAMPLES } from "./samples.ts";

interface Item extends Product { src: Canvas; tol: number; thumb: string; guessed: CatId }

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const qs = new URLSearchParams(location.search);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const state = {
  items: [] as Item[],
  cur: null as Item | null,
  display: qs.get("d") || "",
  count: Number(qs.get("n")) || 4,
  mode: (qs.get("view") === "all" ? "all" : "one") as "one" | "all",
};

// ── Products ─────────────────────────────────────────────────────────────────
let seq = 0;
function makeItem(name: string, src: Canvas, cat?: CatId): Item {
  const tol = 30;
  const { cut, mask, warning } = cutout(src, tol);
  const an = analyse(cut, mask);
  const guessed = guessCategory(name, an, cut.width);
  const c = cat ?? guessed;
  const thumb = mk(120, 120);
  const t = ctx2d(thumb), s = Math.min(110 / cut.width, 110 / cut.height);
  t.drawImage(cut, (120 - cut.width * s) / 2, (120 - cut.height * s) / 2, cut.width * s, cut.height * s);
  return { id: `p${++seq}`, name, src, cut, an, cat: c, guessed, sizeCm: CAT[c].size, back: null, warning, tol, thumb: thumb.toDataURL() };
}

function recut(it: Item, tol: number) {
  it.tol = tol;
  const { cut, mask, warning } = cutout(it.src, tol);
  it.cut = cut; it.an = analyse(cut, mask); it.warning = warning;
}

async function addFiles(files: FileList | File[]) {
  for (const f of Array.from(files)) {
    if (!f.type.startsWith("image/")) continue;
    setStatus(`Cutting out ${f.name}…`);
    try {
      const img = await loadImage(f);
      const it = makeItem(f.name.replace(/\.[^.]+$/, ""), toCanvas(img));
      state.items.unshift(it);
      select(it);
    } catch (e) { setStatus(String((e as Error).message)); }
  }
  setStatus("");
}

async function addSample(i: number) {
  const s = SAMPLES[i];
  const existing = state.items.find((it) => it.name === s.name);
  if (existing) return select(existing);
  setStatus(`Loading ${s.name}…`);
  const src = await s.load();
  const it = makeItem(s.name, src, s.cat);
  state.items.push(it);
  select(it);
  setStatus("");
}

function select(it: Item) {
  state.cur = it;
  const ids = CAT[it.cat].displays;
  if (!ids.includes(state.display)) state.display = ids[0];
  renderAll();
}

// ── Rendering ────────────────────────────────────────────────────────────────
const opts = (): Opts => ({ count: state.count });

function buildScene(p: Product, d: DisplayDef): Scene {
  return d.build(p, opts());
}

/** Paint a scene into a canvas of css size (w, h), fitted with padding. */
function paint(canvas: Canvas, cssW: number, cssH: number, scene: Scene, pad = 24, bottom = 0, scaleBar = true) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const availW = cssW - pad * 2, availH = cssH - pad * 2 - bottom;
  const s = Math.min(availW / scene.w, availH / scene.h);
  const ox = (cssW - scene.w * s) / 2, oy = pad + (availH - scene.h * s) / 2;
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(s, s);
  ctx.imageSmoothingQuality = "high";
  scene.paint(ctx);
  ctx.restore();
  if (scaleBar && !scene.persp) {
    // 10 cm scale bar (only for true-scale elevations, not perspective renders)
    const len = 10 * s, x = ox, y = oy + scene.h * s + 14;
    ctx.strokeStyle = "#9a948a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.moveTo(x + len, y - 4); ctx.lineTo(x + len, y + 4); ctx.stroke();
    ctx.fillStyle = "#7c766c"; ctx.font = "600 11px Inter, -apple-system, Helvetica, Arial"; ctx.fillText("10 cm", x + len + 6, y + 4);
  }
  return s;
}

function renderStage() {
  const it = state.cur;
  const stage = $("#stage"), grid = $("#grid");
  stage.hidden = state.mode !== "one"; grid.hidden = state.mode !== "all";
  $("#empty").hidden = !!it;
  if (!it) { $("#hud").hidden = true; return; }
  $("#hud").hidden = state.mode !== "one";
  if (state.mode === "one") {
    const d = DISPLAYS[state.display];
    const scene = buildScene(it, d);
    const box = $("main").getBoundingClientRect();
    paint($("#cv") as Canvas, box.width, box.height, scene, 36, 70);
    $("#hud-title").textContent = d.label;
    $("#hud-dims").textContent = scene.dims;
    const b = $("#hud-prov");
    b.className = `prov ${scene.prov}`; b.textContent = PROV_LABEL[scene.prov];
    $("#hud-note").textContent = scene.note;
  } else {
    grid.innerHTML = "";
    for (const d of displaysFor(it.cat)) {
      const scene = buildScene(it, d);
      const card = document.createElement("button");
      card.className = "card" + (d.id === state.display ? " on" : "");
      const cv = document.createElement("canvas");
      card.appendChild(cv);
      card.insertAdjacentHTML("beforeend", `<div class="cmeta"><b>${esc(d.label)}</b><span class="prov ${scene.prov}">${PROV_LABEL[scene.prov]}</span></div><small>${esc(scene.dims)}</small>`);
      card.onclick = () => { state.display = d.id; state.mode = "one"; renderAll(); };
      grid.appendChild(card);
      paint(cv, 300, 240, scene, 12, 0, false);
    }
  }
}

function renderList() {
  const list = $("#items");
  list.innerHTML = state.items.map((it) =>
    `<button class="pitem${it === state.cur ? " on" : ""}" data-id="${it.id}"><img src="${it.thumb}" alt=""><span>${esc(it.name)}<em>${esc(CAT[it.cat].label)}</em></span></button>`).join("")
    || `<p class="muted">Nothing yet. Drop photos above or pick a sample.</p>`;
  list.querySelectorAll<HTMLButtonElement>(".pitem").forEach((b) => (b.onclick = () => select(state.items.find((i) => i.id === b.dataset.id)!)));
}

function renderPanel() {
  const it = state.cur;
  $("#panel").hidden = !it;
  if (!it) return;
  $("#pname").textContent = it.name;
  $("#pvert").textContent = CAT[it.cat].vertical;

  // categories, grouped by vertical
  const byV = new Map<string, typeof CATEGORIES>();
  for (const c of CATEGORIES) { if (!byV.has(c.vertical)) byV.set(c.vertical, []); byV.get(c.vertical)!.push(c); }
  const sel = $("#cat") as HTMLSelectElement;
  sel.innerHTML = [...byV].map(([v, cs]) => `<optgroup label="${esc(v)}">${cs.map((c) => `<option value="${c.id}"${c.id === it.cat ? " selected" : ""}>${esc(c.label)}${c.id === it.guessed ? " · detected" : ""}</option>`).join("")}</optgroup>`).join("");

  const c = CAT[it.cat];
  ($("#size") as HTMLInputElement).value = String(it.sizeCm);
  $("#size-label").textContent = c.axis === "h" ? "Photo height = real" : "Photo width = real";

  // display buttons
  const groups = new Map<string, DisplayDef[]>();
  for (const d of displaysFor(it.cat)) { if (!groups.has(d.group)) groups.set(d.group, []); groups.get(d.group)!.push(d); }
  $("#displays").innerHTML = [...groups].map(([g, ds]) => `<h4>${g}</h4><div class="dgrid">${ds.map((d) => {
    const prov = d.build(it, opts()).prov;
    return `<button class="dbtn${d.id === state.display && state.mode === "one" ? " on" : ""}" data-d="${d.id}"><i class="dot ${prov}"></i>${esc(d.label)}</button>`;
  }).join("")}</div>`).join("");
  $("#displays").querySelectorAll<HTMLButtonElement>(".dbtn").forEach((b) => (b.onclick = () => { state.display = b.dataset.d!; state.mode = "one"; renderAll(); }));

  ($("#count") as HTMLInputElement).value = String(state.count);
  ($("#tol") as HTMLInputElement).value = String(it.tol);
  $("#tolv").textContent = String(it.tol);
  $("#warn").textContent = it.warning ?? "";
  $("#warn").hidden = !it.warning;
  $("#back-state").textContent = it.back ? "Back photo added ✓" : "None";
  $("#back-clear").hidden = !it.back;

  // what the analysis found
  const a = mk(160, 160), x = ctx2d(a);
  const s = Math.min(150 / it.cut.width, 150 / it.cut.height);
  const ox = (160 - it.cut.width * s) / 2, oy = (160 - it.cut.height * s) / 2;
  x.fillStyle = "#f1efeb"; x.fillRect(0, 0, 160, 160);
  x.drawImage(it.cut, ox, oy, it.cut.width * s, it.cut.height * s);
  x.lineWidth = 1.5;
  if (it.an.printBox) { const b = it.an.printBox; x.strokeStyle = "#e8622c"; x.strokeRect(ox + b.x * s, oy + b.y * s, b.w * s, b.h * s); }
  x.strokeStyle = "#2563eb"; x.setLineDash([3, 2]);
  x.beginPath(); x.moveTo(ox + it.an.torso[0] * s, oy + it.an.shoulderY * s); x.lineTo(ox + it.an.torso[1] * s, oy + it.an.shoulderY * s); x.stroke();
  if (it.an.legSplitY) { x.strokeStyle = "#16a34a"; x.beginPath(); x.moveTo(ox, oy + it.an.legSplitY * s); x.lineTo(160 - ox, oy + it.an.legSplitY * s); x.stroke(); }
  ($("#ana") as HTMLImageElement).src = a.toDataURL();
  ($("#swatch") as HTMLImageElement).src = it.an.patch.toDataURL();
  $("#color").style.background = rgb(it.an.color);
  const ppc = ppcOf(it);
  $("#facts").innerHTML = [
    `Real size: ${(it.cut.width / ppc).toFixed(0)} × ${(it.cut.height / ppc).toFixed(0)} cm`,
    it.an.printBox ? `<span style="color:#e8622c">■</span> Print / detail found` : "No distinct print",
    it.an.legSplitY ? `<span style="color:#16a34a">—</span> Legs split detected` : "",
    `<span style="color:#2563eb">┄</span> Shoulder / torso line`,
  ].filter(Boolean).map((s) => `<li>${s}</li>`).join("");
}

function renderAll() {
  renderList(); renderPanel(); renderStage();
  $("#mode-one").classList.toggle("on", state.mode === "one");
  $("#mode-all").classList.toggle("on", state.mode === "all");
  const u = new URLSearchParams();
  if (state.display) u.set("d", state.display);
  if (state.mode === "all") u.set("view", "all");
  u.set("n", String(state.count));
  history.replaceState(null, "", "?" + u.toString());
}

function setStatus(s: string) { $("#status").textContent = s; $("#status").hidden = !s; }

// ── AI cut-out (optional, loads a model from a CDN on first use) ─────────────
async function aiCutout(it: Item) {
  setStatus("Loading AI cut-out model (first time ~40 MB)…");
  try {
    const load = new Function("u", "return import(u)") as (u: string) => Promise<any>;
    const mod = await load("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm");
    const blob: Blob = await new Promise((r) => it.src.toBlob((b) => r(b!), "image/png"));
    setStatus("Cutting out with AI…");
    const out: Blob = await mod.removeBackground(blob);
    const img = await loadImage(out);
    const c = toCanvas(img, 1600);
    it.src = c;
    recut(it, it.tol);
    setStatus("");
    renderAll();
  } catch (e) {
    console.error(e);
    setStatus("AI cut-out failed to load here. The built-in cut-out is still in use.");
    setTimeout(() => setStatus(""), 4000);
  }
}

// ── Wiring ───────────────────────────────────────────────────────────────────
function wire() {
  $("#samples").innerHTML = SAMPLES.map((s, i) => `<button class="chip" data-i="${i}">${esc(s.name)}</button>`).join("");
  $("#samples").querySelectorAll<HTMLButtonElement>(".chip").forEach((b) => (b.onclick = () => addSample(Number(b.dataset.i))));

  const drop = $("#drop"), file = $("#file") as HTMLInputElement;
  drop.onclick = () => file.click();
  file.onchange = () => { if (file.files) addFiles(file.files); file.value = ""; };
  for (const el of [drop, document.body]) {
    el.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    el.addEventListener("dragleave", () => drop.classList.remove("over"));
    el.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if ((e as DragEvent).dataTransfer?.files) addFiles((e as DragEvent).dataTransfer!.files); });
  }
  window.addEventListener("paste", (e) => { const f = [...(e.clipboardData?.files ?? [])]; if (f.length) addFiles(f); });

  ($("#cat") as HTMLSelectElement).onchange = (e) => {
    const it = state.cur!; it.cat = (e.target as HTMLSelectElement).value as CatId; it.sizeCm = CAT[it.cat].size;
    if (!CAT[it.cat].displays.includes(state.display)) state.display = CAT[it.cat].displays[0];
    renderAll();
  };
  ($("#size") as HTMLInputElement).oninput = (e) => { const v = Number((e.target as HTMLInputElement).value); if (v > 1) { state.cur!.sizeCm = v; renderStage(); renderPanel(); } };
  const setCount = (n: number) => { state.count = Math.max(1, Math.min(12, n)); renderAll(); };
  ($("#count") as HTMLInputElement).onchange = (e) => setCount(Number((e.target as HTMLInputElement).value));
  $("#cminus").onclick = () => setCount(state.count - 1);
  $("#cplus").onclick = () => setCount(state.count + 1);
  ($("#tol") as HTMLInputElement).onchange = (e) => { recut(state.cur!, Number((e.target as HTMLInputElement).value)); renderAll(); };
  ($("#tol") as HTMLInputElement).oninput = (e) => { $("#tolv").textContent = (e.target as HTMLInputElement).value; };
  $("#ai").onclick = () => state.cur && aiCutout(state.cur);

  const backFile = $("#back-file") as HTMLInputElement;
  $("#back-add").onclick = () => backFile.click();
  backFile.onchange = async () => {
    const f = backFile.files?.[0]; backFile.value = "";
    if (!f || !state.cur) return;
    const c = toCanvas(await loadImage(f));
    const { cut, mask } = cutout(c, state.cur.tol);
    state.cur.back = { cut, an: analyse(cut, mask) };
    renderAll();
  };
  $("#back-clear").onclick = () => { if (state.cur) { state.cur.back = null; renderAll(); } };
  $("#remove").onclick = () => {
    const it = state.cur; if (!it) return;
    state.items = state.items.filter((i) => i !== it);
    state.cur = state.items[0] ?? null;
    if (state.cur) select(state.cur); else renderAll();
  };

  $("#mode-one").onclick = () => { state.mode = "one"; renderAll(); };
  $("#mode-all").onclick = () => { state.mode = "all"; renderAll(); };
  $("#export").onclick = () => {
    const it = state.cur; if (!it) return;
    const d = DISPLAYS[state.display], scene = buildScene(it, d);
    const c = mk(10, 10);
    const s = 1400 / Math.max(scene.w, scene.h);
    c.width = Math.round(scene.w * s + 80); c.height = Math.round(scene.h * s + 80);
    const x = ctx2d(c); x.fillStyle = "#f4f3f0"; x.fillRect(0, 0, c.width, c.height);
    x.translate(40, 40); x.scale(s, s); scene.paint(x);
    const a = document.createElement("a");
    a.download = `${it.name}-${d.id}.png`.replace(/\s+/g, "_"); a.href = c.toDataURL("image/png"); a.click();
  };

  window.addEventListener("keydown", (e) => {
    if (!state.cur || (e.target as HTMLElement).matches("input, select")) return;
    const ids = CAT[state.cur.cat].displays;
    const i = ids.indexOf(state.display);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { state.display = ids[(i + 1) % ids.length]; state.mode = "one"; renderAll(); e.preventDefault(); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { state.display = ids[(i - 1 + ids.length) % ids.length]; state.mode = "one"; renderAll(); e.preventDefault(); }
    if (e.key.toLowerCase() === "a") { state.mode = state.mode === "all" ? "one" : "all"; renderAll(); }
  });
  let raf = 0;
  window.addEventListener("resize", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderStage); });
}

wire();
renderAll();
const start = qs.get("s");
addSample(start !== null ? Math.max(0, Math.min(SAMPLES.length - 1, Number(start))) : 0);

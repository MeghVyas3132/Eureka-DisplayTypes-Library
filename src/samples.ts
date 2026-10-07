// Built-in sample products. Real catalogue photos where we have them (kurtas,
// Nayasa hardgoods); everything else is drawn here as a studio shot on white,
// so it goes through exactly the same cut-out + analysis path as an upload.
import { mk, ctx2d, type Canvas } from "./image.ts";
import type { CatId } from "./displays.ts";

export interface Sample { name: string; cat: CatId; load: () => Promise<Canvas> | Canvas; url?: string }

function noise(c: Canvas, amt: number, seed = 1) {
  const x = ctx2d(c);
  const d = x.getImageData(0, 0, c.width, c.height);
  let s = seed;
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3] === 0 || (d.data[i] > 250 && d.data[i + 1] > 250 && d.data[i + 2] > 250)) continue;
    s = (s * 16807) % 2147483647;
    const n = ((s / 2147483647) - 0.5) * amt;
    d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
  }
  x.putImageData(d, 0, 0);
}

function studio(w: number, h: number) {
  const c = mk(w, h);
  const x = ctx2d(c);
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h);
  return { c, x };
}

function tee(): Canvas {
  const { c, x } = studio(640, 660);
  const body = new Path2D("M222 60 Q320 110 418 60 L520 92 L610 210 L540 262 L486 214 L486 610 Q320 628 154 610 L154 214 L100 262 L30 210 L120 92 Z");
  x.fillStyle = "#1f3a5f"; x.fill(body);
  x.save(); x.clip(body);
  x.fillStyle = "rgba(0,0,0,.12)"; x.fillRect(0, 0, 160, 660); x.fillRect(480, 0, 160, 660);
  x.strokeStyle = "rgba(255,255,255,.06)"; x.lineWidth = 2;
  for (let y = 0; y < 660; y += 6) { x.beginPath(); x.moveTo(0, y); x.lineTo(640, y); x.stroke(); }
  x.restore();
  x.strokeStyle = "#16304f"; x.lineWidth = 14; x.beginPath(); x.moveTo(226, 66); x.quadraticCurveTo(320, 124, 414, 66); x.stroke();
  // chest graphic
  x.fillStyle = "#f2b33d"; x.beginPath(); x.arc(320, 270, 62, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#1f3a5f"; x.beginPath(); x.moveTo(290, 300); x.lineTo(320, 228); x.lineTo(350, 300); x.closePath(); x.fill();
  x.fillStyle = "#f6efe2"; x.font = "800 44px Helvetica, Arial"; x.textAlign = "center"; x.fillText("EUREKA", 320, 388);
  x.font = "600 18px Helvetica, Arial"; x.fillText("SUMMIT CLUB · 2026", 320, 416);
  noise(c, 14, 3);
  return c;
}

function jeans(): Canvas {
  const { c, x } = studio(560, 1040);
  const p = new Path2D("M120 40 L440 40 L470 300 L496 1000 L320 1000 L286 330 L274 330 L240 1000 L64 1000 L90 300 Z");
  x.fillStyle = "#35548a"; x.fill(p);
  x.save(); x.clip(p);
  x.strokeStyle = "rgba(255,255,255,.07)"; x.lineWidth = 2;
  for (let k = -1100; k < 1100; k += 5) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 1040, 1040); x.stroke(); }
  const fade = x.createRadialGradient(180, 420, 10, 180, 420, 160); fade.addColorStop(0, "rgba(255,255,255,.22)"); fade.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = fade; x.fillRect(0, 0, 560, 1040);
  const fade2 = x.createRadialGradient(380, 420, 10, 380, 420, 160); fade2.addColorStop(0, "rgba(255,255,255,.22)"); fade2.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = fade2; x.fillRect(0, 0, 560, 1040);
  x.restore();
  x.fillStyle = "#2c4878"; x.fillRect(120, 40, 320, 48);
  x.strokeStyle = "#d98c3a"; x.lineWidth = 3; x.setLineDash([9, 6]);
  x.strokeRect(124, 46, 312, 36);
  x.beginPath(); x.moveTo(132, 92); x.quadraticCurveTo(150, 170, 220, 160); x.stroke();
  x.beginPath(); x.moveTo(428, 92); x.quadraticCurveTo(410, 170, 340, 160); x.stroke();
  x.beginPath(); x.moveTo(296, 92); x.lineTo(296, 240); x.quadraticCurveTo(290, 270, 270, 280); x.stroke();
  x.setLineDash([]);
  x.fillStyle = "#c7cbd1"; x.beginPath(); x.arc(280, 64, 9, 0, 7); x.fill();
  for (const bx of [150, 230, 330, 410]) { x.fillStyle = "#2c4878"; x.fillRect(bx, 34, 14, 58); }
  noise(c, 16, 7);
  return c;
}

function sneaker(): Canvas {
  const { c, x } = studio(980, 460);
  const upper = new Path2D("M120 330 Q110 250 180 220 L420 150 Q470 110 540 120 L640 128 Q700 90 760 110 Q820 130 830 210 L850 330 Z");
  x.fillStyle = "#2f3e5c"; x.fill(upper);
  x.save(); x.clip(upper);
  x.fillStyle = "#c8452f"; x.beginPath(); x.moveTo(330, 330); x.quadraticCurveTo(520, 190, 800, 230); x.lineTo(810, 270); x.quadraticCurveTo(560, 250, 420, 330); x.closePath(); x.fill();
  x.fillStyle = "#d9d2c4"; x.fillRect(700, 100, 160, 240);
  x.fillStyle = "#1d2433"; x.fillRect(120, 300, 760, 40);
  x.restore();
  x.strokeStyle = "#f4f1ea"; x.lineWidth = 7; x.lineCap = "round";
  for (let k = 0; k < 6; k++) { const lx = 450 + k * 36, ly = 150 - k * 4; x.beginPath(); x.moveTo(lx, ly); x.lineTo(lx + 26, ly + 38); x.stroke(); }
  x.fillStyle = "#ffffff"; x.strokeStyle = "#d8d4cc"; x.lineWidth = 3;
  x.beginPath(); x.moveTo(96, 330); x.lineTo(870, 330); x.quadraticCurveTo(900, 340, 880, 382); x.lineTo(130, 382); x.quadraticCurveTo(80, 370, 96, 330); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = "#2a3346"; x.fillRect(110, 372, 760, 12);
  x.fillStyle = "#1d2433"; x.font = "800 30px Helvetica, Arial"; x.fillText("E/26", 740, 196);
  noise(c, 8, 11);
  return c;
}

function tote(): Canvas {
  const { c, x } = studio(640, 760);
  x.strokeStyle = "#7b5434"; x.lineWidth = 22; x.lineCap = "round";
  x.beginPath(); x.moveTo(210, 270); x.bezierCurveTo(210, 60, 430, 60, 430, 270); x.stroke();
  const body = new Path2D("M110 250 L530 250 L560 720 L80 720 Z");
  x.fillStyle = "#e9dcc3"; x.fill(body);
  x.save(); x.clip(body);
  x.strokeStyle = "rgba(120,90,50,.10)"; x.lineWidth = 1;
  for (let y = 250; y < 720; y += 4) { x.beginPath(); x.moveTo(60, y); x.lineTo(580, y); x.stroke(); }
  x.fillStyle = "#7b5434"; x.fillRect(60, 250, 520, 46);
  x.restore();
  x.fillStyle = "#2f4a3a"; x.beginPath(); x.ellipse(320, 470, 120, 120, 0, 0, 7); x.fill();
  x.fillStyle = "#e9dcc3"; x.font = "800 40px Georgia, serif"; x.textAlign = "center"; x.fillText("MARKET", 320, 470); x.font = "600 22px Georgia, serif"; x.fillText("est. 2026", 320, 505);
  noise(c, 10, 5);
  return c;
}

function cap(): Canvas {
  const { c, x } = studio(620, 460);
  x.fillStyle = "#2f3a2c"; x.beginPath(); x.moveTo(110, 330); x.bezierCurveTo(110, 70, 510, 70, 510, 330); x.closePath(); x.fill();
  x.strokeStyle = "rgba(0,0,0,.25)"; x.lineWidth = 3;
  x.beginPath(); x.moveTo(310, 82); x.lineTo(310, 330); x.stroke();
  x.beginPath(); x.moveTo(310, 82); x.quadraticCurveTo(190, 150, 160, 330); x.stroke();
  x.beginPath(); x.moveTo(310, 82); x.quadraticCurveTo(430, 150, 460, 330); x.stroke();
  x.fillStyle = "#26301f"; x.beginPath(); x.ellipse(310, 345, 230, 50, 0, 0, Math.PI); x.fill();
  x.fillStyle = "#e7c86e"; x.font = "800 56px Helvetica, Arial"; x.textAlign = "center"; x.fillText("E", 310, 250);
  x.fillStyle = "#3d4a39"; x.beginPath(); x.arc(310, 86, 9, 0, 7); x.fill();
  noise(c, 10, 9);
  return c;
}

function towel(): Canvas {
  const { c, x } = studio(760, 560);
  x.fillStyle = "#ebe3d3"; x.fillRect(40, 40, 680, 480);
  x.fillStyle = "#2f6f73"; for (const y of [92, 410]) { x.fillRect(40, y, 680, 22); x.fillRect(40, y + 34, 680, 8); }
  x.fillStyle = "#ddd3c0"; x.fillRect(40, 40, 680, 18); x.fillRect(40, 502, 680, 18);
  noise(c, 34, 13);
  return c;
}

const photo = (url: string) => async () => {
  const { loadImage, toCanvas } = await import("./image.ts");
  return toCanvas(await loadImage(url));
};

export const SAMPLES: Sample[] = [
  { name: "Kurta set · teal", cat: "set", load: photo("samples/CWS6KS11144A.jpg"), url: "samples/CWS6KS11144A.jpg" },
  { name: "Salwar suit + dupatta", cat: "set", load: photo("samples/CWS6CD22983A.jpg"), url: "samples/CWS6CD22983A.jpg" },
  { name: "Tunic · wine", cat: "dress", load: photo("samples/BC-EWS6TU30444A.jpg"), url: "samples/BC-EWS6TU30444A.jpg" },
  { name: "Kurta set · print", cat: "set", load: photo("samples/CWS6KS11162A.jpg"), url: "samples/CWS6KS11162A.jpg" },
  { name: "Graphic tee", cat: "tee", load: tee },
  { name: "Denim jeans", cat: "bottoms", load: jeans },
  { name: "Sneaker", cat: "footwear", load: sneaker },
  { name: "Canvas tote", cat: "bag", load: tote },
  { name: "Cap", cat: "cap", load: cap },
  { name: "Bath towel", cat: "towel", load: towel },
  { name: "Bottle · Nayasa", cat: "packaged", load: photo("samples/captain-bottle-650ml-blue-02.png"), url: "samples/captain-bottle-650ml-blue-02.png" },
  { name: "Lunch box · Nayasa", cat: "packaged", load: photo("samples/camp-lunch-box-batman-05.png"), url: "samples/camp-lunch-box-batman-05.png" },
];

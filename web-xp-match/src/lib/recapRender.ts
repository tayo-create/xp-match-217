import { TIER_META } from "@/lib/ranking";
import { DAY_COLORS, RECAP_TIMING, type RecapData, projectRoute } from "@/lib/recap";

/** Loaded images by URL; null when an image failed (or can't be drawn without tainting the canvas). */
export type RecapImages = Map<string, HTMLImageElement | null>;

const NAVY = "#1F2A44";
const INK = "#141B2D";
const BONE = "#F6F1E7";
const TERRA = "#C8452D";
const MUTED = "#8C8577";
const SERIF = "Newsreader, Georgia, serif";
const SANS = '"Instrument Sans", system-ui, sans-serif';

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const easeOut = (p: number): number => 1 - Math.pow(1 - clamp01(p), 3);
const easeBack = (p: number): number => {
  const x = clamp01(p);
  const c1 = 1.70158;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

const loadImage = (src: string, timeoutMs = 12_000): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    // CORS-enabled loads keep the canvas exportable; images without CORS fall back to the place image.
    if (!src.startsWith("data:") && !src.startsWith("blob:")) img.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });

/** Preloads every image and the two brand fonts the recap draws with. */
export async function loadRecapAssets(d: RecapData): Promise<RecapImages> {
  const srcs = [...new Set([d.cover, ...d.slides.flatMap((s) => [s.image, s.fallback])].filter(Boolean))];
  const fonts = document.fonts
    ? Promise.all([document.fonts.load(`600 80px Newsreader`), document.fonts.load(`italic 400 40px Newsreader`), document.fonts.load(`600 30px "Instrument Sans"`), document.fonts.load(`400 30px "Instrument Sans"`)]).catch(() => undefined)
    : Promise.resolve();
  const entries = await Promise.all(srcs.map(async (s) => [s, await loadImage(s)] as const));
  await fonts;
  return new Map(entries);
}

const pick = (imgs: RecapImages, a?: string, b?: string): HTMLImageElement | null => (a ? imgs.get(a) : null) || (b ? imgs.get(b) : null) || null;

/** Draws an image covering the frame with a slow zoom/pan (Ken Burns). */
function kenBurns(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number, p: number, variant: number, still: boolean) {
  const t = still ? 0.5 : clamp01(p);
  const a = variant % 2 === 0;
  const zoom = a ? 1.04 + 0.12 * t : 1.16 - 0.12 * t;
  const panX = a ? -0.025 * t : 0.02 * (1 - t);
  const panY = a ? -0.015 * t : 0.015 * (1 - t);
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * zoom;
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  ctx.drawImage(img, (W - w) / 2 + panX * W, (H - h) / 2 + panY * H, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let overflow = false;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxW || !line) {
      line = test;
      continue;
    }
    lines.push(line);
    line = w;
    if (lines.length === maxLines) {
      overflow = true;
      break;
    }
  }
  if (!overflow && line) lines.push(line);
  if (overflow) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

const setSpacing = (ctx: CanvasRenderingContext2D, px: number) => {
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
};

function scrim(ctx: CanvasRenderingContext2D, W: number, H: number, from: number, strength = 0.94) {
  const g = ctx.createLinearGradient(0, H * from, 0, H);
  g.addColorStop(0, "rgba(20,27,45,0)");
  g.addColorStop(0.5, `rgba(20,27,45,${strength * 0.62})`);
  g.addColorStop(1, `rgba(20,27,45,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.2);
  top.addColorStop(0, "rgba(20,27,45,0.55)");
  top.addColorStop(1, "rgba(20,27,45,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.2);
}

function progressBars(ctx: CanvasRenderingContext2D, n: number, k: number, p: number, W: number, pad: number, u: number) {
  if (n < 2) return;
  const y = pad * 0.55;
  const segH = 6 * u;
  const gap = (n > 12 ? 4 : 8) * u;
  const segW = (W - pad * 2 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const x = pad + i * (segW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.roundRect(x, y, segW, segH, segH / 2);
    ctx.fill();
    const f = i < k ? 1 : i === k ? clamp01(p) : 0;
    if (f > 0) {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(x, y, segW * f, segH, segH / 2);
      ctx.fill();
    }
  }
}

function drawIntro(ctx: CanvasRenderingContext2D, d: RecapData, imgs: RecapImages, ms: number, W: number, H: number, still: boolean) {
  const u = Math.min(W, H) / 1080;
  const wide = W > H;
  const pad = 84 * u;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const img = pick(imgs, d.cover, d.slides[0]?.image);
  if (img) kenBurns(ctx, img, W, H, ms / RECAP_TIMING.intro, 0, still);
  ctx.fillStyle = "rgba(20,27,45,0.28)";
  ctx.fillRect(0, 0, W, H);
  scrim(ctx, W, H, wide ? 0.2 : 0.35, 0.96);

  const maxW = wide ? W * 0.62 : W - pad * 2;
  ctx.font = `600 ${(wide ? 128 : 136) * u}px ${SERIF}`;
  const titleLines = wrap(ctx, d.title, maxW, 3);
  const titleLH = (wide ? 124 : 132) * u;
  const meta = [d.dates, d.author ? `by ${d.author}` : ""].filter(Boolean).join("  ·  ");
  const blockH = 56 * u + 36 * u + titleLines.length * titleLH + (meta ? 30 * u + 44 * u : 0);
  let y = H - pad - (wide ? 0 : 80 * u) - blockH;
  ctx.textBaseline = "top";

  const a1 = easeOut((ms - 150) / 600);
  ctx.globalAlpha = a1;
  ctx.font = `700 ${24 * u}px ${SANS}`;
  setSpacing(ctx, 5 * u);
  const label = "TRIP RECAP";
  const lw = ctx.measureText(label).width + 44 * u;
  ctx.fillStyle = TERRA;
  ctx.beginPath();
  ctx.roundRect(pad, y + (1 - a1) * 20 * u, lw, 52 * u, 26 * u);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(label, pad + 22 * u, y + 14 * u + (1 - a1) * 20 * u);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("XP MATCH", pad + lw + 22 * u, y + 14 * u + (1 - a1) * 20 * u);
  setSpacing(ctx, 0);
  y += 56 * u + 36 * u;

  const a2 = easeOut((ms - 420) / 750);
  ctx.globalAlpha = a2;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 ${(wide ? 128 : 136) * u}px ${SERIF}`;
  titleLines.forEach((l, i) => ctx.fillText(l, pad, y + i * titleLH + (1 - a2) * 40 * u));
  y += titleLines.length * titleLH;

  if (meta) {
    const a3 = easeOut((ms - 900) / 650);
    ctx.globalAlpha = a3;
    ctx.fillStyle = TERRA;
    ctx.fillRect(pad, y + 30 * u, 96 * u * a3, 5 * u);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `500 ${38 * u}px ${SANS}`;
    ctx.fillText(meta, pad, y + 58 * u);
  }
  ctx.globalAlpha = 1;
}

function drawSlide(ctx: CanvasRenderingContext2D, d: RecapData, imgs: RecapImages, k: number, ms: number, W: number, H: number, still: boolean) {
  const s = d.slides[k];
  const u = Math.min(W, H) / 1080;
  const wide = W > H;
  const pad = 72 * u;
  const p = ms / RECAP_TIMING.slide;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const img = pick(imgs, s.image, s.fallback);
  if (img) kenBurns(ctx, img, W, H, p, k + 1, still);
  scrim(ctx, W, H, wide ? 0.3 : 0.42);
  progressBars(ctx, d.slides.length, k, p, W, pad, u);

  const maxW = wide ? W * 0.56 : W - pad * 2;
  ctx.font = `600 ${84 * u}px ${SERIF}`;
  const titleLines = wrap(ctx, s.title, maxW, 2);
  ctx.font = `italic 400 ${40 * u}px ${SERIF}`;
  const capLines = s.caption ? wrap(ctx, `“${s.caption}”`, maxW, 3) : [];
  const kickerH = 32 * u;
  const titleLH = 90 * u;
  const capLH = 52 * u;
  const chipsH = s.dishes.length ? 60 * u : 0;
  const blockH = kickerH + 20 * u + titleLines.length * titleLH + (capLines.length ? 14 * u + capLines.length * capLH : 0) + (chipsH ? 28 * u + chipsH : 0);
  let y = H - pad - (wide ? 0 : 70 * u) - blockH;

  const a = easeOut((ms - 200) / 650);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(0, (1 - a) * 36 * u);
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `600 ${26 * u}px ${SANS}`;
  setSpacing(ctx, 4 * u);
  ctx.fillText(s.kicker.toUpperCase(), pad, y);
  setSpacing(ctx, 0);
  y += kickerH + 20 * u;

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 ${84 * u}px ${SERIF}`;
  titleLines.forEach((l) => {
    ctx.fillText(l, pad, y);
    y += titleLH;
  });

  if (capLines.length) {
    y += 14 * u;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `italic 400 ${40 * u}px ${SERIF}`;
    capLines.forEach((l) => {
      ctx.fillText(l, pad, y);
      y += capLH;
    });
  }

  if (chipsH) {
    y += 28 * u;
    ctx.font = `700 ${22 * u}px ${SANS}`;
    setSpacing(ctx, 4 * u);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.textBaseline = "middle";
    ctx.fillText("ORDER", pad, y + chipsH / 2);
    let x = pad + ctx.measureText("ORDER").width + 22 * u;
    setSpacing(ctx, 0);
    ctx.font = `600 ${28 * u}px ${SANS}`;
    for (const dish of s.dishes) {
      const w = ctx.measureText(dish).width + 44 * u;
      if (x + w > pad + maxW) break;
      ctx.fillStyle = TERRA;
      ctx.beginPath();
      ctx.roundRect(x, y, w, chipsH, chipsH / 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(dish, x + 22 * u, y + chipsH / 2 + 1 * u);
      x += w + 12 * u;
    }
  }
  ctx.restore();

  if (typeof s.score === "number") {
    const tier = s.tier ?? (s.score >= 7 ? "loved" : s.score >= 4 ? "liked" : "meh");
    const pop = easeBack((ms - 480) / 520);
    const r = 80 * u;
    const cx = W - pad - r;
    const cy = pad + 56 * u + r;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    ctx.fillStyle = TIER_META[tier].color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6 * u;
    ctx.strokeStyle = "#FFFFFF";
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${62 * u}px ${SERIF}`;
    ctx.fillText(s.score.toFixed(1), 0, -6 * u);
    ctx.font = `700 ${17 * u}px ${SANS}`;
    setSpacing(ctx, 3 * u);
    ctx.fillText(TIER_META[tier].short.toUpperCase(), 0, 38 * u);
    setSpacing(ctx, 0);
    ctx.restore();
    ctx.textAlign = "left";
  }
}

function drawOutro(ctx: CanvasRenderingContext2D, d: RecapData, ms: number, W: number, H: number) {
  const u = Math.min(W, H) / 1080;
  const wide = W > H;
  const pad = 84 * u;
  ctx.fillStyle = BONE;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // Wordmark
  ctx.font = `600 ${58 * u}px ${SERIF}`;
  ctx.fillStyle = TERRA;
  ctx.fillText("XP", pad, pad);
  const xpW = ctx.measureText("XP ").width;
  ctx.fillStyle = NAVY;
  ctx.fillText("Match", pad + xpW, pad);

  // Route card
  const box = wide ? { x: pad, y: pad + 120 * u, w: W * 0.5 - pad, h: H - pad * 2 - 120 * u } : { x: pad, y: pad + 130 * u, w: W - pad * 2, h: H * 0.42 };
  const boxIn = easeOut(ms / 500);
  ctx.globalAlpha = boxIn;
  ctx.fillStyle = "#EDE4D3";
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 28 * u);
  ctx.fill();
  ctx.font = `700 ${22 * u}px ${SANS}`;
  setSpacing(ctx, 5 * u);
  ctx.fillStyle = MUTED;
  ctx.fillText(`THE ROUTE · ${d.city.toUpperCase()}`, box.x + 32 * u, box.y + 30 * u);
  setSpacing(ctx, 0);
  ctx.globalAlpha = 1;

  const pts = projectRoute(d.route, box.w, box.h - 70 * u, 70 * u).map((pt) => ({ ...pt, x: pt.x + box.x, y: pt.y + box.y + 60 * u }));
  const drawn = easeOut((ms - 300) / 2600) * Math.max(0, pts.length - 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < pts.length - 1; i++) {
    const f = clamp01(drawn - i);
    if (f <= 0) break;
    const a = pts[i];
    const b = pts[i + 1];
    const ex = a.x + (b.x - a.x) * f;
    const ey = a.y + (b.y - a.y) * f;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 16 * u;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = DAY_COLORS[b.day % DAY_COLORS.length];
    ctx.lineWidth = 8 * u;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  const many = pts.length > 14;
  pts.forEach((pt, i) => {
    if (i > drawn + 0.001 && !(i === 0 && ms > 300)) return;
    const r = (many ? 11 : 19) * u;
    ctx.fillStyle = DAY_COLORS[pt.day % DAY_COLORS.length];
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = "#FFFFFF";
    ctx.stroke();
    if (!many) {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `700 ${18 * u}px ${SANS}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), pt.x, pt.y + 1 * u);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
    }
  });

  // Stats
  const col = wide ? { x: W * 0.55, y: pad + 150 * u, w: W * 0.45 - pad } : { x: pad, y: box.y + box.h + 80 * u, w: W - pad * 2 };
  const stats: { v: string; l: string }[] = [
    { v: String(d.stats.days), l: d.stats.days === 1 ? "DAY" : "DAYS" },
    { v: String(d.stats.stops), l: d.stats.stops === 1 ? "STOP" : "STOPS" },
    ...(d.stats.avg !== undefined ? [{ v: d.stats.avg.toFixed(1), l: "AVG RATING" }] : []),
  ];
  const cw = col.w / 3;
  stats.forEach((s, i) => {
    const a = easeOut((ms - 900 - i * 160) / 600);
    ctx.globalAlpha = a;
    ctx.fillStyle = i === 2 ? TERRA : NAVY;
    ctx.font = `600 ${110 * u}px ${SERIF}`;
    ctx.fillText(s.v, col.x + i * cw, col.y + (1 - a) * 24 * u);
    ctx.fillStyle = MUTED;
    ctx.font = `700 ${22 * u}px ${SANS}`;
    setSpacing(ctx, 4 * u);
    ctx.fillText(s.l, col.x + i * cw + 4 * u, col.y + 124 * u);
    setSpacing(ctx, 0);
  });

  let y = col.y + 210 * u;
  if (d.stats.best) {
    const a = easeOut((ms - 1500) / 650);
    ctx.globalAlpha = a;
    ctx.fillStyle = NAVY;
    ctx.fillRect(col.x, y, col.w, 2 * u);
    y += 40 * u;
    ctx.fillStyle = MUTED;
    ctx.font = `700 ${22 * u}px ${SANS}`;
    setSpacing(ctx, 4 * u);
    ctx.fillText("BEST OF THE TRIP", col.x, y);
    setSpacing(ctx, 0);
    y += 46 * u;
    ctx.font = `600 ${60 * u}px ${SERIF}`;
    const lines = wrap(ctx, d.stats.best.name, col.w - 160 * u, 2);
    ctx.fillStyle = NAVY;
    lines.forEach((l, i) => ctx.fillText(l, col.x, y + i * 66 * u));
    ctx.fillStyle = TERRA;
    ctx.textAlign = "right";
    ctx.fillText(d.stats.best.score.toFixed(1), col.x + col.w, y);
    ctx.textAlign = "left";
  }

  const af = easeOut((ms - 2100) / 700);
  ctx.globalAlpha = af;
  ctx.fillStyle = NAVY;
  ctx.font = `500 ${32 * u}px ${SANS}`;
  ctx.textAlign = wide ? "right" : "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Plan yours at xpmatchme.com", wide ? W - pad : pad, H - pad);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.globalAlpha = 1;
}

/** Which scene (-1 intro, 0..n-1 slides, n outro) is on screen at `t` ms, and how far into it. */
export function sceneAt(d: RecapData, t: number): { k: number; local: number } {
  const { intro, slide, outro } = RECAP_TIMING;
  const n = d.slides.length;
  if (t < intro) return { k: -1, local: Math.max(0, t) };
  const s = t - intro;
  if (s < n * slide) {
    const k = Math.floor(s / slide);
    return { k, local: s - k * slide };
  }
  return { k: n, local: Math.min(outro, s - n * slide) };
}

export const sceneStart = (d: RecapData, k: number): number => (k < 0 ? 0 : RECAP_TIMING.intro + Math.min(k, d.slides.length) * RECAP_TIMING.slide);

const sceneLength = (d: RecapData, k: number): number => (k < 0 ? RECAP_TIMING.intro : k >= d.slides.length ? RECAP_TIMING.outro : RECAP_TIMING.slide);

function drawScene(ctx: CanvasRenderingContext2D, d: RecapData, imgs: RecapImages, k: number, ms: number, W: number, H: number, still: boolean) {
  ctx.globalAlpha = 1;
  if (k < 0) drawIntro(ctx, d, imgs, ms, W, H, still);
  else if (k >= d.slides.length) drawOutro(ctx, d, ms, W, H);
  else drawSlide(ctx, d, imgs, k, ms, W, H, still);
}

let layer: HTMLCanvasElement | null = null;

/** Renders the recap frame at `t` ms. Scenes cross-fade into each other. */
export function drawRecap(ctx: CanvasRenderingContext2D, d: RecapData, imgs: RecapImages, t: number, W: number, H: number, still = false): void {
  const { k, local } = sceneAt(d, t);
  if (local >= RECAP_TIMING.fade || k < 0) {
    drawScene(ctx, d, imgs, k, local, W, H, still);
    return;
  }
  const prev = k - 1;
  drawScene(ctx, d, imgs, prev, sceneLength(d, prev), W, H, still);
  layer ??= document.createElement("canvas");
  if (layer.width !== W || layer.height !== H) {
    layer.width = W;
    layer.height = H;
  }
  const lctx = layer.getContext("2d");
  if (!lctx) return drawScene(ctx, d, imgs, k, local, W, H, still);
  drawScene(lctx, d, imgs, k, local, W, H, still);
  ctx.globalAlpha = easeOut(local / RECAP_TIMING.fade);
  ctx.drawImage(layer, 0, 0);
  ctx.globalAlpha = 1;
}

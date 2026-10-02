import { KIND_LABEL } from "@/data/places";
import { legBetween } from "@/lib/geo";
import type { Trip } from "@/lib/types";

type RGB = [number, number, number];

const NAVY: RGB = [31, 42, 68];
const TERRACOTTA: RGB = [200, 69, 45];
const BONE: RGB = [246, 241, 231];
const SAND: RGB = [237, 230, 216];
const MUTED: RGB = [96, 104, 122];
const DAY_RGB: RGB[] = [
  [200, 69, 45],
  [31, 42, 68],
  [94, 156, 124],
  [217, 164, 58],
  [224, 138, 106],
  [74, 111, 165],
  [140, 90, 158],
  [46, 140, 140],
];

/** The built-in PDF fonts only cover Latin-1; swap anything else for a close ASCII stand-in. */
const clean = (s: string): string =>
  s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00B7/g, "-")
    .normalize("NFC")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");

const dayLabel = (trip: Trip, i: number): string => {
  const d = new Date(`${trip.startDate}T00:00:00`);
  d.setDate(d.getDate() + i);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};

const rangeLabel = (trip: Trip): string => {
  const f = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${f(trip.startDate)} - ${f(trip.endDate)}`;
};

/**
 * Builds a clean, printable day-by-day PDF of a trip: a cover summary, then one page per day
 * with a schematic route sketch, numbered stops, times, notes, and walking/ride estimates.
 */
export async function downloadTripPdf(trip: Trip, opts?: { owner?: string }): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 16;
  const totalStops = trip.days.reduce((n, d) => n + d.items.length, 0);

  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  const footer = (page: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    ink(MUTED);
    doc.text(clean(`XP Match - ${trip.city} itinerary`), M, H - 9);
    doc.text(`${page}`, W - M, H - 9, { align: "right" });
  };

  // Cover
  fill(BONE);
  doc.rect(0, 0, W, H, "F");
  fill(NAVY);
  doc.rect(0, 0, W, 92, "F");
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  ink(TERRACOTTA);
  doc.text("XP", M, 20);
  ink(BONE);
  doc.text("Match", M + 7.5, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("YOUR ITINERARY", M, 44, { charSpace: 1.2 });
  doc.setFont("times", "bold");
  doc.setFontSize(46);
  doc.text(clean(trip.city), M, 64);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(clean(`${trip.country ? `${trip.country}  |  ` : ""}${rangeLabel(trip)}  |  ${trip.days.length} days  |  ${totalStops} stops`), M, 78);

  let y = 108;
  ink(NAVY);
  doc.setFont("times", "italic");
  doc.setFontSize(13);
  const blurb = doc.splitTextToSize(clean(trip.blurb), W - 2 * M) as string[];
  doc.text(blurb, M, y);
  y += blurb.length * 6 + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  ink(MUTED);
  doc.text("AT A GLANCE", M, y, { charSpace: 1.2 });
  y += 6;
  trip.days.forEach((d, i) => {
    if (y > H - 30) return;
    const c = DAY_RGB[i % DAY_RGB.length];
    fill(c);
    doc.circle(M + 2.5, y - 1.3, 2.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    ink(NAVY);
    doc.text(`Day ${i + 1}`, M + 8, y);
    doc.setFont("helvetica", "normal");
    ink(MUTED);
    doc.text(clean(dayLabel(trip, i)), M + 24, y);
    ink(NAVY);
    const names = d.items.length ? d.items.map((x) => x.place.name).join(", ") : "Open day";
    const line = doc.splitTextToSize(clean(names), W - 2 * M - 82)[0] as string;
    doc.text(line, M + 82, y);
    y += 8;
  });
  if (opts?.owner) {
    doc.setFontSize(9);
    ink(MUTED);
    doc.text(clean(`Planned by ${opts.owner} with XP Match`), M, H - 20);
  }
  footer(1);

  // One page per day
  trip.days.forEach((day, i) => {
    doc.addPage();
    const color = DAY_RGB[i % DAY_RGB.length];
    fill(BONE);
    doc.rect(0, 0, W, H, "F");
    fill(color);
    doc.rect(0, 0, 6, H, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    ink(color);
    doc.text(`DAY ${i + 1} OF ${trip.days.length}`, M, 20, { charSpace: 1.2 });
    doc.setFont("times", "bold");
    doc.setFontSize(28);
    ink(NAVY);
    doc.text(clean(dayLabel(trip, i)), M, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    ink(MUTED);
    doc.text(clean(`${trip.city}  |  ${day.items.length} ${day.items.length === 1 ? "stop" : "stops"}`), M, 39);

    let cy = 48;
    const items = day.items;

    // Route sketch: stops projected into a box, joined in order.
    if (items.length > 1) {
      const bx = M;
      const bw = W - 2 * M;
      const bh = 62;
      fill(SAND);
      doc.roundedRect(bx, cy, bw, bh, 3, 3, "F");
      const lats = items.map((x) => x.place.lat);
      const lngs = items.map((x) => x.place.lng);
      const latMid = (Math.min(...lats) + Math.max(...lats)) / 2;
      const kx = Math.cos((latMid * Math.PI) / 180);
      const spanX = Math.max((Math.max(...lngs) - Math.min(...lngs)) * kx, 0.004);
      const spanY = Math.max(Math.max(...lats) - Math.min(...lats), 0.004);
      const pad = 12;
      const s = Math.min((bw - 2 * pad) / spanX, (bh - 2 * pad) / spanY);
      const ox = bx + bw / 2 - (((Math.min(...lngs) + Math.max(...lngs)) / 2) * kx) * s;
      const oy = cy + bh / 2 + ((Math.min(...lats) + Math.max(...lats)) / 2) * s;
      const pts = items.map((x) => [ox + x.place.lng * kx * s, oy - x.place.lat * s] as const);
      stroke(color);
      doc.setLineWidth(0.9);
      for (let k = 1; k < pts.length; k++) doc.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
      pts.forEach(([px, py], k) => {
        fill([255, 255, 255]);
        doc.circle(px, py, 3.6, "F");
        fill(color);
        doc.circle(px, py, 3, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        ink([255, 255, 255]);
        doc.text(String(k + 1), px, py + 1.1, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        ink(NAVY);
        const label = clean(items[k].place.name);
        const right = px < bx + bw - 45;
        doc.text(label.length > 26 ? `${label.slice(0, 25)}...` : label, right ? px + 5 : px - 5, py + 1, { align: right ? "left" : "right" });
      });
      doc.setFontSize(6.5);
      ink(MUTED);
      doc.text("Route sketch, not to scale for navigation", bx + bw - 3, cy + bh - 3, { align: "right" });
      cy += bh + 10;
    }

    if (!items.length) {
      doc.setFont("times", "italic");
      doc.setFontSize(14);
      ink(MUTED);
      doc.text("An open day. Wander, rest, or ask XP to fill it.", M, cy + 8);
    }

    items.forEach((it, k) => {
      const textX = M + 30;
      const textW = W - M - textX;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      const body = doc.splitTextToSize(clean(it.note ?? it.place.blurb), textW) as string[];
      const blockH = 13 + Math.min(body.length, 3) * 4.4;
      if (cy + blockH > H - 24) {
        footer(doc.getNumberOfPages());
        doc.addPage();
        fill(BONE);
        doc.rect(0, 0, W, H, "F");
        fill(color);
        doc.rect(0, 0, 6, H, "F");
        cy = 22;
      }
      fill(color);
      doc.circle(M + 3.5, cy + 0.5, 3.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      ink([255, 255, 255]);
      doc.text(String(k + 1), M + 3.5, cy + 1.7, { align: "center" });
      doc.setFontSize(11);
      ink(NAVY);
      doc.text(it.time, M + 10, cy + 1.8);

      doc.setFontSize(13);
      doc.text(clean(it.place.name), textX, cy + 1.8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      ink(MUTED);
      doc.text(clean(`${it.place.cuisine ?? KIND_LABEL[it.place.kind]}  |  ${it.place.neighborhood}  |  ${"$".repeat(Math.max(1, it.place.price))}`), textX, cy + 7);
      ink(NAVY);
      doc.setFontSize(9.5);
      doc.text(body.slice(0, 3), textX, cy + 12.5);
      cy += blockH;

      const next = items[k + 1];
      if (next) {
        const leg = legBetween(it.place, next.place);
        stroke(SAND);
        doc.setLineDashPattern([1, 1.4], 0);
        doc.setLineWidth(0.5);
        doc.line(M + 3.5, cy - 4, M + 3.5, cy + 3);
        doc.setLineDashPattern([], 0);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8.5);
        ink(MUTED);
        doc.text(clean(leg.label.replace("·", "-")), textX, cy + 0.5);
        cy += 7;
      } else cy += 2;
    });

    footer(doc.getNumberOfPages());
  });

  const slug = trip.city.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  doc.save(`xp-match-${slug}-${trip.startDate}.pdf`);
}

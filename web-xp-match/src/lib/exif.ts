/** Location and capture time read from a photo's EXIF data. */
export interface PhotoMeta {
  lat?: number;
  lng?: number;
  takenAt?: number;
  /** True when the time came from EXIF rather than the file's modified date. */
  exactTime: boolean;
}

const parseExifDate = (s: string): number | undefined => {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return Number.isNaN(d.getTime()) ? undefined : d.getTime();
};

function parseTiff(v: DataView, start: number): Omit<PhotoMeta, "exactTime"> {
  const little = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(o, little);
  const u32 = (o: number) => v.getUint32(o, little);

  const readIfd = (at: number): Map<number, number> => {
    const map = new Map<number, number>();
    const n = u16(at);
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      map.set(u16(e), e);
    }
    return map;
  };
  const ascii = (entry: number): string => {
    const count = u32(entry + 4);
    const ptr = count > 4 ? start + u32(entry + 8) : entry + 8;
    let s = "";
    for (let i = 0; i < Math.min(count, 64); i++) {
      const c = v.getUint8(ptr + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const coord = (entry: number): number | undefined => {
    const ptr = start + u32(entry + 8);
    const parts = [0, 1, 2].map((i) => {
      const den = u32(ptr + i * 8 + 4);
      return den ? u32(ptr + i * 8) / den : 0;
    });
    const val = parts[0] + parts[1] / 60 + parts[2] / 3600;
    return Number.isFinite(val) ? val : undefined;
  };

  const out: Omit<PhotoMeta, "exactTime"> = {};
  const ifd0 = readIfd(start + u32(start + 4));
  const exifPtr = ifd0.get(0x8769);
  if (exifPtr !== undefined) {
    const exif = readIfd(start + u32(exifPtr + 8));
    const dto = exif.get(0x9003) ?? exif.get(0x9004);
    if (dto !== undefined) out.takenAt = parseExifDate(ascii(dto));
  }
  if (out.takenAt === undefined && ifd0.has(0x0132)) out.takenAt = parseExifDate(ascii(ifd0.get(0x0132)!));

  const gpsPtr = ifd0.get(0x8825);
  if (gpsPtr !== undefined) {
    const gps = readIfd(start + u32(gpsPtr + 8));
    const latE = gps.get(0x0002);
    const lngE = gps.get(0x0004);
    if (latE !== undefined && lngE !== undefined) {
      const lat = coord(latE);
      const lng = coord(lngE);
      const latRef = gps.has(0x0001) ? ascii(gps.get(0x0001)!) : "N";
      const lngRef = gps.has(0x0003) ? ascii(gps.get(0x0003)!) : "E";
      if (lat !== undefined && lng !== undefined && (lat !== 0 || lng !== 0)) {
        out.lat = latRef === "S" ? -lat : lat;
        out.lng = lngRef === "W" ? -lng : lng;
      }
    }
  }
  return out;
}

/** Reads GPS and capture time from a JPEG. Falls back to the file's date when EXIF is missing. */
export async function readPhotoMeta(file: File): Promise<PhotoMeta> {
  const fallback: PhotoMeta = { takenAt: file.lastModified || undefined, exactTime: false };
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return fallback;
    let off = 2;
    while (off + 10 < v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
      const size = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
        const meta = parseTiff(v, off + 10);
        return { ...meta, takenAt: meta.takenAt ?? fallback.takenAt, exactTime: meta.takenAt !== undefined };
      }
      off += 2 + size;
    }
  } catch (e) {
    console.warn("[exif] couldn't read photo metadata", e instanceof Error ? e.message : e);
  }
  return fallback;
}

import { BACKEND_PATH, readJson } from "@/lib/backend";
import { fetchWithAuth } from "@/providers/AuthProvider";

/** Resolves a stored photo reference to something an <img> can load. */
export const photoSrc = (ref: string): string => (ref.startsWith("/feed/photo/") ? `${BACKEND_PATH}${ref}` : ref);

/** Downscales an image file to a JPEG data URL. */
export function compressImage(file: File, maxSide = 1280, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("That file isn't an image."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo format isn't supported here. Try a JPEG or PNG."));
    };
    img.src = url;
  });
}

/**
 * Prepares a photo for a log: uploaded to the backend when signed in (returns a short path),
 * otherwise kept as a small data URL on this device.
 */
export async function preparePhoto(file: File, signedIn: boolean): Promise<string> {
  if (!signedIn) return compressImage(file, 560, 0.7);
  const data = await compressImage(file, 1280, 0.8);
  try {
    const res = await fetchWithAuth(`${BACKEND_PATH}/feed/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photo: data }) });
    const { url } = await readJson<{ url: string }>(res);
    return url;
  } catch (e) {
    console.warn("[photos] upload failed, keeping a local copy", e instanceof Error ? e.message : e);
    return compressImage(file, 560, 0.7);
  }
}

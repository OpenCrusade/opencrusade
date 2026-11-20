/**
 * Shrink a picture so it fits in the crusade sheet as text.
 *
 * The sheet stores it as a data: URL split across cells, so the
 * budget is in characters. Tries WebP, then JPEG, stepping the size
 * and quality down until it fits.
 */
export const MAP_MAX_CHARS = 480_000;

export interface ShrunkImage {
  dataUrl: string;
  width: number;
  height: number;
}

export async function shrinkImage(
  file: Blob,
  maxChars = MAP_MAX_CHARS,
): Promise<ShrunkImage> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file isn't a picture this browser can read.");
  });
  try {
    for (const edge of [2000, 1600, 1280, 1024, 800, 640]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser can't resize pictures.");
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const type of ["image/webp", "image/jpeg"]) {
        for (const quality of [0.82, 0.7, 0.55]) {
          const dataUrl = canvas.toDataURL(type, quality);
          // A browser without WebP encoding silently returns PNG.
          if (!dataUrl.startsWith(`data:${type}`)) break;
          if (dataUrl.length <= maxChars) return { dataUrl, width, height };
        }
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Couldn't make that picture small enough. Try a simpler image.");
}

// owner: step 3.3 — client-side photo encoding (Blueprint §5 "Write semantics").
//
// Photos never leave the phone at full size: Spark has no Cloud Storage, so a photo is a JPEG data
// URL inside a Firestore document (1 MB limit per doc). encodePhoto() turns a picked file into an
// EncodedPhoto:
//   full   longest edge ≤ 1600px, JPEG quality stepping 0.82 → 0.5 until ≤ 200 KB; if quality 0.5 is
//          still too big, the image shrinks by 20% and the steps run again.
//   thumb  longest edge ≤ 240px, same stepping, ≤ 15 KB (Memory cards, TaskDetail thumbs).
// Transparent pixels (PNG screenshots) are painted on white, since JPEG has no alpha.
//
// The canvas work sits behind a tiny `ImageEnv` so the budget logic is unit-testable without a
// real canvas (jsdom has none).

import type { EncodedPhoto } from '$lib/domain/types';

export const FULL_MAX_EDGE = 1600;
export const FULL_MAX_BYTES = 200 * 1024;
export const THUMB_MAX_EDGE = 240;
export const THUMB_MAX_BYTES = 15 * 1024;
/** JPEG qualities tried in order (the blueprint's 0.82 → 0.5). */
export const QUALITY_STEPS: readonly number[] = [0.82, 0.74, 0.66, 0.58, 0.5];
/** After the last quality step, the image shrinks by this factor and the steps run again. */
export const SHRINK_FACTOR = 0.8;
/** Never shrink below this edge (a failsafe for pathological inputs). */
const MIN_EDGE = 64;

/** A decoded image the env can draw. */
export interface DecodedImage {
  width: number;
  height: number;
  /** Frees decoder memory (ImageBitmap.close). */
  close?: () => void;
}

/** What encodePhoto needs from the platform. The default uses createImageBitmap + <canvas>. */
export interface ImageEnv {
  decode(file: Blob): Promise<DecodedImage>;
  /** Draws `img` scaled to width × height on white and returns a JPEG data URL at `quality`. */
  render(img: DecodedImage, width: number, height: number, quality: number): string;
}

/** Fits width × height inside a square of `maxEdge`, keeping the aspect ratio (never upscales). */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest <= 0) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

/** Decoded size in bytes of a base64 data URL (what the budget is about). */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma < 0 ? dataUrl : dataUrl.slice(comma + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export interface EncodeResult {
  dataUrl: string;
  width: number;
  height: number;
  quality: number;
}

/**
 * Renders `img` at most `maxEdge` on its longest side, stepping the JPEG quality down until the
 * result fits `maxBytes`; then shrinks and tries again. Returns the first result that fits (or the
 * smallest attempt, at the minimum edge, if nothing does).
 */
export function encodeWithinBudget(
  env: Pick<ImageEnv, 'render'>,
  img: DecodedImage,
  maxEdge: number,
  maxBytes: number
): EncodeResult {
  let edge = maxEdge;
  for (;;) {
    const { width, height } = fitWithin(img.width, img.height, edge);
    let last: EncodeResult | null = null;
    for (const quality of QUALITY_STEPS) {
      const dataUrl = env.render(img, width, height, quality);
      last = { dataUrl, width, height, quality };
      if (dataUrlBytes(dataUrl) <= maxBytes) return last;
    }
    const longest = Math.max(width, height);
    if (longest <= MIN_EDGE && last) return last;
    edge = Math.max(MIN_EDGE, Math.floor(longest * SHRINK_FACTOR));
  }
}

/** Encodes a picked image file into a full photo + thumbnail (see the file header). */
export async function encodePhoto(
  file: Blob,
  env: ImageEnv = browserImageEnv
): Promise<EncodedPhoto> {
  const img = await env.decode(file);
  try {
    const full = encodeWithinBudget(env, img, FULL_MAX_EDGE, FULL_MAX_BYTES);
    const thumb = encodeWithinBudget(env, img, THUMB_MAX_EDGE, THUMB_MAX_BYTES);
    return {
      dataUrl: full.dataUrl,
      thumbDataUrl: thumb.dataUrl,
      width: full.width,
      height: full.height
    };
  } finally {
    img.close?.();
  }
}

// ── Browser implementation ────────────────────────────────────────────────────

interface BrowserImage extends DecodedImage {
  source: CanvasImageSource;
}

async function decodeInBrowser(file: Blob): Promise<BrowserImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // EXIF orientation is applied, so phone portraits stay upright.
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { width: bmp.width, height: bmp.height, source: bmp, close: () => bmp.close() };
    } catch {
      // Fall through to <img> (older engines, some HEIC paths).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const el = new Image();
    el.decoding = 'async';
    el.src = url;
    await el.decode();
    return { width: el.naturalWidth, height: el.naturalHeight, source: el };
  } finally {
    URL.revokeObjectURL(url);
  }
}

let canvas: HTMLCanvasElement | null = null;

function renderInBrowser(img: DecodedImage, width: number, height: number, quality: number): string {
  canvas ??= document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage((img as BrowserImage).source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export const browserImageEnv: ImageEnv = {
  decode: decodeInBrowser,
  render: renderInBrowser
};

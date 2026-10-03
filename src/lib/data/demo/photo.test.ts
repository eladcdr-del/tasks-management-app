import { describe, expect, it } from 'vitest';
import { bytesToBase64, encodePhoto, imageSize } from './photo';
import { SEED_RECEIPT_JPEG, SEED_RECEIPT_THUMB } from './seed';

const bytesOf = (dataUrl: string) =>
  Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));

/** The 24 header bytes of a PNG: signature + IHDR length/type + width + height. */
function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

describe('imageSize', () => {
  it('reads JPEG frame sizes', () => {
    expect(imageSize(bytesOf(SEED_RECEIPT_JPEG))).toEqual({ width: 120, height: 160 });
    expect(imageSize(bytesOf(SEED_RECEIPT_THUMB))).toEqual({ width: 48, height: 64 });
  });

  it('reads PNG sizes', () => {
    expect(imageSize(pngHeader(1600, 1200))).toEqual({ width: 1600, height: 1200 });
  });

  it('returns null for anything else or a truncated header', () => {
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(imageSize(bytesOf(SEED_RECEIPT_JPEG).subarray(0, 30))).toBeNull();
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
});

describe('bytesToBase64', () => {
  it('matches btoa, also above the 32 KB chunk size', () => {
    const big = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 31) % 256);
    const decoded = Uint8Array.from(atob(bytesToBase64(big)), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(big);
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe(btoa('hi'));
  });
});

describe('encodePhoto', () => {
  it('stores the blob as a data URL with its size; the thumbnail is the same image', async () => {
    const bytes = bytesOf(SEED_RECEIPT_JPEG);
    const out = await encodePhoto(new Blob([bytes], { type: 'image/jpeg' }));
    expect(out).toEqual({
      dataUrl: SEED_RECEIPT_JPEG,
      thumbDataUrl: SEED_RECEIPT_JPEG,
      width: 120,
      height: 160
    });
  });

  it('sniffs PNG when the blob has no type, and reports 0×0 for unknown data', async () => {
    const png = await encodePhoto(new Blob([pngHeader(10, 20)]));
    expect(png.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect([png.width, png.height]).toEqual([10, 20]);
    const junk = await encodePhoto(new Blob([new Uint8Array([1, 2, 3])]));
    expect([junk.width, junk.height]).toEqual([0, 0]);
  });
});

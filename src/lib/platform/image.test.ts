import { describe, expect, it, vi } from 'vitest';
import {
  dataUrlBytes,
  encodePhoto,
  encodeWithinBudget,
  fitWithin,
  FULL_MAX_BYTES,
  QUALITY_STEPS,
  THUMB_MAX_BYTES,
  type DecodedImage,
  type ImageEnv
} from './image';

/** A data URL whose decoded size is exactly `bytes`. */
function fakeJpeg(bytes: number): string {
  const b64Len = Math.ceil(bytes / 3) * 4;
  const pad = (3 - (bytes % 3)) % 3;
  return `data:image/jpeg;base64,${'A'.repeat(b64Len - pad)}${'='.repeat(pad)}`;
}

/** A canvas stand-in: output size grows with pixel count and quality (≈ a real JPEG's shape). */
function mockEnv(bytesPerPixelAtQ1: number) {
  const calls: { width: number; height: number; quality: number }[] = [];
  const env: ImageEnv = {
    decode: vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })),
    render: (_img, width, height, quality) => {
      calls.push({ width, height, quality });
      return fakeJpeg(Math.round(width * height * bytesPerPixelAtQ1 * quality));
    }
  };
  return { env, calls };
}

describe('fitWithin', () => {
  it('scales the longest edge down and keeps the ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(4000, 3000, 240)).toEqual({ width: 240, height: 180 });
  });

  it('never upscales', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe('dataUrlBytes', () => {
  it('measures the decoded payload, padding included', () => {
    expect(dataUrlBytes(fakeJpeg(3))).toBe(3);
    expect(dataUrlBytes(fakeJpeg(4))).toBe(4);
    expect(dataUrlBytes(fakeJpeg(5))).toBe(5);
    expect(dataUrlBytes(fakeJpeg(200 * 1024))).toBe(200 * 1024);
  });
});

describe('encodeWithinBudget', () => {
  const img: DecodedImage = { width: 4000, height: 3000 };

  it('stops at the first quality that fits', () => {
    // 1600×1200 = 1.92 MP; at 0.1 B/px·q: q=0.82 → 157 KB, fits at once.
    const { env, calls } = mockEnv(0.1);
    const r = encodeWithinBudget(env, img, 1600, FULL_MAX_BYTES);
    expect(r.quality).toBe(0.82);
    expect(calls).toHaveLength(1);
    expect(r).toMatchObject({ width: 1600, height: 1200 });
  });

  it('steps the quality down 0.82 → 0.5', () => {
    // 0.17 B/px·q: 0.82 → 261 KB, 0.74 → 236 KB, 0.66 → 210 KB, 0.58 → 185 KB (fits)
    const { env, calls } = mockEnv(0.17);
    const r = encodeWithinBudget(env, img, 1600, FULL_MAX_BYTES);
    expect(calls.map((c) => c.quality)).toEqual([0.82, 0.74, 0.66, 0.58]);
    expect(r.quality).toBe(0.58);
    expect(dataUrlBytes(r.dataUrl)).toBeLessThanOrEqual(FULL_MAX_BYTES);
  });

  it('shrinks the image once quality 0.5 is not enough', () => {
    const { env, calls } = mockEnv(0.4);
    const r = encodeWithinBudget(env, img, 1600, FULL_MAX_BYTES);
    expect(calls.slice(0, QUALITY_STEPS.length).every((c) => c.width === 1600)).toBe(true);
    expect(r.width).toBeLessThan(1600);
    expect(dataUrlBytes(r.dataUrl)).toBeLessThanOrEqual(FULL_MAX_BYTES);
  });

  it('gives up gracefully at the minimum edge', () => {
    const env: Pick<ImageEnv, 'render'> = { render: () => fakeJpeg(10 * 1024 * 1024) };
    const r = encodeWithinBudget(env, img, 1600, FULL_MAX_BYTES);
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(64);
  });
});

describe('encodePhoto', () => {
  it('produces a ≤200 KB full image (≤1600px) and a ≤15 KB 240px thumbnail', async () => {
    const { env, calls } = mockEnv(0.2);
    const photo = await encodePhoto(new Blob(['x']), env);
    expect(photo.width).toBeLessThanOrEqual(1600);
    expect(Math.max(photo.width, photo.height)).toBeLessThanOrEqual(1600);
    expect(dataUrlBytes(photo.dataUrl)).toBeLessThanOrEqual(FULL_MAX_BYTES);
    expect(dataUrlBytes(photo.thumbDataUrl)).toBeLessThanOrEqual(THUMB_MAX_BYTES);
    expect(calls.some((c) => c.width === 240 && c.height === 180)).toBe(true);
    // Fits the Firestore field caps of the Photo document (types.ts).
    expect(photo.dataUrl.length).toBeLessThanOrEqual(300_000);
    expect(photo.thumbDataUrl.length).toBeLessThanOrEqual(20_000);
  });

  it('releases the decoded image even when rendering fails', async () => {
    const close = vi.fn();
    const env: ImageEnv = {
      decode: async () => ({ width: 10, height: 10, close }),
      render: () => {
        throw new Error('boom');
      }
    };
    await expect(encodePhoto(new Blob(['x']), env)).rejects.toThrow('boom');
    expect(close).toHaveBeenCalled();
  });
});

// Completion photos in the demo adapter. `completeTask` receives EncodedPhoto values that
// platform/image.ts has already compressed and thumbnailed (Blueprint §5 "Photos are compressed by
// platform/image.ts, not the adapter"); the demo stores them as they are. What remains here is a
// JPEG/PNG header reader (no canvas, so it works in Node), used to check the seed's photo sizes.

export type { EncodedPhoto } from '../../domain/types';

const u16 = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u32 = (b: Uint8Array, i: number) => u16(b, i) * 65_536 + u16(b, i + 2);

/** SOFn markers carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but do not. */
const isStartOfFrame = (m: number) =>
  m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/** Pixel size from a JPEG (SOF segment) or PNG (IHDR) header; null for anything else. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG: 8-byte signature, then the IHDR chunk with width and height (big-endian).
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { width: u32(bytes, 16), height: u32(bytes, 20) };
  }
  // JPEG: walk the segments after SOI until a start-of-frame marker.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // markers without a length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan
    if (isStartOfFrame(marker)) return { height: u16(bytes, i + 5), width: u16(bytes, i + 7) };
    i += 2 + u16(bytes, i + 2);
  }
  return null;
}

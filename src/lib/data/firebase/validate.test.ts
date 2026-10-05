// The photo encoder (platform/image.ts) and the photo validator (validate.ts, mirroring
// firestore.rules) must agree: whatever the encoder accepts as within budget is accepted on save.
import { describe, expect, it } from 'vitest';
import { RepoError } from '../repository';
import { dataUrlBytes, FULL_MAX_BYTES, THUMB_MAX_BYTES } from '../../platform/image';
import { assertValidPhoto } from './validate';

const PREFIX = 'data:image/jpeg;base64,';
/** The limits in firestore.rules (photos create: dataUrl / thumbDataUrl lengths). */
const RULES_MAX_CHARS = { full: 300_000, thumb: 20_000 };

/** The longest JPEG data URL the encoder still counts as within `maxBytes`. */
function longestAccepted(maxBytes: number): string {
  // base64 carries 3 bytes per 4 characters; '==' padding makes the last group carry 1 byte.
  for (let groups = Math.ceil(maxBytes / 3) + 1; ; groups--) {
    const url = PREFIX + 'A'.repeat(4 * groups - 2) + '==';
    if (dataUrlBytes(url) <= maxBytes) return url;
  }
}

describe('photo budgets vs the stored limits', () => {
  it('the largest thumbnail and photo the encoder accepts are saved, with margin', () => {
    const thumb = longestAccepted(THUMB_MAX_BYTES);
    const full = longestAccepted(FULL_MAX_BYTES);
    expect(() =>
      assertValidPhoto({ dataUrl: full, thumbDataUrl: thumb, width: 1600, height: 1200 })
    ).not.toThrow();
    // At least 2 % below the rules' limits, so a rounding change cannot tip it over.
    expect(thumb.length).toBeLessThanOrEqual(RULES_MAX_CHARS.thumb * 0.98);
    expect(full.length).toBeLessThanOrEqual(RULES_MAX_CHARS.full * 0.98);
  });

  it('still rejects a thumbnail over the limit (the check itself is unchanged)', () => {
    const tooLong = PREFIX + 'A'.repeat(RULES_MAX_CHARS.thumb - PREFIX.length + 4);
    expect(() =>
      assertValidPhoto({ dataUrl: PREFIX + 'AAAA', thumbDataUrl: tooLong, width: 1, height: 1 })
    ).toThrow(RepoError);
  });
});

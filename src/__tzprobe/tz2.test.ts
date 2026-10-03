// @vitest-environment jsdom
import { it, expect } from 'vitest';
it('tz jsdom', () => { expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC'); });

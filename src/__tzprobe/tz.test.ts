import { it, expect } from 'vitest';
it('tz', () => { expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC'); expect(new Date(0).getTimezoneOffset()).toBe(0); });

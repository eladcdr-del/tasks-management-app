// Vitest setup for the `unit` project (runs in both Node and jsdom test files).
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

afterEach(async () => {
  // Unmount anything rendered by @testing-library/svelte (jsdom files only).
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/svelte');
  cleanup();
});

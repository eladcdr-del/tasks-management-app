// Browser APIs jsdom lacks, for component tests. Import it FIRST in a `@vitest-environment jsdom`
// file (before any component), because svelte/motion builds a MediaQuery when it is imported:
//
//   import '../../test/jsdom';
//
// - matchMedia: never matches (no reduced motion, light theme).
// - Element.animate (Svelte transitions): an animation that never finishes, so an outro stays in
//   flight for as long as the test needs (as on a phone, where a finger lifts mid fade-out).

window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false
  }) as MediaQueryList;

Element.prototype.animate ??= function animate() {
  return {
    onfinish: null,
    currentTime: 0,
    playState: 'running',
    effect: null,
    cancel() {}
  } as unknown as Animation;
};

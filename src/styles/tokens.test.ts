// Design tokens contract (Phase 1 council, design-system round):
//   - the forced dark block ([data-theme='dark']) and the system-dark media block are identical
//   - every dark override has a light counterpart
//   - the contrast pairs documented in tokens.css hold in both themes
//   - UI primitives use tokens only (no raw hex, no light-dark() fallbacks)
import { describe, expect, it } from 'vitest';

// Vitest blanks CSS imports (even `?raw`), so read the file itself. A computed specifier keeps the
// app tsconfig (no Node types) happy; this test only runs under Node.
const NODE_FS = 'node:fs';
const fs = (await import(/* @vite-ignore */ NODE_FS)) as {
  readFileSync(path: URL, encoding: 'utf8'): string;
};
// Comments go first: they may hold braces ("spring({ stiffness … })").
const css = fs
  .readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// Raw sources of every UI primitive (Vite glob; read at build time, no fs access needed).
const primitives = import.meta.glob<string>('../components/ui/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true
});

/** The body of the first `{ … }` block that follows `selector` (balanced braces). */
function blockAfter(source: string, selector: string, from = 0): string {
  const at = source.indexOf(selector, from);
  if (at < 0) throw new Error(`selector not found: ${selector}`);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unbalanced block after ${selector}`);
}

/** `--name: value;` declarations (whitespace collapsed). */
function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1] as string, (m[2] as string).replace(/\s+/g, ' ').trim());
  }
  return out;
}

const light = declarations(blockAfter(css, ':root {'));
const forcedDark = declarations(blockAfter(css, ":root[data-theme='dark']"));
const mediaAt = css.indexOf('@media (prefers-color-scheme: dark)');
const systemDark = declarations(blockAfter(css, ':root:not([data-theme])', mediaAt));

function hex(theme: Map<string, string>, name: string): string {
  const value = theme.get(name);
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a hex colour`);
  return value;
}

function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const darkTheme = new Map([...light, ...forcedDark]);

describe('tokens.css', () => {
  it('keeps the system-dark media block identical to the forced dark block', () => {
    expect(forcedDark.size).toBeGreaterThan(50);
    expect([...systemDark.entries()]).toEqual([...forcedDark.entries()]);
  });

  it('gives every dark override a light counterpart', () => {
    const missing = [...forcedDark.keys()].filter((k) => !light.has(k));
    expect(missing).toEqual([]);
  });

  // [foreground, background, minimum] — the pairs documented at the top of tokens.css.
  const TEXT = 4.5;
  const NON_TEXT = 3;
  const pairs: [string, string, number][] = [
    ['--ink', '--bg', TEXT],
    ['--ink-2', '--bg', TEXT],
    ['--ink-2', '--surface', TEXT],
    ['--ink-2', '--surface-2', TEXT],
    ['--on-danger', '--danger-solid', TEXT],
    ['--select-fg', '--select-bg', TEXT],
    ['--due-fg', '--due-bg', TEXT],
    ['--deadline-fg', '--deadline-bg', TEXT],
    ['--placeholder', '--surface', TEXT],
    ['--placeholder', '--bg', TEXT],
    ['--inverse-ink', '--inverse-surface', TEXT],
    ['--inverse-accent', '--inverse-surface', TEXT],
    ['--warn-ink', '--warn-soft', TEXT],
    ['--info-ink', '--info-soft', TEXT],
    ['--sage-ink', '--success-soft', TEXT],
    ['--danger', '--danger-soft', TEXT],
    ['--danger', '--surface', TEXT],
    ['--accent-ink', '--accent-soft', TEXT],
    ['--accent-ink', '--surface', TEXT],
    ['--ink-on-accent', '--accent-strong', TEXT],
    ['--control-off', '--surface', NON_TEXT],
    ['--control-off', '--bg', NON_TEXT],
    ['--control-thumb', '--control-off', NON_TEXT],
    ['--field-edge', '--surface', NON_TEXT],
    ['--field-edge', '--bg', NON_TEXT],
    ['--progress-fill', '--progress-track', NON_TEXT],
    ['--danger-solid', '--surface', NON_TEXT],
    ['--focus-ring', '--bg', NON_TEXT],
    ['--focus-ring', '--surface', NON_TEXT],
    ['--focus-ring', '--surface-2', NON_TEXT],
    ['--select-ring', '--surface', NON_TEXT],
    ['--inverse-success', '--inverse-surface', NON_TEXT],
    ...(['terracotta', 'sage', 'slate', 'plum', 'ochre', 'teal'] as const).flatMap(
      (c): [string, string, number][] => [
        [`--member-${c}-ink`, `--member-${c}-soft`, TEXT],
        [`--member-${c}-ink`, '--surface', TEXT]
      ]
    )
  ];

  for (const [theme, tokens] of [
    ['light', light],
    ['dark', darkTheme]
  ] as const) {
    it.each(pairs)(`${theme}: %s on %s ≥ %d:1`, (fg, bg, min) => {
      expect(contrast(hex(tokens, fg), hex(tokens, bg))).toBeGreaterThanOrEqual(min);
    });
  }
});

describe('UI primitives use tokens only', () => {
  const files = Object.keys(primitives);

  it('finds the primitives', () => expect(files.length).toBeGreaterThan(25));

  it.each(files)('%s has no raw hex colours or light-dark() fallbacks', (file) => {
    const source = primitives[file] ?? '';
    const style = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(style).not.toMatch(/light-dark\(/);
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(style).not.toMatch(/\brgba?\(/);
  });
});

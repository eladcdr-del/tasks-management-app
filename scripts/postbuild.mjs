// owner: step 6.1 — only that step edits this file
//
// Runs after `vite build` (see the `build` script in package.json):
//  1. <outDir>/404.html — a copy of index.html. GitHub Pages serves it for unknown paths, so a stray
//     deep link still boots the app (routes live in the hash).
//  2. <outDir>/.nojekyll — stops Pages from running Jekyll (which drops files starting with `_`).
//  3. Prints the gzip size of every emitted JS/CSS file (step 7.3's budget check measures the same).
// <outDir> follows BUILD_OUT_DIR exactly like vite.config.ts (default `dist`; E2E builds use
// `dist-e2e`, see playwright.config.ts).

import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const outDir = process.env.BUILD_OUT_DIR || 'dist';
const indexHtml = join(outDir, 'index.html');

if (!existsSync(indexHtml)) {
  console.error(`postbuild: ${indexHtml} not found. Run vite build first.`);
  process.exit(1);
}

copyFileSync(indexHtml, join(outDir, '404.html'));
writeFileSync(join(outDir, '.nojekyll'), '');

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const kb = (/** @type {number} */ bytes) => `${(bytes / 1024).toFixed(1)} kB`;

const rows = walk(outDir)
  .filter((file) => /\.(js|css)$/.test(file))
  .map((file) => {
    const content = readFileSync(file);
    return {
      file: relative(outDir, file).split(sep).join('/'),
      raw: content.length,
      gzip: gzipSync(content, { level: 9 }).length
    };
  })
  .sort((a, b) => b.gzip - a.gzip);

const width = Math.max(4, ...rows.map((r) => r.file.length));
console.log(`\npostbuild (${outDir}): wrote 404.html and .nojekyll`);
console.log(`${'file'.padEnd(width)}  ${'raw'.padStart(10)}  ${'gzip'.padStart(10)}`);
for (const r of rows) {
  console.log(`${r.file.padEnd(width)}  ${kb(r.raw).padStart(10)}  ${kb(r.gzip).padStart(10)}`);
}
for (const ext of ['js', 'css']) {
  const total = rows.filter((r) => r.file.endsWith(`.${ext}`)).reduce((sum, r) => sum + r.gzip, 0);
  console.log(`total ${ext} (gzip): ${kb(total)}`);
}

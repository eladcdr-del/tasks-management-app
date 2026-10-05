// owner: step 5.1. Regenerates every app icon from the AppMark geometry
// (src/components/illustrations/AppMark.svelte: keep HOUSE / RIGHT / colours in sync with it).
//
//   node scripts/generate-icons.mjs
//
// The mark: a folded-paper house in two tones (cream and sand) on a warm terracotta field. The two
// halves are the two people who share the home.
//
// Writes (all committed, served from public/):
//   icons/source.svg            AppMark `tile`: the house on a terracotta rounded tile (r = 116)
//   icons/source-maskable.svg   AppMark `fullBleed`: edge-to-edge terracotta (the OS applies its
//                               own mask); the house stays inside the maskable safe circle (r = 40%)
//   icons/badge.svg             monochrome white house, tight crop (Android status-bar badge)
//   icons/icon-192.png, icon-512.png           manifest "any"       (source.svg)
//   icons/maskable-192.png, maskable-512.png   manifest "maskable"  (source-maskable.svg)
//   icons/apple-touch-180.png                  iOS home screen (full bleed; iOS rounds the corners)
//   icons/badge-96.png                         notification badge (sw.ts)
//   favicon.svg, favicon.ico (16/32/48)
//
// Rendering uses sharp + sharp-ico, which ship with @vite-pwa/assets-generator (a devDependency);
// the generator's own presets are not used because the maskable icon is a different drawing
// (fullBleed), not a padded copy of the tile.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sharpsToIco } from 'sharp-ico';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(`${publicDir}icons`, { recursive: true });

// The house (softened ridge, gently rounded base corners) and its right half, split down the
// ridge. The whole house is filled cream and the right half laid over it in sand, so no seam can
// show between the halves at any size.
const HOUSE =
  'M256 140Q260 140 264 143.5L375 240Q380 244 380 250V370Q380 384 366 384H146' +
  'Q132 384 132 370V250Q132 244 137 240L248 143.5Q252 140 256 140Z';
const RIGHT = 'M256 140Q260 140 264 143.5L375 240Q380 244 380 250V370Q380 384 366 384H256Z';
// The house is drawn ×1.14 around its centre on the 512 canvas (corners stay inside r = 40%).
const HOUSE_TRANSFORM = 'translate(256 262) scale(1.14) translate(-256 -262)';
const CREAM = '#FBF6EF';
const SAND = '#E9CDB2';
const FIELD_TOP = '#E3885D';
const FIELD_BOTTOM = '#CF6A3D';
const GRADIENT =
  '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
  `<stop offset="0" stop-color="${FIELD_TOP}"/><stop offset="1" stop-color="${FIELD_BOTTOM}"/></linearGradient>`;

/** @param {{ fullBleed?: boolean, mono?: boolean }} [opts] */
function markSvg({ fullBleed = false, mono = false } = {}) {
  if (mono) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="120 128 272 272">\n` +
      `<path d="${HOUSE}" fill="#FFFFFF"/>\n` +
      `</svg>\n`
    );
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">\n` +
    `<defs>${GRADIENT}</defs>\n` +
    `<rect width="512" height="512" rx="${fullBleed ? 0 : 116}" fill="url(#g)"/>\n` +
    `<g transform="${HOUSE_TRANSFORM}"><path d="${HOUSE}" fill="${CREAM}"/><path d="${RIGHT}" fill="${SAND}"/></g>\n` +
    `</svg>\n`
  );
}

/** @param {string} path @param {string} content */
const write = (path, content) => writeFileSync(publicDir + path, content);

/**
 * @param {string} svg
 * @param {number} size
 * @param {boolean} [opaque] flatten (iOS draws transparency black)
 */
function render(svg, size, opaque = false) {
  // Rasterise at ≥ 2× the target size, then downscale: crisp edges at every size.
  let img = sharp(Buffer.from(svg), { density: Math.max(72, ((72 * size) / 512) * 2) }).resize(
    size,
    size
  );
  if (opaque) img = img.flatten({ background: FIELD_BOTTOM });
  return img.png({ compressionLevel: 9 });
}

const tile = markSvg();
const maskable = markSvg({ fullBleed: true });
const badge = markSvg({ mono: true });

write('icons/source.svg', tile);
write('icons/source-maskable.svg', maskable);
write('icons/badge.svg', badge);
write('favicon.svg', tile);

await Promise.all([
  render(tile, 192).toFile(`${publicDir}icons/icon-192.png`),
  render(tile, 512).toFile(`${publicDir}icons/icon-512.png`),
  render(maskable, 192).toFile(`${publicDir}icons/maskable-192.png`),
  render(maskable, 512).toFile(`${publicDir}icons/maskable-512.png`),
  render(maskable, 180, true).toFile(`${publicDir}icons/apple-touch-180.png`),
  render(badge, 96).toFile(`${publicDir}icons/badge-96.png`)
]);

const favicons = await Promise.all(
  [16, 32, 48].map(async (size) => sharp(await render(tile, size).toBuffer()))
);
await sharpsToIco(favicons, `${publicDir}favicon.ico`);

console.log('icons written to public/');

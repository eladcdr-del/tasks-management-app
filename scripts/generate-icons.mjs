// owner: step 5.1. Regenerates every app icon from the AppMark geometry
// (src/components/illustrations/AppMark.svelte: keep HOUSE / CHECK / colours in sync with it).
//
//   node scripts/generate-icons.mjs
//
// Writes (all committed, served from public/):
//   icons/source.svg            AppMark `tile`: terracotta house on a cream rounded tile (r = 116)
//   icons/source-maskable.svg   AppMark `fullBleed`: edge-to-edge cream, house ×1.2 (safe zone kept)
//   icons/badge.svg             monochrome white house, tight crop (Android status-bar badge)
//   icons/icon-192.png, icon-512.png           manifest "any"       (source.svg)
//   icons/maskable-192.png, maskable-512.png   manifest "maskable"  (source-maskable.svg)
//   icons/apple-touch-180.png                  iOS home screen (opaque cream corners)
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

const CREAM = '#FBF6EF';
const HOUSE =
  'M221.7 155.6Q256 128 290.3 155.6L368.2 218.4Q390 236 390 264V350Q390 394 346 394H166' +
  'Q122 394 122 350V264Q122 236 143.8 218.4Z';
const CHECK = 'M206 304L242 339L308 271';
const GRADIENT =
  '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#E2875C"/><stop offset="1" stop-color="#D2703F"/></linearGradient>';

/** @param {{ fullBleed?: boolean, mono?: boolean }} [opts] */
function markSvg({ fullBleed = false, mono = false } = {}) {
  const transform = fullBleed
    ? ' transform="translate(256 261) scale(1.2) translate(-256 -261)"'
    : '';
  const viewBox = mono ? '104 116 304 304' : '0 0 512 512';
  const tile = mono
    ? ''
    : `<rect width="512" height="512" rx="${fullBleed ? 0 : 116}" fill="${CREAM}"/>`;
  const fill = mono ? '#FFFFFF' : 'url(#g)';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${viewBox}">\n` +
    `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">` +
    `<g${transform}><path d="${HOUSE}" fill="#fff"/>` +
    `<path d="${CHECK}" fill="none" stroke="#000" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</g></mask>${mono ? '' : GRADIENT}</defs>\n` +
    `${tile}<rect width="512" height="512" fill="${fill}" mask="url(#m)"/>\n` +
    `</svg>\n`
  );
}

/** @param {string} path @param {string} content */
const write = (path, content) => writeFileSync(publicDir + path, content);

/**
 * @param {string} svg
 * @param {number} size
 * @param {boolean} [opaque] flatten onto cream (iOS draws transparency black)
 */
function render(svg, size, opaque = false) {
  // Rasterise at ≥ 2× the target size, then downscale: crisp edges at every size.
  let img = sharp(Buffer.from(svg), { density: Math.max(72, ((72 * size) / 512) * 2) }).resize(
    size,
    size
  );
  if (opaque) img = img.flatten({ background: CREAM });
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
  render(tile, 180, true).toFile(`${publicDir}icons/apple-touch-180.png`),
  render(badge, 96).toFile(`${publicDir}icons/badge-96.png`)
]);

const favicons = await Promise.all(
  [16, 32, 48].map(async (size) => sharp(await render(tile, size).toBuffer()))
);
await sharpsToIco(favicons, `${publicDir}favicon.ico`);

console.log('icons written to public/');
